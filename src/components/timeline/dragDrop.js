// src/components/timeline/dragDrop.js
import { $, esc } from '../../utils/dom.js';
import { fmtD, addDays, diffDays, nowIso } from '../../utils/date.js';
import { db, refreshAll } from '../../core/db.js';
import { setDbBeacon, afterChange } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { getColDefs } from '../table/colDefs.js';
import { matchSearch } from '../table/filters.js';
import { savePrefs } from '../../core/prefs.js';

export function setupTimelineDragDrop(S, ent, mount, reRender, rowMeta, groupBy, ppd, callbacks = {}, wsT = 0) {
  const body = mount.querySelector('#tlBody');
  if (!body) return;
  let drag = null;

  body.addEventListener('pointerdown', e => {
    const bar = e.target.closest('.bar');
    if (!bar) return;
    if (e.button && e.button !== 0) return; // Only LMB drags
    e.preventDefault();

    const canvas = bar.closest('.tl-canvas');
    const gi = canvas ? +canvas.dataset.gi : 0;
    const origTop = parseFloat(bar.style.top) || 6;
    const origLane = Math.max(0, Math.round((origTop - 6) / 26));

    drag = {
      bar,
      id: +bar.dataset.id,
      s: bar.dataset.s,
      en: bar.dataset.e,
      x0: e.clientX,
      y0: e.clientY,
      h: e.target.dataset.h || null,
      origLeft: parseFloat(bar.style.left) || 0,
      origW: parseFloat(bar.style.width) || 8,
      origTop,
      origLane,
      moved: false,
      dx: 0,
      dy: 0,
      gi,
      tgt: gi,
      targetLane: origLane
    };
    bar.setPointerCapture(e.pointerId);
  });

  body.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    drag.bar.classList.add('dragging');
    drag.dx = dx;
    drag.dy = dy;

    const dd = Math.round(dx / ppd);
    let ns = drag.s, ne = drag.en;

    if (drag.h === 'r') {
      // Resizing right handle: expand/shrink right
      const newW = Math.max(12, drag.origW + dx);
      drag.bar.style.transform = 'none';
      drag.bar.style.width = newW + 'px';
      ne = addDays(drag.en, Math.max(dd, 1 - diffDays(drag.s, drag.en)));
    } else if (drag.h === 'l') {
      // Resizing left handle: expand/shrink left
      const newLeft = Math.min(drag.origLeft + drag.origW - 12, drag.origLeft + dx);
      const newW = Math.max(12, drag.origW - dx);
      drag.bar.style.transform = 'none';
      drag.bar.style.left = newLeft + 'px';
      drag.bar.style.width = newW + 'px';
      ns = addDays(drag.s, Math.min(dd, diffDays(drag.s, drag.en) - 1));
    } else {
      // Dragging entire bar in 2D
      drag.bar.style.transform = `translate(${dx}px, ${dy}px)`;
      ns = addDays(drag.s, dd);
      ne = addDays(drag.en, dd);
    }

    drag.ns = ns;
    drag.ne = ne;

    const rows = [...body.querySelectorAll('.tl-row')];
    let tgt = drag.gi;
    if (!drag.h) {
      rows.forEach((r, i) => {
        const rc = r.getBoundingClientRect();
        if (e.clientY >= rc.top && e.clientY < rc.bottom) tgt = i;
      });
    }
    drag.tgt = tgt;

    rows.forEach((r, i) => {
      const canvas = r.querySelector('.tl-canvas');
      if (canvas) canvas.style.outline = i === tgt && i !== drag.gi ? '2px dashed var(--acc)' : '';
    });

    const targetRowEl = rows[tgt];
    const targetCanvas = targetRowEl?.querySelector('.tl-canvas');
    let targetLane = 0;

    if (targetCanvas) {
      const canvasRect = targetCanvas.getBoundingClientRect();
      const relativeY = e.clientY - canvasRect.top;
      targetLane = Math.max(0, Math.floor((relativeY - 2) / 26));
    }
    drag.targetLane = targetLane;

    // Ghost element preview
    let ghost = document.getElementById('tlGhost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'tlGhost';
      ghost.className = 'bar-ghost';
    }

    if (targetCanvas) {
      if (ghost.parentElement !== targetCanvas) {
        targetCanvas.appendChild(ghost);
      }
      const ghostX = Math.max(0, Math.round((new Date(ns + 'T00:00:00').getTime() - wsT) / 864e5 * ppd));
      const ghostW = Math.max(8, Math.round(diffDays(ns, ne) * ppd) - 2);
      ghost.style.left = ghostX + 'px';
      ghost.style.width = ghostW + 'px';
      ghost.style.top = (6 + targetLane * 26) + 'px';
      ghost.textContent = `${fmtD(ns)} → ${fmtD(ne)} (${diffDays(ns, ne)} дн.) · Строка ${targetLane + 1}`;
    }

    const tip = $('#tlTip');
    if (tip) {
      tip.classList.remove('hidden');
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 18) + 'px';
      const gtxt = (tgt !== drag.gi && ['dev', 'agent', 'priority', 'stage', 'status'].includes(groupBy) && rowMeta[tgt]) ? ` → ${esc(rowMeta[tgt].g.name)}` : '';
      tip.textContent = `${fmtD(ns)} → ${fmtD(ne)} (${diffDays(ns, ne)} дн.)${gtxt} · Строка ${targetLane + 1}`;
    }
  });

  const endDrag = async e => {
    if (!drag) return;
    const d = drag;
    drag = null;

    const ghost = document.getElementById('tlGhost');
    if (ghost && ghost.parentElement) {
      ghost.parentElement.removeChild(ghost);
    }

    const tip = $('#tlTip');
    if (tip) tip.classList.add('hidden');
    body.querySelectorAll('.tl-canvas').forEach(c => c.style.outline = '');

    if (!d.moved) {
      if (callbacks.onView) callbacks.onView(ent, d.id);
      return;
    }

    d.bar.classList.remove('dragging');
    d.bar.style.transform = '';
    d.bar.style.left = '';
    d.bar.style.width = '';

    const r = S[ent].find(x => x.id === d.id);
    if (!r) return;

    r.start = d.ns || r.start;
    r.end = d.ne || r.end;
    r.updatedAt = nowIso();

    const tgtG = rowMeta[d.tgt]?.g;
    const srcG = rowMeta[d.gi]?.g;

    if (d.tgt !== undefined && d.tgt !== d.gi && tgtG) {
      if (groupBy === 'dev') r.devId = tgtG.id;
      else if (groupBy === 'agent') r.agentId = tgtG.id;
      else if (groupBy === 'priority') r.priorityId = tgtG.id;
      else if (groupBy === 'stage') r.stageId = tgtG.id;
      else r.statusId = tgtG.id;
    }

    // Update item vertical ordering inside S.prefs.tlItemOrder
    if (tgtG) {
      const tgtGidStr = String(tgtG.id ?? '__null');
      const tgtItemOrderKey = `${ent}_${groupBy}_${tgtGidStr}`;
      S.prefs.tlItemOrder = S.prefs.tlItemOrder || {};

      const coldefs = getColDefs(S);
      const rawTargetItems = S[ent].filter(it => tgtG.match(it) && matchSearch(S, coldefs, ent, it));

      let currentOrder = S.prefs.tlItemOrder[tgtItemOrderKey] ? [...S.prefs.tlItemOrder[tgtItemOrderKey]] : [];
      currentOrder = currentOrder.filter(itemId => itemId !== r.id && rawTargetItems.some(it => it.id === itemId));

      rawTargetItems.forEach(it => {
        if (it.id !== r.id && !currentOrder.includes(it.id)) {
          currentOrder.push(it.id);
        }
      });

      const insertIdx = Math.max(0, Math.min(currentOrder.length, d.targetLane));
      currentOrder.splice(insertIdx, 0, r.id);

      S.prefs.tlItemOrder[tgtItemOrderKey] = currentOrder;

      if (d.gi !== d.tgt && srcG) {
        const srcGidStr = String(srcG.id ?? '__null');
        const srcItemOrderKey = `${ent}_${groupBy}_${srcGidStr}`;
        if (S.prefs.tlItemOrder[srcItemOrderKey]) {
          S.prefs.tlItemOrder[srcItemOrderKey] = S.prefs.tlItemOrder[srcItemOrderKey].filter(itemId => itemId !== r.id);
        }
      }

      await savePrefs(S);
    }

    try {
      await db[ent].put(r);
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      toast(`«${r.name}»: ${fmtD(r.start)} → ${fmtD(r.end)}`, 'ok');
    } catch (err) {
      setDbBeacon('error', '🔴 Ошибка базы данных');
      toast('Ошибка записи', 'err');
    }
    reRender();
  };

  body.addEventListener('pointerup', endDrag);
  body.addEventListener('pointercancel', endDrag);
}


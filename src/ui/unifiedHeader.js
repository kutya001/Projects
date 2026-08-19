// src/ui/unifiedHeader.js
import { esc } from '../utils/dom.js';
import { VIEW_ICONS } from './viewIcons.js';

export function renderUnifiedHeader(S, {
  title,
  count = null,
  actions = '',
  views = null, // e.g. { ent: 'projects', current: 'tbl' }
  customRight = ''
}) {
  const viewsHtml = views ? `
    <div class="seg" id="${views.ent}ViewSeg">
      <button data-v="tbl" class="${views.current === 'tbl' ? 'on' : ''}">${VIEW_ICONS.tbl} Таблица</button>
      <button data-v="kb" class="${views.current === 'kb' ? 'on' : ''}">${VIEW_ICONS.kb} Канбан</button>
      <button data-v="tl" class="${views.current === 'tl' ? 'on' : ''}">${VIEW_ICONS.tl} Гант</button>
    </div>
  ` : '';

  const countBadge = count !== null ? `<span class="chip mono count-badge" style="font-weight:700;font-size:12px;background:#EBF8FA;color:var(--acc);padding:2px 8px;border-radius:12px">${count}</span>` : '';

  return `
    <header class="unified-topbar">
      <div class="ut-left">
        <button class="mobile-menu-btn" id="btnMobileMenu" title="Меню" aria-label="Меню">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        <h1 class="ut-title">${esc(title)}</h1>
        ${countBadge}
        <div class="search ut-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" id="topSearch" placeholder="Поиск…" value="${esc(S.search || '')}" autocomplete="off">
          ${S.search ? '<button type="button" class="ut-search-clear" id="btnTopSearchClear" title="Очистить поиск">✕</button>' : ''}
        </div>
      </div>
      <div class="ut-spacer"></div>
      <div class="ut-right">
        ${actions}
        ${viewsHtml}
        ${customRight}
        <div class="beacon ok" id="dbBeacon" style="margin-left:2px"><span class="dot"></span><span class="txt">SQLite</span></div>
      </div>
    </header>
  `;
}

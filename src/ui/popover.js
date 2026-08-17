// src/ui/popover.js
let curPop = null;

export function popover(anchor, html, onMount) {
  closePop();
  const p = document.createElement('div');
  p.className = 'pop';
  p.innerHTML = html;
  document.body.appendChild(p);

  const r = anchor.getBoundingClientRect();
  let x = Math.min(r.left, window.innerWidth - p.offsetWidth - 14);
  let y = r.bottom + 6;
  if (y + p.offsetHeight > window.innerHeight - 10) {
    y = r.top - p.offsetHeight - 6;
  }
  p.style.left = Math.max(8, x) + 'px';
  p.style.top = Math.max(8, y) + 'px';
  curPop = p;

  setTimeout(() => document.addEventListener('mousedown', popAway), 0);
  if (onMount) onMount(p);
}

export function popAway(e) {
  if (curPop && !curPop.contains(e.target)) closePop();
}

export function closePop() {
  if (curPop) {
    curPop.remove();
    curPop = null;
  }
  document.removeEventListener('mousedown', popAway);
}

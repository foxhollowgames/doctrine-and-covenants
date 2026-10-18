import { initMenu, readPreferences, savePreferences } from './settings-menu.js?v=20261018.1';
// The home page lists every section. The menu sets how each section opens.
const BOOK = 'doctrine-and-covenants';
const menu = document.querySelector('#settingsMenu'), preferences = { studyMode: 'read', perspective: 'historical', ...readPreferences() };
function showPreferences() {
  for (const button of menu.querySelectorAll('[data-study-mode],[data-perspective]')) {
    const active = button.dataset.studyMode === preferences.studyMode || button.dataset.perspective === preferences.perspective;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }
}
initMenu(menu);
menu.addEventListener('click', event => {
  const mode = event.target.closest('[data-study-mode]'), perspective = event.target.closest('[data-perspective]');
  if (mode) preferences.studyMode = mode.dataset.studyMode;
  if (perspective) preferences.perspective = perspective.dataset.perspective;
  if (mode || perspective) { savePreferences(preferences); showPreferences(); }
});
showPreferences();
addEventListener('pageshow', () => { Object.assign(preferences, readPreferences()); showPreferences(); });

const groups = document.querySelector('#bookGroups'), status = document.querySelector('#directoryStatus');
const filter = document.querySelector('#sectionFilter'), dialog = document.querySelector('#declarationDialog');
let order = (() => { try { return localStorage.getItem('dc-wayfinder-order') || 'number'; } catch { return 'number'; } })();
const ERAS = [
  ['New York and Pennsylvania', '1823–1830', '1823-01', '1830-12'],
  ['Kirtland, Hiram, and Missouri', '1831–1837', '1831-01', '1837-12'],
  ['Far West and Liberty Jail', '1838–1839', '1838-01', '1839-04'],
  ['Nauvoo', '1839–1846', '1839-05', '1846-12'],
  ['Winter Quarters and later', '1847–1978', '1847-01', '2000-12']
];
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
function card(item) {
  const link = el(item.od ? 'button' : 'a', 'book-card section-card');
  if (item.od) { link.type = 'button'; link.addEventListener('click', () => openDeclaration(item)); }
  else link.href = `${BOOK}.html#chapter=${item.n}&verse=1`;
  link.append(el('span', 'section-number', item.od ? `OD ${item.od.slice(2)}` : String(item.n)));
  link.append(el('h3', '', item.title));
  link.append(el('p', 'section-meta', `${item.place} · ${item.date}`));
  return link;
}
function openDeclaration(item) {
  const box = document.querySelector('#declarationContent'); box.replaceChildren();
  box.append(el('p', 'eyebrow', `OFFICIAL DECLARATION ${item.od.slice(2)} · ${item.date.toUpperCase()}`), el('h2', '', item.title));
  const lds = preferences.perspective === 'lds';
  for (const [label, text] of [['Setting', item.setting], ['What it says', item.summary], ...(lds ? [['LDS lens', item.lds]] : [])]) {
    if (!text) continue; box.append(el('h3', '', label), el('p', '', text));
  }
  const a = el('a', 'source-link', 'Read the declaration on the Church’s site ↗'); a.href = item.url; a.target = '_blank'; a.rel = 'noopener'; box.append(a);
  const t = el('a', 'source-link', 'See on timeline'); t.href = `../timeline/#event=${item.od}`; box.append(t);
  box.append(el('p', 'muted', 'The declaration text is not stored in this guide. Official Declaration 2 is under copyright.'));
  dialog.showModal();
}
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
let items = [];
function render() {
  const q = filter.value.trim().toLowerCase();
  const shown = items.filter(i => !q || String(i.n ?? '') === q || (i.od && ('od' + i.od.slice(2)).includes(q.replace(/\s/g, ''))) || `${i.title} ${i.place} ${i.date}`.toLowerCase().includes(q));
  groups.replaceChildren();
  const sets = order === 'number'
    ? [[1, 30], [31, 60], [61, 90], [91, 120], [121, 138]].map(([a, b]) => [`Sections ${a}–${b}`, '', shown.filter(i => i.n >= a && i.n <= b)])
        .concat([['Official Declarations', '1890 and 1978', shown.filter(i => i.od)]])
    : ERAS.map(([name, span, from, to]) => [name, span, shown.filter(i => i.month >= from && i.month <= to).sort((a, b) => a.month.localeCompare(b.month) || (a.n ?? 999) - (b.n ?? 999))]);
  for (const [title, span, rows] of sets) {
    if (!rows.length) continue;
    const section = el('section'), heading = el('h2', '', title), grid = el('div', 'book-grid section-grid');
    if (span) heading.append(el('small', '', ` · ${span}`));
    section.append(heading, grid); rows.forEach(r => grid.append(card(r))); groups.append(section);
  }
  status.hidden = !!groups.children.length; status.textContent = groups.children.length ? '' : 'No section matches that search.';
  document.querySelectorAll('[data-order]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.order === order)));
}
document.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => { order = b.dataset.order; try { localStorage.setItem('dc-wayfinder-order', order); } catch {} render(); }));
filter.addEventListener('input', render);
try {
  const response = await fetch('data/sections.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('sections');
  items = await response.json(); render();
} catch { status.hidden = false; status.textContent = 'The section list could not load. Reload this page.'; }

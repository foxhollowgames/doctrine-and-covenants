// Shared Wayfinder viewer file. Edit Wayfinder/viewer/app.js, then run npm run sync-viewer. Hash d66f47cec683.
import { initChapterPicker } from './chapter-picker.js?v=20261018.1';
import { people, featurePortraits, wordPortraits, personProfileHtml, personIdForLabel, setPeople, setPortraitMode, webpCopy, webpSourceHtml } from './portraits.js?v=20261018.1';
import { initMenu, readPreferences, savePreferences } from './settings-menu.js?v=20261018.1';
import { initModalDragging } from './modal-drag.js?v=20261018.1';
import { chapterFocus, chapterRoutes, chapterPoints, movementStyle } from './chapter-map.js?v=20261018.1';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const releaseVersion = '20261018.1';
// One reader serves every book. native-book.js names the book. The book's content file supplies its settings.
const book = { id: '', name: '', bibleCode: '', chapterCount: 0, chapterDigits: 2, ...globalThis.studyBook };
const storageKey = `${book.id}-native-study-state`;
const dataFile = part => `data/books/${book.id}-${part}.json`;
let chapters = [];
// Chapters or sections with a path, story area, or place of loss on the map. The scrubber and the event buttons step through these.
let mapEvents = [];
// A dated map snaps to these dates: each map event's date, the start of each drawn path, and the book's dated milestones.
let mapEventDates = [];
// A book with dated events has a date timeline. Other books use chapter order.
const defaults = { chapter: 1, verse: 1, studyMode: 'read', view: 'map', perspective: 'historical', portraitMode: 'generated', date: 1, layers: { places: true, regions: true, campaigns: true, roads: false, history: false }, sidebar: 'scripture', map: { center: [32.1, 35.0], zoom: 7 } };
// Menu choices apply to every book. The rest of the state belongs to this book.
let state = { ...defaults, ...readSaved(), ...readPreferences(), layers: { ...defaults.layers, ...(readSaved().layers || {}) } };
// The timeline lists the chapters it has an event for. Those chapters get a "See on timeline" link under the heading.
// Event ids are book-chapter, and D&C sections are dc-N. When the list does not load, as on a local server, no link shows.
let timelineIds = null;
const timelineEventId = () => book.id === 'doctrine-and-covenants' ? `dc-${state.chapter}` : `${book.id}-${state.chapter}`;
fetch('../timeline/data/chapters.json').then(r => r.ok ? r.json() : null).then(list => {
  if (!Array.isArray(list?.events)) return;
  timelineIds = new Set(list.events);
  const block = document.querySelector('.chapter-picker-block');
  if (block && !block.querySelector('.chapter-timeline-link')) block.insertAdjacentHTML('beforeend', timelineLinkHtml());
}).catch(() => {});
let data = { sources: [], passages: [], events: [], places: [], campaigns: [], ancientRoads: [], regions: [], words: [], guides: [], periods: [] };
let scripture = { translation: 'World English Bible', chapters: {} };
let map, savedScroll = 0, selectedWordButton, toastTimer, guideState = null, sidebarPersonHistory = [], entityLinkCache = {chapter:null, terms:[]};

function bookNamePattern() { return book.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// A book names its unit (chapter or section), its scripture links, and its date format in data.
const unit = () => book.unitLabel || 'chapter';
const Unit = () => unit()[0].toUpperCase() + unit().slice(1);
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDate(value) {
  const v = Number(value);
  if (book.timeline?.unit === 'month') return `${monthNames[((v % 12) + 12) % 12]} ${Math.floor(v / 12)}`;
  return v < 0 ? `${Math.abs(v)} BCE` : `${v} CE`;
}
function scriptureCredit() { return `${scripture.translation || 'World English Bible'} · ${scripture.copyright || 'Public domain'}`; }
function publisherChapter(chapter, verse) {
  if (book.scriptureUrl) return book.scriptureUrl.replace('{chapter}', chapter).replace(/\{verse\}/g, verse ?? '').replace(/[&?]id=p#p$|#p$/, '');
  return `https://ebible.org/engwebp/${book.bibleCode}${String(chapter).padStart(book.chapterDigits, '0')}.htm${verse ? `#V${verse}` : ''}`;
}
function readSaved() { try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; } }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ ...state, map: map ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() } : state.map })); } catch {} savePreferences(state); updateUrl(); }
function updateUrl() { const p = new URLSearchParams({ chapter: state.chapter, verse: state.verse, view: state.view, study: state.studyMode, mode: state.perspective }); history.replaceState(null, '', `#${p}`); }
function parseUrl() { const p = new URLSearchParams(location.hash.slice(1)); if (['read','map'].includes(p.get('study'))) state.studyMode = p.get('study'); for (const key of ['chapter', 'verse']) if (p.has(key) && Number(p.get(key))) state[key] = Number(p.get(key)); if (p.get('chapter') === 'last') state.chapter = 'last'; if (['historical','lds'].includes(p.get('mode'))) state.perspective = p.get('mode'); }
function esc(s='') { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function richText(s='') { return esc(s).replace(/\n/g, '<br>'); }
function showToast(message) { const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 4200); }
function source(id) { return data.sources.find(s => s.id === id); }
function sourcesHtml(ids = [], numbered = false) {
  ids = [...new Set(ids)].filter(id => source(id));
  if (!ids.length) return '<p class="muted">This entry has no source link.</p>';
  const tag = numbered ? 'ol' : 'ul';
  return `<${tag} class="study-source-links">${ids.map(id => {
    const s = source(id);
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a></li>`;
  }).join('')}</${tag}>`;
}

function passageFootnotes(p) {
  const ids = p?.chapter ? chapterSourceIds(p.chapter) : [...new Set([...(p?.sourceIds || []), ...(state.perspective === 'lds' ? p?.lds?.sourceIds || [] : [])])].filter(id => source(id) && !/^web(?:\d+)?$/.test(id));
  return (references = []) => [...new Set(references)].map(id => {
    const s = source(id), number = ids.indexOf(id) + 1;
    return s && number ? `<sup class="source-footnote"><a href="${esc(s.url)}" data-source-id="${esc(id)}" aria-haspopup="dialog" aria-label="Source ${number}: ${esc(s.title)}">${number}<span class="footnote-label" hidden>${esc(s.title)} · Open source details (${esc(s.type)})</span></a></sup>` : '';
  }).join('');
}

// Render outside scrolling panels so citations remain readable at panel edges.
const sourceTooltip = document.createElement('div');
sourceTooltip.id = 'sourceTooltip';
sourceTooltip.className = 'source-tooltip';
sourceTooltip.role = 'tooltip';
sourceTooltip.hidden = true;
document.body.append(sourceTooltip);
let tooltipAnchor, tooltipCloseTimer;
function hideSourceTooltip() {
  clearTimeout(tooltipCloseTimer);
  tooltipAnchor?.removeAttribute('aria-describedby');
  tooltipAnchor = null;
  sourceTooltip.hidden = true;
}
function showSourceTooltip(anchor) {
  hideSourceTooltip();
  tooltipAnchor = anchor;
  sourceTooltip.textContent = $('.footnote-label', anchor).textContent;
  anchor.setAttribute('aria-describedby', sourceTooltip.id);
  sourceTooltip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = sourceTooltip.offsetWidth, height = sourceTooltip.offsetHeight;
  sourceTooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
  sourceTooltip.style.top = `${Math.max(8, rect.top >= height + 12 ? rect.top - height - 6 : Math.min(rect.bottom + 6, innerHeight - height - 8))}px`;
}
document.addEventListener('pointerover', event => {
  const anchor = event.target.closest('.source-footnote a');
  if (anchor) showSourceTooltip(anchor);
  if (sourceTooltip.contains(event.target)) clearTimeout(tooltipCloseTimer);
});
document.addEventListener('pointerout', event => {
  if (event.target.closest('.source-footnote a, .source-tooltip')) tooltipCloseTimer = setTimeout(hideSourceTooltip, 150);
});
document.addEventListener('focusin', event => {
  const anchor = event.target.closest('.source-footnote a');
  if (anchor) showSourceTooltip(anchor); else hideSourceTooltip();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideSourceTooltip(); });
document.addEventListener('scroll', hideSourceTooltip, true);
window.addEventListener('resize', hideSourceTooltip);
function eligibleWords(verse) { return data.words.filter(w => (w.chapter == null || Number(w.chapter) === state.chapter) && (!w.verses?.length || w.verses.includes(verse.verse))); }
function matchWord(token, candidates) { const plain = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); return candidates.find(w => (w.matches || [w.label]).some(m => m.toLowerCase() === plain.toLowerCase())) || null; }
function entityLinkTerms(verse = null) {
  if (entityLinkCache.chapter === state.chapter && entityLinkCache.verse === verse && entityLinkCache.terms.length) return entityLinkCache.terms;
  const terms = new Map();
  const add = (label, type, id, name = label) => {
    const clean = String(label || '').trim();
    if (clean.length < 3 || terms.has(clean.toLowerCase())) return;
    terms.set(clean.toLowerCase(), {label:clean, type, id, name});
  };
  for (const [id, person] of Object.entries(people)) {
    if (person.chapterIds && !person.chapterIds.includes(state.chapter)) continue;
    const scope = person.verseScope?.[state.chapter];
    if (verse != null && scope && !scope.includes(verse)) continue;
    const aliases = verse == null && scope ? [] : (person.linkNames || []);
    // A short name can belong to more than one person. linkScope lists the units where it names this person.
    for (const label of [person.name, ...aliases]) if (!person.linkScope?.[label] || person.linkScope[label].includes(state.chapter)) add(label, 'person', id, person.name);
  }
  for (const feature of [...data.places, ...data.regions, ...data.campaigns, ...data.events, ...data.ancientRoads]) {
    const scope = feature.verseScope?.[state.chapter];
    if (verse != null && scope && !scope.includes(verse)) continue;
    const name = mapDisplayName(feature.name || feature.title || '');
    add(name, 'feature', feature.id, name);
  }
  // A glossary entry for one chapter links only its checked verse. Other text uses the chapter entry or the plain entry.
  const checked = word => word.scope === 'glossary' && word.chapter != null;
  const words = data.words.filter(word => word.chapter == null ? word.scope === 'glossary' : Number(word.chapter) === state.chapter && (!checked(word) || (verse == null ? word.chapterDefault : word.verses.includes(verse))));
  for (const word of words) for (const label of checked(word) || word.caseSensitive ? word.matches : [word.label, ...(word.matches || [])]) add(label, 'word', word.id, word.label);
  // Case-sensitive terms link only their exact forms, such as a title written in capitals.
  for (const word of words.filter(item => item.caseSensitive)) for (const label of word.matches) { const term = terms.get(label.toLowerCase()); if (term?.id === word.id) term.forms = word.matches; }
  entityLinkCache = {chapter:state.chapter, verse, terms:[...terms.values()].sort((a, b) => b.label.length - a.label.length)};
  return entityLinkCache.terms;
}
function linkedEntityHtml(text = '', options = {}) {
  const excluded = new Set();
  const person = people[options.excludePersonId];
  if (person) for (const label of [person.name, ...(person.linkNames || [])]) excluded.add(label.toLowerCase());
  const terms = entityLinkTerms(options.verse ?? null).filter(term => !excluded.has(term.label.toLowerCase()) && !(term.type === options.excludeType && term.id === options.excludeId));
  if (!terms.length) return esc(text);
  const byLabel = new Map(terms.map(term => [term.label.toLowerCase(), term]));
  const pattern = new RegExp(terms.map(term => term.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu');
  let html = '', cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    const start = match.index, end = start + match[0].length;
    if (/(?:Tubal|Uzzen|Obed)[ -]$/i.test(text.slice(0,start))) continue;
    if (/\p{L}|\p{N}/u.test(text[start - 1] || '') || /\p{L}|\p{N}/u.test(text[end] || '')) continue;
    const term = byLabel.get(match[0].toLowerCase());
    if (!term || (term.forms && !term.forms.includes(match[0]))) continue;
    html += esc(text.slice(cursor, start));
    html += term.type === 'person'
      ? `<button type="button" class="entity-inline-link" data-person-id="${esc(term.id)}" aria-label="Open profile for ${esc(term.name)}">${esc(match[0])}</button>`
      : `<button type="button" class="entity-inline-link" data-detail-type="${term.type}" data-detail-id="${esc(term.id)}" aria-label="Open details for ${esc(term.name)}">${esc(match[0])}</button>`;
    cursor = end;
  }
  return html + esc(text.slice(cursor));
}
function linkedPersonProfileHtml(id, options = {}) {
  return personProfileHtml(id, {...options, linkHtml:text => linkedEntityHtml(text, {excludePersonId:id})}) + (people[id]?.word ? wordLanguagesHtml(people[id].word) : '');
}

async function load() {
  parseUrl();
  const results = await Promise.allSettled(['native-content', 'native-scripture', 'people', 'art'].map(dataFile).map(p => fetch(`${p}?v=${releaseVersion}`).then(r => { if (!r.ok) throw Error(`${p} (${r.status})`); return r.json(); })));
  if (results[0].status === 'fulfilled') data = { ...data, ...results[0].value };
  if (results[1].status === 'fulfilled') scripture = results[1].value;
  Object.assign(book, data.book);
  chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
  mapEvents = chapters.filter(isEventChapter);
  if (book.timeline) mapEventDates = [...new Set([...mapEvents.map(c => data.passages.find(p => Number(p.chapter) === c)?.year), ...data.campaigns.map(c => c.start), ...milestones().map(e => e.year)].map(Number))]
    .filter(d => Number.isFinite(d) && d >= book.timeline.start && d <= book.timeline.end).sort((a, b) => a - b);
  if (book.timeline) {
    defaults.date = book.timeline.default;
    if (!(state.date >= book.timeline.start && state.date <= book.timeline.end)) state.date = defaults.date;
  }
  setPeople(results[2].status === 'fulfilled' ? results[2].value : {}, results[3].status === 'fulfilled' ? results[3].value : {});
  if (state.chapter === 'last') state.chapter = chapters.length;
  if (!chapters.includes(state.chapter)) state.chapter = 1;
  if (!scripture.chapters[state.chapter]?.some(v => v.verse === state.verse)) state.verse = 1;
  state.view = 'map';
  if (!['historical','lds'].includes(state.perspective)) state.perspective = 'historical';
  if (!['generated', 'non-generated'].includes(state.portraitMode)) state.portraitMode = 'generated';
  setPortraitMode(state.portraitMode);
  if (!['read', 'map'].includes(state.studyMode)) state.studyMode = 'read';
  if (state.studyMode === 'read' || !Number.isFinite(state.date)) state.date = activePassage()?.year ?? defaults.date;
  state.sidebar = 'scripture';
  buildStaticUi(); initMap(); renderAll();
  if (results.some(r => r.status === 'rejected')) showToast('Some study notes did not load. Reload the page and try again.');
}

function ensureLayerOptions() {
  const existing = $('#layerOptions');
  if (existing) return existing;
  const toggle = $('#layerToggle'), panel = toggle?.closest('.layers');
  if (!toggle || !panel) return null;
  const options = document.createElement('div');
  options.id = 'layerOptions';
  toggle.insertAdjacentElement('afterend', options);
  return options;
}
function buildStaticUi() {
  initSettings();
  initModalDragging();
  $('#scriptureAttribution').textContent = scriptureCredit();
  initScriptureResize();
  initTimelineTooltip();
  const layerOptions = ensureLayerOptions();
  if (!layerOptions) throw new Error('Map layer controls are unavailable.');
  // The Places icon shows the same dots the map draws: large for this chapter, small for other places.
  const placeIcon = `<span class="layer-swatch place-dots">${placeDotSvg({ relevant: true })}${placeDotSvg({ mentioned: false })}</span>`;
  layerOptions.innerHTML = [['places','Places','place-dots'],['regions','Areas','region'],['campaigns','Paths','route'],['roads','Ancient roads','road'],['history','Nations','region']].filter(([key]) => ({places:data.places.length, regions:data.narrativeRegions?.length, campaigns:data.textRoutes?.length || data.campaigns.length, roads:data.ancientRoads.length, history:data.regions.length})[key]).map(([key,label,kind]) => `<label class="layer-option"><input type="checkbox" data-layer="${key}">${kind === 'place-dots' ? placeIcon : `<span class="layer-swatch ${kind}"></span>`}<span>${label}</span></label>`).join('');
  $('#periods').innerHTML = data.periods.slice(0,3).map(p => `<button data-period="${esc(p.id)}">${esc(p.label)}<small>${esc(p.description || '')}</small></button>`).join('');
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  if (book.relief === false) $('.map-coverage-key')?.remove();
  $('.map-labels').insertAdjacentHTML('afterbegin', (book.mapLabels || []).map(label => `<span class="map-label ${esc(label.className)}">${esc(label.label)}</span>`).join(''));
  const range = $('#timelineRange');
  if (book.timeline) {
    // Each step is a map event date. A timeline without map events keeps every month.
    if (mapEventDates.length) { range.min = 0; range.max = mapEventDates.length - 1; range.setAttribute('aria-label', 'Map event date'); }
    else { range.min = book.timeline.start; range.max = book.timeline.end; }
    range.addEventListener('input', e => { state.date = scrubDate(e.target.value); renderTimeline(); drawOverlays(); focusMapEventDate(); persist(); });
    range.addEventListener('change', () => { if (!isPassageDate()) showToast('The map now shows your date. Select Return to passage to go back.'); });
  } else {
    // Each step is a map event, not a year. A book without map events steps through every ${unit()}.
    range.min = 0; range.max = scrubChapters().length - 1; range.setAttribute('aria-label', mapEvents.length ? 'Map event in narrative order' : `${Unit()} in narrative order`);
    range.addEventListener('input', e => { const chapter = scrubChapters()[Number(e.target.value)]; if (chapter && chapter !== state.chapter) selectChapter(chapter); focusChapterMap(); });
  }
  $('#libraryDialog .dialog-close').addEventListener('click', () => hideModalPanel($('#libraryDialog')));
  $('#sourceDialog .dialog-close').addEventListener('click', () => hideModalPanel($('#sourceDialog')));
  for (const dialog of $$('dialog')) dialog.addEventListener('cancel', event => {
    event.preventDefault();
    hideModalPanel(dialog);
  });
  if (matchMedia('(max-width:720px)').matches) {
    layerOptions.classList.add('hidden');
    $('#layerToggle').setAttribute('aria-expanded', 'false');
  }
}
function initSettings() {
  const panel = $('#settingsPanel'), close = initMenu($('#settingsMenu'));
  panel.addEventListener('click', event => { if (event.target.closest('[data-study-mode]')) close(true); });
  $('#nonGeneratedPortraits')?.addEventListener('change', event => {
    state.portraitMode = event.target.checked ? 'non-generated' : 'generated';
    setPortraitMode(state.portraitMode);
    renderTop();
    persist();
  });
}
function initScriptureResize() {
  const divider = $('#scriptureResize'), panel = $('#scriptureSidebar'), view = $('#mapView');
  const wide = matchMedia('(min-width:1025px)');
  let drag = null, frame = 0;
  const minimum = () => wide.matches ? 280 : 220;
  const maximum = () => wide.matches ? Math.max(280, view.clientWidth - 288) : Math.max(220, view.clientHeight - 180);
  function update(size) {
    if (!view.clientWidth || !view.clientHeight) return;
    const value = Math.round(Math.max(minimum(), Math.min(maximum(), size)));
    panel.style.setProperty(wide.matches ? '--scripture-width' : '--scripture-height', `${value}px`);
    divider.setAttribute('aria-valuemax', String(maximum()));
    divider.setAttribute('aria-valuemin', String(minimum()));
    divider.setAttribute('aria-valuenow', String(value));
    divider.setAttribute('aria-valuetext', `${value} pixels`);
    return value;
  }
  function syncMode() {
    const isWide = wide.matches;
    divider.setAttribute('aria-orientation', isWide ? 'vertical' : 'horizontal');
    divider.title = isWide
      ? 'Drag left or right to resize the scripture panel. You can also use the Left and Right arrow keys.'
      : 'Drag up to enlarge the scripture panel. You can also use the Up and Down arrow keys.';
    update(isWide
      ? Number(state.scriptureWidth) || (innerWidth <= 1100 ? 365 : 432)
      : Number(state.scriptureHeight) || Math.round(view.clientHeight * 0.42));
  }
  divider.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    divider.focus();
    const bounds = panel.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, width: bounds.width, height: bounds.height };
    divider.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-scripture');
  });
  divider.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (wide.matches) state.scriptureWidth = update(drag.width + e.clientX - drag.x);
    else state.scriptureHeight = update(drag.height + drag.y - e.clientY);
  });
  function finish() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('resizing-scripture');
    persist();
  }
  divider.addEventListener('pointerup', finish);
  divider.addEventListener('pointercancel', finish);
  divider.addEventListener('lostpointercapture', finish);
  divider.addEventListener('keydown', e => {
    const bounds = panel.getBoundingClientRect();
    const sizes = wide.matches
      ? { ArrowLeft: bounds.width - 20, ArrowRight: bounds.width + 20, Home: minimum(), End: maximum() }
      : { ArrowDown: bounds.height - 20, ArrowUp: bounds.height + 20, Home: minimum(), End: maximum() };
    if (!(e.key in sizes)) return;
    e.preventDefault();
    if (wide.matches) state.scriptureWidth = update(sizes[e.key]);
    else state.scriptureHeight = update(sizes[e.key]);
    persist();
  });
  new ResizeObserver(() => {
    syncMode();
  }).observe(view);
  wide.addEventListener('change', syncMode);
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
  }).observe(panel);
}
function onClick(e) {
  const citation = e.target.closest('[data-source-id]');
  if (citation) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); openSource(citation.dataset.sourceId); return;
  }
  const mode = e.target.closest('[data-study-mode]'); if (mode) { selectStudyMode(mode.dataset.studyMode); return; }
  const chapter = e.target.closest('[data-chapter]'); if (chapter) { selectChapter(Number(chapter.dataset.chapter)); return; }
  const perspective = e.target.closest('[data-perspective]'); if (perspective) { state.perspective = perspective.dataset.perspective; renderAll(); persist(); return; }
  const layer = e.target.closest('[data-layer]'); if (layer) { state.layers[layer.dataset.layer] = e.target.checked; drawOverlays(); persist(); return; }
  const person = e.target.closest('[data-person-id]'); if (person) { openPersonProfile(person.dataset.personId, person); return; }
  const detail = e.target.closest('[data-detail-type][data-detail-id]'); if (detail) { openLinkedDetail(detail.dataset.detailType, detail.dataset.detailId, detail); return; }
  const word = e.target.closest('[data-word-id]'); if (word) { openWord(data.words.find(w => w.id === word.dataset.wordId), word); return; }
  const event = e.target.closest('[data-event]'); if (event) { const ev = data.events.find(x => x.id === event.dataset.event); if (ev) selectEvent(ev); return; }
  const act = e.target.closest('[data-action]'); if (act) { performAction(act.dataset.action, act.dataset.id); return; }
  const period = e.target.closest('[data-period]'); if (period) { const p = data.periods.find(x => x.id === period.dataset.period); if (p) selectPeriod(p); return; }
}
function selectPeriod(p) {
  const middle = Math.round((p.start + p.end) / 2);
  if (!book.timeline) { selectChapter(middle); focusChapterMap(); return; }
  // Open the period at its first map event when it has one.
  state.date = mapEventDates.find(d => d >= p.start && d <= p.end) ?? middle; renderTimeline(); drawOverlays(); focusMapEventDate(); persist();
}
function onChange(e) { if (e.target.matches('[data-layer]')) { state.layers[e.target.dataset.layer] = e.target.checked; drawOverlays(); persist(); } if (e.target.matches('[data-passage-select]')) selectPassage(e.target.value); if (e.target.matches('[data-chapter-select]')) selectChapter(Number(e.target.value)); }
function performAction(action, id) {
  if (action === 'chapter-prev' || action === 'chapter-next') { const back = action === 'chapter-prev', i = chapters.indexOf(state.chapter), next = chapters[i + (back ? -1 : 1)]; if (next) selectChapter(next); else openNeighborBook(back); return; }
  if (action === 'event-prev' || action === 'event-next') { const next = adjacentMapEvent(action === 'event-prev' ? -1 : 1); if (next) selectChapter(next); return; }
  if (action === 'focus-chapter') focusChapterMap();
  if (action === 'story-route') {
    const route = focusedRoutes().find(r=>r.id === id);
    if (route && map) { map.stop(); map.fitBounds(L.latLngBounds(route.points).pad(.2), {paddingTopLeft:[Math.min($('.layers').offsetWidth+35,map.getSize().x*.5),45],paddingBottomRight:[40,45],maxZoom:10,animate:!reducedMapMotion.matches}); openFeature(route,true); }
  }
  if (action === 'back-scripture') closeWord();
  if (action === 'person-profile-back') closePersonProfile();
  if (action === 'sidebar-person-back') closeSidebarPersonProfile();
  if (action === 'close-card') closeCard();
  if (action === 'toggle-layers') {
    const collapsed = $('#layerOptions').classList.toggle('hidden');
    $('#layerToggle').setAttribute('aria-expanded', String(!collapsed));
    layoutPlaceLabels();
    layoutGeographyLabels();
  }
  if (action === 'return-passage') { const p = activePassage(); if (p?.year) state.date = p.year; renderTimeline(); drawOverlays(); focusChapterMap(); persist(); }
  if (action === 'library') openLibrary();
  if (action === 'guide') startGuide(id);
  if (action === 'open-guides') { renderGuides(); persist(); }
  if (action === 'guide-list') { guideState = null; renderGuides(); $("#tourDrawer .tour-choice")?.focus(); }
  if (action === 'close-guides') hideModalPanel($('#tourDrawer'));
  if (action === 'guide-next' || action === 'guide-prev') moveGuide(action === 'guide-next' ? 1 : -1);
}
function renderAll() { renderTop(); renderView(); renderTimeline(); renderScripture(); drawOverlays(); if (lastMapChapter !== state.chapter) focusChapterMap(lastMapChapter != null); if (!$('#tourDrawer').classList.contains('hidden')) renderGuides(); }
function renderTop() {
  $$('[data-chapter]').forEach(b => b.classList.toggle('active', Number(b.dataset.chapter) === state.chapter));
  $$('[data-perspective]').forEach(b => { const active = b.dataset.perspective === state.perspective; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  $$('[data-layer]').forEach(i => i.checked = !!state.layers[i.dataset.layer]);
  const portraitSwitch = $('#nonGeneratedPortraits'); if (portraitSwitch) portraitSwitch.checked = state.portraitMode === 'non-generated';
  $('#portraitAttribution').textContent = book.portraitNote ? book.portraitNote : state.portraitMode === 'non-generated'
    ? 'These old pictures are free to use. We do not know how these people looked.'
    : 'Portraits are illustrations or later historical art. We do not know how these people looked.';
}
function selectStudyMode(mode) {
  if (!['read', 'map'].includes(mode) || mode === state.studyMode) return;
  if (mode === 'read') {
    state.mapDate = state.date;
    state.date = activePassage()?.year ?? defaults.date;
  } else if (Number.isFinite(state.mapDate)) state.date = state.mapDate;
  state.studyMode = mode;
  hideSourceTooltip();
  closeCard();
  renderTop(); renderView(); renderTimeline(); drawOverlays(); persist();
}
function renderView() {
  const mapMode = state.studyMode === 'map';
  $('#mapView').classList.toggle('map-mode', mapMode);
  $('#scriptureSidebar').hidden = mapMode;
  $('.timeline').hidden = !mapMode;
  $$('[data-study-mode]').forEach(button => {
    const active = button.dataset.studyMode === state.studyMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#timelineTooltip').hidden = true;
  requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
}
function activePassage() { return data.passages.find(p => Number(p.chapter) === state.chapter && state.verse >= p.start && state.verse <= p.end) || data.passages.find(p => Number(p.chapter) === state.chapter); }
// At a book boundary, Previous opens the last chapter of the previous book. Next opens chapter 1 of the next book.
function neighborBook(back) { return back ? book.previousBook : book.nextBook; }
function openNeighborBook(back) { const target = neighborBook(back); if (!target) return; persist(); const p = new URLSearchParams({ chapter: back ? 'last' : 1, verse: 1, view: state.view, study: state.studyMode, mode: state.perspective }); location.href = `${target.url}#${p}`; }
function chapterStepLabel(back) { const atEdge = state.chapter === (back ? 1 : chapters.length), target = atEdge && neighborBook(back); return target ? `${back ? 'Previous book' : 'Next book'}: ${target.name}` : `${back ? 'Previous' : 'Next'} ${unit()}`; }
function chapterStepDisabled(back) { return state.chapter === (back ? 1 : chapters.length) && !neighborBook(back) ? 'disabled' : ''; }
function selectChapter(chapter, verse = 1) { state.chapter = chapter; state.verse = verse; state.sidebar = 'scripture'; const p = activePassage(); if (p?.year) state.date = p.year; renderAll(); persist(); $('#sidebarContent').scrollTop=0; }
function selectPassage(id) { const p = data.passages.find(x => x.id === id); if (!p) return; state.chapter = Number(p.chapter); state.verse = Number(p.start); state.sidebar = 'scripture'; if (p.year != null) state.date = Number(p.year); renderAll(); persist(); showToast(`Following ${p.title || `${book.name} ${p.chapter}:${p.start}–${p.end}`}.`); }
function chapterDateLabel(chapter = state.chapter) {
  return data.chapterDateBands?.find(band => chapter >= band.from && chapter <= band.to)?.label || '';
}
function timelineLinkHtml() {
  const id = timelineEventId();
  return timelineIds?.has(id) ? `<a class="chapter-timeline-link" href="../timeline/#event=${encodeURIComponent(id)}">See on timeline</a>` : '';
}
function chapterDateHtml() {
  const label = chapterDateLabel();
  return (label ? `<p class="chapter-date" aria-label="Approximate historical or composition period: ${esc(label)}">${esc(label)}</p>` : '') + timelineLinkHtml();
}
function renderScripture() {
  sidebarPersonHistory = [];
  if (state.sidebar === 'word') return renderWord();
  const verses = scripture.chapters?.[state.chapter] || [];
  const body = verses.length ? verses.map(v => renderVerse(v)).join('') : `<div class="word-view"><h2>${esc(book.name)} ${state.chapter}</h2><p>The text for this ${unit()} is not available.</p></div>`;
  $('#sidebarContent').innerHTML = `<div class="scripture-heading">${mapEventButtonHtml(-1, adjacentMapEvent(-1))}<button class="sidebar-next" data-action="chapter-prev" aria-label="${esc(chapterStepLabel(true))}" title="${esc(chapterStepLabel(true))}" ${chapterStepDisabled(true)}>‹</button><div class="chapter-picker-block"><h1 class="chapter-picker"><button type="button" class="chapter-picker-trigger" aria-label="${chapters.length > 1 ? `Choose ${esc(book.name)} ${unit()}, current ${unit()} ${state.chapter}` : `${esc(book.name)} ${state.chapter}, the only ${unit()}`}" aria-haspopup="listbox" aria-expanded="false" aria-controls="chapterPickerMenu" ${chapters.length > 1 ? '' : 'disabled'}>${esc(book.name)} ${state.chapter}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></button></h1>${chapterDateHtml()}</div><div id="chapterPickerMenu" class="chapter-picker-menu" popover="auto" role="listbox" aria-label="Choose ${esc(book.name)} ${unit()}">${chapters.map(c => `<button type="button" role="option" aria-label="${esc(book.name)} ${unit()} ${c}" aria-selected="${c === state.chapter}" tabindex="-1" data-value="${c}"><span>${c}</span><span class="chapter-picker-check" aria-hidden="true">${c === state.chapter ? '✓' : ''}</span></button>`).join('')}</div><button class="sidebar-next" data-action="chapter-next" aria-label="${esc(chapterStepLabel(false))}" title="${esc(chapterStepLabel(false))}" ${chapterStepDisabled(false)}>›</button>${mapEventButtonHtml(1, adjacentMapEvent(1))}</div>${body}`;
  initChapterPicker(document.querySelector('#sidebarContent'), state.chapter, chapters, selectChapter);
  $('#sidebarContent .verse')?.insertAdjacentHTML('beforebegin', passageContextHtml());
}
function chapterSourceIds(chapter = state.chapter) {
  return [...new Set(data.passages.filter(p => p.chapter === chapter).flatMap(p => [
    ...(p.sourceIds || []), ...(state.perspective === 'lds' ? p.lds?.sourceIds || [] : []),
    ...(p.studyNotes || []).filter(n => n.perspective !== 'lds' || state.perspective === 'lds').flatMap(n => n.sourceIds || [])
  ]))].filter(id => source(id) && !/^web(?:\d+)?$/.test(id));
}
function chapterInterviewNotesHtml() {
  if (state.perspective !== 'lds') return '';
  const cite = passageFootnotes({chapter:state.chapter});
  return data.passages.filter(p => p.chapter === state.chapter)
    .flatMap(p => p.studyNotes || []).filter(note => note.kind === 'interview-insight')
    .map(note => `<div class="interview-insight"><p><strong>${esc(note.title)}.</strong> ${esc(note.text)}${cite(note.sourceIds)}</p>${sourceMediaHtml(note.sourceIds, {images:false})}<p><strong>Try this reading.</strong> ${esc(note.application)}</p></div>`).join('');
}
function openSource(id) {
  const s = source(id); if (!s) return;
  hideSourceTooltip();
  const chapter = /^web(?:\d+)?$/.test(id) ? (id === 'web' ? state.chapter : Number(id.slice(3))) : null;
  const reading = chapter && scripture.chapters[chapter] ? `<details><summary>Read ${esc(book.name)} ${chapter} here · ${esc(scripture.translation || 'World English Bible')}</summary>${scripture.chapters[chapter].map(v => `<p><b>${v.verse}</b> ${esc(v.text)}</p>`).join('')}</details>` : '';
  $('#sourceContent').innerHTML = `<h2 id="sourceDialogTitle">Source details</h2>${librarySourceHtml(s).replace(`id="library-${esc(s.id)}"`, `id="detail-${esc(s.id)}"`)}${reading}<p class="source-rights">${esc(s.license || '')}</p>`;
  const dialog = $('#sourceDialog');
  // Keep the reader or guide underneath this dialog so closing returns to it.
  showModalPanel(dialog, id);
  dialog.scrollTop = 0;
  $('#sourceDialog .dialog-close').focus({preventScroll:true});
}
function passageOptions() { return data.passages.filter(p => Number(p.chapter) === state.chapter); }
function passageSelectHtml() { const entries = passageOptions(); if (entries.length < 2) return ''; const current = activePassage()?.id; return `<label class="eyebrow">Historical setting<select class="passage-select" data-passage-select>${entries.map(p => `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.start)}–${esc(p.end)} · ${esc(p.title || p.dateLabel || 'Passage context')}</option>`).join('')}</select></label>`; }
function passageContextHtml() {
  const passages = data.passages.filter(p => p.chapter === state.chapter);
  const p = passages[0]; if (!p) return '';
  const cite = passageFootnotes(p);
  const ids = [...new Set(passages.flatMap(p => p.sourceIds || []))];
  const reflection = state.perspective === 'lds' ? `<h3>LDS lens</h3><p>${esc(p.lds?.text || '')}${cite(p.lds?.sourceIds)}</p>${sourceInsightsHtml(passages.flatMap(item => item.lds?.sourceIds || []))}` : '';
  return `<section class="passage-context chapter-introduction" aria-label="Chapter introduction"><h2>${esc(p.title)}</h2><div class="passage-prose">${p.setting ? `<p class="passage-setting"><span class="eyebrow">Setting</span>${book.verseLinks === 'entities' ? linkedEntityHtml(p.setting) : esc(p.setting)}</p>` : ''}<p>${book.verseLinks === 'entities' ? linkedEntityHtml(p.summary) : esc(p.summary)}${cite(ids)}</p>${chapterContextHtml()}${chapterEvidenceHtml()}${sourceInsightsHtml(ids)}${reflection}${chapterInterviewNotesHtml()}</div>${mapStoryHtml()}</section>`;
}
// An original close reading is distinct from source summaries.
function chapterContextHtml(chapter = state.chapter) {
  const passage = data.passages.find(p => p.chapter === Number(chapter));
  const note = passage?.contextNote;
  if (!note) return '';
  return `<section class="chapter-context-note"><h3>${esc(note.title)}</h3><p>${esc(note.text)}${passageFootnotes(passage)(note.sourceIds)}</p></section>`;
}
function passageInterpretationHtml() {
  if (state.perspective !== 'lds') return '';
  const p = activePassage(), cite = passageFootnotes(p);
  return `<section class="passage-interpretation"><h3>LDS reading</h3><p class="translation">${p ? `${esc(book.name)} ${esc(String(p.chapter))}:${esc(String(p.start))}–${esc(String(p.end))} · ${esc(p.title || '')}` : `${esc(book.name)} ${state.chapter}`}</p><div class="passage-prose"><p>${esc(p?.lds?.text || 'This passage has no LDS study note yet.')}${cite(p?.lds?.sourceIds)}</p>${sourceInsightsHtml(p?.lds?.sourceIds)}</div></section>`;
}
// A book links each verse to its curated word studies, or to its people, places, and terms.
function wordVerseHtml(v) {
  const candidates = eligibleWords(v); const parts = v.text.split(/(\s+)/);
  return parts.map(part => { if (/^\s+$/.test(part)) return part; const found = matchWord(part, candidates); const label = esc(part); return found ? `<button class="word" data-word-id="${esc(found.id)}">${label}</button>` : label; }).join('');
}
function entityVerseHtml(v) {
  return linkedEntityHtml(v.text, {verse:v.verse}) + (v.publisherNote ? `<span class="verse-publisher-note"><strong>Publisher note.</strong> ${esc(v.publisherNote)}</span>` : '');
}
function renderVerse(v, prefix = 'side') {
  const text = book.verseLinks === 'entities' ? entityVerseHtml(v) : wordVerseHtml(v);
  const passage = data.passages.find(p => p.chapter === state.chapter && p.start === v.verse);
  const refs = passage ? [...(passage.sourceIds || []), ...(state.perspective === 'lds' ? passage.lds?.sourceIds || [] : [])] : [];
  const citations = passage ? passageFootnotes(passage)(refs) : '';
  const notes = citations ? `<small class="verse-study-sources">Study sources for ${passage.start}–${passage.end}${citations}</small>` : '';
  return `<article class="verse ${v.verse === state.verse ? 'selected-verse' : ''}" id="${prefix}-verse-${v.verse}"><span class="verse-number">${v.verse}</span><span>${text}${notes}</span></article>`;
}
function openWord(word, trigger) { if (!word) return; savedScroll = $('#sidebarContent').scrollTop; const verseNode = trigger.closest('.verse'); const same = '[data-word-id="' + CSS.escape(word.id) + '"]'; const peers = verseNode ? $$(same, verseNode) : []; selectedWordButton = { verse: Number(verseNode?.id.match(/verse-(\d+)/)?.[1] || state.verse), selector: same, index: Math.max(0, peers.indexOf(trigger)) }; state.sidebar = 'word'; state.wordId = word.id; state.wordLabel = word.label; renderScripture(); $('#sidebarContent').scrollTop = 0; requestAnimationFrame(() => $('#sidebarContent .back-button')?.focus({preventScroll:true})); persist(); }
function wordReferences(word) {
  const ids = word.sourceIds || [];
  const greek = ids.filter(id => id.startsWith('lxx') || id === 'strong-greek' || id === 'byz');
  const hebrew = ids.filter(id => id === 'strong' || id === 'oshb');
  const meaning = ids.filter(id => (id === 'strong' && word.scope !== 'glossary') || id.startsWith('web'));
  const ordered = [...new Set([...greek, ...hebrew, ...ids])].filter(id => source(id));
  return { greek, hebrew, meaning, discussion: ordered, ordered, cite: passageFootnotes({ sourceIds: ordered }) };
}
function wordLanguagesHtml(word) {
  if (book.wordLanguages === false) return '';
  const refs = wordReferences(word), cite = refs.cite, greekBook = word.language === 'greek';
  return `<div class="word-section word-languages"><div class="word-language-grid"><div class="word-language"><h3>${greekBook ? 'Greek' : 'Greek (Septuagint)'}</h3>${word.greek ? `<p class="term" lang="grc">${esc(word.greek)}${cite(refs.greek)}</p>${word.greekTransliteration ? `<p>${esc(word.greekTransliteration)}</p>` : ''}` : '<p>No Greek match was found.</p>'}</div><div class="word-language word-language-hebrew"><h3>Hebrew</h3>${word.hebrew ? `<p class="term hebrew-term"><bdi lang="he" dir="rtl">${esc(word.hebrew)}</bdi>${cite(refs.hebrew)}</p><p>${esc(word.transliteration || '')}</p>` : `<p>${greekBook ? 'This book has no Hebrew text.' : 'No Hebrew match was found.'}</p>`}</div></div>${word.greek && word.greekNote ? `<p class="word-language-note">${esc(word.greekNote)}${cite(refs.greek)}</p>` : ''}${word.languageNote ? `<p class="word-language-note">${esc(word.languageNote)}</p>` : ''}</div>`;
}
function wordStudyBodyHtml(word, title = word?.label || 'Selected word') {
  const personId = personIdForLabel(title);
  let html = personId ? linkedPersonProfileHtml(personId) : `<h2>${esc(title)}</h2>${wordPortraits(title)}`;
  if (!word) html += `<p class="translation">No study note yet</p><div class="word-section"><p>This word has no study note yet.</p></div>`;
  else {
    const refs = wordReferences(word), cite = refs.cite;
    html += wordLanguagesHtml(word);
    if (word.meaning) html += `<div class="word-section"><h3>${word.scope === 'dictionary' ? 'Dictionary meaning' : word.scope === 'glossary' ? 'Plain meaning' : 'Meaning in this passage'}</h3><p>${linkedEntityHtml(word.meaning, {excludeType:'word', excludeId:word.id}).replace(/\n/g, '<br>')}${cite(refs.meaning)}</p></div>`;
    if (word.discussion) html += `<div class="word-section"><h3>Study note</h3><p>${linkedEntityHtml(word.discussion, {excludeType:'word', excludeId:word.id}).replace(/\n/g, '<br>')}${cite(refs.discussion)}</p></div>`;

    if (word.related?.length) html += `<div class="word-section"><h3>Related use</h3>${word.related.map(r => `<a class="source-link" target="_blank" rel="noopener" href="${esc(r.url)}">${esc(r.label)} — ${esc(r.note || '')}</a>`).join('')}</div>`;
    html += sourceInsightsHtml(refs.ordered);
    html += `<div class="word-section"><h3>Sources</h3>${sourcesHtml(refs.ordered, true)}</div>`;
  }
  return html;
}
function renderWord() {
  const word = data.words.find(w => w.id === state.wordId); const title = word?.label || state.wordLabel || 'Selected word';
  $('#sidebarContent').innerHTML = `<section class="word-view"><button class="back-button" data-action="back-scripture">← Back to scripture</button>${wordStudyBodyHtml(word, title)}</section>`;
}
function closeWord() { const restore = selectedWordButton; state.sidebar = 'scripture'; renderScripture(); persist(); requestAnimationFrame(() => { $('#sidebarContent').scrollTop = savedScroll; const verse = $(`#side-verse-${restore?.verse}`); const button = verse ? $$(restore.selector, verse)[restore.index] : null; button?.focus({ preventScroll: true }); }); }
function scrollVerse(verse, focus = true) {
  const number = Number(verse);
  if (!scripture.chapters[state.chapter]?.some(v => v.verse === number)) return;
  state.verse = number;
  $$('#sidebarContent .verse').forEach(el => el.classList.toggle('selected-verse', el.id === `side-verse-${number}`));
  const el = $(`#side-verse-${number}`);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (focus) $('button', el)?.focus({preventScroll:true});
  }
  renderTop(); persist();
}
// A map event is a chapter or section that draws a path, a story area, or a place of loss.
// A chapter or section that only names towns is not a map event.
function isEventChapter(chapter) {
  const focus = chapterFocus(data, chapter);
  if (!focus) return false;
  if (focus.impacts?.some(item => data.places.some(p => p.id === item.placeId))) return true;
  if (focus.routes?.some(ref => [...data.campaigns, ...(data.textRoutes || [])].some(route => route.id === ref.id))) return true;
  return (data.narrativeRegions || []).some(region => focus.placeIds?.includes(region.placeId));
}
function adjacentMapEvent(direction, chapter = state.chapter) {
  return direction < 0 ? mapEvents.findLast(c => c < chapter) : mapEvents.find(c => c > chapter);
}
// A map pin beside a chevron marks a jump to the next map event, not the next chapter or section.
function mapEventButtonHtml(direction, target) {
  if (!mapEvents.length) return '';
  const label = `${direction < 0 ? 'Previous' : 'Next'} map event${target ? `: ${book.name} ${target}` : ''}`;
  const chevron = direction < 0 ? '<path d="M8 7 3 12l5 5"/>' : '<path d="m16 7 5 5-5 5"/>';
  const pin = direction < 0 ? '<path d="M15.5 20s-5-4.3-5-8.5a5 5 0 0 1 10 0c0 4.2-5 8.5-5 8.5z"/><circle cx="15.5" cy="11.5" r="1.7"/>' : '<path d="M8.5 20s-5-4.3-5-8.5a5 5 0 0 1 10 0c0 4.2-5 8.5-5 8.5z"/><circle cx="8.5" cy="11.5" r="1.7"/>';
  return `<button class="sidebar-event" data-action="event-${direction < 0 ? 'prev' : 'next'}" aria-label="${esc(label)}" title="${esc(label)}" ${target ? '' : 'disabled'}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${chevron}${pin}</svg></button>`;
}
// The chapter-order scrubber steps through map events. A book without map events uses every chapter or section.
function scrubChapters() { return mapEvents.length ? mapEvents : chapters; }
// A chapter, section, or date between events keeps the handle on the event before it.
function scrubIndex(chapter = state.chapter) { return Math.max(0, scrubChapters().findLastIndex(c => c <= chapter)); }
function dateIndex(date = state.date) { return Math.max(0, mapEventDates.findLastIndex(d => d <= date)); }
function scrubDate(value) { return mapEventDates.length ? mapEventDates[Number(value)] : Number(value); }
// Dated milestones are the book's events. A book turns them off with timeline.milestones: false.
function milestones() { return book.timeline?.milestones === false ? [] : data.events || []; }
// A dated milestone names the map event at its date.
function mapEventTitle(date = state.date) { const event = milestones().find(e => Number(e.year) === date); return event?.title || event?.name || ''; }
function isPassageDate() { const p = activePassage(); return !p?.year || state.date === p.year; }
function renderTimeline() {
  if (!book.timeline) {
    const steps = scrubChapters(), position = steps.indexOf(state.chapter);
    $('#timelineRange').value = scrubIndex();
    $('#timelineRange').setAttribute('aria-valuetext', `${book.name} ${state.chapter}`);
    $('#timelineChapter').textContent = !mapEvents.length ? `${Unit()} order` : position >= 0 ? `Map event ${position + 1} of ${steps.length}` : `Between map events · ${steps.length} in all`;
    $('#dateLabel').value = `${book.name} ${state.chapter} · ${activePassage()?.title || ''}`;
    $('#returnPassage').classList.add('hidden');
    $('#timelineTooltip').textContent = `${book.name} ${state.chapter}`;
    return;
  }
  const p = activePassage(), follow = isPassageDate();
  const position = mapEventDates.indexOf(state.date), title = state.studyMode === 'map' && position >= 0 ? mapEventTitle() : '';
  $('#timelineRange').value = mapEventDates.length ? dateIndex() : state.date;
  $('#timelineRange').setAttribute('aria-valuetext', `${formatDate(state.date)}${title ? ` · ${title}` : ''}`);
  $('#timelineChapter').textContent = state.studyMode !== 'map' ? `${book.name} ${state.chapter}` : !mapEventDates.length ? 'Historical map' : position >= 0 ? `Map event ${position + 1} of ${mapEventDates.length}` : `Between map events · ${mapEventDates.length} in all`;
  $('#dateLabel').value = state.studyMode === 'map' ? `${formatDate(state.date)}${title ? ` · ${title}` : ''}` : p?.year == null ? (p?.dateLabel || 'Date not known') : follow && p?.dateLabel ? p.dateLabel : formatDate(state.date);
  $('#returnPassage').classList.toggle('hidden', follow || !p?.year);
  $('#timelineTooltip').textContent = formatDate(state.date);
}
function initTimelineTooltip() {
  const range = $('#timelineRange'), tooltip = $('#timelineTooltip');
  let pointerId = null;
  function position(event) {
    tooltip.textContent = book.timeline ? formatDate(scrubDate(range.value)) : `${book.name} ${scrubChapters()[Number(range.value)] ?? ''}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(8, Math.min(event.clientX - tooltip.offsetWidth / 2, innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, event.clientY - tooltip.offsetHeight - 16)}px`;
  }
  function stop() { pointerId = null; tooltip.hidden = true; }
  range.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    range.setPointerCapture(pointerId);
    position(event);
  });
  range.addEventListener('pointermove', event => { if (event.pointerId === pointerId) position(event); });
  range.addEventListener('pointerup', stop);
  range.addEventListener('pointercancel', stop);
  range.addEventListener('lostpointercapture', stop);
  range.addEventListener('blur', stop);
  window.addEventListener('blur', stop);
}
function eventsNear(year, range = 10) { return data.events.filter(e => Math.abs(Number(e.year) - year) <= range).sort((a,b) => Math.abs(a.year-year)-Math.abs(b.year-year)); }
function selectEvent(event) {
  if (book.timeline) { state.date = Number(event.year); renderTimeline(); drawOverlays(); persist(); }
  else { selectChapter(event.chapter); focusChapterMap(); }
  openFeature(event, true, null);
}
function findFeature(id) { return [...data.places, ...data.events, ...data.campaigns, ...data.ancientRoads, ...data.regions, ...focusedRoutes(), ...chapterImpacts(), ...chapterAreas()].find(f => f.id === id); }
function featureType(f) { return f.narrativeRegion ? 'Map area' : f.impact ? 'Loss or pain' : f.chapterRoute || f.textRoute ? `${Unit()} path` : data.ancientRoads.includes(f) ? 'Major road' : data.campaigns.includes(f) ? (f.typeLabel || 'Army path') : data.regions.includes(f) ? (f.typeLabel || 'Area of rule') : data.places.includes(f) ? 'Place' : 'Event'; }
function mapDisplayText(text = '') {
  const footerCovered = /\b(?:map|line|connection|route|road|itinerary|coordinate|pin|location|border|area of influence|travel order|sequence of (?:movement|stops))\b/i;
  const caveat = /\b(?:approximate|schematic|representative|precise|exact|verified|confirmed|unknown|uncertain|does not (?:establish|show|trace|identify|reconstruct)|not (?:a|an|the)|remain debated)\b/i;
  return text.split(/(?<=[.!?])\s+/).filter(sentence => !(footerCovered.test(sentence) && caveat.test(sentence))).join(' ').trim();
}
function mapDisplayName(name = '') {
  return name.replace(/ · (?:approximate(?: regional influence)?|regional focus|uncertain site)$/i, '');
}
const modalOpeningAnimations = new WeakMap();
const modalContentKeys = new WeakMap();
function showModalPanel(panel, contentKey) {
  const isDialog = panel.tagName === 'DIALOG';
  const wasClosed = isDialog ? !panel.open : panel.classList.contains('hidden');
  const contentChanged = contentKey !== undefined && modalContentKeys.get(panel) !== contentKey;
  modalContentKeys.set(panel, contentKey);
  if (!wasClosed && !contentChanged) return;
  if (wasClosed) {
    if (isDialog) panel.showModal();
    else panel.classList.remove('hidden');
  }
  // Shared panels also animate when another item replaces their content.
  modalOpeningAnimations.get(panel)?.cancel();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animation = panel.animate([
    { opacity: 0, scale: '.94' },
    { opacity: 1, scale: '1' }
  ], { duration: 180, easing: 'ease-in-out' });
  modalOpeningAnimations.set(panel, animation);
}
function hideModalPanel(panel) {
  modalOpeningAnimations.get(panel)?.cancel();
  if (panel.tagName === 'DIALOG') panel.close();
  else panel.classList.add('hidden');
}
// Keep floating study windows mutually exclusive without restoring old focus.
function openStudyModal(id, contentKey) {
  hideSourceTooltip();
  try {
    for (const modal of $$('#contextCard, #tourDrawer, dialog')) {
      if (modal.id === id) continue;
      hideModalPanel(modal);
    }
    const modal = $('#' + id);
    if (id === 'contextCard') modal.style.translate = '';
    showModalPanel(modal, contentKey);
  } finally {
    syncMapSelection();
  }
}
function focusPathVerse(feature) {
  if (!feature.chapterRoute && !feature.textRoute && !data.campaigns.includes(feature)) return;
  const chapter = Number(feature.chapter), verse = Number(feature.verse);
  if (!scripture.chapters[chapter]?.some(v => v.verse === verse)) return;
  if (chapter !== state.chapter) return;
  if (state.sidebar !== 'scripture') { state.sidebar = 'scripture'; renderScripture(); }
  scrollVerse(verse, false);
}
function sourceMediaHtml(ids = [], options = {}) {
  const images = new Set(), chapter = options.chapter ?? state.chapter;
  return [...new Set(ids)].map(id => {
    const item = source(id);
    if (!item) return '';
    const showImage = options.images !== false && (options.allExcerpts || !(item.imageChapters || item.chapterCoverage) || (item.imageChapters || item.chapterCoverage).includes(Number(chapter))) && item.image && !images.has(item.image.src);
    if (showImage) images.add(item.image.src);
    const excerpt = options.quotes === false ? null : item.excerpt;
    const showExcerpt = excerpt && (!excerpt.chapters || excerpt.chapters.includes(Number(chapter)) || options.allExcerpts);
    const previewText = mapDisplayText(item.previewText || '');
    return `${showImage ? `<div class="study-evidence">${previewText ? `<p>${esc(previewText)}</p>` : ''}${sourceImageHtml(item.image)}</div>` : ''}${showExcerpt ? `<figure class="study-quotation"><blockquote cite="${esc(excerpt.url || item.url)}">${esc(excerpt.text)}</blockquote><figcaption>${esc(excerpt.attribution)}<br><a href="${esc(excerpt.url || item.url)}" target="_blank" rel="noopener">${esc(excerpt.location)} ↗</a></figcaption>${excerpt.context ? `<p>${esc(excerpt.context)}</p>` : ''}</figure>` : ''}`;
  }).join('');
}
function sourceInsightsHtml(ids = [], chapter = state.chapter) {
  // Without inline notes, source summaries stay in the source dialog.
  if (book.sourceNotes !== 'inline') return sourceMediaHtml(ids, {chapter});
  const seen = new Set();
  return [...new Set(ids)].map(id => {
    const item = source(id);
    if (!item || /^(web\d*|geo|earth|strong|oshb|lxx\d+)$/.test(id)) return '';
    if (seen.has(id)) return '';
    seen.add(id);
    if (item.group === 'conference-year' && !item.scriptureReferences?.some(ref => {
      const match = ref.label.match(new RegExp(`${bookNamePattern()}\\s+(\\d+)(?=\\D|$)`, 'i'));
      return match ? Number(match[1]) === Number(chapter) : !!ref.chapters?.includes(Number(chapter));
    })) return '';
    const related = item.chapterCoverage && !item.chapterCoverage.includes(Number(chapter));
    const context = mapDisplayText((related ? `This lesson covers nearby ${unit()}s, not ${book.name} ${chapter}. ` : '') + (item.studyText || item.summary || ''));
    const note = context && !item.image ? `<p class="source-insight">${esc(context)} <a class="source-inline-citation" href="${esc(item.url)}" data-source-id="${esc(id)}" aria-haspopup="dialog">${esc(item.author || item.title)}</a></p>` : '';
    const cited = (item.citedSourceIds || []).filter(id => !ids.includes(id) && !seen.has(id)).map(source).filter(Boolean);
    cited.forEach(work => seen.add(work.id));
    const supporting = cited.map(work => `<p class="source-insight">${esc(mapDisplayText(work.summary))} <a class="source-inline-citation" href="${esc(work.url)}" data-source-id="${esc(work.id)}" aria-haspopup="dialog">${esc(work.author || work.title)}</a></p>`).join('');
    return note + sourceMediaHtml([id], {chapter}) + supporting;
  }).join('');
}
function scriptureExcerptHtml(chapter, verse, context = '') {
  const reading = scripture.chapters[chapter]?.find(item => item.verse === Number(verse));
  if (!reading) return '';
  const url = publisherChapter(chapter, Number(verse));
  return `<figure class="study-quotation scripture-excerpt"><blockquote cite="${esc(url)}">${esc(reading.text)}</blockquote><figcaption><a href="${esc(url)}" target="_blank" rel="noopener">${esc(book.name)} ${Number(chapter)}:${Number(verse)} ↗</a> · ${esc(scriptureCredit())}</figcaption>${context ? `<p>${esc(context)}</p>` : ''}</figure>`;
}
function chapterEvidenceHtml(chapter = state.chapter) {
  const study = data.chapterStudies?.find(item => item.chapter === Number(chapter));
  return study ? scriptureExcerptHtml(study.chapter, study.verse, study.context) : '';
}
function placeVerseInChapter(feature, chapter = state.chapter) {
  if (!data.places?.some(place => place.id === feature.id)) return null;
  const name = (feature.name || '').split(' · ')[0];
  const nameWords = name.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return (scripture.chapters[chapter] || []).find(item => {
    const words = item.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    return nameWords.length && words.some((_, index) => nameWords.every((word, offset) => words[index + offset] === word));
  }) || null;
}
function sourceChapters(id) {
  const item = source(id);
  const reviewed = data.studySourceReview?.find(entry => entry.sourceId === id)?.chapters || [];
  // "web" is the Scripture source for each chapter that has no source of its own.
  const webChapters = id === 'web' ? chapters.filter(chapter => !source(`web${chapter}`)) : [id.match(/^web(\d+)$/)?.[1]].filter(Boolean);
  if (id === 'web' && webChapters.length === chapters.length) return chapters;
  return [...new Set([...(item?.chapterCoverage || []), ...reviewed, ...webChapters].map(Number))];
}
function genericPlaceDescription(feature) {
  const name = mapDisplayName(feature.name || feature.title);
  const chapterSpecific = new RegExp(`\\b(?:${bookNamePattern()}|chapter|passage|prophecy|speaker|speech|account|narrative)\\b`, 'i');
  const mapSpecific = /\b(?:marker|map|route|line|pin|coordinate)\b/i;
  const clauses = (feature.summary || '').split(/(?<=[.!?])\s+|;\s+/)
    .map(text => text.trim()).filter(text => text && !chapterSpecific.test(text) && !mapSpecific.test(text));
  if (!clauses.length) return `${name} is a place in the geographic setting of ${book.name}.`;
  return clauses.map((text, index) => {
    if (index || !/^It(?:s)?\b/.test(text)) return text;
    return text.replace(/^Its\b/, `${name}’s`).replace(/^It\b/, name);
  }).join(' ');
}
function featureChapterContext(feature) {
  const isPlace = data.places?.some(place => place.id === feature.id);
  if (!isPlace || Number(feature.chapter) === state.chapter) {
    return { paragraphs:[...new Set([feature.summary, feature.detail].map(mapDisplayText).filter(Boolean))], sourceIds:feature.sourceIds || [] };
  }
  const verse = placeVerseInChapter(feature);
  const name = mapDisplayName(feature.name || feature.title);
  const paragraphs = [verse ? `${book.name} ${state.chapter}:${verse.verse} names ${name}.` : genericPlaceDescription(feature), mapDisplayText(feature.detail)].filter(Boolean);
  const sourceIds = (feature.sourceIds || []).filter(id => {
    const chapters = sourceChapters(id);
    return !chapters.length || chapters.includes(state.chapter);
  });
  const webId = source(`web${state.chapter}`) ? `web${state.chapter}` : 'web';
  if (verse && source(webId)) sourceIds.push(webId);
  return { paragraphs, sourceIds:[...new Set(sourceIds)] };
}
function featureScriptureHtml(feature) {
  const reference = feature.reference?.match(new RegExp(`^${bookNamePattern()} (\\d+):(\\d+)`));
  if (reference) return scriptureExcerptHtml(Number(reference[1]), Number(reference[2]));
  if (feature.textRoute || data.campaigns?.some(item => item.id === (feature.originalId || feature.id))) {
    return scriptureExcerptHtml(feature.chapter, feature.verse);
  }
  // A place gets a quotation only when its name occurs in the current chapter.
  if (data.places?.some(place => place.id === feature.id)) {
    const verse = placeVerseInChapter(feature);
    return verse ? scriptureExcerptHtml(state.chapter, verse.verse) : '';
  }
  return '';
}
function featureBodyHtml(feature) {
  const context = featureChapterContext(feature);
  return `<div class="feature-prose">${(context.paragraphs.length ? context.paragraphs : ['No description is available for this feature.']).map(text => `<p>${linkedEntityHtml(text, {excludeType:'feature', excludeId:feature.id})}</p>`).join('')}${featureScriptureHtml(feature)}${data.regions.includes(feature) ? '' : sourceMediaHtml(context.sourceIds, {chapter:state.chapter})}</div>`;
}
function featureDetailBodyHtml(feature) {
  const context = featureChapterContext(feature);
  const lds = state.perspective === 'lds' && feature.lds?.text ? `<div class="word-section"><h3>LDS reading</h3><p>${linkedEntityHtml(feature.lds.text, {excludeType:'feature', excludeId:feature.id})}</p>${sourceInsightsHtml(feature.lds.sourceIds)}</div>` : '';
  return `<span class="eyebrow">${featureType(feature)}</span><h2>${esc(mapDisplayName(feature.name || feature.title))}</h2>${featurePortraits(feature, state.date)}${feature.dateLabel ? `<span class="badge">${esc(feature.dateLabel)}</span>` : ''}${featureBodyHtml(feature)}${feature.word ? wordLanguagesHtml(feature.word) : ''}${lds}<div class="word-section"><h3>Sources</h3>${sourcesHtml([...context.sourceIds, ...(state.perspective === 'lds' ? feature.lds?.sourceIds || [] : [])])}</div>`;
}
function linkedDetail(type, id) {
  if (type === 'person') return people[id] ? {type, id, label:people[id].name} : null;
  if (type === 'word') { const word = data.words.find(item => item.id === id); return word ? {type, id, label:word.label, item:word} : null; }
  if (type === 'feature') { const feature = findFeature(id); return feature ? {type, id, label:mapDisplayName(feature.name || feature.title), item:feature} : null; }
  return null;
}
function detailReturnSelector(type, id) {
  return type === 'person' ? `[data-person-id="${CSS.escape(id)}"]` : `[data-detail-type="${CSS.escape(type)}"][data-detail-id="${CSS.escape(id)}"]`;
}
function linkedDetailBodyHtml(detail, backLabel, context = 'sidebar') {
  const back = `<button class="back-button person-profile-back" data-action="${context === 'context' ? 'person-profile-back' : 'sidebar-person-back'}" aria-label="Back to ${esc(backLabel)}">← Back</button>`;
  if (detail.type === 'person') return context === 'context'
    ? linkedPersonProfileHtml(detail.id, {backLabel:`Back to ${backLabel}`})
    : `<section class="word-view">${back}${linkedPersonProfileHtml(detail.id)}</section>`;
  const body = detail.type === 'word' ? wordStudyBodyHtml(detail.item, detail.label) : featureDetailBodyHtml(detail.item);
  return `<section class="word-view">${back}${body}</section>`;
}
function renderContextLinkedDetail(card, detail, backLabel) {
  card.innerHTML = `<button class="dialog-close" data-action="close-card" aria-label="Close context">×</button>${linkedDetailBodyHtml(detail, backLabel, 'context')}`;
  openStudyModal('contextCard', `${detail.type}:${detail.id}`);
  card.scrollTop = 0;
  requestAnimationFrame(() => $('.person-profile-back', card)?.focus({preventScroll:true}));
}
function openSidebarLinkedDetail(type, id, trigger) {
  const detail = linkedDetail(type, id);
  if (!detail) return;
  const content = $('#sidebarContent');
  const backLabel = $('h2', content)?.textContent?.trim() || state.wordLabel || `${book.name} ${state.chapter}`;
  sidebarPersonHistory.push({html:content.innerHTML, scrollTop:content.scrollTop, returnSelector:detailReturnSelector(type, id)});
  content.innerHTML = linkedDetailBodyHtml(detail, backLabel);
  content.scrollTop = 0;
  requestAnimationFrame(() => $('[data-action="sidebar-person-back"]', content)?.focus({preventScroll:true}));
}
function closeSidebarPersonProfile() {
  const content = $('#sidebarContent'), previous = sidebarPersonHistory.pop();
  if (!previous) return closeWord();
  content.innerHTML = previous.html;
  if (content.querySelector('.chapter-picker-trigger')) initChapterPicker(content, state.chapter, chapters, selectChapter);
  requestAnimationFrame(() => {
    content.scrollTop = previous.scrollTop;
    $(previous.returnSelector, content)?.focus({preventScroll:true});
  });
}
function openPersonProfile(personId, trigger) {
  const card = trigger?.closest('#contextCard');
  if (!card) return openSidebarLinkedDetail('person', personId, trigger);
  openContextLinkedDetail('person', personId, trigger);
}
function openLinkedDetail(type, id, trigger) {
  const card = trigger?.closest('#contextCard');
  if (!card) return openSidebarLinkedDetail(type, id, trigger);
  openContextLinkedDetail(type, id, trigger);
}
function openContextLinkedDetail(type, id, trigger) {
  const detail = linkedDetail(type, id), card = trigger?.closest('#contextCard');
  if (!detail || !card) return;
  const backLabel = $('h2', card)?.textContent?.trim() || 'previous entry';
  card._detailHistory ||= [];
  card._detailHistory.push({html:card.innerHTML, scrollTop:card.scrollTop, returnSelector:detailReturnSelector(type, id)});
  renderContextLinkedDetail(card, detail, backLabel);
}
function closePersonProfile() {
  const card = $('#contextCard'), previous = card._detailHistory?.pop();
  if (previous) {
    card.innerHTML = previous.html;
    requestAnimationFrame(() => {
      card.scrollTop = previous.scrollTop;
      $(previous.returnSelector, card)?.focus({preventScroll:true});
    });
    return;
  }
  closeCard();
}
function openFeature(f, pinned = false, origin) { if (!f) return; if (pinned) focusPathVerse(f); const card = $('#contextCard'); if (!pinned && card.dataset.pinned === 'true' && !card.classList.contains('hidden')) return; card._detailHistory = []; card.dataset.feature = f.id; card.dataset.pinned = String(pinned); card.innerHTML = `<button class="dialog-close" data-action="close-card" aria-label="Close context">×</button>${featureDetailBodyHtml(f)}`; openStudyModal('contextCard', f.id); card.scrollTop = 0; card._origin = origin?.getElement?.() || origin || card._origin; const point = origin?.getLatLng?.() || origin?.getCenter?.(); const stage = $('.map-stage'); const labelRect = origin?.getElement?.()?.matches('.city-label') ? origin.getElement().firstElementChild.getBoundingClientRect() : null; const stageRect = stage.getBoundingClientRect(); const at = labelRect ? {x:labelRect.right-stageRect.left, y:labelRect.top-stageRect.top} : point && map ? map.latLngToContainerPoint(point) : {x: stage.clientWidth / 2, y: 70}; card.style.left = `${Math.max(12, Math.min(at.x + 18, stage.clientWidth - card.offsetWidth - 12))}px`; card.style.top = `${Math.max(12, Math.min(at.y, stage.clientHeight - card.offsetHeight - 12))}px`; }
function closeCard() { const card = $('#contextCard'); if (card.classList.contains('hidden')) return; hideModalPanel(card); syncMapSelection(); card._origin?.focus?.({preventScroll:true}); }

function initMap() {
  if (!window.L) { showToast('The map did not load. Reload the page to try again.'); return; }
  // A book can set its own map area. The Levant view stays the default.
  const view = { center: [32.1, 35.0], zoom: 7, bounds: [[8,1],[48,57]], minZoom: 3, maxZoom: 14, ...(book.map || {}) };
  const [[south, west], [north, east]] = view.bounds;
  const stored = state.map || view; const center = Array.isArray(stored.center) && stored.center[0] >= south && stored.center[0] <= north && stored.center[1] >= west && stored.center[1] <= east ? stored.center : view.center; const zoom = stored.zoom >= view.minZoom && stored.zoom <= view.maxZoom ? stored.zoom : view.zoom;
  map = L.map('map', { zoomControl: false, attributionControl: true, preferCanvas: false, minZoom: view.minZoom, maxZoom: view.maxZoom, zoomSnap: .25, maxBounds: view.bounds, maxBoundsViscosity: .8 }).setView(center, zoom);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.control.scale({position:'bottomleft',imperial:false}).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(`Natural Earth${book.relief === false ? '' : ' · Terrain: Mapzen / USGS / NOAA'} · ${book.placeCredits?.length ? `Places: ${book.placeCredits.map(credit => `<a href="${esc(credit.url)}">${esc(credit.label)}</a>`).join(' / ')}` : 'Place sources: see study notes'}`);
  for (const [name,z] of [['base',200],['relief',220],['detail',230],['water',240],['outsideFocus',250]]) { map.createPane(name); map.getPane(name).style.zIndex=z; map.getPane(name).style.pointerEvents='none'; }
  // Remove color outside the terrain bounds. Keep story markers above this pane.
  map.getPane('outsideFocus').style.mixBlendMode = 'saturation';
  // Keep area fills and distress rings below city dots in every draw order.
  for (const [name,z] of [['areas',300],['roads',390],['routes',410],['impacts',415],['places',420],['geography',450]]) {
    map.createPane(name); map.getPane(name).style.zIndex = z;
  }
  map.getPane('geography').style.pointerEvents = 'none';
  addGeographyLabels();
  map.on('moveend', persist).on('moveend zoomend', updateRecenter).on('resize', keepChapterView).on('moveend zoomend resize', refreshMapDetails).on('dragstart zoomstart', () => { const card = $('#contextCard'); if (card.dataset.pinned !== 'true') hideModalPanel(card); });
  Promise.allSettled(['data/land.geojson','data/lakes-detail.geojson',book.relief === false ? '' : 'data/relief.json','data/rivers.geojson'].map(p => p ? fetch(p).then(r => { if (!r.ok) throw Error(p); return r.json(); }) : Promise.reject(Error('No relief layer')))).then(r => {
    if (r[0].status === 'fulfilled') L.geoJSON(r[0].value, {pane:'base',interactive:false, style: { color: '#dfc990', weight: 1, fillColor: '#a4ac79', fillOpacity: 1 } }).addTo(map);
    if (r[1].status === 'fulfilled') L.geoJSON(r[1].value, {pane:'water',interactive:false, style: { color: '#81bbca', weight: 1.2, fillColor: '#155c80', fillOpacity: 1 } }).addTo(map);
    if (r[3].status === 'fulfilled') L.geoJSON(r[3].value, {pane:'water', interactive:false,
      // A book with many small rivers can draw the smallest ones thin and faint with map.fadeMinorRivers.
      style: f => book.map?.fadeMinorRivers && f.properties.rank > 8 ? {color:'#4b9fbd', weight:1.1, opacity:.75} : ({color:'#4b9fbd', weight:f.properties.rank <= 5 ? 3.2 : 2.2, opacity:1})}).addTo(map);
    if (r[2].status === 'fulfilled') {
      L.imageOverlay('assets/relief.webp',r[2].value.bounds,{pane:'relief',opacity:1,interactive:false}).addTo(map);
      const [[south,west],[north,east]] = r[2].value.bounds;
      L.polygon([
        [[-85,-180],[-85,180],[85,180],[85,-180]],
        [[south,west],[north,west],[north,east],[south,east]]
      ], {pane:'outsideFocus', interactive:false, stroke:false, fillColor:'#888888',
        fillOpacity:1, fillRule:'evenodd', smoothFactor:0}).addTo(map);
      // Keep coarse tiles beneath finer layers as a fallback outside their bounds.
      const details = [r[2].value.detail, ...(r[2].value.closeDetail || [])].filter(Boolean);
      details.forEach((detail,index) => L.tileLayer(webpCopy(detail.url) || detail.url, {
        pane:'detail', bounds:detail.bounds, minZoom:detail.minZoom,
        maxNativeZoom:detail.maxNativeZoom, maxZoom:14, noWrap:true, keepBuffer:1,
        zIndex:index+1,
        errorTileUrl:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
      }).addTo(map));
    }
  });
}
const geographyLabels = [];
function addGeographyLabels() {
  // Fixed geographic anchors keep names on their water features as the map moves.
  const labels = book.geographyLabels || [
    ['Mediterranean Sea',34,32,4,0], ['Red Sea',23.5,37,4,-62],
    ['Dead Sea',31.5,35.48,7,-78], ['Sea of Galilee',32.82,35.59,8,0],
    ['Gulf of Aqaba',28.8,34.75,7,-62], ['Gulf of Suez',28.8,32.9,7,-55],
    ['Persian Gulf',27,51,4,-32], ['Black Sea',43,34,4,0],
    ['Nile',28,30.8,6,-80], ['Jordan',32.28,35.57,8,-80],
    ['Euphrates',35.2,40.5,6,35], ['Tigris',35.4,43.35,6,48]
  ];
  for (const [name,lat,lng,minZoom,angle] of labels) {
    const layer = L.marker([lat,lng], {pane:'geography',interactive:false,keyboard:false,
      icon:L.divIcon({className:'geography-label',iconSize:[0,0],iconAnchor:[0,0],
        html:`<span style="--water-angle:${angle}deg">${esc(name)}</span>`})}).addTo(map);
    layer.getElement().setAttribute('aria-hidden','true');
    const positions = book.geographyLabels ? [[lat,lng]] : name === 'Mediterranean Sea' ? [[34,32],[32,33],[35,34],[33,33]]
      : name === 'Red Sea' ? [[23.5,37],[26,35],[27.3,34.1]] : [[lat,lng]];
    geographyLabels.push({layer,minZoom,positions});
  }
}
function layoutGeographyLabels() {
  const occupied = [...labelFeatures.values()].filter(e => e.visible).map(e => e.layer.getElement().getBoundingClientRect());
  occupied.push(...$$('.layers, .leaflet-control').map(el => el.getBoundingClientRect()));
  const bounds = map.getContainer().getBoundingClientRect();
  for (const {layer,minZoom,positions} of geographyLabels) {
    const el = layer.getElement();
    el.style.visibility = 'hidden';
    if (map.getZoom() < minZoom) continue;
    for (const position of positions) {
      layer.setLatLng(position);
      const rect = el.firstElementChild.getBoundingClientRect();
      const overlaps = occupied.some(r => rect.left < r.right+5 && rect.right > r.left-5 && rect.top < r.bottom+5 && rect.bottom > r.top-5);
      if (overlaps || rect.left < bounds.left || rect.right > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom) continue;
      el.style.visibility = 'visible';
      occupied.push(rect);
      break;
    }
  }
}
const mapFeatures = new Map(), arrowFeatures = new Map(), labelFeatures = new Map();
const reducedMapMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mapTransitionMs = 650;
// Retain each feature by identity. Interrupted fades resume from their current opacity.
function fadeMapFeature(entry, visible, done) {
  const el = entry.layer.getElement();
  const opacity = entry.animation ? getComputedStyle(el).opacity : (entry.visible ? '1' : '0');
  entry.animation?.cancel();
  entry.visible = visible;
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = visible ? '' : 'none';
  if (el.hasAttribute('tabindex')) el.setAttribute('tabindex', visible ? '0' : '-1');
  el.setAttribute('aria-hidden', String(!visible));
  if (reducedMapMotion.matches || !el.animate) { entry.animation = null; done?.(); return; }
  const animation = el.animate([{opacity}, {opacity: visible ? 1 : 0}], {
    duration: visible ? mapTransitionMs : 350, easing: 'ease-in-out'
  });
  entry.animation = animation;
  animation.onfinish = () => { entry.animation = null; done?.(); };
}
function keepMapFeature(collection, key, create) {
  let entry = collection.get(key);
  if (!entry) {
    entry = {layer: create(), visible: false, animation: null};
    collection.set(key, entry);
  }
  if (!entry.visible) fadeMapFeature(entry, true);
  return entry.layer;
}
function retireMapFeatures(collection, wanted) {
  for (const [key, entry] of collection) {
    if (wanted.has(key) || !entry.visible) continue;
    fadeMapFeature(entry, false, () => {
      map.removeLayer(entry.layer);
      collection.delete(key);
    });
  }
}
reducedMapMotion.addEventListener('change', () => {
  if (!reducedMapMotion.matches) return;
  for (const collection of [mapFeatures, arrowFeatures, labelFeatures]) {
    for (const entry of collection.values()) entry.animation?.finish();
  }
  $$('.route-arrow svg').forEach(el => el.getAnimations().forEach(animation => animation.finish()));
});
function visibleAt(f) { return (f.start == null || state.date >= f.start) && (f.end == null || state.date <= f.end); }
const factions = {
  judah: { name: 'Judah', color: '#8a5908', selectedBorder: '#4d3003' },
  philistia: { name: 'Philistia', color: '#a4634f', selectedBorder: '#563126' },
  egypt: { name: 'Egypt', color: '#4f8278', selectedBorder: '#285047' },
  cush: { name: 'Cush', color: '#7b5f8e', selectedBorder: '#45334f' },
  assyria: { name: 'Assyria', color: '#ae3924', selectedBorder: '#651d11' },
  babylonia: { name: 'Babylonia', color: '#783951', selectedBorder: '#431b2d' },
  persian: { name: 'Persia', color: '#694529', selectedBorder: '#3d2718' }
};
// A book can supply its own powers in data.factions. The built-in list stays the default.
function factionById(id) { return factions[id] || data.factions?.[id]; }
function factionFor(feature) { return factionById(feature.faction || feature.id) || { name: 'Place', color: '#594530', selectedBorder: '#34271b' }; }
let lastMapChapter;
let mapHome;
// Recenter shows only after the map leaves the chapter view.
function updateRecenter() {
  const button = $('#recenterMap');
  if (!button) return;
  if (!map || !mapHome) { button.hidden = true; return; }
  const zoom = map.getZoom(), offset = map.project(map.getCenter(), zoom).distanceTo(map.project(mapHome.center, zoom));
  button.hidden = Math.abs(zoom - mapHome.zoom) < .01 && offset < 2;
}
// A resize keeps the chapter view when the reader has not moved the map.
function keepChapterView() { if (mapHome && $('#recenterMap')?.hidden) focusChapterMap(false, true); }
function focusChapterMap(animate = true, keepCard = false) {
  if (!map) return;
  const focus = chapterFocus(data, state.chapter), points = chapterPoints(data, state.chapter);
  lastMapChapter = state.chapter;
  if (!points.length) { mapHome = null; updateRecenter(); return; }
  if (!keepCard) closeCard();
  map.stop();
  map.invalidateSize({pan:false});
  const size = map.getSize();
  const panel = $('.layers').getBoundingClientRect();
  const options = { maxZoom:focus.maxZoom || 10,
    paddingTopLeft:[Math.min(panel.width + 35, size.x * .5), 50],
    paddingBottomRight:[40,50], animate:animate && !reducedMapMotion.matches, duration:.8 };
  const bounds = L.latLngBounds(points).pad(.12), target = map._getBoundsCenterZoom?.(bounds, options);
  mapHome = target && { zoom:target.zoom, center:map._limitCenter(target.center, target.zoom, map.options.maxBounds) };
  map.fitBounds(bounds, options);
}
// A map event date shows its paths. A date without a drawn path shows its event chapter or milestone places.
function focusMapEventDate() {
  if (!map || !mapEventDates.includes(state.date)) return;
  const section = mapEvents.find(c => data.passages.find(p => Number(p.chapter) === c)?.year === state.date);
  const paths = state.layers.campaigns ? data.campaigns.filter(visibleAt) : [];
  const milestone = (milestones().find(e => Number(e.year) === state.date)?.placeIds || []).map(id => data.places.find(p => p.id === id)).filter(Boolean).map(p => [p.lat, p.lng]);
  const points = paths.length ? paths.flatMap(c => c.points) : section ? chapterPoints(data, section) : milestone;
  if (!points.length) return;
  map.stop();
  const panel = $('.layers').getBoundingClientRect(), size = map.getSize();
  map.fitBounds(L.latLngBounds(points).pad(.12), { maxZoom:9, paddingTopLeft:[Math.min(panel.width + 35, size.x * .5), 50], paddingBottomRight:[40,50], animate:!reducedMapMotion.matches, duration:.8 });
}
function focusedRoutes() { return chapterRoutes(data, state.chapter); }
function chapterAreas() { return (data.narrativeRegions || []).filter(r=>chapterFocus(data,state.chapter)?.placeIds.includes(r.placeId)); }
function chapterImpacts() {
  const focus = chapterFocus(data,state.chapter);
  return (focus?.impacts || []).map(item=>{
    const place = data.places.find(p=>p.id===item.placeId);
    return {...place,id:`impact:${state.chapter}:${item.placeId}`,impact:true,
      name:`${place.name.split(' · ')[0]} · destruction or distress`,
      reference:item.reference, summary:item.description, uncertainty:focus.limits, sourceIds:focus.sourceIds};
  });
}
function mapContextHtml(focus) {
  if (!book.mapLimits) return focus?.narrative ? `<details><summary>Map context</summary>${esc(focus.narrative)}</details>` : '';
  // Explain an empty map and show the location limits with the narrative.
  return `${!chapterPoints(data, state.chapter).length ? `<p>This ${unit()} has no mapped places.</p>` : ''}${focus?.narrative || focus?.limits ? `<details><summary>Map context</summary>${[focus.narrative, focus.limits].filter(Boolean).map(text => `<p>${esc(text)}</p>`).join('')}</details>` : ''}`;
}
function mapStoryHtml() {
  const routes = focusedRoutes();
  if (!routes.length) return '';
  return `<details class="chapter-movements"><summary>Paths and facts · ${routes.length}</summary>${routes.map(r=>{const evidence=mapDisplayText(r.evidence);return `<button class="story-route" data-action="story-route" data-id="${esc(r.id)}"><i style="background:${movementStyle(r).color}"></i><span>${esc(r.title)}<small>${esc(movementStyle(r).label)}${evidence ? ` · ${esc(evidence)}` : ''}</small></span></button>`;}).join('')}</details>`;
}
// Map mode follows the selected date only when the book has a date timeline.
function datedMap() { return !!book.timeline && state.studyMode === 'map'; }
function displayedCampaigns() {
  return datedMap() ? data.campaigns.filter(visibleAt) : focusedRoutes();
}
function chapterPlaceVisible(p) { return !p.chapterLocation || chapterFocus(data, state.chapter)?.placeIds.includes(p.id); }
// The stops of each path on the map. A `routeOnly` place shows only as a stop.
function routeStopIds() { return new Set(state.layers.campaigns ? displayedCampaigns().flatMap(c => c.placeIds || []) : []); }
function placeShown(p, stops) { return p.routeOnly ? stops.has(p.id) : stops.has(p.id) || (datedMap() ? visibleAt(p) : chapterPlaceVisible(p)); }
function placeMentionedInChapter(place) { return !!placeVerseInChapter(place, state.chapter); }
// One style for each place dot. The map markers and the layer panel icons both use it.
function placeDotStyle({ active = false, relevant = false, mentioned = true } = {}) {
  return { radius: active ? 8 : relevant ? 6.5 : 4, color: active ? '#fff' : '#fff4dc', weight: active ? 3 : 2, fillColor: active || relevant ? '#0877c4' : '#594530', fillOpacity: mentioned ? 1 : .72 };
}
function placeDotSvg(options) {
  // Leaflet rounds a circle marker's radius, so the icon does too.
  const s = placeDotStyle(options), r = Math.max(Math.round(s.radius), 1), size = 2 * r + s.weight, c = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><circle cx="${c}" cy="${c}" r="${r}" stroke="${s.color}" stroke-width="${s.weight}" fill="${s.fillColor}" fill-opacity="${s.fillOpacity}"/></svg>`;
}
function regionMentionedInChapter(region) {
  const text = (scripture.chapters[state.chapter] || []).map(verse => verse.text).join(' ');
  const patterns = {
    judah: /\bJudah\b/i,
    philistia: /\bPhilist(?:ia|ines?)\b/i,
    'egypt-region': /\bEgypt(?:ian|ians)?\b/i,
    'cush-region': /\b(?:Cush|Ethiopia|Tirhakah)\b/i,
    assyria: /\bAssyria(?:n|ns)?\b/i,
    'babylonia-early': /\bBabylon(?:ia|ian|ians)?\b/i,
    babylonia: /\bBabylon(?:ia|ian|ians)?\b/i,
    persian: /\b(?:Persia|Persian|Cyrus)\b/i
  };
  return (region.pattern ? new RegExp(region.pattern, 'i') : patterns[region.id])?.test(text) || false;
}
function drawOverlays() {
  if (!map) return;
  const wanted = new Set();
  const feature = (key, create, info) => {
    wanted.add(key);
    return keepMapFeature(mapFeatures, key, () => {
      const layer = create().addTo(map);
      if (info) bindFeature(layer, info);
      return layer;
    });
  };
  const current = findFeature($('#contextCard').dataset.feature);
  if (current && !visibleAt(current)) hideModalPanel($('#contextCard'));
  const regions = state.layers.history ? data.regions.filter(region => visibleAt(region) && (datedMap() || !region.chapterCoverage || region.chapterCoverage.includes(state.chapter))) : [];
  if (state.layers.regions && state.studyMode === 'read') chapterAreas().forEach(r => {
    feature(r.id,()=>L.polygon(r.points,{pane:'areas',color:'#79501b',weight:2.5,dashArray:'6 4',fillColor:'#d39a48',fillOpacity:.32,className:'chapter-area'}),r);
  });
  const campaigns = state.layers.campaigns ? displayedCampaigns() : [];
  const roads = state.layers.roads ? data.ancientRoads : [];
  regions.forEach(r => {
    const color = factionFor(r).color;
    const mentioned = regionMentionedInChapter(r);
    const layer = feature(`region:${r.id}`, () => L.polygon(r.points, { pane:'areas', color, weight: mentioned ? 2.75 : 1.5, dashArray: mentioned ? '6 4' : '3 6', fillColor: color, fillOpacity: mentioned ? .3 : .13, className: 'region-overlay' }), r);
    layer.setStyle({weight:mentioned ? 2.75 : 1.5,dashArray:mentioned ? '6 4' : '3 6',fillOpacity:mentioned ? .3 : .13});
    layer.getElement()?.classList.toggle('chapter-relevant-region', mentioned);
  });
  roads.forEach(road => {
    const dash = road.confidence === 'probable' ? '7 7' : null;
    feature(`road:${road.id}`, () => L.polyline(road.points, {pane:'roads',color:'#e1d6b8',weight:2.25,opacity:.58,dashArray:dash,interactive:false,className:'ancient-road-overlay'}));
    feature(`road-hit:${road.id}`, () => L.polyline(road.points, {pane:'roads',color:'#e1d6b8',weight:18,opacity:0,className:'ancient-road-hit'}), road);
  });
  campaigns.forEach(c => {
    const style = movementStyle(c), color = c.chapterRoute || (c.kind && !c.faction) ? style.color : factionFor(c).color;
    // Keep every enabled route readable before hover or selection.
    feature(`campaign:${c.id}`, () => L.polyline(c.points, { pane:'routes', color, weight: c.chapterRoute && !c.contextRoute ? 5 : 3.5, opacity: 1, dashArray: c.chapterRoute ? style.dash : '10 7', interactive: false, className: 'campaign-overlay' }));
    feature(`hit:${c.id}`, () => L.polyline(c.points, {pane:'routes', color, weight:22, opacity:0, className:'campaign-hit'}), c);
  });
  const stops = routeStopIds();
  if (state.layers.places) data.places.filter(p => placeShown(p, stops)).forEach(p => {
    const mentioned = placeMentionedInChapter(p);
    const style = placeDotStyle({ relevant: chapterFocus(data, state.chapter)?.focusPlaceIds.includes(p.id), mentioned });
    const layer = feature(`place:${p.id}`, () => L.circleMarker([p.lat,p.lng], {pane:'places', ...style}), p);
    layer.setRadius(style.radius);
    layer.setStyle(style);
    layer.getElement()?.classList.toggle('chapter-relevant-place', mentioned);
  });
  if (state.layers.places && state.studyMode === 'read') chapterImpacts().forEach(p => {
    feature(p.id,()=>L.circleMarker([p.lat,p.lng],{pane:'impacts',radius:11,color:'#b52e26',weight:2.5,fillColor:'#c43c32',fillOpacity:.16,className:'chapter-impact'}),p);
  });
  retireMapFeatures(mapFeatures, wanted);
  const active = [...new Set([...regions, ...campaigns].map(f => f.faction || f.id))].filter(id => factionById(id));
  $('#factionLegend').innerHTML = active.map(id => factionById(id) ? '<span><i style="background:' + factionById(id).color + '"></i>' + esc(factionById(id).name) + '</span>' : '').join('');
  $('#factionLegend').hidden = !active.length;
  const focus = chapterFocus(data, state.chapter);
  const kinds = [...new Set(campaigns.filter(c=>c.chapterRoute).map(c=>c.kind))];
  const roadKey = roads.length ? '<div class="road-key"><span><i></i>Well-supported route</span><span><i class="probable"></i>Probable route</span></div>' : '';
  $('.map-note').innerHTML = `<div class="movement-legend">${kinds.map(kind=>{const s=movementStyle({kind});return `<span><i style="background:${s.color}"></i>${s.label}</span>`;}).join('')}${focus?.impacts?.length && state.layers.places ? '<span><i class="impact-key"></i>Destruction / distress</span>' : ''}</div>${roadKey}${mapContextHtml(focus)}`;
  refreshMapDetails();
}
function refreshMapDetails() {
  if (!map) return;
  const wanted = new Set();
  if (state.layers.campaigns) displayedCampaigns().filter(c => c.direction !== false).forEach(c => {
    // Work in screen pixels so arrows stay readable at every zoom level.
    const points = c.points.map(p => map.latLngToContainerPoint(p));
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i], dx = b.x-a.x, dy = b.y-a.y;
      const length = Math.hypot(dx,dy);
      if (length < 18) continue;
      const count = Math.max(1, Math.floor(length / 85));
      for (let j = 0; j < count; j++) {
        const t = (j + .65) / count, x = a.x + dx*t, y = a.y + dy*t;
        if (x < -15 || y < -15 || x > map.getSize().x+15 || y > map.getSize().y+15) continue;
        const angle = Math.atan2(dy,dx)*180/Math.PI;
        const key = `${c.id}:${i}:${j}`;
        wanted.add(key);
        const latlng = map.containerPointToLatLng([x,y]);
        const entering = !arrowFeatures.has(key);
        const arrow = keepMapFeature(arrowFeatures, key, () => L.marker(latlng, {interactive:false, keyboard:false, icon:L.divIcon({className:'route-arrow', iconSize:[18,18], iconAnchor:[9,9], html:'<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3 L14 9 L3 15 L6 9 Z" fill="' + (c.chapterRoute || (c.kind && !c.faction) ? movementStyle(c).color : factionFor(c).color) + '" stroke="#fff0d5" stroke-width="1.2"/></svg>'})}).addTo(map));
        arrow.setLatLng(latlng);
        const svg = arrow.getElement().firstElementChild;
        svg.style.opacity = '1';
        svg.style.transform = `rotate(${angle}deg)`;
        if (entering && !reducedMapMotion.matches && svg.animate) {
          svg.animate([
            {opacity:0, transform:`rotate(${angle}deg) translateX(-24px)`},
            {opacity:1, transform:`rotate(${angle}deg) translateX(0)`}
          ], {duration:650, delay:300 * (i - 1 + t) / (points.length - 1), fill:'backwards', easing:'cubic-bezier(.22,.61,.36,1)'});
        }
      }
    }
  });
  retireMapFeatures(arrowFeatures, wanted);
  layoutPlaceLabels();
  layoutGeographyLabels();
  syncMapSelection();
}
function placePriority(place) {
  const focus = chapterFocus(data, state.chapter);
  if (focus?.focusPlaceIds.includes(place.id)) return 120;
  if (focus?.placeIds.includes(place.id)) return 100;
  const passage = activePassage();
  if (isPassageDate() && passage?.placeIds?.includes(place.id)) return 100;
  if (data.events.some(e => Math.abs(e.year-state.date) <= 6 && e.placeIds?.includes(place.id))) return 80;
  if (isPassageDate() && data.passages.some(p => p.chapter === state.chapter && p.placeIds?.includes(place.id))) return 60;
  return 0;
}
function layoutPlaceLabels() {
  const wanted = new Set();
  if (!state.layers.places) { retireMapFeatures(labelFeatures, wanted); return; }
  const size = map.getSize(), zoom = map.getZoom();
  if (!size.x || !size.y) return;
  const occupied = [];
  const mapRect = map.getContainer().getBoundingClientRect();
  // Reserve room for controls as well as other labels and city dots.
  $$('.layers, .leaflet-control').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) occupied.push({x:r.left-mapRect.left-5,y:r.top-mapRect.top-5,w:r.width+10,h:r.height+10});
  });
  const stops = routeStopIds();
  const places = data.places.filter(p => placeShown(p, stops)).map(p => ({p, point:map.latLngToContainerPoint([p.lat,p.lng]), priority:placePriority(p) || (stops.has(p.id) ? 70 : 0)}));
  places.forEach(({p,point}) => occupied.push({id:p.id,x:point.x-6,y:point.y-6,w:12,h:12}));
  const collides = (r, id) => occupied.some(b => b.id !== id && r.x < b.x+b.w && r.x+r.w > b.x && r.y < b.y+b.h && r.y+r.h > b.y);
  places.sort((a,b) => b.priority-a.priority || a.p.name.localeCompare(b.p.name)).forEach(({p,point,priority}) => {
    if (!priority && zoom < 7) return;
    if (point.x < 0 || point.y < 0 || point.x > size.x || point.y > size.y) return;
    const existing = labelFeatures.get(p.id);
    const label = existing?.layer || leafletLabel([p.lat,p.lng], mapDisplayName(p.name), 'city-label', p);
    const el = label.getElement();
    const mentioned = placeMentionedInChapter(p);
    el.classList.toggle('relevant-label', mentioned);
    el.classList.toggle('context-label', !mentioned);
    const text = el.firstElementChild;
    const w = text.offsetWidth, h = text.offsetHeight;
    const gap = priority ? 3 : Math.max(4, 20-(zoom-7)*7);
    const offset = 8 + gap;
    const offsets = [[offset,-h/2],[-w-offset,-h/2],[offset-4,-h-offset+2],[offset-4,offset-2],[-w/2,-h-offset],[-w/2,offset]];
    const target = x => ({left:Math.min(-16,x), right:Math.max(16,x+w)});
    const fit = offsets.find(([x,y]) => {
      const hit = target(x);
      const r = {x:point.x+hit.left-gap,y:point.y+y-gap,w:hit.right-hit.left+gap*2,h:h+gap*2};
      return r.x >= 4 && r.y >= 4 && r.x+r.w <= size.x-4 && r.y+r.h <= size.y-4 && !collides(r,p.id);
    });
    if (!fit) { if (!existing) map.removeLayer(label); return; }
    const hit = target(fit[0]);
    el.style.width = hit.right-hit.left + 'px';
    text.style.marginLeft = fit[0]-hit.left + 'px';
    el.style.height = h + 'px';
    el.style.marginLeft = hit.left + 'px';
    el.style.marginTop = fit[1] + 'px';
    occupied.push({x:point.x+hit.left-gap,y:point.y+fit[1]-gap,w:hit.right-hit.left+2*gap,h:h+2*gap});
    wanted.add(p.id);
    keepMapFeature(labelFeatures, p.id, () => label);
  });
  retireMapFeatures(labelFeatures, wanted);
}
function syncMapSelection() {
  const card = $('#contextCard');
  const selected = !card.classList.contains('hidden') && card.dataset.pinned === 'true' ? card.dataset.feature : null;
  for (const region of data.regions) {
    const active = region.id === selected;
    const layer = mapFeatures.get(`region:${region.id}`)?.layer;
    const faction = factionFor(region);
    const mentioned = regionMentionedInChapter(region);
    layer?.setStyle({
      color:active ? faction.selectedBorder : faction.color,
      weight:active ? 3.5 : mentioned ? 2.75 : 1.5,
      dashArray:active ? null : mentioned ? '6 4' : '3 6',
      fillOpacity:active ? .45 : mentioned ? .3 : .13
    });
    const el = layer?.getElement();
    el?.style.setProperty('--selected-region-border', faction.selectedBorder);
    el?.classList.toggle('selected-region', active);
    el?.setAttribute('aria-pressed', String(active));
  }
  for (const place of data.places) {
    const active = place.id === selected;
    const relevant = chapterFocus(data, state.chapter)?.focusPlaceIds.includes(place.id);
    const marker = mapFeatures.get(`place:${place.id}`)?.layer;
    marker?.getElement()?.setAttribute('tabindex', labelFeatures.get(place.id)?.visible ? '-1' : '0');
    const style = placeDotStyle({ active, relevant, mentioned: placeMentionedInChapter(place) });
    marker?.setRadius(style.radius);
    marker?.setStyle(style);
    for (const layer of [marker, labelFeatures.get(place.id)?.layer]) {
      const el = layer?.getElement();
      el?.classList.toggle('selected-place', active);
      el?.setAttribute('aria-pressed', String(active));
    }
  }
  for (const road of data.ancientRoads) {
    const active = road.id === selected;
    mapFeatures.get(`road:${road.id}`)?.layer.setStyle({color:'#e1d6b8',weight:active ? 4 : 2.25,opacity:active ? .92 : .58});
    mapFeatures.get(`road-hit:${road.id}`)?.layer.getElement()?.setAttribute('aria-pressed', String(active));
  }
}
function leafletLabel(latlng, label, className, feature) {
  const layer = L.marker(latlng, { interactive:!!feature, keyboard:false, icon: L.divIcon({ className: `map-text ${className}`, html: '<span>' + esc(label) + '</span>', iconSize: [0,0], iconAnchor: [0,0] }) }).addTo(map);
  if (feature) bindFeature(layer, feature);
  return layer;
}
function bindFeature(layer, feature) {
  layer.on({ click(e) { openFeature(feature, true, e.target); } });
  const el = layer.getElement?.();
  if (!el) return;
  el.classList.add('map-feature');
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${featureType(feature)}: ${feature.title || feature.name}`);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFeature(feature, true, layer);
    }
  });
}
function isLdsSource(s) { const ldsIds = new Set(data.passages.flatMap(p => p.lds?.sourceIds || [])); return ldsIds.has(s.id) || /faith|lds|church|devotional/i.test(s.type || ''); }
function librarySourceHtml(s) {
  const moments = (s.timestamps || []).map(moment => {
    const url = new URL(moment.url || s.url);
    if (!moment.url) url.searchParams.set('t', `${moment.seconds}s`);
    return `<a class="source-link" target="_blank" rel="noopener" href="${esc(url.href)}">${esc(moment.label)} ↗</a>`;
  }).join('');
  const cited = (s.citedSourceIds || []).map(id => source(id)).filter(Boolean);
  const scriptureRefs = (s.scriptureReferences || []).map(ref => `<p><a target="_blank" rel="noopener" href="${esc(ref.url)}">${esc(ref.label)} ↗</a> · <a target="_blank" rel="noopener" href="${esc(ref.contextUrl)}">${esc(ref.location)} in talk ↗</a></p>`).join('');
  return `<article class="library-source" id="library-${esc(s.id)}"><a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.title)} ↗</a><p>${esc(s.author || '')}${s.year ? ` · ${esc(s.year)}` : ''} · ${esc(s.type || 'Source')}</p>${sourceImageHtml(s.image)}${sourceMediaHtml([s.id], {images:false, allExcerpts:true})}<p><span class="badge">About this source</span> ${esc(s.summary || '')}</p>${scriptureRefs ? `<details><summary>${esc(book.name)} links</summary>${scriptureRefs}</details>` : ''}${moments ? `<details><summary>Video parts</summary>${moments}</details>` : ''}${cited.length ? `<details><summary>Sources used</summary>${cited.map(item => `<a class="source-link" href="${esc(item.url)}" data-source-id="${esc(item.id)}">${esc(item.title)} · Read source note</a>`).join('')}</details>` : ''}${s.revisionUrl ? `<p><a href="${esc(s.revisionUrl)}" target="_blank" rel="noopener">Wikipedia page we checked ↗</a> · <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a> · We made the notes shorter.</p>` : ''}${s.reviewed ? `<p><span class="badge">What we checked</span> ${esc(typeof s.reviewed === 'string' ? s.reviewed : [s.reviewed.date, s.reviewed.scope].filter(Boolean).join(': '))}</p>` : ''}${s.limitations ? `<p><span class="badge">What this cannot show</span> ${esc(s.limitations)}</p>` : ''}</article>`;
}
function openLibrary() {
  const list = state.perspective === 'historical' ? data.sources.filter(s => !isLdsSource(s)) : data.sources;
  const additions = list.filter(s => s.group === 'mcclellan');
  const conference = list.filter(s => s.group === 'conference-year');
  // Group titles and notes come from the book's data.
  const group = id => data.sourceGroups?.find(item => item.id === id) || {};
  const publicGroups = (data.sourceGroups || []).filter(item => !['mcclellan', 'conference-year'].includes(item.id)).map(item => [item.id, item.title, item.description]);
  const publicHtml = publicGroups.map(([group, title, description]) => {
    const entries = list.filter(s => s.group === group);
    return entries.length ? `<section aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${esc(description)}</p>${entries.map(librarySourceHtml).join('')}</section>` : '';
  }).join('');
  const other = list.filter(s => !['mcclellan', 'conference-year', ...publicGroups.map(([group]) => group)].includes(s.group));
  const conferenceHtml = conference.length ? `<section aria-label="Recent general conference"><h3>General conference · past year</h3>${(group('conference-year').description || []).map(text => `<p>${esc(text.replace('{count}', conference.length))}</p>`).join('')}${(group('conference-year').parts || []).map(month => { const talks = conference.filter(s => s.conference === month); return `<details><summary>${month} · ${talks.length} talks</summary>${talks.map(librarySourceHtml).join('')}</details>`; }).join('')}</section>` : '';
  const modeNotice = state.perspective === 'historical' ? 'This mode shows history sources. Select LDS to add Church sources.' : 'This mode shows history sources and Church sources.';
  $('#libraryContent').innerHTML = `<h2>Source library</h2><p class="translation">${modeNotice}</p>${publicHtml}${conferenceHtml}${additions.length ? `<section aria-label="Dan McClellan and cited scholarship"><h3>Dan McClellan and his sources</h3><p>${esc(group('mcclellan').description || 'These notes link to relevant McClellan material. Each note states what we reviewed and what remains unverified.')}</p>${additions.map(librarySourceHtml).join('')}</section><h3>Other study sources</h3>` : ''}${other.map(librarySourceHtml).join('') || (additions.length || conference.length ? '' : '<p>No sources are available for this study mode.</p>')}`;
  // Scroll inside the dialog without replacing the app's chapter/verse URL state.
  $('#libraryContent').querySelectorAll('a[href^="#library-"]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = document.getElementById(link.getAttribute('href').slice(1));
    target?.scrollIntoView({block:'start'});
    target?.querySelector('a')?.focus({preventScroll:true});
  }));
  openStudyModal('libraryDialog');
  $('#libraryDialog').scrollTop = 0;
}
function renderGuides() { const drawer = $('#tourDrawer'); openStudyModal('tourDrawer'); if (!guideState) { drawer.innerHTML = `<button class="dialog-close" data-action="close-guides" aria-label="Close guides">×</button><span class="eyebrow">Study guides</span>${passageInterpretationHtml()}<h2>Choose a study guide</h2>${data.guides.map(g => `<button class="tour-choice" data-action="guide" data-id="${esc(g.id)}"><b>${esc(g.title)}</b><span>${esc(g.description || '')}</span></button>`).join('') || '<p>No study guides are available.</p>'}`; } else renderGuideStep(); drawer.scrollTop = 0; }
function startGuide(id) { const guide = data.guides.find(g => g.id === id); if (!guide?.steps?.length) { showToast('This study guide has no steps yet.'); return; } guideState = { id, index: 0 }; openStudyModal('tourDrawer'); applyGuideStep(); }
function applyGuideStep() { const guide = data.guides.find(g => g.id === guideState?.id); const step = guide?.steps?.[guideState.index]; if (!step) return; state.chapter = Number(step.chapter || state.chapter); state.verse = Number(step.verse || state.verse); state.sidebar = 'scripture'; if (step.year != null) state.date = Number(step.year); renderAll(); renderGuideStep(); focusChapterMap(); requestAnimationFrame(() => scrollVerse(state.verse,false)); persist(); }
function sourceImageHtml(image) {
  if (!image) return '';
  return `<figure class="guide-image"><a href="${esc(image.fullUrl || image.src)}" target="_blank" rel="noopener" aria-label="${esc(image.linkLabel || 'View full-size image')}"><picture>${webpSourceHtml(image.src)}<img src="${esc(image.src)}" alt="${esc(image.alt)}" width="${Number(image.width)}" height="${Number(image.height)}" loading="lazy" decoding="async"></picture></a><figcaption>${esc(image.caption)}<br><a href="${esc(image.fullUrl || image.src)}" target="_blank" rel="noopener">${esc(image.linkLabel || 'View full-size image')} ↗</a><small><a href="${esc(image.creditUrl)}" target="_blank" rel="noopener">${esc(image.credit)}</a> · <a href="${esc(image.licenseUrl)}" target="_blank" rel="noopener">${esc(image.license)}</a> · <a href="${esc(image.sourceUrl)}" target="_blank" rel="noopener">Photo source ↗</a></small></figcaption></figure>`;
}
function guideReadingHtml(step) {
  const verses = (scripture.chapters[step.chapter] || []).filter(v => v.verse === Number(step.verse));
  const reading = verses.length ? `<section class="guide-reading"><h3>${esc(book.name)} ${Number(step.chapter)}:${Number(step.verse)}</h3><blockquote>${verses.map(v => esc(v.text)).join(' ')}</blockquote><a class="source-link" href="${publisherChapter(step.chapter)}" target="_blank" rel="noopener">Read full ${unit()} ↗</a><small>${esc(scriptureCredit())}</small></section>` : '';
  const words = (step.wordIds || []).map(id => data.words.find(w => w.id === id)).filter(Boolean);
  return reading + words.map(w => `<section class="guide-reading"><h3>${esc(w.label)}</h3><p>${esc(w.meaning)}</p><p>${esc(w.discussion)}</p>${sourcesHtml(w.sourceIds)}</section>`).join('');
}
function renderGuideStep() { const guide = data.guides.find(g => g.id === guideState?.id); const step = guide?.steps?.[guideState.index]; if (!guide || !step) { guideState = null; return renderGuides(); } const extraSources = (step.sourceIds || []).filter(id => !/^web(?:\d+)?$/.test(id)); const sourceHtml = extraSources.length ? sourcesHtml(extraSources) : ''; $('#tourDrawer').innerHTML = `<button class="dialog-close" data-action="close-guides" aria-label="Close guide">×</button><button class="back-button guide-back" data-action="guide-list">← Back to guide list</button><p class="tour-progress">${esc(guide.title)} · Step ${guideState.index + 1} of ${guide.steps.length}</p><h2>${esc(step.title)}</h2><p>${richText(step.text || '')}</p>${sourceInsightsHtml(step.sourceIds, step.chapter)}${guideReadingHtml(step)}${sourceHtml ? `<div class="word-section"><h3>Sources</h3>${sourceHtml}</div>` : ''}${passageInterpretationHtml()}<div class="tour-nav"><button data-action="guide-prev" ${guideState.index === 0 ? 'disabled' : ''}>← Previous</button><button data-action="guide-next">${guideState.index === guide.steps.length - 1 ? 'Finish' : 'Next →'}</button></div>`; $('#tourDrawer').scrollTop = 0; }
function moveGuide(direction) { const guide = data.guides.find(g => g.id === guideState?.id); if (!guide) return; const next = guideState.index + direction; if (next < 0) return; if (next >= guide.steps.length) { showToast(`${guide.title} complete. You can continue your study.`); guideState = null; hideModalPanel($('#tourDrawer')); return; } guideState.index = next; applyGuideStep(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
$('#layerToggle').dataset.action = 'toggle-layers'; $('#libraryButton').dataset.action = 'library'; $('#returnPassage').dataset.action = 'return-passage';
load();

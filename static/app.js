// Palm-leaf annotator frontend. All box coordinates are ORIGINAL IMAGE PIXELS;
// the view {s,ox,oy} converts them to screen pixels only when drawing / hit-testing.
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const MIN = 8, HR = 6;                                   // min box size, handle hit radius
const HANDLES = [['nw',0,0],['n',.5,0],['ne',1,0],['e',1,.5],['se',1,1],['s',.5,1],['sw',0,1],['w',0,.5]];
const CUR = {nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize'};

let img = null, W = 0, H = 0, name = '', file = null;
let boxes = [], nextId = 1, sel = null, labels = [];
let view = {s: 1, ox: 0, oy: 0}, mode = 'select', drag = null, space = false, thr = 0;
let undo = [], redo = [], dirty = false, raf = 0, pickFor = null, hi = 0, items = [];
let hovered = null;   // id of box currently under the mouse — drives hover tooltip

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const get = id => boxes.find(b => b.id === id);
const visible = b => b.source !== 'model' || b.conf == null || b.conf >= thr;
// color by LABEL  → used for hover tooltip pill
const color = l => { if (!l) return '#777'; let h = 0; for (const c of l) h = (h * 31 + c.codePointAt(0)) % 360; return `hsl(${h},70%,52%)`; };
// color by BOX ID → unique per box so overlaps are always distinguishable
const colorById = id => { const h = (id * 137.508) % 360; return `hsl(${h},80%,58%)`; };
const toImg = (sx, sy) => ({x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s});
const sbox = b => [b.x * view.s + view.ox, b.y * view.s + view.oy, b.w * view.s, b.h * view.s];
const sortLabels = arr => [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));  // stable Unicode order

// ── Tamil ↔ English transliteration map for search ──
const TAMIL_TRANSLIT = {
  // Vowels (உயிர்)
  'அ': ['a'],
  'ஆ': ['aa', 'A'],
  'இ': ['i'],
  'ஈ': ['ee', 'ii', 'I'],
  'உ': ['u'],
  'ஊ': ['oo', 'uu', 'U'],
  'எ': ['e'],
  'ஏ': ['ae', 'E'],
  'ஐ': ['ai'],
  'ஒ': ['o'],
  'ஓ': ['oa', 'O'],
  'ஔ': ['au', 'ou'],
  'ஃ': ['ak', 'akh', 'aytham'],
  // Pure consonants (மெய்)
  'க்': ['k'],
  'ங்': ['ng'],
  'ச்': ['ch', 's'],
  'ஞ்': ['nj', 'ny', 'gn'],
  'ட்': ['tt', 'T'],
  'ண்': ['nn', 'N'],
  'த்': ['th', 'dh'],
  'ந்': ['nh', 'nd'],
  'ப்': ['p'],
  'ம்': ['m'],
  'ய்': ['y'],
  'ர்': ['r'],
  'ல்': ['l'],
  'வ்': ['v', 'w'],
  'ழ்': ['zh', 'zhl'],
  'ள்': ['L', 'll'],
  'ற்': ['R', 'tr', 'dr'],
  'ன்': ['n'],
  // Consonant+a (உயிர்மெய் - inherent 'a')
  'க': ['ka', 'ga'],
  'ங': ['nga'],
  'ச': ['cha', 'sa'],
  'ஞ': ['nja', 'nya', 'gna'],
  'ட': ['ta', 'da', 'Ta'],
  'ண': ['na', 'Na', 'nna'],
  'த': ['tha', 'dha'],
  'ந': ['na', 'nha'],
  'ப': ['pa', 'ba'],
  'ம': ['ma'],
  'ய': ['ya'],
  'ர': ['ra'],
  'ல': ['la'],
  'வ': ['va', 'wa'],
  'ழ': ['zha'],
  'ள': ['La', 'lla'],
  'ற': ['Ra', 'tra', 'dra'],
  'ன': ['na', 'nna'],
  // Consonant+aa
  'கா': ['kaa', 'gaa'],
  'ா': ['aa'],   // vowel sign aa
  // Consonant+i
  'கி': ['ki', 'gi'],
  'சி': ['chi', 'si'],
  'டி': ['ti', 'di', 'Ti'],
  'ணி': ['ni', 'Ni', 'nni'],
  'தி': ['thi', 'dhi'],
  'நி': ['ni', 'nhi'],
  'பி': ['pi', 'bi'],
  'மி': ['mi'],
  'யி': ['yi'],
  'ரி': ['ri'],
  'லி': ['li'],
  'வி': ['vi', 'wi'],
  'ழி': ['zhi'],
  'ளி': ['Li', 'lli'],
  'றி': ['Ri', 'tri', 'dri'],
  'னி': ['ni'],
  'ஙி': ['ngi'],
  'ஞி': ['nji', 'nyi'],
  // Consonant+ii
  'கீ': ['kee', 'kii'],
  'சீ': ['chee', 'see', 'sii'],
  'டீ': ['tee', 'dee', 'Tii'],
  'ணீ': ['nee', 'Nii', 'nnee'],
  'தீ': ['thee', 'dhee', 'thii'],
  'நீ': ['nee', 'nhee'],
  'பீ': ['pee', 'bee', 'pii'],
  'மீ': ['mee', 'mii'],
  'யீ': ['yee', 'yii'],
  'ரீ': ['ree', 'rii'],
  'லீ': ['lee', 'lii'],
  'வீ': ['vee', 'wee', 'vii'],
  'ழீ': ['zhee', 'zhii'],
  'ளீ': ['Lee', 'llee', 'Lii'],
  'றீ': ['Ree', 'tree', 'Rii'],
  'னீ': ['nee', 'nii'],
  'ஙீ': ['ngee', 'ngii'],
  'ஞீ': ['njee', 'nyee'],
  // Consonant+u
  'கு': ['ku', 'gu'],
  'சு': ['chu', 'su'],
  'டு': ['tu', 'du', 'Tu'],
  'ணு': ['nu', 'Nu', 'nnu'],
  'து': ['thu', 'dhu'],
  'நு': ['nu', 'nhu'],
  'பு': ['pu', 'bu'],
  'மு': ['mu'],
  'யு': ['yu'],
  'ரு': ['ru'],
  'லு': ['lu'],
  'வு': ['vu', 'wu'],
  'ழு': ['zhu'],
  'ளு': ['Lu', 'llu'],
  'று': ['Ru', 'tru', 'dru'],
  'னு': ['nu'],
  'ஙு': ['ngu'],
  'ஞு': ['nju', 'nyu'],
  // Consonant+uu
  'கூ': ['koo', 'kuu', 'goo'],
  'சூ': ['choo', 'soo', 'suu'],
  'டூ': ['too', 'doo', 'Tuu'],
  'ணூ': ['noo', 'Nuu', 'nnoo'],
  'தூ': ['thoo', 'dhoo', 'thuu'],
  'நூ': ['noo', 'nhoo', 'nuu'],
  'பூ': ['poo', 'boo', 'puu'],
  'மூ': ['moo', 'muu'],
  'யூ': ['yoo', 'yuu'],
  'ரூ': ['roo', 'ruu'],
  'லூ': ['loo', 'luu'],
  'வூ': ['voo', 'woo', 'vuu'],
  'ழூ': ['zhoo', 'zhuu'],
  'ளூ': ['Loo', 'lloo', 'Luu'],
  'றூ': ['Roo', 'troo', 'Ruu'],
  'னூ': ['noo', 'nuu'],
  'ஙூ': ['ngoo', 'nguu'],
  'ஞூ': ['njoo', 'nyoo', 'njuu'],
  // Vowel signs (standing alone as labels)
  'ெ': ['e', 'short-e'],
  'ே': ['ee', 'ae', 'long-e'],
  'ை': ['ai'],
  // Tamil numerals
  '௧': ['1', 'one'],
  '௨': ['2', 'two'],
  '௩': ['3', 'three'],
  '௪': ['4', 'four'],
  '௫': ['5', 'five'],
  '௬': ['6', 'six'],
  '௭': ['7', 'seven'],
  '௮': ['8', 'eight'],
  '௯': ['9', 'nine'],
  '௰': ['10', 'ten'],
};

// Build reverse index: English term → list of Tamil labels that match
const _translitIndex = {};
for (const [tamil, romanList] of Object.entries(TAMIL_TRANSLIT)) {
  for (const rom of romanList) {
    const key = rom.toLowerCase();
    (_translitIndex[key] = _translitIndex[key] || []).push(tamil);
  }
}

/** Check if a Tamil label matches an English query via transliteration */
function matchesTranslit(label, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  // Direct substring match on the label itself
  if (label.toLowerCase().includes(q)) return true;
  // Check if any transliteration of this label starts with / includes the query
  const romanForms = TAMIL_TRANSLIT[label];
  if (romanForms) {
    for (const r of romanForms) {
      if (r.toLowerCase().includes(q)) return true;
    }
  }
  // Check partial: see if query is a prefix of any known English key whose Tamil chars appear in the label
  for (const [key, tamilList] of Object.entries(_translitIndex)) {
    if (key.includes(q)) {
      for (const t of tamilList) {
        if (label.includes(t)) return true;
      }
    }
  }
  return false;
}

function toast(msg, err) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.className = '', err ? 6000 : 3000);
}
async function api(url, opts) {
  let r; try { r = await fetch(url, opts); } catch { throw new Error('Cannot reach the server. Is uvicorn running?'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'Server error ' + r.status);
  return j;
}

// ---------------------------------------------------------------- undo / redo
const snap = () => JSON.stringify({boxes, nextId});
function pushUndo() { undo.push(snap()); if (undo.length > 300) undo.shift(); redo = []; dirty = true; }
function restore(s) { const o = JSON.parse(s); boxes = o.boxes; nextId = o.nextId; if (!get(sel)) sel = null; dirty = true; refresh(); }
function doUndo() { if (undo.length) { redo.push(snap()); restore(undo.pop()); } }
function doRedo() { if (redo.length) { undo.push(snap()); restore(redo.pop()); } }

// ---------------------------------------------------------------- box edits
const markEdited = b => { if (b.source === 'model') b.source = 'edited'; };
function select(id) { sel = id; refresh(); const r = document.querySelector('.row.sel'); if (r) r.scrollIntoView({block: 'nearest'}); }
function delSel() { if (sel == null) return; pushUndo(); boxes = boxes.filter(b => b.id !== sel); sel = null; refresh(); }
function nudge(dx, dy) {
  const b = get(sel); if (!b) return; pushUndo();
  b.x = clamp(b.x + dx, 0, W - b.w); b.y = clamp(b.y + dy, 0, H - b.h); markEdited(b); refresh();
}
function setLabel(id, l) { const b = get(id); if (!b) return; pushUndo(); b.label = l; markEdited(b); refresh(); }

// ---------------------------------------------------------------- view
function clampView() {
  const cw = cv.clientWidth, ch = cv.clientHeight, iw = W * view.s, ih = H * view.s;
  view.ox = iw <= cw ? (cw - iw) / 2 : clamp(view.ox, cw - iw, 0);
  view.oy = ih <= ch ? (ch - ih) / 2 : clamp(view.oy, ch - ih, 0);
}
function fit() { view.s = clamp(cv.clientHeight / H * 0.95, 0.05, 12); view.ox = 0; view.oy = 0; redraw(); }
function centerOn(b) { view.ox = cv.clientWidth / 2 - (b.x + b.w / 2) * view.s; redraw(); }
$('hs').oninput = e => { view.ox = -e.target.value / 1000 * Math.max(0, W * view.s - cv.clientWidth); redraw(); };
$('hs').onchange = e => e.target.blur();

// Returns intersection / area-of-smaller-box (0..1)
function overlapRatio(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter === 0) return 0;
  return inter / Math.min(a.w * a.h, b.w * b.h);
}

// ---------------------------------------------------------------- drawing
function redraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function draw() {
  const dpr = devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
  if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
  if (!img) return;
  clampView();
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Pre-compute which boxes have heavy overlap (>75%) with any other visible box
  const visBoxes = boxes.filter(visible);
  const heavyOverlap = new Set();
  for (let i = 0; i < visBoxes.length; i++)
    for (let j = i + 1; j < visBoxes.length; j++)
      if (overlapRatio(visBoxes[i], visBoxes[j]) > 0.75) {
        heavyOverlap.add(visBoxes[i].id);
        heavyOverlap.add(visBoxes[j].id);
      }

  ctx.font = '600 13px "Noto Sans Tamil",sans-serif'; ctx.textBaseline = 'alphabetic';
  for (const b of boxes) {
    if (!visible(b)) continue;
    const [x, y, w, h] = sbox(b);
    if (x + w < 0 || x > cw) continue;
    const col = colorById(b.id);
    const isSel = b.id === sel;

    // Fill only if this box heavily overlaps another (>75%)
    if (heavyOverlap.has(b.id)) {
      ctx.fillStyle = `hsla(${(b.id * 137.508) % 360},90%,60%,0.22)`;
      ctx.fillRect(x, y, w, h);
    }

    // Coloured border only — no outer ring
    ctx.lineWidth = isSel ? 2.5 : 1.4;
    ctx.strokeStyle = col;
    ctx.strokeRect(x, y, w, h);
  }
  // Draw label tooltip only for hovered or selected box (whichever is on top)
  const tipId = hovered ?? sel;
  const tipBox = tipId != null ? get(tipId) : null;
  if (tipBox && visible(tipBox)) {
    const [x, y, w] = sbox(tipBox);
    const t = tipBox.label || '?';
    const tw = ctx.measureText(t).width + 8, ty = y < 20 ? y + 17 : y - 4;
    ctx.fillStyle = color(tipBox.label);
    // Rounded pill background
    const bx = x, by = ty - 15, bh = 18;
    ctx.beginPath(); ctx.roundRect(bx, by, tw, bh, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t, bx + 4, ty);
  }
  const s = get(sel);
  if (s && visible(s)) {
    const [x, y, w, h] = sbox(s);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    for (const [, fx, fy] of HANDLES) { ctx.fillRect(x + fx * w - 4, y + fy * h - 4, 8, 8); ctx.strokeRect(x + fx * w - 4, y + fy * h - 4, 8, 8); }
  }
  if (drag && drag.t === 'new') {
    ctx.strokeStyle = '#ff0'; ctx.setLineDash([5, 3]);
    ctx.strokeRect(Math.min(drag.x0, drag.x1) * view.s + view.ox, Math.min(drag.y0, drag.y1) * view.s + view.oy,
                   Math.abs(drag.x1 - drag.x0) * view.s, Math.abs(drag.y1 - drag.y0) * view.s);
    ctx.setLineDash([]);
  }
  const max = Math.max(0, W * view.s - cw);
  $('hs').value = max ? -view.ox / max * 1000 : 0; $('hs').disabled = !max;
}

// ---------------------------------------------------------------- side panel
function refresh() { renderList(); redraw(); updateRenameSectionInModal(); }
function renderList() {
  const order = boxes.filter(visible).sort((a, b) => a.y - b.y || a.x - b.x);
  const n = {model: 0, edited: 0, manual: 0}; boxes.forEach(b => n[b.source]++);
  $('count').textContent = `${order.length}/${boxes.length} · model ${n.model} · edited ${n.edited} · manual ${n.manual}`;
  $('list').innerHTML = order.map((b, i) =>
    `<div class="row${b.id === sel ? ' sel' : ''}" data-id="${b.id}" style="border-left-color:${color(b.label)}">
      <small>${i + 1}</small><b>${b.label || '?'}</b><span class="badge ${b.source}">${b.source}</span>
      <small>${b.source === 'model' && b.conf != null ? Math.round(b.conf * 100) + '%' : ''}</small>
      <button class="row-edit-btn" data-id="${b.id}" title="Rename label">✎ rename</button>
    </div>`).join('');
  $('add').classList.toggle('on', mode === 'add');
  cv.style.cursor = mode === 'add' ? 'crosshair' : 'default';
}
$('list').onclick = e => {
  const btn = e.target.closest('.row-edit-btn');
  if (btn) { const b = get(+btn.dataset.id); select(b.id); openInlineRename(b.id, btn); return; }
  const r = e.target.closest('.row'); if (r) { const b = get(+r.dataset.id); select(b.id); centerOn(b); }
};

// ---------------------------------------------------------------- label picker (searchable, floating)
function openPicker(id) {
  const b = get(id); if (!b) return;
  pickFor = id; const [x, y, , h] = sbox(b), r = cv.getBoundingClientRect();
  const p = $('picker'); p.hidden = false;
  p.style.left = clamp(r.left + x, 4, innerWidth - 250) + 'px';
  p.style.top = clamp(r.top + y + h + 6, 4, innerHeight - 320) + 'px';
  $('pin').value = ''; renderPicker(); $('pin').focus();
}
function closePicker() { $('picker').hidden = true; pickFor = null; $('pin').blur(); cv.focus(); }
function renderPicker() {
  const q = $('pin').value.trim();
  const sorted = sortLabels(labels);
  // Filter: match Tamil substring OR English transliteration
  items = sorted.filter(l => matchesTranslit(l, q)).map(l => {
    // Build a hint showing the English transliteration if available
    const roms = TAMIL_TRANSLIT[l];
    const hint = roms ? roms.slice(0, 3).join(', ') : '';
    return {l, hint};
  });
  if (q && !labels.includes(q)) items.unshift({l: q, isNew: true, hint: ''});
  hi = 0;
  $('plist').innerHTML = items.map((it, i) =>
    `<li data-i="${i}" class="${it.isNew ? 'new' : ''}${i === hi ? ' hi' : ''}">${it.isNew ? '＋ Add "' + it.l + '"' : it.l}${it.hint ? '<span class="translit-hint">' + it.hint + '</span>' : ''}</li>`).join('');
}
async function choose(i) {
  const it = items[i]; if (!it) return; const id = pickFor;
  try {
    if (it.isNew) labels = await api('/labels', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: it.l})});
    closePicker(); setLabel(id, it.l);
  } catch (e) { toast(e.message, true); }
}
$('pin').oninput = renderPicker;
$('plist').onclick = e => { const li = e.target.closest('li'); if (li) choose(+li.dataset.i); };
$('pin').onkeydown = e => {
  const lis = $('plist').children;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); hi = clamp(hi + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
    [...lis].forEach((li, i) => li.classList.toggle('hi', i === hi)); lis[hi]?.scrollIntoView({block: 'nearest'});
  } else if (e.key === 'Enter') { e.preventDefault(); choose(hi); }
  else if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
};

// ---------------------------------------------------------------- inline rename (sidebar button)
let inlineFor = null;
function openInlineRename(id, anchorEl) {
  closeInlineRename();
  const b = get(id); if (!b) return;
  inlineFor = id;
  const ir = $('inlineRename'), rect = anchorEl.getBoundingClientRect();
  ir.hidden = false;
  ir.style.left = clamp(rect.left, 4, innerWidth - 220) + 'px';
  ir.style.top = (rect.bottom + 4) + 'px';
  $('inlineInput').value = b.label || '';
  $('inlineInput').focus(); $('inlineInput').select();
}
function closeInlineRename() { $('inlineRename').hidden = true; inlineFor = null; cv.focus(); }
async function commitInlineRename() {
  const id = inlineFor, val = $('inlineInput').value.trim();
  if (!val) { toast('Label cannot be empty', true); return; }
  if (!labels.includes(val)) {
    try { labels = await api('/labels', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: val})}); }
    catch (e) { toast(e.message, true); return; }
  }
  setLabel(id, val); closeInlineRename(); toast(`Label set → "${val}"`);
}
$('inlineOk').onclick = commitInlineRename;
$('inlineCancel').onclick = closeInlineRename;
$('inlineInput').onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); commitInlineRename(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeInlineRename(); }
};

// ---------------------------------------------------------------- Manage Labels modal
const modal = $('labelModal');
function openLabelModal() {
  modal.hidden = false;
  $('newLabelInput').value = '';
  $('renameLabelInput').value = '';
  $('filterLabels').value = '';
  updateRenameSectionInModal();
  renderLabelList();
}
function closeLabelModal() { modal.hidden = true; }
$('manageLabelBtn').onclick = openLabelModal;
$('closeLabelModal').onclick = closeLabelModal;
modal.onclick = e => { if (e.target === modal) closeLabelModal(); };

// update "rename selected box" section in modal
function updateRenameSectionInModal() {
  const b = get(sel);
  $('curLabelDisplay').textContent = b ? (b.label || '?') : '—';
  $('renameLabelInput').placeholder = b ? 'New label…' : '(select a box first)';
  $('renameLabelBtn').disabled = !b;
}

// add new label via modal
$('addLabelBtn').onclick = async () => {
  const val = $('newLabelInput').value.trim();
  if (!val) { toast('Type a label first', true); return; }
  if (labels.includes(val)) { toast(`"${val}" already exists`, true); return; }
  try {
    labels = await api('/labels', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: val})});
    $('newLabelInput').value = ''; renderLabelList(); toast(`Added "${val}"`);
  } catch (e) { toast(e.message, true); }
};
$('newLabelInput').onkeydown = e => { if (e.key === 'Enter') $('addLabelBtn').click(); };

// rename selected box label via modal
$('renameLabelBtn').onclick = async () => {
  const b = get(sel); if (!b) { toast('Select a box first', true); return; }
  const val = $('renameLabelInput').value.trim();
  if (!val) { toast('Type a new label name', true); return; }
  if (!labels.includes(val)) {
    try { labels = await api('/labels', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: val})}); }
    catch (e) { toast(e.message, true); return; }
  }
  setLabel(b.id, val); $('renameLabelInput').value = ''; renderLabelList(); toast(`Renamed → "${val}"`);
};
$('renameLabelInput').onkeydown = e => { if (e.key === 'Enter') $('renameLabelBtn').click(); };

// full label list with rename/delete
$('filterLabels').oninput = renderLabelList;
function renderLabelList() {
  const q = $('filterLabels').value.trim();
  const sorted = sortLabels(labels);
  const filtered = q ? sorted.filter(l => matchesTranslit(l, q)) : sorted;
  $('labelCount').textContent = `(${filtered.length}/${labels.length})`;

  $('labelList').innerHTML = filtered.map(l => {
    const used = boxes.filter(b => b.label === l).length;
    return `<li data-label="${encodeURIComponent(l)}">
      <span class="ll-name" title="Click to assign to selected box" data-assign="${encodeURIComponent(l)}">${l}</span>
      <span class="ll-count">${used > 0 ? used + '×' : ''}</span>
      <div class="ll-actions">
        <button class="ll-btn ll-rename-btn" data-label="${encodeURIComponent(l)}" title="Rename this label everywhere">✎</button>
        <button class="ll-btn del ll-delete-btn" data-label="${encodeURIComponent(l)}" title="Remove from label list${used > 0 ? ' (' + used + ' boxes will lose this label)' : ''}">✕</button>
      </div>
    </li>`;
  }).join('');
}
$('labelList').onclick = async e => {
  // Assign to selected box
  const assignEl = e.target.closest('[data-assign]');
  if (assignEl) {
    const l = decodeURIComponent(assignEl.dataset.assign);
    const b = get(sel);
    if (!b) { toast('Select a box on the canvas first, then click a label to assign it', true); return; }
    setLabel(b.id, l); toast(`Label set → "${l}"`); return;
  }
  // Rename label globally
  const renBtn = e.target.closest('.ll-rename-btn');
  if (renBtn) {
    const oldLabel = decodeURIComponent(renBtn.dataset.label);
    startInlineListEdit(renBtn, oldLabel);
    return;
  }
  // Delete label from list
  const delBtn = e.target.closest('.ll-delete-btn');
  if (delBtn) {
    const l = decodeURIComponent(delBtn.dataset.label);
    const used = boxes.filter(b => b.label === l).length;
    if (used > 0 && !confirm(`"${l}" is used by ${used} box${used > 1 ? 'es' : ''}. Remove the label from those boxes too?`)) return;
    // remove from labels array on server: no delete API exists, so remove locally and save labels.json via POST of each remaining label
    // Simplest: filter out and POST updated array via a helper
    await deleteLabel(l); return;
  }
};

// inline edit inside label list row
function startInlineListEdit(btn, oldLabel) {
  const li = btn.closest('li');
  const nameSpan = li.querySelector('.ll-name');
  const actions = li.querySelector('.ll-actions');
  const input = document.createElement('input');
  input.className = 'll-edit'; input.value = oldLabel;
  nameSpan.replaceWith(input);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'll-btn save'; saveBtn.textContent = '✓';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'll-btn'; cancelBtn.textContent = '✕';
  actions.innerHTML = ''; actions.appendChild(saveBtn); actions.appendChild(cancelBtn);
  input.focus(); input.select();

  async function commit() {
    const newLabel = input.value.trim();
    if (!newLabel || newLabel === oldLabel) { renderLabelList(); return; }
    await renameLabelGlobally(oldLabel, newLabel);
  }
  saveBtn.onclick = commit;
  cancelBtn.onclick = renderLabelList;
  input.onkeydown = e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') renderLabelList(); };
}

// rename a label everywhere (boxes + labels array) without a dedicated API — does it locally
async function renameLabelGlobally(oldLabel, newLabel) {
  if (!newLabel) return;
  // add new label to server if not present
  if (!labels.includes(newLabel)) {
    try { labels = await api('/labels', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({label: newLabel})}); }
    catch (e) { toast(e.message, true); return; }
  }
  // rename all matching boxes (push one undo snapshot)
  const affected = boxes.filter(b => b.label === oldLabel);
  if (affected.length) { pushUndo(); affected.forEach(b => { b.label = newLabel; markEdited(b); }); dirty = true; }
  // remove old label from list (filter client-side; server labels.json is append-only, harmless to leave old)
  labels = labels.filter(l => l !== oldLabel);
  renderLabelList(); refresh();
  toast(`Renamed "${oldLabel}" → "${newLabel}"${affected.length ? ` on ${affected.length} box${affected.length > 1 ? 'es' : ''}` : ''}`);
}

async function deleteLabel(l) {
  labels = labels.filter(lb => lb !== l);
  // clear label from all boxes
  const affected = boxes.filter(b => b.label === l);
  if (affected.length) { pushUndo(); affected.forEach(b => { b.label = ''; markEdited(b); }); dirty = true; }
  renderLabelList(); refresh();
  toast(`Removed "${l}" from label list${affected.length ? ` · ${affected.length} box${affected.length > 1 ? 'es' : ''} cleared` : ''}`);
}

// ---------------------------------------------------------------- mouse
const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function hitHandle(sx, sy) {
  const b = get(sel); if (!b || !visible(b)) return null;
  const [x, y, w, h] = sbox(b);
  for (const [n, fx, fy] of HANDLES) if (Math.abs(sx - (x + fx * w)) <= HR && Math.abs(sy - (y + fy * h)) <= HR) return n;
  return null;
}
function hitBox(sx, sy) {
  const p = toImg(sx, sy); let best = null;
  for (const b of boxes) if (visible(b) && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h && (!best || b.w * b.h < best.w * best.h)) best = b;
  return best;
}
function startEdit(t, h, sx, sy) { pushUndo(); drag = {t, h, sx, sy, o: {...get(sel)}, changed: false}; }

cv.onmousedown = e => {
  if (!img) return; const [sx, sy] = pos(e);
  if (!$('picker').hidden) closePicker();
  if (!$('inlineRename').hidden) closeInlineRename();
  if (e.button === 1 || space) { drag = {t: 'pan', sx, sy, ox: view.ox, oy: view.oy}; e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (mode === 'add') { const p = toImg(sx, sy), x = clamp(p.x, 0, W), y = clamp(p.y, 0, H); drag = {t: 'new', x0: x, y0: y, x1: x, y1: y}; return; }
  const h = hitHandle(sx, sy); if (h) { startEdit('resize', h, sx, sy); return; }
  const b = hitBox(sx, sy);
  if (b) { select(b.id); startEdit('move', null, sx, sy); } else select(null);
};
window.onmousemove = e => {
  if (!img) return; const [sx, sy] = pos(e);
  if (!drag) {
    if (e.target === cv) {
      const b = hitBox(sx, sy);
      const newHov = b ? b.id : null;
      if (newHov !== hovered) { hovered = newHov; redraw(); }   // tooltip on/off
      if (!space && mode === 'select') { const h = hitHandle(sx, sy); cv.style.cursor = h ? CUR[h] : b ? 'move' : 'default'; }
    } else if (hovered !== null) { hovered = null; redraw(); }
    return;
  }
  if (drag.t === 'pan') { view.ox = drag.ox + sx - drag.sx; view.oy = drag.oy + sy - drag.sy; }
  else if (drag.t === 'new') { const p = toImg(sx, sy); drag.x1 = clamp(p.x, 0, W); drag.y1 = clamp(p.y, 0, H); }
  else {
    const b = get(sel), o = drag.o, dx = (sx - drag.sx) / view.s, dy = (sy - drag.sy) / view.s;
    if (drag.t === 'move') { b.x = clamp(Math.round(o.x + dx), 0, W - o.w); b.y = clamp(Math.round(o.y + dy), 0, H - o.h); }
    else {
      let l = o.x, t = o.y, r = o.x + o.w, bt = o.y + o.h; const h = drag.h;
      if (h.includes('w')) l = clamp(o.x + dx, 0, r - MIN);
      if (h.includes('e')) r = clamp(o.x + o.w + dx, l + MIN, W);
      if (h.includes('n')) t = clamp(o.y + dy, 0, bt - MIN);
      if (h.includes('s')) bt = clamp(o.y + o.h + dy, t + MIN, H);
      b.x = Math.round(l); b.y = Math.round(t); b.w = Math.round(r - l); b.h = Math.round(bt - t);
    }
    if (b.x !== o.x || b.y !== o.y || b.w !== o.w || b.h !== o.h) { drag.changed = true; markEdited(b); }
  }
  redraw();
};
window.onmouseup = () => {
  if (!drag) return; const d = drag; drag = null;
  if (d.t === 'new') {
    const x = Math.round(Math.min(d.x0, d.x1)), y = Math.round(Math.min(d.y0, d.y1));
    const w = Math.round(Math.abs(d.x1 - d.x0)), h = Math.round(Math.abs(d.y1 - d.y0));
    if (w >= MIN && h >= MIN) {
      pushUndo(); const b = {id: nextId++, x, y, w, h, label: '', source: 'manual', conf: null};
      boxes.push(b); mode = 'select'; select(b.id); openPicker(b.id);
    } else toast('Box too small (min 8 px)', true);
  } else if ((d.t === 'move' || d.t === 'resize') && !d.changed) undo.pop();
  refresh();
};
cv.ondblclick = e => { const b = hitBox(...pos(e)); if (b) { select(b.id); openPicker(b.id); } };
cv.onwheel = e => {
  e.preventDefault(); if (!img) return; const [sx, sy] = pos(e);
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    // Pan: scale down raw delta so swiping isn't too fast
    view.ox -= (e.deltaX || e.deltaY) * 0.3;
  } else {
    // Zoom: smaller step (1.05) = much less sensitive than 1.15
    const p = toImg(sx, sy);
    view.s = clamp(view.s * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.05, 12);
    view.ox = sx - p.x * view.s; view.oy = sy - p.y * view.s;
  }
  redraw();
};
cv.oncontextmenu = e => e.preventDefault();

// ---------------------------------------------------------------- keyboard
function toggleAdd() { mode = mode === 'add' ? 'select' : 'add'; refresh(); }

/** Navigate to the next/previous visible box in sidebar order */
function cycleBox(dir) {
  const order = boxes.filter(visible).sort((a, b) => a.y - b.y || a.x - b.x);
  if (!order.length) return;
  if (sel == null) { select(order[dir > 0 ? 0 : order.length - 1].id); centerOn(get(sel)); return; }
  const idx = order.findIndex(b => b.id === sel);
  const next = order[clamp(idx + dir, 0, order.length - 1)];
  select(next.id); centerOn(next);
}

window.onkeydown = e => {
  if (e.target.type === 'text') return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (k === ' ') { space = true; cv.style.cursor = 'grab'; e.preventDefault(); }
  else if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  else if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
  else if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if (ctrl && k.toLowerCase() === 'l') { e.preventDefault(); openLabelModal(); }  // Ctrl+L = Labels
  else if (ctrl) return;
  else if (k === 'n' || k === 'N') toggleAdd();
  else if (k === 'l' || k === 'L') { e.preventDefault(); if (sel != null) openPicker(sel); else toast('Select a box first (click or use ↑↓)', true); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delSel(); }
  else if (k === 'Escape') {
    if (!modal.hidden) { closeLabelModal(); return; }
    if (!$('inlineRename').hidden) { closeInlineRename(); return; }
    mode = 'select'; select(null);
  }
  else if (k === 'Enter' && sel != null) openPicker(sel);
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    if (e.shiftKey && sel != null) {
      // Shift+↑↓ = nudge selected box vertically
      nudge(0, k === 'ArrowUp' ? -10 : 10);
    } else {
      // ↑↓ = navigate between boxes
      cycleBox(k === 'ArrowDown' ? 1 : -1);
    }
  }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && sel != null) {
    // ←→ = nudge selected box horizontally
    e.preventDefault(); const st = e.shiftKey ? 10 : 1;
    nudge(k === 'ArrowLeft' ? -st : st, 0);
  }
};
window.onkeyup = e => { if (e.key === ' ') { space = false; refresh(); } };
window.onresize = redraw;
window.onbeforeunload = e => { if (dirty) { e.preventDefault(); return ''; } };

// ---------------------------------------------------------------- open / save / export
async function openFile(f, rerun = false) {
  if (!/\.(jpe?g|png)$/i.test(f.name)) return toast('Unsupported file type. Use .jpg or .png.', true);
  if (rerun && boxes.length && !confirm('Replace the current boxes with fresh model predictions?')) return;
  if (!rerun && dirty && !confirm('Discard unsaved changes?')) return;
  $('info').textContent = 'Running model…';
  try {
    const fd = new FormData(); fd.append('file', f); fd.append('rerun', rerun);
    const r = await api('/predict', {method: 'POST', body: fd});
    const im = new Image(); const url = URL.createObjectURL(f);
    await new Promise((ok, bad) => { im.onload = ok; im.onerror = () => bad(new Error('Browser could not display this image.')); im.src = url; });
    img = im; file = f; name = r.name; W = r.width; H = r.height;
    boxes = r.annotations.map((a, i) => ({id: i + 1, x: a.bbox[0], y: a.bbox[1], w: a.bbox[2], h: a.bbox[3], label: a.label, source: a.source, conf: a.confidence ?? null}));
    nextId = boxes.length + 1; sel = null; undo = []; redo = []; dirty = false; mode = 'select';
    $('warn').hidden = !r.warning; $('warn').textContent = r.warning || '';
    $('info').textContent = `${name} · ${W}×${H}`; fit(); refresh();
    toast(r.loaded ? 'Loaded saved annotations' : `${boxes.length} boxes predicted`);
  } catch (e) { $('info').textContent = ''; toast(e.message, true); }
}
async function save() {
  if (!img) return toast('Open an image first.', true);
  const out = boxes.filter(visible).map(b => ({bbox: [b.x, b.y, b.w, b.h], label: b.label, source: b.source, confidence: b.conf}));
  try {
    const r = await api('/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, width: W, height: H, annotations: out})});
    dirty = false; const un = out.filter(o => !o.label).length, hid = boxes.length - out.length;
    toast(`Saved ${r.count} boxes → ${r.saved}` + (un ? ` · ${un} without label` : '') + (hid ? ` · ${hid} hidden low-conf boxes not saved` : ''));
  } catch (e) { toast('Save failed: ' + e.message, true); }
}
$('file').onchange = e => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; };
$('add').onclick = toggleAdd; $('del').onclick = delSel; $('undo').onclick = doUndo; $('redo').onclick = doRedo;
$('fit').onclick = fit; $('one').onclick = () => { view.s = 1; redraw(); };
$('save').onclick = save; $('rerun').onclick = () => file ? openFile(file, true) : toast('Open an image first.', true);
$('thr').oninput = e => { thr = e.target.value / 100; $('thrv').textContent = thr.toFixed(2); if (get(sel) && !visible(get(sel))) sel = null; refresh(); };
$('export').onclick = async () => {
  try { const r = await api('/export'); toast(`Exported ${r.images} images, ${r.boxes} boxes`); open(r.json); setTimeout(() => open(r.zip), 400); }
  catch (e) { toast(e.message, true); }
};
$('downloadJson').onclick = async () => {
  if (!img) return toast('Open an image first.', true);
  const vis = boxes.filter(visible).sort((a, b) => a.y - b.y || a.x - b.x);
  const anns = [], folders = {};
  vis.forEach((b, i) => {
    const id = i + 1;
    const bbox = [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)];
    const entry = {
      id, image_id: 1, file_name: name, category_id: 1,
      bbox, area: bbox[2] * bbox[3],
      label: b.label || '', iscrowd: 0, source: b.source
    };
    if (b.source === 'model' && b.conf != null) entry.confidence = Math.round(b.conf * 100) / 100;
    anns.push(entry);
    const folder = b.label || 'unlabeled';
    (folders[folder] = folders[folder] || []).push(id);
  });
  const dataset = {
    info: {
      description: 'Palm-Leaf Tamil Character Dataset',
      version: '1.0',
      date_created: new Date().toISOString().slice(0, 10),
      contributor: 'Palm-Leaf Annotator'
    },
    licenses: [],
    images: [{id: 1, file_name: name}],
    annotations: anns,
    categories: [{id: 1, name: 'character', supercategory: 'palm_leaf'}],
    folders: Object.entries(folders).map(([k, v]) => ({folder_label: k, crop_ids: v}))
  };
  // Save to server annotations/ folder
  try {
    const r = await api('/download_json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(dataset)
    });
    toast(`Saved → ${r.saved} · ${anns.length} annotations`);
  } catch (e) { toast('Server save failed: ' + e.message, true); }
  // Also trigger browser download
  const json = JSON.stringify(dataset, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/\.[^.]+$/, '') + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
document.body.ondragover = e => e.preventDefault();
document.body.ondrop = e => { e.preventDefault(); if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); };

// ---------------------------------------------------------------- start
document.fonts.load('600 13px "Noto Sans Tamil"').then(redraw);
api('/labels').then(l => { labels = sortLabels(l); }).catch(e => toast(e.message, true));
refresh();

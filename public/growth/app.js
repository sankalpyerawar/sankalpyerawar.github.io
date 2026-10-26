/* Growth: a phone-first reader and capture tool over Sankalp's second-brain vault.
   Reads and writes the private GitHub repo directly through the GitHub REST API.
   No server: the token lives only on this device. */
'use strict';

const API = 'https://api.github.com';
const P = {
  daily: '10 Journal/Daily/',
  weekly: '10 Journal/Weekly/',
  mocks: '10 Journal/Mocks/',
  todo: 'Lists/To-do.md',
  reading: 'Lists/Reading list.md',
  watch: 'Lists/Watch list.md',
  inbox: '00 Inbox/',
  ideas: '40 Library/Ideas/',
  ladder: '30 Areas/Learning/Learning ladder.md',
  prep: '20 Projects/Interview prep 2026/Interview prep.md',
  story: '30 Areas/Career/Story bank.md',
  presence: '30 Areas/Career/Professional presence.md',
  jobs: 'App/jobs.json',
  log: (d) => `App/log/${d}.json`,
};
const HIDDEN_DIRS = ['.obsidian', '.trash', '.git', '.github'];

/* ---------- small utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } },
};
function localDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDate(s, long = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return s || '';
  return parseDate(s).toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function b64enc(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64dec(b) {
  const bin = atob(b.replace(/\s/g, '')); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
function slugTitle(s) { return s.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Untitled'; }
function splitFm(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md || '');
  if (!m) return { fm: {}, body: md || '' };
  const fm = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ''); }
  return { fm, body: md.slice(m[0].length) };
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
const isDark = () => document.documentElement.dataset.theme === 'dark' ||
  (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

/* ---------- IndexedDB key-value cache (blob contents by sha) ---------- */
const kv = (() => {
  let dbp; const mem = new Map();
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('growth', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  return {
    async get(k) {
      if (mem.has(k)) return mem.get(k);
      try {
        const db = await open();
        return await new Promise((res) => {
          const q = db.transaction('kv').objectStore('kv').get(k);
          q.onsuccess = () => { if (q.result !== undefined) mem.set(k, q.result); res(q.result); };
          q.onerror = () => res(undefined);
        });
      } catch { return undefined; }
    },
    async set(k, v) {
      mem.set(k, v);
      try {
        const db = await open();
        await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; });
      } catch { /* in-memory only */ }
    },
    async clear() {
      mem.clear();
      try { const db = await open(); await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = res; tx.onerror = res; }); } catch { /* ignore */ }
    },
  };
})();

/* ---------- state ---------- */
let cfg = Object.assign({ token: '', repo: 'sankalpyerawar/second-brain', branch: 'main', theme: 'system' }, ls.get('growth.cfg', {}));
let tree = ls.get('growth.tree', { etag: null, files: {}, at: 0 });
let queue = ls.get('growth.queue', []);
let overlay = ls.get('growth.overlay', {});
let lastSync = ls.get('growth.lastSync', null);
const saveTree = () => ls.set('growth.tree', tree);
const saveQueue = () => { ls.set('growth.queue', queue); ls.set('growth.overlay', overlay); };

function applyTheme() {
  if (cfg.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = cfg.theme;
  document.documentElement.dataset.size = cfg.size || 'm';
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F4F7F5';
}
applyTheme();

/* ---------- GitHub API ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function gh(path, opts = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      cache: 'no-store', ...opts,
      headers: { Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
    });
  } catch (e) { const err = new HttpError(0, 'No connection'); err.offline = true; throw err; }
  return r;
}
async function failWith(r) {
  let msg = r.statusText;
  try { msg = (await r.json()).message || msg; } catch { /* ignore */ }
  if (r.status === 401) msg = 'GitHub rejected the token. Paste a new one in Settings.';
  if (r.status === 404) msg = 'Repo not found, or the token cannot see it.';
  throw new HttpError(r.status, msg);
}

async function refreshTree() {
  const headers = tree.etag ? { 'If-None-Match': tree.etag } : {};
  const r = await gh(`/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`, { headers });
  if (r.status === 304) { tree.at = Date.now(); saveTree(); return false; }
  if (!r.ok) await failWith(r);
  const j = await r.json(); const files = {};
  for (const e of j.tree) if (e.type === 'blob') files[e.path] = e.sha;
  tree = { etag: r.headers.get('ETag'), files, at: Date.now() };
  saveTree();
  return true;
}

async function readFile(path) {
  if (Object.prototype.hasOwnProperty.call(overlay, path)) return overlay[path];
  const sha = tree.files[path];
  if (!sha) return null;
  const cached = await kv.get('b:' + sha);
  if (cached != null) return cached;
  const r = await gh(`/repos/${cfg.repo}/git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (!r.ok) await failWith(r);
  const text = await r.text();
  await kv.set('b:' + sha, text);
  return text;
}
async function readJson(path, fallback = null) {
  const t = await readFile(path);
  if (t == null) return fallback;
  try { return JSON.parse(t); } catch { return fallback; }
}
const listDir = (prefix, ext = '.md') => Object.keys(tree.files)
  .filter((p) => p.startsWith(prefix) && p.endsWith(ext) && !p.slice(prefix.length).includes('/')).sort().reverse();

async function getContents(path) {
  const r = await gh(`/repos/${cfg.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (r.status === 404) return null;
  if (!r.ok) await failWith(r);
  const j = await r.json();
  return { sha: j.sha, text: b64dec(j.content || '') };
}

/* ---------- write operations (replayable, so they survive offline) ---------- */
function insertUnder(text, heading, line) {
  const lines = (text || '').split('\n');
  const h = lines.findIndex((l) => l.trim().toLowerCase() === ('## ' + heading).toLowerCase());
  if (h < 0) return (text || '').replace(/\s*$/, '') + `\n\n## ${heading}\n${line}\n`;
  let i = h + 1, last = -1;
  while (i < lines.length && !/^#{1,2} /.test(lines[i])) { if (/^\s*- /.test(lines[i])) last = i; i++; }
  lines.splice(last >= 0 ? last + 1 : h + 1, 0, line);
  return lines.join('\n');
}
function toggleTask(text, taskText, checked) {
  const lines = (text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- \[( |x|X)\] (.*)$/.exec(lines[i]);
    if (m && m[3] === taskText) { lines[i] = `${m[1]}- [${checked ? 'x' : ' '}] ${m[3]}`; return lines.join('\n'); }
  }
  return text;
}
function setIn(obj, keys, value) {
  let o = obj; for (let i = 0; i < keys.length - 1; i++) { if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = value;
}
function getIn(obj, keys) { return keys.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
const json = (o) => JSON.stringify(o, null, 2) + '\n';
const parseOr = (t, init) => { try { return t ? JSON.parse(t) : structuredClone(init); } catch { return structuredClone(init); } };

const OPS = {
  create: (old, op) => (old == null ? op.content : old),
  addLine: (old, op) => insertUnder(old ?? op.init ?? '', op.section, op.line),
  toggle: (old, op) => toggleTask(old, op.text, op.checked),
  jsonSet: (old, op) => { const o = parseOr(old, op.init || {}); setIn(o, op.keys, op.value); return json(o); },
  jsonPush: (old, op) => { const o = parseOr(old, op.init || {}); const a = getIn(o, op.keys); if (Array.isArray(a)) a.push(op.item); else setIn(o, op.keys, [op.item]); return json(o); },
  jobStatus: (old, op) => { const o = parseOr(old, { jobs: [] }); const j = (o.jobs || []).find((x) => x.id === op.id); if (j) { j.status = op.status; j.statusChanged = op.at; } return json(o); },
};

async function enqueue(op) {
  op.qid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let cur = null;
  try { cur = await readFile(op.path); } catch { cur = Object.prototype.hasOwnProperty.call(overlay, op.path) ? overlay[op.path] : null; }
  overlay[op.path] = OPS[op.kind](cur, op);
  queue.push(op); saveQueue();
  flush();
}

let flushing = false;
async function flush() {
  if (flushing || !cfg.token) return;
  if (!queue.length) { setSync(); return; }
  flushing = true; setSync('busy', 'Saving');
  try {
    while (queue.length) {
      const op = queue[0];
      await pushOp(op);
      queue.shift();
      if (!queue.some((q) => q.path === op.path)) delete overlay[op.path];
      saveQueue();
    }
    lastSync = new Date().toISOString(); ls.set('growth.lastSync', lastSync);
    setSync();
  } catch (e) {
    if (e.offline) setSync('err', `Offline · ${queue.length} waiting`);
    else { setSync('err', `${queue.length} not saved`); toast(e.message); }
  } finally { flushing = false; }
}

async function pushOp(op) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await getContents(op.path);
    if (op.kind === 'create' && cur) {
      const m = /^(.*?)(?: (\d+))?(\.md)$/.exec(op.path);
      op.path = `${m[1]} ${m[2] ? Number(m[2]) + 1 : 2}${m[3]}`; saveQueue(); continue;
    }
    const next = OPS[op.kind](cur ? cur.text : null, op);
    if (cur && next === cur.text) return;
    const body = { message: op.message || 'app: update', content: b64enc(next), branch: cfg.branch };
    if (cur) body.sha = cur.sha;
    const r = await gh(`/repos/${cfg.repo}/contents/${encPath(op.path)}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      tree.files[op.path] = j.content.sha; tree.etag = null; saveTree();
      await kv.set('b:' + j.content.sha, next);
      return;
    }
    if (r.status === 409 || r.status === 422) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
    await failWith(r);
  }
  throw new HttpError(409, 'Could not save after several tries. It will retry on the next sync.');
}

/* ---------- sync ---------- */
function setSync(state, text) {
  const dot = $('#syncDot'), t = $('#syncText');
  if (!dot || !t) return;
  if (!cfg.token) { dot.className = 'dot'; t.textContent = 'Set up'; return; }
  if (!state) {
    if (queue.length) { state = 'err'; text = `${queue.length} waiting`; }
    else { state = 'ok'; text = lastSync ? fmtTime(lastSync) : 'Synced'; }
  }
  dot.className = 'dot ' + state; t.textContent = text;
}

let syncing = null;
async function sync({ rerender = true } = {}) {
  if (!cfg.token) return;
  if (syncing) return syncing;
  syncing = (async () => {
    setSync('busy', 'Syncing');
    try {
      await flush();
      const changed = await refreshTree();
      lastSync = new Date().toISOString(); ls.set('growth.lastSync', lastSync);
      setSync();
      if (changed && rerender) route();
      prefetch();
    } catch (e) {
      if (e.offline) setSync('err', 'Offline'); else { setSync('err', 'Sync failed'); toast(e.message); }
    } finally { syncing = null; }
  })();
  return syncing;
}

async function prefetch() {
  const daily = listDir(P.daily).slice(0, 3);
  const paths = [...daily, ...daily.map((p) => P.log(p.slice(P.daily.length, -3))), P.todo, P.reading, P.watch, P.jobs, P.ladder, P.prep, P.story, P.presence, listDir(P.weekly)[0]];
  for (const p of paths) { if (p && tree.files[p]) { try { await readFile(p); } catch { return; } } }
}

/* ---------- markdown → app components ---------- */
marked.setOptions({ gfm: true, breaks: false });
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu;
const stripEmoji = (s) => String(s || '').replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
function resolveWiki(target) {
  const t = target.trim();
  const files = Object.keys(tree.files);
  return files.find((p) => p === t || p === t + '.md') || files.find((p) => p.endsWith('/' + t + '.md')) || null;
}
function preprocess(md) {
  return String(md || '').replace(/(^|[^\\])~(?=[\d$₹≈<>])/g, '$1\\~').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const path = resolveWiki(target);
    const text = label || target.split('/').pop();
    return path ? `[${text}](#/file/${encodeURIComponent(path)})` : text;
  });
}
const inline = (s) => DOMPurify.sanitize(marked.parseInline(preprocess(stripEmoji(s || ''))));
const LEVELS = { L0: 'New', L1: 'Surface', L2: 'Mental model', L3: 'Mechanics', L4: 'Internals', L5: 'Production' };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* Render markdown, then reshape it so it reads like an app, not a document. */
function renderRich(md, host) {
  host.classList.add('rich');
  md = String(md || '').replace(/^>\s*\S*\s*\*Chart \(.*?\) is interactive in the Claude Docs version\.?\*\s*$/gm, '');
  host.innerHTML = DOMPurify.sanitize(marked.parse(preprocess(md)));
  // drop emoji signposts from text
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((t) => { if (!t.parentElement.closest('pre, code')) { const v = t.nodeValue.replace(EMOJI, ''); if (v !== t.nodeValue) t.nodeValue = v.replace(/^\s+(?=\S)/, (m) => (t.previousSibling ? m : '')); } });
  host.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href').startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; } });
  host.querySelectorAll('pre > code.language-mermaid').forEach((c) => {
    const f = el('figure', 'diagram'); const d = el('div', 'mermaid'); d.dataset.src = c.textContent; d.textContent = c.textContent; f.appendChild(d); c.parentElement.replaceWith(f);
  });
  host.querySelectorAll('pre > code.language-chart').forEach((c) => { const f = chartFrom(c.textContent); if (f) c.parentElement.replaceWith(f); });
  host.querySelectorAll('blockquote').forEach((b) => { b.classList.add('note'); });
  // chart placeholders from the Docs era
  host.querySelectorAll('p').forEach((p) => { if (/^Chart \(.*\) is interactive in the Claude Docs version\.?$/.test(p.textContent.trim())) (p.closest('blockquote') || p).remove(); });
  shapeLabels(host);
  shapeJargon(host);
  shapeFolds(host);
  host.querySelectorAll('table').forEach(shapeTable);
  renderMermaid(host);
  return host;
}

const CALLOUT = /^(why you care|why it matters|in your world)/i;
const FOLD = /^(try it|go deeper|yesterday's answers|friday's answers|thursday's answers|wednesday's answers|tuesday's answers|monday's answers|hint)/i;
function leadLabel(p) {
  const s = p.firstElementChild;
  if (!s || s.tagName !== 'STRONG') return null;
  for (let n = p.firstChild; n && n !== s; n = n.nextSibling) { if (n.nodeType !== 3 || n.nodeValue.trim()) return null; }
  for (let n = p.firstChild; n && n !== s;) { const nx = n.nextSibling; n.remove(); n = nx; }
  return s.textContent.trim();
}
/* "**Label:** text" → a small label above the text; key labels become callouts */
function shapeLabels(host) {
  host.querySelectorAll(':scope > p').forEach((p) => {
    const label = leadLabel(p);
    if (!label || !/:$/.test(label) || FOLD.test(label) || /^jargon/i.test(label)) return;
    const name = label.replace(/:$/, '');
    p.firstElementChild.remove();
    p.innerHTML = p.innerHTML.replace(/^\s+/, '');
    const box = el('div', CALLOUT.test(name) ? 'callout' : 'kv');
    box.appendChild(el('span', 'label', esc(name)));
    p.replaceWith(box); box.appendChild(p);
  });
}
/* "Jargon buster: *term* = def. *term2* = def." → tap-to-open definitions */
function shapeJargon(host) {
  host.querySelectorAll(':scope > p').forEach((p) => {
    const label = leadLabel(p);
    if (!label || !/^jargon/i.test(label)) return;
    p.firstElementChild.remove();
    const items = []; let cur = null;
    p.childNodes.forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'EM') { cur = { term: n.textContent.trim(), def: '' }; items.push(cur); }
      else if (cur) cur.def += n.nodeType === 1 ? n.outerHTML : esc(n.textContent);
    });
    if (!items.length) return;
    const box = el('div', 'jargon');
    box.appendChild(el('span', 'label', 'New terms'));
    items.forEach((it) => {
      const d = el('details', 'term');
      d.innerHTML = `<summary>${esc(it.term)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><p>${it.def.replace(/^\s*[=:]\s*/, '').trim()}</p>`;
      box.appendChild(d);
    });
    p.replaceWith(box);
  });
}
/* "**Try it** …", "**Go deeper** …", "**Yesterday's answers** …" → collapsible sections */
function shapeFolds(host) {
  [...host.querySelectorAll(':scope > p')].forEach((p) => {
    const label = leadLabel(p);
    if (!label || !FOLD.test(label)) return;
    const d = el('details', 'fold');
    const sum = el('summary', null, `<span>${esc(label.replace(/[:.]$/, ''))}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`);
    d.appendChild(sum);
    p.firstElementChild.remove();
    const body = el('div', 'fold-body');
    if (p.textContent.trim()) body.appendChild(p.cloneNode(true));
    const isAnswers = /answers/i.test(label), isTry = /^try it/i.test(label);
    let n = /^go deeper|^hint/i.test(label) ? null : p.nextElementSibling;
    let sawCode = false;
    while (n && !(n.tagName === 'P' && leadLabel(n)) && !/^H[1-3]$/.test(n.tagName) && !n.classList.contains('callout') && !n.classList.contains('kv') && !n.classList.contains('jargon') && !n.matches('figure, details')) {
      const next = n.nextElementSibling;
      if (isTry && sawCode && n.tagName !== 'P') break;
      body.appendChild(n);
      if (isAnswers && /^(OL|UL)$/.test(n.tagName)) { if (next && next.tagName === 'P' && /^No reply|^You (got|answered)|^Verdict/i.test(next.textContent.trim())) body.appendChild(next); break; }
      if (isTry && n.tagName === 'PRE') sawCode = true;
      else if (isTry && sawCode) break;
      n = next;
    }
    d.appendChild(body); p.replaceWith(d);
  });
}
/* Tables become cards on a phone: one card per row. The Skill map gets level bars. */
function shapeTable(t) {
  const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const rows = [...t.querySelectorAll('tbody tr')];
  if (!heads.length || !rows.length) return;
  const iSelf = heads.findIndex((h) => /^self/i.test(h)), iShown = heads.findIndex((h) => /^shown/i.test(h));
  const list = el('div', 'rowcards');
  rows.forEach((tr) => {
    const cells = [...tr.children];
    const card = el('div', 'rowcard');
    card.appendChild(el('div', 'rowcard-title', cells[0] ? cells[0].innerHTML : ''));
    if (iSelf >= 0 && iShown >= 0) {
      const lv = (s) => { const m = /L(\d)/.exec(s || ''); return m ? Number(m[1]) : null; };
      const self = lv(cells[iSelf].textContent), shown = lv(cells[iShown].textContent);
      const bar = (v, cls) => `<span class="lvl ${cls}">${[1, 2, 3, 4, 5].map((i) => `<i class="${v != null && i <= v ? 'on' : ''}"></i>`).join('')}</span>`;
      card.appendChild(el('div', 'levels', `<div><span class="mini">You say</span>${bar(self, 'self')}<span class="mini">${self != null ? 'L' + self + ' ' + LEVELS['L' + self] : '–'}</span></div><div><span class="mini">Shown</span>${bar(shown, 'shown')}<span class="mini">${shown != null ? 'L' + shown + ' ' + LEVELS['L' + shown] : 'No evidence yet'}</span></div>`));
    }
    cells.slice(1).forEach((c, i) => {
      const h = heads[i + 1] || ''; const idx = i + 1;
      if (idx === iSelf || idx === iShown) return;
      const v = c.innerHTML.trim(); if (!v || v === '–' || v === '-') return;
      card.appendChild(el('div', 'rowcard-field', `<span class="mini">${esc(h)}</span><span>${v}</span>`));
    });
    list.appendChild(card);
  });
  t.replaceWith(list);
}

let mermaidP;
function loadMermaid() {
  if (!mermaidP) mermaidP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/mermaid.js';
    s.onload = () => res(window.mermaid); s.onerror = rej; document.head.appendChild(s);
  });
  return mermaidP;
}
async function renderMermaid(root) {
  const els = [...root.querySelectorAll('div.mermaid:not([data-done])')];
  if (!els.length) return;
  let m; try { m = await loadMermaid(); } catch { return; }
  const dark = isDark();
  m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'Figtree, sans-serif', flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false },
    themeVariables: dark ? { background: '#1B2529', primaryColor: '#23323A', primaryTextColor: '#E8EEF0', primaryBorderColor: '#3B4D4F', lineColor: '#9FB0B6', fontSize: '15px', clusterBkg: '#162024', clusterBorder: '#3B4D4F' }
      : { background: '#FFFFFF', primaryColor: '#EEF4F1', primaryTextColor: '#17221E', primaryBorderColor: '#B9CFC5', lineColor: '#5C6B65', fontSize: '15px', clusterBkg: '#F7FAF8', clusterBorder: '#CFDDD6' } });
  for (const e of els) {
    e.dataset.done = '1';
    try {
      const { svg } = await m.render('m' + Math.random().toString(36).slice(2), e.dataset.src); e.innerHTML = svg;
      const sv = e.querySelector('svg');
      const fig = e.closest('figure');
      if (sv && fig && sv.viewBox && sv.viewBox.baseVal && sv.viewBox.baseVal.width) {
        const w = Math.round(sv.viewBox.baseVal.width);
        sv.style.width = '100%'; sv.style.height = 'auto'; sv.style.maxWidth = w + 'px';
        if (w > fig.clientWidth * 1.15) {
          fig.classList.add('zoomable'); fig.setAttribute('role', 'button'); fig.tabIndex = 0; fig.setAttribute('aria-label', 'Diagram. Tap to zoom');
          const hint = document.createElement('p'); hint.className = 'swipe'; hint.textContent = 'Tap the diagram to zoom in';
          fig.after(hint);
          const toggle = () => { const z = fig.classList.toggle('zoomed'); sv.style.width = z ? w + 'px' : '100%'; hint.textContent = z ? 'Swipe to look around. Tap again to fit' : 'Tap the diagram to zoom in'; };
          fig.onclick = toggle; fig.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
        }
      }
    }
    catch { e.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = e.dataset.src; e.appendChild(pre); }
  }
}
function chartFrom(src) {
  let c; try { c = JSON.parse(src); } catch { return null; }
  if (!Array.isArray(c.bars) || !c.bars.length) return null;
  const max = Math.max(...c.bars.map((b) => Number(b.value) || 0)) || 1;
  const f = el('figure', 'chart');
  f.innerHTML = `${c.title ? `<span class="label">${esc(c.title)}</span>` : ''}${c.bars.map((b) => `<div class="bar"><span class="bar-l">${esc(b.label)}</span><span class="bar-t"><span style="width:${Math.max(2, 100 * (Number(b.value) || 0) / max)}%"></span></span><span class="bar-v">${esc(b.value)}${esc(c.unit || '')}</span></div>`).join('')}${c.source ? `<figcaption>Source: ${esc(c.source)}</figcaption>` : ''}`;
  return f;
}

/* ---------- daily brief parsing ---------- */
function stepType(label) {
  if (/TL;DR|news|stor/i.test(label)) return 'news';
  if (/^\W*Try it/i.test(label)) return 'try';
  if (/Quiz/i.test(label)) return 'quiz';
  if (/watch/i.test(label)) return 'watch';
  if (/🪜|Rung/i.test(label)) return 'rung';
  return 'prep';
}
function parseBrief(md) {
  const { fm, body } = splitFm(md);
  const lines = body.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines[0] && lines[0].startsWith('# ')) lines.shift();
  const secs = []; let cur = { heading: null, lines: [] };
  for (const l of lines) { if (/^## /.test(l)) { secs.push(cur); cur = { heading: l.slice(3).trim(), lines: [] }; } else cur.lines.push(l); }
  secs.push(cur);
  const pre = secs.shift().lines;
  const used = new Set();
  let todayLine = '', minimum = '', steps = [], tldr = [];
  pre.forEach((l, i) => {
    if (!todayLine && /^Today:/.test(l.trim())) { todayLine = l.trim().replace(/^Today:\s*/, ''); used.add(i); }
    if (/^⏱️?\s*Minimum today/.test(l.trim())) { minimum = stripEmoji(l).replace(/^Minimum today:\s*/i, ''); used.add(i); }
  });
  const howIdx = pre.findIndex((l) => l.includes('How to use today'));
  if (howIdx >= 0) {
    used.add(howIdx);
    let i = howIdx + 1; while (i < pre.length && !pre[i].trim()) used.add(i++);
    while (i < pre.length && pre[i].trim().startsWith('|')) {
      const cells = pre[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!/^:?-+:?$/.test(cells[0]) && cells[0] !== 'Section') steps.push({ raw: cells[0], device: stripEmoji(cells[1] || ''), time: stripEmoji(cells[2] || '') });
      used.add(i++);
    }
  }
  const tIdx = pre.findIndex((l, i) => !used.has(i) && /^\*\*.*TL;DR.*\*\*\s*$/.test(l.trim()));
  if (tIdx >= 0) {
    used.add(tIdx);
    let i = tIdx + 1; while (i < pre.length && !pre[i].trim()) used.add(i++);
    while (i < pre.length && (pre[i].startsWith('>') || (!pre[i].trim() && (pre[i + 1] || '').startsWith('>')))) { const t = pre[i].replace(/^>\s?/, '').trim(); if (t) tldr.push(stripEmoji(t)); used.add(i++); }
  }
  const rest = pre.filter((_, i) => !used.has(i)).join('\n');
  const news = rest.split(/^\s*---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 40).map(parseNews);
  const sections = secs.map((s) => ({ heading: stripEmoji(s.heading), md: s.lines.join('\n').replace(/\n\s*-{3,}\s*$/, '').trim(),
    kind: /🪜|rung/i.test(s.heading) ? 'rung' : /📺|watch/i.test(s.heading) ? 'watch' : /🎯|prep/i.test(s.heading) ? 'prep' : /📬|repl/i.test(s.heading) ? 'replies' : 'other' }));
  if (!steps.length) {
    if (news.length) steps.push({ raw: 'Read the stories', device: 'Phone', time: '' });
    for (const s of sections) if (['rung', 'prep', 'watch'].includes(s.kind)) steps.push({ raw: s.heading, device: '', time: '' });
  }
  steps.forEach((s) => { s.type = stepType(s.raw); s.label = cleanStep(s.raw, s.type); });
  const rung = sections.find((s) => s.kind === 'rung');
  let rungTitle = '', rungLead = '';
  if (rung) {
    const m = /^\*\*(.+?)\*\*\s*(.*)$/m.exec(rung.md);
    if (m) { rungTitle = stripEmoji(m[1]).replace(/\.$/, ''); rungLead = stripEmoji(m[2]); }
  }
  return { fm, todayLine: stripEmoji(todayLine), minimum, steps, tldr, news, sections, rungTitle, rungLead };
}
function cleanStep(raw, type) {
  let s = stripEmoji(raw).replace(/\s*\((read \+ diagram|optional)\)\s*/i, '').replace(/: reply in today's chat|: answer in the app/i, '');
  if (type === 'news') return 'Read ' + (/(\d+) news/.exec(s) ? /(\d+) news/.exec(s)[1] + ' stories' : 'the stories');
  if (type === 'quiz') return 'Answer the quiz';
  if (type === 'watch') return 'Pick a weekend watch';
  return s.replace(/^Prep:\s*/i, '');
}
function parseNews(chunk) {
  const lines = chunk.split('\n');
  let tag = '';
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines[0] && !lines[0].startsWith('**') && /·/.test(lines[0])) tag = lines.shift();
  let body = lines.join('\n').trim();
  let title = '', url = '';
  const h = /^\*\*\[(.+?)\]\((\S+?)\)\*\*\s*$/m.exec(body) || /^\*\*(.+?)\*\*\s*$/m.exec(body);
  if (h) { title = h[1]; url = h[2] || ''; body = body.replace(h[0], '').trim(); }
  const [cat, level] = stripEmoji(tag).split('·').map((x) => (x || '').trim());
  const what = /\*\*What happened:\*\*\s*([^\n]+)/.exec(body);
  return { category: cat || 'News', level: level || '', title: stripEmoji(title), url, md: body, teaser: what ? stripEmoji(what[1]).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '') : '' };
}
const CAT_TONE = { AI: 'violet', Backend: 'green', Cloud: 'blue', Data: 'amber', Jobs: 'peach' };
const levelName = (l) => (LEVELS[(l || '').trim()] ? LEVELS[l.trim()] : l);

/* ---------- shell ---------- */
const view = () => $('#view');
function shell({ tab = null, reading = false } = {}) {
  document.body.classList.toggle('reading', reading);
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  $('#fab').hidden = reading || !cfg.token;
}
function skeleton() { view().innerHTML = '<div class="pad"><div class="skeleton" style="width:40%;height:16px;margin-top:64px"></div><div class="skeleton" style="width:55%;height:36px"></div>' + '<div class="skeleton tall"></div>'.repeat(3) + '</div>'; }
function failView(e) {
  shell({ tab: null });
  view().innerHTML = `<div class="pad"><header class="hero"><h1>Can't load this</h1><p class="sub">${esc(e.offline ? "You're offline and this hasn't been downloaded yet. It loads next time you're online." : e.message)}</p></header><button class="btn primary" id="retry">Try again</button></div>`;
  $('#retry').onclick = () => sync().then(route);
}
const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
};
function syncChip() {
  return `<button class="sync" id="syncBtn" aria-label="Sync now"><span class="dot" id="syncDot"></span><span id="syncText"></span></button>`;
}
function wireTop() {
  const s = $('#syncBtn'); if (s) s.onclick = () => sync().then(() => toast('Synced'));
  const g = $('#gearBtn'); if (g) g.onclick = () => { location.hash = '#/settings'; };
  setSync();
}
function readerTop(title, backHref, right = '') {
  return `<div class="readtop"><a class="iconbtn" href="${esc(backHref)}" aria-label="Back">${ICON.back}</a><span class="readtop-title">${esc(title)}</span><span class="readtop-right">${right}</span></div>`;
}
function chips(items, current, base) {
  return `<div class="chips" role="toolbar">${items.map(([key, label]) => `<a role="button" aria-pressed="${key === current}" href="${base}${key ? '/' + key : ''}">${esc(label)}</a>`).join('')}</div>`;
}

function welcomeView() {
  shell({ tab: null });
  view().innerHTML = `<div class="pad"><header class="hero"><p class="eyebrow">Growth</p><h1>Briefs, quizzes and notes in one place</h1></header>
    <div class="card form"><p class="lead">Growth reads and writes your private <strong>second-brain</strong> repo. Claude's scheduled tasks put each morning's brief there; whatever you capture here lands in your Obsidian vault.</p>
    <ol class="steps">
      <li>Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained GitHub token</a>.</li>
      <li>Repository access: <strong>Only select repositories</strong>, then <code>second-brain</code>.</li>
      <li>Permissions: <strong>Contents: Read and write</strong>. Nothing else.</li>
      <li>Paste it in Settings. It stays on this device.</li></ol>
    <a class="btn primary block" href="#/settings">Open settings</a></div></div>`;
}

/* ---------- Today ---------- */
function planWeek(dateStr) {
  const start = new Date(2026, 8, 28); const d = parseDate(dateStr);
  const w = Math.floor((d - start) / (7 * 864e5)) + 1;
  return w >= 1 && w <= 10 ? `Week ${w} of 10` : '';
}
async function loadBrief(date) {
  const dailies = listDir(P.daily);
  if (!dailies.length) return null;
  const path = date ? P.daily + date + '.md' : dailies[0];
  const briefDate = path.slice(P.daily.length, -3);
  const md = await readFile(path);
  if (md == null) return { briefDate, missing: true };
  const log = (await readJson(P.log(briefDate), {})) || {};
  return { briefDate, b: parseBrief(md), log, latest: dailies[0].slice(P.daily.length, -3) };
}
const stepHref = (date, s) => ({ news: `#/b/${date}/news/0`, rung: `#/b/${date}/rung`, try: `#/b/${date}/rung`, quiz: `#/b/${date}/rung/quiz`, watch: `#/b/${date}/watch`, prep: `#/b/${date}/prep` }[s.type]);

async function todayView(date) {
  shell({ tab: 'today' }); skeleton();
  let data; try { data = await loadBrief(date); } catch (e) { failView(e); return; }
  const v = view();
  if (!data) { v.innerHTML = `<div class="pad"><header class="hero"><div class="hero-row"><h1>Today</h1>${syncChip()}</div><p class="sub">No briefs yet. The next one arrives at 7:00 on a weekday.</p></header></div>`; wireTop(); return; }
  if (data.missing) { v.innerHTML = `<div class="pad"><header class="hero"><h1>No brief for ${esc(fmtDate(data.briefDate))}</h1></header><a class="btn" href="#/today">Go to the newest</a></div>`; return; }
  const { briefDate, b, log, latest } = data;
  const done = log.done || {};
  const steps = b.steps;
  const doneCount = steps.filter((s) => done[s.type]).length;
  const next = steps.find((s) => !done[s.type] && s.type !== 'try');
  const pct = steps.length ? Math.round(100 * doneCount / steps.length) : 0;
  const isLatest = briefDate === latest;
  const stale = isLatest && briefDate !== localDate();

  let html = `<div class="pad">
    <header class="hero">
      <div class="hero-row"><p class="eyebrow">${esc(fmtDate(briefDate))}${planWeek(briefDate) ? ' · ' + esc(planWeek(briefDate)) : ''}</p><div class="hero-actions">${syncChip()}<button class="iconbtn" id="gearBtn" aria-label="Settings">${ICON.gear}</button></div></div>
      <div class="hero-row"><h1>${isLatest && !stale ? 'Today' : esc(fmtDate(briefDate, true).split(' ')[0])}</h1>
        <span class="ring" role="img" aria-label="${doneCount} of ${steps.length} done" style="--p:${pct}"><span>${doneCount}/${steps.length}</span></span></div>
      ${stale ? '<p class="sub">Newest brief. The next one arrives at 7:00 on a weekday.</p>' : ''}
      ${!isLatest ? `<p class="sub">A past brief. <a href="#/today">Go to today</a></p>` : ''}
    </header>`;

  if (next) {
    const sub = next.type === 'rung' ? 'A short read with a diagram, then two quiz questions.' : next.type === 'news' ? (b.tldr[0] || '') : next.type === 'quiz' ? 'Two short questions. Tomorrow\'s brief grades them.' : next.type === 'prep' ? 'Tick it off when you finish, so the Sunday review counts it.' : '';
    const title = next.type === 'rung' && b.rungTitle ? b.rungTitle.replace(/^.*?:\s*/, '') : next.label;
    html += `<a class="upnext" href="${stepHref(briefDate, next)}">
      <span class="upnext-meta">Up next · ${esc([next.time, next.device].filter(Boolean).join(' · ').toLowerCase())}</span>
      <span class="upnext-title">${esc(title)}</span>
      ${sub ? `<span class="upnext-sub">${esc(sub)}</span>` : ''}
      <span class="btn primary">${next.type === 'quiz' ? 'Answer' : next.type === 'prep' ? 'Open task' : 'Start reading'}</span></a>`;
  } else if (steps.length) {
    html += `<div class="upnext done"><span class="upnext-title">All done for today</span><span class="upnext-sub">Every rung ticked. Tomorrow's brief picks up from here.</span></div>`;
  }

  html += `<section class="card list" aria-label="Your plan"><div class="list-head"><h2>Your plan</h2><span class="muted">${doneCount} of ${steps.length} done</span></div>
    ${steps.map((s) => `<div class="row ${done[s.type] ? 'is-done' : ''} ${s === next ? 'is-next' : ''}" data-type="${s.type}">
      <button class="check" aria-pressed="${!!done[s.type]}" aria-label="Mark ${esc(s.label)} done">${ICON.check}</button>
      <a class="row-main" href="${stepHref(briefDate, s)}"><span class="row-title">${esc(s.label)}</span><span class="row-sub">${esc([s.device, s.time].filter(Boolean).join(' · '))}</span></a>
      <span class="row-chev">${ICON.chev}</span></div>`).join('')}
    ${b.minimum ? `<p class="list-foot">Busy day? ${esc(b.minimum)}</p>` : ''}</section>`;

  if (b.news.length) {
    html += `<div class="sect-head"><h2>Stories</h2><span class="muted">${b.news.length}</span></div><div class="hscroll">
      ${b.news.map((n, i) => `<a class="story tone-${CAT_TONE[n.category] || 'green'}" href="#/b/${briefDate}/news/${i}"><span class="story-cat">${esc(n.category)}</span><span class="story-title">${esc(n.title)}</span></a>`).join('')}</div>`;
  }
  const replies = b.sections.find((s) => s.kind === 'replies');
  if (replies) html += `<a class="card linkrow" href="#/b/${briefDate}/replies"><span class="linkrow-icon">${ICON.chat}</span><span class="row-main"><span class="row-title">Claude answered you</span><span class="row-sub">Replies to your answers and questions</span></span><span class="row-chev">${ICON.chev}</span></a>`;
  html += `<div class="sect-head"><h2>Message Claude</h2></div>`;
  html += `</div>`;
  v.innerHTML = html;
  const padEl = v.querySelector('.pad');
  padEl.appendChild(replyBlock(log, P.log(briefDate), briefDate, 'Mock answers, questions about the rung, or what got in the way. The next brief answers.'));
  wireTop();
  v.querySelectorAll('.row[data-type]').forEach((r) => {
    const type = r.dataset.type;
    r.querySelector('.check').onclick = async () => {
      const now = !r.classList.contains('is-done');
      r.classList.toggle('is-done', now); r.querySelector('.check').setAttribute('aria-pressed', now);
      await enqueue({ kind: 'jsonSet', path: P.log(briefDate), keys: ['done', type], value: now, init: { date: briefDate }, message: `app: ${type} ${now ? 'done' : 'not done'} ${briefDate}` });
      todayView(date);
    };
  });
}

function replyBlock(log, logPath, date, hint) {
  const s = el('section', 'card reply');
  const replies = log.replies || [];
  s.innerHTML = `${replies.length ? `<div class="sent-list">${replies.map((r) => `<div class="bubble"><p>${esc(r.text).replace(/\n/g, '<br>')}</p><span class="muted">${esc(r.kind === 'ask' ? 'Asked' : 'Sent')} ${esc(fmtTime(r.at))}${log.claude && (log.claude.answered || []).includes(r.at) ? ' · answered' : ''}</span></div>`).join('')}</div>` : ''}
    <label class="field"><span class="sr">Message for Claude</span><textarea id="replyText" rows="3" placeholder="Type, or use voice typing"></textarea></label>
    <p class="hint">${esc(hint)}</p>
    <button class="btn primary" id="sendReply">Send to Claude</button>`;
  $('#sendReply', s).onclick = async () => {
    const text = $('#replyText', s).value.trim(); if (!text) return;
    await enqueue({ kind: 'jsonPush', path: logPath, keys: ['replies'], item: { at: new Date().toISOString(), text, kind: 'reply' }, init: { date }, message: `app: reply ${date}` });
    toast('Sent. The next brief answers it.'); route();
  };
  return s;
}

/* ---------- brief screens ---------- */
async function storyView(date, idx) {
  shell({ reading: true }); skeleton();
  let data; try { data = await loadBrief(date); } catch (e) { failView(e); return; }
  if (!data || data.missing) return failView(new HttpError(404, 'This brief is not in the vault.'));
  const { b, log } = data; const i = Number(idx) || 0; const n = b.news[i];
  if (!n) { location.hash = `#/today/${date}`; return; }
  const v = view();
  v.innerHTML = readerTop(`Story ${i + 1} of ${b.news.length}`, `#/today${date === data.latest ? '' : '/' + date}`) +
    `<article class="reader"><div class="tags"><span class="tag tone-${CAT_TONE[n.category] || 'green'}">${esc(n.category)}</span>${n.level ? `<span class="tag">${esc(levelName(n.level))}</span>` : ''}</div>
    <h1>${esc(n.title)}</h1><div class="body"></div></article>
    <div class="actionbar">${n.url ? `<a class="btn" href="${esc(n.url)}" target="_blank" rel="noopener">Source</a>` : ''}
      ${i + 1 < b.news.length ? `<a class="btn primary grow" href="#/b/${date}/news/${i + 1}">Next story</a>` : `<button class="btn primary grow" id="doneNews">Done with stories</button>`}</div>`;
  renderRich(n.md, $('.body', v));
  const dn = $('#doneNews');
  if (dn) dn.onclick = async () => {
    await enqueue({ kind: 'jsonSet', path: P.log(date), keys: ['done', 'news'], value: true, init: { date }, message: `app: news done ${date}` });
    location.hash = `#/today${date === data.latest ? '' : '/' + date}`;
  };
}

async function sectionView(date, kind, anchor) {
  shell({ reading: true }); skeleton();
  let data; try { data = await loadBrief(date); } catch (e) { failView(e); return; }
  if (!data || data.missing) return failView(new HttpError(404, 'This brief is not in the vault.'));
  const { b, log } = data;
  const sec = b.sections.find((s) => s.kind === kind);
  const back = `#/today${date === data.latest ? '' : '/' + date}`;
  if (!sec) { location.hash = back; return; }
  const done = (log.done || {})[kind === 'replies' ? 'x' : kind];
  const titles = { rung: b.rungTitle ? b.rungTitle.replace(/^.*?:\s*/, '') : sec.heading, prep: 'Interview prep', watch: 'Weekend watch', replies: 'Claude answered' };
  const kicker = { rung: b.rungTitle ? b.rungTitle.split(':')[0] : 'Today\'s rung', prep: fmtDate(date) + (planWeek(date) ? ' · ' + planWeek(date) : ''), watch: 'For the weekend', replies: fmtDate(date) }[kind];
  let md = sec.md;
  if (kind === 'rung') md = md.replace(/^\*\*.+?\*\*[^\n]*\n?/, '');
  const v = view();
  v.innerHTML = readerTop(kicker, back) + `<span class="progress"><span id="readProg"></span></span>
    <article class="reader"><h1>${esc(titles[kind])}</h1><div class="body"></div></article>
    ${kind === 'replies' ? '' : `<div class="actionbar"><button class="btn ${done ? '' : 'primary'} grow" id="markDone">${done ? 'Done ✓ · tap to undo' : kind === 'rung' ? 'Mark rung read' : kind === 'prep' ? 'Mark prep done' : 'Mark done'}</button></div>`}`;
  const body = $('.body', v);
  renderRich(md, body);
  if (kind === 'rung') enhanceQuiz(body, log, P.log(date), date);
  if (kind === 'prep') body.appendChild(replyBlock(log, P.log(date), date, 'Thursday mock answers or anything about today\'s task. The next brief scores and answers it.'));
  const mk = $('#markDone');
  if (mk) mk.onclick = async () => {
    await enqueue({ kind: 'jsonSet', path: P.log(date), keys: ['done', kind], value: !done, init: { date }, message: `app: ${kind} ${!done ? 'done' : 'not done'} ${date}` });
    toast(!done ? 'Ticked off' : 'Unticked'); location.hash = back;
  };
  const prog = $('#readProg');
  const onScroll = () => { if (!document.body.contains(prog)) { window.removeEventListener('scroll', onScroll); return; } const h = document.documentElement.scrollHeight - innerHeight; prog.style.width = (h > 0 ? Math.min(100, 100 * scrollY / h) : 100) + '%'; };
  window.addEventListener('scroll', onScroll, { passive: true });
  if (anchor === 'quiz') setTimeout(() => { const q = $('.quiz'); if (q) q.scrollIntoView({ block: 'start' }); }, 80);
}

function enhanceQuiz(body, log, logPath, date) {
  const p = [...body.querySelectorAll('p')].find((x) => /^\s*Quiz\b/.test(x.textContent));
  if (!p) return;
  let ol = p.nextElementSibling; while (ol && ol.tagName !== 'OL') ol = ol.nextElementSibling;
  if (!ol) return;
  const qs = [...ol.children].map((li) => li.innerHTML);
  const prev = log.quiz || {};
  const box = el('section', 'quiz');
  box.innerHTML = `<div class="quiz-head"><h2>Quiz</h2><span class="muted">${qs.length} questions · graded tomorrow</span></div>
    ${qs.map((q, i) => `<div class="q"><span class="q-n">Question ${i + 1}</span><div class="q-text">${q}</div><label class="field"><span class="sr">Your answer to question ${i + 1}</span><textarea id="qa${i}" rows="3" placeholder="A line or two is enough">${esc((prev.answers || [])[i] || '')}</textarea></label></div>`).join('')}
    <div class="feel" role="group" aria-label="How did the rung feel?">${['Too easy', 'About right', 'Too hard'].map((f) => `<button type="button" aria-pressed="${prev.feel === f.toLowerCase()}">${f}</button>`).join('')}</div>
    ${prev.at ? `<p class="hint ok">Sent ${esc(fmtTime(prev.at))}. Edit and send again if you like.</p>` : ''}
    <button class="btn primary block" type="button" id="sendQuiz">${prev.at ? 'Update answers' : 'Send answers'}</button>`;
  p.remove(); ol.replaceWith(box);
  let feel = prev.feel || '';
  box.querySelectorAll('.feel button').forEach((btn) => {
    btn.onclick = () => { feel = btn.getAttribute('aria-pressed') === 'true' ? '' : btn.textContent.toLowerCase(); box.querySelectorAll('.feel button').forEach((x) => x.setAttribute('aria-pressed', x.textContent.toLowerCase() === feel)); };
  });
  $('#sendQuiz', box).onclick = async () => {
    const answers = qs.map((_, i) => $(`#qa${i}`, box).value.trim());
    if (!answers.some(Boolean) && !feel) { toast('Write at least one answer first'); return; }
    const at = new Date().toISOString();
    const qtext = [...ol.children].map((li) => li.textContent.trim());
    await enqueue({ kind: 'jsonSet', path: logPath, keys: ['quiz'], value: { questions: qtext, answers, feel, at }, init: { date }, message: `app: quiz answers ${date}` });
    await enqueue({ kind: 'jsonSet', path: logPath, keys: ['done', 'quiz'], value: true, init: { date }, message: `app: quiz done ${date}` });
    $('#sendQuiz', box).textContent = 'Update answers';
    toast('Answers sent. Claude grades them in the next brief.');
  };
}

/* ---------- notes, learn, prep ---------- */
const LEARN = [['', 'Ladder'], ['briefs', 'Past briefs'], ['weekly', 'Weekly reviews']];
const PREP = [['', 'Plan'], ['mocks', 'Mocks'], ['stories', 'Story bank'], ['presence', 'Presence']];
const LISTS = [['', 'To-do'], ['reading', 'Reading'], ['watch', 'Watch'], ['notes', 'Notes'], ['vault', 'Vault']];

function pageHead(title, sub = '') {
  return `<header class="hero"><div class="hero-row"><h1>${esc(title)}</h1><div class="hero-actions">${syncChip()}<button class="iconbtn" id="gearBtn" aria-label="Settings">${ICON.gear}</button></div></div>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</header>`;
}
async function noteView(path, { tab, title, seg, segBase, segItems }) {
  shell({ tab }); skeleton();
  let md; try { md = await readFile(path); } catch (e) { failView(e); return; }
  let { body } = splitFm(md || '');
  body = body.replace(/^>\s*🟢 Live note.*\n+/m, '').replace(/^#\s+.*\n+/, '');
  const v = view();
  v.innerHTML = `<div class="pad">${pageHead(title)}${segItems ? chips(segItems, seg, segBase) : ''}<article class="card notebody"></article></div>`;
  renderRich(md == null ? '_This note does not exist yet._' : body, $('.notebody', v));
  wireTop();
}
function fileRows(paths, hrefFor, labelFor, metaFor) {
  if (!paths.length) return '<p class="empty">Nothing here yet.</p>';
  return paths.map((p) => `<a class="row" href="${esc(hrefFor(p))}"><span class="row-main"><span class="row-title">${esc(labelFor(p))}</span>${metaFor ? `<span class="row-sub">${esc(metaFor(p))}</span>` : ''}</span><span class="row-chev">${ICON.chev}</span></a>`).join('');
}
function listPage(tab, title, segItems, seg, segBase, rowsHtml) {
  shell({ tab });
  view().innerHTML = `<div class="pad">${pageHead(title)}${chips(segItems, seg, segBase)}<section class="card list">${rowsHtml}</section></div>`;
  wireTop();
}

async function jobsView(filter = 'active') {
  shell({ tab: 'jobs' }); skeleton();
  let data; try { data = await readJson(P.jobs, null); } catch (e) { failView(e); return; }
  const v = view();
  if (!data || !data.jobs || !data.jobs.length) { v.innerHTML = `<div class="pad">${pageHead('Jobs', 'No roles yet. The scan adds them Monday, Wednesday and Friday evenings.')}</div>`; wireTop(); return; }
  const closed = ['Rejected', 'Not for me'];
  const counts = (st) => data.jobs.filter((j) => j.status === st).length;
  const filters = [['active', `Open ${data.jobs.filter((j) => !closed.includes(j.status)).length}`], ...data.statuses.filter((s) => counts(s)).map((s) => [s, `${s} ${counts(s)}`])];
  const list = data.jobs.filter((j) => (filter === 'active' ? !closed.includes(j.status) : j.status === filter))
    .sort((a, b) => (b.found || '').localeCompare(a.found || '') || (b.fit || 0) - (a.fit || 0));
  v.innerHTML = `<div class="pad">${pageHead('Jobs', 'From the Mon, Wed and Fri scan. Pune first, then remote-India.')}
    <div class="chips" role="toolbar">${filters.map(([k, l]) => `<a role="button" aria-pressed="${k === filter}" href="#/jobs/${encodeURIComponent(k)}">${esc(l)}</a>`).join('')}</div>
    <div id="jobList"></div>
    ${data.scans && data.scans.length ? `<details class="card fold"><summary><span>Scan notes</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="fold-body">${data.scans.slice(-3).reverse().map((s) => `<p><strong>${esc(fmtDate(s.date))}</strong> ${inline(s.note)}</p>`).join('')}</div></details>` : ''}</div>`;
  wireTop();
  const box = $('#jobList');
  if (!list.length) box.innerHTML = '<p class="empty">No roles with this status.</p>';
  for (const j of list) {
    const card = el('article', 'card job');
    card.innerHTML = `<div class="job-top"><span class="fit ${j.fit >= 8 ? 'hi' : ''}" aria-label="Fit ${esc(j.fit)} out of 10">${esc(j.fit)}</span>
        <div class="job-id"><h3>${esc(j.role)}</h3><p>${esc(j.company)} · ${esc(j.location)}</p></div></div>
      <p class="job-why">${inline(j.why)}</p>
      <details class="fold inset"><summary><span>Pay, culture and gaps</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
        <div class="fold-body"><div class="kv"><span class="label">Pay</span><p>${inline(j.pay)}</p></div><div class="kv"><span class="label">Culture and stability</span><p>${inline(j.culture)}</p></div><div class="kv"><span class="label">Gap to close</span><p>${inline(j.gap)}</p></div></div></details>
      <div class="job-foot"><label class="field compact"><span class="sr">Status</span><select>${data.statuses.map((s) => `<option ${s === j.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <a class="btn" href="${esc(j.link)}" target="_blank" rel="noopener">Posting ${ICON.ext}</a></div>`;
    card.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    $('select', card).onchange = async (e) => {
      await enqueue({ kind: 'jobStatus', path: P.jobs, id: j.id, status: e.target.value, at: new Date().toISOString(), message: `app: ${j.company} ${e.target.value}` });
      toast(`${j.company}: ${e.target.value}`);
    };
    box.appendChild(card);
  }
}

async function todoView() {
  shell({ tab: 'inbox' }); skeleton();
  let md; try { md = await readFile(P.todo); } catch (e) { failView(e); return; }
  const v = view();
  v.innerHTML = `<div class="pad">${pageHead('Lists')}${chips(LISTS, '', '#/inbox')}
    <form class="card addrow" id="quickTask"><label class="field"><span class="sr">New task</span><input type="text" id="qt" placeholder="Add a task" autocomplete="off"></label><button class="btn primary" type="submit">Add</button></form><div id="groups"></div></div>`;
  wireTop();
  $('#quickTask').onsubmit = async (e) => {
    e.preventDefault(); const t = $('#qt').value.trim(); if (!t) return;
    await enqueue({ kind: 'addLine', path: P.todo, section: 'Now', line: `- [ ] ${t}`, message: 'app: add task' });
    toast('Task added'); todoView();
  };
  const groups = []; let g = null;
  for (const line of (md || '').split('\n')) {
    const h = /^##\s+(.*)$/.exec(line); if (h) { g = { name: h[1], tasks: [] }; groups.push(g); continue; }
    const m = /^\s*- \[( |x|X)\] (.*)$/.exec(line);
    if (m) { if (!g) { g = { name: 'Tasks', tasks: [] }; groups.push(g); } g.tasks.push({ done: m[1] !== ' ', text: m[2] }); }
  }
  const box = $('#groups');
  const shown = groups.filter((x) => x.tasks.length);
  if (!shown.length) box.innerHTML = '<p class="empty">No tasks yet. Add one above.</p>';
  for (const grp of shown) {
    const s = el('section', 'card list'); s.innerHTML = `<div class="list-head"><h2>${esc(grp.name)}</h2><span class="muted">${grp.tasks.filter((t) => !t.done).length} open</span></div>`;
    for (const t of grp.tasks) {
      const due = /📅\s*(\d{4}-\d{2}-\d{2})/.exec(t.text);
      const tags = (t.text.match(/#[\w/-]+/g) || []).map((x) => x.slice(1));
      const clean = t.text.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '').replace(/#[\w/-]+/g, '').trim();
      const row = el('div', 'row' + (t.done ? ' is-done' : ''));
      row.innerHTML = `<button class="check" aria-pressed="${t.done}" aria-label="Done">${ICON.check}</button><span class="row-main"><span class="row-title"></span><span class="row-sub">${esc([due ? 'Due ' + fmtDate(due[1]) : '', tags.join(', ')].filter(Boolean).join(' · '))}</span></span>`;
      $('.row-title', row).innerHTML = DOMPurify.sanitize(marked.parseInline(preprocess(clean)));
      $('.check', row).onclick = async () => {
        const now = !row.classList.contains('is-done'); row.classList.toggle('is-done', now);
        await enqueue({ kind: 'toggle', path: P.todo, text: t.text, checked: now, message: `app: ${now ? 'done' : 'reopen'} task` });
      };
      s.appendChild(row);
    }
    box.appendChild(s);
  }
}

async function linkListView(which) {
  const path = which === 'reading' ? P.reading : P.watch;
  shell({ tab: 'inbox' }); skeleton();
  let md; try { md = await readFile(path); } catch (e) { failView(e); return; }
  const v = view();
  const groups = []; let g = null;
  for (const line of splitFm(md || '').body.split('\n')) {
    const h = /^##\s+(.*)$/.exec(line); if (h) { g = { name: h[1], items: [] }; groups.push(g); continue; }
    const m = /^\s*- (?:\[[ xX]\] )?(.*)$/.exec(line); if (m && g) g.items.push(m[1]);
  }
  v.innerHTML = `<div class="pad">${pageHead('Lists')}${chips(LISTS, which, '#/inbox')}
    <form class="card addrow" id="quickLink"><label class="field"><span class="sr">Link</span><input type="url" id="ql" placeholder="Paste a link to ${which === 'reading' ? 'read' : 'watch'}" inputmode="url"></label><button class="btn primary" type="submit">Add</button></form>
    ${groups.map((gr) => `<section class="card list"><div class="list-head"><h2>${esc(gr.name)}</h2><span class="muted">${gr.items.length}</span></div>${gr.items.length ? gr.items.map((it) => `<div class="row"><span class="row-main"><span class="row-title">${inline(it.replace(/#from-app/, ''))}</span></span></div>`).join('') : '<p class="empty">Empty</p>'}</section>`).join('')}</div>`;
  wireTop();
  v.querySelectorAll('.row-title a').forEach((a) => { if (!a.getAttribute('href').startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; } });
  $('#quickLink').onsubmit = (e) => { e.preventDefault(); openCapture('link', { url: $('#ql').value.trim(), list: which }); };
}

function vaultView(dir = '') {
  const prefix = dir ? dir + '/' : '';
  const dirs = new Set(), files = [];
  for (const p of Object.keys(tree.files)) {
    if (!p.startsWith(prefix)) continue;
    const parts = p.slice(prefix.length).split('/');
    if (HIDDEN_DIRS.includes(parts[0]) || parts[0].startsWith('.')) continue;
    if (parts.length > 1) dirs.add(parts[0]); else if (/\.(md|json)$/.test(parts[0])) files.push(p);
  }
  const up = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
  listPage('inbox', 'Lists', LISTS, 'vault', '#/inbox',
    (dir ? `<a class="row" href="${up ? '#/inbox/vault/' + encodeURIComponent(up) : '#/inbox/vault'}"><span class="row-main"><span class="row-title">Up one folder</span><span class="row-sub">${esc(dir)}</span></span></a>` : '') +
    [...dirs].sort().map((d) => `<a class="row" href="#/inbox/vault/${encodeURIComponent(prefix + d)}"><span class="row-main"><span class="row-title">${esc(d.replace(/^\d+\s+/, ''))}</span><span class="row-sub">Folder</span></span><span class="row-chev">${ICON.chev}</span></a>`).join('') +
    files.sort().map((p) => `<a class="row" href="#/file/${encodeURIComponent(p)}"><span class="row-main"><span class="row-title">${esc(p.slice(prefix.length).replace(/\.md$/, ''))}</span></span><span class="row-chev">${ICON.chev}</span></a>`).join('') +
    (!dirs.size && !files.length ? '<p class="empty">Empty folder.</p>' : ''));
}

async function fileView(path) {
  shell({ reading: true }); skeleton();
  let text; try { text = await readFile(path); } catch (e) { failView(e); return; }
  const v = view();
  const name = path.split('/').pop().replace(/\.md$/, '');
  v.innerHTML = `<div class="readtop"><button class="iconbtn" id="backBtn" aria-label="Back">${ICON.back}</button><span class="readtop-title">${esc(path.split('/').slice(0, -1).join(' / ').replace(/\d+\s/g, ''))}</span><span></span></div><article class="reader"><div class="body"></div></article>`;
  $('#backBtn').onclick = () => history.back();
  const body = $('.body', v);
  if (text == null) body.innerHTML = '<p class="empty">This file is not in the vault.</p>';
  else if (path.endsWith('.json')) { const pre = el('pre'); pre.textContent = text; body.appendChild(pre); }
  else {
    let md = splitFm(text).body;
    if (!/^#\s/.test(md.trim())) md = `# ${name}\n\n` + md;
    renderRich(md, body);
  }
}

function settingsView() {
  shell({ tab: null });
  view().innerHTML = `${readerTop('Settings', '#/today')}<div class="pad">
    <form class="card form" id="cfgForm">
      <label class="field"><span>GitHub token</span><input type="password" id="cToken" value="${esc(cfg.token)}" autocomplete="off" placeholder="github_pat_…"></label>
      <label class="field"><span>Repository</span><input type="text" id="cRepo" value="${esc(cfg.repo)}" autocapitalize="off"></label>
      <label class="field"><span>Branch</span><input type="text" id="cBranch" value="${esc(cfg.branch)}" autocapitalize="off"></label>
      <button class="btn primary block" type="submit">Save and connect</button>
      <p class="hint" id="cfgMsg">Stored only in this browser on this device.</p>
    </form>
    <section class="card form"><span class="label">Appearance</span>
      <div class="seg3" role="group" aria-label="Theme">${[['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-theme="${k}" aria-pressed="${cfg.theme === k}">${l}</button>`).join('')}</div>
      <span class="label">Text size</span>
      <div class="seg3" role="group" aria-label="Text size">${[['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']].map(([k, l]) => `<button type="button" data-size="${k}" aria-pressed="${(cfg.size || 'm') === k}">${l}</button>`).join('')}</div>
    </section>
    <section class="card form"><span class="label">Sync</span>
      <p>${queue.length ? `${queue.length} change${queue.length > 1 ? 's' : ''} waiting to save.` : 'Everything you added is saved to GitHub.'}${lastSync ? ' Last sync ' + esc(fmtTime(lastSync)) + '.' : ''}</p>
      <div class="btnrow"><button class="btn" id="syncNow">Sync now</button><button class="btn" id="clearCache">Download again</button></div>
      <p class="hint">New token: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a>. Only select repositories: second-brain. Permissions: Contents read and write.</p>
    </section></div>`;
  view().querySelectorAll('[data-theme]').forEach((b) => { b.onclick = () => { cfg.theme = b.dataset.theme; ls.set('growth.cfg', cfg); applyTheme(); settingsView(); }; });
  view().querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { cfg.size = b.dataset.size; ls.set('growth.cfg', cfg); applyTheme(); settingsView(); }; });
  $('#cfgForm').onsubmit = async (e) => {
    e.preventDefault();
    cfg.token = $('#cToken').value.trim(); cfg.repo = $('#cRepo').value.trim(); cfg.branch = $('#cBranch').value.trim() || 'main';
    ls.set('growth.cfg', cfg);
    const msg = $('#cfgMsg'); msg.textContent = 'Connecting…';
    try {
      const r = await gh(`/repos/${cfg.repo}`); if (!r.ok) await failWith(r);
      const j = await r.json();
      msg.textContent = (!j.permissions || !j.permissions.push) ? 'Connected, but this token cannot write. Give it Contents: Read and write.' : `Connected to ${j.full_name}.`;
      tree = { etag: null, files: {}, at: 0 }; await sync({ rerender: false });
      setTimeout(() => { location.hash = '#/today'; }, 700);
    } catch (err) { msg.textContent = err.message; }
  };
  $('#syncNow').onclick = () => sync().then(() => toast('Synced'));
  $('#clearCache').onclick = async () => { await kv.clear(); tree = { etag: null, files: {}, at: 0 }; saveTree(); await sync(); toast('Downloaded again'); };
}

/* ---------- capture sheet ---------- */
const KINDS = [['task', 'Task'], ['note', 'Note'], ['idea', 'Idea'], ['link', 'Link'], ['ask', 'Ask Claude']];
function openCapture(kind = 'task', prefill = {}) {
  const sheet = $('#sheet'), bd = $('#sheetBackdrop');
  const fields = {
    task: `<label class="field"><span>Task</span><input type="text" id="fText" placeholder="What needs doing?"></label>
      <div class="two"><label class="field"><span>Due (optional)</span><input type="date" id="fDue"></label>
      <label class="field"><span>Area</span><select id="fArea"><option>career</option><option>learning</option><option>personal</option><option>home</option><option>travel</option></select></label></div>`,
    note: `<label class="field"><span>Title</span><input type="text" id="fTitle" placeholder="Short title"></label><label class="field"><span>Note</span><textarea id="fBody" rows="5" placeholder="Anything worth keeping"></textarea></label>`,
    idea: `<label class="field"><span>Idea</span><input type="text" id="fTitle" placeholder="One line"></label><label class="field"><span>Why it matters (optional)</span><textarea id="fBody" rows="3"></textarea></label>`,
    link: `<label class="field"><span>Link</span><input type="url" id="fUrl" placeholder="https://" value="${esc(prefill.url || '')}"></label><label class="field"><span>Title</span><input type="text" id="fTitle" placeholder="What is it?"></label>
      <label class="field"><span>Add to</span><select id="fList"><option value="reading" ${prefill.list !== 'watch' ? 'selected' : ''}>Reading list</option><option value="watch" ${prefill.list === 'watch' ? 'selected' : ''}>Watch list</option></select></label>
      <label class="field"><span>Why save it (optional)</span><input type="text" id="fWhy"></label>`,
    ask: `<label class="field"><span>Question or request</span><textarea id="fBody" rows="5" placeholder="e.g. Explain vacuum again with a Kafka analogy"></textarea></label><p class="hint">Claude answers in the next morning's brief.</p>`,
  };
  sheet.innerHTML = `<div class="grip"></div><h2 id="sheetTitle">Capture</h2>
    <div class="chips" role="group">${KINDS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
    <form id="capForm">${fields[kind]}<div class="btnrow end"><button type="button" class="btn" id="capCancel">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
  sheet.hidden = false; bd.hidden = false;
  sheet.querySelectorAll('.chips button').forEach((b) => { b.onclick = () => openCapture(b.dataset.k, prefill); });
  const first = sheet.querySelector('form input, form textarea'); if (first) setTimeout(() => (prefill.url && kind === 'link' ? $('#fTitle') : first).focus(), 60);
  $('#capCancel').onclick = closeSheet;
  $('#capForm').onsubmit = async (e) => { e.preventDefault(); try { await saveCapture(kind); closeSheet(); route(); } catch (err) { toast(err.message); } };
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; }

async function saveCapture(kind) {
  const today = localDate(); const val = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  if (kind === 'task') {
    const t = val('fText'); if (!t) throw new Error('Write the task first');
    const due = val('fDue');
    await enqueue({ kind: 'addLine', path: P.todo, section: 'Now', line: `- [ ] ${t}${due ? ' 📅 ' + due : ''} #${val('fArea')}`, message: 'app: add task' });
    toast('Task added');
  } else if (kind === 'note') {
    const title = val('fTitle') || val('fBody').split('\n')[0].slice(0, 50); if (!title) throw new Error('Give the note a title or some text');
    const content = `---\ntype: note\ntags: [inbox]\ncreated: ${today}\nsource: growth-app\n---\n\n# ${title}\n\n${val('fBody')}\n`;
    await enqueue({ kind: 'create', path: `${P.inbox}${today} ${slugTitle(title)}.md`, content, message: `capture: ${title}` });
    toast('Note saved to Inbox');
  } else if (kind === 'idea') {
    const title = val('fTitle'); if (!title) throw new Error('Write the idea first');
    const content = `---\ntype: idea\ncreated: ${today}\nstatus: raw\ntags: [idea]\nsource: growth-app\n---\n\n# ${title}\n\n## The idea\n${title}\n\n## Why it matters\n${val('fBody')}\n\n## Next step\n`;
    await enqueue({ kind: 'create', path: `${P.ideas}${slugTitle(title)}.md`, content, message: `capture: idea ${title}` });
    toast('Idea saved');
  } else if (kind === 'link') {
    const url = val('fUrl'); if (!/^https?:\/\//.test(url)) throw new Error('Paste a full link starting with https://');
    const title = (val('fTitle') || url).replace(/[[\]]/g, ''); const why = val('fWhy');
    const watch = val('fList') === 'watch';
    await enqueue({ kind: 'addLine', path: watch ? P.watch : P.reading, section: watch ? 'To watch' : 'To read', line: `- [${title}](${url})${why ? ' — ' + why : ''} #from-app`, message: `capture: ${title}` });
    toast(watch ? 'Added to watch list' : 'Added to reading list');
  } else if (kind === 'ask') {
    const text = val('fBody'); if (!text) throw new Error('Write your question first');
    await enqueue({ kind: 'jsonPush', path: P.log(today), keys: ['replies'], item: { at: new Date().toISOString(), text, kind: 'ask' }, init: { date: today }, message: 'app: ask Claude' });
    toast('Sent. Claude answers in the next brief.');
  }
}

/* ---------- router ---------- */
async function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [root, ...rest] = h.split('/');
  const arg = rest.join('/');
  window.scrollTo(0, 0);
  if (root === 'settings') return settingsView();
  if (!cfg.token) return welcomeView();
  if (!Object.keys(tree.files).length) { skeleton(); await sync({ rerender: false }); if (!Object.keys(tree.files).length) return failView(new HttpError(0, 'Could not reach GitHub. Check your connection and the token in Settings.')); }
  switch (root) {
    case 'b': {
      const [date, kind, extra] = rest;
      if (kind === 'news') return storyView(date, extra);
      return sectionView(date, kind, extra);
    }
    case 'learn':
      if (arg === 'briefs') return listPage('learn', 'Learn', LEARN, 'briefs', '#/learn', fileRows(listDir(P.daily), (p) => '#/today/' + p.slice(P.daily.length, -3), (p) => fmtDate(p.slice(P.daily.length, -3), true), (p) => planWeek(p.slice(P.daily.length, -3))));
      if (arg === 'weekly') return listPage('learn', 'Learn', LEARN, 'weekly', '#/learn', fileRows(listDir(P.weekly), (p) => '#/file/' + encodeURIComponent(p), (p) => 'Week ' + p.slice(P.weekly.length, -3).split('-W')[1], (p) => p.slice(P.weekly.length, P.weekly.length + 4)));
      return noteView(P.ladder, { tab: 'learn', title: 'Learn', seg: '', segBase: '#/learn', segItems: LEARN });
    case 'prep':
      if (arg === 'mocks') return listPage('prep', 'Prep', PREP, 'mocks', '#/prep', fileRows(listDir(P.mocks), (p) => '#/file/' + encodeURIComponent(p), (p) => 'Mock interview', (p) => fmtDate(p.slice(P.mocks.length, -3), true)));
      if (arg === 'stories') return noteView(P.story, { tab: 'prep', title: 'Prep', seg: 'stories', segBase: '#/prep', segItems: PREP });
      if (arg === 'presence') return noteView(P.presence, { tab: 'prep', title: 'Prep', seg: 'presence', segBase: '#/prep', segItems: PREP });
      return noteView(P.prep, { tab: 'prep', title: 'Prep', seg: '', segBase: '#/prep', segItems: PREP });
    case 'jobs': return jobsView(arg || 'active');
    case 'inbox':
      if (arg === 'reading' || arg === 'watch') return linkListView(arg);
      if (arg === 'notes') return listPage('inbox', 'Lists', LISTS, 'notes', '#/inbox', '<div class="list-head"><h2>Inbox</h2></div>' + fileRows(listDir(P.inbox), (p) => '#/file/' + encodeURIComponent(p), (p) => p.slice(P.inbox.length + 11, -3) || p.slice(P.inbox.length, -3), (p) => fmtDate(p.slice(P.inbox.length, P.inbox.length + 10))) + '<div class="list-head"><h2>Ideas</h2></div>' + fileRows(listDir(P.ideas), (p) => '#/file/' + encodeURIComponent(p), (p) => p.slice(P.ideas.length, -3)));
      if (arg.startsWith('vault')) return vaultView(arg.slice(6));
      return todoView();
    case 'file': return fileView(arg);
    case 'today': return todayView(arg || null);
    default: return todayView(null);
  }
}

/* ---------- boot ---------- */
window.addEventListener('hashchange', route);
$('#fab').onclick = () => openCapture('task');
$('#sheetBackdrop').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - (tree.at || 0) > 60000) sync(); });
route().then(() => { if (cfg.token && Date.now() - (tree.at || 0) > 5000) sync(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});

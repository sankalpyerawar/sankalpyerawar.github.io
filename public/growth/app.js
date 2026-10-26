/* Growth: a phone-first reader and capture tool over Sankalp's second-brain vault.
   Reads and writes the private GitHub repo directly through the GitHub REST API.
   No server: the token lives only on this device. */
'use strict';

const API = 'https://api.github.com';
const P = {
  daily: '10 Journal/Daily/',
  weekly: '10 Journal/Weekly/',
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

/* ---------- markdown rendering ---------- */
marked.setOptions({ gfm: true, breaks: false });
function resolveWiki(target) {
  const t = target.trim();
  const files = Object.keys(tree.files);
  return files.find((p) => p === t || p === t + '.md') || files.find((p) => p.endsWith('/' + t + '.md')) || null;
}
function preprocess(md) {
  return md.replace(/(^|[^\\])~(?=[\d$₹≈<>])/g, '$1\\~').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const path = resolveWiki(target);
    const text = label || target.split('/').pop();
    return path ? `[${text}](#/file/${encodeURIComponent(path)})` : text;
  });
}
function renderMd(md, el) {
  const html = DOMPurify.sanitize(marked.parse(preprocess(md || '')));
  el.classList.add('md');
  el.innerHTML = html;
  el.querySelectorAll('table').forEach((t) => { const w = document.createElement('div'); w.className = 'table-wrap'; t.replaceWith(w); w.appendChild(t); });
  el.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href').startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; } });
  el.querySelectorAll('pre > code.language-mermaid').forEach((c) => {
    const d = document.createElement('div'); d.className = 'mermaid'; d.dataset.src = c.textContent; d.textContent = c.textContent; c.parentElement.replaceWith(d);
  });
  el.querySelectorAll('pre > code.language-chart').forEach((c) => { const f = chartFrom(c.textContent); if (f) c.parentElement.replaceWith(f); });
  renderMermaid(el);
  return el;
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
  m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'neutral', fontFamily: 'Atkinson Hyperlegible, sans-serif' });
  for (const el of els) {
    el.dataset.done = '1';
    try { const { svg } = await m.render('m' + Math.random().toString(36).slice(2), el.dataset.src); el.innerHTML = svg; }
    catch { el.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = el.dataset.src; el.appendChild(pre); }
  }
}
/* ```chart {"title","source","unit","bars":[{"label","value"}]} → a small horizontal bar chart */
function chartFrom(src) {
  let c; try { c = JSON.parse(src); } catch { return null; }
  if (!Array.isArray(c.bars) || !c.bars.length) return null;
  const max = Math.max(...c.bars.map((b) => Number(b.value) || 0)) || 1;
  const rowH = 34, labelW = 120, w = 360, h = c.bars.length * rowH + 8;
  const rows = c.bars.map((b, i) => {
    const v = Number(b.value) || 0, bw = Math.max(2, (w - labelW - 60) * v / max), y = i * rowH + 6;
    return `<text x="0" y="${y + 17}" font-size="13" fill="currentColor">${esc(b.label)}</text>
      <rect x="${labelW}" y="${y + 4}" width="${bw}" height="18" rx="4" fill="var(--signal)"></rect>
      <text x="${labelW + bw + 6}" y="${y + 17}" font-size="13" fill="currentColor">${esc(v)}${esc(c.unit || '')}</text>`;
  }).join('');
  const f = document.createElement('figure'); f.className = 'chart';
  f.innerHTML = `${c.title ? `<p><strong>${esc(c.title)}</strong></p>` : ''}<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(c.title || 'Chart')}">${rows}</svg>${c.source ? `<figcaption>Source: ${esc(c.source)}</figcaption>` : ''}`;
  return f;
}

/* ---------- daily brief parsing ---------- */
function stepType(label) {
  if (/TL;DR|news/i.test(label)) return 'news';
  if (/^\s*Try it/i.test(label)) return 'try';
  if (/Quiz/i.test(label)) return 'quiz';
  if (/watch/i.test(label)) return 'watch';
  if (/🪜|Rung/i.test(label)) return 'rung';
  return 'prep';
}
function parseBrief(md) {
  const { fm, body } = splitFm(md);
  const lines = body.split('\n');
  let title = '';
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines[0] && lines[0].startsWith('# ')) title = lines.shift().slice(2).trim();
  const secs = []; let cur = { heading: null, lines: [] };
  for (const l of lines) { if (/^## /.test(l)) { secs.push(cur); cur = { heading: l.slice(3).trim(), lines: [] }; } else cur.lines.push(l); }
  secs.push(cur);
  const pre = secs.shift().lines;
  const used = new Set();
  let todayLine = '', minimum = '', steps = [], tldr = '';
  pre.forEach((l, i) => {
    if (!todayLine && /^Today:/.test(l.trim())) { todayLine = l.trim().replace(/^Today:\s*/, ''); used.add(i); }
    if (/^⏱️?\s*Minimum today/.test(l.trim())) { minimum = l.trim(); used.add(i); }
  });
  const howIdx = pre.findIndex((l) => l.includes('How to use today'));
  if (howIdx >= 0) {
    used.add(howIdx);
    let i = howIdx + 1; while (i < pre.length && !pre[i].trim()) used.add(i++);
    while (i < pre.length && pre[i].trim().startsWith('|')) {
      const cells = pre[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!/^-+$/.test(cells[0].replace(/:/g, '')) && cells[0] !== 'Section') steps.push({ label: cells[0], device: cells[1] || '', time: cells[2] || '' });
      used.add(i++);
    }
  }
  const tIdx = pre.findIndex((l) => l.includes('⚡ TL;DR'));
  if (tIdx >= 0) {
    used.add(tIdx); const q = [];
    let i = tIdx + 1; while (i < pre.length && !pre[i].trim()) used.add(i++);
    while (i < pre.length && (pre[i].startsWith('>') || (!pre[i].trim() && (pre[i + 1] || '').startsWith('>')))) { q.push(pre[i]); used.add(i++); }
    tldr = q.join('\n');
  }
  const rest = pre.filter((_, i) => !used.has(i)).join('\n');
  const news = rest.split(/^\s*---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 20);
  const sections = secs.map((s) => ({ heading: s.heading, md: s.lines.join('\n').replace(/\n-{3,}\s*$/, '').trim(), kind: /🪜/.test(s.heading) ? 'rung' : /📺/.test(s.heading) ? 'watch' : /🎯/.test(s.heading) ? 'prep' : 'other' }));
  if (!steps.length) {
    if (news.length) steps.push({ label: '⚡ News', device: '📱', time: '' });
    for (const s of sections) if (s.kind !== 'other') steps.push({ label: s.heading, device: '', time: '' });
  }
  steps.forEach((s) => { s.type = stepType(s.label); });
  return { fm, title, todayLine, minimum, steps, tldr, news, sections };
}

/* ---------- views ---------- */
const view = () => $('#view');
function setActiveTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
function skeleton() { view().innerHTML = '<div class="page-head"><div class="skeleton" style="width:50%;height:30px"></div></div>' + '<div class="skeleton"></div>'.repeat(5); }
function failView(e) {
  view().innerHTML = `<div class="page-head"><h1>Can't load this</h1><p>${esc(e.offline ? "You're offline and this hasn't been downloaded yet. It loads next time you're online." : e.message)}</p></div><button class="btn" id="retry">Try again</button>`;
  $('#retry').onclick = () => sync().then(route);
}
function segmented(items, current, base) {
  return `<div class="seg" role="toolbar">${items.map(([key, label]) => `<button aria-pressed="${key === current}" data-href="${base}${key ? '/' + key : ''}">${esc(label)}</button>`).join('')}</div>`;
}
function wireSeg() { view().querySelectorAll('.seg button[data-href]').forEach((b) => { b.onclick = () => { location.hash = b.dataset.href; }; }); }

function welcomeView() {
  setActiveTab('');
  view().innerHTML = `<div class="welcome">
    <h1>Your daily briefs, quizzes and captures, in one app</h1>
    <p>Growth reads and writes your private <strong>second-brain</strong> repo on GitHub. Claude's scheduled tasks put each morning's brief there, and anything you capture here lands back in your Obsidian vault.</p>
    <p>One-time setup:</p>
    <ol>
      <li>Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained GitHub token</a>.</li>
      <li>Repository access: <strong>Only select repositories</strong> → <code>second-brain</code>.</li>
      <li>Permissions: <strong>Contents → Read and write</strong>. Nothing else.</li>
      <li>Paste it in Settings. It stays on this device only.</li>
    </ol>
    <button class="btn signal" id="goSettings">Open settings</button>
  </div>`;
  $('#goSettings').onclick = () => { location.hash = '#/settings'; };
}

async function todayView(date) {
  setActiveTab('today');
  const dailies = listDir(P.daily);
  if (!dailies.length) { view().innerHTML = '<div class="page-head"><h1>No briefs yet</h1><p>The next one arrives at 7:00 on a weekday.</p></div>'; return; }
  const path = date ? P.daily + date + '.md' : dailies[0];
  const briefDate = path.slice(P.daily.length, -3);
  skeleton();
  let md, log;
  try { md = await readFile(path); log = (await readJson(P.log(briefDate), {})) || {}; } catch (e) { failView(e); return; }
  if (md == null) { view().innerHTML = `<div class="page-head"><h1>No brief for ${esc(fmtDate(briefDate))}</h1></div>`; return; }
  const b = parseBrief(md);
  const logPath = P.log(briefDate);
  const done = log.done || {};
  const today = localDate();
  const v = view(); v.innerHTML = '';

  const head = document.createElement('div'); head.className = 'page-head';
  head.innerHTML = `<h1>${esc(fmtDate(briefDate, true))}</h1>${b.todayLine ? `<p>${esc(b.todayLine)}</p>` : ''}` +
    (!date && briefDate !== today ? `<span class="stale">Newest brief. The next one arrives at 7:00 on a weekday.</span>` : '') +
    (date && date !== dailies[0].slice(P.daily.length, -3) ? `<span class="stale">Past brief. <a href="#/today">Go to the newest</a></span>` : '');
  v.appendChild(head);

  // the ladder
  if (b.steps.length) {
    const lad = document.createElement('div'); lad.className = 'ladder';
    const firstOpen = b.steps.findIndex((s) => !done[s.type]);
    lad.innerHTML = b.steps.map((s, i) => `
      <div class="rung ${done[s.type] ? 'done' : ''} ${i === firstOpen ? 'next' : ''}" data-type="${s.type}">
        <span class="rung-bar" aria-hidden="true"></span>
        <div class="rung-label"><a href="#" data-jump="${s.type}">${esc(s.label)}</a><div class="rung-meta">${esc([s.device, s.time].filter(Boolean).join('  ·  '))}</div></div>
        <button class="rung-check" aria-label="Mark ${esc(s.label)} done" aria-pressed="${!!done[s.type]}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
      </div>`).join('') + (b.minimum ? `<div class="ladder-foot">${esc(b.minimum)}</div>` : '');
    v.appendChild(lad);
    lad.querySelectorAll('.rung').forEach((r) => {
      const type = r.dataset.type;
      r.querySelector('.rung-check').onclick = async () => {
        const now = !r.classList.contains('done');
        r.classList.toggle('done', now); r.querySelector('.rung-check').setAttribute('aria-pressed', now);
        lad.querySelectorAll('.rung').forEach((x) => x.classList.remove('next'));
        const nextOpen = [...lad.querySelectorAll('.rung')].find((x) => !x.classList.contains('done')); if (nextOpen) nextOpen.classList.add('next');
        await enqueue({ kind: 'jsonSet', path: logPath, keys: ['done', type], value: now, init: { date: briefDate }, message: `app: ${type} ${now ? 'done' : 'not done'} ${briefDate}` });
        if (now && !nextOpen) toast('Every rung done today');
      };
      r.querySelector('[data-jump]').onclick = (e) => {
        e.preventDefault();
        const target = $(`[data-anchor="${type === 'try' ? 'rung' : type}"]`) || $('[data-anchor="rung"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }

  if (b.tldr) { const t = document.createElement('section'); t.className = 'block tldr'; t.dataset.anchor = 'news'; renderMd(b.tldr.replace(/^>\s?/gm, ''), t); v.appendChild(t); }
  b.news.forEach((n, i) => {
    const s = document.createElement('section'); s.className = 'block';
    if (!b.tldr && i === 0) s.dataset.anchor = 'news';
    renderMd(n, s); v.appendChild(s);
  });
  for (const sec of b.sections) {
    const s = document.createElement('section'); s.className = 'block'; s.dataset.anchor = sec.kind;
    const h = document.createElement('h2'); h.textContent = sec.heading;
    const body = document.createElement('div'); renderMd(sec.md, body);
    s.append(h, body); v.appendChild(s);
    if (sec.kind === 'rung') enhanceQuiz(body, log, logPath, briefDate);
  }
  v.appendChild(replyBlock(log, logPath, briefDate, 'Reply to Claude', 'Mock answers, questions about the rung, what got in the way. The next brief reads and answers these.'));
}

function enhanceQuiz(body, log, logPath, briefDate) {
  const p = [...body.querySelectorAll('p')].find((x) => x.textContent.trim().startsWith('🧩 Quiz'));
  if (!p) return;
  let ol = p.nextElementSibling; while (ol && ol.tagName !== 'OL') ol = ol.nextElementSibling;
  if (!ol) return;
  p.dataset.anchor = 'quiz';
  p.innerHTML = '<strong>🧩 Quiz</strong> <span class="rung-meta">Answer here. Tomorrow\'s brief grades it.</span>';
  const qs = [...ol.children];
  const prev = log.quiz || {};
  const box = document.createElement('div'); box.className = 'quiz-box';
  box.innerHTML = qs.map((_, i) => `<label for="qa${i}">Answer ${i + 1}</label><textarea id="qa${i}" rows="3" placeholder="A line or two is enough">${esc((prev.answers || [])[i] || '')}</textarea>`).join('') +
    `<div class="feel" role="group" aria-label="How did the rung feel?">${['Too easy', 'About right', 'Too hard'].map((f) => `<button type="button" aria-pressed="${prev.feel === f.toLowerCase()}">${f}</button>`).join('')}</div>
     ${prev.at ? `<p class="sent">Sent at ${esc(fmtTime(prev.at))}. Edit and send again if you like.</p>` : ''}
     <button class="btn signal" type="button" id="sendQuiz">${prev.at ? 'Update answers' : 'Send answers'}</button>`;
  ol.after(box);
  let feel = prev.feel || '';
  box.querySelectorAll('.feel button').forEach((btn) => {
    btn.onclick = () => { feel = btn.getAttribute('aria-pressed') === 'true' ? '' : btn.textContent.toLowerCase(); box.querySelectorAll('.feel button').forEach((x) => x.setAttribute('aria-pressed', x.textContent.toLowerCase() === feel)); };
  });
  $('#sendQuiz', box).onclick = async () => {
    const answers = qs.map((_, i) => $(`#qa${i}`, box).value.trim());
    if (!answers.some(Boolean) && !feel) { toast('Write at least one answer first'); return; }
    const at = new Date().toISOString();
    const qtext = qs.map((li) => li.textContent.trim());
    await enqueue({ kind: 'jsonSet', path: logPath, keys: ['quiz'], value: { questions: qtext, answers, feel, at }, init: { date: briefDate }, message: `app: quiz answers ${briefDate}` });
    await enqueue({ kind: 'jsonSet', path: logPath, keys: ['done', 'quiz'], value: true, init: { date: briefDate }, message: `app: quiz done ${briefDate}` });
    const rung = $('.rung[data-type="quiz"]'); if (rung) { rung.classList.add('done'); }
    $('#sendQuiz', box).textContent = 'Update answers';
    toast('Answers sent. Claude grades them in the next brief.');
  };
}

function replyBlock(log, logPath, date, title, hint) {
  const s = document.createElement('section'); s.className = 'block'; s.dataset.anchor = 'reply';
  const replies = (log.replies || []);
  s.innerHTML = `<h2>${esc(title)}</h2>
    ${replies.map((r) => `<div class="md"><blockquote><p>${esc(r.text).replace(/\n/g, '<br>')}</p></blockquote><p class="rung-meta">${esc(r.kind === 'ask' ? 'Asked' : 'Sent')} at ${esc(fmtTime(r.at))}</p></div>`).join('')}
    <textarea id="replyText" rows="4" placeholder="Type or use voice typing"></textarea>
    <p class="hint">${esc(hint)}</p>
    <div class="block-actions"><button class="btn signal" id="sendReply">Send to Claude</button></div>`;
  $('#sendReply', s).onclick = async () => {
    const text = $('#replyText', s).value.trim(); if (!text) return;
    await enqueue({ kind: 'jsonPush', path: logPath, keys: ['replies'], item: { at: new Date().toISOString(), text, kind: 'reply' }, init: { date }, message: `app: reply ${date}` });
    toast('Sent. The next brief answers it.'); route();
  };
  return s;
}

async function noteView(path, { tab, seg, segBase, segItems, title }) {
  setActiveTab(tab); skeleton();
  let md; try { md = await readFile(path); } catch (e) { failView(e); return; }
  const { body } = splitFm(md || '');
  const v = view();
  v.innerHTML = (segItems ? segmented(segItems, seg, segBase) : '') + (title ? `<div class="page-head"><h1>${esc(title)}</h1></div>` : '');
  const s = document.createElement('section'); s.className = 'block';
  renderMd(md == null ? '_This note does not exist yet._' : body.replace(/^>\s*🟢 Live note.*\n+/m, ''), s);
  v.appendChild(s); wireSeg();
}

const LEARN = [['', 'Ladder'], ['briefs', 'Past briefs'], ['weekly', 'Weekly reviews']];
const PREP = [['', 'Plan & tracker'], ['stories', 'Story bank'], ['presence', 'Presence']];
const LISTS = [['', 'To-do'], ['reading', 'Reading'], ['watch', 'Watch'], ['notes', 'Notes'], ['vault', 'Vault']];

function fileList(paths, hrefFor, labelFor, metaFor) {
  if (!paths.length) return '<p class="empty">Nothing here yet.</p>';
  return paths.map((p) => `<button class="row-link" data-href="${esc(hrefFor(p))}"><span>${esc(labelFor(p))}</span><small>${esc(metaFor ? metaFor(p) : '')}</small></button>`).join('');
}
function wireRows(root = view()) { root.querySelectorAll('.row-link[data-href]').forEach((b) => { b.onclick = () => { location.hash = b.dataset.href; }; }); }

function learnList(kind) {
  setActiveTab('learn');
  const v = view();
  if (kind === 'briefs') {
    const files = listDir(P.daily);
    v.innerHTML = segmented(LEARN, 'briefs', '#/learn') + `<section class="block">${fileList(files, (p) => '#/today/' + p.slice(P.daily.length, -3), (p) => fmtDate(p.slice(P.daily.length, -3)), (p) => p.slice(P.daily.length, -3))}</section>`;
  } else {
    const files = listDir(P.weekly);
    v.innerHTML = segmented(LEARN, 'weekly', '#/learn') + `<section class="block">${fileList(files, (p) => '#/file/' + encodeURIComponent(p), (p) => 'Week ' + p.slice(P.weekly.length, -3).split('-W')[1] + ', ' + p.slice(P.weekly.length, P.weekly.length + 4), null)}</section>`;
  }
  wireSeg(); wireRows();
}

async function jobsView(filter = 'active') {
  setActiveTab('jobs'); skeleton();
  let data; try { data = await readJson(P.jobs, null); } catch (e) { failView(e); return; }
  const v = view();
  if (!data || !data.jobs || !data.jobs.length) { v.innerHTML = '<div class="page-head"><h1>Jobs</h1><p>No roles yet. The job scan adds them on Monday, Wednesday and Friday evenings.</p></div>'; return; }
  const closed = ['Rejected', 'Not for me'];
  const counts = (st) => data.jobs.filter((j) => j.status === st).length;
  const filters = [['active', `Open (${data.jobs.filter((j) => !closed.includes(j.status)).length})`], ...data.statuses.filter((s) => counts(s)).map((s) => [s, `${s} (${counts(s)})`])];
  const list = data.jobs.filter((j) => (filter === 'active' ? !closed.includes(j.status) : j.status === filter))
    .sort((a, b) => (b.found || '').localeCompare(a.found || '') || (b.fit || 0) - (a.fit || 0));
  v.innerHTML = `<div class="page-head"><h1>Jobs</h1><p>From the Mon, Wed and Fri scan. Pune first, then remote-India.</p></div>
    <div class="seg" role="toolbar">${filters.map(([k, l]) => `<button aria-pressed="${k === filter}" data-f="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div id="jobList"></div>
    ${data.scans && data.scans.length ? `<section class="block"><h2>Scan notes</h2>${data.scans.slice(-3).reverse().map((s) => `<div class="md"><p><strong>${esc(fmtDate(s.date))}</strong>: ${DOMPurify.sanitize(marked.parseInline(s.note || ''))}</p></div>`).join('')}</section>` : ''}`;
  v.querySelectorAll('.seg button[data-f]').forEach((b) => { b.onclick = () => { location.hash = '#/jobs/' + encodeURIComponent(b.dataset.f); }; });
  const box = $('#jobList');
  if (!list.length) box.innerHTML = '<p class="empty">No roles with this status.</p>';
  const inl = (s) => DOMPurify.sanitize(marked.parseInline(preprocess(s || '')));
  for (const j of list) {
    const card = document.createElement('article'); card.className = 'job collapsed';
    card.innerHTML = `<div class="job-top"><div class="fit ${j.fit >= 8 ? 'hi' : ''}" title="Fit out of 10">${esc(j.fit)}</div>
        <div><h3>${esc(j.role)}</h3><p class="co">${esc(j.company)}, ${esc(j.location)}</p><p class="rung-meta">Found ${esc(fmtDate(j.found))}</p></div></div>
      <p class="md why">${inl(j.why)}</p>
      <dl class="md"><dt>Pay</dt><dd>${inl(j.pay)}</dd><dt>Culture and stability</dt><dd>${inl(j.culture)}</dd><dt>Gap to close</dt><dd>${inl(j.gap)}</dd></dl>
      <div class="job-foot"><select aria-label="Status for ${esc(j.role)}">${data.statuses.map((s) => `<option ${s === j.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <button class="btn ghost small" data-act="more">Pay, culture, gaps</button>
        <a class="btn small" href="${esc(j.link)}" target="_blank" rel="noopener">Open posting</a></div>`;
    card.querySelectorAll('dl a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    $('[data-act="more"]', card).onclick = (e) => { card.classList.toggle('collapsed'); e.target.textContent = card.classList.contains('collapsed') ? 'Pay, culture, gaps' : 'Show less'; };
    $('select', card).onchange = async (e) => {
      await enqueue({ kind: 'jobStatus', path: P.jobs, id: j.id, status: e.target.value, at: new Date().toISOString(), message: `app: ${j.company} ${e.target.value}` });
      toast(`${j.company}: ${e.target.value}`);
    };
    box.appendChild(card);
  }
}

async function todoView() {
  setActiveTab('inbox'); skeleton();
  let md; try { md = await readFile(P.todo); } catch (e) { failView(e); return; }
  const v = view();
  v.innerHTML = segmented(LISTS, '', '#/inbox') + `<form class="block" id="quickTask" style="padding-bottom:14px"><label class="field" style="margin:0"><span>Add a task to Now</span><input type="text" id="qt" placeholder="e.g. Fill story #2 gaps" autocomplete="off"></label></form><div id="groups"></div>`;
  wireSeg();
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
  if (!shown.length) box.innerHTML = '<p class="empty">No tasks. Add one above.</p>';
  for (const grp of shown) {
    const s = document.createElement('section'); s.className = 'block'; s.innerHTML = `<h2>${esc(grp.name)}</h2>`;
    for (const t of grp.tasks) {
      const due = /📅\s*(\d{4}-\d{2}-\d{2})/.exec(t.text);
      const tags = t.text.match(/#[\w/-]+/g) || [];
      const clean = t.text.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '').replace(/#[\w/-]+/g, '').trim();
      const row = document.createElement('label'); row.className = 'task' + (t.done ? ' done' : '');
      row.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''}><span class="task-text"><span class="md"></span><span class="meta">${esc([due ? 'Due ' + fmtDate(due[1]) : '', tags.join(' ')].filter(Boolean).join('   '))}</span></span>`;
      row.querySelector('.md').innerHTML = DOMPurify.sanitize(marked.parseInline(preprocess(clean)));
      row.querySelector('input').onchange = async (e) => {
        row.classList.toggle('done', e.target.checked);
        await enqueue({ kind: 'toggle', path: P.todo, text: t.text, checked: e.target.checked, message: `app: ${e.target.checked ? 'done' : 'reopen'} task` });
      };
      s.appendChild(row);
    }
    box.appendChild(s);
  }
}

async function listNoteView(which) {
  const path = which === 'reading' ? P.reading : P.watch;
  setActiveTab('inbox'); skeleton();
  let md; try { md = await readFile(path); } catch (e) { failView(e); return; }
  const v = view();
  v.innerHTML = segmented(LISTS, which, '#/inbox') + `<form class="block" id="quickLink" style="padding-bottom:14px"><label class="field" style="margin:0"><span>Add a link to ${which === 'reading' ? 'read' : 'watch'}</span><input type="url" id="ql" placeholder="https://" inputmode="url"></label></form>`;
  wireSeg();
  $('#quickLink').onsubmit = (e) => { e.preventDefault(); openCapture('link', { url: $('#ql').value.trim(), list: which }); };
  const s = document.createElement('section'); s.className = 'block'; renderMd(splitFm(md || '').body, s); v.appendChild(s);
}

function notesView() {
  setActiveTab('inbox');
  const notes = listDir(P.inbox);
  const ideas = listDir(P.ideas);
  view().innerHTML = segmented(LISTS, 'notes', '#/inbox') +
    `<section class="block"><h2>Inbox</h2>${fileList(notes, (p) => '#/file/' + encodeURIComponent(p), (p) => p.slice(P.inbox.length, -3), null)}</section>
     <section class="block"><h2>Ideas</h2>${fileList(ideas, (p) => '#/file/' + encodeURIComponent(p), (p) => p.slice(P.ideas.length, -3), null)}</section>`;
  wireSeg(); wireRows();
}

function vaultView(dir = '') {
  setActiveTab('inbox');
  const prefix = dir ? dir + '/' : '';
  const dirs = new Set(), files = [];
  for (const p of Object.keys(tree.files)) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length); const parts = rest.split('/');
    if (HIDDEN_DIRS.includes(parts[0]) || parts[0].startsWith('.')) continue;
    if (parts.length > 1) dirs.add(parts[0]); else if (/\.(md|json)$/.test(rest)) files.push(p);
  }
  const up = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
  view().innerHTML = segmented(LISTS, 'vault', '#/inbox') +
    `<section class="block">${dir ? `<p class="crumb">${esc(dir)}</p><button class="back" data-up>Up one folder</button>` : ''}
      ${[...dirs].sort().map((d) => `<button class="row-link" data-href="#/inbox/vault/${encodeURIComponent(prefix + d)}"><span>📁 ${esc(d)}</span><small></small></button>`).join('')}
      ${files.sort().map((p) => `<button class="row-link" data-href="#/file/${encodeURIComponent(p)}"><span>${esc(p.slice(prefix.length).replace(/\.md$/, ''))}</span><small></small></button>`).join('')}
      ${!dirs.size && !files.length ? '<p class="empty">Empty folder.</p>' : ''}</section>`;
  const b = $('[data-up]'); if (b) b.onclick = () => { location.hash = up ? '#/inbox/vault/' + encodeURIComponent(up) : '#/inbox/vault'; };
  wireSeg(); wireRows();
}

async function fileView(path) {
  skeleton();
  let text; try { text = await readFile(path); } catch (e) { failView(e); return; }
  const v = view();
  v.innerHTML = `<button class="back" id="backBtn">Back</button><p class="crumb">${esc(path)}</p>`;
  $('#backBtn').onclick = () => history.back();
  const s = document.createElement('section'); s.className = 'block';
  if (text == null) s.innerHTML = '<p class="empty">This file is not in the vault.</p>';
  else if (path.endsWith('.json')) { const pre = document.createElement('pre'); pre.textContent = text; s.classList.add('md'); s.appendChild(pre); }
  else renderMd(splitFm(text).body, s);
  v.appendChild(s);
}

function settingsView() {
  setActiveTab('');
  view().innerHTML = `<div class="page-head"><h1>Settings</h1><p>Your token is stored only in this browser on this device.</p></div>
    <form class="block" id="cfgForm" style="padding-bottom:14px">
      <label class="field"><span>GitHub token (fine-grained, Contents read and write on second-brain only)</span><input type="password" id="cToken" value="${esc(cfg.token)}" autocomplete="off" placeholder="github_pat_…"></label>
      <label class="field"><span>Repository</span><input type="text" id="cRepo" value="${esc(cfg.repo)}" autocapitalize="off"></label>
      <label class="field"><span>Branch</span><input type="text" id="cBranch" value="${esc(cfg.branch)}" autocapitalize="off"></label>
      <label class="field"><span>Theme</span><select id="cTheme">${['system', 'light', 'dark'].map((t) => `<option value="${t}" ${cfg.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      <button class="btn signal" type="submit">Save and connect</button>
      <p class="hint" id="cfgMsg"></p>
    </form>
    <section class="block" style="padding-bottom:14px"><h2>Sync</h2>
      <p>${queue.length ? `${queue.length} change${queue.length > 1 ? 's' : ''} waiting to save.` : 'Everything you added is saved to GitHub.'} ${lastSync ? 'Last sync at ' + esc(fmtTime(lastSync)) + '.' : ''}</p>
      <div class="block-actions"><button class="btn ghost" id="syncNow">Sync now</button><button class="btn ghost" id="clearCache">Download everything again</button></div>
      <p class="hint">Make a token: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a>. Only select repositories → second-brain. Permissions → Contents: Read and write.</p>
    </section>`;
  $('#cTheme').onchange = (e) => { cfg.theme = e.target.value; ls.set('growth.cfg', cfg); applyTheme(); };
  $('#cfgForm').onsubmit = async (e) => {
    e.preventDefault();
    cfg.token = $('#cToken').value.trim(); cfg.repo = $('#cRepo').value.trim(); cfg.branch = $('#cBranch').value.trim() || 'main';
    ls.set('growth.cfg', cfg);
    const msg = $('#cfgMsg'); msg.textContent = 'Connecting…';
    try {
      const r = await gh(`/repos/${cfg.repo}`); if (!r.ok) await failWith(r);
      const j = await r.json();
      if (!j.permissions || !j.permissions.push) { msg.textContent = 'Connected, but this token cannot write. Give it Contents: Read and write.'; }
      else msg.textContent = `Connected to ${j.full_name}${j.private ? ' (private)' : ''}.`;
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
      <div style="display:flex;gap:10px"><label class="field" style="flex:1"><span>Due (optional)</span><input type="text" id="fDue" placeholder="YYYY-MM-DD" inputmode="numeric"></label>
      <label class="field" style="flex:1"><span>Area</span><select id="fArea"><option>career</option><option>learning</option><option>personal</option><option>home</option><option>travel</option></select></label></div>`,
    note: `<label class="field"><span>Title</span><input type="text" id="fTitle" placeholder="Short title"></label><label class="field"><span>Note</span><textarea id="fBody" rows="6" placeholder="Anything worth keeping"></textarea></label>`,
    idea: `<label class="field"><span>Idea</span><input type="text" id="fTitle" placeholder="One line"></label><label class="field"><span>Why it matters (optional)</span><textarea id="fBody" rows="4"></textarea></label>`,
    link: `<label class="field"><span>Link</span><input type="url" id="fUrl" placeholder="https://" value="${esc(prefill.url || '')}"></label><label class="field"><span>Title</span><input type="text" id="fTitle" placeholder="What is it?"></label>
      <label class="field"><span>Add to</span><select id="fList"><option value="reading" ${prefill.list !== 'watch' ? 'selected' : ''}>Reading list</option><option value="watch" ${prefill.list === 'watch' ? 'selected' : ''}>Watch list</option></select></label>
      <label class="field"><span>Why save it (optional)</span><input type="text" id="fWhy"></label>`,
    ask: `<label class="field"><span>Question or request for Claude</span><textarea id="fBody" rows="6" placeholder="e.g. Explain MVCC vacuum again with a Kafka analogy, or add a Kafka exactly-once rung"></textarea></label><p class="hint">Claude answers in the next morning's brief.</p>`,
  };
  sheet.innerHTML = `<div class="grip"></div><h2 id="sheetTitle">Capture</h2>
    <div class="kinds" role="group">${KINDS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
    <form id="capForm">${fields[kind]}<div class="sheet-actions"><button type="button" class="btn ghost" id="capCancel">Cancel</button><button class="btn signal" type="submit">Save</button></div></form>`;
  sheet.hidden = false; bd.hidden = false;
  sheet.querySelectorAll('.kinds button').forEach((b) => { b.onclick = () => openCapture(b.dataset.k, prefill); });
  const first = sheet.querySelector('form input, form textarea'); if (first) setTimeout(() => (prefill.url && kind === 'link' ? $('#fTitle') : first).focus(), 60);
  $('#capCancel').onclick = closeSheet;
  $('#capForm').onsubmit = async (e) => {
    e.preventDefault();
    try { await saveCapture(kind); closeSheet(); route(); } catch (err) { toast(err.message); }
  };
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; }

async function saveCapture(kind) {
  const today = localDate(); const val = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  if (kind === 'task') {
    const t = val('fText'); if (!t) throw new Error('Write the task first');
    const due = val('fDue');
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Due date should look like 2026-11-02');
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
  $('#fab').hidden = !cfg.token;
  window.scrollTo(0, 0);
  if (root === 'settings') return settingsView();
  if (!cfg.token) return welcomeView();
  if (!Object.keys(tree.files).length) { skeleton(); await sync({ rerender: false }); if (!Object.keys(tree.files).length) return failView(new HttpError(0, 'Could not reach GitHub. Check your connection and the token in Settings.')); }
  switch (root) {
    case 'learn':
      if (arg === 'briefs' || arg === 'weekly') return learnList(arg);
      return noteView(P.ladder, { tab: 'learn', seg: '', segBase: '#/learn', segItems: LEARN });
    case 'prep':
      if (arg === 'stories') return noteView(P.story, { tab: 'prep', seg: 'stories', segBase: '#/prep', segItems: PREP });
      if (arg === 'presence') return noteView(P.presence, { tab: 'prep', seg: 'presence', segBase: '#/prep', segItems: PREP });
      return noteView(P.prep, { tab: 'prep', seg: '', segBase: '#/prep', segItems: PREP });
    case 'jobs': return jobsView(arg || 'active');
    case 'inbox':
      if (arg === 'reading' || arg === 'watch') return listNoteView(arg);
      if (arg === 'notes') return notesView();
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
$('#syncBtn').onclick = () => (cfg.token ? sync().then(() => toast('Synced')) : (location.hash = '#/settings'));
$('#settingsBtn').onclick = () => { location.hash = '#/settings'; };
$('#brand').onclick = () => { location.hash = '#/today'; };
window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - (tree.at || 0) > 60000) sync(); });
setSync();
route().then(() => { if (cfg.token && Date.now() - (tree.at || 0) > 5000) sync(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

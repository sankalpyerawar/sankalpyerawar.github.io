/* Growth: active features layered on app.js.
   Learn: ladder path, spaced review, skill map, explain-it-back, read aloud.
   Prep: this week, problem logger and redo queue, story drill, mistakes cards, days-kept grid.
   Capture: share target (links, text, screenshots), reading triage, company packs and debriefs.
   Loaded BEFORE app.js; everything here runs only when called, so app.js globals exist by then. */
'use strict';

const SPRINT = { mon: '2026-10-26', start: '2026-10-27', end: '2026-12-06', ladderEnd: '2026-12-04' };
const DSA_TARGET = { 1: 3, 2: 3, 3: 5, 4: 3, 5: 5, 6: 3 };
const REVIEW_PATH = 'App/review.json';
const COMPANIES = 'App/companies/';
const ATTACH = '00 Inbox/attachments/';
const REVIEW_GAPS = [1, 3, 7, 14];
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/* ---------- dates ---------- */
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 864e5); }
const dow = (s) => parseDate(s).getDay();
const isWeekday = (s) => dow(s) > 0 && dow(s) < 6;
function sprintWeek(s = localDate()) { if (s < SPRINT.start) return 0; return Math.min(6, Math.floor(daysBetween(SPRINT.mon, s) / 7) + 1); }
function weekRange(w) { const mon = addDays(SPRINT.mon, (w - 1) * 7); return [w === 1 ? SPRINT.start : mon, addDays(mon, 6)]; }
function nthWeekday(i) { let d = SPRINT.start, k = -1; for (;;) { if (isWeekday(d)) { k++; if (k === i) return d; } d = addDays(d, 1); } }
function weekdaysUpTo(s) { let n = 0; for (let d = SPRINT.start; d <= s; d = addDays(d, 1)) if (isWeekday(d)) n++; return n; }
function longDate(text) { const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text || ''); if (!m || MONTHS[m[2].toLowerCase()] == null) return null; return localDate(new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]))); }
function isoDay(iso) { try { return localDate(new Date(iso)); } catch { return localDate(); } }
function hashKey(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* ---------- vault helpers ---------- */
const unesc = (s) => String(s || '').replace(/\\([[\]|*_~#])/g, '$1').trim();
function splitRow(l) { return l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim()); }
function mdTable(md, headingRe) {
  const lines = String(md || '').split('\n');
  let i = lines.findIndex((l) => /^#{1,4}\s/.test(l) && headingRe.test(l));
  if (i < 0) return null;
  i++;
  while (i < lines.length && !lines[i].trim().startsWith('|')) { if (/^#{1,3}\s/.test(lines[i])) return null; i++; }
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
  return rows.length < 2 ? null : { head: rows[0], rows: rows.slice(2) };
}
function mdSection(md, headingRe) {
  const lines = String(md || '').split('\n');
  const i = lines.findIndex((l) => /^##\s/.test(l) && headingRe.test(l));
  if (i < 0) return '';
  let j = i + 1; while (j < lines.length && !/^##\s/.test(lines[j])) j++;
  return lines.slice(i + 1, j).join('\n').trim();
}
async function loadLogs(from = SPRINT.start, to = localDate()) {
  const out = {};
  for (const p of listDir('App/log/', '.json')) {
    const d = p.slice('App/log/'.length, -5);
    if (d >= from && d <= to) out[d] = (await readJson(p, {})) || {};
  }
  return out;
}
const todayLogPath = () => P.log(localDate());
async function pushToday(key, item, message) {
  const d = localDate();
  await enqueue({ kind: 'jsonPush', path: P.log(d), keys: [key], item, init: { date: d }, message });
}

/* ---------- generic bottom sheet ---------- */
function openForm(title, fieldsHtml, onSave, saveLabel = 'Save') {
  const sheet = $('#sheet'), bd = $('#sheetBackdrop');
  sheet.innerHTML = `<div class="grip"></div><h2 id="sheetTitle">${esc(title)}</h2><form id="xForm" class="xform">${fieldsHtml}<div class="btnrow end"><button type="button" class="btn" id="xCancel">Cancel</button><button class="btn primary" type="submit">${esc(saveLabel)}</button></div></form>`;
  sheet.hidden = false; bd.hidden = false;
  sheet.querySelectorAll('.pick').forEach((g) => g.querySelectorAll('button').forEach((b) => { b.onclick = () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); g.dataset.value = b.dataset.v; }; }));
  $('#xCancel').onclick = closeSheet;
  $('#xForm').onsubmit = async (e) => { e.preventDefault(); try { await onSave(sheet); closeSheet(); } catch (err) { toast(err.message); } };
  const first = sheet.querySelector('input, textarea'); if (first) setTimeout(() => first.focus(), 60);
  return sheet;
}
const pick = (name, options, value) => `<div class="pick chips" role="group" aria-label="${esc(name)}" data-value="${esc(value)}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join('')}</div>`;

/* =====================================================================
   LEARN
   ===================================================================== */
const LEARN2 = [['', 'Path'], ['review', 'Review'], ['skills', 'Skill map'], ['briefs', 'Past briefs'], ['weekly', 'Weekly']];

async function loadLadder() {
  const md = (await readFile(P.ladder)) || '';
  const t = mdTable(md, /Track queue/i);
  const tracks = (t ? t.rows : []).map((r) => {
    const m = /(\d+)\s+of\s+(\d+)/.exec(r[4] || '');
    const rungs = unesc(r[2]).split('→').map((s) => s.trim()).filter(Boolean);
    return { n: Number(r[0]) || 0, name: unesc(r[1]), rungs, status: unesc(r[3]), reached: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : rungs.length };
  });
  return { md, tracks };
}

/* every quiz question since the restart, with its model answer once a brief has graded it */
function quizItems(md) {
  const t = mdTable(md, /Quiz log/i); if (!t) return [];
  const out = []; let after = false;
  for (const r of t.rows) {
    if (/restart/i.test(r[1] || '')) { after = true; continue; }
    const date = longDate(r[0]);
    if (!date || date < SPRINT.start) continue;
    after = true;
    const q = unesc(r[2]); if (!q) continue;
    out.push({ key: hashKey(q), date, topic: unesc(r[1]), q, a: unesc(r[3]).split(/\s*·\s*Your (reply|answer)/i)[0].trim() });
  }
  return out;
}
async function reviewState() {
  const st = (await readJson(REVIEW_PATH, null)) || { items: {} };
  st.items = st.items || {};
  return st;
}
function dueCards(items, st, today = localDate()) {
  return items.filter((it) => {
    if (!it.a) return false; // not graded yet: the answer arrives with the next brief
    const s = st.items[it.key];
    if (s && s.retired) return false;
    const due = s ? s.due : addDays(it.date, REVIEW_GAPS[0]);
    return due <= today;
  });
}
async function reviewSummary() {
  const { md } = await loadLadder();
  const items = quizItems(md); const st = await reviewState();
  const due = dueCards(items, st);
  const upcoming = items.filter((it) => it.a && !(st.items[it.key] || {}).retired).map((it) => (st.items[it.key] ? st.items[it.key].due : addDays(it.date, 1))).filter((d) => d > localDate()).sort();
  return { items, st, due, next: upcoming[0] || null, retired: Object.values(st.items).filter((s) => s.retired).length };
}

async function learnPathView() {
  shell({ tab: 'learn' }); skeleton();
  let lad, rs, logs; try { lad = await loadLadder(); rs = await reviewSummary(); logs = await loadLogs(); } catch (e) { failView(e); return; }
  const today = localDate();
  const briefs = listDir(P.daily).map((p) => p.slice(P.daily.length, -3)).filter((d) => d >= SPRINT.start).sort();
  const briefInfo = {};
  for (const d of briefs) { try { const { fm } = splitFm(await readFile(P.daily + d + '.md')); briefInfo[d] = fm.ladder || ''; } catch { /* offline */ } }
  const total = lad.tracks.reduce((s, t) => s + t.total, 0) || 29;
  const delivered = lad.tracks.reduce((s, t) => s + t.reached, 0);
  const read = briefs.filter((d) => (logs[d] && logs[d].done && logs[d].done.rung)).length;
  const yesterday = addDays(today, -1);
  const expected = yesterday < SPRINT.start ? 0 : Math.min(total, weekdaysUpTo(yesterday < SPRINT.ladderEnd ? yesterday : SPRINT.ladderEnd));
  const readBefore = briefs.filter((d) => d < today && logs[d] && logs[d].done && logs[d].done.rung).length;
  const missed = briefs.filter((d) => d < today && !(logs[d] && logs[d].done && logs[d].done.rung));
  const behind = Math.max(0, expected - readBefore);
  const pct = Math.round(100 * read / total);
  const status = today < SPRINT.start ? 'Starts Tue 27 Oct' : behind === 0 ? 'On schedule' : `${behind} rung${behind > 1 ? 's' : ''} behind`;

  // map "Track n/N" in brief frontmatter → brief date
  const byRung = {};
  for (const [d, lad2] of Object.entries(briefInfo)) { const m = /^(.*?)\s+(\d+)\/\d+/.exec(lad2.replace(/"/g, '')); if (m) byRung[m[1].trim().toLowerCase() + '#' + m[2]] = d; }

  let gi = 0;
  const trackHtml = lad.tracks.map((t) => {
    const rows = t.rungs.map((r, i) => {
      const idx = gi++;
      const d = byRung[t.name.toLowerCase() + '#' + (i + 1)];
      const isRead = d && logs[d] && logs[d].done && logs[d].done.rung;
      const state = isRead ? 'read' : d ? (d === today ? 'today' : 'missed') : 'later';
      const when = d ? fmtDate(d) : fmtDate(nthWeekday(idx));
      const label = { read: 'Read', today: 'Today', missed: 'Not read yet', later: when }[state];
      const inner = `<span class="rdot ${state}" aria-hidden="true">${state === 'read' ? ICON.check : ''}</span><span class="row-main"><span class="row-title">${esc(r.charAt(0).toUpperCase() + r.slice(1))}</span><span class="row-sub">${esc(state === 'later' ? 'Planned ' + label : label + (d ? ' · ' + fmtDate(d) : ''))}</span></span>`;
      return d ? `<a class="row rung-row ${state}" href="#/b/${d}/rung">${inner}<span class="row-chev">${ICON.chev}</span></a>` : `<div class="row rung-row ${state}">${inner}</div>`;
    }).join('');
    const open = /in progress/i.test(t.status);
    return `<details class="card track" ${open ? 'open' : ''}><summary><span class="track-n">${t.n}</span><span class="row-main"><span class="row-title">${esc(t.name)}</span><span class="row-sub">${esc(t.status)} · ${t.reached} of ${t.total}</span></span><span class="minibar"><span style="width:${t.total ? 100 * t.reached / t.total : 0}%"></span></span></summary><div class="track-body">${rows}</div></details>`;
  }).join('');

  const v = view();
  v.innerHTML = `<div class="pad">${pageHead('Learn')}${chips(LEARN2.map(([k, l]) => [k, k === 'review' && rs.due.length ? `Review ${rs.due.length}` : l]), '', '#/learn')}
    <section class="card statcard"><div class="stat-top"><div><span class="mini">Learning ladder</span><span class="big">${read}<small> of ${total} rungs read</small></span></div><span class="pill-status ${behind ? 'warn' : 'ok'}">${esc(status)}</span></div>
      <span class="minibar wide"><span style="width:${pct}%"></span></span>
      <p class="hint">${today > SPRINT.ladderEnd ? 'The ladder ended on Fri 4 Dec.' : `One rung every weekday until Fri 4 Dec. ${delivered} delivered so far.`}</p></section>
    ${rs.due.length ? `<a class="upnext" href="#/learn/review"><span class="upnext-meta">Review · about ${Math.max(1, Math.round(rs.due.length * 0.7))} min</span><span class="upnext-title">${rs.due.length} card${rs.due.length > 1 ? 's' : ''} to recall</span><span class="upnext-sub">Old quiz questions come back after 1, 3, 7 and 14 days, so December-you still remembers October's rungs.</span><span class="btn primary">Start review</span></a>` : ''}
    ${missed.length ? `<section class="card list"><div class="list-head"><h2>Catch up</h2><span class="muted">${missed.length} not read</span></div>${missed.map((d) => `<a class="row" href="#/b/${d}/rung"><span class="row-main"><span class="row-title">${esc((briefInfo[d] || 'Rung').replace(/"/g, ''))}</span><span class="row-sub">${esc(fmtDate(d))} · read it, then tap Mark rung read</span></span><span class="row-chev">${ICON.chev}</span></a>`).join('')}</section>` : ''}
    <div class="sect-head"><h2>The path</h2><span class="muted">8 tracks</span></div>${trackHtml || '<p class="empty">The track queue is not in the ladder note.</p>'}</div>`;
  wireTop();
}

async function reviewView() {
  shell({ tab: 'learn' }); $('#fab').hidden = true; skeleton();
  let rs; try { rs = await reviewSummary(); } catch (e) { failView(e); return; }
  const v = view();
  const head = `<div class="pad">${pageHead('Learn')}${chips(LEARN2, 'review', '#/learn')}`;
  if (!rs.due.length) {
    v.innerHTML = `${head}<section class="card statcard"><span class="mini">Review</span><span class="big">All caught up</span>
      <p class="hint">${rs.items.length ? `${rs.items.length} questions in rotation${rs.retired ? `, ${rs.retired} learned for good` : ''}. ${rs.next ? 'Next card due ' + esc(fmtDate(rs.next)) + '.' : ''}` : 'Cards appear the day after you get a quiz: each rung\'s questions come back after 1, 3, 7 and 14 days.'}</p></section></div>`;
    wireTop(); return;
  }
  let i = 0;
  const draw = () => {
    const it = rs.due[i];
    if (!it) { v.innerHTML = `${head}<section class="upnext done"><span class="upnext-title">Review done</span><span class="upnext-sub">${rs.due.length} card${rs.due.length > 1 ? 's' : ''} recalled. Shaky and missed ones come back tomorrow.</span><a class="btn" href="#/learn">Back to the path</a></section></div>`; wireTop(); return; }
    const s = rs.st.items[it.key] || { step: 0 };
    v.innerHTML = `${head}<p class="hint center">Card ${i + 1} of ${rs.due.length} · ${esc(it.topic)}</p>
      <section class="card flash"><span class="mini">From ${esc(fmtDate(it.date))} · round ${Math.min(4, (s.step || 0) + 1)} of 4</span><p class="flash-q">${inline(it.q)}</p>
        <label class="field"><span>Answer from memory (optional, a few words)</span><textarea id="rvA" rows="3" placeholder="Say it out loud, or type it"></textarea></label>
        <button class="btn primary block" id="reveal">Show the answer</button>
        <div id="ans" hidden><div class="callout"><span class="label">Answer</span><p>${inline(it.a)}</p></div>
          <p class="hint">How well did you recall it?</p>
          <div class="btnrow rate"><button class="btn" data-r="missed">Missed</button><button class="btn" data-r="shaky">Shaky</button><button class="btn primary" data-r="got">Got it</button></div></div></section></div>`;
    wireTop();
    $('#reveal').onclick = () => { $('#ans').hidden = false; $('#reveal').hidden = true; };
    v.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = async () => {
        const r = b.dataset.r; const today = localDate(); const step = s.step || 0;
        let next;
        if (r === 'got') { const ns = step + 1; next = ns >= REVIEW_GAPS.length ? { step: ns, retired: true, last: today } : { step: ns, due: addDays(today, REVIEW_GAPS[ns]), last: today }; }
        else if (r === 'shaky') next = { step, due: addDays(today, 1), last: today };
        else next = { step: 0, due: addDays(today, 1), last: today };
        rs.st.items[it.key] = next;
        await enqueue({ kind: 'jsonSet', path: REVIEW_PATH, keys: ['items', it.key], value: next, init: { items: {} }, message: `app: review ${r}` });
        await pushToday('reviews', { key: it.key, q: it.q, answer: $('#rvA').value.trim(), rating: r, at: new Date().toISOString() }, `app: review ${today}`);
        i++; draw(); window.scrollTo(0, 0);
      };
    });
  };
  draw();
}

async function skillsView() {
  shell({ tab: 'learn' }); skeleton();
  let md; try { md = await readFile(P.ladder); } catch (e) { failView(e); return; }
  const v = view();
  const sec = mdSection(md, /Skill map/i);
  v.innerHTML = `<div class="pad">${pageHead('Learn')}${chips(LEARN2, 'skills', '#/learn')}<p class="hint pad-t">"You say" is your own rating. "Shown" moves only with evidence: quiz answers, explain-backs and mocks.</p><article class="card notebody"></article>
    <a class="card linkrow" href="#/file/${encodeURIComponent(P.ladder)}"><span class="row-main"><span class="row-title">Full ladder note</span><span class="row-sub">Levels, track queue and quiz log</span></span><span class="row-chev">${ICON.chev}</span></a></div>`;
  renderRich(sec || '_No Skill map yet._', $('.notebody', v));
  wireTop();
}

/* ---------- explain it back (rung screen) ---------- */
function explainBlock(log, date, rungTitle) {
  const prev = (log.explains || []).slice(-1)[0];
  const s = el('section', 'card explain');
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  s.innerHTML = `<div class="quiz-head"><h2>Explain it back</h2><span class="muted">60 seconds · graded tomorrow</span></div>
    <p class="hint">Explain today's idea as if an interviewer asked "how does this work?" No peeking. ${Rec ? 'Tap the mic and talk.' : 'Use your keyboard\'s mic to talk.'}</p>
    <div class="explain-row">${Rec ? `<button class="micbtn" id="micBtn" aria-label="Start talking"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>` : ''}<span class="timer" id="exT">0:00</span></div>
    <label class="field"><span class="sr">Your explanation</span><textarea id="exText" rows="5" placeholder="It works like this…">${esc(prev ? prev.text : '')}</textarea></label>
    ${prev ? `<p class="hint ok">Saved ${esc(fmtTime(prev.at))}. Saving again adds a new try.</p>` : ''}
    <button class="btn primary block" id="exSave">Send explanation</button>`;
  let t0 = 0, tick = null, rec = null, listening = false;
  const ta = $('#exText', s), tEl = $('#exT', s);
  const startTimer = () => { if (tick) return; t0 = Date.now(); tick = setInterval(() => { const sec = Math.round((Date.now() - t0) / 1000); tEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; tEl.classList.toggle('over', sec > 60); }, 500); };
  ta.addEventListener('input', startTimer, { once: true });
  const mic = $('#micBtn', s);
  if (mic) mic.onclick = () => {
    if (listening) { rec.stop(); return; }
    rec = new Rec(); rec.lang = 'en-IN'; rec.continuous = true; rec.interimResults = true;
    const base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
    let finals = '';
    rec.onresult = (e) => { let interim = ''; for (let k = e.resultIndex; k < e.results.length; k++) { if (e.results[k].isFinal) finals += e.results[k][0].transcript + ' '; else interim += e.results[k][0].transcript; } ta.value = base + finals + interim; };
    rec.onend = () => { listening = false; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Start talking'); };
    rec.onerror = (e) => { if (e.error === 'not-allowed') toast('Allow the microphone for this app to talk'); };
    rec.start(); listening = true; mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop'); startTimer();
  };
  $('#exSave', s).onclick = async () => {
    const text = ta.value.trim(); if (text.length < 15) { toast('Say or type a little more first'); return; }
    if (rec && listening) rec.stop();
    const seconds = t0 ? Math.round((Date.now() - t0) / 1000) : null;
    clearInterval(tick);
    await enqueue({ kind: 'jsonPush', path: P.log(date), keys: ['explains'], item: { rung: rungTitle, text, seconds, at: new Date().toISOString() }, init: { date }, message: `app: explain-back ${date}` });
    toast('Sent. Claude grades it in the next brief.');
  };
  return s;
}

/* ---------- read aloud ---------- */
const LISTEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const listenBtn = () => ('speechSynthesis' in window ? `<button class="iconbtn" id="listenBtn" aria-label="Listen">${LISTEN_ICON}</button>` : '');
function wireListen(host, titleText) {
  const b = $('#listenBtn'); if (!b) return;
  speechSynthesis.cancel();
  let playing = false;
  const stop = () => { speechSynthesis.cancel(); playing = false; b.innerHTML = LISTEN_ICON; b.setAttribute('aria-label', 'Listen'); };
  b.onclick = () => {
    if (playing) { stop(); return; }
    const parts = [titleText];
    host.querySelectorAll(':scope > p, :scope > ul > li, :scope > ol > li, :scope > .callout, :scope > .kv, :scope > h2, :scope > h3, :scope > blockquote').forEach((n) => { if (!n.closest('.quiz, .explain, .reply, pre, figure')) parts.push(n.innerText.replace(/\s+/g, ' ').trim()); });
    const chunks = parts.filter(Boolean).flatMap((t) => t.match(/[^.!?]+[.!?]*\s*/g) || [t]).reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && (last + s).length < 220) acc[acc.length - 1] = last + s; else acc.push(s); return acc; }, []);
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((x) => /en-IN/i.test(x.lang)) || voices.find((x) => /en-GB/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
    chunks.forEach((c, i) => { const u = new SpeechSynthesisUtterance(c); if (voice) u.voice = voice; u.rate = 1.05; if (i === chunks.length - 1) u.onend = stop; speechSynthesis.speak(u); });
    playing = true; b.innerHTML = STOP_ICON; b.setAttribute('aria-label', 'Stop reading');
  };
  window.addEventListener('hashchange', () => speechSynthesis.cancel(), { once: true });
}

/* =====================================================================
   PREP
   ===================================================================== */
const PREP2 = [['', 'This week'], ['log', 'Problems'], ['drill', 'Story drill'], ['mistakes', 'Mistakes'], ['plan', 'Plan'], ['mocks', 'Mocks'], ['stories', 'Story bank'], ['presence', 'Presence']];

function sprintRow(md, w) {
  const t = mdTable(md, /6-week sprint/i); if (!t) return null;
  const r = t.rows.find((x) => Number(x[0]) === w); if (!r) return null;
  return { dates: unesc(r[1]), dsa: unesc(r[2]), design: unesc(r[3]), final: unesc(r[4]) };
}
function allProblems(logs) {
  const out = [];
  for (const [d, l] of Object.entries(logs)) for (const p of (l.problems || [])) out.push({ ...p, day: d });
  return out.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
}
function redoQueue(problems) {
  const last = new Map();
  for (const p of problems) last.set((p.name || '').toLowerCase().trim(), p);
  return [...last.values()].filter((p) => p.result !== 'solved').map((p) => ({ ...p, due: addDays(p.day, 2) })).sort((a, b) => a.due.localeCompare(b.due));
}
async function saturdayMockDone(d) {
  const t = await readFile(P.mocks + d + '.md').catch(() => null);
  return !!(t && /^##\s.*feedback/im.test(t));
}
function dayState(d, l, today, satDone) {
  if (d > today) return 'future';
  if (d < SPRINT.start) return 'pre';
  const done = (l && l.done) || {};
  const extra = l && ((l.reviews || []).length || (l.drills || []).length || (l.problems || []).length || (l.explains || []).length);
  if (dow(d) === 6) return satDone ? 'full' : extra ? 'min' : 'none';
  if (dow(d) === 0) return extra ? 'min' : 'rest';
  if (done.rung && done.prep) return 'full';
  if (done.rung || done.prep || done.quiz || extra) return 'min';
  return d === today ? 'todo' : 'none';
}

async function prepWeekView() {
  shell({ tab: 'prep' }); skeleton();
  const today = localDate();
  let md, logs, rs; try { md = (await readFile(P.prep)) || ''; logs = await loadLogs(SPRINT.mon); rs = await reviewSummary(); } catch (e) { failView(e); return; }
  const w = Math.max(1, sprintWeek(today));
  const [ws, we] = weekRange(w);
  const row = sprintRow(md, w);
  const inWeek = (d) => d >= ws && d <= we;
  const wkLogs = Object.entries(logs).filter(([d]) => inWeek(d));
  const problems = allProblems(logs);
  const dsaWeek = problems.filter((p) => inWeek(p.day) && !p.redo).length;
  const tue = addDays(SPRINT.mon, (w - 1) * 7 + 1), thu = addDays(tue, 2), sat = addDays(tue, 4);
  const designDone = !!(logs[tue] && (logs[tue].done || {}).prep);
  const thuDone = !!(logs[thu] && ((logs[thu].done || {}).prep || (logs[thu].replies || []).some((r) => r.kind === 'reply')));
  const sats = []; for (let d = SPRINT.start; d <= today && d <= SPRINT.end; d = addDays(d, 1)) if (dow(d) === 6) sats.push(d);
  const satMap = {}; for (const d of sats) satMap[d] = await saturdayMockDone(d);
  const rungDays = []; for (let d = ws; d <= we && d <= today; d = addDays(d, 1)) if (isWeekday(d)) rungDays.push(d);
  const rungsRead = rungDays.filter((d) => logs[d] && (logs[d].done || {}).rung).length;
  const drills = wkLogs.reduce((s, [, l]) => s + (l.drills || []).length, 0);
  const redo = redoQueue(problems);
  const redoDue = redo.filter((p) => p.due <= today);
  const daysLeft = Math.max(0, daysBetween(today, SPRINT.end));
  const tile = (label, val, target, done) => `<div class="tile ${done ? 'ok' : ''}"><span class="mini">${esc(label)}</span><span class="tile-v">${esc(val)}${target != null ? `<small>/${esc(target)}</small>` : ''}</span></div>`;

  // days-kept grid
  let grid = '';
  for (let wk = 1; wk <= 6; wk++) {
    let cells = '';
    for (let k = 0; k < 7; k++) { const d = addDays(SPRINT.mon, (wk - 1) * 7 + k); const st = dayState(d, logs[d], today, satMap[d]); cells += `<span class="hc ${st} ${d === today ? 'is-today' : ''}" title="${esc(fmtDate(d))}: ${st}"></span>`; }
    grid += `<div class="hrow"><span class="mini">W${wk}</span>${cells}</div>`;
  }
  const kept = Object.keys(logs).filter((d) => d <= today && ['full', 'min'].includes(dayState(d, logs[d], today, satMap[d]))).length;

  const v = view();
  v.innerHTML = `<div class="pad">${pageHead('Prep', today < SPRINT.start ? 'The sprint starts Tue 27 Oct.' : `Week ${w} of 6 · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to 6 Dec`)}${chips(PREP2, '', '#/prep')}
    <section class="card statcard"><div class="stat-top"><span class="mini">This week · ${esc(row ? row.dates : '')}</span></div>
      <div class="tiles">${tile('DSA solved', dsaWeek, DSA_TARGET[w], dsaWeek >= DSA_TARGET[w])}${tile('Rungs read', rungsRead, rungDays.length || 0, rungDays.length && rungsRead >= rungDays.length)}
        ${tile('Design', designDone ? 'Done' : today === tue ? 'Today' : today < tue ? 'Tue' : '–', null, designDone)}${tile('Thu mock', thuDone ? 'Done' : today === thu ? 'Today' : today < thu ? 'Thu' : '–', null, thuDone)}
        ${tile('Sat mock', satMap[sat] ? 'Done' : today === sat ? 'Today' : today < sat ? 'Sat' : '–', null, satMap[sat])}${tile('Story drills', drills, null, drills >= 3)}</div>
      ${row ? `<div class="kv"><span class="label">DSA patterns</span><p>${inline(row.dsa)}</p></div><div class="kv"><span class="label">System design</span><p>${inline(row.design)}</p></div><div class="kv"><span class="label">Final round and LLD</span><p>${inline(row.final)}</p></div>` : ''}
    </section>
    <div class="btnrow quick"><button class="btn primary grow" id="logBtn">Log a problem</button><a class="btn grow" href="#/prep/drill">Drill a story</a></div>
    ${rs.due.length ? `<a class="card linkrow" href="#/learn/review"><span class="linkrow-icon">${ICON.check}</span><span class="row-main"><span class="row-title">${rs.due.length} review card${rs.due.length > 1 ? 's' : ''} due</span><span class="row-sub">Two minutes of recall</span></span><span class="row-chev">${ICON.chev}</span></a>` : ''}
    ${redoDue.length ? `<section class="card list"><div class="list-head"><h2>Redo today</h2><span class="muted">${redoDue.length}</span></div>${redoDue.map((p, i) => `<div class="row"><span class="row-main"><span class="row-title">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</span><span class="row-sub">${esc(p.pattern || '')} · ${p.result === 'hint' ? 'needed a hint' : 'read the solution'} on ${esc(fmtDate(p.day))}</span></span><button class="btn small" data-redo="${i}">Redo</button></div>`).join('')}</section>` : ''}
    <section class="card heat"><div class="list-head"><h2>Days kept</h2><span class="muted">${kept} so far</span></div>
      <div class="hgrid"><div class="hrow head"><span></span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="mini">${x}</span>`).join('')}</div>${grid}</div>
      <p class="hint legend"><span class="hc full"></span> Full day <span class="hc min"></span> Minimum day <span class="hc none"></span> Missed <span class="hc rest"></span> Rest</p></section></div>`;
  wireTop();
  $('#logBtn').onclick = () => problemForm(row);
  v.querySelectorAll('[data-redo]').forEach((b) => { b.onclick = () => problemForm(row, redoDue[Number(b.dataset.redo)]); });
}

const PATTERNS = ['Arrays and hashing', 'Two pointers', 'Sliding window', 'Stack', 'Binary search', 'Linked lists', 'Trees', 'Graphs', 'Heaps', 'Intervals', 'Dynamic programming', 'Backtracking', 'Tries', 'Mixed'];
function problemForm(row, redo = null) {
  const wk = row ? PATTERNS.filter((p) => new RegExp(p.split(' ')[0], 'i').test(row.dsa)) : [];
  const opts = [...new Set([...(redo && redo.pattern ? [redo.pattern] : []), ...wk, ...PATTERNS])];
  openForm(redo ? 'Redo: ' + redo.name : 'Log a problem', `
    <label class="field"><span>Problem</span><input type="text" id="pName" placeholder="e.g. LC 3 Longest substring" value="${esc(redo ? redo.name : '')}"></label>
    <label class="field"><span>Link (optional)</span><input type="url" id="pLink" inputmode="url" placeholder="https://leetcode.com/problems/…" value="${esc(redo ? redo.link || '' : '')}"></label>
    <label class="field"><span>Pattern</span><select id="pPat">${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>
    <div class="two"><label class="field"><span>Minutes taken</span><input type="number" id="pMin" inputmode="numeric" min="1" max="180" placeholder="25"></label><span class="field"></span></div>
    <span class="label">How did it go?</span>${pick('Result', [['solved', 'Solved'], ['hint', 'Hint'], ['solution', 'Saw solution']], 'solved')}
    <label class="field"><span>One line on what tripped you (optional)</span><input type="text" id="pNote" placeholder="e.g. forgot to shrink the window"></label>
    <p class="hint">Anything not solved alone comes back in 2 days as a redo.</p>`, async (sheet) => {
    const name = $('#pName').value.trim(); if (!name) throw new Error('Name the problem first');
    const item = { name, link: $('#pLink').value.trim(), pattern: $('#pPat').value, minutes: Number($('#pMin').value) || null, result: $('.pick', sheet).dataset.value || 'solved', note: $('#pNote').value.trim(), at: new Date().toISOString() };
    if (redo) item.redo = true;
    await pushToday('problems', item, `app: problem ${name}`);
    toast(item.result === 'solved' ? 'Logged. Nice.' : 'Logged. It comes back in 2 days.'); route();
  });
}

async function problemsView() {
  shell({ tab: 'prep' }); skeleton();
  let logs, md; try { logs = await loadLogs(); md = (await readFile(P.prep)) || ''; } catch (e) { failView(e); return; }
  const problems = allProblems(logs); const redo = redoQueue(problems);
  const row = sprintRow(md, Math.max(1, sprintWeek()));
  const byWeek = {}; for (const p of problems) (byWeek[sprintWeek(p.day)] = byWeek[sprintWeek(p.day)] || []).push(p);
  const mark = { solved: '✓', hint: '½', solution: '✗' };
  const solvedAlone = problems.filter((p) => p.result === 'solved' && !p.redo).length;
  const v = view();
  v.innerHTML = `<div class="pad">${pageHead('Prep')}${chips(PREP2, 'log', '#/prep')}
    <section class="card statcard"><div class="stat-top"><div><span class="mini">This sprint</span><span class="big">${problems.filter((p) => !p.redo).length}<small> problems · ${solvedAlone} solved alone</small></span></div></div>
      <p class="hint">Target about 22 over 6 weeks, done well. Log each one in 10 seconds right after you finish.</p></section>
    <button class="btn primary block" id="logBtn">Log a problem</button>
    ${redo.length ? `<section class="card list"><div class="list-head"><h2>Redo queue</h2><span class="muted">${redo.length}</span></div>${redo.map((p, i) => `<div class="row"><span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(p.pattern || '')} · due ${esc(fmtDate(p.due))}</span></span><button class="btn small" data-redo="${i}">Redo</button></div>`).join('')}</section>` : ''}
    ${Object.keys(byWeek).sort((a, b) => b - a).map((w) => `<section class="card list"><div class="list-head"><h2>Week ${esc(w)}</h2><span class="muted">${byWeek[w].length}</span></div>${byWeek[w].slice().reverse().map((p) => `<div class="row"><span class="res ${esc(p.result)}" aria-label="${esc(p.result)}">${mark[p.result] || ''}</span><span class="row-main"><span class="row-title">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}${p.redo ? ' <span class="tag">redo</span>' : ''}</span><span class="row-sub">${esc([p.pattern, p.minutes ? p.minutes + ' min' : '', fmtDate(p.day)].filter(Boolean).join(' · '))}${p.note ? ' · ' + esc(p.note) : ''}</span></span></div>`).join('')}</section>`).join('') || '<p class="empty">No problems logged yet.</p>'}</div>`;
  wireTop();
  $('#logBtn').onclick = () => problemForm(row);
  v.querySelectorAll('[data-redo]').forEach((b) => { b.onclick = () => problemForm(row, redo[Number(b.dataset.redo)]); });
}

/* ---------- story drill ---------- */
const DRILL_QS = [
  ['Tell me about yourself.', 'A. Career story'], ['Why are you leaving your current company?', 'A. Career story'], ['Why do you want to join us?', 'A. Career story'],
  ['Why have your recent projects been so short?', 'A. Career story'], ['Do you have any other offers right now?', 'A. Career story'], ['Where do you see yourself in three years?', 'A. Career story'],
  ['Walk me through the hardest technical problem you have solved.', '3. Migration design'], ['Tell me about the project you are proudest of.', '3. Migration design'],
  ['Tell me about a technical decision you would make differently today.', '3. Migration design or 7. Plan that didn\'t land'],
  ['Tell me about a time you had to deliver with a very tight deadline.', '1. Compression'], ['How do you prioritise when everything is urgent?', '1. Compression'], ['How do you handle ambiguous requirements?', '1. Compression or 7. Plan that didn\'t land'],
  ['Tell me about a disagreement with your manager or a senior engineer.', '2. Disagreement'], ['Tell me about a time you changed someone\'s mind.', '2. Disagreement'],
  ['Tell me about a time you simplified something complex.', '4. Unified data model'], ['Describe an idea of yours that the team adopted.', '4. Unified data model'],
  ['Tell me about a time you led without having the title.', '5. AI workshops'], ['How have you helped other engineers grow?', '5. AI workshops or 6. Go-to senior'],
  ['Tell me about a time you unblocked a teammate.', '6. Go-to senior'], ['What would your current team say about you?', '6. Go-to senior'],
  ['Tell me about a failure. What did you learn?', '7. Plan that didn\'t land'], ['Tell me about feedback that changed how you work.', '7. Plan that didn\'t land'],
  ['What is your biggest weakness?', '8. Growth area'], ['Tell me about a production incident you handled. What did you change afterwards?', 'Pick your own; add it to the Story bank if it is good'],
];
async function drillView() {
  shell({ tab: 'prep' }); $('#fab').hidden = true; skeleton();
  let logs, story; try { logs = await loadLogs(addDays(localDate(), -7)); story = (await readFile(P.story)) || ''; } catch (e) { failView(e); return; }
  const recent = new Set(Object.values(logs).flatMap((l) => (l.drills || []).map((d) => d.q)));
  const pool = DRILL_QS.filter(([q]) => !recent.has(q));
  const pickQ = () => (pool.length ? pool : DRILL_QS)[Math.floor(Math.random() * (pool.length || DRILL_QS.length))];
  let [q, hint] = pickQ();
  const drillsDone = Object.values(logs).reduce((s, l) => s + (l.drills || []).length, 0);
  // story completeness
  const t = mdTable(story, /^##\s+Stories/i);
  const gaps = (t ? t.rows : []).map((r) => { const body = r.slice(2, r.length - 1).join(' '); const n = (body.match(/fill in/gi) || []).length; return { name: `${unesc(r[0])}. ${unesc(r[1])}`, n, todo: unesc(r[r.length - 1]) }; });
  const careerGaps = (mdSection(story, /Career story/i).match(/\\?\[(fill in|specific reason)[^\]]*\\?\]/gi) || []).length;
  const v = view();
  const draw = () => {
    v.innerHTML = `<div class="pad">${pageHead('Prep')}${chips(PREP2, 'drill', '#/prep')}
      <section class="card drill"><span class="mini">Final-round question · ${drillsDone} drilled this week</span><p class="flash-q">${esc(q)}</p>
        <details class="fold inset"><summary><span>Which story fits?</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="fold-body"><p>${esc(hint)}</p><p class="hint">Aim for 60-120 seconds: situation in one line, what YOU did, a number, the trade-off, what you'd do differently.</p></div></details>
        <div class="timer-wrap"><span class="timer big" id="dT">2:00</span><button class="btn" id="dStart">Start 2-minute timer</button></div>
        <label class="field"><span>Your answer (voice typing works)</span><textarea id="dA" rows="6" placeholder="Answer out loud first, then capture it here"></textarea></label>
        <div class="btnrow"><button class="btn grow" id="dNext">Another question</button><button class="btn primary grow" id="dSave">Send for scoring</button></div></section>
      <section class="card list"><div class="list-head"><h2>Story bank readiness</h2><span class="muted">${gaps.filter((g) => !g.n).length} of ${gaps.length} ready</span></div>
        <div class="row"><span class="res ${careerGaps ? 'hint' : 'solved'}">${careerGaps ? careerGaps : '✓'}</span><span class="row-main"><span class="row-title">A. Career story</span><span class="row-sub">${careerGaps ? `${careerGaps} gap${careerGaps > 1 ? 's' : ''} to fill` : 'Ready'}</span></span></div>
        ${gaps.map((g) => `<div class="row"><span class="res ${g.n ? 'hint' : 'solved'}">${g.n ? g.n : '✓'}</span><span class="row-main"><span class="row-title">${esc(g.name)}</span><span class="row-sub">${g.n ? esc(g.todo || 'Fill the gaps') : 'Ready'}</span></span></div>`).join('')}
        <a class="row" href="#/prep/stories"><span class="row-main"><span class="row-title">Open the Story bank</span><span class="row-sub">Edit stories in Obsidian, or send details with Ask Claude</span></span><span class="row-chev">${ICON.chev}</span></a></section></div>`;
    wireTop();
    let tick = null, left = 120, used = null;
    $('#dStart').onclick = () => {
      if (tick) { clearInterval(tick); tick = null; used = 120 - left; $('#dStart').textContent = 'Restart timer'; return; }
      left = 120; used = null; $('#dStart').textContent = 'Stop';
      tick = setInterval(() => {
        const tEl = $('#dT'); if (!tEl) { clearInterval(tick); return; }
        left--; const a = Math.abs(left);
        tEl.textContent = `${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; tEl.classList.toggle('over', left < 0);
      }, 1000);
    };
    $('#dNext').onclick = () => { clearInterval(tick); [q, hint] = pickQ(); draw(); };
    $('#dSave').onclick = async () => {
      const answer = $('#dA').value.trim(); if (answer.length < 20) { toast('Capture your answer first'); return; }
      if (tick) { clearInterval(tick); used = 120 - left; }
      await pushToday('drills', { q, story: hint, answer, seconds: used, at: new Date().toISOString() }, 'app: story drill');
      toast('Sent. Claude scores it in the next brief.'); recent.add(q); [q, hint] = pickQ(); draw();
    };
  };
  draw();
}

async function mistakesView() {
  shell({ tab: 'prep' }); skeleton();
  let md; try { md = (await readFile(P.prep)) || ''; } catch (e) { failView(e); return; }
  const t = mdTable(md, /Mistakes log/i);
  const rows = t ? t.rows.filter((r) => r.some((c) => unesc(c))) : [];
  const v = view();
  v.innerHTML = `<div class="pad">${pageHead('Prep')}${chips(PREP2, 'mistakes', '#/prep')}
    <p class="hint pad-t">Each card is something that went wrong. Say your rule for it out loud, then tap to check. Flip through these before every real interview.</p>
    ${rows.length ? rows.slice().reverse().map((r) => `<details class="card flip"><summary><span class="mini">${esc(unesc(r[0]))} · ${esc(unesc(r[1]))}</span><span class="flip-front">${inline(unesc(r[2]))}</span><span class="hint">Tap for your rule</span></summary><div class="callout"><span class="label">Rule for next time</span><p>${inline(unesc(r[3]))}</p></div></details>`).join('') : '<p class="empty">No mistakes logged yet. Mocks and quizzes add them.</p>'}</div>`;
  wireTop();
}

/* =====================================================================
   JOBS: company packs and debriefs
   ===================================================================== */
function enhanceJobCard(card, j) {
  const foot = $('.job-foot', card); if (!foot) return;
  const pack = COMPANIES + j.id + '.md';
  const extra = el('div', 'job-extra');
  if (tree.files[pack]) extra.innerHTML += `<a class="btn small primary" href="#/file/${encodeURIComponent(pack)}">Prep pack</a>`;
  else if (j.status === 'Interviewing') extra.innerHTML += `<span class="hint">Prep pack arrives with the next morning brief.</span>`;
  if (['Applied', 'Interviewing', 'Rejected'].includes(j.status)) extra.innerHTML += `<button class="btn small" type="button">Debrief a round</button>`;
  if (!extra.innerHTML) return;
  foot.after(extra);
  const b = $('button', extra); if (b) b.onclick = () => debriefForm(j);
}
function debriefForm(j) {
  openForm(`Debrief: ${j.company}`, `
    <span class="label">Round</span>${pick('Round', [['screen', 'Screen'], ['coding', 'Coding'], ['design', 'Design'], ['lld', 'LLD'], ['manager', 'Manager'], ['behavioural', 'Values']], 'coding')}
    <label class="field"><span>What did they ask?</span><textarea id="dbAsk" rows="4" placeholder="Questions, as close to their words as you remember"></textarea></label>
    <label class="field"><span>Where did you wobble?</span><textarea id="dbWob" rows="3" placeholder="Be honest; this becomes your plan"></textarea></label>
    <span class="label">How did it go?</span>${pick('Feel', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], '3')}<p class="hint">1 = went badly, 5 = went great</p>`, async (sheet) => {
    const asked = $('#dbAsk').value.trim(); if (!asked) throw new Error('Write what they asked first');
    const groups = sheet.querySelectorAll('.pick');
    await pushToday('debriefs', { jobId: j.id, company: j.company, role: j.role, round: groups[0].dataset.value, asked, wobbled: $('#dbWob').value.trim(), feel: Number(groups[1].dataset.value), at: new Date().toISOString() }, `app: debrief ${j.company}`);
    toast('Saved. Claude turns it into fixes in the next brief.');
  });
}

/* =====================================================================
   LISTS: reading triage
   ===================================================================== */
function triageActions(row, which, rawLine, section) {
  if (/^(done|watched|skipped)$/i.test(section)) return;
  const box = el('span', 'triage');
  box.innerHTML = `<button class="btn small" data-t="done">${which === 'watch' ? 'Watched' : 'Read'}</button><button class="btn small ghost" data-t="skip" aria-label="Skip">Skip</button>`;
  box.querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      const to = b.dataset.t === 'done' ? (which === 'watch' ? 'Watched' : 'Done') : 'Skipped';
      row.classList.add('is-done');
      await enqueue({ kind: 'moveLine', path: which === 'watch' ? P.watch : P.reading, line: rawLine, section: to, message: `app: ${to.toLowerCase()} ${which}` });
      toast(`${to === 'Skipped' ? 'Skipped' : 'Marked ' + to.toLowerCase()}. It's in History below.`);
      route();
    };
  });
  row.appendChild(box);
}
function historyActions(row, which, rawLine, section) {
  const box = el('span', 'triage');
  box.innerHTML = `<span class="tag">${esc(section)}</span><button class="btn small ghost" type="button">Undo</button>`;
  $('button', box).onclick = async () => {
    await enqueue({ kind: 'moveLine', path: which === 'watch' ? P.watch : P.reading, line: rawLine, section: which === 'watch' ? 'To watch' : 'To read', message: `app: back to ${which} list` });
    toast('Moved back to your list'); route();
  };
  row.appendChild(box);
}
/* same link already saved? YouTube links match on the video id, others on the URL without query/hash */
function linkKey(u) {
  try {
    const x = new URL(u); const h = x.hostname.replace(/^(www\.|m\.)/, '');
    if (h === 'youtu.be') return 'yt:' + x.pathname.slice(1);
    if (/youtube\.com$/.test(h)) return 'yt:' + (x.searchParams.get('v') || x.pathname.split('/').pop());
    return h + x.pathname.replace(/\/$/, '');
  } catch { return u; }
}
async function findInLists(url) {
  const key = linkKey(url);
  for (const [path, name] of [[P.watch, 'Watch list'], [P.reading, 'Reading list']]) {
    let section = '';
    for (const line of ((await readFile(path).catch(() => '')) || '').split('\n')) {
      const h = /^##\s+(.*)$/.exec(line); if (h) { section = h[1]; continue; }
      for (const m of line.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) if (linkKey(m[1]) === key) return { msg: `Already in your ${name} under "${section}"`, path };
    }
  }
  return null;
}

/* =====================================================================
   SHARE TARGET (Android share menu → Growth)
   ===================================================================== */
async function readShare() {
  try {
    const c = await caches.open('growth-share');
    const r = await c.match(new URL('__share', document.baseURI).href);
    if (!r) return null;
    const data = await r.json(); data.blobs = [];
    for (let i = 0; i < (data.files || 0); i++) { const f = await c.match(new URL('__share/file' + i, document.baseURI).href); if (f) data.blobs.push(await f.blob()); }
    return data;
  } catch { return null; }
}
async function clearShare() { try { await caches.delete('growth-share'); } catch { /* ignore */ } }
async function toJpegB64(blob) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(out); });
}
async function enqueueBinary(path, b64, message) {
  const op = { kind: 'binary', path, message, qid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  await kv.set('up:' + op.qid, b64);
  queue.push(op); saveQueue(); flush();
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function shareKind(d) {
  const url = d.url;
  if (d.blobs && d.blobs.length) return 'screenshot';
  if (!url) return d.text ? 'highlight' : 'note';
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i.test(hostOf(url))) return 'watch';
  const rest = (d.text || '').replace(url, '').replace(/https?:\/\/\S+/g, '').trim();
  if (rest.length > 60) return 'highlight';
  if (/(^|\.)(linkedin\.com|x\.com|twitter\.com|threads\.net)$/i.test(hostOf(url))) return 'idea';
  return 'reading';
}

async function shareView() {
  shell({ tab: 'inbox' }); $('#fab').hidden = true;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  let d = await readShare();
  if (!d) d = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '', blobs: [] };
  const found = (d.url || '') || ((d.text || '').match(/https?:\/\/\S+/) || [''])[0];
  d.url = found.replace(/[)\].,]+$/, '');
  if (!d.url && !d.text && !d.blobs.length) { location.hash = '#/inbox'; return; }
  let kind = shareKind(d);
  const quote = (d.text || '').replace(/https?:\/\/\S+/g, '').trim().replace(/^["“]|["”]$/g, '');
  const host = hostOf(d.url);
  const v = view();
  const KINDS2 = [['watch', 'Watch later'], ['reading', 'Read later'], ['highlight', 'Highlight'], ['idea', 'Post idea'], ['ask', 'Ask Claude'], ...(d.blobs.length ? [['screenshot', 'Screenshot']] : [])];
  const draw = () => {
    v.innerHTML = `<div class="pad">${pageHead('Save to Growth')}
      <section class="card form share">
        ${d.blobs.length ? `<div class="thumbs">${d.blobs.map((b, i) => `<img alt="Shared image ${i + 1}" data-i="${i}">`).join('')}</div>` : ''}
        ${d.url ? `<p class="share-src">${esc(host)}</p>` : ''}
        <span class="label">Save as</span>${pick('Save as', KINDS2, kind)}
        <label class="field"><span>Title</span><input type="text" id="sTitle" value="${esc(d.title || '')}" placeholder="${kind === 'watch' ? 'Video title' : 'What is it?'}"></label>
        ${quote && kind !== 'watch' && kind !== 'reading' ? `<label class="field"><span>${kind === 'highlight' ? 'Highlight' : 'Text'}</span><textarea id="sText" rows="4">${esc(quote)}</textarea></label>` : ''}
        <label class="field"><span>${kind === 'ask' ? 'Your question' : 'Why save it (optional)'}</span><input type="text" id="sWhy" placeholder="${kind === 'idea' ? 'Your angle for a post' : kind === 'ask' ? 'e.g. Is this worth my time before 6 Dec?' : 'e.g. for the Kafka rung'}"></label>
        <p class="hint">${{ watch: 'Goes to your Watch list. Claude adds a summary, length and how it fits your plan.', reading: 'Goes to your Reading list. Claude summarises it and sorts it into This week or After 6 Dec.', highlight: 'Saved as a highlight with its source. Claude files it next to the related note.', idea: 'Saved as a post idea for your presence backlog.', ask: 'Claude answers in the next morning brief.', screenshot: 'Uploaded to your vault. Claude reads it the next morning and files it.', note: '' }[kind] || ''}</p>
        <div class="btnrow end"><button class="btn" id="sCancel">Discard</button><button class="btn primary" id="sSave">Save</button></div></section></div>`;
    wireTop();
    v.querySelectorAll('.thumbs img').forEach((img) => { img.src = URL.createObjectURL(d.blobs[Number(img.dataset.i)]); });
    v.querySelectorAll('.pick button').forEach((b) => { b.onclick = () => { d.title = $('#sTitle').value; kind = b.dataset.v; draw(); }; });
    $('#sCancel').onclick = async () => { await clearShare(); location.hash = '#/inbox'; };
    $('#sSave').onclick = async () => {
      const btn = $('#sSave'); btn.disabled = true; btn.textContent = 'Saving…';
      try { await saveShare(kind, d, $('#sTitle').value.trim(), ($('#sText') ? $('#sText').value.trim() : quote), $('#sWhy').value.trim()); await clearShare(); location.hash = kind === 'watch' ? '#/inbox/watch' : kind === 'reading' ? '#/inbox/reading' : '#/inbox/notes'; }
      catch (e) { btn.disabled = false; btn.textContent = 'Save'; toast(e.message); }
    };
  };
  draw();
}
async function saveShare(kind, d, title, text, why) {
  const today = localDate(); const url = d.url;
  const t = (title || hostOf(url) || text.slice(0, 50) || 'Shared').replace(/[[\]]/g, '');
  const fm = (type, tags) => `---\ntype: ${type}\ntags: [${tags}]\ncreated: ${today}\nsource: growth-app\n${url ? `link: ${url}\n` : ''}---\n\n`;
  if (kind === 'watch' || kind === 'reading') {
    if (!url) throw new Error('No link found in what you shared');
    const watch = kind === 'watch';
    const dup = await findInLists(url);
    if (dup) { toast(dup.msg); return; }
    await enqueue({ kind: 'addLine', path: watch ? P.watch : P.reading, section: watch ? 'To watch' : 'To read', line: `- [${t}](${url})${why ? ' — ' + why : ''} #from-app`, message: `capture: ${t}` });
    toast(watch ? 'Added to Watch list' : 'Added to Reading list');
  } else if (kind === 'highlight') {
    if (!text) throw new Error('Nothing to highlight');
    await enqueue({ kind: 'create', path: `${P.inbox}${today} Highlight - ${slugTitle(t)}.md`, content: `${fm('highlight', 'highlight, inbox')}# ${t}\n\n> ${text.replace(/\n/g, '\n> ')}\n\n${url ? `Source: [${t}](${url})\n\n` : ''}${why ? `Why: ${why}\n` : ''}`, message: `capture: highlight ${t}` });
    toast('Highlight saved');
  } else if (kind === 'idea') {
    await enqueue({ kind: 'create', path: `${P.ideas}${slugTitle(t)}.md`, content: `---\ntype: idea\ncreated: ${today}\nstatus: raw\ntags: [idea, presence]\nsource: growth-app\n---\n\n# ${t}\n\n## The idea\n${why || t}\n\n## Spark\n${url ? `[${t}](${url})\n\n` : ''}${text ? '> ' + text.replace(/\n/g, '\n> ') + '\n' : ''}\n## Next step\n`, message: `capture: idea ${t}` });
    toast('Post idea saved');
  } else if (kind === 'ask') {
    const body = [why || 'What do you make of this?', url, text].filter(Boolean).join('\n');
    await enqueue({ kind: 'jsonPush', path: P.log(today), keys: ['replies'], item: { at: new Date().toISOString(), text: body, kind: 'ask' }, init: { date: today }, message: 'app: ask Claude (shared)' });
    toast('Sent. Claude answers in the next brief.');
  } else if (kind === 'screenshot') {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const names = [];
    for (let i = 0; i < d.blobs.length; i++) { const name = `${today}-${stamp}-${i + 1}.jpg`; names.push(name); await enqueueBinary(ATTACH + name, await toJpegB64(d.blobs[i]), `capture: screenshot ${name}`); }
    await enqueue({ kind: 'create', path: `${P.inbox}${today} Screenshot - ${slugTitle(title || why || 'shared image')}.md`, content: `${fm('screenshot', 'screenshot, inbox')}# ${title || why || 'Screenshot'}\n\n${names.map((n) => `![[attachments/${n}]]`).join('\n')}\n\n${why ? `Why: ${why}\n` : ''}${text ? `\n${text}\n` : ''}`, message: 'capture: screenshot note' });
    toast('Screenshot saved');
  } else {
    await enqueue({ kind: 'create', path: `${P.inbox}${today} ${slugTitle(t)}.md`, content: `${fm('note', 'inbox')}# ${t}\n\n${text}\n${why ? `\n${why}\n` : ''}`, message: `capture: ${t}` });
    toast('Saved to Inbox');
  }
}

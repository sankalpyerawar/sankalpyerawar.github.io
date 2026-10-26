// Renders the notebook page from public/data.json. Edit that file to update the site.

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isExternal = (url) => /^https?:\/\//.test(url);
const linkAttrs = (url) => (isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : '');

// ---------- Theme ----------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

function syncThemeButtons() {
  const current = effectiveTheme();
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.setTheme === current));
  });
}

function setupTheme() {
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.setTheme;
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('theme', theme); } catch (e) { /* storage unavailable */ }
      syncThemeButtons();
    });
  });
  darkQuery.addEventListener?.('change', syncThemeButtons);
  syncThemeButtons();
}

// ---------- Diagrams ----------
const syncWide = `
    <svg class="diagram wide" viewBox="0 0 640 170" role="img" aria-label="Two phones, each with a local SQLite database, sync through a shared Google Drive folder">
      <g fill="none" class="d-ink" stroke-width="1.5">
        <rect x="24" y="40" width="150" height="90" rx="10"/><rect x="466" y="40" width="150" height="90" rx="10"/>
        <rect x="245" y="50" width="150" height="70"/>
      </g>
      <path d="M178 85 H241 M399 85 H462" class="d-pen" stroke-width="1.5" fill="none"/>
      <g class="d-mono d-ink-f" text-anchor="middle">
        <text x="99" y="80">Phone A</text><text x="99" y="102" class="d-mut-f">SQLite</text>
        <text x="541" y="80">Phone B</text><text x="541" y="102" class="d-mut-f">SQLite</text>
        <text x="320" y="82">Google Drive</text><text x="320" y="102" class="d-mut-f">shared folder</text>
      </g>
      <text x="320" y="154" class="d-hand d-pen-f" text-anchor="middle">no server in the middle!</text>
    </svg>`;
const syncTall = `
    <svg class="diagram tall" viewBox="0 0 300 330" role="img" aria-label="Two phones, each with a local SQLite database, sync through a shared Google Drive folder">
      <g fill="none" class="d-ink" stroke-width="1.5">
        <rect x="70" y="14" width="160" height="70" rx="10"/><rect x="70" y="246" width="160" height="70" rx="10"/>
        <rect x="70" y="132" width="160" height="66"/>
      </g>
      <path d="M150 88 V128 M150 202 V242" class="d-pen" stroke-width="1.5" fill="none"/>
      <g class="d-mono d-ink-f" text-anchor="middle" font-size="15">
        <text x="150" y="45">Phone A</text><text x="150" y="67" class="d-mut-f">SQLite</text>
        <text x="150" y="162">Google Drive</text><text x="150" y="184" class="d-mut-f">shared folder</text>
        <text x="150" y="277">Phone B</text><text x="150" y="299" class="d-mut-f">SQLite</text>
      </g>
      <text x="250" y="102" class="d-hand d-pen-f" text-anchor="middle" font-size="16">no server</text>
      <text x="250" y="120" class="d-hand d-pen-f" text-anchor="middle" font-size="16">here!</text>
    </svg>`;
const diagrams = { 'studio-sync': syncWide + syncTall };

// ---------- Sections ----------
function renderAbout(d) {
  document.title = d.meta.title;
  $('meta-desc').content = d.meta.description;
  const p = d.profile;
  if (p.name) $('name').textContent = p.name;
  $('role').textContent = [p.role, p.location].filter(Boolean).join(' · ');
  $('bio').innerHTML = (p.bio || []).map((para) => `<p>${esc(para)}</p>`).join('');
  if (p.tagline) $('tagline').textContent = p.tagline; else $('tagline').parentElement.hidden = true;
  if (p.photo) {
    $('portrait').querySelector('.monogram').outerHTML = `<img src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}" width="320" height="320">`;
  }
  if (p.resumeUrl) $('resume-link').href = `.${p.resumeUrl.startsWith('/') ? '' : '/'}${p.resumeUrl}`;
  const social = p.social || {};
  const labels = { github: 'GitHub', linkedin: 'LinkedIn', medium: 'Medium' };
  $('cta').insertAdjacentHTML('beforeend', Object.entries(labels)
    .filter(([key]) => social[key])
    .map(([key, label]) => `<a class="btn" href="${esc(social[key])}"${linkAttrs(social[key])}>${label} ↗</a>`).join(''));
  $('facts').innerHTML = (p.facts || []).map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join('');
  $('rev').textContent = d.log?.[0]?.date || '';
  $('year').textContent = new Date().getFullYear();
  const edu = d.education?.[0];
  if (edu) $('education').textContent = `${edu.degree}, ${edu.university} (${edu.date})`;
}

function renderNow(d) {
  $('now-list').innerHTML = (d.now || []).map((item) => {
    const text = esc(item.text);
    const body = item.href ? `<a href="${esc(item.href)}"${linkAttrs(item.href)}>${text}</a>` : text;
    return `<div><dt>${esc(item.key)}</dt><dd>${body}</dd></div>`;
  }).join('');
}

function renderDecision(d) {
  const rec = d.decision;
  if (!rec || !rec.items?.length) return;
  $('decision').hidden = false;
  if (rec.title) $('decision-title').textContent = rec.title;
  $('decision-list').innerHTML = rec.items.map((item) => `
    <div><dt>${esc(item.label)}</dt><dd>${item.stamp ? `<span class="stamp">${esc(item.text)}</span>` : esc(item.text)}</dd></div>`).join('');
}

function renderProjects(d) {
  $('project-list').innerHTML = (d.projects || []).map((p) => {
    const links = [];
    if (p.liveUrl) links.push(`<a href="${esc(p.liveUrl)}"${linkAttrs(p.liveUrl)}>→ ${esc(p.liveText || 'Open')}</a>`);
    if (p.link) links.push(`<a href="${esc(p.link)}"${linkAttrs(p.link)}>→ ${esc(p.linkText || 'Source')}</a>`);
    return `
      <article class="project">
        <h3>${esc(p.title)}${p.status ? ` <span class="stamp">${esc(p.status)}</span>` : ''}</h3>
        ${p.diagram && diagrams[p.diagram] ? diagrams[p.diagram] : ''}
        <p>${esc(p.description)}</p>
        ${p.technologies?.length ? `<div class="tags">${p.technologies.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
        ${links.length ? `<div class="links">${links.join('')}</div>` : ''}
      </article>`;
  }).join('');
}

function renderWork(d) {
  $('work-list').innerHTML = (d.experience || []).map((job, i) => `
    <div class="rev">
      <div class="when">${esc(job.date)}</div>
      <h3>${esc(job.title)}</h3>
      <div class="org">${esc(job.company)}</div>
      ${job.summary ? `<p>${esc(job.summary)}</p>` : ''}
      ${job.nestedProjects?.length ? `
        <details${i === 0 ? ' open' : ''}>
          <summary>${job.nestedProjects.length} projects</summary>
          <ul>${job.nestedProjects.map((np) => `<li><b>${esc(np.title)}.</b> ${esc(np.summary)}</li>`).join('')}</ul>
        </details>` : ''}
    </div>`).join('');
}

function renderStack(d) {
  $('stack-list').innerHTML = Object.entries(d.skills || {}).map(([group, items]) => `
    <div><dt>${esc(group)}</dt><dd>${items.map(esc).join(' · ')}</dd></div>`).join('');
}

function renderLog(d) {
  $('log-list').innerHTML = (d.log || []).map((e, i) => `
    <li><span>${esc(e.date)}</span><span>${esc(e.text)}${i === 0 ? ' <span class="head">(HEAD)</span>' : ''}</span></li>`).join('');
}

function renderContact(d) {
  const social = d.profile.social || {};
  if (social.email) $('email').textContent = social.email.replace(/^mailto:/, '');
  const labels = { github: 'GitHub', linkedin: 'LinkedIn', medium: 'Medium', email: 'Email' };
  $('social-list').innerHTML = Object.entries(social)
    .filter(([key]) => key !== 'email')
    .map(([key, url]) => `<li><a href="${esc(url)}"${linkAttrs(url)}>${esc(labels[key] || key)}</a> <span class="muted">${esc(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</span></li>`)
    .join('');
}

async function init() {
  setupTheme();
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
    const data = await res.json();
    [renderAbout, renderNow, renderDecision, renderProjects, renderWork, renderStack, renderLog, renderContact]
      .forEach((fn) => fn(data));
  } catch (err) {
    console.error(err);
    $('now-list').innerHTML = '<div><dt>error</dt><dd>Could not load data.json. Try refreshing the page.</dd></div>';
  }
}

init();

import './style.css';
import { initGame } from './game.js';

// Social Icons (Logos)
const socialIcons = {
  email: `<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
  github: `<svg viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`
};

const themeIcons = {
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
};

// Helper to safely set text content
const setText = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

// Main render function
async function initPortfolio() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('Failed to load data');
    const data = await response.json();

    // Meta
    document.title = data.meta.title;
    const metaDesc = document.getElementById('meta-desc');
    if (metaDesc) metaDesc.content = data.meta.description;

    // Profile & Header
    const name = data.profile.name;
    const splitName = name.replace(' ', '<br>');
    const nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.innerHTML = splitName;

    // Sidebar
    setText('sidebar-name', name);
    setText('profile-initials-sidebar', data.profile.initials);

    const resumeBtn = document.getElementById('resume-sidebar-btn');
    if (resumeBtn && data.profile.resumeUrl) {
       resumeBtn.href = data.profile.resumeUrl;
    }

    setText('profile-subtitle', data.profile.subtitle);
    setText('year', new Date().getFullYear());

    // Profile Summary (Array)
    const summaryContainer = document.getElementById('profile-summary');
    if (summaryContainer) {
      summaryContainer.innerHTML = data.profile.summary
        .map(p => `<p>${p}</p>`)
        .join('');
    }

    // Social Links
    const socialContainer = document.getElementById('profile-socials');
    const footerSocialContainer = document.getElementById('footer-socials');

    if (data.profile.social) {
      const socialHtml = Object.entries(data.profile.social)
        .map(([key, url]) => {
          const icon = socialIcons[key];
          if (!icon) return ''; // Skip if not found
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          return `<a href="${url}" class="w-10 h-10 border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-primary-container hover:border-primary-container/50 transition-all bg-surface-container-high" aria-label="${label}" target="${key === 'email' ? '_self' : '_blank'}" rel="noopener noreferrer">${icon}</a>`;
        })
        .join('');

      if (socialContainer) socialContainer.innerHTML = socialHtml;

      const footerSocialHtml = Object.entries(data.profile.social)
        .map(([key, url]) => {
          const icon = socialIcons[key];
          if (!icon) return '';
          return `<a href="${url}" class="w-8 h-8 text-primary-container hover:text-white transition-colors flex items-center justify-center" aria-label="${key}" target="_blank" rel="noopener noreferrer">${icon}</a>`;
        })
        .join('');

      if (footerSocialContainer) footerSocialContainer.innerHTML = footerSocialHtml;
    }

    // Contact CTA
    const contactEmailBtn = document.getElementById('contact-email');
    if(contactEmailBtn && data.profile.social && data.profile.social.email) {
        contactEmailBtn.href = data.profile.social.email;
    }

    // Skills (Categorized)
    const skillsContainer = document.getElementById('skills-list');
    if (skillsContainer && data.skills) {
      let html = '';
      if (!Array.isArray(data.skills)) {
         let maxSkillPercentage = 98; // fake percentage drop for aesthetics
         html = Object.entries(data.skills)
          .map(([category, items]) => {
            const currentPercent = maxSkillPercentage;
            maxSkillPercentage = Math.max(70, maxSkillPercentage - 5);

            return `
            <div class="space-y-4 bg-surface-container-low p-6 md:p-8 border border-outline-variant/15 flex flex-col justify-between hover:bg-surface-container transition-colors">
              <div>
                 <h4 class="font-headline text-xs md:text-sm font-bold text-primary-container mb-4 uppercase tracking-[0.2em]">${category}</h4>
                 <div class="space-y-2">
                    ${items.map(skill => `<div class="text-[10px] md:text-xs text-on-surface-variant font-body uppercase border-b border-outline-variant/10 pb-1">${skill}</div>`).join('')}
                 </div>
              </div>
              <div class="mt-8 space-y-2">
                 <div class="flex justify-between font-headline text-[10px] uppercase tracking-widest text-on-surface">
                    <span>Proficiency</span>
                    <span>${currentPercent}%</span>
                 </div>
                 <div class="h-[2px] bg-surface-container-high w-full">
                    <div class="h-full bg-primary-container" style="width: ${currentPercent}%"></div>
                 </div>
              </div>
            </div>
          `;
          })
          .join('');
      }
      skillsContainer.innerHTML = html;
    }

    // Projects (Blueprints)
    const projectsContainer = document.getElementById('projects-list');
    if (projectsContainer && data.projects) {
      projectsContainer.innerHTML = data.projects.map((project, index) => `
        <div class="bg-surface-container-low p-6 md:p-10 border border-outline-variant/15 hover:bg-surface-container transition-colors group flex flex-col h-full">
            <div class="flex justify-between items-start mb-6 md:mb-8">
                <div>
                    <span class="font-headline text-[10px] text-primary-container uppercase tracking-widest">P_ID: 00${index + 1}</span>
                    <h3 class="font-headline text-2xl md:text-3xl font-bold uppercase mt-2 group-hover:text-primary-container transition-colors leading-none">${project.title}</h3>
                </div>
                ${project.link ? `<a class="material-symbols-outlined text-on-surface-variant hover:text-primary-container transition-colors flex-shrink-0" href="${project.link}" target="_blank" rel="noopener noreferrer">open_in_new</a>` : ''}
            </div>
            <p class="text-on-surface-variant mb-6 md:mb-10 text-sm leading-relaxed flex-grow">
                ${project.description}
            </p>
            <div class="flex flex-wrap gap-2 mb-6 md:mb-10">
                ${project.technologies.map(tech => `<span class="px-2 py-1 bg-surface-container-high text-[10px] font-headline uppercase text-on-surface-variant border border-outline-variant/20">${tech}</span>`).join('')}
            </div>
            <div class="pt-4 md:pt-6 border-t border-outline-variant/15 flex justify-between items-center mt-auto">
                <span class="font-headline text-[8px] md:text-[10px] uppercase tracking-widest text-on-surface-variant">Status: ACTIVE</span>
                <div class="flex gap-4">
                    ${project.liveUrl ? `<a href="${project.liveUrl}" target="_blank" rel="noopener noreferrer" class="material-symbols-outlined text-lg text-primary-container hover:opacity-80">play_circle</a>` : ''}
                    ${project.link ? `<a href="${project.link}" target="_blank" rel="noopener noreferrer" class="material-symbols-outlined text-lg hover:text-primary-container">code</a>` : ''}
                </div>
            </div>
        </div>
      `).join('');
    }

    // Experience
    const experienceContainer = document.getElementById('experience-list');
    if (experienceContainer && data.experience) {
      experienceContainer.innerHTML = data.experience.map((job, index) => {
        // fake metrics for aesthetic
        const metricValue = index === 0 ? '99.9%' : index === 1 ? '400+' : index === 2 ? '2TB' : 'SUB-MS';
        const metricLabel = index === 0 ? 'UPTIME' : index === 1 ? 'SERVICES' : index === 2 ? 'DATA/DAY' : 'LATENCY';

        return `
        <div class="grid grid-cols-1 lg:grid-cols-12 border-t border-outline-variant/20 py-8 lg:py-10 hover:bg-surface-container-low transition-colors px-0 lg:px-6 gap-6 lg:gap-0 group">
            <div class="lg:col-span-3">
                <div class="font-headline text-base lg:text-lg font-bold text-on-surface">${job.date}</div>
                <div class="font-headline text-[10px] text-primary-container uppercase tracking-widest mt-1">Status: Active_Node</div>
            </div>
            <div class="lg:col-span-5 pr-0 lg:pr-8">
                <h4 class="font-headline text-lg lg:text-xl font-bold uppercase mb-2 lg:mb-4 group-hover:text-primary-container transition-colors">${job.title} @ ${job.company}</h4>
                <p class="text-sm text-on-surface-variant leading-relaxed mb-4">${job.summary}</p>

                ${job.nestedProjects && job.nestedProjects.length > 0 ? `
                <ul class="space-y-3 text-xs lg:text-sm text-on-surface-variant leading-relaxed mt-4">
                    ${job.nestedProjects.slice(0, 2).map(proj => `
                    <li class="flex gap-3 items-start">
                        <span class="text-primary-container mt-1">&gt;&gt;</span>
                        <span><strong class="text-on-surface">${proj.title}:</strong> ${proj.summary}</span>
                    </li>
                    `).join('')}
                </ul>
                ` : ''}
            </div>
            <div class="lg:col-span-4 flex justify-start lg:justify-end items-start gap-4 mt-4 lg:mt-0">
                <div class="text-left lg:text-right">
                    <div class="font-headline text-2xl lg:text-3xl font-black text-on-surface">${metricValue}</div>
                    <div class="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">${metricLabel}</div>
                </div>
            </div>
        </div>
      `;
      }).join('');
    }

    // Initialize Game
    initGame();

    // System Status Clock
    const timeEl = document.getElementById('sys-time');
    if (timeEl) {
        setInterval(() => {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
        }, 1000);
    }

    // Force Dark Theme
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');

    // Reveal layout
    const layout = document.getElementById('layout');
    if (layout) {
      layout.classList.remove('opacity-0');
      layout.classList.add('opacity-100');
    }

  } catch (err) {
    console.error('Error loading portfolio data:', err);
    document.body.innerHTML = '<p style="color: #00FF41; text-align:center; padding: 2rem; font-family: monospace;">SYSTEM ERROR: FAILED TO LOAD DATA MODULE.</p>';
  }
}

// Call initialization
initPortfolio();

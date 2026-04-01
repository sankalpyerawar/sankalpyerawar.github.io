import './style.css';
import { initGame } from './game.js';

// Social Icons (Logos)
const socialIcons = {
  email: `<span class="material-symbols-outlined text-sky-400">mail</span>`,
  linkedin: `<span class="material-symbols-outlined text-sky-400">badge</span>`,
  github: `<span class="material-symbols-outlined text-sky-400">code</span>`,
  external: `<span class="material-symbols-outlined text-slate-600 group-hover:text-primary transition-colors">arrow_outward</span>`
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
    const splitName = name.replace(' ', ' <br/> <span class="text-sky-400">');
    const heroEl = document.getElementById('hero-content');
    if (heroEl) {
        heroEl.innerHTML = `
            <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full mb-8">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                <span class="text-[10px] mono-data text-primary uppercase font-bold tracking-widest">Architectural Registry</span>
            </div>
            <h2 class="text-6xl md:text-7xl font-black text-on-surface font-headline leading-none tracking-tighter mb-4 max-w-4xl uppercase">
                ${splitName}</span>
            </h2>
            <p class="text-xl text-on-surface-variant max-w-2xl font-body leading-relaxed mb-10">
                ${data.profile.subtitle}
            </p>
        `;
    }

    const readmeEl = document.getElementById('hero-readme-section');
    if (readmeEl) {
        const summaryLines = data.profile.summary.map((line, index) => `
            <div class="flex items-start gap-4 mb-4">
                <span class="text-primary opacity-50">${(index + 2).toString().padStart(2, '0')}</span>
                <p>${line}</p>
            </div>
        `).join('');

        readmeEl.innerHTML = `
            <div class="bg-surface-container-low rounded-xl overflow-hidden shadow-2xl">
                <div class="bg-[#05183c] px-6 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-slate-400 text-sm" data-icon="description">description</span>
                        <span class="text-xs mono-data font-bold text-slate-300">README.md</span>
                    </div>
                    <div class="flex gap-1.5">
                        <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                        <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                        <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                    </div>
                </div>
                <div class="p-6 md:p-10 mono-data text-sm text-on-surface-variant leading-relaxed max-w-5xl">
                    <div class="flex items-start gap-4 mb-8">
                        <span class="text-primary opacity-50">01</span>
                        <p><span class="text-primary"># Introduction</span></p>
                    </div>
                    ${summaryLines}
                </div>
            </div>
        `;
    }

    // Sidebar & Footer
    const resumeBtn = document.getElementById('resume-sidebar-btn');
    if (resumeBtn && data.profile.resumeUrl) {
       resumeBtn.href = data.profile.resumeUrl;
    }

    setText('year', new Date().getFullYear());

    // Social Links / Contact Nodes
    const footerSocialContainer = document.getElementById('footer-socials');
    if (data.profile.social) {
      const footerSocialHtml = Object.entries(data.profile.social)
        .map(([key, url]) => {
          const icon = socialIcons[key] || socialIcons.external;
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          const desc = key === 'email' ? 'Direct SMTP Access' : key === 'github' ? 'Source Repositories' : 'Professional Network';
          return `
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between p-4 bg-surface-container-low rounded-md group hover:bg-surface-container-highest transition-all duration-300">
                <div class="flex items-center gap-4">
                    ${icon}
                    <div>
                        <p class="font-headline text-sm font-bold text-on-surface">${label}</p>
                        <p class="font-label text-[10px] text-slate-500 uppercase tracking-tighter">${desc}</p>
                    </div>
                </div>
                ${socialIcons.external}
            </a>
          `;
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
         html = Object.entries(data.skills)
          .map(([category, items], index) => {
            const isLarge = index === 0;
            const colSpan = isLarge ? 'col-span-12 lg:col-span-6 lg:row-span-2' : 'col-span-12 lg:col-span-6';
            const icon = index === 0 ? 'terminal' : index === 1 ? 'cloud' : index === 2 ? 'database' : 'schema';

            return `
            <div class="${colSpan} bg-surface-container-low p-6 md:p-8 rounded-xl relative overflow-hidden group">
                <div class="flex justify-between items-start mb-6">
                    <div class="space-y-1">
                        <p class="text-xs font-label text-sky-400 uppercase tracking-widest">Category</p>
                        <h4 class="text-2xl font-bold font-headline text-on-surface">${category}</h4>
                    </div>
                    <span class="material-symbols-outlined text-3xl text-on-surface-variant/20">${icon}</span>
                </div>
                <div class="space-y-3 mt-8">
                    ${items.map(skill => `
                        <div class="flex justify-between items-center py-2 border-b border-outline-variant/5">
                            <span class="font-label text-xs uppercase text-on-surface-variant group-hover:text-sky-200 transition-colors">${skill}</span>
                            <span class="material-symbols-outlined text-xs text-sky-400 opacity-50">check</span>
                        </div>
                    `).join('')}
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
      projectsContainer.innerHTML = data.projects.map((project, index) => {
          const colSpan = index === 0 ? 'col-span-1 md:col-span-12 lg:col-span-8' : 'col-span-1 md:col-span-6 lg:col-span-4';

          return `
            <div class="${colSpan} bg-surface-container-low rounded-xl p-8 flex flex-col justify-between border border-transparent hover:border-outline-variant/20 transition-all duration-300 group">
                <div>
                    <div class="flex gap-2 mb-4">
                        <span class="px-2 py-0.5 bg-primary-container text-on-primary-container rounded-full text-[10px] font-label font-bold tracking-widest uppercase">P_ID: 0${index + 1}</span>
                    </div>
                    <h3 class="text-2xl font-bold font-headline mb-4 group-hover:text-sky-400 transition-colors">${project.title}</h3>
                    <p class="text-on-surface-variant text-sm font-body leading-relaxed mb-6">
                        ${project.description}
                    </p>
                    <div class="flex flex-wrap gap-2 mb-8">
                        ${project.technologies.map(tech => `<span class="text-[11px] font-label px-2 py-1 bg-surface-container text-sky-400 uppercase">${tech}</span>`).join('')}
                    </div>
                </div>
                <div class="flex gap-4 mt-auto pt-6 border-t border-outline-variant/10">
                    ${project.link ? `
                    <a class="flex items-center gap-2 text-xs font-label uppercase tracking-widest text-primary hover:underline" href="${project.link}" target="_blank" rel="noopener noreferrer">
                        <span class="material-symbols-outlined text-sm" data-icon="code">code</span> ${project.linkText || 'View Repo'}
                    </a>` : ''}
                    ${project.liveUrl ? `
                    <a class="flex items-center gap-2 text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="${project.liveUrl}" target="_blank" rel="noopener noreferrer">
                        <span class="material-symbols-outlined text-sm" data-icon="play_circle">play_circle</span> Live Demo
                    </a>` : ''}
                </div>
            </div>
          `;
      }).join('');
    }

    // Experience
    const experienceContainer = document.getElementById('experience-list');
    if (experienceContainer && data.experience) {
      experienceContainer.innerHTML = data.experience.map((job, index) => {
        return `
        <div class="relative pl-8 md:pl-20 group">
            <div class="absolute left-[-5px] md:left-0 top-1 w-6 h-6 md:w-16 md:h-16 flex items-center justify-center">
                <div class="w-3 h-3 md:w-4 md:h-4 rounded-full bg-background border-4 border-primary z-10 transition-transform group-hover:scale-125 duration-300"></div>
                <div class="hidden md:block absolute inset-0 bg-primary/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 items-start">
                <div class="lg:col-span-4 space-y-1 md:space-y-2">
                    <span class="text-xs md:text-sm font-label font-bold text-sky-400 tracking-wider">${job.date}</span>
                    <h3 class="text-xl md:text-2xl font-bold font-headline text-on-surface leading-tight">${job.title}</h3>
                    <p class="text-on-surface-variant font-label text-[10px] md:text-sm uppercase tracking-widest">${job.company}</p>
                </div>
                <div class="lg:col-span-8">
                    <div class="bg-surface-container-low p-6 md:p-8 rounded-xl border border-transparent hover:bg-surface-container transition-all duration-300 shadow-xl">
                        <p class="text-on-surface-variant text-sm leading-relaxed mb-6">
                            ${job.summary}
                        </p>
                        ${job.nestedProjects && job.nestedProjects.length > 0 ? `
                        <ul class="space-y-4 text-on-surface-variant">
                            ${job.nestedProjects.map(proj => `
                            <li class="flex gap-3 md:gap-4">
                                <span class="text-primary mt-1 select-none">/</span>
                                <p class="text-xs md:text-sm leading-relaxed">
                                    <strong class="text-sky-300 font-label tracking-wide uppercase text-[10px] block mb-1">${proj.title}</strong>
                                    ${proj.summary}
                                </p>
                            </li>
                            `).join('')}
                        </ul>
                        ` : ''}

                        ${job.technologies && job.technologies.length > 0 ? `
                        <div class="mt-8 pt-6 border-t border-outline-variant/10 flex flex-wrap gap-2">
                            ${job.technologies.map(tech => `<span class="px-2 py-1 bg-surface-container-highest rounded text-[10px] font-label text-sky-300 uppercase">${tech}</span>`).join('')}
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
      `;
      }).join('');
    }

    // Initialize Game
    initGame();

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
    document.body.innerHTML = '<p style="color: #7bd0ff; text-align:center; padding: 2rem; font-family: monospace;">SYSTEM ERROR: FAILED TO LOAD DATA MODULE.</p>';
  }
}

// Call initialization
initPortfolio();
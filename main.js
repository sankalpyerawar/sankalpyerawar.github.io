import './style.css';
import { initGame } from './game.js';

// Social Icons (Logos)
const socialIcons = {
  email: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
  github: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`
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

    const resumeBtn = document.getElementById('download-spec-btn');
    if (resumeBtn && data.profile.resumeUrl) {
       resumeBtn.href = data.profile.resumeUrl;
    }

    setText('year', new Date().getFullYear());

    // Profile Summary (Using first item of array or joining)
    const summaryContainer = document.getElementById('profile-summary');
    if (summaryContainer) {
      summaryContainer.innerHTML = data.profile.summary.join(' ');
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
            // Take first 3 keys to match 3 columns
            const categories = Object.keys(data.skills).slice(0, 3);

            categories.forEach(category => {
                const items = data.skills[category];
                html += `
                <div class="bg-surface p-6 md:p-8">
                    <h4 class="font-label text-[10px] text-[#00FF41] mb-6 uppercase tracking-[0.2em]">${category}</h4>
                    <div class="space-y-4">
                        ${items.map(skill => `
                        <div class="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                            <span class="text-on-surface font-headline font-medium text-[10px] md:text-xs uppercase">${skill}</span>
                        </div>
                        `).join('')}
                    </div>
                </div>
                `;
            });
        }
        skillsContainer.innerHTML = html;
    }

    // Projects (Bento Grid)
    const projectsContainer = document.getElementById('projects-list');
    if (projectsContainer && data.projects) {
      projectsContainer.innerHTML = data.projects.map((project, index) => {

        let colSpanClass = 'md:col-span-4'; // Default small block
        if (project.gridSize === 'large' || index === 0) colSpanClass = 'md:col-span-8';
        if (project.gridSize === 'medium' || index === 1) colSpanClass = 'md:col-span-4';

        const isLarge = colSpanClass === 'md:col-span-8';

        return `
        <div class="${colSpanClass} bg-surface-container-low p-6 md:p-8 border border-outline-variant/10 flex flex-col justify-between ${isLarge ? 'min-h-[400px]' : ''} hover:border-[#00FF41]/30 transition-colors">
            <div>
                <div class="flex justify-between items-start mb-6">
                    <span class="material-symbols-outlined text-[#00FF41] text-3xl md:text-4xl" data-icon="${project.icon || 'code'}">${project.icon || 'code'}</span>
                    <span class="font-label text-[8px] md:text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-1 uppercase">P_ID: 00${index + 1}</span>
                </div>
                <h4 class="font-headline text-xl md:text-3xl font-bold text-primary mb-2 md:mb-4 uppercase">${project.title}</h4>
                <p class="text-on-surface-variant text-xs md:text-sm max-w-md mb-6 leading-relaxed">
                    ${project.description}
                </p>
            </div>
            <div class="space-y-4">
                <div class="flex flex-wrap gap-2">
                    ${project.technologies.slice(0, 3).map(tech => `<span class="border border-outline-variant/30 px-3 py-1 text-[8px] md:text-[10px] font-label text-on-surface uppercase bg-surface-container-high">${tech}</span>`).join('')}
                </div>
                <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/10">
                    ${project.link ? `
                    <a class="text-[#00FF41] font-label text-[10px] md:text-xs uppercase flex items-center gap-1 hover:underline" href="${project.link}" target="_blank" rel="noopener noreferrer">
                        <span class="material-symbols-outlined text-sm md:text-base" data-icon="open_in_new">open_in_new</span> DOCUMENTATION
                    </a>
                    ` : ''}
                    ${project.liveUrl ? `
                    <a class="text-[#00FF41] font-label text-[10px] md:text-xs uppercase flex items-center gap-1 hover:underline" href="${project.liveUrl}" target="_blank" rel="noopener noreferrer">
                        <span class="material-symbols-outlined text-sm md:text-base" data-icon="play_circle">play_circle</span> LIVE DEMO
                    </a>
                    ` : ''}
                </div>
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
                    <div class="font-headline text-2xl lg:text-3xl font-black text-on-surface">${job.metricValue}</div>
                    <div class="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">${job.metricLabel}</div>
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

    // Social Links handling
    const footerSocials = document.getElementById('footer-socials');
    if (footerSocials && data.profile && data.profile.social) {
        footerSocials.innerHTML = '';
        for (const [platform, link] of Object.entries(data.profile.social)) {
            const svgIcon = socialIcons[platform] || socialIcons.external;
            const a = document.createElement('a');
            a.href = link;
            if (platform !== 'email') {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            a.className = 'w-5 h-5 text-primary-container cursor-pointer hover:text-white transition-colors block';
            a.title = platform.toUpperCase();
            a.innerHTML = svgIcon;
            footerSocials.appendChild(a);
        }
    }

    const yearSpan = document.getElementById('year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();


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

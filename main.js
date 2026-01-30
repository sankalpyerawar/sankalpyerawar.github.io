import './style.css'

// Theme Logic
const toggleSwitch = document.getElementById('checkbox');
const body = document.body;

function switchTheme(e) {
  if (e.target.checked) {
    body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  }
}

// Check local storage (default is null -> dark -> unchecked)
if (localStorage.getItem('theme') === 'light') {
  body.classList.add('light-mode');
  if (toggleSwitch) toggleSwitch.checked = true;
}

if (toggleSwitch) {
  toggleSwitch.addEventListener('change', switchTheme);
}

// Social Icons (Logos)
const socialIcons = {
  email: `<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
  github: `<svg viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
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

    // Profile
    // Split name for two-line display side-by-side with logo
    const name = data.profile.name;
    const splitName = name.replace(' ', '<br>');
    const nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.innerHTML = splitName;

    setText('profile-initials', data.profile.initials);
    setText('profile-subtitle', data.profile.subtitle);
    setText('footer-name', data.profile.name);
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
    if (socialContainer && data.profile.social) {
      const socialHtml = Object.entries(data.profile.social)
        .map(([key, url]) => {
          const icon = socialIcons[key];
          if (!icon) return ''; // Skip if not found
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          return `<a href="${url}" class="social-icon-link" aria-label="${label}" data-tooltip="${label}" target="${key === 'email' ? '_self' : '_blank'}" rel="noopener noreferrer">${icon}</a>`;
        })
        .join('');
      socialContainer.innerHTML = socialHtml;
    }

    // Resume Button
    const resumeContainer = document.getElementById('resume-container');
    if (resumeContainer && data.profile.resumeUrl) {
      resumeContainer.innerHTML = `
        <a href="${data.profile.resumeUrl}" class="resume-button" target="_blank" rel="noopener noreferrer">
           <svg class="icon-download" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 6px;">
             <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
           </svg>
           Resume
        </a>
      `;
    }

    // Skills (Categorized)
    const skillsContainer = document.getElementById('skills-list');
    if (skillsContainer && data.skills) {
      if (Array.isArray(data.skills)) {
        // Fallback for flat array (old format)
        skillsContainer.innerHTML = data.skills
          .map(skill => `<span class="tag">${skill}</span>`)
          .join('');
      } else {
        // Categorized Object
        skillsContainer.innerHTML = Object.entries(data.skills)
          .map(([category, items]) => `
            <div class="skill-category" style="margin-bottom: 0.75rem;">
              <h3 class="skill-category-title">${category}</h3>
              <div class="skill-tags">
                ${items.map(skill => `<span class="tag">${skill}</span>`).join('')}
              </div>
            </div>
          `)
          .join('');
      }
    }

    // Projects
    const projectsContainer = document.getElementById('projects-list');
    if (projectsContainer && data.projects) {
      projectsContainer.innerHTML = data.projects.map(project => `
        <div class="project-card">
          <div class="project-header">
             <h3 class="project-title">${project.title}</h3>
             <div class="project-links">
               ${project.link ? `<a href="${project.link}" target="_blank" rel="noopener noreferrer" class="icon-link source-link" aria-label="View Source">${socialIcons.github}</a>` : ''}
               ${project.liveUrl ? `<a href="${project.liveUrl}" target="_blank" rel="noopener noreferrer" class="icon-link live-link" aria-label="View Live Project">${socialIcons.external}</a>` : ''}
             </div>
          </div>
          <p class="project-description">${project.description}</p>
          <div class="project-tech">
            ${project.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
          </div>
        </div>
      `).join('');
    }

    // Experience
    const experienceContainer = document.getElementById('experience-list');
    if (experienceContainer && data.experience) {
      experienceContainer.innerHTML = data.experience.map(job => `
        <article class="job">
          <div class="job-header">
            <h3>${job.title}</h3>
            <div class="job-meta">
              <span class="company">${job.company}</span>
              <span class="date">${job.date}</span>
            </div>
          </div>
          <ul class="job-details">
            ${job.details.map(detail => `<li>${detail}</li>`).join('')}
          </ul>
        </article>
      `).join('');
    }

    // Education
    const educationContainer = document.getElementById('education-list');
    if (educationContainer && data.education) {
      educationContainer.innerHTML = data.education.map(school => `
        <div class="school">
            <h3>${school.degree}</h3>
            <p>${school.university} (${school.date})</p>
        </div>
      `).join('');
    }

    // Reveal layout after load
    document.getElementById('layout').style.opacity = '1';

  } catch (err) {
    console.error('Error loading portfolio data:', err);
    document.body.innerHTML = '<p style="text-align:center; padding: 2rem;">Error loading portfolio data. Please check console.</p>';
  }
}

initPortfolio();

// Mobile Collapsible Sections
function setupCollapsible(toggleId, contentId) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);

  if (toggle && content) {
    toggle.addEventListener('click', () => {
      content.classList.toggle('open');
      const chevron = toggle.querySelector('.chevron');
      if (chevron) chevron.classList.toggle('rotate-icon');
    });
  }
}

// Initialize Toggles
setupCollapsible('skills-toggle', 'skills-list');
setupCollapsible('education-toggle', 'education-list');
setupCollapsible('summary-toggle', 'profile-summary');
setupCollapsible('projects-toggle', 'projects-list');
setupCollapsible('experience-toggle', 'experience-list');

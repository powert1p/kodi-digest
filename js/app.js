/* === Kodi Digest — App JS (accordion, \u0430\u043d\u0438\u043c\u0430\u0446\u0438\u0438) === */

document.addEventListener('DOMContentLoaded', () => {
  // --- Fade-in \u043f\u0440\u0438 \u0441\u043a\u0440\u043e\u043b\u043b\u0435 ---
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-in-up').forEach(el => observer.observe(el));

  // --- Card Detail: плавный expand/collapse ---
  document.querySelectorAll('.card-detail').forEach(details => {
    const summary = details.querySelector('summary');
    const content = details.querySelector('.card-detail-content');
    if (!summary || !content) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (details.open) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.overflow = 'hidden';
        content.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
        content.style.opacity = '1';
        requestAnimationFrame(() => {
          content.style.maxHeight = '0';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function handler() {
          details.open = false;
          content.style.maxHeight = '';
          content.style.overflow = '';
          content.style.transition = '';
          content.style.opacity = '';
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      } else {
        details.open = true;
        content.style.maxHeight = '0';
        content.style.overflow = 'hidden';
        content.style.opacity = '0';
        content.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
        requestAnimationFrame(() => {
          content.style.maxHeight = content.scrollHeight + 'px';
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function handler() {
          content.style.maxHeight = '';
          content.style.overflow = '';
          content.style.transition = '';
          content.style.opacity = '';
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      }
    });
  });

  // --- Accordion: \u043f\u043b\u0430\u0432\u043d\u044b\u0439 \u043e\u0442\u043a\u0440\u044b\u0442\u044c/\u0437\u0430\u043a\u0440\u044b\u0442\u044c ---
  document.querySelectorAll('.accordion-card').forEach(details => {
    const summary = details.querySelector('.accordion-summary');
    const body = details.querySelector('.accordion-body');
    if (!summary || !body) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (details.open) {
        // \u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0441 \u0430\u043d\u0438\u043c\u0430\u0446\u0438\u0435\u0439
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.overflow = 'hidden';
        body.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
        body.style.opacity = '1';
        requestAnimationFrame(() => {
          body.style.maxHeight = '0';
          body.style.opacity = '0';
        });
        body.addEventListener('transitionend', function handler() {
          details.open = false;
          body.style.maxHeight = '';
          body.style.overflow = '';
          body.style.transition = '';
          body.style.opacity = '';
          body.removeEventListener('transitionend', handler);
        }, { once: true });
      } else {
        // \u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441 \u0430\u043d\u0438\u043c\u0430\u0446\u0438\u0435\u0439
        details.open = true;
        body.style.maxHeight = '0';
        body.style.overflow = 'hidden';
        body.style.opacity = '0';
        body.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
        requestAnimationFrame(() => {
          body.style.maxHeight = body.scrollHeight + 'px';
          body.style.opacity = '1';
        });
        body.addEventListener('transitionend', function handler() {
          body.style.maxHeight = '';
          body.style.overflow = '';
          body.style.transition = '';
          body.style.opacity = '';
          body.removeEventListener('transitionend', handler);
        }, { once: true });
      }
    });
  });
});

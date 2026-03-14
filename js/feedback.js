/* === Kodi Digest — Feedback System (localStorage + Telegram) === */
/* V3: localStorage + Telegram deep link + sticky panel + статусы бэклога */

function updateSyncStatus(text, type) {
  const el = document.querySelector('.feedback-sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'feedback-sync-status' + (type ? ' sync-' + type : '');
}

/* === Утилита: определить дату дайджеста из URL === */
function getDigestDateFromUrl() {
  // Паттерн: daily/YYYY-MM-DD.html
  const match = window.location.pathname.match(/daily\/(\d{4}-\d{2}-\d{2})\.html/);
  return match ? match[1] : null;
}

/* === FeedbackStore === */
const FeedbackStore = {
  STORAGE_KEY: 'kodiDigest',

  _load() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {}; }
    catch { return {}; }
  },
  _save(data) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },
  _getDay(date) {
    const data = this._load();
    if (!data.feedbackData) data.feedbackData = {};
    if (!data.feedbackData[date]) data.feedbackData[date] = { likes: [], dislikes: [], backlog: [], sent: false };
    return { data, day: data.feedbackData[date] };
  },

  // Лайк — toggle, убирает дизлайк если был
  toggleLike(date, cardId) {
    const { data, day } = this._getDay(date);
    const idx = day.likes.indexOf(cardId);
    if (idx > -1) {
      day.likes.splice(idx, 1);
      this._removeFromAllLiked(data, date, cardId);
    } else {
      day.likes.push(cardId);
      const dIdx = day.dislikes.indexOf(cardId);
      if (dIdx > -1) day.dislikes.splice(dIdx, 1);
      this._addToAllLiked(data, date, cardId);
    }
    this._save(data);
    return day.likes.includes(cardId);
  },

  // Дизлайк — toggle, убирает лайк если был
  toggleDislike(date, cardId) {
    const { data, day } = this._getDay(date);
    const idx = day.dislikes.indexOf(cardId);
    if (idx > -1) {
      day.dislikes.splice(idx, 1);
    } else {
      day.dislikes.push(cardId);
      const lIdx = day.likes.indexOf(cardId);
      if (lIdx > -1) {
        day.likes.splice(lIdx, 1);
        this._removeFromAllLiked(data, date, cardId);
      }
    }
    this._save(data);
    return day.dislikes.includes(cardId);
  },

  // Бэклог — toggle
  addToBacklog(date, cardId) {
    const { data, day } = this._getDay(date);
    const idx = day.backlog.indexOf(cardId);
    if (idx > -1) {
      day.backlog.splice(idx, 1);
      this._removeFromAllBacklog(data, date, cardId);
    } else {
      day.backlog.push(cardId);
      this._addToAllBacklog(data, date, cardId);
    }
    this._save(data);
    return day.backlog.includes(cardId);
  },

  _addToAllLiked(data, date, cardId) {
    if (!data.allLiked) data.allLiked = [];
    const fullId = `${date}_${cardId}`;
    if (!data.allLiked.find(x => x.id === fullId)) {
      const meta = getCardMeta(cardId);
      data.allLiked.push({ id: fullId, title: meta.title, date, category: meta.category });
    }
  },
  _removeFromAllLiked(data, date, cardId) {
    if (!data.allLiked) return;
    data.allLiked = data.allLiked.filter(x => x.id !== `${date}_${cardId}`);
  },
  _addToAllBacklog(data, date, cardId) {
    if (!data.allBacklog) data.allBacklog = [];
    const fullId = `${date}_${cardId}`;
    if (!data.allBacklog.find(x => x.id === fullId)) {
      const meta = getCardMeta(cardId);
      data.allBacklog.push({ id: fullId, title: meta.title, date, status: 'new' });
    }
  },
  _removeFromAllBacklog(data, date, cardId) {
    if (!data.allBacklog) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== `${date}_${cardId}`);
  },

  // Статистика по дате
  getStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length, dislikes: day.dislikes.length, backlog: day.backlog.length, sent: !!day.sent };
  },

  // Состояние конкретной карточки
  getState(date, cardId) {
    const { day } = this._getDay(date);
    return { liked: day.likes.includes(cardId), disliked: day.dislikes.includes(cardId), backlogged: day.backlog.includes(cardId) };
  },

  // Все лайкнутые карточки
  getAllLiked() { return this._load().allLiked || []; },

  // Убрать лайк (для liked.html)
  removeLike(fullId) {
    const data = this._load();
    if (!data.allLiked) return;
    data.allLiked = data.allLiked.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) data.feedbackData[date].likes = data.feedbackData[date].likes.filter(x => x !== cardId);
    this._save(data);
  },

  // Все задачи бэклога
  getAllBacklog() { return this._load().allBacklog || []; },

  // Убрать из бэклога
  removeBacklog(fullId) {
    const data = this._load();
    if (!data.allBacklog) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) data.feedbackData[date].backlog = data.feedbackData[date].backlog.filter(x => x !== cardId);
    this._save(data);
  },

  // Обновить статус задачи бэклога (new -> in_progress -> done)
  updateBacklogStatus(fullId, newStatus) {
    const data = this._load();
    if (!data.allBacklog) return;
    const item = data.allBacklog.find(x => x.id === fullId);
    if (item) {
      item.status = newStatus;
      this._save(data);
    }
  },

  // Циклический переход статуса: new -> in_progress -> done -> new
  cycleBacklogStatus(fullId) {
    const data = this._load();
    if (!data.allBacklog) return 'new';
    const item = data.allBacklog.find(x => x.id === fullId);
    if (!item) return 'new';
    const cycle = { 'new': 'in_progress', 'in_progress': 'done', 'done': 'new' };
    item.status = cycle[item.status] || 'new';
    this._save(data);
    return item.status;
  },

  // Статы для index.html (кол-во лайков за дату)
  getDateStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length };
  },

  // Пометить дату как «отправлено»
  markSent(date) {
    const { data, day } = this._getDay(date);
    day.sent = true;
    this._save(data);
  },

  // Проверить отправлено ли
  isSent(date) {
    const { day } = this._getDay(date);
    return !!day.sent;
  },

  // Собрать текст фидбэка для отправки в Telegram
  getFeedbackText(date) {
    const { day } = this._getDay(date);
    const data = this._load();
    const allLiked = data.allLiked || [];
    const allBacklog = data.allBacklog || [];
    const sections = [];

    // Лайки — берём title из allLiked
    if (day.likes.length) {
      const titles = day.likes.map(id => {
        const fullId = `${date}_${id}`;
        const stored = allLiked.find(x => x.id === fullId);
        if (stored) return stored.title;
        return getCardMeta(id).title;
      }).filter(Boolean);
      if (titles.length) {
        sections.push('\u{1F44D} \u{041B}\u{0430}\u{0439}\u{043A}\u{0438}:\n' + titles.map(t => '- ' + t).join('\n'));
      }
    }

    // Дизлайки — берём из DOM
    if (day.dislikes.length) {
      const titles = day.dislikes.map(id => getCardMeta(id).title).filter(Boolean);
      if (titles.length) {
        sections.push('\u{1F44E} \u{0414}\u{0438}\u{0437}\u{043B}\u{0430}\u{0439}\u{043A}\u{0438}:\n' + titles.map(t => '- ' + t).join('\n'));
      }
    }

    // Бэклог — берём title из allBacklog
    if (day.backlog.length) {
      const titles = day.backlog.map(id => {
        const fullId = `${date}_${id}`;
        const stored = allBacklog.find(x => x.id === fullId);
        if (stored) return stored.title;
        return getCardMeta(id).title;
      }).filter(Boolean);
      if (titles.length) {
        sections.push('\u{1F4CB} \u{0411}\u{044D}\u{043A}\u{043B}\u{043E}\u{0433}:\n' + titles.map(t => '- ' + t).join('\n'));
      }
    }

    return sections.length ? `\u{1F4CA} \u{0424}\u{0438}\u{0434}\u{0431}\u{044D}\u{043A} \u{0434}\u{0430}\u{0439}\u{0434}\u{0436}\u{0435}\u{0441}\u{0442} ${date}\n\n${sections.join('\n\n')}` : '';
  }
};

/* === Вспомогательная: метаданные карточки из DOM === */
function getCardMeta(cardId) {
  const el = document.querySelector(`[data-card-id="${cardId}"]`);
  return {
    title: el?.dataset.cardTitle || cardId,
    category: el?.dataset.cardCategory || ''
  };
}

/* === Публичные функции-алиасы (для SPEC.md совместимости) === */

// Генерация текста фидбэка для Telegram
function generateFeedbackMessage(date) {
  return FeedbackStore.getFeedbackText(date);
}

// Открыть Telegram deep link с ботом @Kodi_v2_bot
function openTelegram(message) {
  if (!message) return;
  window.open('https://t.me/Kodi_v2_bot?start=feedback', '_blank');
}

// Получить статистику для index.html
function getStats(date) {
  return FeedbackStore.getStats(date);
}

// Обновить sticky панель (алиас)
function updateStickyPanel(date) {
  updateFeedbackPanel(date);
}

/* === Кнопки фидбэка на странице дайджеста === */
function initFeedbackButtons(date) {
  // Если дата не передана — определяем из URL или data-атрибута
  if (!date) {
    date = getDigestDateFromUrl();
  }
  if (!date) return;

  document.querySelectorAll('.feedback-btn').forEach(btn => {
    const cardId = btn.dataset.cardId;
    const action = btn.dataset.action;
    if (!cardId || !action) return;

    const state = FeedbackStore.getState(date, cardId);
    // Восстановить состояние из localStorage
    if (action === 'like' && state.liked) btn.classList.add('active', 'active-like');
    if (action === 'dislike' && state.disliked) btn.classList.add('active', 'active-dislike');
    if (action === 'backlog' && state.backlogged) btn.classList.add('active', 'active-backlog');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFeedbackClick(date, cardId, action, btn);
    });
  });

  // Инициализировать sticky panel
  initStickyPanel();
  updateStickyPanel(date);
}

function handleFeedbackClick(date, cardId, action, btn) {
  const card = btn.closest('[data-card-id]');
  const allBtns = card ? card.querySelectorAll('.feedback-btn') : [];

  if (action === 'like') {
    const isActive = FeedbackStore.toggleLike(date, cardId);
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('active-like', isActive);
    allBtns.forEach(b => {
      if (b.dataset.action === 'dislike') {
        b.classList.remove('active', 'active-dislike');
      }
    });
  } else if (action === 'dislike') {
    const isActive = FeedbackStore.toggleDislike(date, cardId);
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('active-dislike', isActive);
    allBtns.forEach(b => {
      if (b.dataset.action === 'like') {
        b.classList.remove('active', 'active-like');
      }
    });
  } else if (action === 'backlog') {
    const isActive = FeedbackStore.addToBacklog(date, cardId);
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('active-backlog', isActive);
  }

  updateFeedbackPanel(date);

  // Анимация нажатия
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 150);
}

/* === Sticky панель фидбэка (создание DOM-элемента) === */
function initStickyPanel() {
  // Не создаём повторно если уже есть
  if (document.querySelector('.sticky-feedback-panel')) return;

  const date = getDigestDateFromUrl();
  if (!date) return;

  const panel = document.createElement('div');
  panel.className = 'sticky-feedback-panel';
  panel.id = 'feedback-panel';
  panel.innerHTML = `
    <div class="feedback-panel-inner">
      <div class="panel-stats feedback-stats">
        <span>\u{1F44D} 0</span>
        <span>\u{1F44E} 0</span>
        <span>\u{1F4CB} 0</span>
      </div>
      <button class="panel-send-btn feedback-send-btn" onclick="sendFeedback()">\u{1F4E4} \u{041E}\u{0442}\u{043F}\u{0440}\u{0430}\u{0432}\u{0438}\u{0442}\u{044C} \u{041A}\u{043E}\u{0434}\u{0438}</button>
    </div>
  `;
  document.body.appendChild(panel);
  document.body.classList.add('has-sticky-panel');

  // Начальное обновление счётчиков
  updateFeedbackPanel(date);
}

/* === Sticky панель: обновление === */
function updateFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;
  if (!date) date = getDigestDateFromUrl();
  if (!date) return;

  const stats = FeedbackStore.getStats(date);
  const total = stats.likes + stats.dislikes + stats.backlog;

  // Показать панель при первом фидбэке (slide-up)
  panel.classList.toggle('visible', total > 0);

  // Обновить счётчики
  const statsEl = panel.querySelector('.panel-stats, .feedback-stats');
  if (statsEl) {
    statsEl.innerHTML = `<span>\u{1F44D} ${stats.likes}</span><span>\u{1F44E} ${stats.dislikes}</span><span>\u{1F4CB} ${stats.backlog}</span>`;
  }

  // Кнопка отправки в Telegram
  let sendBtn = panel.querySelector('.panel-send-btn, .feedback-send-btn');
  if (!sendBtn) {
    sendBtn = document.createElement('button');
    sendBtn.className = 'panel-send-btn feedback-send-btn';
    sendBtn.addEventListener('click', () => sendFeedback());
    const inner = panel.querySelector('.feedback-panel-inner');
    if (inner) inner.appendChild(sendBtn);
  }

  // Если уже отправлено — показать «Отправлено»
  const isSent = FeedbackStore.isSent(date);
  if (isSent && total > 0) {
    sendBtn.textContent = '\u2705 \u{041E}\u{0442}\u{043F}\u{0440}\u{0430}\u{0432}\u{043B}\u{0435}\u{043D}\u{043E}';
    sendBtn.classList.add('sent');
    sendBtn.style.display = '';
  } else if (total > 0) {
    sendBtn.textContent = '\u{1F4E4} \u{041E}\u{0442}\u{043F}\u{0440}\u{0430}\u{0432}\u{0438}\u{0442}\u{044C} \u{041A}\u{043E}\u{0434}\u{0438}';
    sendBtn.classList.remove('sent');
    sendBtn.style.display = '';
  } else {
    sendBtn.textContent = '';
    sendBtn.style.display = 'none';
  }
}

/* === Отправка фидбэка через Telegram deep link === */
async function sendFeedback(date) {
  // Если дата не передана — определяем из URL
  if (!date) date = getDigestDateFromUrl();
  if (!date) return;

  const text = generateFeedbackMessage(date);
  if (!text) return;

  // Пометить как отправленное
  FeedbackStore.markSent(date);

  // Копируем текст в clipboard
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Фоллбэк для старых браузеров
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  updateFeedbackPanel(date);
  updateSyncStatus('\u{1F4CB} \u{0422}\u{0435}\u{043A}\u{0441}\u{0442} \u{0441}\u{043A}\u{043E}\u{043F}\u{0438}\u{0440}\u{043E}\u{0432}\u{0430}\u{043D}, \u{0432}\u{0441}\u{0442}\u{0430}\u{0432}\u{044C} \u{0432} \u{0447}\u{0430}\u{0442} \u{0441} @Kodi_v2_bot', 'ok');

  // Открываем бота @Kodi_v2_bot — текст уже скопирован в clipboard
  const tgUrl = 'https://t.me/Kodi_v2_bot?start=feedback';
  setTimeout(() => {
    window.open(tgUrl, '_blank');
  }, 300);

  setTimeout(() => updateSyncStatus('', ''), 5000);
}

/* === Рендер liked.html === */
function renderLikedPage() {
  const container = document.getElementById('liked-content');
  if (!container) return;
  const items = FeedbackStore.getAllLiked();

  // Пустое состояние
  if (!items.length) {
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">\u2764\uFE0F</div><div class="page-empty-text">\u{041F}\u{043E}\u{043A}\u{0430} \u{043D}\u{0438}\u{0447}\u{0435}\u{0433}\u{043E} \u{043D}\u{0435} \u{043B}\u{0430}\u{0439}\u{043A}\u{043D}\u{0443}\u{0442}\u{043E}</div><div class="page-empty-hint">\u{041B}\u{0430}\u{0439}\u{043A}\u{043D}\u{0438} \u{043A}\u{0430}\u{0440}\u{0442}\u{043E}\u{0447}\u{043A}\u{0438} \u{0432} \u{0434}\u{0430}\u{0439}\u{0434}\u{0436}\u{0435}\u{0441}\u{0442}\u{0435} \u2014 \u{043E}\u{043D}\u{0438} \u{043F}\u{043E}\u{044F}\u{0432}\u{044F}\u{0442}\u{0441}\u{044F} \u{0437}\u{0434}\u{0435}\u{0441}\u{044C}</div></div>';
    return;
  }

  // Группировка по дате
  const groups = {};
  items.forEach(item => {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
  });
  const dates = Object.keys(groups).sort().reverse();

  container.innerHTML = dates.map(date => `
    <div class="liked-date-group">
      <h3>${formatDateRu(date)}</h3>
      ${groups[date].map(item => `
        <div class="liked-card" data-id="${item.id}">
          <div class="card-info">
            <div class="card-title-sm">${escapeHtml(item.title)}</div>
            ${item.category ? `<span class="category-tag">${escapeHtml(item.category)}</span>` : ''}
          </div>
          <button class="remove-btn" onclick="removeLiked('${item.id}')" aria-label="\u{0423}\u{0431}\u{0440}\u{0430}\u{0442}\u{044C} \u{043B}\u{0430}\u{0439}\u{043A}">\u2715</button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function removeLiked(fullId) {
  FeedbackStore.removeLike(fullId);
  renderLikedPage();
}

/* === Рендер backlog.html === */
function renderBacklogPage() {
  const container = document.getElementById('backlog-content');
  if (!container) return;
  const items = FeedbackStore.getAllBacklog();

  // Пустое состояние
  if (!items.length) {
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">\u{1F4CB}</div><div class="page-empty-text">\u{0411}\u{044D}\u{043A}\u{043B}\u{043E}\u{0433} \u{043F}\u{0443}\u{0441}\u{0442}</div><div class="page-empty-hint">\u{041D}\u{0430}\u{0436}\u{043C}\u{0438} [\u{1F4CB} \u{0412} \u{0431}\u{044D}\u{043A}\u{043B}\u{043E}\u{0433}] \u{043D}\u{0430} \u{043A}\u{0430}\u{0440}\u{0442}\u{043E}\u{0447}\u{043A}\u{0435} \u{0432} \u{0434}\u{0430}\u{0439}\u{0434}\u{0436}\u{0435}\u{0441}\u{0442}\u{0435}</div></div>';
    return;
  }

  // Карта статусов
  const statusMap = {
    'new': { label: '\u{1F195} \u{043D}\u{043E}\u{0432}\u{043E}\u{0435}', cls: 'new' },
    'in_progress': { label: '\u{1F504} \u{0432} \u{0440}\u{0430}\u{0431}\u{043E}\u{0442}\u{0435}', cls: 'in-progress' },
    'done': { label: '\u2705 \u{0433}\u{043E}\u{0442}\u{043E}\u{0432}\u{043E}', cls: 'done' }
  };

  container.innerHTML = items.map(item => {
    const st = statusMap[item.status] || statusMap['new'];
    return `
      <div class="backlog-card" data-id="${item.id}">
        <div class="card-info">
          <div class="card-title-sm">${escapeHtml(item.title)}</div>
          ${item.category ? `<span class="category-tag">${escapeHtml(item.category)}</span>` : ''}
        </div>
        <div class="backlog-actions">
          <button class="backlog-status ${st.cls}" onclick="cycleStatus('${item.id}')" aria-label="\u{0421}\u{043C}\u{0435}\u{043D}\u{0438}\u{0442}\u{044C} \u{0441}\u{0442}\u{0430}\u{0442}\u{0443}\u{0441}">${st.label}</button>
          <button class="status-btn remove-btn" onclick="removeBacklog('${item.id}')" aria-label="\u{0423}\u{0431}\u{0440}\u{0430}\u{0442}\u{044C} \u{0438}\u{0437} \u{0431}\u{044D}\u{043A}\u{043B}\u{043E}\u{0433}\u{0430}">\u2715</button>
        </div>
      </div>
    `;
  }).join('');
}

function removeBacklog(fullId) {
  FeedbackStore.removeBacklog(fullId);
  renderBacklogPage();
}

// Переключение статуса задачи по клику
function cycleStatus(fullId) {
  FeedbackStore.cycleBacklogStatus(fullId);
  renderBacklogPage();
}

/* === Статы для index.html === */
function updateDigestStats() {
  document.querySelectorAll('.digest-card[data-digest-date]').forEach(el => {
    const date = el.dataset.digestDate;
    const stats = FeedbackStore.getDateStats(date);
    const likesEl = el.querySelector('.digest-likes span');
    // Фоллбэк на .digest-likes если span не найден
    const target = likesEl || el.querySelector('.digest-likes');
    if (target) {
      if (stats.likes > 0) {
        target.textContent = `${stats.likes} \u{1F44D}`;
        target.style.display = '';
      } else {
        target.textContent = '';
        target.style.display = 'none';
      }
    }
  });
}

/* === Утилиты === */

// Форматирование даты: 2026-03-12 -> "12 марта 2026"
function formatDateRu(dateStr) {
  const months = ['\u{044F}\u{043D}\u{0432}\u{0430}\u{0440}\u{044F}','\u{0444}\u{0435}\u{0432}\u{0440}\u{0430}\u{043B}\u{044F}','\u{043C}\u{0430}\u{0440}\u{0442}\u{0430}','\u{0430}\u{043F}\u{0440}\u{0435}\u{043B}\u{044F}','\u{043C}\u{0430}\u{044F}','\u{0438}\u{044E}\u{043D}\u{044F}','\u{0438}\u{044E}\u{043B}\u{044F}','\u{0430}\u{0432}\u{0433}\u{0443}\u{0441}\u{0442}\u{0430}','\u{0441}\u{0435}\u{043D}\u{0442}\u{044F}\u{0431}\u{0440}\u{044F}','\u{043E}\u{043A}\u{0442}\u{044F}\u{0431}\u{0440}\u{044F}','\u{043D}\u{043E}\u{044F}\u{0431}\u{0440}\u{044F}','\u{0434}\u{0435}\u{043A}\u{0430}\u{0431}\u{0440}\u{044F}'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

// Экранирование HTML для безопасного рендера
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* === Kodi Digest — Feedback System (localStorage + Telegram) === */
/* V2: localStorage + Telegram deep link + статусы бэклога */

function updateSyncStatus(text, type) {
  const el = document.querySelector('.feedback-sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'feedback-sync-status' + (type ? ' sync-' + type : '');
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

  // Обновить статус задачи бэклога (new → in_progress → done)
  updateBacklogStatus(fullId, newStatus) {
    const data = this._load();
    if (!data.allBacklog) return;
    const item = data.allBacklog.find(x => x.id === fullId);
    if (item) {
      item.status = newStatus;
      this._save(data);
    }
  },

  // Циклический переход статуса: new → in_progress → done → new
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
    const parts = [];
    if (day.likes.length) {
      const titles = day.likes.map(id => getCardMeta(id).title).filter(Boolean);
      parts.push('👍 ' + titles.join(', '));
    }
    if (day.dislikes.length) {
      const titles = day.dislikes.map(id => getCardMeta(id).title).filter(Boolean);
      parts.push('👎 ' + titles.join(', '));
    }
    if (day.backlog.length) {
      const titles = day.backlog.map(id => getCardMeta(id).title).filter(Boolean);
      parts.push('📋 ' + titles.join(', '));
    }
    return parts.length ? `Дайджест ${date}:\n${parts.join('\n')}` : '';
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

// Открыть Telegram deep link с сообщением
function openTelegram(message) {
  if (!message) return;
  const encoded = encodeURIComponent(message);
  window.open(`https://t.me/esya_st?text=${encoded}`, '_blank');
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
  document.querySelectorAll('.feedback-btn').forEach(btn => {
    const cardId = btn.dataset.cardId;
    const action = btn.dataset.action;
    const state = FeedbackStore.getState(date, cardId);
    // Восстановить состояние из localStorage
    if (action === 'like' && state.liked) btn.classList.add('active-like');
    if (action === 'dislike' && state.disliked) btn.classList.add('active-dislike');
    if (action === 'backlog' && state.backlogged) btn.classList.add('active-backlog');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFeedbackClick(date, cardId, action, btn);
    });
  });
  initFeedbackPanel(date);
}

function handleFeedbackClick(date, cardId, action, btn) {
  const card = btn.closest('[data-card-id]');
  const allBtns = card.querySelectorAll('.feedback-btn');
  if (action === 'like') {
    const isActive = FeedbackStore.toggleLike(date, cardId);
    btn.classList.toggle('active-like', isActive);
    allBtns.forEach(b => { if (b.dataset.action === 'dislike') b.classList.remove('active-dislike'); });
  } else if (action === 'dislike') {
    const isActive = FeedbackStore.toggleDislike(date, cardId);
    btn.classList.toggle('active-dislike', isActive);
    allBtns.forEach(b => { if (b.dataset.action === 'like') b.classList.remove('active-like'); });
  } else if (action === 'backlog') {
    const isActive = FeedbackStore.addToBacklog(date, cardId);
    btn.classList.toggle('active-backlog', isActive);
  }
  updateFeedbackPanel(date);
  // Анимация нажатия
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 150);
}

/* === Sticky панель фидбэка === */
function initFeedbackPanel(date) {
  updateFeedbackPanel(date);
}

function updateFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;
  const stats = FeedbackStore.getStats(date);
  const total = stats.likes + stats.dislikes + stats.backlog;
  // Показать панель при первом фидбэке (slide-up)
  panel.classList.toggle('visible', total > 0);

  // Обновить счётчики
  const statsEl = panel.querySelector('.feedback-stats');
  if (statsEl) {
    statsEl.innerHTML = `<span>Отмечено:</span><span>👍 ${stats.likes}</span><span>👎 ${stats.dislikes}</span><span>📋 ${stats.backlog}</span>`;
  }

  // Кнопка отправки в Telegram
  let sendBtn = panel.querySelector('.feedback-send-btn');
  if (!sendBtn) {
    sendBtn = document.createElement('button');
    sendBtn.className = 'feedback-send-btn';
    sendBtn.addEventListener('click', () => sendFeedback(date));
    panel.querySelector('.feedback-panel-inner').appendChild(sendBtn);
  }

  // Если уже отправлено — показать «Отправлено»
  const isSent = FeedbackStore.isSent(date);
  if (isSent && total > 0) {
    sendBtn.textContent = '✅ Отправлено';
    sendBtn.classList.add('sent');
    sendBtn.style.display = '';
  } else if (total > 0) {
    sendBtn.textContent = '📤 Отправить Коди';
    sendBtn.classList.remove('sent');
    sendBtn.style.display = '';
  } else {
    sendBtn.textContent = '';
    sendBtn.style.display = 'none';
  }
}

/* === Отправка фидбэка через Telegram deep link === */
async function sendFeedback(date) {
  const text = FeedbackStore.getFeedbackText(date);
  if (!text) return;

  // Пометить как отправленное
  FeedbackStore.markSent(date);

  // Telegram web link с предзаполненным текстом
  const encoded = encodeURIComponent(text);
  const tgUrl = `https://t.me/esya_st?text=${encoded}`;

  // Попробовать Web Share API (нативный share sheet на мобилке)
  if (navigator.share) {
    try {
      await navigator.share({ text });
      updateFeedbackPanel(date);
      updateSyncStatus('✅ Отправлено', 'ok');
      setTimeout(() => updateSyncStatus('', ''), 3000);
      return;
    } catch (e) {
      // Юзер отменил — fallback на tg deep link
    }
  }

  // Fallback: копируем + открываем Telegram
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  updateFeedbackPanel(date);
  updateSyncStatus('📋 Скопировано — вставь в чат ↓', 'ok');
  // Открываем Telegram с предзаполненным текстом
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
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">❤️</div><div class="page-empty-text">Пока нет лайкнутых карточек</div><div class="page-empty-hint">Лайкни карточки в дайджесте — они появятся здесь</div></div>';
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
    <div class="date-group">
      <div class="date-group-header">${formatDateRu(date)}</div>
      ${groups[date].map(item => `
        <div class="liked-card" data-id="${item.id}">
          <div class="liked-card-info">
            <div class="liked-card-title">${escapeHtml(item.title)}</div>
            <div class="liked-card-meta">${escapeHtml(item.category || '')}</div>
          </div>
          <button class="remove-btn" onclick="removeLiked('${item.id}')" aria-label="Убрать лайк">✕</button>
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
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">📋</div><div class="page-empty-text">Бэклог пуст</div><div class="page-empty-hint">Нажми [📋 В бэклог] на карточке в дайджесте</div></div>';
    return;
  }

  // Карта статусов
  const statusMap = {
    'new': { label: '🆕 новое', cls: 'new' },
    'in_progress': { label: '🔄 в работе', cls: 'in-progress' },
    'done': { label: '✅ готово', cls: 'done' }
  };

  container.innerHTML = items.map(item => {
    const st = statusMap[item.status] || statusMap['new'];
    return `
      <div class="backlog-card" data-id="${item.id}">
        <div class="backlog-card-info">
          <div class="backlog-card-title">${escapeHtml(item.title)}</div>
          <div class="backlog-card-meta">
            ${formatDateRu(item.date)}
            <button class="backlog-status ${st.cls}" onclick="cycleStatus('${item.id}')" aria-label="Сменить статус">${st.label}</button>
          </div>
        </div>
        <button class="remove-btn" onclick="removeBacklog('${item.id}')" aria-label="Убрать из бэклога">✕</button>
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
  document.querySelectorAll('[data-digest-date]').forEach(el => {
    const date = el.dataset.digestDate;
    const stats = FeedbackStore.getDateStats(date);
    const likesEl = el.querySelector('.digest-likes');
    if (likesEl) {
      if (stats.likes > 0) {
        likesEl.textContent = `❤️ ${stats.likes}`;
        likesEl.style.display = '';
      } else {
        likesEl.style.display = 'none';
      }
    }
  });
}

/* === Утилиты === */

// Форматирование даты: 2026-03-12 → "12 марта 2026"
function formatDateRu(dateStr) {
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

// Экранирование HTML для безопасного рендера
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* === Kodi Digest — Feedback System (localStorage + JSONBlob) === */

// JSONBlob — бесплатная БД, без регистрации
const JSONBLOB_ID = '019ce1ad-c8bf-70cc-b2c5-2a0bc70df06f';
const JSONBLOB_URL = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;

// Debounce sync — не шлём на каждый клик
let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToCloud, 2000);
}

// Sync localStorage → JSONBlob
async function syncToCloud() {
  try {
    const local = JSON.parse(localStorage.getItem('kodiDigest')) || {};
    const resp = await fetch(JSONBLOB_URL);
    if (!resp.ok) return;
    const remote = await resp.json();
    // Мержим: локальные данные приоритетнее
    const merged = {
      feedback: mergeFeedback(remote.feedback || [], local.feedbackData || {}),
      preferences: remote.preferences || { boost: [], suppress: [] },
      lastSync: new Date().toISOString()
    };
    await fetch(JSONBLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged)
    });
    updateSyncStatus('synced');
  } catch (e) {
    updateSyncStatus('local');
  }
}

// Конвертирует localStorage формат → массив для JSONBlob
function mergeFeedback(remoteFeedback, localData) {
  const result = [...remoteFeedback];
  const existingIds = new Set(result.map(f => `${f.date}_${f.card_id}_${f.action}`));
  for (const [date, day] of Object.entries(localData)) {
    for (const cardId of (day.likes || [])) {
      const key = `${date}_${cardId}_like`;
      if (!existingIds.has(key)) {
        const meta = getCardMeta(cardId);
        result.push({ date, card_id: cardId, action: 'like', title: meta.title, category: meta.category, ts: Date.now() });
        existingIds.add(key);
      }
    }
    for (const cardId of (day.dislikes || [])) {
      const key = `${date}_${cardId}_dislike`;
      if (!existingIds.has(key)) {
        const meta = getCardMeta(cardId);
        result.push({ date, card_id: cardId, action: 'dislike', title: meta.title, category: meta.category, ts: Date.now() });
        existingIds.add(key);
      }
    }
    for (const cardId of (day.backlog || [])) {
      const key = `${date}_${cardId}_backlog`;
      if (!existingIds.has(key)) {
        const meta = getCardMeta(cardId);
        result.push({ date, card_id: cardId, action: 'backlog', title: meta.title, category: meta.category, ts: Date.now() });
        existingIds.add(key);
      }
    }
  }
  return result;
}

function getCardMeta(cardId) {
  const el = document.querySelector(`[data-card-id="${cardId}"]`);
  return {
    title: el?.dataset.cardTitle || cardId,
    category: el?.dataset.cardCategory || ''
  };
}

function updateSyncStatus(status) {
  const el = document.querySelector('.feedback-sync-status');
  if (!el) return;
  el.textContent = status === 'synced' ? '☁️ Синхронизировано' : '📱 Локально';
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
    scheduleSync();
  },
  _getDay(date) {
    const data = this._load();
    if (!data.feedbackData) data.feedbackData = {};
    if (!data.feedbackData[date]) data.feedbackData[date] = { likes: [], dislikes: [], backlog: [] };
    return { data, day: data.feedbackData[date] };
  },

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

  getStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length, dislikes: day.dislikes.length, backlog: day.backlog.length };
  },
  getState(date, cardId) {
    const { day } = this._getDay(date);
    return { liked: day.likes.includes(cardId), disliked: day.dislikes.includes(cardId), backlogged: day.backlog.includes(cardId) };
  },
  getAllLiked() { return this._load().allLiked || []; },
  removeLike(fullId) {
    const data = this._load();
    if (!data.allLiked) return;
    data.allLiked = data.allLiked.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) data.feedbackData[date].likes = data.feedbackData[date].likes.filter(x => x !== cardId);
    this._save(data);
  },
  getAllBacklog() { return this._load().allBacklog || []; },
  removeBacklog(fullId) {
    const data = this._load();
    if (!data.allBacklog) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) data.feedbackData[date].backlog = data.feedbackData[date].backlog.filter(x => x !== cardId);
    this._save(data);
  },
  getDateStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length };
  },
  isConnected() { return !!JSONBLOB_ID; }
};

/* === Кнопки фидбэка === */
function initFeedbackButtons(date) {
  document.querySelectorAll('.feedback-btn').forEach(btn => {
    const cardId = btn.dataset.cardId;
    const action = btn.dataset.action;
    const state = FeedbackStore.getState(date, cardId);
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
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 150);
}

/* === Sticky панель === */
function initFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;
  updateFeedbackPanel(date);
}

function updateFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;
  const stats = FeedbackStore.getStats(date);
  const total = stats.likes + stats.dislikes + stats.backlog;
  panel.classList.toggle('visible', total > 0);
  const statsEl = panel.querySelector('.feedback-stats');
  if (statsEl) statsEl.innerHTML = `<span>👍 ${stats.likes}</span><span>👎 ${stats.dislikes}</span><span>📋 ${stats.backlog}</span>`;
  const syncEl = panel.querySelector('.feedback-sync-status');
  if (syncEl) syncEl.textContent = FeedbackStore.isConnected() ? '☁️ Синхронизация' : '📱 Локально';
}

/* === Рендер liked.html === */
function renderLikedPage() {
  const container = document.getElementById('liked-content');
  if (!container) return;
  const items = FeedbackStore.getAllLiked();
  if (!items.length) {
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">❤️</div><div class="page-empty-text">Пока нет лайкнутых карточек</div></div>';
    return;
  }
  const groups = {};
  items.forEach(item => { if (!groups[item.date]) groups[item.date] = []; groups[item.date].push(item); });
  const dates = Object.keys(groups).sort().reverse();
  container.innerHTML = dates.map(date => `
    <div class="date-group">
      <div class="date-group-header">${date}</div>
      ${groups[date].map(item => `
        <div class="liked-card" data-id="${item.id}">
          <div class="liked-card-info">
            <div class="liked-card-title">${item.title}</div>
            <div class="liked-card-meta">${item.category}</div>
          </div>
          <button class="remove-btn" onclick="removeLiked('${item.id}')" aria-label="Убрать">✕</button>
        </div>
      `).join('')}
    </div>
  `).join('');
}
function removeLiked(fullId) { FeedbackStore.removeLike(fullId); renderLikedPage(); }

/* === Рендер backlog.html === */
function renderBacklogPage() {
  const container = document.getElementById('backlog-content');
  if (!container) return;
  const items = FeedbackStore.getAllBacklog();
  if (!items.length) {
    container.innerHTML = '<div class="page-empty"><div class="page-empty-icon">📋</div><div class="page-empty-text">Бэклог пуст</div></div>';
    return;
  }
  const statusMap = { 'new': { label: '🆕 новое', cls: 'new' }, 'in_progress': { label: '🔄 в работе', cls: 'in-progress' }, 'done': { label: '✅ готово', cls: 'done' } };
  container.innerHTML = items.map(item => {
    const st = statusMap[item.status] || statusMap['new'];
    return `<div class="backlog-card" data-id="${item.id}"><div class="backlog-card-info"><div class="backlog-card-title">${item.title}</div><div class="backlog-card-meta">${item.date} <span class="backlog-status ${st.cls}">${st.label}</span></div></div><button class="remove-btn" onclick="removeBacklog('${item.id}')" aria-label="Убрать">✕</button></div>`;
  }).join('');
}
function removeBacklog(fullId) { FeedbackStore.removeBacklog(fullId); renderBacklogPage(); }

/* === Статы для index === */
function updateDigestStats() {
  document.querySelectorAll('[data-digest-date]').forEach(el => {
    const date = el.dataset.digestDate;
    const stats = FeedbackStore.getDateStats(date);
    const likesEl = el.querySelector('.digest-likes');
    if (likesEl && stats.likes > 0) { likesEl.textContent = `❤️ ${stats.likes}`; likesEl.style.display = ''; }
  });
}

/* === Kodi Digest — Feedback System (localStorage + Supabase) === */

// Supabase конфиг — заполнится после setup
const SUPABASE_URL = localStorage.getItem('kodi_supabase_url') || '';
const SUPABASE_KEY = localStorage.getItem('kodi_supabase_key') || '';

// Sync в Supabase (fire and forget)
async function syncToSupabase(action, date, cardId, cardTitle, cardCategory) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        digest_date: date,
        card_id: cardId,
        card_title: cardTitle || cardId,
        card_category: cardCategory || '',
        action: action
      })
    });
  } catch (e) { /* тихо — localStorage как fallback */ }
}

async function deleteFromSupabase(action, date, cardId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/feedback?digest_date=eq.${date}&card_id=eq.${cardId}&action=eq.${action}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
  } catch (e) { /* тихо */ }
}

const FeedbackStore = {
  STORAGE_KEY: 'kodiDigest',

  _load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
    } catch { return {}; }
  },

  _save(data) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  _getDay(date) {
    const data = this._load();
    if (!data.feedbackData) data.feedbackData = {};
    if (!data.feedbackData[date]) {
      data.feedbackData[date] = { likes: [], dislikes: [], backlog: [] };
    }
    return { data, day: data.feedbackData[date] };
  },

  _getCardMeta(cardId) {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    return {
      title: el?.dataset.cardTitle || cardId,
      category: el?.dataset.cardCategory || ''
    };
  },

  // --- Toggle лайк ---
  toggleLike(date, cardId) {
    const { data, day } = this._getDay(date);
    const meta = this._getCardMeta(cardId);
    const idx = day.likes.indexOf(cardId);
    if (idx > -1) {
      day.likes.splice(idx, 1);
      this._removeFromAllLiked(data, date, cardId);
      deleteFromSupabase('like', date, cardId);
    } else {
      day.likes.push(cardId);
      const dIdx = day.dislikes.indexOf(cardId);
      if (dIdx > -1) {
        day.dislikes.splice(dIdx, 1);
        deleteFromSupabase('dislike', date, cardId);
      }
      this._addToAllLiked(data, date, cardId);
      syncToSupabase('like', date, cardId, meta.title, meta.category);
    }
    this._save(data);
    return day.likes.includes(cardId);
  },

  // --- Toggle дизлайк ---
  toggleDislike(date, cardId) {
    const { data, day } = this._getDay(date);
    const meta = this._getCardMeta(cardId);
    const idx = day.dislikes.indexOf(cardId);
    if (idx > -1) {
      day.dislikes.splice(idx, 1);
      deleteFromSupabase('dislike', date, cardId);
    } else {
      day.dislikes.push(cardId);
      const lIdx = day.likes.indexOf(cardId);
      if (lIdx > -1) {
        day.likes.splice(lIdx, 1);
        this._removeFromAllLiked(data, date, cardId);
        deleteFromSupabase('like', date, cardId);
      }
      syncToSupabase('dislike', date, cardId, meta.title, meta.category);
    }
    this._save(data);
    return day.dislikes.includes(cardId);
  },

  // --- Toggle бэклог ---
  addToBacklog(date, cardId) {
    const { data, day } = this._getDay(date);
    const meta = this._getCardMeta(cardId);
    const idx = day.backlog.indexOf(cardId);
    if (idx > -1) {
      day.backlog.splice(idx, 1);
      this._removeFromAllBacklog(data, date, cardId);
      deleteFromSupabase('backlog', date, cardId);
    } else {
      day.backlog.push(cardId);
      this._addToAllBacklog(data, date, cardId);
      syncToSupabase('backlog', date, cardId, meta.title, meta.category);
    }
    this._save(data);
    return day.backlog.includes(cardId);
  },

  // --- Глобальные списки ---
  _addToAllLiked(data, date, cardId) {
    if (!data.allLiked) data.allLiked = [];
    const fullId = `${date}_${cardId}`;
    if (!data.allLiked.find(x => x.id === fullId)) {
      const meta = this._getCardMeta(cardId);
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
      const meta = this._getCardMeta(cardId);
      data.allBacklog.push({ id: fullId, title: meta.title, date, status: 'new' });
    }
  },

  _removeFromAllBacklog(data, date, cardId) {
    if (!data.allBacklog) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== `${date}_${cardId}`);
  },

  // --- Статистика ---
  getStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length, dislikes: day.dislikes.length, backlog: day.backlog.length };
  },

  getState(date, cardId) {
    const { day } = this._getDay(date);
    return {
      liked: day.likes.includes(cardId),
      disliked: day.dislikes.includes(cardId),
      backlogged: day.backlog.includes(cardId)
    };
  },

  // --- Для liked.html ---
  getAllLiked() {
    const data = this._load();
    return data.allLiked || [];
  },

  removeLike(fullId) {
    const data = this._load();
    if (!data.allLiked) return;
    data.allLiked = data.allLiked.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) {
      data.feedbackData[date].likes = data.feedbackData[date].likes.filter(x => x !== cardId);
    }
    this._save(data);
    deleteFromSupabase('like', date, cardId);
  },

  // --- Для backlog.html ---
  getAllBacklog() {
    const data = this._load();
    return data.allBacklog || [];
  },

  removeBacklog(fullId) {
    const data = this._load();
    if (!data.allBacklog) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== fullId);
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) {
      data.feedbackData[date].backlog = data.feedbackData[date].backlog.filter(x => x !== cardId);
    }
    this._save(data);
    deleteFromSupabase('backlog', date, cardId);
  },

  // --- Для index ---
  getDateStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length };
  },

  // --- Supabase status ---
  isConnected() {
    return !!(SUPABASE_URL && SUPABASE_KEY);
  }
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
  // Мгновенный feedback — подсветка
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
  if (statsEl) {
    statsEl.innerHTML = `<span>👍 ${stats.likes}</span><span>👎 ${stats.dislikes}</span><span>📋 ${stats.backlog}</span>`;
  }
  // Статус sync
  const syncEl = panel.querySelector('.feedback-sync-status');
  if (syncEl) {
    syncEl.textContent = FeedbackStore.isConnected() ? '☁️ Синхронизация' : '📱 Локально';
  }
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

/* === Setup Supabase (one-time) === */
function setupSupabase(url, key) {
  localStorage.setItem('kodi_supabase_url', url);
  localStorage.setItem('kodi_supabase_key', key);
  location.reload();
}

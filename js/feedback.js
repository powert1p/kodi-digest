/* === Kodi Digest — Feedback System (localStorage + Telegram) === */
/* V1: localStorage + clipboard → Telegram. V2: Supabase auto-sync */

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
    setTimeout(syncToCloud, 2000);
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
    setTimeout(syncToCloud, 2000);
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
    setTimeout(syncToCloud, 2000);
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
    setTimeout(syncToCloud, 2000);
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
    setTimeout(syncToCloud, 2000);
  },
  getDateStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length };
  },

  // Собрать текст фидбэка для отправки
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

function getCardMeta(cardId) {
  const el = document.querySelector(`[data-card-id="${cardId}"]`);
  return {
    title: el?.dataset.cardTitle || cardId,
    category: el?.dataset.cardCategory || ''
  };
}

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

  // Кнопка отправки
  let sendBtn = panel.querySelector('.feedback-send-btn');
  if (!sendBtn) {
    sendBtn = document.createElement('button');
    sendBtn.className = 'feedback-send-btn';
    sendBtn.addEventListener('click', () => sendFeedback(date));
    panel.querySelector('.feedback-panel-inner').appendChild(sendBtn);
  }
  sendBtn.textContent = total > 0 ? '📤 Отправить' : '';
  sendBtn.style.display = total > 0 ? '' : 'none';
}

async function sendFeedback(date) {
  const text = FeedbackStore.getFeedbackText(date);
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    updateSyncStatus('✅ Скопировано — вставь мне в чат', 'ok');
  } catch {
    // Fallback: textarea copy
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    updateSyncStatus('✅ Скопировано — вставь мне в чат', 'ok');
  }

  setTimeout(() => updateSyncStatus('', ''), 4000);
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

// V2: Real cloud sync via JSONBlob
const BLOB_ID = '019ce1be-ff7c-7594-b069-57f384d8612c';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

async function syncToCloud() {
    const data = {
        feedback: getFeedback(),
        syncedAt: new Date().toISOString(),
        preferences: loadPreferences()
    };
    try {
        await fetch(BLOB_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });
        updateSyncStatus('✅ Синхронизировано');
    } catch(e) {
        updateSyncStatus('⚠️ Только локально');
    }
}

function getFeedback() {
    return {
        likes: JSON.parse(localStorage.getItem('digest_likes') || '{}'),
        dislikes: JSON.parse(localStorage.getItem('digest_dislikes') || '{}'),
        backlog: JSON.parse(localStorage.getItem('digest_backlog') || '[]')
    };
}

function loadPreferences() {
    return JSON.parse(localStorage.getItem('digest_preferences') || '{"boost":[],"suppress":[]}');
}

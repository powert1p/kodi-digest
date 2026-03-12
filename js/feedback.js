/* === Kodi Digest — Feedback System (localStorage) === */

const FeedbackStore = {
  STORAGE_KEY: 'kodiDigest',

  // --- \u0427\u0442\u0435\u043d\u0438\u0435/\u0437\u0430\u043f\u0438\u0441\u044c ---
  _load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  },

  _save(data) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  // --- \u0414\u0430\u043d\u043d\u044b\u0435 \u0434\u043d\u044f ---
  _getDay(date) {
    const data = this._load();
    if (!data.feedbackData) data.feedbackData = {};
    if (!data.feedbackData[date]) {
      data.feedbackData[date] = { likes: [], dislikes: [], backlog: [], sent: false };
    }
    return { data, day: data.feedbackData[date] };
  },

  // --- Toggle \u043b\u0430\u0439\u043a ---
  toggleLike(date, cardId) {
    const { data, day } = this._getDay(date);
    const idx = day.likes.indexOf(cardId);
    if (idx > -1) {
      day.likes.splice(idx, 1);
      this._removeFromAllLiked(data, date, cardId);
    } else {
      day.likes.push(cardId);
      // \u0423\u0431\u0440\u0430\u0442\u044c \u0434\u0438\u0437\u043b\u0430\u0439\u043a
      const dIdx = day.dislikes.indexOf(cardId);
      if (dIdx > -1) day.dislikes.splice(dIdx, 1);
      this._addToAllLiked(data, date, cardId);
    }
    this._save(data);
    return day.likes.includes(cardId);
  },

  // --- Toggle \u0434\u0438\u0437\u043b\u0430\u0439\u043a ---
  toggleDislike(date, cardId) {
    const { data, day } = this._getDay(date);
    const idx = day.dislikes.indexOf(cardId);
    if (idx > -1) {
      day.dislikes.splice(idx, 1);
    } else {
      day.dislikes.push(cardId);
      // \u0423\u0431\u0440\u0430\u0442\u044c \u043b\u0430\u0439\u043a
      const lIdx = day.likes.indexOf(cardId);
      if (lIdx > -1) {
        day.likes.splice(lIdx, 1);
        this._removeFromAllLiked(data, date, cardId);
      }
    }
    this._save(data);
    return day.dislikes.includes(cardId);
  },

  // --- Toggle \u0431\u044d\u043a\u043b\u043e\u0433 ---
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

  // --- \u0413\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0435 \u0441\u043f\u0438\u0441\u043a\u0438 ---
  _getCardMeta(cardId) {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    return {
      title: el?.dataset.cardTitle || cardId,
      category: el?.dataset.cardCategory || ''
    };
  },

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

  // --- \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 ---
  getStats(date) {
    const { day } = this._getDay(date);
    return {
      likes: day.likes.length,
      dislikes: day.dislikes.length,
      backlog: day.backlog.length,
      sent: day.sent
    };
  },

  getState(date, cardId) {
    const { day } = this._getDay(date);
    return {
      liked: day.likes.includes(cardId),
      disliked: day.dislikes.includes(cardId),
      backlogged: day.backlog.includes(cardId)
    };
  },

  // --- Telegram ---
  generateFeedbackMessage(date) {
    const { day } = this._getDay(date);
    const lines = [];
    if (day.likes.length) {
      const titles = day.likes.map(id => this._getCardMeta(id).title);
      lines.push(`\ud83d\udc4d ${titles.join(', ')}`);
    }
    if (day.dislikes.length) {
      const titles = day.dislikes.map(id => this._getCardMeta(id).title);
      lines.push(`\ud83d\udc4e ${titles.join(', ')}`);
    }
    if (day.backlog.length) {
      const titles = day.backlog.map(id => this._getCardMeta(id).title);
      lines.push(`\ud83d\udccb ${titles.join(', ')}`);
    }
    return lines.join('\n');
  },

  openTelegram(date) {
    const msg = this.generateFeedbackMessage(date);
    if (!msg) return;
    // Копируем в буфер — надёжнее deep link
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => {
        this._showToast('Скопировано! Отправь мне в Telegram');
      }).catch(() => this._fallbackCopy(msg));
    } else {
      this._fallbackCopy(msg);
    }
    const { data, day } = this._getDay(date);
    day.sent = true;
    this._save(data);
  },

  _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this._showToast('Скопировано! Отправь мне в Telegram');
  },

  _showToast(message) {
    const old = document.querySelector('.kodi-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'kodi-toast';
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 2500);
  },

  // --- \u0414\u043b\u044f liked.html ---
  getAllLiked() {
    const data = this._load();
    return data.allLiked || [];
  },

  removeLike(fullId) {
    const data = this._load();
    if (!data.allLiked) return;
    const item = data.allLiked.find(x => x.id === fullId);
    if (!item) return;
    data.allLiked = data.allLiked.filter(x => x.id !== fullId);
    // \u0423\u0431\u0440\u0430\u0442\u044c \u0438\u0437 \u0434\u043d\u0435\u0432\u043d\u044b\u0445
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) {
      data.feedbackData[date].likes = data.feedbackData[date].likes.filter(x => x !== cardId);
    }
    this._save(data);
  },

  // --- \u0414\u043b\u044f backlog.html ---
  getAllBacklog() {
    const data = this._load();
    return data.allBacklog || [];
  },

  removeBacklog(fullId) {
    const data = this._load();
    if (!data.allBacklog) return;
    const item = data.allBacklog.find(x => x.id === fullId);
    if (!item) return;
    data.allBacklog = data.allBacklog.filter(x => x.id !== fullId);
    // \u0423\u0431\u0440\u0430\u0442\u044c \u0438\u0437 \u0434\u043d\u0435\u0432\u043d\u044b\u0445
    const [date, ...cardParts] = fullId.split('_');
    const cardId = cardParts.join('_');
    if (data.feedbackData?.[date]) {
      data.feedbackData[date].backlog = data.feedbackData[date].backlog.filter(x => x !== cardId);
    }
    this._save(data);
  },

  // --- \u0421\u0442\u0430\u0442\u044b \u0434\u043b\u044f index ---
  getDateStats(date) {
    const { day } = this._getDay(date);
    return { likes: day.likes.length };
  }
};

/* === \u0418\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043a\u043d\u043e\u043f\u043e\u043a \u0444\u0438\u0434\u0431\u044d\u043a\u0430 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u0434\u0430\u0439\u0434\u0436\u0435\u0441\u0442\u0430 === */
function initFeedbackButtons(date) {
  document.querySelectorAll('.feedback-btn').forEach(btn => {
    const cardId = btn.dataset.cardId;
    const action = btn.dataset.action;

    // \u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435
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
    // \u0423\u0431\u0440\u0430\u0442\u044c \u0434\u0438\u0437\u043b\u0430\u0439\u043a
    allBtns.forEach(b => {
      if (b.dataset.action === 'dislike') b.classList.remove('active-dislike');
    });
  } else if (action === 'dislike') {
    const isActive = FeedbackStore.toggleDislike(date, cardId);
    btn.classList.toggle('active-dislike', isActive);
    // \u0423\u0431\u0440\u0430\u0442\u044c \u043b\u0430\u0439\u043a
    allBtns.forEach(b => {
      if (b.dataset.action === 'like') b.classList.remove('active-like');
    });
  } else if (action === 'backlog') {
    const isActive = FeedbackStore.addToBacklog(date, cardId);
    btn.classList.toggle('active-backlog', isActive);
  }

  updateFeedbackPanel(date);
}

/* === Sticky \u043f\u0430\u043d\u0435\u043b\u044c === */
function initFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;

  updateFeedbackPanel(date);

  const sendBtn = panel.querySelector('.feedback-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      FeedbackStore.openTelegram(date);
      updateFeedbackPanel(date);
    });
  }
}

function updateFeedbackPanel(date) {
  const panel = document.getElementById('feedback-panel');
  if (!panel) return;

  const stats = FeedbackStore.getStats(date);
  const total = stats.likes + stats.dislikes + stats.backlog;

  // \u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c/\u0441\u043a\u0440\u044b\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c
  panel.classList.toggle('visible', total > 0);

  // \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0447\u0451\u0442\u0447\u0438\u043a\u0438
  const statsEl = panel.querySelector('.feedback-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span>\ud83d\udc4d ${stats.likes}</span>
      <span>\ud83d\udc4e ${stats.dislikes}</span>
      <span>\ud83d\udccb ${stats.backlog}</span>
    `;
  }

  // \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u043d\u043e\u043f\u043a\u0443 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438
  const sendBtn = panel.querySelector('.feedback-send-btn');
  if (sendBtn) {
    if (stats.sent && (stats.likes + stats.dislikes + stats.backlog) === 0) {
      sendBtn.classList.add('sent');
      sendBtn.textContent = '\u2713 \u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e';
    } else if (stats.sent) {
      sendBtn.classList.remove('sent');
      sendBtn.textContent = '\ud83d\udce4 \u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0435\u0449\u0451 \u0440\u0430\u0437';
    } else {
      sendBtn.classList.remove('sent');
      sendBtn.textContent = '\ud83d\udce4 \u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u041a\u043e\u0434\u0438';
    }
  }
}

/* === \u0420\u0435\u043d\u0434\u0435\u0440 liked.html === */
function renderLikedPage() {
  const container = document.getElementById('liked-content');
  if (!container) return;

  const items = FeedbackStore.getAllLiked();
  if (!items.length) {
    container.innerHTML = `
      <div class="page-empty">
        <div class="page-empty-icon">\u2764\ufe0f</div>
        <div class="page-empty-text">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043b\u0430\u0439\u043a\u043d\u0443\u0442\u044b\u0445 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a</div>
      </div>`;
    return;
  }

  // \u0413\u0440\u0443\u043f\u043f\u0438\u0440\u043e\u0432\u043a\u0430 \u043f\u043e \u0434\u0430\u0442\u0435
  const groups = {};
  items.forEach(item => {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
  });

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
          <button class="remove-btn" onclick="removeLiked('${item.id}')" aria-label="\u0423\u0431\u0440\u0430\u0442\u044c">\u2715</button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function removeLiked(fullId) {
  FeedbackStore.removeLike(fullId);
  renderLikedPage();
}

/* === \u0420\u0435\u043d\u0434\u0435\u0440 backlog.html === */
function renderBacklogPage() {
  const container = document.getElementById('backlog-content');
  if (!container) return;

  const items = FeedbackStore.getAllBacklog();
  if (!items.length) {
    container.innerHTML = `
      <div class="page-empty">
        <div class="page-empty-icon">\ud83d\udccb</div>
        <div class="page-empty-text">\u0411\u044d\u043a\u043b\u043e\u0433 \u043f\u0443\u0441\u0442</div>
      </div>`;
    return;
  }

  const statusMap = {
    'new': { label: '\ud83c\udd95 \u043d\u043e\u0432\u043e\u0435', cls: 'new' },
    'in_progress': { label: '\ud83d\udd04 \u0432 \u0440\u0430\u0431\u043e\u0442\u0435', cls: 'in-progress' },
    'done': { label: '\u2705 \u0433\u043e\u0442\u043e\u0432\u043e', cls: 'done' }
  };

  container.innerHTML = items.map(item => {
    const st = statusMap[item.status] || statusMap['new'];
    return `
      <div class="backlog-card" data-id="${item.id}">
        <div class="backlog-card-info">
          <div class="backlog-card-title">${item.title}</div>
          <div class="backlog-card-meta">${item.date} <span class="backlog-status ${st.cls}">${st.label}</span></div>
        </div>
        <button class="remove-btn" onclick="removeBacklog('${item.id}')" aria-label="\u0423\u0431\u0440\u0430\u0442\u044c">\u2715</button>
      </div>
    `;
  }).join('');
}

function removeBacklog(fullId) {
  FeedbackStore.removeBacklog(fullId);
  renderBacklogPage();
}

/* === \u0421\u0442\u0430\u0442\u044b \u0434\u043b\u044f index === */
function updateDigestStats() {
  document.querySelectorAll('[data-digest-date]').forEach(el => {
    const date = el.dataset.digestDate;
    const stats = FeedbackStore.getDateStats(date);
    const likesEl = el.querySelector('.digest-likes');
    if (likesEl && stats.likes > 0) {
      likesEl.textContent = `\u2764\ufe0f ${stats.likes}`;
      likesEl.style.display = '';
    }
  });
}

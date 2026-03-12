// Мини-API для фидбэка дайджеста
// Запуск: node ~/kodi-digest/api/server.js
// Данные: ~/kodi-digest/feedback/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3457;
const FEEDBACK_DIR = path.join(__dirname, '..', 'feedback');

// Убедиться что папка существует
if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });

// Прочитать файл фидбэка за дату
function readFeedback(date) {
  const file = path.join(FEEDBACK_DIR, `${date}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { date, reactions: [], preferences: {} };
  }
}

// Записать фидбэк
function writeFeedback(date, data) {
  const file = path.join(FEEDBACK_DIR, `${date}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Прочитать агрегированные предпочтения
function readPreferences() {
  const file = path.join(FEEDBACK_DIR, 'preferences.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { boost: [], suppress: [], category_scores: {} };
  }
}

// CORS headers
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  cors(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // POST /feedback — сохранить реакцию
  if (req.method === 'POST' && url.pathname === '/feedback') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { date, cardId, cardTitle, category, reaction } = JSON.parse(body);
        if (!date || !cardId || !reaction) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'date, cardId, reaction обязательны' }));
          return;
        }

        const fb = readFeedback(date);

        // Убрать предыдущую реакцию на эту карточку (если есть)
        fb.reactions = fb.reactions.filter(r => !(r.cardId === cardId && r.reaction === reaction));

        // Добавить
        fb.reactions.push({
          cardId,
          cardTitle: cardTitle || cardId,
          category: category || '',
          reaction, // like, dislike, backlog
          timestamp: new Date().toISOString()
        });

        writeFeedback(date, fb);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, total: fb.reactions.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // DELETE /feedback — убрать реакцию
  if (req.method === 'POST' && url.pathname === '/feedback/remove') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { date, cardId, reaction } = JSON.parse(body);
        const fb = readFeedback(date);
        fb.reactions = fb.reactions.filter(r => !(r.cardId === cardId && r.reaction === reaction));
        writeFeedback(date, fb);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /feedback?date=2026-03-12 — получить фидбэк за день
  if (req.method === 'GET' && url.pathname === '/feedback') {
    const date = url.searchParams.get('date');
    if (!date) {
      // Все файлы
      const files = fs.readdirSync(FEEDBACK_DIR).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
      const all = files.map(f => readFeedback(f.replace('.json', '')));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(all));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readFeedback(date)));
    return;
  }

  // GET /preferences — текущие предпочтения
  if (req.method === 'GET' && url.pathname === '/preferences') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readPreferences()));
    return;
  }

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Feedback API running on http://localhost:${PORT}`);
});

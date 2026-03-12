# Дайджест v4 — Спецификация

## Контекст
Ежедневный AI-дайджест для Есета (читает с телефона, 5-10 мин утром).
Репо: ~/kodi-digest/, деплой: GitHub Pages.

## Стек
- Статический HTML + CSS (Tailwind CDN) + vanilla JS
- Шрифт: Space Grotesk (Google Fonts)
- Тема: тёмная, стиль Linear/Vercel
- БЕЗ фреймворков, БЕЗ билда, БЕЗ бэкенда

## Файловая структура
```
kodi-digest/
├── index.html          # Главная: список дайджестов + навигация
├── liked.html          # Архив лайкнутых карточек
├── backlog.html        # Бэклог задач на внедрение
├── css/
│   └── style.css       # Общие стили
├── js/
│   ├── feedback.js     # Система лайков/дизлайков/бэклога (localStorage)
│   └── app.js          # Accordion, анимации, навигация
├── daily/
│   └── 2026-03-12.html # Дайджест дня
└── TEMPLATE.html       # Шаблон для генерации новых дайджестов
```

## Экраны

### 1. Дайджест дня (daily/YYYY-MM-DD.html)

#### Секция TL;DR (всегда видна, не скроллить)
- 3 главных за день
- Формат: "[Что] → [Что это значит для тебя]"
- Фон: gradient с фиолетовым акцентом
- Фиксированная высота, один viewport

#### Секция "🤖 Агентский кодинг" (3-5 карточек, ОБЯЗАТЕЛЬНАЯ)
- ПРИОРИТЕТНАЯ секция — идёт после TL;DR
- 3-5 карточек ежедневно, без пропусков
- Формат: полноразмерные карточки (не accordion)
- Темы: Claude Code обновления, паттерны агентов, новые MCP серверы, Agent Teams, практические кейсы
- Формат содержания: что → как применить в стеке Есета (Claude Code + Conductor + OpenClaw) → 1 действие
- Тег: 🤖 AGENT
- Каждая новость → дописывается в knowledge/agent-coding/ (patterns/tools/cases/changelog)
- Источники: github.com/anthropics/claude-code releases, obra/superpowers releases, r/ClaudeAI, HN AI, Fireship YouTube
- Кнопки фидбэка: [👍] [👎] [📋 В бэклог]

#### Секция "Новости" (15-20 карточек)
- Формат: accordion
- Видно: заголовок + тег + 1 строка описания
- Клик = раскрыть подробности (expand/collapse)
- Теги: 🛠 TOOL, 🌊 WAVE, 📣 BIZ, 🧠 AI, 🎓 EDTECH, ⚠️ RISK, 💰 MONEY, 🤖 AGENT
- Внизу каждой карточки: кнопки [👍] [👎] [📋 В бэклог]
- Кнопки подсвечиваются при нажатии (active state), данные в localStorage

#### Секция "Внедрить" (3-5 карточек)
- Формат: полноразмерные карточки (не accordion)
- Содержание: что + зачем тебе + конкретное действие + цена/время
- Кнопка [📋 В бэклог] на каждой

#### Секция "Контр-сигнал" (1-2)
- Риск или слепая зона
- Красноватый акцент вместо фиолетового

#### Плавающая панель фидбэка (внизу экрана, sticky)
- Показывает: "Отмечено: N 👍  N 👎  N 📋"
- Кнопка "📤 Отправить Коди" — генерирует Telegram deep link
- Формат сообщения: 
  "👍 [название1], [название2]\n👎 [название3]\n📋 [название4]"
- Deep link: https://t.me/KodiAssistBot?start=FEEDBACK_{date}_{encoded}
  (Или просто: tg://msg?text=...)
- После отправки — localStorage помечает "отправлено для этой даты"

### 2. Главная (index.html)
- Заголовок "Дайджест Коди"
- Список дайджестов по датам (свежий сверху)
- Рядом с каждым: кол-во карточек, кол-во лайков за этот день
- Навигация: [Дайджесты] [❤️ Лайкнутые] [📋 Бэклог]

### 3. Архив лайкнутых (liked.html)
- Все карточки с 👍, из localStorage
- Группировка по дате
- Можно убрать лайк (toggle)

### 4. Бэклог (backlog.html)
- Все карточки с 📋
- Статусы: 🆕 новое → 🔄 в работе → ✅ готово
- Статусы обновляет Коди (при генерации дайджеста)

## Дизайн

### Цвета
- Background: #000000
- Card bg: rgba(255,255,255,0.03)
- Card border: rgba(255,255,255,0.06)
- Card hover: rgba(124,58,237,0.1) border
- Text primary: #ffffff
- Text secondary: #a1a1aa
- Accent: #7c3aed (фиолетовый)
- Risk accent: #ef4444 (красный)
- Success: #22c55e (зелёный)

### Типографика
- Space Grotesk, weights: 400, 500, 600, 700
- H1: 28px, weight 700
- H2: 20px, weight 600
- Body: 15px, line-height 1.7
- Tags: 11px, uppercase, letter-spacing 0.5px

### Анимации
- Accordion: smooth height transition (300ms ease)
- Cards: fade-in при скролле (IntersectionObserver)
- Кнопки фидбэка: scale(1.1) + цвет при active
- Sticky panel: slide-up появление при первом фидбэке

### Мобильный приоритет
- Max-width: 640px, центрирован
- Кнопки фидбэка: min 44x44px (Apple HIG)
- Padding: 16px по бокам
- Шрифт body: 15px (не меньше)

## JavaScript (feedback.js)

### Структура данных localStorage
```js
{
  feedbackData: {
    "2026-03-12": {
      likes: ["card_1", "card_3"],
      dislikes: ["card_5"],
      backlog: ["card_1"],
      sent: false
    }
  },
  allLiked: [
    { id: "2026-03-12_card_1", title: "ZuckerBot MCP", date: "2026-03-12", category: "TOOL" }
  ],
  allBacklog: [
    { id: "2026-03-12_card_1", title: "ZuckerBot MCP", date: "2026-03-12", status: "new" }
  ]
}
```

### Функции
- toggleLike(cardId) — toggle 👍, убирает 👎 если был
- toggleDislike(cardId) — toggle 👎, убирает 👍 если был
- addToBacklog(cardId) — toggle 📋
- generateFeedbackMessage(date) — собирает строку для Telegram
- openTelegram(message) — window.open с tg deep link
- renderLikedPage() — для liked.html
- renderBacklogPage() — для backlog.html
- getStats(date) — кол-во лайков/дизлайков для index.html

## TEMPLATE.html
- Шаблон с плейсхолдерами: {{DATE}}, {{TLDR}}, {{NEWS_CARDS}}, {{IMPLEMENT_CARDS}}, {{COUNTER_SIGNAL}}
- Каждая карточка: data-card-id, data-card-title, data-card-category
- Подключает css/style.css и js/feedback.js, js/app.js

## Контент для первого дайджеста (12 марта 2026)
Оставить текущий контент из daily/2026-03-12.html, но переформатировать в accordion.

## Важно
- Mobile-first: сначала дизайн для 375px, потом расширяй
- Никакого React, никакого билда — чистый HTML/CSS/JS
- Кнопки достаточно крупные для пальцев
- Accordion работает без JS (details/summary) + JS для анимации
- Dark mode ONLY — нет переключателя


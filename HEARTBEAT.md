# Heartbeat — ежедневная генерация дайджеста

## Как запускать
Этот файл описывает процесс генерации ежедневного дайджеста Коди.

---

### 1. Проверь дату
- Какой сегодня день? Есть ли уже `daily/YYYY-MM-DD.html`?
- Если есть — обнови. Если нет — создай новый.

### 2. Собери новости

**🤖 TIER 0 — Агентский кодинг (КАЖДЫЙ ДЕНЬ, до Tier 1):**
- github.com/anthropics/claude-code/releases — новые версии
- github.com/obra/superpowers/commits — новые скиллы и паттерны
- openclaw/openclaw releases — обновления OpenClaw
- r/ClaudeAI top 10 за день — практические кейсы
- HackerNews: agent coding, vibe coding, claude code (100+ очков)
- Fireship, AI Jason, Matthew Berman YouTube — транскрипции новых видео

**TIER 1 — Основные источники:**
- TechCrunch AI
- The Verge AI
- Ars Technica AI
- VentureBeat AI
- HackerNews top (100+ очков)
- r/MachineLearning, r/artificial hot
- Product Hunt top 5
- Anthropic blog, OpenAI blog, Google AI blog
- Meta AI blog

**TIER 2 — Специализированные:**
- AdExchanger, Marketing Land — AdTech
- EdSurge, Inside Higher Ed — EdTech
- CoinDesk, The Block — Crypto/Web3

**TIER 3 — Локальные:**
- vc.ru AI, Habr AI
- Digital.gov.kz

### 3. Структурируй карточки
- TL;DR: 3 главных за день (формат: «Что → Что это значит»)
- 🤖 Агентский кодинг: 3-5 карточек (ОБЯЗАТЕЛЬНО)
- Новости: 15-20 карточек с тегами
- Внедрить: 3-5 карточек с конкретными действиями
- Контр-сигнал: 1-2 карточки

### 3.5 Обнови базу знаний agent-coding
- Если нашёл новый паттерн агентного кодинга → добавь в knowledge/agent-coding/patterns.md
- Если вышло обновление инструмента → добавь в knowledge/agent-coding/changelog.md
- Если нашёл практический кейс → добавь в knowledge/agent-coding/cases.md

### 4. Сгенерируй HTML
- Используй TEMPLATE.html как основу
- Заполни все секции
- Проверь что все data-card-id уникальны
- Подключи css/style.css, js/feedback.js, js/app.js

### 5. Обнови index.html
- Добавь новый дайджест в список (свежий сверху)
- Обнови badge "NEW" (только последний)

### 6. Проверь
- Открой в браузере — визуально проверь
- Accordion работает
- Кнопки фидбэка кликабельны
- Мобильный вид (375px) — всё читается

### 7. Закоммить и запушь
```bash
git add daily/YYYY-MM-DD.html index.html knowledge/
git commit -m "digest YYYY-MM-DD: краткое описание"
git push
```

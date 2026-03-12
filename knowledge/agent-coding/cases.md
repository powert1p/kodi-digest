# Кейсы агентского кодинга

> Кто что построил через AI-агентов. Реальные результаты.

## 2026-03-12

### Anthropic — C-компилятор
- 16 агентов Opus, 2000 сессий, $20K API
- 2 млрд input-токенов
- Результат: работающий C-compiler
- Источник: anthropic.com/engineering/building-c-compiler

### iOS приложение за $100
- Vibe coding, 1 неделя
- #28 в App Store
- vs $5000 у подрядчика
- Источник: новости марта 2026

### Compound Engineering (Every, Inc.)
- Plan → Work → Review → Compound
- 26 специализированных агентов
- 14+ ревью-агентов
- Каждая единица работы делает следующую проще

### Multi-agent PR Review (Anthropic)
- Покрытие ревью: 16% → 54%
- Несколько агентов параллельно анализируют PR
- Источник: TechCrunch

### Stripe Minions — 1,300+ PR/неделю
- Массовый параллелизм: каждая задача = отдельный агент + worktree
- Автоматическая генерация PR для миграций, рефакторинга, тестов
- Ключ: изоляция (git worktree + DB branch) + quality gates
- Результат: инженерная скорость x10 для рутинных задач
- Источник: engineering.stripe.com 2026

---
Последнее обновление: 2026-03-12

### Apple Xcode 26.3 + агенты
- OpenAI Codex и Claude как coding agents в Xcode
- MCP протокол для совместимости
- Прямая работа с проектами, модификация файлов

### TELUS — 13K AI solutions
- Ускорение engineering velocity на 30%
- Distributed agents внутри компании
- Источник: Anthropic 2026 Agentic Coding Trends Report

### Zapier — 89% AI adoption
- 800+ агентов внутри организации
- Координация выходит за пределы engineering команд
- Источник: Anthropic 2026 Agentic Coding Trends Report

### Rakuten vLLM
- 99.9% numerical accuracy через агентный кодинг
- Complex codebase navigation
- Источник: Anthropic report

### Mistral AI — Vibe
- Автономный агент для Rails-тестирования
- Собственный продукт для enterprise

### CDP Qadam — FastAPI + React + PostgreSQL
- Стек: FastAPI (backend), React + Tailwind (frontend), PostgreSQL (DB)
- Подход: Claude Code + Agent Teams, PM-first workflow
- PM-агент → spec, Researcher → codebase, Implementer → worktrees, Tester → TDD, Reviewer → merge
- Урок: агентный подход работает для production, но нужна дисциплина (TDD, file ownership, verification)

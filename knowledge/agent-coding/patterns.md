# Паттерны агентского кодинга

> Обновляется ежедневно. Источник: дайджест + ресёрч.

## Оркестрация

### Leader-Worker
Лид декомпозирует → воркеры исполняют параллельно.
Пример: Anthropic C-compiler — 16 агентов, 2000 сессий, $20K.

### Swarm (самоорганизующийся)
Пул задач → воркеры сами берут следующую. Нет центрального координатора.
Источник: kieranklaassen gist.

### Pipeline
A → B → C. Каждый агент принимает артефакт предыдущего.
Пример: PM → Architect → Implementer → Tester.

### Competitive
Несколько агентов решают одну задачу, лучшее решение побеждает.

### Watchdog
Воркер + монитор качества параллельно.

## Скиллы (качество)

### Brainstorming → Planning → TDD
Жёсткий гейт: думай → планируй → тестируй → кодь.
obra/superpowers (42K⭐). Ключевой: "no code until design approved".

### Verification-before-completion
Запусти команду → прочитай вывод → ПОТОМ заявляй результат.

### Dual Review Layer
Claude self-review + Gemini cross-review. Разные модели ловят разные ошибки.

## Субагенты

- НЕ наследуют скиллы (нужно skills: в frontmatter)
- UserPromptSubmit хук НЕ работает для субагентов
- SubagentStart хук — единственный способ инжектить контекст
- Свежий контекст на каждую задачу предотвращает деградацию

## Бюджет скиллов
- 16K символов метаданных
- ~67 скиллов при 130 символов описания
- Директивный формат ("ALWAYS invoke when...") = 100% активация
- Пассивный ("Use when...") = 50-77%

### Minions (Stripe)
Массовая обработка: 1 задача → тысячи параллельных агентов.
Пример: Stripe — 1,300+ PR/неделю, каждый агент = 1 PR.
Ключ: изоляция через git worktree + DB branching (Neon).

### Database Isolation
Каждый агент получает свою ветку БД (Neon branching, PlanetScale branching).
Решает: параллельные миграции не конфликтуют.

---
Последнее обновление: 2026-03-12

## Тренды 2026 (Anthropic + Google)

### 8 трендов Anthropic
1. Shift от кода к оркестрации агентов
2. Активная human-agent коллаборация (60% работы с AI, но только 0-20% полностью делегируется)
3. Multi-domain implementation (тестирование, дебаг, генерация — одним потоком)
4. Масштабирование через distributed agents (TELUS: 13K custom AI solutions, +30% velocity)
5. Broad adoption (Zapier: 89% AI adoption, 800+ агентов внутри компании)
6. Multi-agent coordination mastery
7. Human-agent oversight scaling
8. Security from initial design

### 8 паттернов Google ADK
1. Sequential Pipeline — сборочная линия
2. Parallel Fan-Out/Gather — параллельное исполнение
3. Generator and Critic — генератор + валидатор
4. Hierarchical Decomposition — разбиение на подзадачи
5-8. Routing, Loop-based, State Machine, Event-driven

### Ключевой сдвиг
"Agentic coding = microservices revolution для AI"
Монолитные агенты → оркестрированные команды специализированных агентов.

## Качественные ворота (DORA 2026)

### AI adoption без quality gates = больше багов
- 90% разработчиков используют AI → +9% bug rate без ворот
- Решение: TDD + code review + verification gates
- DORA: "AI amplifies existing process quality"
- Компании с gates: +23% delivery performance

### Agent Skills Standard
- SKILL.md файл — кроссплатформенный (Claude Code, Gemini CLI, Codex)
- Описание + триггеры + контент → агент знает КОГДА и КАК использовать
- Директивный формат ("ALWAYS invoke when...") = 100% активация
- Бюджет: 16K символов метаданных, ~67 скиллов макс

## 2026-03-13: Vibe Coding → Agentic Engineering

Industry shift documented (InfoQ/Medium 2026):
- "Vibe coding" (ask AI, hope for best) → "Agentic Engineering" (Plan→Execute→Verify under human oversight)
- 78% organizations integrated AI into core dev workflows
- Anti-patterns: "AI Slopageddon" (low-quality flood), missing big-picture thinking, "haunted codebases"
- Winning combo: AI generation + automated review layer + TDD as quality gate
- GitHub data: experienced devs WITHOUT review layer + AI = sometimes SLOWER than no AI (review overhead kills generation gain)

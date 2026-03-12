# Changelog агентских инструментов

> Новые фичи, релизы, обновления. Хронология.

## 2026-03-12

### OpenClaw v2026.3.8
- Backup tool: openclaw backup create/verify
- ACP Provenance: субагенты сохраняют trace ID
- Telegram dupes fix
- Subagent delivery refactor
- 12+ security patches

### Claude Code — Multi-agent PR Review
- Несколько агентов параллельно анализируют PR
- Покрытие ревью: 16% → 54%
- Официальная фича от Anthropic

### Meta GEM (Generative Ads Manager)
- Product URL → полная рекламная кампания
- AI создаёт креативы, таргетинг, бюджет
- Бета, 2026

---
Последнее обновление: 2026-03-12

### Claude Code v2.1.74 (12 марта 2026)
- `autoMemoryDirectory` — кастомное хранилище авто-памяти
- Actionable suggestions в /context
- Фикс memory leak в streaming API

### Claude Code v2.1.72 (10 марта 2026)
- `w` в /copy — запись selections прямо в файлы
- `/plan` принимает описание аргументом
- `ExitWorktree` tool — выход из worktree сессий
- Бандл уменьшен на 510KB

### Claude Code v2.1.71 (7 марта 2026)
- `/loop` команда — повторяющиеся промпты по расписанию
- Cron scheduling tools
- Фикс stdin freeze в длинных сессиях

### Claude Code v2.1.69 (5 марта 2026)
- Claude API skill для билдинга приложений
- Voice STT: 10 новых языков (20 всего)
- `/remote-control` с именем
- `/reload-plugins`
- 40+ security fixes

### Claude Code v2.1.68 (4 марта 2026)
- Opus 4.6 → medium effort по дефолту (Max/Team)
- "ultrathink" вернули для high effort
- Opus 4/4.1 убраны из API

### Cursor Automations (5 марта 2026)
- Always-on агенты с триггерами: GitHub PR, Slack, Linear, PagerDuty, cron, webhooks
- Инцидент PagerDuty → агент запрашивает логи через MCP
- Еженедельные summary изменений в Slack
- Сотни автоматизаций в час
- ARR Cursor: $2B+, удвоился за 3 месяца

### Google Antigravity (public preview, март 2026)
- Agent-first IDE: Editor view + Manager view
- Manager view: оркестрация агентов параллельно
- Gemini 3.1 Pro + Claude Sonnet 4.5 + GPT-OSS
- SWE-bench: 76.2%
- Бесплатный для индивидуальных разработчиков

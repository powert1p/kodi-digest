# Инструменты агентского кодинга

> Обновляется ежедневно. Версии, фичи, совместимость.

## Claude Code CLI
- Версия: v2.1.74 (12 марта 2026)
- Модель: Opus 4.6 (1M context window, medium effort по дефолту)
- Agent Teams: experimental, env CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
- Субагенты: Plan (Sonnet, read-only), Explore (Haiku), General-Purpose (Sonnet, все)
- Кастомные агенты: .claude/agents/*.md
- Скиллы: .claude/skills/*/SKILL.md (кроссплатформенный стандарт)
- Хуки: 13 событий (SessionStart, Stop, SubagentStart, PreToolUse...)
- `/loop` команда: повторяющиеся промпты по cron-расписанию
- `/plan` принимает описание аргументом
- `ExitWorktree` tool — выход из worktree сессий
- Built-in git worktree поддержка для изоляции агентов

## Conductor.build
- Mac app, бесплатный (Melty Labs, YC S24)
- Каждый агент = отдельный git worktree
- Linear/GitHub интеграция
- Ограничение: агенты НЕ общаются между собой
- Deeplinks: conductor://...

## OpenClaw
- Версия: v2026.3.8
- Always-on агент в Docker
- Telegram/WhatsApp/Discord/Slack
- ACP: runtime для Claude Code сессий
- Graphiti: граф знаний на Neo4j

## Superpowers Plugin (obra)
- 42K⭐ GitHub
- ~12 ядровых скиллов: brainstorming, TDD, verification, debugging...
- Маршрутизатор: using-superpowers (1% = вызывай)

## MCP серверы (релевантные)
- railway-db: PostgreSQL для CDP
- Linear: https://mcp.linear.app/mcp
- GitHub: ghcr.io/github/github-mcp-server
- Exa: семантический поиск
- Tavily: LLM-поиск
- Datadog: мониторинг + алерты через MCP (9 марта 2026)
- Neon: DB branching для параллельных агентов
- Stripe: платежи + финансовая аналитика

## Cursor
- ARR: $2B+ (март 2026), удвоился за 3 месяца
- 1M+ пользователей, 360K+ платных
- Automations (5 марта 2026): триггеры из GitHub PR, Slack, Linear, PagerDuty, cron
- Background Agents: агенты работают в фоне
- Сотни автоматизаций в час

## Google Antigravity
- Agent-first IDE, бесплатный public preview
- Gemini 3.1 Pro / 3 Flash + Claude Sonnet 4.5 + GPT-OSS
- Manager view: оркестрация нескольких агентов параллельно
- SWE-bench: 76.2% (vs Claude 77.2%)
- MacOS/Windows/Linux

## Windsurf (Cognition/Devin)
- Acquired by Cognition AI (Devin) после неудачной покупки OpenAI за $3B
- $82M ARR, 350+ enterprise
- Cascade — полностью агентный режим
- План: merge Windsurf IDE + Devin autonomous agent

## GitHub Copilot
- Agent Mode добавлен
- Кодинг, ревью, тесты в одном потоке

## OpenAI Codex
- Standalone cloud agent + desktop app
- Отдельный продукт от ChatGPT

---
Последнее обновление: 2026-03-12

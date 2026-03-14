#!/usr/bin/env python3
"""
enrich.py — LLM-обработка собранных данных для дайджеста Коди.

Читает collected.json (сырые данные от collect.py), обрабатывает через Claude API:
- Перевод заголовков на русский (адаптация, не дословный)
- Саммари описаний на русском (2-3 предложения)
- Генерация card-action (одно конкретное действие для Есета)
- Заполнение пустых описаний по заголовку и источнику
- Генерация TL;DR в формате "Что → Зачем Есету"

Использование:
    python3 scripts/enrich.py --input scripts/collected.json --output scripts/enriched.json
"""

import argparse
import json
import os
import re
import sys
import time
from typing import Optional

# ── Попытка импорта anthropic SDK ─────────────────────────────────────────────

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    print("⚠ anthropic SDK не установлен. Fallback: базовая обработка без LLM.", file=sys.stderr)

# ── Константы ─────────────────────────────────────────────────────────────────

MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3
BATCH_SIZE = 8  # Карточек за один запрос к API

# Системный промпт для обогащения карточек
SYSTEM_PROMPT = """Ты — редактор русскоязычного AI-дайджеста для Есета.

Контекст о читателе:
Есет = коммерческий директор AiPlus (образование, Казахстан, 4500 учеников).
Стек: Claude Code + Conductor + OpenClaw, CDP Qadam (FastAPI + React + PostgreSQL).
Реклама: Meta/FB $30-40k/мес, Advantage+.
Что ему важно: что можно ВНЕДРИТЬ прямо сейчас, эффективность, автоматизация.

Твоя задача — обработать карточки новостного дайджеста:

1. **Заголовок (title_ru)**: Переведи/адаптируй на русский. Не дословно — передай суть. Макс 100 символов.
2. **Описание (description_ru)**: Саммари на русском, 2-3 предложения. Убери Reddit-мусор, URL, markdown. Если описание пустое — сгенерируй по заголовку и источнику.
3. **Действие (action)**: Одно конкретное действие для Есета на русском. Формат: глагол + что сделать. Пример: "Попробуй MCP-сервер context-mode для экономии контекста в Claude Code".

Ответ строго в JSON формате. Без markdown обёртки. Массив объектов:
[
  {
    "index": 0,
    "title_ru": "...",
    "description_ru": "...",
    "action": "..."
  }
]
"""

# Промпт для TL;DR
TLDR_SYSTEM_PROMPT = """Ты — редактор русскоязычного AI-дайджеста для Есета.

Контекст о читателе:
Есет = коммерческий директор AiPlus (образование, Казахстан, 4500 учеников).
Стек: Claude Code + Conductor + OpenClaw, CDP Qadam (FastAPI + React + PostgreSQL).
Реклама: Meta/FB $30-40k/мес, Advantage+.

Сгенерируй TL;DR — ровно 3 пункта в формате:
"Что произошло → Зачем это Есету (конкретная польза)"

Примеры хорошего формата:
- "Claude получил 1M контекст → Загружай весь кодбейс Qadam целиком, не теряя контекст"
- "Meta добавил описание аудитории текстом → Тестируй вместо интересов для AiPlus кампаний"
- "MCP-сервер экономит 98% контекста → Подключи к Claude Code для длинных сессий"

Ответ строго в JSON: ["пункт1", "пункт2", "пункт3"]
Без markdown обёртки.
"""


def get_api_key() -> Optional[str]:
    """Получает API key из env или файла ~/.anthropic/key."""
    # 1. Переменная окружения
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()

    # 2. Файл ~/.anthropic/key
    key_file = os.path.expanduser("~/.anthropic/key")
    if os.path.isfile(key_file):
        try:
            with open(key_file, "r") as f:
                key = f.read().strip()
            if key:
                return key
        except Exception:
            pass

    return None


def call_claude(client: "anthropic.Anthropic", system: str, user_msg: str) -> str:
    """Вызывает Claude API с ретраями."""
    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
            )
            return response.content[0].text
        except Exception as e:
            print(f"  [API] Попытка {attempt + 1}/{MAX_RETRIES}: {e}", file=sys.stderr)
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)  # Экспоненциальная задержка
    return ""


def enrich_batch_llm(client: "anthropic.Anthropic", items: list[dict]) -> list[dict]:
    """
    Обогащает батч карточек через Claude API.
    Возвращает список {index, title_ru, description_ru, action}.
    """
    # Формируем список карточек для промпта
    cards_text = []
    for i, item in enumerate(items):
        cards_text.append(
            f"[{i}] Заголовок: {item['title']}\n"
            f"    Описание: {item.get('description', '') or '(пусто)'}\n"
            f"    Источник: {item.get('source', '')}"
        )

    user_msg = "Обработай эти карточки:\n\n" + "\n\n".join(cards_text)

    raw = call_claude(client, SYSTEM_PROMPT, user_msg)
    if not raw:
        return []

    # Парсим JSON ответ
    try:
        # Убираем возможные markdown обёртки
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            # Убираем ```json и ```
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
            cleaned = re.sub(r'\s*```$', '', cleaned)
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError as e:
        print(f"  [WARN] Не удалось распарсить JSON от API: {e}", file=sys.stderr)
        print(f"  [WARN] Ответ: {raw[:200]}", file=sys.stderr)

    return []


def generate_tldr_llm(client: "anthropic.Anthropic", top_items: list[dict]) -> list[str]:
    """Генерирует TL;DR через Claude API."""
    cards_text = []
    for item in top_items:
        cards_text.append(
            # Передаём описание целиком — LLM сам выберет суть
            f"- {item['title']}: {item.get('description', '') or item.get('source', '')}"
        )

    user_msg = (
        "Вот топ-карточки дайджеста. Сгенерируй 3 пункта TL;DR:\n\n"
        + "\n".join(cards_text)
    )

    raw = call_claude(client, TLDR_SYSTEM_PROMPT, user_msg)
    if not raw:
        return []

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
            cleaned = re.sub(r'\s*```$', '', cleaned)
        result = json.loads(cleaned)
        if isinstance(result, list) and len(result) >= 3:
            return result[:3]
    except json.JSONDecodeError:
        print(f"  [WARN] Не удалось распарсить TL;DR JSON", file=sys.stderr)

    return []


# ── Fallback: базовая обработка без LLM ──────────────────────────────────────

def fallback_enrich_item(item: dict) -> dict:
    """
    Базовая обработка карточки без LLM.
    Очистка текста + добавление маркера [EN] для нерусских текстов.
    """
    title = item.get("title", "")
    desc = item.get("description", "") or ""

    # Очистка описания от мусора
    desc = clean_text_fallback(desc)

    # Если описание пустое — генерируем из заголовка и источника
    if not desc.strip():
        source = item.get("source", "Неизвестный источник")
        desc = f"Подробнее в источнике: {source}."

    # Базовое действие
    action = f"Открой ссылку и оцени применимость для AiPlus."

    return {
        "title": title,
        "description": desc,
        "action": action,
    }


def clean_text_fallback(text: str) -> str:
    """Очистка текста без LLM (Reddit markdown, URL, мусор)."""
    if not text:
        return text
    # URL изображений Reddit
    text = re.sub(r'https?://(?:preview|i)\.redd\.it/\S+', '', text)
    # Markdown-ссылки: [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Standalone URL
    text = re.sub(r'https?://\S+', '', text)
    # Reddit markdown: **жирный**, *курсив*
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = text.replace('\\*', '')
    # Markdown заголовки
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Лишние пробелы
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'  +', ' ', text)
    return text.strip()


def fallback_tldr(top_items: list[dict]) -> list[str]:
    """Генерирует TL;DR без LLM — просто заголовок → источник."""
    result = []
    for item in top_items[:3]:
        title = item.get("title", "Новость")
        source = item.get("source", "")
        desc = item.get("description", "")[:100]
        if desc:
            result.append(f"{title} → {desc}")
        else:
            result.append(f"{title} → {source}")
    # Добиваем до 3
    while len(result) < 3:
        result.append("Источники недоступны — добавь контент вручную")
    return result


# ── HTML-генерация (из collect.py, повторяем для обогащённых данных) ──────────

def classify_tags(title: str, description: str) -> tuple[str, str, str]:
    """Возвращает (emoji, label, css_class) для карточки."""
    text = (title + " " + description).lower()
    if any(k in text for k in ["risk", "warning", "fail", "ban", "blocked", "danger",
                                 "риск", "опасн", "проблем"]):
        return "⚠️", "RISK", "risk"
    if any(k in text for k in [
        "meta ads", "facebook ads", "fb ads", "advantage+", "advantage plus",
        "meta business", "ads manager", "рекламный кабинет", "мета", "фейсбук реклам",
    ]):
        return "💼", "META", "biz"
    if any(k in text for k in [
        "reels", "content factory", "ugc", "creative", "tiktok",
        "youtube shorts", "content automation", "контент", "рилс", "креатив",
    ]):
        return "🎬", "CONTENT", "biz"
    if any(k in text for k in ["claude", "anthropic", "mcp", "agent", "agentic",
                                 "cursor", "windsurf", "агент"]):
        return "🤖", "AGENT", "agent"
    if any(k in text for k in ["tool", "library", "sdk", "framework", "github",
                                 "open source", "инструмент", "библиотек"]):
        return "🛠", "TOOL", "tool"
    if any(k in text for k in ["revenue", "roi", "money", "billion", "million",
                                 "funding", "startup", "доход", "выручк"]):
        return "💰", "MONEY", "money"
    if any(k in text for k in ["wave", "trend", "boom", "growth", "market",
                                 "тренд", "рост", "рынок"]):
        return "🌊", "WAVE", "wave"
    if any(k in text for k in ["business", "strategy", "marketing", "ads",
                                 "campaign", "бизнес", "стратег", "маркетинг"]):
        return "📣", "BIZ", "biz"
    return "🧠", "AI", "ai"


def html_full_card(item: dict, card_id: str, tag_emoji: str, tag_label: str, tag_css: str) -> str:
    """Полноразмерная карточка с card-action."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = (item.get("description", "") or "").replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    category = f"{tag_emoji} {tag_label}"

    action_text = item.get("action", "")
    action_html = ""
    if action_text:
        action_escaped = action_text.replace("<", "&lt;").replace(">", "&gt;")
        action_html = f"""
  <div class="card-action">
    <div class="card-action-label">Одно действие</div>
    <div class="card-action-text">{action_escaped}</div>
  </div>"""

    return f"""
<div class="card" data-card-id="{card_id}" data-card-title="{title}" data-card-category="{category}">
  <div class="card-num"><span class="tag {tag_css}">{tag_emoji} {tag_label}</span></div>
  <div class="card-title">{title}</div>
  <div class="card-text">{desc}</div>{action_html}
  <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
  <div class="feedback-buttons">
    <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
  </div>
</div>"""


def html_accordion_card(item: dict, card_id: str, tag_emoji: str, tag_label: str, tag_css: str) -> str:
    """Accordion-карточка с card-action."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = (item.get("description", "") or "").replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    category = f"{tag_emoji} {tag_label}"
    # Превью по границе слова — не режем слово посередине
    preview = truncate_at_word(desc, 120)

    action_text = item.get("action", "")
    action_html = ""
    if action_text:
        action_escaped = action_text.replace("<", "&lt;").replace(">", "&gt;")
        action_html = f"""
    <div class="card-action">
      <div class="card-action-label">Одно действие</div>
      <div class="card-action-text">{action_escaped}</div>
    </div>"""

    return f"""
<details class="accordion-card" data-card-id="{card_id}" data-card-title="{title}" data-card-category="{category}">
  <summary class="accordion-summary">
    <span class="tag {tag_css}">{tag_emoji} {tag_label}</span>
    <div class="accordion-summary-content">
      <div class="accordion-card-title">{title}</div>
      <div class="accordion-card-preview">{preview}</div>
    </div>
    <div class="accordion-chevron">▼</div>
  </summary>
  <div class="accordion-body">
    <div class="card-text">{desc}</div>{action_html}
    <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>"""


def html_risk_card(item: dict, card_id: str) -> str:
    """Карточка контр-сигнала с card-action."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = (item.get("description", "") or "").replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    # Превью по границе слова
    preview = truncate_at_word(desc, 120)

    action_text = item.get("action", "")
    action_html = ""
    if action_text:
        action_escaped = action_text.replace("<", "&lt;").replace(">", "&gt;")
        action_html = f"""
    <div class="card-action">
      <div class="card-action-label">Одно действие</div>
      <div class="card-action-text">{action_escaped}</div>
    </div>"""

    return f"""
<details class="accordion-card risk-card" data-card-id="{card_id}" data-card-title="{title}" data-card-category="⚠️ КОНТР-СИГНАЛ">
  <summary class="accordion-summary">
    <span class="tag risk">⚡ РИСК</span>
    <div class="accordion-summary-content">
      <div class="accordion-card-title">{title}</div>
      <div class="accordion-card-preview">{preview}</div>
    </div>
    <div class="accordion-chevron">▼</div>
  </summary>
  <div class="accordion-body">
    <div class="card-text">{desc}</div>
    <div class="card-risk">
      <div class="card-risk-label">Контр-сигнал</div>
      <div class="card-risk-text">{title[:100]}</div>
    </div>{action_html}
    <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>"""


def truncate_at_word(text: str, max_len: int) -> str:
    """Обрезает текст по границе слова."""
    if len(text) <= max_len:
        return text
    truncated = text[:max_len]
    last_space = truncated.rfind(" ")
    if last_space > max_len // 2:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:!? ") + "..."


# ── Основная логика ──────────────────────────────────────────────────────────

def enrich(input_path: str, output_path: str) -> None:
    """Главная функция обогащения."""
    # Загружаем collected.json
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_items = data.get("_raw_items", {})
    if not raw_items:
        print("⚠ Нет _raw_items в collected.json. Используем данные как есть.", file=sys.stderr)
        # Копируем данные без изменений
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return

    # Определяем режим работы: LLM или fallback
    api_key = get_api_key()
    use_llm = HAS_ANTHROPIC and api_key is not None

    client = None
    if use_llm:
        client = anthropic.Anthropic(api_key=api_key)
        print("🚀 Режим: LLM-обогащение через Claude API", file=sys.stderr)
    else:
        print("📝 Режим: Fallback (базовая обработка без LLM)", file=sys.stderr)
        if not api_key:
            print("  Причина: ANTHROPIC_API_KEY не найден (env / ~/.anthropic/key)", file=sys.stderr)

    # Обогащаем каждую секцию
    enriched_items: dict[str, list[dict]] = {}
    all_enriched: list[dict] = []  # Для TL;DR — собираем все

    sections_config = {
        "agent_cards": ("agent", "full"),
        "meta_cards": ("meta", "full"),
        "content_cards": ("content", "full"),
        "cdp_cards": ("cdp", "full"),
        "implement_cards": ("impl", "full"),
        "news_cards": ("card", "accordion"),
        "counter_signal": ("risk", "risk"),
    }

    for section, items in raw_items.items():
        if not items:
            enriched_items[section] = []
            continue

        print(f"\n  Обрабатываю {section}: {len(items)} карточек...", file=sys.stderr)

        if use_llm:
            # Батчами по BATCH_SIZE
            enriched_data = []
            for batch_start in range(0, len(items), BATCH_SIZE):
                batch = items[batch_start:batch_start + BATCH_SIZE]
                print(f"    Батч {batch_start // BATCH_SIZE + 1}: {len(batch)} карточек", file=sys.stderr)
                results = enrich_batch_llm(client, batch)

                if results:
                    for r in results:
                        idx = r.get("index", 0)
                        if 0 <= idx < len(batch):
                            enriched_item = {**batch[idx]}
                            enriched_item["title"] = r.get("title_ru", batch[idx]["title"])
                            enriched_item["description"] = r.get("description_ru", batch[idx].get("description", ""))
                            enriched_item["action"] = r.get("action", "")
                            enriched_data.append(enriched_item)
                        else:
                            print(f"    [WARN] Индекс {idx} вне диапазона батча", file=sys.stderr)
                else:
                    # Fallback для этого батча
                    print(f"    [WARN] API не вернул результат, fallback", file=sys.stderr)
                    for item in batch:
                        fb = fallback_enrich_item(item)
                        enriched_data.append({**item, **fb})

                # Задержка между батчами (rate limiting)
                if batch_start + BATCH_SIZE < len(items):
                    time.sleep(1)

            # Если получили меньше чем ожидали — добавляем fallback для пропущенных
            if len(enriched_data) < len(items):
                enriched_urls = {e["url"] for e in enriched_data}
                for item in items:
                    if item["url"] not in enriched_urls:
                        fb = fallback_enrich_item(item)
                        enriched_data.append({**item, **fb})

            enriched_items[section] = enriched_data
        else:
            # Fallback без LLM
            enriched_items[section] = []
            for item in items:
                fb = fallback_enrich_item(item)
                enriched_items[section].append({**item, **fb})

        all_enriched.extend(enriched_items[section])

    # ── TL;DR ─────────────────────────────────────────────────────────────────

    print("\n  Генерирую TL;DR...", file=sys.stderr)

    # Топ карточки для TL;DR
    top_items = (
        enriched_items.get("agent_cards", [])[:2]
        + enriched_items.get("implement_cards", [])[:1]
        + enriched_items.get("meta_cards", [])[:1]
    )[:5]

    if use_llm:
        tldr = generate_tldr_llm(client, top_items)
        if not tldr:
            print("  [WARN] LLM TL;DR не удалось, fallback", file=sys.stderr)
            tldr = fallback_tldr(top_items)
    else:
        tldr = fallback_tldr(top_items)

    # ── Генерация HTML из обогащённых данных ──────────────────────────────────

    print("\n  Генерирую HTML...", file=sys.stderr)

    # agent_cards — полноразмерные
    agent_html_parts = []
    for i, item in enumerate(enriched_items.get("agent_cards", []), 1):
        cid = f"agent_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item.get("description", ""))
        agent_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    agent_html = "\n".join(agent_html_parts)

    # implement_cards — полноразмерные
    impl_html_parts = []
    for i, item in enumerate(enriched_items.get("implement_cards", []), 1):
        cid = f"impl_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item.get("description", ""))
        impl_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    impl_html = "\n".join(impl_html_parts)

    # news_cards — accordion
    news_html_parts = []
    for i, item in enumerate(enriched_items.get("news_cards", []), 1):
        cid = f"card_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item.get("description", ""))
        news_html_parts.append(html_accordion_card(item, cid, tag_e, tag_l, tag_c))
    news_html = "\n".join(news_html_parts)

    # meta_cards — полноразмерные
    meta_html_parts = []
    for i, item in enumerate(enriched_items.get("meta_cards", []), 1):
        cid = f"meta_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item.get("description", ""))
        meta_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    meta_html = "\n".join(meta_html_parts)

    # content_cards — полноразмерные
    content_html_parts = []
    for i, item in enumerate(enriched_items.get("content_cards", []), 1):
        cid = f"content_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item.get("description", ""))
        content_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    content_html = "\n".join(content_html_parts)

    # cdp_cards — полноразмерные
    cdp_html_parts = []
    for i, item in enumerate(enriched_items.get("cdp_cards", []), 1):
        cid = f"cdp_{i}"
        cdp_html_parts.append(html_full_card(item, cid, "📊", "CDP", "biz"))
    cdp_html = "\n".join(cdp_html_parts)

    # counter_signal — risk cards
    risk_html_parts = []
    for i, item in enumerate(enriched_items.get("counter_signal", []), 1):
        cid = f"risk_{i}"
        risk_html_parts.append(html_risk_card(item, cid))
    risk_html = "\n".join(risk_html_parts)

    # ── Подсчёт статистики ────────────────────────────────────────────────────

    total_cards = sum(len(v) for v in enriched_items.values())
    read_time = max(5, total_cards // 2)

    # ── Финальный JSON ────────────────────────────────────────────────────────

    result = {
        "date": data.get("date", ""),
        "date_title": data.get("date_title", ""),
        "items_count": str(total_cards),
        "read_time": str(read_time),
        "tldr": tldr,
        # HTML секции
        "agent_cards": agent_html or "<!-- нет данных -->",
        "meta_cards": meta_html or "<!-- нет данных -->",
        "content_cards": content_html or "<!-- нет данных -->",
        "cdp_cards": cdp_html or "<!-- нет данных -->",
        "news_cards": news_html or "<!-- нет данных -->",
        "implement_cards": impl_html or "<!-- нет данных -->",
        "counter_signal": risk_html or "<!-- нет данных -->",
        "_stats": {
            "agent": len(enriched_items.get("agent_cards", [])),
            "meta": len(enriched_items.get("meta_cards", [])),
            "content": len(enriched_items.get("content_cards", [])),
            "cdp": len(enriched_items.get("cdp_cards", [])),
            "implement": len(enriched_items.get("implement_cards", [])),
            "news": len(enriched_items.get("news_cards", [])),
            "risk": len(enriched_items.get("counter_signal", [])),
            "total": total_cards,
        },
        "_enriched": True,
        "_mode": "llm" if use_llm else "fallback",
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Обогащённый JSON сохранён: {output_path}", file=sys.stderr)
    print(f"  Режим: {'LLM' if use_llm else 'Fallback'}", file=sys.stderr)
    print(f"  Карточек: {total_cards}", file=sys.stderr)
    print(f"  TL;DR: {len(tldr)} пунктов", file=sys.stderr)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="LLM-обогащение дайджеста Коди")
    parser.add_argument("--input", required=True, help="Путь к collected.json")
    parser.add_argument("--output", required=True, help="Путь для enriched.json")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"Ошибка: файл не найден: {args.input}", file=sys.stderr)
        sys.exit(1)

    enrich(args.input, args.output)


if __name__ == "__main__":
    main()

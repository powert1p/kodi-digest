#!/usr/bin/env python3
"""
collect.py — сборщик новостей для дайджеста Коди.

Использование:
    python3 scripts/collect.py --date 2026-03-15 --output scripts/collected.json
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse

# Внешние зависимости (устанавливаются заранее)
try:
    import feedparser
except ImportError:
    print("feedparser не установлен: pip install feedparser", file=sys.stderr)
    feedparser = None

try:
    import requests
except ImportError:
    print("requests не установлен: pip install requests", file=sys.stderr)
    requests = None

# ── Константы ──────────────────────────────────────────────────────────────────

REQUEST_TIMEOUT = 10  # секунд на каждый источник
USER_AGENT = "KodiDigest/1.0 (by /u/kodiassist)"

# Лимиты по секциям
LIMITS = {
    "agent_cards": 5,
    "meta_cards": 3,
    "content_cards": 3,
    "cdp_cards": 2,
    "implement_cards": 5,
    "counter_signal": 2,
    "news_cards": 20,
}

# ── Словари классификации ──────────────────────────────────────────────────────

# Ключевые слова для секций (в нижнем регистре)
AGENT_KEYWORDS = [
    "claude code", "claude agent", "mcp server", "mcp tool", "agentic",
    "agent framework", "multi-agent", "multiagent", "cursor agent", "windsurf",
    "vibe coding", "vibecoding", "superpowers", "agent sdk", "agent loop",
    "claude sonnet", "claude opus", "anthropic", "tool use",
]

IMPLEMENT_KEYWORDS = [
    "meta ads", "facebook ads", "fb ads", "ad creative", "reels automation",
    "content automation", "ai creative", "data pipeline",
    "automation workflow", "roi", "i built", "show hn", "how i ", "case study",
    "revenue", "conversion rate", "cpm", "roas", "performance marketing",
    "advantage+", "advantage plus",
    # Контент, таргетинг
    "content factory", "reels", "ugc", "creative automation", "content workflow",
    "lookalike audience", "custom audience", "retargeting", "a/b test",
    "creative testing", "landing page", "funnel",
]

COUNTER_KEYWORDS = [
    "risk", "warning", "problem", "fail", "issue", "ban", "blocked",
    "lawsuit", "regulation", "danger", "concern", "backlash", "harmful",
    "exploit", "vulnerability", "breach", "leak",
]

SUPPRESS_KEYWORDS = [
    "bitcoin", "crypto", "ethereum", "stock market", "sec ", "ipo ",
    "nft", "blockchain", "defi",
]


def truncate_at_word(text: str, max_len: int) -> str:
    """Обрезает текст по границе слова, не дальше max_len символов."""
    if len(text) <= max_len:
        return text
    truncated = text[:max_len]
    # Ищем последний пробел, чтобы не резать слово
    last_space = truncated.rfind(" ")
    if last_space > max_len // 2:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:!? ") + "..."

# ── Теги ───────────────────────────────────────────────────────────────────────

def classify_tags(title: str, description: str, source_type: str = "") -> tuple[str, str, str]:
    """
    Возвращает (emoji, label, css_class) для карточки.
    label — текст тега (без эмодзи), css_class — CSS-класс.
    """
    text = (title + " " + description).lower()

    if any(k in text for k in ["risk", "warning", "fail", "ban", "blocked", "danger"]):
        return "⚠️", "RISK", "risk"
    # META — приоритет выше AGENT и TOOL
    if any(k in text for k in [
        "meta ads", "facebook ads", "fb ads", "advantage+", "advantage plus",
        "meta business", "ads manager", "рекламный кабинет",
    ]):
        return "💼", "META", "biz"
    # CONTENT — контент и креативы
    if any(k in text for k in [
        "reels", "content factory", "ugc", "creative", "tiktok",
        "youtube shorts", "content automation",
    ]):
        return "🎬", "CONTENT", "biz"
    if any(k in text for k in ["claude", "anthropic", "mcp", "agent", "agentic", "cursor", "windsurf"]):
        return "🤖", "AGENT", "agent"
    if any(k in text for k in ["tool", "library", "sdk", "framework", "github", "open source"]):
        return "🛠", "TOOL", "tool"
    if any(k in text for k in ["revenue", "roi", "money", "billion", "million", "funding", "startup"]):
        return "💰", "MONEY", "money"
    if any(k in text for k in ["wave", "trend", "boom", "growth", "market"]):
        return "🌊", "WAVE", "wave"
    if any(k in text for k in ["business", "strategy", "marketing", "ads", "campaign"]):
        return "📣", "BIZ", "biz"

    return "🧠", "AI", "ai"


def _is_meta_source(source: str) -> bool:
    """Проверяет, является ли источник Meta/FB-специфичным."""
    meta_sources = [
        "jon loomer", "jonloomer", "social media examiner",
        "adespresso", "r/facebookads",
    ]
    src = source.lower()
    return any(ms in src for ms in meta_sources)


def classify_section(title: str, description: str, source: str = "") -> str:
    """
    Определяет секцию для карточки.
    Порядок: suppress → counter → source-based → agent → meta → content → cdp → implement → news
    """
    text = (title + " " + description).lower()

    # Сначала проверяем suppress — пропускаем
    if any(k in text for k in SUPPRESS_KEYWORDS):
        return "skip"

    # Контр-сигнал
    if any(k in text for k in COUNTER_KEYWORDS):
        return "counter_signal"

    # Источник Meta/FB (Jon Loomer, Social Media Examiner, r/FacebookAds) → meta_cards
    if _is_meta_source(source):
        return "meta_cards"

    # Агентский кодинг
    if any(k in text for k in AGENT_KEYWORDS):
        return "agent_cards"

    # Meta / FB реклама — широкий список, чтобы не утекали в implement
    META_SECTION_KW = [
        "meta ads", "facebook ads", "fb ads", "advantage+", "advantage plus",
        "meta business", "ads manager", "рекламный кабинет", "google ads",
        "lookalike audience", "custom audience", "retargeting", "roas",
        "performance marketing", "ad creative", "creative testing",
        "meta ai", "facebook", "cpm", "a/b test", "landing page", "funnel",
        "meta announces", "location fees", "conversions lost", "attribution",
        "ad account", "ad set", "campaign budget",
    ]
    if any(k in text for k in META_SECTION_KW):
        return "meta_cards"

    # Контент / Креативы
    CONTENT_SECTION_KW = [
        "reels", "content factory", "ugc", "creative automation",
        "content workflow", "tiktok", "youtube shorts", "content marketing",
    ]
    if any(k in text for k in CONTENT_SECTION_KW):
        return "content_cards"

    # CDP / Data — только реальные CDP-продукты и data pipeline
    CDP_SECTION_KW = [
        "customer data platform", "mparticle", "data pipeline",
    ]
    # "segment" и "rudderstack" только как точные совпадения (не как часть другого слова)
    cdp_exact = ["segment", "rudderstack"]
    is_cdp = any(k in text for k in CDP_SECTION_KW)
    if not is_cdp:
        for kw in cdp_exact:
            # Проверяем как отдельное слово через regex
            if re.search(r'\b' + re.escape(kw) + r'\b', text):
                is_cdp = True
                break
    if is_cdp:
        return "cdp_cards"

    # Внедрить (оставшиеся implement_keywords)
    if any(k in text for k in IMPLEMENT_KEYWORDS):
        return "implement_cards"

    return "news_cards"


# ── Оценка важности (score) ────────────────────────────────────────────────────

BOOST_KEYWORDS = [
    "claude agent", "mcp", "vibe coding", "meta ads", "facebook ads",
    "content automation", "cdp", "agentic", "реклама", "креатив",
    "agentic coding", "multiagent",
]

def compute_score(item: dict) -> float:
    """
    Вычисляет score для сортировки карточек.
    upvotes/points + boost-бонус.
    """
    score = float(item.get("upvotes", 0) or item.get("points", 0) or 0)
    text = (item.get("title", "") + " " + item.get("description", "")).lower()

    # Буст за ключевые слова
    boost = sum(5.0 for k in BOOST_KEYWORDS if k in text)
    score += boost

    # Буст за свежесть (если есть published)
    pub = item.get("published_ts")
    if pub:
        try:
            hours_ago = (time.time() - pub) / 3600
            freshness_bonus = max(0, 10 - hours_ago / 2)
            score += freshness_bonus
        except Exception:
            pass

    return score


# ── Парсинг RSS через feedparser ───────────────────────────────────────────────

RSS_SOURCES = [
    {"url": "https://www.anthropic.com/news/rss", "source": "Anthropic Blog"},
    {"url": "https://ai.meta.com/blog/rss/", "source": "Meta AI Blog"},
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch AI"},
    {"url": "https://www.jonloomer.com/feed/", "source": "Jon Loomer"},
    {"url": "https://simonwillison.net/atom/everything/", "source": "Simon Willison"},
    {"url": "https://mshibanami.github.io/GitHubTrendingRSS/daily/python.xml", "source": "GitHub Trending Python"},
    {"url": "https://mshibanami.github.io/GitHubTrendingRSS/daily/typescript.xml", "source": "GitHub Trending TypeScript"},
    {"url": "https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml", "source": "The Rundown AI"},
    {"url": "https://hnrss.org/frontpage?points=100", "source": "HackerNews 100+"},
    # FB Ads / Meta
    {"url": "https://www.socialmediaexaminer.com/feed/", "source": "Social Media Examiner"},
    {"url": "https://adespresso.com/blog/feed/", "source": "AdEspresso Blog"},
    # Контент / Креативы
    {"url": "https://rameezusmani.beehiiv.com/feed", "source": "Creator Economy Newsletter"},
    # CDP / Data
    {"url": "https://segment.com/blog/rss/", "source": "Segment Blog"},
    {"url": "https://www.rudderstack.com/blog/rss/", "source": "RudderStack Blog"},
]


def fetch_rss(url: str, source_name: str) -> list[dict]:
    """Получает и парсит RSS-фид, возвращает список элементов."""
    if feedparser is None:
        return []

    try:
        # feedparser сам делает HTTP-запрос, но без таймаута
        # Используем requests + feedparser для контроля таймаута
        if requests is not None:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code in (403, 429, 404):
                print(f"  [SKIP] {source_name}: HTTP {resp.status_code}", file=sys.stderr)
                return []
            feed = feedparser.parse(resp.content)
        else:
            feed = feedparser.parse(url)

        items = []
        for entry in feed.entries[:20]:
            title = entry.get("title", "").strip()
            if not title:
                continue

            # Описание: summary или content
            desc = ""
            if hasattr(entry, "summary"):
                desc = re.sub(r"<[^>]+>", " ", entry.summary).strip()
            elif hasattr(entry, "content") and entry.content:
                desc = re.sub(r"<[^>]+>", " ", entry.content[0].value).strip()
            desc = truncate_at_word(desc, 400)

            link = entry.get("link", "")
            if not link:
                continue

            # Дата публикации
            pub_ts = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                try:
                    pub_ts = time.mktime(entry.published_parsed)
                except Exception:
                    pass

            items.append({
                "title": title,
                "description": desc,
                "url": link,
                "source": source_name,
                "source_type": "rss",
                "upvotes": 0,
                "points": 0,
                "published_ts": pub_ts,
            })

        print(f"  [RSS] {source_name}: {len(items)} элементов", file=sys.stderr)
        return items

    except Exception as e:
        print(f"  [ERR] {source_name}: {e}", file=sys.stderr)
        return []


# ── Reddit JSON API ────────────────────────────────────────────────────────────

REDDIT_SOURCES = [
    {"url": "https://www.reddit.com/r/ClaudeAI/top.json?t=day&limit=15", "source": "r/ClaudeAI", "min_upvotes": 10},
    {"url": "https://www.reddit.com/r/vibecoding/top.json?t=day&limit=10", "source": "r/vibecoding", "min_upvotes": 10},
    {"url": "https://www.reddit.com/r/FacebookAds/top.json?t=day&limit=10", "source": "r/FacebookAds", "min_upvotes": 10},
    {"url": "https://www.reddit.com/r/PPC/top.json?t=day&limit=8", "source": "r/PPC", "min_upvotes": 10},
    {"url": "https://www.reddit.com/r/ChatGPTCoding/top.json?t=day&limit=10", "source": "r/ChatGPTCoding", "min_upvotes": 10},
    # FB Ads / Meta
    {"url": "https://www.reddit.com/r/googleads/top.json?t=day&limit=10", "source": "r/googleads", "min_upvotes": 5},
    # Контент / Креативы
    {"url": "https://www.reddit.com/r/content_marketing/top.json?t=day&limit=10", "source": "r/content_marketing", "min_upvotes": 5},
    {"url": "https://www.reddit.com/r/Reels/top.json?t=day&limit=10", "source": "r/Reels", "min_upvotes": 5},
]


def fetch_reddit(url: str, source_name: str, min_upvotes: int = 10) -> list[dict]:
    """Получает топ-посты из Reddit JSON API."""
    if requests is None:
        return []

    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code in (403, 429, 404):
            print(f"  [SKIP] {source_name}: HTTP {resp.status_code}", file=sys.stderr)
            return []

        data = resp.json()
        posts = data.get("data", {}).get("children", [])

        items = []
        for post in posts:
            p = post.get("data", {})
            title = p.get("title", "").strip()
            upvotes = p.get("ups", 0) or 0
            score = p.get("score", 0) or 0

            if upvotes < min_upvotes and score < min_upvotes:
                continue
            if not title:
                continue

            # URL поста (permalink или external url)
            url_post = p.get("url", "")
            permalink = "https://reddit.com" + p.get("permalink", "")
            # Если внешний URL — используем его, иначе permalink
            if url_post and not url_post.startswith("https://www.reddit.com"):
                link = url_post
            else:
                link = permalink

            # Описание: selftext или ""
            selftext = p.get("selftext", "") or ""
            desc = truncate_at_word(selftext.strip(), 400)

            items.append({
                "title": title,
                "description": desc,
                "url": link,
                "source": source_name,
                "source_type": "reddit",
                "upvotes": max(upvotes, score),
                "points": 0,
                "published_ts": p.get("created_utc"),
            })

        print(f"  [Reddit] {source_name}: {len(items)} постов (min_upvotes={min_upvotes})", file=sys.stderr)
        return items

    except Exception as e:
        print(f"  [ERR] {source_name}: {e}", file=sys.stderr)
        return []


# ── HackerNews Algolia API ─────────────────────────────────────────────────────

HN_QUERIES = [
    {"query": "claude agent", "hits": 8},
    {"query": "vibe coding", "hits": 5},
    {"query": "meta ads AI", "hits": 5},
    {"query": "MCP server", "hits": 5},
]

HN_MIN_POINTS = 10


def fetch_hn_algolia() -> list[dict]:
    """Получает истории из HN через Algolia API."""
    if requests is None:
        return []

    all_items = []
    seen_urls: set[str] = set()

    for q in HN_QUERIES:
        url = (
            f"https://hn.algolia.com/api/v1/search"
            f"?query={q['query'].replace(' ', '+')}"
            f"&tags=story&hitsPerPage={q['hits']}"
        )
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code != 200:
                print(f"  [SKIP] HN '{q['query']}': HTTP {resp.status_code}", file=sys.stderr)
                continue

            data = resp.json()
            hits = data.get("hits", [])

            for hit in hits:
                points = hit.get("points") or 0
                if points < HN_MIN_POINTS:
                    continue

                title = hit.get("title", "").strip()
                if not title:
                    continue

                link = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}"
                if link in seen_urls:
                    continue
                seen_urls.add(link)

                story_text = hit.get("story_text") or ""
                desc = truncate_at_word(re.sub(r"<[^>]+>", " ", story_text).strip(), 400)

                # Дата
                pub_ts = None
                created = hit.get("created_at_i")
                if created:
                    pub_ts = float(created)

                all_items.append({
                    "title": title,
                    "description": desc,
                    "url": link,
                    "source": f"HN: {q['query']}",
                    "source_type": "hn",
                    "upvotes": 0,
                    "points": points,
                    "published_ts": pub_ts,
                })

        except Exception as e:
            print(f"  [ERR] HN '{q['query']}': {e}", file=sys.stderr)

    print(f"  [HN] Algolia: {len(all_items)} историй", file=sys.stderr)
    return all_items


# ── Дедупликация ───────────────────────────────────────────────────────────────

def deduplicate(items: list[dict]) -> list[dict]:
    """Удаляет дубли по URL."""
    seen: set[str] = set()
    result = []
    for item in items:
        url = item.get("url", "").strip().rstrip("/")
        if url and url not in seen:
            seen.add(url)
            result.append(item)
    return result


# ── Генерация HTML карточек ────────────────────────────────────────────────────

def make_card_id(prefix: str, n: int, date: str) -> str:
    """Создаёт уникальный card-id в формате YYYY-MM-DD_prefix_N."""
    return f"{date}_{prefix}_{n}"


def html_full_card(item: dict, card_id: str, tag_emoji: str, tag_label: str, tag_css: str) -> str:
    """Полноразмерная карточка (для agent_cards и implement_cards)."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = item["description"].replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    category = f"{tag_emoji} {tag_label}"

    return f"""
<div class="card" data-card-id="{card_id}" data-card-title="{title}" data-card-category="{category}">
  <div class="card-num"><span class="tag {tag_css}">{tag_emoji} {tag_label}</span></div>
  <div class="card-title">{title}</div>
  <div class="card-text">{desc}</div>
  <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
  <div class="feedback-buttons">
    <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
  </div>
</div>"""


def html_accordion_card(item: dict, card_id: str, tag_emoji: str, tag_label: str, tag_css: str) -> str:
    """Accordion-карточка (для news_cards)."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = item["description"].replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    category = f"{tag_emoji} {tag_label}"
    # Превью — первые 100 символов описания
    preview = desc[:100] + ("..." if len(desc) > 100 else "")

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
    <div class="card-text">{desc}</div>
    <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>"""


def html_risk_card(item: dict, card_id: str) -> str:
    """Карточка контр-сигнала (красный акцент)."""
    title = item["title"].replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    desc = item["description"].replace("<", "&lt;").replace(">", "&gt;")
    url = item["url"]
    source = item["source"].replace("<", "&lt;").replace(">", "&gt;")
    preview = desc[:100] + ("..." if len(desc) > 100 else "")

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
      <div class="card-risk-text">Обрати внимание: {title[:100]}</div>
    </div>
    <div class="card-source"><a href="{url}" target="_blank" rel="noopener">{source}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>"""


# ── Главная логика ─────────────────────────────────────────────────────────────

def collect(date: str) -> dict:
    """
    Собирает все источники и возвращает dict готовый для generate.sh (JSON).
    """
    print("=== Сбор источников ===", file=sys.stderr)

    all_items: list[dict] = []

    # 1. Reddit
    print("\n-- Reddit --", file=sys.stderr)
    for src in REDDIT_SOURCES:
        items = fetch_reddit(src["url"], src["source"], src.get("min_upvotes", 10))
        all_items.extend(items)

    # 2. HN Algolia
    print("\n-- HackerNews Algolia --", file=sys.stderr)
    all_items.extend(fetch_hn_algolia())

    # 3. RSS
    print("\n-- RSS --", file=sys.stderr)
    for src in RSS_SOURCES:
        items = fetch_rss(src["url"], src["source"])
        all_items.extend(items)

    # Дедупликация
    all_items = deduplicate(all_items)
    print(f"\n=== Всего после дедупликации: {len(all_items)} ===", file=sys.stderr)

    # Классификация
    buckets: dict[str, list[dict]] = {
        "agent_cards": [],
        "meta_cards": [],
        "content_cards": [],
        "cdp_cards": [],
        "implement_cards": [],
        "counter_signal": [],
        "news_cards": [],
    }

    for item in all_items:
        section = classify_section(item["title"], item["description"], item.get("source", ""))
        if section == "skip":
            continue
        item["_score"] = compute_score(item)
        buckets[section].append(item)

    # Сортировка и обрезка по лимитам
    for section, limit in LIMITS.items():
        buckets[section].sort(key=lambda x: x.get("_score", 0), reverse=True)
        buckets[section] = buckets[section][:limit]

    print("\n=== Распределение ===", file=sys.stderr)
    for section, items in buckets.items():
        print(f"  {section}: {len(items)}", file=sys.stderr)

    # ── Генерация HTML ─────────────────────────────────────────────────────────

    # agent_cards — полноразмерные
    agent_html_parts = []
    for i, item in enumerate(buckets["agent_cards"], 1):
        cid = f"agent_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        agent_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    agent_html = "\n".join(agent_html_parts)

    # implement_cards — полноразмерные
    impl_html_parts = []
    for i, item in enumerate(buckets["implement_cards"], 1):
        cid = f"impl_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        impl_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    impl_html = "\n".join(impl_html_parts)

    # news_cards — accordion
    news_html_parts = []
    for i, item in enumerate(buckets["news_cards"], 1):
        cid = f"card_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        news_html_parts.append(html_accordion_card(item, cid, tag_e, tag_l, tag_c))
    news_html = "\n".join(news_html_parts)

    # meta_cards — полноразмерные
    meta_html_parts = []
    for i, item in enumerate(buckets["meta_cards"], 1):
        cid = f"meta_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        meta_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    meta_html = "\n".join(meta_html_parts)

    # content_cards — полноразмерные
    content_html_parts = []
    for i, item in enumerate(buckets["content_cards"], 1):
        cid = f"content_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        content_html_parts.append(html_full_card(item, cid, tag_e, tag_l, tag_c))
    content_html = "\n".join(content_html_parts)

    # cdp_cards — полноразмерные
    cdp_html_parts = []
    for i, item in enumerate(buckets["cdp_cards"], 1):
        cid = f"cdp_{i}"
        tag_e, tag_l, tag_c = classify_tags(item["title"], item["description"])
        cdp_html_parts.append(html_full_card(item, cid, "📊", "CDP", "biz"))
    cdp_html = "\n".join(cdp_html_parts)

    # counter_signal — risk cards
    risk_html_parts = []
    for i, item in enumerate(buckets["counter_signal"], 1):
        cid = f"risk_{i}"
        risk_html_parts.append(html_risk_card(item, cid))
    risk_html = "\n".join(risk_html_parts)

    # ── TL;DR — топ-3 из всех секций ──────────────────────────────────────────

    # Берём топ из агентов + implement + новостей
    top_items = (
        buckets["agent_cards"][:2]
        + buckets["implement_cards"][:1]
        + buckets["news_cards"][:1]
    )[:3]

    # Если мало — добираем
    if len(top_items) < 3:
        extra = [
            item for section in buckets.values()
            for item in section
            if item not in top_items
        ]
        extra.sort(key=lambda x: x.get("_score", 0), reverse=True)
        top_items.extend(extra[: 3 - len(top_items)])

    tldr_items = []
    for item in top_items:
        # Формат: "Заголовок → краткое описание"
        title_short = truncate_at_word(item["title"], 120)
        desc_short = truncate_at_word(item["description"], 200) if item["description"] else item["source"]
        tldr_items.append(f"{title_short} → {desc_short}")

    # Если источники вернули мало данных — добавляем заглушку
    while len(tldr_items) < 3:
        tldr_items.append("Источники недоступны — добавь контент вручную")

    # ── Подсчёт статистики ─────────────────────────────────────────────────────

    total_cards = sum(len(v) for v in buckets.values())
    read_time = max(5, total_cards // 2)  # ~30 сек на карточку

    # Русская дата
    months_ru = [
        "", "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]
    y, m, d = date.split("-")
    date_title = f"{int(d)} {months_ru[int(m)]} {y}"

    # ── Собираем финальный JSON ────────────────────────────────────────────────

    # generate.sh ожидает ключи: date_title, items_count, read_time, tldr,
    # agent_cards, news_cards, implement_cards, counter_signal
    # TEMPLATE.html использует плейсхолдеры: {{TLDR_ITEMS}}, {{CARD_COUNT}},
    # {{AGENT_CARDS}}, {{NEWS_CARDS}}, {{IMPLEMENT_CARDS}}, {{COUNTER_SIGNAL}},
    # {{META_CARDS}}, {{CONTENT_CARDS}}, {{CDP_CARDS}}

    return {
        "date": date,
        "date_title": date_title,
        "items_count": str(total_cards),
        "read_time": str(read_time),
        "tldr": tldr_items,
        # HTML секции
        "agent_cards": agent_html or "<!-- нет данных -->",
        "meta_cards": meta_html or "<!-- нет данных -->",
        "content_cards": content_html or "<!-- нет данных -->",
        "cdp_cards": cdp_html or "<!-- нет данных -->",
        "news_cards": news_html or "<!-- нет данных -->",
        "implement_cards": impl_html or "<!-- нет данных -->",
        "counter_signal": risk_html or "<!-- нет данных -->",
        # Мета для отладки
        "_stats": {
            "agent": len(buckets["agent_cards"]),
            "meta": len(buckets["meta_cards"]),
            "content": len(buckets["content_cards"]),
            "cdp": len(buckets["cdp_cards"]),
            "implement": len(buckets["implement_cards"]),
            "news": len(buckets["news_cards"]),
            "risk": len(buckets["counter_signal"]),
            "total": total_cards,
        },
    }


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Сборщик новостей для дайджеста Коди")
    parser.add_argument("--date", required=True, help="Дата дайджеста (YYYY-MM-DD)")
    parser.add_argument("--output", required=True, help="Путь для сохранения JSON")
    args = parser.parse_args()

    # Валидация даты
    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print(f"Ошибка: неверный формат даты '{args.date}'. Нужно YYYY-MM-DD", file=sys.stderr)
        sys.exit(1)

    print(f"Собираем дайджест за {args.date}...", file=sys.stderr)
    result = collect(args.date)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    stats = result.get("_stats", {})
    print(f"\nГотово! Сохранено в {args.output}", file=sys.stderr)
    print(f"  Агенты: {stats.get('agent', 0)}", file=sys.stderr)
    print(f"  Внедрить: {stats.get('implement', 0)}", file=sys.stderr)
    print(f"  Новости: {stats.get('news', 0)}", file=sys.stderr)
    print(f"  Контр-сигнал: {stats.get('risk', 0)}", file=sys.stderr)
    print(f"  Итого: {stats.get('total', 0)} карточек", file=sys.stderr)


if __name__ == "__main__":
    main()

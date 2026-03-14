#!/usr/bin/env python3
"""
enrich_noapi.py — Обогащение дайджеста без API.

Все переводы и описания захардкожены. Claude — это я, я и пишу русский текст.
Читает collected.json, генерирует enriched.json + daily HTML + обновляет index.html.

Использование:
    python3 scripts/enrich_noapi.py
"""

import json
import os
import re
import subprocess
import sys
from html import escape

# ── Пути ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

COLLECTED_PATH = os.path.join(SCRIPT_DIR, "collected.json")
ENRICHED_PATH = os.path.join(SCRIPT_DIR, "enriched.json")
TEMPLATE_PATH = os.path.join(PROJECT_DIR, "TEMPLATE.html")
INDEX_PATH = os.path.join(PROJECT_DIR, "index.html")

DATE = "2026-03-15"
DATE_TITLE = "15 марта 2026"
DAILY_DIR = os.path.join(PROJECT_DIR, "daily")
OUTPUT_HTML = os.path.join(DAILY_DIR, f"{DATE}.html")

# ── Захардкоженные переводы ──────────────────────────────────────────────────
# Ключ = url карточки, значение = {title_ru, description_ru, action}

ENRICHMENTS = {
    # ===== AGENT CARDS =====
    "https://atmoio.substack.com/p/after-two-years-of-vibecoding-im": {
        "title_ru": "После двух лет вайб-кодинга я вернулся к ручному коду",
        "description_ru": "Разработчик два года писал код исключительно через AI-ассистентов, а потом понял, что теряет навык понимания собственного кода. Статья набрала 865 очков на HN — тема резонирует с сообществом. Ключевой вывод: вайб-кодинг отлично работает для прототипов, но для продакшена нужно понимать каждую строку.",
        "action": "Проверь свои последние PR в Qadam — понимаешь ли ты каждую строку, которую сгенерировал Claude Code? Если нет, добавь code review в workflow.",
    },
    "https://mksg.lu/blog/context-mode": {
        "title_ru": "MCP-сервер снижает потребление контекста Claude Code на 98%",
        "description_ru": "Context Mode — MCP-сервер, который кеширует и сжимает контекст. Вместо перечитывания файлов при каждом запросе, агент работает с дельтами. Реальные замеры автора: с 200K токенов до 4K на типичную задачу. Это x50 экономия на длинных сессиях.",
        "action": "Установи context-mode MCP-сервер и замерь потребление на Qadam. Если работает — это экономия x50 на длинных сессиях с Claude Code.",
    },
    "https://i.redd.it/o7jrde2tnuog1.png": {
        "title_ru": "1М контекст теперь доступен для Claude Opus 4.6 и Sonnet 4.6",
        "description_ru": "Anthropic открыл окно контекста в 1 миллион токенов по стандартной цене. Opus 4.6 показывает 78.3% на MRCR v2 — лучший результат среди frontier-моделей. Теперь можно загружать целые кодбейзы, большие наборы документов и запускать долгие агентские сессии. Лимит медиа — 600 изображений или PDF-страниц за запрос.",
        "action": "Загрузи весь кодбейс Qadam в одну сессию Claude Code с 1М контекстом. Проверь, насколько лучше агент держит архитектуру в голове.",
    },
    "https://www.fast.ai/posts/2026-01-28-dark-flow/": {
        "title_ru": "fast.ai: Развеиваем мифы о вайб-кодинге",
        "description_ru": "Джереми Ховард из fast.ai разбирает проблемы вайб-кодинга: накопление технического долга, иллюзия продуктивности и потеря контроля над кодом. 434 очка на HN. Статья не анти-AI, а про осознанное использование — знать, когда AI помогает, а когда мешает.",
        "action": "Прочитай статью и сравни с твоим workflow в Claude Code. Какие из описанных проблем ты уже замечал в Qadam?",
    },
    "https://read.technically.dev/p/vibe-coding-and-the-maker-movement": {
        "title_ru": "Повторит ли вайб-кодинг судьбу движения мейкеров?",
        "description_ru": "Автор проводит параллель между вайб-кодингом и maker movement 2010-х: обе волны обещали демократизацию, но в итоге нишевые инструменты не вытеснили профессионалов. 405 очков на HN. Вопрос: станет ли вайб-кодинг мейнстримом или останется хобби?",
        "action": "Подумай о стратегии AiPlus: если вайб-кодинг останется нишевым, какие курсы будут востребованы через 2 года? Профессиональный AI-инжиниринг или промпт-кодинг?",
    },

    # ===== META CARDS =====
    "https://reddit.com/r/FacebookAds/comments/1rt8799/i_hope_somebody_from_meta_reads_this/": {
        "title_ru": "Открытое письмо к Meta: рекламная платформа — ваш единственный продукт",
        "description_ru": "Рекламодатель с многолетним опытом напоминает: Meta не создала ничего оригинального — Instagram, Stories, Reels, WhatsApp всё было куплено или скопировано. Единственная их инновация — рекламная платформа. И она деградирует: таргетинг хуже, интерфейс запутаннее, поддержка нулевая.",
        "action": "Проверь свои кампании AiPlus в Ads Manager. Если видишь деградацию — протестируй Advantage+ Shopping с минимальными настройками: бюджет + креатив, без детального таргетинга.",
    },
    "https://reddit.com/r/FacebookAds/comments/1rtjqk0/how_is_performance_today_314/": {
        "title_ru": "Мартовский сбой Meta: как реклама восстанавливается после 14 марта",
        "description_ru": "После масштабного сбоя Meta в начале марта рекламодатели фиксируют просадку показателей. Тред собирает данные: у кого CPM вернулся в норму, у кого нет. Общий совет — не трогать кампании 48 часов после сбоя, дать алгоритму переобучиться.",
        "action": "Проверь CPM и CPA в кампаниях AiPlus за последние 7 дней. Если видишь аномалии после 10 марта — не паникуй, дай кампаниям ещё 2-3 дня на восстановление.",
    },
    "https://techcrunch.com/2026/03/14/meta-reportedly-considering-layoffs-that-could-affect-20-of-the-company/": {
        "title_ru": "Meta планирует увольнения до 20% сотрудников ради AI-инвестиций",
        "description_ru": "TechCrunch сообщает: Meta рассматривает масштабные увольнения, чтобы компенсировать агрессивные расходы на AI-инфраструктуру. Это может затронуть 20% компании. Для рекламодателей это означает: меньше поддержки, но больше AI-автоматизации в Ads Manager.",
        "action": "Следи за обновлениями Ads Manager в ближайший месяц. Увольнения = ускорение автоматизации. Готовься к тому, что ручной таргетинг скоро полностью заменит AI.",
    },

    # ===== IMPLEMENT CARDS =====
    "https://reddit.com/r/vibecoding/comments/1rtc54g/how_i_finally_organized_my_side_project_without/": {
        "title_ru": "Как я организовал сайд-проект и не сошёл с ума",
        "description_ru": "Автор перепробовал Trello, Google Sheets и заметки — хаос. Перешёл на Notion Business + AI и наконец навёл порядок: фичи, фидбек пользователей и задачи в одном месте. Пост из r/vibecoding, полезен для организации работы над проектами.",
        "action": "Попробуй Notion AI для организации бэклога Qadam. 3 месяца бесплатно на Business-плане — достаточно, чтобы понять, подходит ли инструмент.",
    },
    "https://simonwillison.net/2026/Mar/13/craig-mod/#atom-everything": {
        "title_ru": "Крейг Мод за 5 дней написал кастомную бухгалтерию с помощью AI",
        "description_ru": "Писатель и разработчик Craig Mod рассказывает: никакой готовый софт не подходил для его задач — мультивалютность, специфичная отчётность. За 5 дней с AI он написал идеальную для себя бухгалтерию: быстрая, локальная, с автоматическим пересчётом курсов. Цитата через блог Simon Willison.",
        "action": "Подумай: какой внутренний инструмент AiPlus ты мог бы собрать за 5 дней с Claude Code? Калькулятор unit-экономики? Дашборд по студентам?",
    },
    "https://www.therundown.ai/p/openai-robotics-lead-exits-over-pentagon-deal": {
        "title_ru": "Глава робототехники OpenAI ушёл из-за сделки с Пентагоном",
        "description_ru": "Руководитель направления робототехники покинул OpenAI в знак протеста против сотрудничества с военными. Дополнительно в рассылке: гайд по созданию AI-генератора кейс-стади. The Rundown AI.",
        "action": "Используй идею AI-генератора кейсов: создай шаблон, который генерирует истории успеха студентов AiPlus для лендингов и рекламы.",
    },

    # ===== COUNTER SIGNAL =====
    "https://i.redd.it/uxpmxlbmawog1.jpeg": {
        "title_ru": "Почему большинство вайб-код проектов проваливаются",
        "description_ru": "Вирусный пост с 4840 апвотами. Автор разбирает типичные ошибки: отсутствие тестов, API-ключи во фронтенде, нулевая безопасность, технический долг с первого дня. Для вайб-кодеров это отрезвляющий чек-лист.",
        "risk_text": "Если собираешь Qadam через вайб-кодинг — проверь: нет ли API-ключей во фронтенде, есть ли тесты, настроен ли CORS. Один пропущенный секрет = $87K потерь (см. карточку в новостях).",
    },
    "https://reddit.com/r/ClaudeAI/comments/1rtgq1o/15_or_so_hours_later_since_1m_context_included_in/": {
        "title_ru": "15 часов с 1М контекстом — ощущения как от наркотика",
        "description_ru": "Пользователь MAX-плана делится восторгом: контекст 1М токенов автоматически включился без доплаты. После 15 часов работы — агент больше не забывает контекст, не перечитывает файлы, работает как напарник. 192 апвота.",
        "risk_text": "Эйфория от нового инструмента — классический hype cycle. Проверь реально: насколько 1М контекст ускоряет работу на Qadam? Замерь время на типичную задачу до и после.",
    },

    # ===== NEWS CARDS =====
    "https://i.redd.it/kz11m2tsfvog1.png": {
        "title_ru": "Вайб-код приложения в одной картинке",
        "description_ru": "Мем из r/vibecoding — наглядно показывает разницу между ожиданиями от вайб-кодинга и реальностью. Лёгкий юмор для тех, кто в теме.",
        "action": "Улыбнись и покажи команде — полезно для внутренней культуры.",
    },
    "https://i.redd.it/fioinuzhbzog1.png": {
        "title_ru": "Claude исполнилось 3 года!",
        "description_ru": "Anthropic отмечает третий день рождения Claude. От первой версии до Opus 4.6 с 1М контекстом — за три года модель прошла путь от чат-бота до агентской платформы.",
        "action": "Оцени, как изменился твой workflow за эти 3 года. Что Claude делает сейчас, что было невозможно год назад?",
    },
    "https://i.redd.it/c6xcxjvxkyog1.jpeg": {
        "title_ru": "Промпт-инженер — мем дня",
        "description_ru": "Юмористическая картинка из r/vibecoding про промпт-инженеров. Классический мем о том, как выглядит «программирование» в 2026 году.",
        "action": "Сохрани для контента в соцсетях AiPlus — тема промпт-инженерии хорошо заходит у аудитории.",
    },
    "https://i.redd.it/60elqqwixuog1.jpeg": {
        "title_ru": "Opus теперь по умолчанию с 1М контекстом",
        "description_ru": "Скриншот из терминала: Opus автоматически переключился на 1 миллион токенов контекста. «В 5 раз больше места, та же цена» — главный апдейт недели для пользователей Claude Code.",
        "action": "Открой терминал и убедись, что твой Claude Code уже обновился до 1М. Если нет — обнови CLI.",
    },
    "https://i.redd.it/g2h37iipevog1.png": {
        "title_ru": "claude-code-best-practice — 15K звёзд на GitHub Trending",
        "description_ru": "Репозиторий с лучшими практиками Claude Code вышел в тренды GitHub (месячный рейтинг). 15 000 звёзд. Содержит советы по workflow, скиллам и промптам от создателя и сообщества.",
        "action": "Загляни в репо и сравни с твоим CLAUDE.md. Возможно, найдёшь новые скиллы или паттерны для workflow.",
    },
    "https://reddit.com/r/ClaudeAI/comments/1rsvfv5/claudeai_inline_visualiserwidget_is_pretty_cool/": {
        "title_ru": "Встроенные визуализации в Claude.ai — впечатляет",
        "description_ru": "Новое обновление Claude позволяет создавать интерактивные визуализации прямо в чате. Кнопки и виджеты могут отправлять сообщения в диалог. Полезно для быстрого прототипирования UI.",
        "action": "Попробуй попросить Claude визуализировать воронку студентов AiPlus прямо в чате — быстрый способ получить инсайты без дашборда.",
    },
    "https://i.redd.it/liropl7p3wog1.png": {
        "title_ru": "Перекрёстная проверка моделей — Claude самый строгий критик",
        "description_ru": "Пользователь проверяет выходные данные одной модели через другую, чтобы отсеять «восторженные» но бесполезные предложения. Claude оказался самым критичным ревьюером из всех.",
        "action": "Добавь в свой workflow шаг: после генерации кода одним агентом — отправляй на ревью другому. Claude Code уже поддерживает это через Agent Teams.",
    },
    "https://i.redd.it/vhhmdep0qyog1.png": {
        "title_ru": "1М контекст — самая ожидаемая фича, наконец здесь",
        "description_ru": "Ещё один пост о запуске миллионного контекстного окна. Сообщество в восторге — это была самая запрашиваемая функция для Claude.",
        "action": "Контекст уже есть — начни использовать. Загрузи крупный файл или документацию и оцени качество ответов.",
    },
    "https://i.redd.it/usm28vsj3yog1.jpeg": {
        "title_ru": "Claude ведёт себя как мой учитель",
        "description_ru": "Пользователь, который годами использовал ChatGPT, впервые попробовал Claude и поразился разнице: Claude не просто отвечает, а учит думать. Пост набрал много откликов в r/ClaudeAI.",
        "action": "Используй этот инсайт для маркетинга AiPlus: AI как наставник, а не просто инструмент — такой нарратив резонирует.",
    },
    "https://reddit.com/r/vibecoding/comments/1rt4r7z/a_founder_vibecoded_his_entire_saas_with_ai/": {
        "title_ru": "Фаундер собрал SaaS на вайб-кодинге — хакеры украли $87,500",
        "description_ru": "Реальный случай: основатель использовал Claude Code для сборки стартапа без тестов и security review. Хакеры нашли ключи Stripe во фронтенде и списали с 175 клиентов по $500. Фикс был бы одной строкой в промпте: «Никогда не выноси секреты на клиент».",
        "action": "Прямо сейчас проверь Qadam: grep -r 'STRIPE\\|SECRET\\|API_KEY' в frontend-коде. Убедись, что все секреты в .env и не попадают в бандл.",
    },
    "https://twitter.com/Gavriel_Cohen/status/2020701159175155874": {
        "title_ru": "NanoClaw — рои агентов Claude в контейнерах",
        "description_ru": "NanoClaw добавил поддержку Agent Swarms: несколько экземпляров Claude работают параллельно в изолированных контейнерах. Релевантно для масштабирования агентских задач.",
        "action": "Если используешь агентов для параллельных задач — посмотри NanoClaw как альтернативу Agent Teams для CI/CD пайплайнов.",
    },
    "https://reddit.com/r/vibecoding/comments/1rti51a/venting_about_ai_coding_hype/": {
        "title_ru": "Разрыв между хайпом AI-кодинга и реальностью",
        "description_ru": "Опытный разработчик и power user AI делится разочарованием: маркетинг обещает «код за секунды», а реальность — это часы отладки, нестабильные результаты и костыли. При этом автор не против AI, он за честные ожидания.",
        "action": "Перечитай и откалибруй ожидания команды от AI-инструментов. Честность = меньше разочарований.",
    },
    "https://claudeskills.cc": {
        "title_ru": "ClaudeSkills.cc — маркетплейс навыков для Claude",
        "description_ru": "Платформа для обмена, поиска и переиспользования скиллов Claude и OpenAI агентов. Можно найти готовые скиллы для своего workflow.",
        "action": "Зайди на claudeskills.cc и найди скиллы для FastAPI, React или PostgreSQL — возможно, кто-то уже сделал то, что тебе нужно.",
    },
    "https://reddit.com/r/vibecoding/comments/1rt1gcv/got_my_first_paying_customer_opened_stripe_50/": {
        "title_ru": "Первый платящий клиент: $50 в Stripe — и вот ты уже саппорт",
        "description_ru": "Инди-разработчик 6 месяцев строил, 5 месяцев маркетил. Массовый контент не работал — помогли истории вместо питчей. Первый клиент заплатил $50 — и тут же пришёл баг-репорт. Реальность инди-хакерства.",
        "action": "Запомни для AiPlus: истории студентов работают лучше рекламных питчей. Собери 3-5 кейсов и используй в Meta Ads.",
    },
    "https://reddit.com/r/vibecoding/comments/1rsyhsr/whats_going_on_with_selfpromtion_rules_why_not/": {
        "title_ru": "r/vibecoding тонет в самопиаре — где полезный контент?",
        "description_ru": "Пользователь жалуется: сабреддит r/vibecoding превратился в площадку самопродвижения. Полезные советы теряются среди постов «What are you building?». Предлагают мегатред для самопиара.",
        "action": "Если постишь в r/vibecoding — делай полезные посты, не рекламные. Это работает и для бренда AiPlus.",
    },
    "https://www.westernmt.news/2025/04/21/montana-leads-the-nation-with-groundbreaking-right-to-compute-act/": {
        "title_ru": "Монтана приняла закон о праве на вычисления",
        "description_ru": "Штат Монтана первым в США принял Right to Compute Act. Закон защищает право граждан на использование вычислительных ресурсов без ограничений. 135 очков на HN, 89 комментариев.",
        "action": "Следи за подобным законодательством — оно может повлиять на доступность облачных GPU для AI-задач.",
    },
    "https://techcrunch.com/2026/03/14/how-to-use-the-new-chatgpt-app-integrations-including-doordash-spotify-uber-and-others/": {
        "title_ru": "ChatGPT получил интеграции с DoorDash, Spotify, Uber и другими",
        "description_ru": "OpenAI запустил App Integrations: теперь из ChatGPT можно управлять Spotify, Canva, Figma, Expedia и другими сервисами напрямую. Это шаг к AI как универсальному интерфейсу.",
        "action": "Подумай: какие интеграции были бы полезны для студентов AiPlus? Если ChatGPT станет «операционной системой» — как это влияет на учебные программы?",
    },
    "https://github.com/linshenkx/prompt-optimizer": {
        "title_ru": "prompt-optimizer — инструмент для улучшения промптов",
        "description_ru": "Open-source инструмент для оптимизации промптов. Поддерживает Web, десктоп, Chrome-расширение и Docker. Помогает писать более качественные промпты для AI — полезно для стандартизации промптов в команде.",
        "action": "Попробуй prompt-optimizer для стандартизации промптов в CLAUDE.md и скиллах. Chrome-расширение удобно для быстрой проверки.",
    },
    "https://unplannedobsolescence.com/blog/xml-cheap-dsl/": {
        "title_ru": "XML как дешёвый DSL",
        "description_ru": "Автор аргументирует: XML — это готовый domain-specific language, который не требует написания парсера. 182 очка на HN. Для тех, кто проектирует конфиги и промпты — интересный угол зрения.",
        "action": "Если проектируешь формат данных для Qadam (конфиги, шаблоны) — подумай: может, XML/YAML проще кастомного формата?",
    },
    "https://www.tomshardware.com/pc-components/ram/fake-ram-bundled-with-real-ram-to-create-a-performance-illusion-for-amd-users-1-1-value-pack-offers-desperate-psychological-relief-as-the-memory-shortage-worsens": {
        "title_ru": "Поддельная RAM в комплекте с настоящей — новый вид мошенничества",
        "description_ru": "Tom's Hardware обнаружил: продавцы комплектуют настоящую планку RAM с фейковой для «иллюзии производительности» на AMD-системах. Дефицит памяти порождает креативные схемы обмана.",
        "action": "Если закупаешь серверное железо — проверяй поставщиков вдвойне. Дефицит RAM — реальная проблема.",
    },
}


# ── TL;DR ─────────────────────────────────────────────────────────────────────

TLDR = [
    "MCP-сервер экономит 98% контекста Claude Code → Подключи к своим проектам для x50 экономии на длинных сессиях",
    "Claude получил 1М контекст по стандартной цене → Загружай весь кодбейс Qadam целиком, без потери контекста",
    "Meta планирует уволить 20% ради AI → Готовься к полной автоматизации таргетинга в Ads Manager",
]


# ── HTML-генерация ────────────────────────────────────────────────────────────

def esc(text: str) -> str:
    """Экранирование HTML."""
    return escape(text, quote=True)


def truncate_at_word(text: str, max_len: int) -> str:
    """Обрезает текст по границе слова."""
    if len(text) <= max_len:
        return text
    truncated = text[:max_len]
    last_space = truncated.rfind(" ")
    if last_space > max_len // 2:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:!? ") + "..."


def classify_tag(title: str, description: str) -> tuple:
    """Возвращает (emoji, label, css_class) для карточки."""
    text = (title + " " + description).lower()
    if any(k in text for k in ["meta ads", "facebook ads", "fb ads", "advantage+",
                                 "мета", "рекламн", "ads manager", "увольнен", "кампани"]):
        return ("💼", "META", "biz")
    if any(k in text for k in ["claude", "anthropic", "mcp", "agent", "agentic",
                                 "opus", "sonnet", "контекст", "агент", "claude code"]):
        return ("🤖", "AGENT", "agent")
    if any(k in text for k in ["tool", "github", "sdk", "repo", "optimizer",
                                 "инструмент", "репозиторий"]):
        return ("🛠", "TOOL", "tool")
    if any(k in text for k in ["vibe", "вайб", "кодинг", "coding",
                                 "промпт", "prompt"]):
        return ("🧠", "AI", "ai")
    if any(k in text for k in ["money", "revenue", "saas", "stripe", "$",
                                 "paying", "платящ", "доход"]):
        return ("💰", "MONEY", "money")
    if any(k in text for k in ["openai", "chatgpt", "gpt"]):
        return ("🧠", "AI", "ai")
    return ("🧠", "AI", "ai")


def build_full_card(item: dict, card_id: str) -> str:
    """Полноразмерная карточка."""
    enrichment = ENRICHMENTS.get(item["url"], {})
    title = enrichment.get("title_ru", item.get("title", ""))
    desc = enrichment.get("description_ru", item.get("description", "") or "")
    action = enrichment.get("action", "Открой ссылку и оцени применимость для AiPlus.")
    url = item["url"]
    source = item.get("source", "")

    tag_e, tag_l, tag_c = classify_tag(title, desc)
    category = f"{tag_e} {tag_l}"

    return f'''
<div class="card" data-card-id="{card_id}" data-card-title="{esc(title)}" data-card-category="{esc(category)}">
  <div class="card-num"><span class="tag {tag_c}">{tag_e} {tag_l}</span></div>
  <div class="card-title">{esc(title)}</div>
  <div class="card-text">{esc(desc)}</div>
  <div class="card-action">
    <div class="card-action-label">Одно действие</div>
    <div class="card-action-text">{esc(action)}</div>
  </div>
  <div class="card-source"><a href="{esc(url)}" target="_blank" rel="noopener">{esc(source)}</a></div>
  <div class="feedback-buttons">
    <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
    <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
  </div>
</div>'''


def build_accordion_card(item: dict, card_id: str) -> str:
    """Accordion-карточка для новостей."""
    enrichment = ENRICHMENTS.get(item["url"], {})
    title = enrichment.get("title_ru", item.get("title", ""))
    desc = enrichment.get("description_ru", item.get("description", "") or "")
    action = enrichment.get("action", "Открой ссылку и оцени применимость для AiPlus.")
    url = item["url"]
    source = item.get("source", "")

    tag_e, tag_l, tag_c = classify_tag(title, desc)
    category = f"{tag_e} {tag_l}"
    preview = truncate_at_word(desc, 120)

    return f'''
<details class="accordion-card" data-card-id="{card_id}" data-card-title="{esc(title)}" data-card-category="{esc(category)}">
  <summary class="accordion-summary">
    <span class="tag {tag_c}">{tag_e} {tag_l}</span>
    <div class="accordion-summary-content">
      <div class="accordion-card-title">{esc(title)}</div>
      <div class="accordion-card-preview">{esc(preview)}</div>
    </div>
    <div class="accordion-chevron">▼</div>
  </summary>
  <div class="accordion-body">
    <div class="card-text">{esc(desc)}</div>
    <div class="card-action">
      <div class="card-action-label">Применить</div>
      <div class="card-action-text">{esc(action)}</div>
    </div>
    <div class="card-source"><a href="{esc(url)}" target="_blank" rel="noopener">{esc(source)}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>'''


def build_risk_card(item: dict, card_id: str) -> str:
    """Карточка контр-сигнала."""
    enrichment = ENRICHMENTS.get(item["url"], {})
    title = enrichment.get("title_ru", item.get("title", ""))
    desc = enrichment.get("description_ru", item.get("description", "") or "")
    risk_text = enrichment.get("risk_text", title[:100])
    url = item["url"]
    source = item.get("source", "")

    preview = truncate_at_word(desc, 120)

    return f'''
<details class="accordion-card counter-signal" data-card-id="{card_id}" data-card-title="{esc(title)}" data-card-category="⚠️ КОНТР-СИГНАЛ">
  <summary class="accordion-summary">
    <span class="tag risk">⚠️ РИСК</span>
    <div class="accordion-summary-content">
      <div class="accordion-card-title">{esc(title)}</div>
      <div class="accordion-card-preview">{esc(preview)}</div>
    </div>
    <div class="accordion-chevron">▼</div>
  </summary>
  <div class="accordion-body">
    <div class="card-text">{esc(desc)}</div>
    <div class="card-risk">
      <div class="card-risk-label">Контр-сигнал</div>
      <div class="card-risk-text">{esc(risk_text)}</div>
    </div>
    <div class="card-source"><a href="{esc(url)}" target="_blank" rel="noopener">{esc(source)}</a></div>
    <div class="feedback-buttons">
      <button class="feedback-btn" data-card-id="{card_id}" data-action="like">👍</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="dislike">👎</button>
      <button class="feedback-btn" data-card-id="{card_id}" data-action="backlog">📋 В бэклог</button>
    </div>
  </div>
</details>'''


# ── Главная логика ────────────────────────────────────────────────────────────

def main():
    # 1. Читаем collected.json
    print(f"📖 Читаю {COLLECTED_PATH}...", file=sys.stderr)
    with open(COLLECTED_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_items = data.get("_raw_items", {})
    if not raw_items:
        print("⚠ Нет _raw_items в collected.json!", file=sys.stderr)
        sys.exit(1)

    # 2. Генерируем HTML для каждой секции
    sections_html = {}

    # agent_cards — полноразмерные
    agent_parts = []
    for i, item in enumerate(raw_items.get("agent_cards", []), 1):
        agent_parts.append(build_full_card(item, f"agent_{i}"))
    sections_html["agent_cards"] = "\n".join(agent_parts) or "<!-- нет данных -->"

    # meta_cards — полноразмерные
    meta_parts = []
    for i, item in enumerate(raw_items.get("meta_cards", []), 1):
        meta_parts.append(build_full_card(item, f"meta_{i}"))
    sections_html["meta_cards"] = "\n".join(meta_parts) or "<!-- нет данных -->"

    # content_cards — полноразмерные (пустая секция)
    content_parts = []
    for i, item in enumerate(raw_items.get("content_cards", []), 1):
        content_parts.append(build_full_card(item, f"content_{i}"))
    sections_html["content_cards"] = "\n".join(content_parts) or "<!-- нет данных -->"

    # cdp_cards — полноразмерные (пустая секция)
    cdp_parts = []
    for i, item in enumerate(raw_items.get("cdp_cards", []), 1):
        cdp_parts.append(build_full_card(item, f"cdp_{i}"))
    sections_html["cdp_cards"] = "\n".join(cdp_parts) or "<!-- нет данных -->"

    # implement_cards — полноразмерные
    impl_parts = []
    for i, item in enumerate(raw_items.get("implement_cards", []), 1):
        impl_parts.append(build_full_card(item, f"impl_{i}"))
    sections_html["implement_cards"] = "\n".join(impl_parts) or "<!-- нет данных -->"

    # news_cards — accordion
    news_parts = []
    for i, item in enumerate(raw_items.get("news_cards", []), 1):
        news_parts.append(build_accordion_card(item, f"card_{i}"))
    sections_html["news_cards"] = "\n".join(news_parts) or "<!-- нет данных -->"

    # counter_signal — risk cards
    risk_parts = []
    for i, item in enumerate(raw_items.get("counter_signal", []), 1):
        risk_parts.append(build_risk_card(item, f"risk_{i}"))
    sections_html["counter_signal"] = "\n".join(risk_parts) or "<!-- нет данных -->"

    # 3. Считаем статистику
    total_cards = sum(len(v) for v in raw_items.values())
    read_time = max(5, total_cards // 2)

    # 4. Формируем enriched.json
    enriched = {
        "date": DATE,
        "date_title": DATE_TITLE,
        "items_count": str(total_cards),
        "read_time": str(read_time),
        "tldr": TLDR,
        "agent_cards": sections_html["agent_cards"],
        "meta_cards": sections_html["meta_cards"],
        "content_cards": sections_html["content_cards"],
        "cdp_cards": sections_html["cdp_cards"],
        "news_cards": sections_html["news_cards"],
        "implement_cards": sections_html["implement_cards"],
        "counter_signal": sections_html["counter_signal"],
        "_stats": {
            "agent": len(raw_items.get("agent_cards", [])),
            "meta": len(raw_items.get("meta_cards", [])),
            "content": len(raw_items.get("content_cards", [])),
            "cdp": len(raw_items.get("cdp_cards", [])),
            "implement": len(raw_items.get("implement_cards", [])),
            "news": len(raw_items.get("news_cards", [])),
            "risk": len(raw_items.get("counter_signal", [])),
            "total": total_cards,
        },
        "_enriched": True,
        "_mode": "noapi",
    }

    # 5. Сохраняем enriched.json
    with open(ENRICHED_PATH, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    print(f"✅ Сохранён: {ENRICHED_PATH}", file=sys.stderr)

    # 6. Генерируем HTML из шаблона
    print(f"📄 Генерирую HTML из {TEMPLATE_PATH}...", file=sys.stderr)
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    # Обрезаем комментарии после </html>
    idx = template.find("</html>")
    if idx > -1:
        template = template[: idx + len("</html>")]

    # TL;DR
    tldr_html = "\n        ".join(f"<li>{esc(item)}</li>" for item in TLDR)

    # Подстановка
    html = template
    html = html.replace("{{DATE}}", DATE)
    html = html.replace("{{DATE_TITLE}}", DATE_TITLE)
    html = html.replace("{{CARD_COUNT}}", str(total_cards))
    html = html.replace("{{ITEMS_COUNT}}", str(total_cards))
    html = html.replace("{{READ_TIME}}", str(read_time))
    html = html.replace("{{TLDR_ITEMS}}", tldr_html)
    html = html.replace("{{TLDR}}", tldr_html)
    html = html.replace("{{AGENT_CARDS}}", sections_html["agent_cards"])
    html = html.replace("{{META_CARDS}}", sections_html["meta_cards"])
    html = html.replace("{{CONTENT_CARDS}}", sections_html["content_cards"])
    html = html.replace("{{CDP_CARDS}}", sections_html["cdp_cards"])
    html = html.replace("{{NEWS_CARDS}}", sections_html["news_cards"])
    html = html.replace("{{IMPLEMENT_CARDS}}", sections_html["implement_cards"])
    html = html.replace("{{COUNTER_SIGNAL}}", sections_html["counter_signal"])

    # Сохраняем HTML
    os.makedirs(DAILY_DIR, exist_ok=True)
    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html + "\n")
    print(f"✅ Дайджест: {OUTPUT_HTML}", file=sys.stderr)

    # 7. Обновляем index.html
    update_index()

    # 8. Статистика
    print(f"\n📊 Итого:", file=sys.stderr)
    print(f"  Карточек: {total_cards}", file=sys.stderr)
    print(f"  Время чтения: {read_time} мин", file=sys.stderr)
    print(f"  TL;DR: {len(TLDR)} пунктов", file=sys.stderr)
    print(f"  Режим: noapi (переводы захардкожены)", file=sys.stderr)
    for section, items in raw_items.items():
        enriched_count = sum(1 for item in items if item["url"] in ENRICHMENTS)
        print(f"  {section}: {len(items)} карточек, {enriched_count} обогащено", file=sys.stderr)


def update_index():
    """Обновляет index.html — заменяет запись для 2026-03-15 с актуальными данными."""
    print(f"📝 Обновляю {INDEX_PATH}...", file=sys.stderr)

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        index_html = f.read()

    # Проверяем, есть ли уже запись для этой даты
    if f'data-digest-date="{DATE}"' in index_html:
        # Заменяем существующую запись
        # Находим блок от <!-- 15 марта --> до следующего <!-- или </div>
        pattern = (
            r'<!-- 15 марта 2026 -->\s*'
            r'<a href="daily/2026-03-15\.html".*?</a>'
        )
        new_entry = f'''<!-- 15 марта 2026 -->
    <a href="daily/2026-03-15.html" class="digest-card fade-in-up" data-digest-date="2026-03-15">
      <div class="digest-card-top">
        <span class="digest-date">15 МАР 2026</span>
        <span class="badge-new">NEW</span>
        <span class="digest-likes" style="display:none;font-size:12px;color:#22c55e;font-weight:600;"></span>
      </div>
      <div class="digest-title">MCP -98% контекста, 1М окно для Claude, Meta увольняет 20% ради AI</div>
      <div class="digest-desc">Вайб-кодинг под вопросом, мартовский сбой Meta Ads, фаундер потерял $87.5K из-за хакеров</div>
      <div class="digest-stats">
        <span class="digest-stat">33 карточки</span>
        <span class="digest-stat">16 мин</span>
      </div>
    </a>'''

        updated = re.sub(pattern, new_entry, index_html, flags=re.DOTALL)
        if updated != index_html:
            with open(INDEX_PATH, "w", encoding="utf-8") as f:
                f.write(updated)
            print(f"✅ index.html обновлён", file=sys.stderr)
        else:
            print(f"⚠ Не удалось найти паттерн для замены в index.html, пропускаю", file=sys.stderr)
    else:
        print(f"⚠ Запись для {DATE} не найдена в index.html, пропускаю", file=sys.stderr)


if __name__ == "__main__":
    main()

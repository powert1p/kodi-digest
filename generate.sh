#!/bin/bash
# === Генератор дайджеста из шаблона ===
# Использование: ./generate.sh YYYY-MM-DD [content.json]
#
# Два режима:
#   1) ./generate.sh 2026-03-15            — создаёт заготовку с плейсхолдерами
#   2) ./generate.sh 2026-03-15 content.json — заполняет контентом из JSON
#
# Формат content.json:
# {
#   "date_title": "15 марта 2026",
#   "items_count": "20",
#   "read_time": "10",
#   "tldr": ["Пункт 1", "Пункт 2", "Пункт 3"],
#   "agent_cards": "<html карточки>",
#   "news_cards": "<html карточки>",
#   "implement_cards": "<html карточки>",
#   "counter_signal": "<html карточки>"
# }
#
# Вызывается Коди при heartbeat для генерации ежедневного дайджеста.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/TEMPLATE.html"
OUTPUT_DIR="$SCRIPT_DIR/daily"

# --- Проверка аргументов ---
if [ $# -lt 1 ]; then
  echo "Использование: $0 YYYY-MM-DD [content.json]"
  echo ""
  echo "Примеры:"
  echo "  $0 2026-03-15                  # заготовка с плейсхолдерами"
  echo "  $0 2026-03-15 content.json     # заполнить контентом"
  exit 1
fi

DATE="$1"
CONTENT_FILE="${2:-}"

# Валидация формата даты
if ! echo "$DATE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  echo "Ошибка: дата должна быть в формате YYYY-MM-DD (получено: $DATE)"
  exit 1
fi

# Проверка шаблона
if [ ! -f "$TEMPLATE" ]; then
  echo "Ошибка: шаблон не найден: $TEMPLATE"
  exit 1
fi

# Создать директорию если нет
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/$DATE.html"

# --- Русская дата ---
format_date_ru() {
  local date_str="$1"
  local year month day
  year=$(echo "$date_str" | cut -d'-' -f1)
  month=$(echo "$date_str" | cut -d'-' -f2)
  day=$(echo "$date_str" | cut -d'-' -f3 | sed 's/^0//')

  local months=("" "января" "февраля" "марта" "апреля" "мая" "июня" "июля" "августа" "сентября" "октября" "ноября" "декабря")
  local month_num=$((10#$month))

  echo "$day ${months[$month_num]} $year"
}

DATE_TITLE=$(format_date_ru "$DATE")

# --- Режим 1: Заготовка ---
if [ -z "$CONTENT_FILE" ]; then
  echo "Создаю заготовку для $DATE_TITLE..."

  # Копировать шаблон и заменить базовые плейсхолдеры
  sed \
    -e "s|{{DATE}}|$DATE|g" \
    -e "s|{{DATE_TITLE}}|$DATE_TITLE|g" \
    -e "s|{{ITEMS_COUNT}}|0|g" \
    -e "s|{{READ_TIME}}|0|g" \
    -e "s|{{TLDR}}|<li>TODO: пункт 1</li>\n        <li>TODO: пункт 2</li>\n        <li>TODO: пункт 3</li>|g" \
    -e "s|{{AGENT_CARDS}}|<!-- TODO: добавить 3-5 карточек агентов -->|g" \
    -e "s|{{NEWS_CARDS}}|<!-- TODO: добавить 15-20 карточек новостей -->|g" \
    -e "s|{{IMPLEMENT_CARDS}}|<!-- TODO: добавить 3-5 карточек внедрения -->|g" \
    -e "s|{{COUNTER_SIGNAL}}|<!-- TODO: добавить 1-2 контр-сигнала -->|g" \
    -e "s|{{META_CARDS}}|<!-- TODO: добавить 2-3 карточки Meta/FB -->|g" \
    -e "s|{{CONTENT_CARDS}}|<!-- TODO: добавить 2-3 карточки контента -->|g" \
    -e "s|{{CDP_CARDS}}|<!-- TODO: добавить 1-2 карточки CDP -->|g" \
    "$TEMPLATE" > "$OUTPUT_FILE"

  # Убрать комментарии с шаблонами карточек (всё после закрывающего </html>)
  # Используем Python для надёжности
  python3 -c "
import sys
with open('$OUTPUT_FILE', 'r') as f:
    content = f.read()
# Обрезать всё после закрывающего </html>
idx = content.find('</html>')
if idx > -1:
    content = content[:idx + len('</html>')]
with open('$OUTPUT_FILE', 'w') as f:
    f.write(content + '\n')
"

  echo "Заготовка создана: $OUTPUT_FILE"
  echo "Заполни контент и обнови index.html"
  exit 0
fi

# --- Режим 2: Заполнение из JSON ---
if [ ! -f "$CONTENT_FILE" ]; then
  echo "Ошибка: файл контента не найден: $CONTENT_FILE"
  exit 1
fi

echo "Генерирую дайджест для $DATE_TITLE из $CONTENT_FILE..."

# Экспортируем переменные чтобы Python heredoc мог читать их через os.environ
export DATE DATE_TITLE ITEMS_COUNT READ_TIME CONTENT_FILE TEMPLATE OUTPUT_FILE

# Используем Python для парсинга JSON и генерации HTML
python3 << 'PYTHON_SCRIPT'
import json
import sys
import os

date = os.environ.get('DATE', '')
date_title = os.environ.get('DATE_TITLE', '')
content_file = os.environ.get('CONTENT_FILE', '')
template_file = os.environ.get('TEMPLATE', '')
output_file = os.environ.get('OUTPUT_FILE', '')

# Загрузить контент
with open(content_file, 'r', encoding='utf-8') as f:
    content = json.load(f)

# Загрузить шаблон
with open(template_file, 'r', encoding='utf-8') as f:
    template = f.read()

# Обрезать комментарии после </html>
idx = template.find('</html>')
if idx > -1:
    template = template[:idx + len('</html>')]

# Собрать TL;DR
tldr_items = content.get('tldr', [])
tldr_html = '\n        '.join(f'<li>{item}</li>' for item in tldr_items)

# Подставить плейсхолдеры
result = template
result = result.replace('{{DATE}}', date)
result = result.replace('{{DATE_TITLE}}', content.get('date_title', date_title))
# Поддержка обоих вариантов плейсхолдера для счётчика карточек
items_count = str(content.get('items_count', len(tldr_items)))
result = result.replace('{{ITEMS_COUNT}}', items_count)
result = result.replace('{{CARD_COUNT}}', items_count)
result = result.replace('{{READ_TIME}}', str(content.get('read_time', '10')))
# Поддержка обоих вариантов плейсхолдера для TL;DR
result = result.replace('{{TLDR}}', tldr_html)
result = result.replace('{{TLDR_ITEMS}}', tldr_html)
result = result.replace('{{AGENT_CARDS}}', content.get('agent_cards', '<!-- нет карточек -->'))
result = result.replace('{{NEWS_CARDS}}', content.get('news_cards', '<!-- нет карточек -->'))
result = result.replace('{{IMPLEMENT_CARDS}}', content.get('implement_cards', '<!-- нет карточек -->'))
result = result.replace('{{COUNTER_SIGNAL}}', content.get('counter_signal', '<!-- нет карточек -->'))
# Дополнительные секции шаблона
result = result.replace('{{META_CARDS}}', content.get('meta_cards', '<!-- нет карточек -->'))
result = result.replace('{{CONTENT_CARDS}}', content.get('content_cards', '<!-- нет карточек -->'))
result = result.replace('{{CDP_CARDS}}', content.get('cdp_cards', '<!-- нет карточек -->'))

# Записать результат
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(result + '\n')

print(f"Дайджест создан: {output_file}")
print(f"  Дата: {content.get('date_title', date_title)}")
print(f"  TL;DR: {len(tldr_items)} пунктов")
print(f"  Не забудь обновить index.html!")
PYTHON_SCRIPT

echo ""
echo "Готово! Следующие шаги:"
echo "  1. Проверь $OUTPUT_FILE в браузере"
echo "  2. Добавь ссылку в index.html"
echo "  3. git add && git commit && git push"

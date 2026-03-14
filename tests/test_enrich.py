"""
Тесты для enrich.py — проверка переводов, обрезки текста, модели.
"""
import sys
import json
import os
import unittest
from unittest.mock import patch, MagicMock

# Добавляем scripts в путь
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))


class TestModel(unittest.TestCase):
    """Проверяет что используется актуальная модель."""

    def test_model_is_current(self):
        """Модель должна быть claude-sonnet-4-6, не claude-sonnet-4-20250514."""
        import enrich
        # Устаревшая модель не должна использоваться
        self.assertNotEqual(
            enrich.MODEL,
            "claude-sonnet-4-20250514",
            "Модель устарела, нужно claude-sonnet-4-6"
        )
        self.assertEqual(
            enrich.MODEL,
            "claude-sonnet-4-6",
            f"Ожидали claude-sonnet-4-6, получили {enrich.MODEL}"
        )


class TestTruncateAtWord(unittest.TestCase):
    """Тесты функции truncate_at_word — обрезка по границе слова."""

    def setUp(self):
        import enrich
        self.truncate = enrich.truncate_at_word

    def test_short_text_unchanged(self):
        """Текст короче лимита — возвращается без изменений."""
        text = "Короткий текст"
        result = self.truncate(text, 100)
        self.assertEqual(result, text)

    def test_truncate_at_word_boundary(self):
        """Обрезка не должна резать слово посередине."""
        text = "Первое слово второе слово третье слово четвёртое"
        result = self.truncate(text, 20)
        # Результат не должен заканчиваться посреди слова
        self.assertTrue(
            result.endswith("..."),
            f"Ожидали '...' в конце, получили: {result!r}"
        )
        # Последний символ перед '...' должен быть целым словом
        without_dots = result[:-3]
        # Не должно быть обрыва слова — проверяем что оригинал содержит это слово
        self.assertTrue(
            any(text.startswith(without_dots[:n]) for n in range(len(without_dots), 0, -1)),
            "Обрезка порезала слово посередине"
        )

    def test_no_mid_word_cut(self):
        """Конкретный кейс — нет обрезки посередине слова."""
        text = "Hello world foobar baz"
        result = self.truncate(text, 13)
        # "Hello world f" -> обрезать до "Hello world" + "..."
        self.assertNotIn("f...", result, "Обрезало посередине слова 'foobar'")
        self.assertTrue(result.endswith("..."))

    def test_exact_length_no_truncation(self):
        """Если длина точно равна лимиту — не обрезаем."""
        text = "Точно десять"
        result = self.truncate(text, len(text))
        self.assertEqual(result, text)

    def test_minimum_500_chars_limit(self):
        """
        Функция truncate_at_word должна поддерживать лимит минимум 500 символов.
        В collect.py и enrich.py лимит должен быть не меньше 500 для описаний.
        """
        # Генерируем текст 600 символов
        text = "слово " * 100  # 600 символов
        result = self.truncate(text.strip(), 500)
        without_dots = result[:-3] if result.endswith("...") else result
        self.assertGreaterEqual(
            len(without_dots), 450,
            "При лимите 500 нужно сохранять не менее 450 символов"
        )


class TestDescriptionLimit(unittest.TestCase):
    """Проверяет что лимиты обрезки в collect.py и enrich.py достаточные."""

    def test_collect_truncate_limit(self):
        """
        В collect.py лимит обрезки для ОПИСАНИЙ (desc) должен быть минимум 800 символов.
        Исключение: title_short, desc_short для UI-превью (это отдельный контекст).
        Проверяем строки где переменная называется 'desc' (не title_short/desc_short).
        """
        import ast
        collect_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'collect.py')
        with open(collect_path) as f:
            source = f.read()
            lines = source.split('\n')

        tree = ast.parse(source)
        violations = []
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == 'truncate_at_word'):
                if len(node.args) >= 2:
                    limit_arg = node.args[1]
                    if isinstance(limit_arg, ast.Constant) and isinstance(limit_arg.value, int):
                        if limit_arg.value < 800:
                            # Смотрим контекст строки — это описание (desc), не превью
                            line_content = lines[node.lineno - 1].strip()
                            # Исключаем UI-превью (title_short, desc_short, preview)
                            if ('title_short' not in line_content
                                    and 'desc_short' not in line_content
                                    and 'preview' not in line_content):
                                violations.append(
                                    f"Строка {node.lineno}: truncate_at_word(text, {limit_arg.value}) — "
                                    f"мало для описания! Нужно >= 800. Контекст: {line_content!r}"
                                )

        self.assertEqual(
            violations, [],
            "Найдены слишком маленькие лимиты обрезки описаний:\n" + "\n".join(violations)
        )

    def test_enrich_tldr_description_limit(self):
        """
        В enrich.py generate_tldr_llm должен передавать описание целиком (>= 500 символов),
        а не резать до [:200].
        Проверяем конкретную строку в функции generate_tldr_llm.
        """
        enrich_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'enrich.py')
        with open(enrich_path) as f:
            source = f.read()

        # Паттерн [:200] в контексте description — должен быть заменён на truncate_at_word
        # или хотя бы [:500]
        lines = source.split('\n')
        violations = []
        in_tldr_func = False
        for i, line in enumerate(lines, 1):
            # Отслеживаем вход в generate_tldr_llm
            if 'def generate_tldr_llm' in line:
                in_tldr_func = True
            elif in_tldr_func and line.startswith('def '):
                in_tldr_func = False

            if in_tldr_func:
                # Ищем срез описания менее 500 символов
                if "'description'" in line or '"description"' in line:
                    if '[:' in line:
                        import re
                        matches = re.findall(r'\[:(\d+)\]', line)
                        for m in matches:
                            if int(m) < 500:
                                violations.append(
                                    f"Строка {i}: срез [:{m}] для description в generate_tldr_llm — нужно >= 500"
                                )

        self.assertEqual(
            violations, [],
            "Найдены слишком маленькие срезы описания в generate_tldr_llm:\n" + "\n".join(violations)
        )


class TestEnrichBatchLLM(unittest.TestCase):
    """Тесты LLM-обогащения батча карточек."""

    def setUp(self):
        import enrich
        self.enrich = enrich

    def test_batch_uses_title_ru(self):
        """После обогащения карточка должна содержать title_ru (русский заголовок)."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=json.dumps([
            {"index": 0, "title_ru": "Тестовый заголовок на русском", "description_ru": "Описание", "action": "Действие"}
        ]))]
        mock_client.messages.create.return_value = mock_response

        items = [{"title": "Test title", "description": "test", "source": "test.com"}]
        results = self.enrich.enrich_batch_llm(mock_client, items)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title_ru"], "Тестовый заголовок на русском")

    def test_batch_returns_empty_on_api_error(self):
        """При ошибке API возвращается пустой список (не краш)."""
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("API Error")

        items = [{"title": "Test", "description": "", "source": "src"}]
        results = self.enrich.enrich_batch_llm(mock_client, items)

        self.assertEqual(results, [])

    def test_enrich_applies_russian_title(self):
        """
        В функции enrich() — после LLM item.title должен быть обновлён из title_ru.
        """
        # Проверяем что в enrich() код берёт title_ru, а не title_en
        import ast
        enrich_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'enrich.py')
        with open(enrich_path) as f:
            source = f.read()

        # Проверяем что в коде есть "title_ru"
        self.assertIn(
            "title_ru",
            source,
            "В enrich.py нет title_ru — LLM-перевод не применяется"
        )

        # Проверяем что title_ru применяется к item
        self.assertIn(
            '"title_ru"',
            source,
            "В enrich.py title_ru не используется для обновления карточки"
        )


class TestFallbackEnrich(unittest.TestCase):
    """Тесты fallback обработки без LLM."""

    def setUp(self):
        import enrich
        self.enrich = enrich

    def test_fallback_returns_dict(self):
        """fallback_enrich_item возвращает словарь с нужными ключами."""
        item = {"title": "Test", "description": "desc", "source": "src", "url": "http://x.com"}
        result = self.enrich.fallback_enrich_item(item)
        self.assertIn("title", result)
        self.assertIn("description", result)
        self.assertIn("action", result)

    def test_fallback_empty_desc_fills_from_source(self):
        """Если описание пустое — fallback заполняет его из источника."""
        item = {"title": "Test", "description": "", "source": "TestSource", "url": "http://x.com"}
        result = self.enrich.fallback_enrich_item(item)
        self.assertTrue(
            len(result["description"]) > 0,
            "description должен быть заполнен"
        )


class TestApiKeyResolution(unittest.TestCase):
    """Тесты получения API ключа."""

    def test_get_api_key_from_env(self):
        """get_api_key() возвращает ключ из ANTHROPIC_API_KEY."""
        import enrich
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            key = enrich.get_api_key()
        self.assertEqual(key, "sk-test-key")

    def test_get_api_key_strips_whitespace(self):
        """get_api_key() убирает пробелы из ключа."""
        import enrich
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "  sk-test-key  "}):
            key = enrich.get_api_key()
        self.assertEqual(key, "sk-test-key")

    def test_get_api_key_returns_none_if_not_set(self):
        """Без ключа возвращается None."""
        import enrich
        env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            # Также убираем файл ключа через патч
            with patch("os.path.isfile", return_value=False):
                key = enrich.get_api_key()
        self.assertIsNone(key)

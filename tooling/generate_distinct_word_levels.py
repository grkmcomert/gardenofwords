"""Generate multilingual level words that do not overlap the current game bank.

The game schema is read from assets/game/index.html and the runtime word bank
is read from assets/game/fixed-word-lists.js. The model is only a candidate
generator; every response is validated locally before it is written.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections import deque
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types


PROJECT_ROOT = Path(
    os.environ.get("KELIMELER_BAHCESI_ROOT", Path.cwd())
).resolve()
GAME_INDEX_FILE = PROJECT_ROOT / "assets" / "game" / "index.html"
GAME_WORDS_FILE = PROJECT_ROOT / "assets" / "game" / "fixed-word-lists.js"

output_setting = Path(
    os.environ.get("KELIMELER_OUTPUT_FILE", "kelimeler_bahcesi_distinct.json")
)
OUTPUT_FILE = output_setting if output_setting.is_absolute() else PROJECT_ROOT / output_setting

MODEL_ID = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
BATCH_SIZE = int(os.environ.get("KELIMELER_BATCH_SIZE", "20"))
MAX_ATTEMPTS = int(os.environ.get("KELIMELER_MAX_ATTEMPTS", "3"))
RETRY_DELAY_SECONDS = float(os.environ.get("KELIMELER_RETRY_DELAY", "5"))
BETWEEN_BATCH_DELAY_SECONDS = float(os.environ.get("KELIMELER_BATCH_DELAY", "3"))

LANGUAGES = ("en", "de", "tr")
RECENT_WORD_WINDOW = 24

VALID_ALPHABETS = {
    "en": set("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "de": set("ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ"),
    "tr": set("ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"),
}

# These are the current game's difficulty rules. The grid value in the JSON
# remains the level metadata (8/9/10/11); the game adds its runtime board
# bonus when it creates the playable grid.
DIFFICULTY_RULES = {
    "A": {
        "difficulty": "Easy",
        "grid": "8x8",
        "grid_size": 8,
        "word_count": 4,
        "min_length": 3,
        "max_length": 8,
    },
    "B": {
        "difficulty": "Medium",
        "grid": "9x9",
        "grid_size": 9,
        "word_count": 5,
        "min_length": 4,
        "max_length": 7,
    },
    "C": {
        "difficulty": "Hard",
        "grid": "10x10",
        "grid_size": 10,
        "word_count": 5,
        "min_length": 5,
        "max_length": 9,
    },
    "D": {
        "difficulty": "Extreme",
        "grid": "11x11",
        "grid_size": 11,
        "word_count": 6,
        "min_length": 7,
        "max_length": 11,
    },
}

TONE_TO_PATTERN = {"easy": "A", "medium": "B", "hard": "C", "extreme": "D"}

UNSAFE_PREFIXES = {
    "en": (
        "ASS", "ASSHOLE", "BASTARD", "BITCH", "COCK", "CUNT", "DAMN",
        "DICK", "DILDO", "FUCK", "IDIOT", "JERK", "NIGGER", "PISS",
        "PORN", "PUSSY", "SEXUAL", "SHIT", "SLUT", "TWAT", "WANK", "WHORE",
    ),
    "de": (
        "ARSCH", "BASTARD", "DUMM", "FICK", "HURE", "HURENSOHN", "IDIOT",
        "NIGGER", "SCHLAMPE", "SCHEISSE", "WICHSER",
    ),
    "tr": (
        "AMK", "APTAL", "BOK", "GÖT", "KAHPE", "OROSPU", "PİÇ", "POK",
        "SALAK", "SİK", "SİKTİR", "ŞEREFSİZ", "YARRAK",
    ),
}

RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "level": {"type": "integer"},
            "difficulty": {"type": "string"},
            "grid": {"type": "string"},
            "gridSize": {"type": "integer"},
            "wordCount": {"type": "integer"},
            "words": {
                "type": "object",
                "properties": {
                    language: {
                        "type": "array",
                        "items": {"type": "string"},
                    }
                    for language in LANGUAGES
                },
                "required": list(LANGUAGES),
            },
        },
        "required": [
            "level", "difficulty", "grid", "gridSize", "wordCount", "words"
        ],
    },
}


def parse_json_assignment(source: str, marker: str, end_marker: str) -> Any:
    start = source.index(marker) + len(marker)
    end = source.index(end_marker, start)
    raw = source[start:end].strip()
    if raw.endswith(";"):
        raw = raw[:-1].rstrip()
    return json.loads(raw)


def load_current_game_words(path: Path) -> dict[str, set[str]]:
    """Read the base bank plus the manual runtime revisions from the JS file."""
    source = path.read_text(encoding="utf-8")
    data = parse_json_assignment(
        source,
        "const GARDEN_OF_WORDS_FIXED_LEVEL_DATA = ",
        "// Keep fixed words",
    )

    # The app applies these revisions after the generated bank and before
    # exposing it to index.html. Their words are included in the blacklist too.
    revisions_marker = "const MANUAL_LEVEL_WORD_REVISIONS = "
    if revisions_marker in source:
        revisions_start = source.index(revisions_marker) + len(revisions_marker)
        revisions_end = source.index(
            "Object.entries(MANUAL_LEVEL_WORD_REVISIONS)", revisions_start
        )
        revisions_raw = source[revisions_start:revisions_end].strip()
        revisions_raw = re.sub(
            r'(?m)^(\s*)(en|de|tr|\d+):', r'\1"\2":', revisions_raw
        )
        if revisions_raw.endswith(";"):
            revisions_raw = revisions_raw[:-1].rstrip()
        revisions = json.loads(revisions_raw)
        for language, levels in revisions.items():
            for level_words in levels.values():
                data[language].append(level_words)

    result: dict[str, set[str]] = {}
    for language in LANGUAGES:
        levels = data.get(language)
        if not isinstance(levels, list) or len(levels) < 950:
            raise ValueError(f"{path}: {language} word bank is incomplete")
        result[language] = {
            word
            for level in levels
            for word in level
            if isinstance(word, str) and word
        }
    return result


def load_level_specs(path: Path) -> list[dict[str, Any]]:
    """Build the exact 950-level pattern from the game's LEVELS metadata."""
    source = path.read_text(encoding="utf-8")
    start = source.index("const LEVELS = [")
    end = source.index("const COLOR_BY_TONE", start)
    level_line = re.compile(
        r'\{ id: (\d+), .*?tone: "([^"]+)", size: (\d+),'
    )

    specs: list[dict[str, Any]] = []
    for line in source[start:end].splitlines():
        match = level_line.search(line)
        if not match:
            continue
        level_id = int(match.group(1))
        tone = match.group(2)
        base_size = int(match.group(3))
        if level_id != len(specs) + 1:
            raise ValueError(f"LEVELS is not sequential at level {level_id}")
        pattern = TONE_TO_PATTERN.get(tone)
        if pattern is None:
            raise ValueError(f"Unsupported game tone: {tone}")
        rule = DIFFICULTY_RULES[pattern]
        if base_size != rule["grid_size"]:
            raise ValueError(
                f"Level {level_id} grid mismatch: {base_size} != {rule['grid_size']}"
            )
        specs.append({"level": level_id, "pattern": pattern, **rule})

    if len(specs) != 950:
        raise ValueError(f"Expected 950 game levels, found {len(specs)}")
    return specs


def normalize_word(word: str, language: str) -> str:
    if language == "tr":
        word = word.replace("i", "İ").replace("ı", "I")
    if language == "de":
        word = word.replace("ß", "ẞ")
    return word.upper()


def clone_recent(recent: dict[str, deque[str]]) -> dict[str, deque[str]]:
    return {
        language: deque(words, maxlen=RECENT_WORD_WINDOW)
        for language, words in recent.items()
    }


def validate_level(
    item: dict[str, Any],
    spec: dict[str, Any],
    current_words: dict[str, set[str]],
    recent: dict[str, deque[str]],
) -> None:
    expected = {
        "level": spec["level"],
        "difficulty": spec["difficulty"],
        "grid": spec["grid"],
        "gridSize": spec["grid_size"],
        "wordCount": spec["word_count"],
    }
    for field, value in expected.items():
        if item.get(field) != value:
            raise ValueError(
                f"Level {spec['level']}: {field}={item.get(field)!r}, expected {value!r}"
            )

    words_by_language = item.get("words")
    if not isinstance(words_by_language, dict) or set(words_by_language) != set(LANGUAGES):
        raise ValueError(f"Level {spec['level']}: words must contain en, de and tr")

    for language in LANGUAGES:
        words = words_by_language[language]
        if not isinstance(words, list) or len(words) != spec["word_count"]:
            raise ValueError(
                f"Level {spec['level']} {language}: expected {spec['word_count']} words"
            )
        if any(not isinstance(word, str) for word in words):
            raise ValueError(f"Level {spec['level']} {language}: non-string word")
        if len(set(words)) != len(words):
            raise ValueError(f"Level {spec['level']} {language}: duplicate in one level")

        for word in words:
            if normalize_word(word, language) != word:
                raise ValueError(f"Level {spec['level']} {language}: not uppercase: {word}")
            if not word.isalpha() or not set(word) <= VALID_ALPHABETS[language]:
                raise ValueError(f"Level {spec['level']} {language}: invalid alphabet: {word}")
            if not spec["min_length"] <= len(word) <= spec["max_length"]:
                raise ValueError(f"Level {spec['level']} {language}: invalid length: {word}")
            if word in current_words[language]:
                raise ValueError(
                    f"Level {spec['level']} {language}: word already exists in game: {word}"
                )
            if any(word.startswith(prefix) for prefix in UNSAFE_PREFIXES[language]):
                raise ValueError(f"Level {spec['level']} {language}: unsafe word: {word}")
            if word in recent[language]:
                raise ValueError(
                    f"Level {spec['level']} {language}: repeated too recently: {word}"
                )

        recent[language].extend(words)


def validate_sequence(
    levels: list[dict[str, Any]],
    specs: list[dict[str, Any]],
    current_words: dict[str, set[str]],
) -> dict[str, deque[str]]:
    if len(levels) > len(specs):
        raise ValueError(f"Output contains {len(levels)} levels; maximum is {len(specs)}")
    recent = {
        language: deque(maxlen=RECENT_WORD_WINDOW)
        for language in LANGUAGES
    }
    for index, item in enumerate(levels):
        if not isinstance(item, dict):
            raise ValueError(f"Output level {index + 1} is not an object")
        validate_level(item, specs[index], current_words, recent)
    return recent


def extract_json(text: str) -> str:
    match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    return match.group(0) if match else text


def relevant_blacklist(
    current_words: dict[str, set[str]],
    specs: list[dict[str, Any]],
) -> str:
    min_length = min(spec["min_length"] for spec in specs)
    max_length = max(spec["max_length"] for spec in specs)
    return "\n".join(
        f"{language}: {', '.join(sorted(word for word in current_words[language] if min_length <= len(word) <= max_length))}"
        for language in LANGUAGES
    )


def generate_prompt(
    specs: list[dict[str, Any]],
    current_words: dict[str, set[str]],
    recent: dict[str, deque[str]],
) -> str:
    start_level = specs[0]["level"]
    end_level = specs[-1]["level"]
    pattern_chunk = "".join(spec["pattern"] for spec in specs)
    rules = "\n".join(
        f"{key}: {value['difficulty']}, {value['grid']}, {value['word_count']} words, "
        f"{value['min_length']}-{value['max_length']} letters"
        for key, value in DIFFICULTY_RULES.items()
    )
    recent_text = "\n".join(
        f"{language}: {', '.join(recent[language]) or '(none)'}"
        for language in LANGUAGES
    )

    return f"""Generate word data for the Garden of Words game.

The exact requested level range is {start_level}-{end_level}.
The exact pattern for that range is {pattern_chunk}.
The first pattern character belongs to level {start_level}; do not reorder it,
turn it into contiguous difficulty blocks, or skip a level.

CURRENT GAME RULES:
{rules}

The grid/gridSize fields use the game's level metadata: A=8, B=9, C=10, D=11.
The running game may add extra filler cells, but the difficulty word ranges
above are authoritative. Generate only the exact count for each pattern.

LANGUAGES: en, de, tr. Use real, natural words in each language, uppercase.
Do not use names, brands, abbreviations, slang, profanity, sexual terms, or
invented words. Keep the four/six words in one level thematically related when
possible. Do not repeat a word inside one level.

IMPORTANT BLACKLIST:
The following words already exist in the current game. Do not use them in the
same language. The local validator has the complete blacklist and will reject
any missed match.
{relevant_blacklist(current_words, specs)}

RECENTLY GENERATED WORDS:
Do not reuse these words in this batch; repeats are allowed only after enough
new words have passed, so avoid immediate or near-immediate repetition.
{recent_text}

Return only valid JSON matching this shape:
[
  {{
    "level": {start_level},
    "difficulty": "Easy",
    "grid": "8x8",
    "gridSize": 8,
    "wordCount": 4,
    "words": {{
      "en": ["WORD1", "WORD2", "WORD3", "WORD4"],
      "de": ["WORT1", "WORT2", "WORT3", "WORT4"],
      "tr": ["KELİME1", "KELİME2", "KELİME3", "KELİME4"]
    }}
  }}
]

Return exactly one object for every level in {start_level}-{end_level}.
"""


def response_to_data(response: Any) -> list[dict[str, Any]]:
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if hasattr(parsed, "model_dump"):
            parsed = parsed.model_dump()
        if isinstance(parsed, list):
            return parsed
    return json.loads(extract_json(response.text))


def write_output(levels: list[dict[str, Any]]) -> None:
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_FILE.with_suffix(OUTPUT_FILE.suffix + ".tmp")
    temporary.write_text(
        json.dumps(levels, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(OUTPUT_FILE)


def main() -> None:
    api_key = os.environ.get("AQ.Ab8RN6Lv0Dur99USnud6tYunglqh0aUNjMInIaniDXommhY6tA")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Set it in the environment; do not put it in this file."
        )
    if BATCH_SIZE < 1:
        raise ValueError("KELIMELER_BATCH_SIZE must be positive")

    specs = load_level_specs(GAME_INDEX_FILE)
    current_words = load_current_game_words(GAME_WORDS_FILE)
    all_levels: list[dict[str, Any]] = []
    if OUTPUT_FILE.exists():
        all_levels = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
        if not isinstance(all_levels, list):
            raise ValueError(f"{OUTPUT_FILE} must contain a JSON array")
    recent = validate_sequence(all_levels, specs, current_words)
    start_index = len(all_levels)
    client = genai.Client(api_key=api_key)

    for index in range(start_index, len(specs), BATCH_SIZE):
        batch_specs = specs[index:index + BATCH_SIZE]
        print(
            f"Levels {batch_specs[0]['level']}-{batch_specs[-1]['level']} generating "
            f"(pattern: {''.join(spec['pattern'] for spec in batch_specs)})..."
        )
        prompt = generate_prompt(batch_specs, current_words, recent)
        success = False

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = client.models.generate_content(
                    model=MODEL_ID,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RESPONSE_SCHEMA,
                    ),
                )
                batch_data = response_to_data(response)
                if len(batch_data) != len(batch_specs):
                    raise ValueError(
                        f"Expected {len(batch_specs)} levels, received {len(batch_data)}"
                    )
                candidate_recent = clone_recent(recent)
                validate_sequence(batch_data, batch_specs, current_words)

                # Validate against the actual previous-output history too. The
                # batch-local check above catches internal issues; this check
                # commits the candidate to the real rolling history only after
                # the complete batch is known to be valid.
                for offset, item in enumerate(batch_data):
                    validate_level(
                        item,
                        batch_specs[offset],
                        current_words,
                        candidate_recent,
                    )

                all_levels.extend(batch_data)
                recent = candidate_recent
                write_output(all_levels)
                print(f"Saved through level {batch_specs[-1]['level']}.")
                success = True
                break
            except Exception as error:  # model JSON and local validation errors
                print(f"Attempt {attempt}/{MAX_ATTEMPTS} rejected: {error}")
                if attempt < MAX_ATTEMPTS:
                    time.sleep(RETRY_DELAY_SECONDS)

        if not success:
            raise RuntimeError(
                f"Could not produce a valid batch for levels "
                f"{batch_specs[0]['level']}-{batch_specs[-1]['level']}"
            )
        time.sleep(BETWEEN_BATCH_DELAY_SECONDS)

    print(f"Complete: {len(all_levels)} levels written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

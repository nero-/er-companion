#!/usr/bin/env python3
"""Collect in-game description text into ``src/data/descriptions.json``.

Sources (all read-only, cached under ``research/raw/descriptions/``):

* ``src/data/items.full.json`` -> ``items``: every catalog row with a
  ``wikiUrl``. English text comes from the page's ``{{Description}}``
  template (``EN=`` or ``EN_line1..N``); a handful of pages transclude a
  ``/Description`` subpage, which is fetched too. Pages that quote the item
  text in a ``== Description ==`` section instead (a few tools/rings) fall
  back to that prose; gestures have no item text at all and are listed in
  ``missing``.
* ``src/data/bosses.full.json`` -> ``encounters``: the boss page's
  ``Description``/``Overview``/``Background`` prose, cropped to one paragraph.
  Pages without those sections use the lead paragraph.
* ``src/data/questlines.json`` -> unique ``npc`` values: the wiki lead
  paragraph (identification prose only, no quest outcomes).
* ``src/data/lore.json`` (``area``) + ``src/data/route.full.json``
  (``areas[].name``): the area page's ``Overview`` prose.

``AREA_ALIASES`` / ``NPC_ALIASES`` / ``BOSS_ALIASES`` map sheet spellings that
have no page of their own to the page that does describe the place or
creature; the stored ``sourceUrl`` always names the page actually read.

Nothing is invented: a field that cannot be read from the wiki is omitted and
the name lands in ``missing`` with its reason. Raw wikitext is cached one JSON
file per page, so re-runs are offline unless ``--refresh`` is passed.

Usage:
    python scripts/research/fetch_descriptions.py [--refresh] [--quiet]
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "src" / "data"
RAW_DIR = REPO_ROOT / "research" / "raw" / "descriptions"
OUT_PATH = DATA_DIR / "descriptions.json"

API_URL = "https://eldenring.wiki.gg/api.php"
WIKI_PAGE = "https://eldenring.wiki.gg/wiki/"
USER_AGENT = "er-companion-research/1.0 (unofficial local fan project)"
SOURCE = "eldenring.wiki.gg (MediaWiki action=query prop=revisions)"
METHOD = (
    "Items: the wiki page's {{Description}} template (EN= or EN_line1..N), with "
    "a == Description == prose fallback for pages that quote the item text "
    "directly. Bosses: the boss page's Description/Overview/Background prose, "
    "first substantive paragraph. NPCs: the character page's lead paragraph. "
    "Areas: the region page's Overview prose. Wikitext is stripped of templates, "
    "tables, references, file links and markup; text is plain UTF-8. Pages that "
    "cannot be resolved or carry no such text are listed under missing with the "
    "reason instead of being filled in."
)

BATCH_SIZE = 50          # action=query title limit on this wiki
REQUEST_DELAY = 1.2      # polite pause between batched requests
REQUEST_TIMEOUT = 45
MAX_ITEM_CHARS = 1200
MAX_BOSS_CHARS = 600
MAX_NPC_CHARS = 600
MAX_AREA_CHARS = 600

# Composite / directional route area names that have no page of their own.
# Each maps to the region page that actually describes the place; the entry's
# sourceUrl points at that page, so the provenance stays honest.
AREA_ALIASES = {
    "West Limgrave": "Limgrave",
    "North Limgrave": "Limgrave",
    "Central Limgrave": "Limgrave",
    "South Limgrave": "Limgrave",
    "West Liurnia": "Liurnia of the Lakes",
    "South Liurnia": "Liurnia of the Lakes",
    "Central Liurnia": "Liurnia of the Lakes",
    "East Liurnia": "Liurnia of the Lakes",
    "West Altus": "Altus Plateau",
    "Central Altus": "Altus Plateau",
    "East Altus": "Altus Plateau",
    "West Mountaintops": "Mountaintops of the Giants",
    "East Mountaintops": "Mountaintops of the Giants",
    "West Scadu Altus": "Scadu Altus",
    "East Scadu Altus": "Scadu Altus",
    "West Gravesite Plain": "Gravesite Plain",
    "East Gravesite Plain": "Gravesite Plain",
    "Church District": "Shadow Keep, Church District",
    "Enir-Ilim & DLC Finale": "Enir-Ilim",
    "First steps in Limgrave": "Limgrave",
    "Crumbling Farum Azula — Aftermath": "Crumbling Farum Azula",
}

# Encounter names that share a wiki page with the base enemy: the page's prose
# describes the creature, and the stored sourceUrl names that page.
BOSS_ALIASES = {
    "Demi-Human Chiefs": "Demi-Human",
    "Lesser Mad Pumpkin Head": "Mad Pumpkin Head",
    "Fort Haight Godrick Knight": "Godrick Knight",
    "Mounted Godrick Knight — Golden Vow Patrol": "Godrick Knight",
}

# NPC sheet names whose wiki title differs from the sheet spelling.
NPC_ALIASES = {
    "White Mask Varre": "White Mask Varré",
    "Swordhand of Night Jolan": "Swordhand of Night Jolán",
    "Florissax, Dragon Communion Priestess": "Dragon Communion Priestess",
    "Hornsent": "Hornsent (NPC)",
}

BOSS_SECTION_PRIORITY = (
    "description",
    "overview",
    "background",
    "lore",
    "story",
    "appearance",
)
AREA_SECTION_PRIORITY = ("overview", "description", "background", "lore")


# --------------------------------------------------------------------------- #
# wikitext helpers
# --------------------------------------------------------------------------- #

def strip_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def find_templates(text: str, name: str) -> list[str]:
    """Return the full source of every ``{{name ...}}`` template."""
    wanted = name.lower()
    out: list[str] = []
    i = 0
    n = len(text)
    while True:
        start = text.find("{{", i)
        if start < 0:
            return out
        depth = 0
        k = start
        while k < n:
            if text.startswith("{{", k):
                depth += 1
                k += 2
                continue
            if text.startswith("}}", k):
                depth -= 1
                k += 2
                if depth == 0:
                    chunk = text[start:k]
                    head = re.match(r"\{\{\s*([^|}]+?)\s*(?:\||\}\})", chunk)
                    if head and head.group(1).strip().lower() == wanted:
                        out.append(chunk)
                    i = start + 2
                    break
                continue
            k += 1
        else:
            return out


def split_params(template: str) -> list[str]:
    """Split a template body on top-level pipes (nested {{ }} and [[ ]] kept)."""
    inner = template[2:-2]
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    i = 0
    while i < len(inner):
        pair = inner[i : i + 2]
        if pair in ("{{", "[["):
            depth += 1
            cur.append(pair)
            i += 2
            continue
        if pair in ("}}", "]]"):
            depth -= 1
            cur.append(pair)
            i += 2
            continue
        ch = inner[i]
        if ch == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    parts.append("".join(cur))
    return parts


def template_params(template: str) -> dict[str, str]:
    params: dict[str, str] = {}
    for part in split_params(template)[1:]:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        params[key.strip()] = value
    return params


def description_text(wikitext: str, prefer_longest: bool = False) -> str:
    """English text of the page's {{Description}} template, or ''."""
    candidates: list[str] = []
    for template in find_templates(wikitext, "description"):
        body = re.sub(r"<tabber[^>]*>|</tabber\s*>", "", template)
        # Tabber tab headers ("|-|+0=") carry "=" and would otherwise end a param.
        body = re.sub(r"^\s*\|-\|[^\n]*?=[ \t]*$", "\n@@TAB@@\n", body, flags=re.M)
        params = template_params(body)
        direct = ""
        lines: list[tuple[int, str]] = []
        for key, value in params.items():
            norm = key.strip().lower().replace(" ", "_")
            if norm == "en":
                direct = value.strip()
                continue
            match = re.fullmatch(r"en_line_?(\d+)", norm)
            if match:
                lines.append((int(match.group(1)), value.strip()))
        chunks: list[str] = []
        if direct:
            # Only the first tab variant is the item's base description.
            first_tab = next(
                (part for part in direct.split("@@TAB@@") if part.strip()), ""
            )
            chunks.append(first_tab.strip())
        for _, value in sorted(lines):
            if value:
                chunks.append(value)
        if chunks and any(chunk for chunk in chunks):
            candidates.append("\n\n".join(chunk for chunk in chunks if chunk))
    if not candidates:
        return ""
    if prefer_longest:
        return max(candidates, key=lambda text: len(plain_text(text)))
    return candidates[0]


GAME_TEMPLATES = {
    "er": "Elden Ring",
    "sote": "Shadow of the Erdtree",
    "sotet": "Shadow of the Erdtree",
}


def prepare_wikitext(wikitext: str, title: str) -> str:
    """Expand the templates that carry prose so stripping does not erase words."""
    text = re.sub(
        r"\{\{\s*PAGENAME\s*\}\}", lambda _: title, wikitext, flags=re.I
    )
    text = re.sub(
        r"\{\{\s*(?:ER|SOTE|SotE)\s*\}\}",
        lambda m: GAME_TEMPLATES.get(m.group(0).strip("{} ").lower(), ""),
        text,
    )
    text = re.sub(r"\{\{\s*(?:[Ss]ic|[Cc]lear)\s*\|([^{}]*)\}\}", r"\1", text)
    text = re.sub(r"\{\{\s*[Nn]owrap\s*\|([^{}]*)\}\}", r"\1", text)
    return text


MEDIA_NAMESPACES = {"file", "image", "category", "special", "media"}


def _drop_media_links(text: str) -> str:
    """Remove ``[[File:...]]``-style links, which may nest other brackets."""
    out: list[str] = []
    i = 0
    while True:
        start = text.find("[[", i)
        if start < 0:
            out.append(text[i:])
            return "".join(out)
        out.append(text[i:start])
        depth = 0
        k = start
        while k < len(text):
            if text.startswith("[[", k):
                depth += 1
                k += 2
                continue
            if text.startswith("]]", k):
                depth -= 1
                k += 2
                if depth == 0:
                    break
                continue
            k += 1
        inner = text[start + 2 : k - 2]
        target = inner.split("|", 1)[0].strip()
        namespace = target.split(":", 1)[0].strip().lower() if ":" in target else ""
        if namespace not in MEDIA_NAMESPACES:
            out.append(text[start:k])
        else:
            # Media links are occasionally closed as "]]]" (an extra bracket).
            while k < len(text) and text[k] == "]":
                k += 1
        i = k


def strip_links(text: str) -> str:
    text = _drop_media_links(text)
    # [[target|label]] -> label (loop handles nested labels)
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\[\[([^\[\]|]*)\|([^\[\]]*)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\[\]]*)\]\]", lambda m: m.group(1).split(":", 1)[-1].strip(), text)
    text = re.sub(r"\[(?:https?|ftp)://[^\s\]]+\s+([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[(?:https?|ftp)://[^\]]*\]", "", text)
    return text


HEADING_RE = re.compile(r"^(={2,6})\s*(.+?)\s*\1\s*$", re.M)


def plain_text(raw: str) -> str:
    """Wikitext -> plain UTF-8 prose."""
    text = strip_comments(raw)
    text = re.sub(r"<ref[^>]*/\s*>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref\s*>", "", text, flags=re.S)
    text = re.sub(r"<gallery[^>]*>.*?</gallery\s*>", "", text, flags=re.S)
    text = re.sub(r"<tabber[^>]*>|</tabber\s*>", "", text)
    text = re.sub(r"<br\s*/?\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<references\s*/?\s*>", "", text)
    # tables: {| ... |}
    text = re.sub(r"\{\|.*?\|\}", "", text, flags=re.S)
    text = strip_links(text)
    # remaining templates, innermost first
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = HEADING_RE.sub("", text)
    text = text.replace("'''", "").replace("''", "")
    text = html.unescape(text)
    lines = []
    for line in text.split("\n"):
        line = line.replace("\u00a0", " ")
        line = re.sub(r"^[\s*#:;•]+", "", line)
        line = re.sub(r"[ \t]+", " ", line).strip()
        lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clip(text: str, limit: int) -> str:
    """Trim to ``limit`` characters at a sentence (or word) boundary."""
    if len(text) <= limit:
        return text
    window = text[:limit]
    end = max(window.rfind(". "), window.rfind("! "), window.rfind("? "), window.rfind('." '))
    if end > limit * 0.5:
        return window[: end + 1].strip()
    cut = window.rfind(" ")
    return (window[:cut] if cut > 0 else window).rstrip(" ,;:") + " …"


def unwrap_quotes(text: str) -> str:
    """Drop quotes an editor wrapped around whole paragraphs, not quoted speech."""
    pairs = {('"', '"'), ("“", "”"), ("«", "»")}

    def clean(block: str) -> str:
        block = block.strip()
        if len(block) >= 2 and (block[0], block[-1]) in pairs:
            inner = block[1:-1]
            quote_chars = {block[0], block[-1]}
            if not any(char in inner for char in quote_chars):
                return inner.strip()
        return block

    return "\n\n".join(clean(block) for block in text.split("\n\n"))


# --------------------------------------------------------------------------- #
# section / paragraph extraction
# --------------------------------------------------------------------------- #


def sections(wikitext: str) -> list[tuple[int, str, str]]:
    """(level, plain title, body wikitext) for every heading, in order."""
    matches = list(HEADING_RE.finditer(wikitext))
    out = []
    for index, match in enumerate(matches):
        level = len(match.group(1))
        title = plain_text(match.group(2)).lower()
        end = len(wikitext)
        for later in matches[index + 1 :]:
            if len(later.group(1)) <= level:
                end = later.start()
                break
        out.append((level, title, wikitext[match.end() : end]))
    return out


def lead_wikitext(wikitext: str) -> str:
    first = HEADING_RE.search(wikitext)
    body = wikitext[: first.start()] if first else wikitext
    body = re.sub(r"\{\{[Ii]nfobox[^{}]*\}\}", "", body)
    body = re.sub(r"\{\{Quote.*?\}\}", "", body, flags=re.S)
    return body


def first_paragraph(raw: str, limit: int, min_chars: int = 70, allow_quote: bool = True) -> str:
    text = plain_text(raw)
    fallback = ""
    for block in re.split(r"\n{2,}", text):
        block = " ".join(block.split())
        if len(block) < min_chars:
            continue
        if block.count("|") > 3 or block.startswith(("|", "}", "{", "File:", "Image:")):
            continue
        if re.fullmatch(r"[\W\d]+", block):
            continue
        if block.startswith(('"', "“", "「")):
            if not allow_quote:
                fallback = fallback or block
                continue
        return unwrap_quotes(clip(block, limit))
    return unwrap_quotes(clip(fallback, limit)) if fallback else ""


def section_paragraph(
    wikitext: str, priority: tuple[str, ...], limit: int, allow_quote: bool = True
) -> str:
    """First paragraph under the shallowest matching heading, in page order."""
    found = list(sections(wikitext))
    for wanted in priority:
        matches = [
            (level, body)
            for level, title, body in found
            if title and (title == wanted or title.startswith(wanted + " "))
        ]
        for _, body in sorted(matches, key=lambda item: item[0]):
            text = first_paragraph(body, limit, allow_quote=allow_quote)
            if text:
                return text
    return ""


# --------------------------------------------------------------------------- #
# wiki fetching (cached)
# --------------------------------------------------------------------------- #

def slug_for(title: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("_")[:90] or "page"
    digest = hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{digest}.json"


class Wiki:
    def __init__(self, refresh: bool, quiet: bool = False):
        self.refresh = refresh
        self.quiet = quiet
        self.memory: dict[str, dict] = {}
        self.fetched_titles = 0

    def _cache_path(self, title: str) -> Path:
        return RAW_DIR / slug_for(title)

    def _load_cache(self, title: str) -> dict | None:
        path = self._cache_path(title)
        if not path.exists():
            return None
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if record.get("requested") != title:
            return None
        return record

    def _store(self, record: dict) -> None:
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        self._cache_path(record["requested"]).write_text(
            json.dumps(record, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def resolve(self, titles: list[str]) -> dict[str, dict]:
        """Map each requested title -> {title, wikitext, missing, error}."""
        pending: list[str] = []
        for title in titles:
            if title in self.memory:
                continue
            if not self.refresh:
                cached = self._load_cache(title)
                if cached is not None:
                    self.memory[title] = cached
                    continue
            pending.append(title)

        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start : start + BATCH_SIZE]
            self._fetch_batch(batch)
            if start + BATCH_SIZE < len(pending):
                time.sleep(REQUEST_DELAY)
        return {title: self.memory[title] for title in titles if title in self.memory}

    def _fetch_batch(self, batch: list[str]) -> None:
        query = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "redirects": "1",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(batch),
        }
        payload = None
        error = None
        for attempt in range(5):
            try:
                payload = self._get(query)
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    retry_after = exc.headers.get("Retry-After") if exc.headers else None
                    pause = float(retry_after) if retry_after and retry_after.isdigit() else 4.0 * (attempt + 1)
                    error = "wiki request failed: HTTP Error 429: Too Many Requests"
                    if not self.quiet:
                        print(f"  rate limited; pausing {pause:.0f}s …", flush=True)
                    time.sleep(pause)
                else:
                    error = f"wiki request failed: HTTP Error {exc.code}"
                    time.sleep(1.5 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                error = f"wiki request failed: {exc}"
                time.sleep(1.5 * (attempt + 1))
        if payload is None:
            # Not cached: a later run retries these titles instead of keeping a hole.
            for title in batch:
                self.memory[title] = {
                    "requested": title,
                    "title": title,
                    "wikitext": "",
                    "missing": True,
                    "error": error,
                }
            return

        pages = payload.get("query", {}).get("pages", [])
        by_title = {page.get("title", ""): page for page in pages}
        forward: dict[str, str] = {}
        for entry in payload.get("query", {}).get("normalized", []):
            forward[entry["from"]] = entry["to"]
        for entry in payload.get("query", {}).get("redirects", []):
            forward[entry["from"]] = entry["to"]

        for requested in batch:
            resolved = requested
            seen = set()
            while resolved in forward and resolved not in seen:
                seen.add(resolved)
                resolved = forward[resolved]
            page = by_title.get(resolved)
            if page is None:
                self.memory[requested] = {
                    "requested": requested,
                    "title": resolved,
                    "wikitext": "",
                    "missing": True,
                    "error": "page not returned by the wiki API",
                }
                continue
            if page.get("missing"):
                record = {
                    "requested": requested,
                    "title": page.get("title", resolved),
                    "wikitext": "",
                    "missing": True,
                    "error": "no wiki page",
                }
            else:
                revisions = page.get("revisions") or [{}]
                slots = revisions[0].get("slots", {})
                content = (slots.get("main") or {}).get("content", "")
                record = {
                    "requested": requested,
                    "title": page.get("title", resolved),
                    "wikitext": content,
                    "missing": not content,
                    "error": "" if content else "wiki page has no content",
                }
            record["url"] = WIKI_PAGE + urllib.parse.quote(record["title"].replace(" ", "_"))
            record["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.memory[requested] = record
            self._store(record)
            self.fetched_titles += 1
        if not self.quiet:
            print(f"  fetched {len(batch)} page(s) …", flush=True)

    @staticmethod
    def _get(query: dict[str, str]) -> dict:
        url = API_URL + "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))


# --------------------------------------------------------------------------- #
# per-category extraction
# --------------------------------------------------------------------------- #

def item_title(item: dict) -> str:
    url = item.get("wikiUrl") or ""
    marker = "/wiki/"
    if marker not in url:
        return ""
    raw = url.split(marker, 1)[1]
    if "#" in raw:
        raw = raw.split("#", 1)[0]
    return urllib.parse.unquote(raw).replace("_", " ").strip()


def boss_title(encounter: dict) -> str:
    title = item_title(encounter)
    return title or (encounter.get("name") or "").strip()


def boss_candidates(encounter: dict) -> list[str]:
    title = boss_title(encounter)
    names = [title]
    if " — " in title:
        names.append(title.split(" — ", 1)[0].strip())
    if " - " in title:
        names.append(title.split(" - ", 1)[0].strip())
    alias = BOSS_ALIASES.get(encounter.get("name", ""))
    if alias:
        names.append(alias)
    unique: list[str] = []
    for name in names:
        if name and name not in unique:
            unique.append(name)
    return unique


def missing_reason(reason: str) -> str:
    """Collapse transport errors into a short, stable bucket."""
    if "429" in reason:
        return "wiki rate-limited this run — re-run to fill"
    if reason.startswith("wiki request failed"):
        return "wiki request failed — re-run to fill"
    return reason


TRANSCLUSION_RE = re.compile(
    r"\{\{\s*(?:#lsth?|#section[^:}|]*)\s*:\s*([^{}|\n]+?)\s*(?:\|[^{}]*)?\}\}"
    r"|\{\{\s*:\s*([^{}|\n]+?)\s*\}\}"
)


def transcluded_description_pages(wikitext: str) -> list[str]:
    """``/Description`` subpages whose text a thin page transcludes."""
    found: list[str] = []
    for match in TRANSCLUSION_RE.finditer(wikitext):
        title = (match.group(1) or match.group(2)).strip()
        if title.lower().endswith("/description") and title not in found:
            found.append(title)
    return found


def record_url(record: dict) -> str:
    url = record.get("url")
    if url:
        return url
    title = record.get("title") or record.get("requested") or ""
    return WIKI_PAGE + urllib.parse.quote(title.replace(" ", "_"))


def item_entry(record: dict, extra: dict | None = None) -> tuple[dict | None, str]:
    wikitext = prepare_wikitext(record.get("wikitext") or "", record.get("title") or "")
    if not wikitext.strip():
        return None, record.get("error") or "no wiki page"
    raw = description_text(wikitext, prefer_longest=True)
    source = "{{Description}} template"
    url = record_url(record)
    if not raw and extra is not None:
        sub_wikitext = prepare_wikitext(
            extra.get("wikitext") or "", extra.get("title") or ""
        )
        raw = description_text(sub_wikitext, prefer_longest=True)
        if raw:
            source = "{{Description}} template (transcluded /Description subpage)"
            url = record_url(extra)
    if not raw:
        raw = section_paragraph(wikitext, ("description",), MAX_ITEM_CHARS)
        source = "Description section prose"
    text = unwrap_quotes(clip(plain_text(raw), MAX_ITEM_CHARS)) if raw else ""
    if not text:
        return None, "no Description template or Description prose on wiki page"
    return (
        {"text": text, "sourceUrl": url, "kind": "item", "extractedFrom": source},
        "",
    )


def boss_entry(record: dict) -> tuple[dict | None, str]:
    wikitext = prepare_wikitext(record.get("wikitext") or "", record.get("title") or "")
    if not wikitext.strip():
        return None, record.get("error") or "no wiki page"
    template_raw = description_text(wikitext)
    text = ""
    origin = ""
    if template_raw:
        text = unwrap_quotes(clip(plain_text(template_raw), MAX_BOSS_CHARS))
        origin = "{{Description}} template"
    if not text:
        text = section_paragraph(wikitext, BOSS_SECTION_PRIORITY, MAX_BOSS_CHARS)
        origin = "boss page prose"
    if not text:
        text = first_paragraph(lead_wikitext(wikitext), MAX_BOSS_CHARS, min_chars=90)
        origin = "boss page lead"
    if not text:
        return None, "no descriptive prose on boss page"
    return (
        {"text": text, "sourceUrl": record_url(record), "kind": "boss", "extractedFrom": origin},
        "",
    )


NPC_SECTIONS = ("overview", "background", "profile", "appearance", "description")


def lead_entry(record: dict, kind: str, limit: int) -> tuple[dict | None, str]:
    """Short identification prose; ``kind`` selects the section priority."""
    wikitext = prepare_wikitext(record.get("wikitext") or "", record.get("title") or "")
    if not wikitext.strip():
        return None, record.get("error") or "no wiki page"
    raw = description_text(wikitext)
    text = unwrap_quotes(clip(plain_text(raw), limit)) if raw else ""
    origin = "{{Description}} template"
    if not text:
        priority = (NPC_SECTIONS if kind == "npc" else AREA_SECTION_PRIORITY)
        text = section_paragraph(
            wikitext, priority, limit, allow_quote=(kind != "npc")
        )
        origin = "page Overview prose"
    if not text:
        text = first_paragraph(
            lead_wikitext(wikitext), limit, min_chars=60, allow_quote=(kind != "npc")
        )
        origin = "page lead paragraph"
    if not text:
        return None, "no descriptive prose on wiki page"
    return (
        {"text": text, "sourceUrl": record_url(record), "kind": kind, "extractedFrom": origin},
        "",
    )


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="ignore the wikitext cache")
    parser.add_argument("--quiet", action="store_true", help="no per-batch progress lines")
    args = parser.parse_args()

    items = load("items.full.json")["items"]
    encounters = load("bosses.full.json")["encounters"]
    questlines = load("questlines.json")["questlines"]
    lore_entries = load("lore.json")["entries"]
    route_areas = load("route.full.json")["areas"]

    item_targets = [(item, item_title(item)) for item in items if item.get("wikiUrl")]
    boss_targets = [(encounter, boss_title(encounter)) for encounter in encounters]
    npc_names = sorted({entry["npc"] for entry in questlines if entry.get("npc")})
    area_names = sorted(
        {entry["area"] for entry in lore_entries if entry.get("area")}
        | {area.get("name") for area in route_areas if area.get("name")}
    )

    wiki = Wiki(refresh=args.refresh, quiet=args.quiet)

    print(f"items: {len(item_targets)} wiki-linked rows of {len(items)}")
    print(f"bosses: {len(boss_targets)} encounters")
    print(f"npcs: {len(npc_names)} | areas: {len(area_names)}")

    print("fetching item pages …")
    wiki.resolve(sorted({title for _, title in item_targets if title}))

    subpages: dict[str, str] = {}
    for _, title in item_targets:
        record = wiki.memory.get(title)
        if not record:
            continue
        for sub in transcluded_description_pages(record.get("wikitext") or ""):
            subpages[title] = sub
    if subpages:
        print(f"fetching {len(set(subpages.values()))} description subpage(s) …")
        wiki.resolve(sorted(set(subpages.values())))

    print("fetching boss pages …")
    boss_titles = []
    for encounter, _ in boss_targets:
        boss_titles.extend(boss_candidates(encounter))
    wiki.resolve(sorted({title for title in boss_titles if title}))

    print("fetching npc pages …")
    wiki.resolve(sorted({NPC_ALIASES.get(name, name) for name in npc_names}))

    print("fetching area pages …")
    wiki.resolve(sorted({AREA_ALIASES.get(name, name) for name in area_names}))

    result = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
        "method": METHOD,
        "items": {},
        "bosses": {},
        "npcs": {},
        "areas": {},
        "counts": {"items": 0, "bosses": 0, "npcs": 0, "areas": 0},
        "missing": {"items": [], "bosses": [], "npcs": [], "areas": []},
    }

    for item, title in item_targets:
        record = wiki.memory.get(title)
        if record is None:
            result["missing"]["items"].append(f"{item['name']} — no wiki page title")
            continue
        extra = wiki.memory.get(subpages.get(title, "")) if subpages.get(title) else None
        entry, reason = item_entry(record, extra)
        if entry is None:
            if item.get("group") == "Gesture":
                reason = "gesture page carries no item description text"
            result["missing"]["items"].append(f"{item['name']} — {missing_reason(reason)}")
            continue
        entry["sourceUrl"] = item.get("wikiUrl") or entry["sourceUrl"]
        result["items"][item["id"]] = {
            "text": entry["text"],
            "sourceUrl": entry["sourceUrl"],
            "kind": "item",
        }

    for encounter in encounters:
        title = boss_title(encounter)
        entry = None
        reason = "no wiki page title"
        for candidate in boss_candidates(encounter):
            record = wiki.memory.get(candidate)
            if record is None:
                continue
            entry, reason = boss_entry(record)
            if entry is not None:
                break
        if entry is None:
            result["missing"]["bosses"].append(f"{encounter['name']} — {missing_reason(reason)}")
            continue
        result["bosses"][encounter["id"]] = {
            "text": entry["text"],
            "sourceUrl": encounter.get("wikiUrl") or entry["sourceUrl"],
            "kind": "boss",
        }

    for name in npc_names:
        title = NPC_ALIASES.get(name, name)
        record = wiki.memory.get(title)
        if record is None:
            result["missing"]["npcs"].append(f"{name} — no wiki page title")
            continue
        entry, reason = lead_entry(record, "npc", MAX_NPC_CHARS)
        if entry is None:
            result["missing"]["npcs"].append(f"{name} — {missing_reason(reason)}")
            continue
        result["npcs"][name] = {
            "text": entry["text"],
            "sourceUrl": entry["sourceUrl"],
            "kind": "npc",
        }

    for name in area_names:
        title = AREA_ALIASES.get(name, name)
        record = wiki.memory.get(title)
        if record is None:
            result["missing"]["areas"].append(f"{name} — no wiki page title")
            continue
        entry, reason = lead_entry(record, "area", MAX_AREA_CHARS)
        if entry is None:
            result["missing"]["areas"].append(f"{name} — {missing_reason(reason)}")
            continue
        result["areas"][name] = {
            "text": entry["text"],
            "sourceUrl": entry["sourceUrl"],
            "kind": "area",
        }

    # Hard guarantees from the app contract.
    for bucket in ("items", "bosses", "npcs", "areas"):
        result["counts"][bucket] = len(result[bucket])
        for key, entry in result[bucket].items():
            text = entry["text"]
            assert text and text.strip(), f"empty text: {bucket}/{key}"
            assert len(text) <= MAX_ITEM_CHARS, f"oversized text: {bucket}/{key}"
            assert entry["sourceUrl"].startswith("http"), f"missing source: {bucket}/{key}"
            expected = {"items": "item", "bosses": "boss", "npcs": "npc", "areas": "area"}
            assert entry["kind"] == expected[bucket], f"wrong kind: {bucket}/{key}"

    OUT_PATH.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    rows = [
        ("items", len(item_targets), len(result["items"])),
        ("bosses", len(boss_targets), len(result["bosses"])),
        ("npcs", len(npc_names), len(result["npcs"])),
        ("areas", len(area_names), len(result["areas"])),
    ]
    width = max(len(row[0]) for row in rows)
    print()
    print(f"{'bucket'.ljust(width)}  stored/total  coverage  missing")
    for bucket, total, stored in rows:
        pct = (100.0 * stored / total) if total else 0.0
        missing = len(result["missing"][bucket])
        print(f"{bucket.ljust(width)}  {stored:>5}/{total:<6}  {pct:6.1f}%  {missing:>5}")
    print()
    print(f"pages fetched this run: {wiki.fetched_titles}")
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Scrape the Redmaw base and DLC walkthrough sheets into the app route schema.

Source pages:
  https://eldenring.redmaw.dev/sheets/walkthrough
  https://eldenring.redmaw.dev/sheets/dlc-walkthrough

Outputs (relative to the repository root):
  research/route.base.json
  research/route.dlc.json

Raw HTML is cached in research/raw/. Pass --refresh to re-download it.
The checker/checkbox state in the HTML is irrelevant; only the authored steps
and their inline links/badges are captured.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "research" / "raw"

# Capture time of the current cached HTML (server Date header, UTC).
CAPTURED_AT = "2026-10-22T16:34:04Z"

PAGES = {
    "base": {
        "url": "https://eldenring.redmaw.dev/sheets/walkthrough",
        "raw": RAW_DIR / "route.base.html",
        "out": REPO_ROOT / "research" / "route.base.json",
        "sections": 49,
        "steps": 3395,
    },
    "dlc": {
        "url": "https://eldenring.redmaw.dev/sheets/dlc-walkthrough",
        "raw": RAW_DIR / "route.dlc.html",
        "out": REPO_ROOT / "research" / "route.dlc.json",
        "sections": 20,
        "steps": 1126,
    },
}

WS_RE = re.compile(r"\s+")


def collapse(value: str) -> str:
    """Collapse all whitespace runs to a single space and trim."""
    return WS_RE.sub(" ", value).strip()


def download(url: str, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "er-companion-research/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
        fetched_at = response.headers.get("Date")
    dest.write_bytes(body)
    if fetched_at:
        parsed = datetime.strptime(fetched_at, "%a, %d %b %Y %H:%M:%S %Z")
        return parsed.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_toc(soup: BeautifulSoup) -> dict[str, dict[str, str]]:
    """Map section id -> title/level range from nav#toc.

    The range is a bare text node after the anchor, before the progress span,
    e.g. ``<a>West Limgrave</a> (Levels 10-20)<span>0/0</span>``.
    """
    toc: dict[str, dict[str, str]] = {}
    for item in soup.select("nav#toc li"):
        anchor = item.find("a", href=True)
        if anchor is None:
            continue
        section_id = anchor["href"].lstrip("#")
        if not section_id:
            continue
        clone = BeautifulSoup(str(item), "lxml").find("li")
        for tag in clone.find_all(["a", "span"]):
            tag.decompose()
        range_match = re.search(r"\(([^)]+)\)", collapse(clone.get_text("")))
        toc[section_id] = {
            "title": collapse(anchor.get_text("")),
            "levelRange": range_match.group(1) if range_match else "",
        }
    return toc


def parse_step(label, order: int) -> dict:
    """Build one normalized step from a ``label`` element."""
    checkbox = label.find("input", {"type": "checkbox"})
    if checkbox is None or not checkbox.get("id"):
        raise ValueError("step label without a checkbox id")

    badges: list[str] = []
    for badge in label.select("span.badge"):
        text = collapse(badge.get_text(""))
        if text and text not in badges:
            badges.append(text)

    links = []
    for anchor in label.select("a[href]"):
        url = anchor["href"].strip()
        if not url:
            continue
        links.append({"label": collapse(anchor.get_text("")) or url, "url": url})

    # Preserve punctuation adjacency (e.g. "Varre's"), then collapse runs.
    clone = BeautifulSoup(str(label), "lxml").find("label")
    for tag in clone.find_all(["input", "span"]):
        if tag.name == "input" or "badge" in (tag.get("class") or []):
            tag.decompose()
    text = collapse(clone.get_text(""))

    return {
        "id": checkbox["id"],
        "order": order,
        "text": text,
        "optional": "Optional" in badges,
        "badges": badges,
        "links": links,
    }


def parse_page(soup: BeautifulSoup, game: str) -> list[dict]:
    toc = parse_toc(soup)
    sections = soup.select("main form section")
    if not sections:
        raise ValueError("no 'main form section' elements found")

    out: list[dict] = []
    seen_ids: set[str] = set()
    for section_order, section in enumerate(sections, start=1):
        section_id = section.get("id")
        if not section_id:
            raise ValueError(f"section {section_order} has no id")
        if section_id not in toc:
            raise ValueError(f"section '{section_id}' missing from table of contents")

        heading = BeautifulSoup(str(section.find("h3", recursive=False)), "lxml").find("h3")
        if heading is None:
            raise ValueError(f"section '{section_id}' has no h3 title")
        for button in heading.find_all("button"):
            button.decompose()
        title = collapse(heading.get_text(""))
        expected_title = toc[section_id]["title"]
        if title != expected_title:
            raise ValueError(
                f"section '{section_id}' title mismatch: page '{title}' vs toc '{expected_title}'"
            )

        steps: list[dict] = []
        for label in section.select("label"):
            if label.find("input", {"type": "checkbox"}) is None:
                continue
            if label.find_parent("li", class_="note") is not None:
                continue
            step = parse_step(label, len(steps) + 1)
            if step["id"] in seen_ids:
                raise ValueError(f"duplicate step id '{step['id']}'")
            seen_ids.add(step["id"])
            steps.append(step)

        if not steps:
            raise ValueError(f"section '{section_id}' has no steps")

        out.append(
            {
                "id": section_id,
                "title": title,
                "order": section_order,
                "levelRange": toc[section_id]["levelRange"],
                "steps": steps,
            }
        )

    if len(toc) != len(out):
        raise ValueError(f"table of contents has {len(toc)} entries but page has {len(out)} sections")
    return out


def build(game: str, html_path: Path, source_url: str, fetched_at: str) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "lxml")
    sections = parse_page(soup, game)

    total_steps = sum(len(section["steps"]) for section in sections)
    if len(sections) != PAGES[game]["sections"]:
        raise ValueError(f"{game}: expected {PAGES[game]['sections']} sections, found {len(sections)}")
    if total_steps != PAGES[game]["steps"]:
        raise ValueError(f"{game}: expected {PAGES[game]['steps']} steps, found {total_steps}")

    # Every section id must be unique, and step ids must follow the sheet prefix.
    ids = [section["id"] for section in sections]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{game}: duplicate section ids")
    prefix = "w" if game == "base" else "d"
    for section in sections:
        for step in section["steps"]:
            if not re.fullmatch(rf"{prefix}\d+-\d+", step["id"]):
                raise ValueError(f"{game}: unexpected step id '{step['id']}'")

    return {
        "source": {
            "name": "Redmaw Completion Sheets",
            "url": source_url,
            "fetchedAt": fetched_at,
        },
        "game": game,
        "fetchedAt": fetched_at,
        "sections": sections,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download both source pages")
    parser.add_argument(
        "--fetched-at",
        default=CAPTURED_AT,
        help="ISO-8601 capture timestamp written to the JSON (default: cached capture time)",
    )
    args = parser.parse_args()

    fetched_at_by_game: dict[str, str] = {game: args.fetched_at for game in PAGES}
    if args.refresh:
        for game, page in PAGES.items():
            fetched_at_by_game[game] = download(page["url"], page["raw"])

    for game, page in PAGES.items():
        if not page["raw"].exists():
            fetched_at_by_game[game] = download(page["url"], page["raw"])

        payload = build(game, page["raw"], page["url"], fetched_at_by_game[game])
        page["out"].parent.mkdir(parents=True, exist_ok=True)
        page["out"].write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

        sections = payload["sections"]
        steps = sum(len(section["steps"]) for section in sections)
        optional = sum(1 for s in sections for step in s["steps"] if step["optional"])
        links = sum(len(step["links"]) for s in sections for step in s["steps"])
        print(f"{game}: {len(sections)} sections, {steps} steps, {optional} optional, {links} links")
        print(f"  wrote {page['out'].relative_to(REPO_ROOT)}")

    base = json.loads(PAGES["base"]["out"].read_text(encoding="utf-8"))
    dlc = json.loads(PAGES["dlc"]["out"].read_text(encoding="utf-8"))

    print("\nSamples:")
    samples = [
        (base, 0, 0),
        (base, 0, 3),
        (base, 1, 10),
        (base, 30, 0),
        (dlc, 0, 0),
        (dlc, 2, 3),
    ]
    for payload, section_index, step_index in samples:
        section = payload["sections"][section_index]
        step = section["steps"][step_index]
        print(f"\n{payload['game']} / {section['title']} [{section['levelRange']}] #{step['order']}")
        print(f"  id={step['id']} optional={step['optional']} badges={step['badges']}")
        print(f"  text={step['text']}")
        for link in step["links"][:3]:
            print(f"  link={link['label']} -> {link['url']}")

    print("\nTotals reconciled: base 3395/49, dlc 1126/20")
    return 0


if __name__ == "__main__":
    sys.exit(main())

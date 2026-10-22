#!/usr/bin/env python3
"""Fetch, optimize and bundle official ELDEN RING store art plus OFL fonts.

The companion is an unofficial fan project. It never hotlinks artwork at
runtime: this script downloads official Steam store assets, writes optimized
copies into ``public/art``, bundles SIL Open Font License fonts into
``public/fonts`` and records provenance in ``research/art/manifest.json`` and
``docs/ART_CREDITS.md``.

Originals are kept under ``research/art/originals`` (git-ignored) so the
pipeline is reproducible offline once fetched.

Usage:
    python3 scripts/research/fetch_art.py            # fetch missing, rebuild all
    python3 scripts/research/fetch_art.py --refresh  # re-download everything
    python3 scripts/research/fetch_art.py --verify   # checks only, no network

Requires: Python 3.10+, Pillow, fonttools (+ woff2_compress/woff2_decompress).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "research" / "raw"
ORIGINALS = ROOT / "research" / "art" / "originals"
ORIGINAL_FONTS = ORIGINALS / "fonts"
PUBLIC_ART = ROOT / "public" / "art"
PUBLIC_FONTS = ROOT / "public" / "fonts"
FONT_LICENSES = PUBLIC_FONTS / "licenses"
MANIFEST = ROOT / "research" / "art" / "manifest.json"
CREDITS = ROOT / "docs" / "ART_CREDITS.md"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

BASE_APP = 1245620
DLC_APP = 2778580
STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps/{app}/{name}"
APPDETAILS = "https://store.steampowered.com/api/appdetails?appids={app}&l=en"

BASE_SHOTS = 6
DLC_SHOTS = 4
MAX_PUBLIC_ART_BYTES = 8 * 1024 * 1024
JPEG_QUALITY = 82

COPYRIGHT_BASE = (
    "ELDEN RING \u2014 \u00a9 FromSoftware, Inc. / Bandai Namco Entertainment Inc. "
    "Official Steam store asset."
)
COPYRIGHT_DLC = (
    "ELDEN RING Shadow of the Erdtree \u2014 \u00a9 FromSoftware, Inc. / "
    "Bandai Namco Entertainment Inc. Official Steam store asset."
)

DISCLAIMER = (
    "Unofficial fan project. ELDEN RING, Shadow of the Erdtree and all related "
    "artwork are \u00a9 FromSoftware, Inc. and Bandai Namco Entertainment Inc. "
    "This project is not affiliated with, endorsed by or sponsored by "
    "FromSoftware, Bandai Namco Entertainment, or Valve/Steam. Artwork is "
    "bundled from official store/press material for a free, non-commercial "
    "companion and remains the property of its owners."
)

STATIC_ASSETS = [
    {
        "id": "hero-erdtree",
        "app": BASE_APP,
        "remote": "library_hero_2x.jpg",
        "file": "hero-erdtree.jpg",
        "kind": "hero",
        "max_width": 2400,
        "credit": COPYRIGHT_BASE,
    },
    {
        "id": "vertical-erdtree",
        "app": BASE_APP,
        "remote": "library_600x900_2x.jpg",
        "file": "vertical-erdtree.jpg",
        "kind": "cover",
        "max_height": 900,
        "credit": COPYRIGHT_BASE,
    },
    {
        "id": "logo-elden-ring",
        "app": BASE_APP,
        "remote": "logo.png",
        "file": "logo-elden-ring.png",
        "kind": "logo",
        "max_width": 900,
        "format": "PNG",
        "credit": COPYRIGHT_BASE,
    },
    {
        "id": "bg-world",
        "app": BASE_APP,
        "remote": "page.bg.jpg",
        "file": "bg-world.jpg",
        "kind": "background",
        "max_width": 2400,
        "credit": COPYRIGHT_BASE,
    },
    {
        "id": "hero-sote",
        "app": DLC_APP,
        "remote": "page.bg.jpg",
        "file": "hero-sote.jpg",
        "kind": "hero",
        "max_width": 2400,
        "credit": COPYRIGHT_DLC,
        "note": (
            "The Shadow of the Erdtree capsule is only 616x353, so the official "
            "1438x810 page background is used as the hero image; it is not "
            "upscaled."
        ),
    },
    {
        "id": "sotet-capsule",
        "app": DLC_APP,
        "remote": "capsule_616x353.jpg",
        "file": "sotet-capsule.jpg",
        "kind": "capsule",
        "credit": COPYRIGHT_DLC,
    },
    {
        "id": "sotet-header",
        "app": DLC_APP,
        "remote": "header.jpg",
        "file": "sotet-header.jpg",
        "kind": "header",
        "credit": COPYRIGHT_DLC,
    },
]

FONTS = [
    {
        "family": "Cinzel",
        "style": "normal",
        "weight": 400,
        "file": "cinzel-400.woff2",
        "url": "https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt79mT7.woff2",
        "credit": "Cinzel by Natanael Gama / The Cinzel Project Authors",
        "project_url": "https://github.com/NDISCOVER/Cinzel",
    },
    {
        "family": "Cinzel",
        "style": "normal",
        "weight": 600,
        "file": "cinzel-600.woff2",
        "url": "https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt79mT7.woff2",
        "credit": "Cinzel by Natanael Gama / The Cinzel Project Authors",
        "project_url": "https://github.com/NDISCOVER/Cinzel",
    },
    {
        "family": "Cinzel",
        "style": "normal",
        "weight": 700,
        "file": "cinzel-700.woff2",
        "url": "https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt79mT7.woff2",
        "credit": "Cinzel by Natanael Gama / The Cinzel Project Authors",
        "project_url": "https://github.com/NDISCOVER/Cinzel",
    },
    {
        "family": "EB Garamond",
        "style": "normal",
        "weight": 400,
        "file": "ebgaramond-400.woff2",
        "url": "https://fonts.gstatic.com/s/ebgaramond/v33/SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2",
        "credit": "EB Garamond by Octavio Pardo / The EB Garamond Project Authors",
        "project_url": "https://github.com/octaviopardo/EBGaramond12",
    },
    {
        "family": "EB Garamond",
        "style": "normal",
        "weight": 500,
        "file": "ebgaramond-500.woff2",
        "url": "https://fonts.gstatic.com/s/ebgaramond/v33/SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2",
        "credit": "EB Garamond by Octavio Pardo / The EB Garamond Project Authors",
        "project_url": "https://github.com/octaviopardo/EBGaramond12",
    },
    {
        "family": "EB Garamond",
        "style": "normal",
        "weight": 600,
        "file": "ebgaramond-600.woff2",
        "url": "https://fonts.gstatic.com/s/ebgaramond/v33/SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2",
        "credit": "EB Garamond by Octavio Pardo / The EB Garamond Project Authors",
        "project_url": "https://github.com/octaviopardo/EBGaramond12",
    },
    {
        "family": "EB Garamond",
        "style": "italic",
        "weight": 400,
        "file": "ebgaramond-italic-400.woff2",
        "url": "https://fonts.gstatic.com/s/ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QL99U6g.woff2",
        "credit": "EB Garamond by Octavio Pardo / The EB Garamond Project Authors",
        "project_url": "https://github.com/octaviopardo/EBGaramond12",
    },
]

FONT_LICENSES_META = [
    {
        "family": "Cinzel",
        "file": "OFL-Cinzel.txt",
        "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt",
        "credit": "The Cinzel Project Authors",
    },
    {
        "family": "EB Garamond",
        "file": "OFL-EBGaramond.txt",
        "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/OFL.txt",
        "credit": "The EB Garamond Project Authors",
    },
]

OFL_URL = "https://scripts.sil.org/OFL"


def log(message: str) -> None:
    print(message, flush=True)


def download(url: str, destination: Path, force: bool = False) -> Path:
    """Download *url* to *destination* unless a cached copy already exists."""
    if destination.exists() and destination.stat().st_size > 0 and not force:
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = response.read()
    if not payload:
        raise RuntimeError(f"empty response for {url}")
    destination.write_bytes(payload)
    log(f"  fetched {destination.relative_to(ROOT)} ({len(payload):,} bytes)")
    return destination


def load_appdetails(app: int, refresh: bool) -> dict:
    """Return the ``data`` object for a Steam app, cached under research/raw."""
    cache = RAW_DIR / f"steam_{app}.json"
    if refresh or not cache.exists():
        payload = urllib.request.urlopen(
            urllib.request.Request(
                APPDETAILS.format(app=app), headers={"User-Agent": USER_AGENT}
            ),
            timeout=90,
        ).read()
        if not payload:
            raise RuntimeError(f"empty appdetails response for {app}")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(payload)
        log(f"  fetched appdetails for {app}")
    document = json.loads(cache.read_text(encoding="utf-8"))
    entry = document.get(str(app), {})
    if not entry.get("success") or "data" not in entry:
        raise RuntimeError(f"Steam appdetails failed for {app}")
    return entry["data"]


def resize_to_fit(image: Image.Image, max_width: int | None, max_height: int | None) -> Image.Image:
    """Downscale to the given bounds; never upscale."""
    width, height = image.size
    scale = 1.0
    if max_width:
        scale = min(scale, max_width / width)
    if max_height:
        scale = min(scale, max_height / height)
    if scale >= 1.0:
        return image
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def process_image(
    source: Path,
    destination: Path,
    *,
    max_width: int | None = None,
    max_height: int | None = None,
    image_format: str = "JPEG",
) -> tuple[int, int]:
    with Image.open(source) as opened:
        opened.load()
        width, height = opened.size
        image = resize_to_fit(opened, max_width, max_height)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if image_format == "PNG":
            if image.mode not in ("RGBA", "LA"):
                image = image.convert("RGBA")
            image.save(destination, "PNG", optimize=True)
        else:
            image.save(
                destination,
                "JPEG",
                quality=JPEG_QUALITY,
                optimize=True,
                progressive=True,
                subsampling=2,
            )
        out_width, out_height = image.size
    if out_width > width or out_height > height:
        raise AssertionError(f"{destination.name} was upscaled: {width}x{height}")
    log(
        f"  wrote {destination.relative_to(ROOT)} "
        f"{out_width}x{out_height} ({destination.stat().st_size:,} bytes)"
    )
    return out_width, out_height


def run_checked(command: list[str], workdir: Path) -> None:
    result = subprocess.run(
        command,
        cwd=workdir,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"{' '.join(command)} failed:\n{result.stderr.decode('utf-8', 'replace')}"
        )


def decompress_woff2(source: Path, workdir: Path) -> Path:
    local = workdir / source.name
    shutil.copyfile(source, local)
    run_checked(["woff2_decompress", local.name], workdir)
    return local.with_suffix(".ttf")


def font_details(ttf: Path) -> tuple[bool, int | None]:
    """Return (is_variable, declared weight) for a decompressed font."""
    from fontTools.ttLib import TTFont

    with TTFont(ttf) as font:
        variable = "fvar" in font
        weight = font["OS/2"].usWeightClass if "OS/2" in font else None
    return variable, weight


def pin_weight(ttf: Path, weight: int, workdir: Path) -> Path:
    """Instantiate the ``wght`` axis; static fonts are passed through."""
    variable, static_weight = font_details(ttf)
    if not variable:
        if static_weight != weight:
            raise AssertionError(
                f"{ttf.name} is static at weight {static_weight}, requested {weight}"
            )
        return ttf
    output = ttf.with_name(f"{ttf.stem}-w{weight}.ttf")
    run_checked(
        [
            "fonttools",
            "varLib.instancer",
            str(ttf),
            f"wght={weight}",
            "--output",
            str(output),
            "--no-recalc-timestamp",
            "--quiet",
        ],
        workdir,
    )
    return output


def build_font(entry: dict, force: bool) -> dict:
    cache = ORIGINAL_FONTS / Path(entry["url"]).name
    download(entry["url"], cache, force=force)
    if cache.read_bytes()[:4] != b"wOF2":
        raise AssertionError(f"not a WOFF2 file: {cache}")

    destination = PUBLIC_FONTS / entry["file"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="er-font-") as tmp:
        workdir = Path(tmp)
        ttf = decompress_woff2(cache, workdir)
        instance = pin_weight(ttf, entry["weight"], workdir)
        run_checked(["woff2_compress", instance.name], workdir)
        produced = instance.with_suffix(".woff2")
        if produced.read_bytes()[:4] != b"wOF2":
            raise AssertionError(f"compression failed for {entry['file']}")
        shutil.copyfile(produced, destination)

    if destination.stat().st_size == 0:
        raise AssertionError(f"empty font file: {destination}")
    log(
        f"  wrote {destination.relative_to(ROOT)} "
        f"({destination.stat().st_size:,} bytes, weight {entry['weight']})"
    )
    return {
        "family": entry["family"],
        "style": entry["style"],
        "weight": entry["weight"],
        "file": str(destination.relative_to(ROOT)),
        "sourceUrl": entry["url"],
        "projectUrl": entry["project_url"],
        "license": "SIL Open Font License 1.1 (OFL-1.1)",
        "licenseUrl": OFL_URL,
        "licenseFile": str(
            (FONT_LICENSES / f"OFL-{entry['family'].replace(' ', '')}.txt").relative_to(ROOT)
        ),
        "format": "woff2",
        "subset": "latin",
        "credit": entry["credit"],
        "bytes": destination.stat().st_size,
    }


def build_font_css(fonts: list[dict]) -> str:
    lines = [
        "/* Bundled fonts for offline use \u2014 generated by scripts/research/fetch_art.py.",
        " * Cinzel and EB Garamond are licensed under the SIL Open Font License 1.1;",
        " * see ./licenses/ and ../../docs/ART_CREDITS.md.",
        " * Each file is the Google Fonts latin subset, pinned to a single weight. */",
        "",
    ]
    for font in fonts:
        lines.extend(
            [
                "@font-face {",
                f"  font-family: '{font['family']}';",
                f"  font-style: {font['style']};",
                f"  font-weight: {font['weight']};",
                "  font-display: swap;",
                f"  src: url('./{Path(font['file']).name}') format('woff2');",
                "}",
                "",
            ]
        )
    return "\n".join(lines)


def write_credits(manifest: dict) -> None:
    lines = [
        "# Artwork and font credits",
        "",
        "> **Unofficial fan project.** ELDEN RING and ELDEN RING Shadow of the Erdtree are",
        "> trademarks of FromSoftware, Inc. and Bandai Namco Entertainment Inc. All game",
        "> artwork, logos and screenshots are \u00a9 FromSoftware, Inc. / Bandai Namco",
        "> Entertainment Inc. This project is not affiliated with, endorsed by or sponsored",
        "> by FromSoftware, Bandai Namco Entertainment, or Valve/Steam.",
        "",
        "This companion is a free, non-commercial fan project. It bundles only official",
        "store/press artwork taken from the public Steam store pages for ELDEN RING",
        "(app 1245620) and ELDEN RING Shadow of the Erdtree (app 2778580), plus fonts",
        "released under the SIL Open Font License 1.1. No user-uploaded or",
        "watermarked wallpaper-site art is used, and nothing is hotlinked at runtime:",
        "every file below is served from this repository so the app works offline.",
        "",
        "Primary sources:",
        "",
        "- [ELDEN RING on Steam](https://store.steampowered.com/app/1245620/ELDEN_RING/)",
        "- [Shadow of the Erdtree on Steam](https://store.steampowered.com/app/2778580/ELDEN_RING_Shadow_of_the_Erdtree/)",
        "- [Steam appdetails API (base game)](https://store.steampowered.com/api/appdetails?appids=1245620&l=en)",
        "- [Steam appdetails API (expansion)](https://store.steampowered.com/api/appdetails?appids=2778580&l=en)",
        "",
        "Artwork remains the property of its copyright owners and is used here for",
        "identification and commentary in a non-commercial fan work. Rights holders may",
        "request removal at any time.",
        "",
        "## Bundled artwork",
        "",
        "| File | Kind | Size | Source | Copyright |",
        "| --- | --- | --- | --- | --- |",
    ]
    for asset in manifest["assets"]:
        lines.append(
            f"| `{asset['file']}` | {asset['kind']} | "
            f"{asset['width']}\u00d7{asset['height']} | "
            f"[Steam]({asset['sourceUrl']}) | "
            f"FromSoftware / Bandai Namco Entertainment |"
        )
    lines.extend(
        [
            "",
            "Files are optimized copies, downscaled where they exceed the caps",
            "(hero/background max 2400px wide, screenshots max 1600px wide,",
            "capsule/vertical art max 900px tall, logo max 900px wide) and encoded as",
            "JPEG quality 82 or optimized PNG. Nothing is upscaled.",
            "The untouched originals live in `research/art/originals/` (git-ignored).",
            "",
            "The Shadow of the Erdtree hero (`hero-sote.jpg`) uses the official 1438x810",
            "page background rather than the 616x353 capsule, which is too small to",
            "scale up cleanly. The capsule and header are bundled separately for",
            "smaller placements.",
            "",
            "## Fonts",
            "",
            "Cinzel and EB Garamond are bundled as WOFF2 latin subsets. Each file is",
            "the upstream Google Fonts latin subset pinned to a single weight (variable",
            "fonts are instanced; the EB Garamond italic subset is already static).",
            "Both families are licensed under the **SIL Open Font License, Version 1.1**",
            f"({OFL_URL}), which permits bundling and redistribution. The generated",
            "`public/fonts/fonts.css` declares all seven faces; link it from the app",
            '(e.g. `<link rel="stylesheet" href="/fonts/fonts.css">`) so no network',
            "request to Google Fonts is needed.",
            "",
            "| Family | Weight | Style | File | License | Upstream |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for font in manifest["fonts"]:
        lines.append(
            f"| {font['family']} | {font['weight']} | {font['style']} | "
            f"`{font['file']}` | OFL-1.1 | "
            f"[Google Fonts]({font['sourceUrl']}) |"
        )
    lines.extend(
        [
            "",
            "Full license texts are bundled at:",
            "",
        ]
    )
    for license_meta in manifest["fontLicenses"]:
        lines.append(
            f"- `{license_meta['file']}` \u2014 {license_meta['family']} "
            f"({license_meta['credit']}), downloaded from "
            f"[Google Fonts]({license_meta['sourceUrl']})"
        )
    lines.extend(
        [
            "",
            "The license text is also available at " + OFL_URL + ".",
            "",
            "## Regenerating",
            "",
            "```bash",
            "python3 scripts/research/fetch_art.py",
            "```",
            "",
            "The script verifies every file exists, is non-empty, matches its recorded",
            "dimensions, and keeps `public/art` under 8 MB. Provenance for each asset is",
            "stored in `research/art/manifest.json`.",
            "",
        ]
    )
    CREDITS.parent.mkdir(parents=True, exist_ok=True)
    CREDITS.write_text("\n".join(lines), encoding="utf-8")
    log(f"  wrote {CREDITS.relative_to(ROOT)}")


def gather_assets(refresh: bool) -> list[dict]:
    base = load_appdetails(BASE_APP, refresh)
    dlc = load_appdetails(DLC_APP, refresh)
    base_shots = base.get("screenshots") or []
    dlc_shots = dlc.get("screenshots") or []
    if len(base_shots) < BASE_SHOTS:
        raise AssertionError(f"base app exposes only {len(base_shots)} screenshots")
    if len(dlc_shots) < DLC_SHOTS:
        raise AssertionError(f"DLC app exposes only {len(dlc_shots)} screenshots")

    plan: list[dict] = []
    for asset in STATIC_ASSETS:
        plan.append(
            {
                **asset,
                "sourceUrl": STEAM_CDN.format(app=asset["app"], name=asset["remote"]),
            }
        )
    for index, shot in enumerate(base_shots[:BASE_SHOTS], start=1):
        plan.append(
            {
                "id": f"shot-erdtree-{index:02d}",
                "file": f"shot-erdtree-{index:02d}.jpg",
                "kind": "screenshot",
                "sourceUrl": shot["path_full"],
                "max_width": 1600,
                "credit": COPYRIGHT_BASE,
            }
        )
    for index, shot in enumerate(dlc_shots[:DLC_SHOTS], start=1):
        plan.append(
            {
                "id": f"shot-sote-{index:02d}",
                "file": f"shot-sote-{index:02d}.jpg",
                "kind": "screenshot",
                "sourceUrl": shot["path_full"],
                "max_width": 1600,
                "credit": COPYRIGHT_DLC,
            }
        )
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download cached files")
    parser.add_argument("--verify", action="store_true", help="verify outputs only")
    args = parser.parse_args()

    for directory in (ORIGINALS, ORIGINAL_FONTS, PUBLIC_ART, PUBLIC_FONTS, FONT_LICENSES):
        directory.mkdir(parents=True, exist_ok=True)

    if not args.verify:
        log("Fetching Steam metadata\u2026")
        plan = gather_assets(args.refresh)
        if len(plan) != 17:
            raise AssertionError(f"expected 17 artwork assets, planned {len(plan)}")

        log("Processing artwork\u2026")
        assets: list[dict] = []
        for asset in plan:
            extension = ".png" if asset.get("format") == "PNG" else ".jpg"
            original = ORIGINALS / f"{asset['id']}{extension}"
            download(asset["sourceUrl"], original, force=args.refresh)
            with Image.open(original) as opened:
                original_width, original_height = opened.size
            destination = PUBLIC_ART / asset["file"]
            width, height = process_image(
                original,
                destination,
                max_width=asset.get("max_width"),
                max_height=asset.get("max_height"),
                image_format=asset.get("format", "JPEG"),
            )
            entry = {
                "id": asset["id"],
                "file": str(destination.relative_to(ROOT)),
                "sourceUrl": asset["sourceUrl"],
                "width": width,
                "height": height,
                "kind": asset["kind"],
                "credit": asset["credit"],
                "originalWidth": original_width,
                "originalHeight": original_height,
                "bytes": destination.stat().st_size,
            }
            if asset.get("note"):
                entry["note"] = asset["note"]
            assets.append(entry)

        log("Bundling fonts\u2026")
        fonts: list[dict] = []
        for font in FONTS:
            fonts.append(build_font(font, args.refresh))
        if len(fonts) != 7:
            raise AssertionError(f"expected 7 font faces, built {len(fonts)}")

        (PUBLIC_FONTS / "fonts.css").write_text(build_font_css(fonts), encoding="utf-8")
        log(f"  wrote {(PUBLIC_FONTS / 'fonts.css').relative_to(ROOT)}")

        font_licenses: list[dict] = []
        for meta in FONT_LICENSES_META:
            destination = FONT_LICENSES / meta["file"]
            download(meta["url"], destination, force=args.refresh)
            text = destination.read_text(encoding="utf-8")
            if "SIL OPEN FONT LICENSE" not in text:
                raise AssertionError(f"unexpected license text in {destination}")
            font_licenses.append(
                {
                    "family": meta["family"],
                    "file": str(destination.relative_to(ROOT)),
                    "sourceUrl": meta["url"],
                    "license": "SIL Open Font License 1.1 (OFL-1.1)",
                    "credit": meta["credit"],
                }
            )

        manifest = {
            "source": (
                "Steam / official store assets (ELDEN RING app 1245620; "
                "ELDEN RING Shadow of the Erdtree app 2778580)"
            ),
            "disclaimer": DISCLAIMER,
            "assets": assets,
            "fonts": fonts,
            "fontLicenses": font_licenses,
            "fontsCss": str((PUBLIC_FONTS / "fonts.css").relative_to(ROOT)),
            "notes": [
                "All artwork is bundled locally; the app must not hotlink these URLs.",
                "Originals are kept in research/art/originals (git-ignored).",
                "Shadow of the Erdtree hero uses the official 1438x810 page background "
                "because the 616x353 capsule is too small to scale up.",
            ],
        }
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        log(f"  wrote {MANIFEST.relative_to(ROOT)}")
        write_credits(manifest)
    else:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    # ---- verification ---------------------------------------------------
    if len(manifest["assets"]) != 17:
        raise AssertionError(f"manifest has {len(manifest['assets'])} assets, expected 17")
    if len(manifest["fonts"]) != 7:
        raise AssertionError(f"manifest has {len(manifest['fonts'])} fonts, expected 7")
    if not DISCLAIMER.startswith("Unofficial fan project."):
        raise AssertionError("disclaimer must state the project is unofficial")

    for asset in manifest["assets"]:
        path = ROOT / asset["file"]
        if not path.exists():
            raise AssertionError(f"missing asset: {asset['file']}")
        if path.stat().st_size == 0:
            raise AssertionError(f"empty asset: {asset['file']}")
        with Image.open(path) as image:
            if image.size != (asset["width"], asset["height"]):
                raise AssertionError(
                    f"{asset['file']}: recorded {asset['width']}x{asset['height']} "
                    f"but file is {image.size[0]}x{image.size[1]}"
                )
        if not asset["sourceUrl"].startswith("https://"):
            raise AssertionError(f"{asset['file']}: source URL must be https")

    for font in manifest["fonts"]:
        path = ROOT / font["file"]
        if not path.exists() or path.stat().st_size == 0:
            raise AssertionError(f"missing font: {font['file']}")
        if path.read_bytes()[:4] != b"wOF2":
            raise AssertionError(f"{font['file']} is not WOFF2")

    for license_meta in manifest["fontLicenses"]:
        path = ROOT / license_meta["file"]
        if not path.exists() or "SIL OPEN FONT LICENSE" not in path.read_text(encoding="utf-8"):
            raise AssertionError(f"bad license file: {license_meta['file']}")

    if not CREDITS.exists():
        raise AssertionError("docs/ART_CREDITS.md is missing")

    art_bytes = sum(path.stat().st_size for path in PUBLIC_ART.rglob("*") if path.is_file())
    if art_bytes > MAX_PUBLIC_ART_BYTES:
        raise AssertionError(f"public/art is {art_bytes:,} bytes (over 8 MB)")
    if art_bytes == 0:
        raise AssertionError("public/art is empty")

    hero = next(asset for asset in manifest["assets"] if asset["id"] == "hero-erdtree")
    if hero["height"] > 775:
        raise AssertionError("hero should be no taller than the 2400px-wide resize")
    logo = next(asset for asset in manifest["assets"] if asset["id"] == "logo-elden-ring")
    if logo["width"] > 900:
        raise AssertionError("logo should be at most 900px wide")
    vertical = next(asset for asset in manifest["assets"] if asset["id"] == "vertical-erdtree")
    if vertical["height"] > 900:
        raise AssertionError("vertical art should be at most 900px tall")

    log("")
    log(f"OK  {len(manifest['assets'])} images  |  {len(manifest['fonts'])} font faces")
    log(f"    public/art total: {art_bytes:,} bytes ({art_bytes / 1024 / 1024:.2f} MB)")
    log(f"    manifest: {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        sys.exit(1)

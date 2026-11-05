#!/usr/bin/env python3
"""Generate README image assets for dsh-ar-aging (docs/assets/).

Outputs (idempotent overwrite):
  dsh-ar-aging-flow-light.svg / dsh-ar-aging-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (ar.ingest, ar.aging, ar.export, bucket keys, paths), so all five
      README languages share the same pair. No CJK text is drawn, so this
      repo needs no Pillow rasterization and no CJK font probe.

Existing assets (docs/assets/quickstart.png, quickstart.log) are real
captured output and are kept untouched.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ (standard library only)
"""
from __future__ import annotations

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e"),
}

# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark). Tokens only: tool names, bucket keys,
# paths, risk levels — no natural-language sentences, so the same pair of
# files serves all five README languages.
# ---------------------------------------------------------------------------
FLOW_NODES = [
    ("ar-ledger.csv", "UTF-8 · RFC 4180 · ≤20 MB"),
    ("ar.ingest", "validate · normalize · R0"),
    ("ar.aging", "0-30/31-60/61-90/91-180/180+ · R0"),
    ("ar.export", "layout=summary|detail · R1"),
    ("exports/*.csv", "$DSH_HOME/dsh-ar-aging/"),
]


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1200, 400
    nw, nh, gap = 190, 96, 40
    y0 = 150
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="dsh-ar-aging pipeline">',
        f'<title>dsh-ar-aging pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="62" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">'
        f'dsh-ar-aging</text>',
        f'<text x="60" y="94" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="16">ar.ingest → ar.aging → ar.export · '
        f'local CSV only</text>',
        f'<line x1="60" y1="116" x2="1140" y2="116" stroke="{s["border"]}"/>',
    ]
    for i, (label, sub) in enumerate(FLOW_NODES):
        x = 60 + i * (nw + gap)
        accent = GREEN[skin] if i == len(FLOW_NODES) - 1 else (
            FAMILY if 1 <= i <= 3 else s["border"])
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 40}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="15" font-weight="700">{label}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 68}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="11">{sub}</text>')
        if i < len(FLOW_NODES) - 1:
            ax = x + nw + 6
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 12}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 14} {ay - 7}l10 7-10 7" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
    # bottom strip: risk + locality tokens
    parts.append(
        f'<rect x="60" y="290" width="1080" height="52" rx="12" '
        f'fill="{s["box"]}" stroke="{FAMILY}" stroke-width="2"/>')
    parts.append(
        f'<text x="600" y="322" fill="{s["text"]}" text-anchor="middle" '
        f'font-family="ui-monospace,monospace" font-size="14">'
        f'R0 read-only: ar.ingest · ar.aging ｜ R1 local write: ar.export '
        f'｜ no network · no model call · source CSV never modified</text>')
    parts.append(
        f'<text x="60" y="378" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">age = as_of − invoice_date (UTC days) · '
        f'overdue ⟺ due_date &lt; as_of · one CSV = one currency</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-ar-aging-flow-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 2 SVG assets to docs/assets/")


if __name__ == "__main__":
    main()

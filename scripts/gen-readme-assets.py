#!/usr/bin/env python3
"""Generate README visuals for dsh-ar-aging (docs/assets/).

Outputs (idempotent overwrite):
  dsh-ar-aging-hero-{zh,en}-{light,dark}.webp   1440x576 raster hero (Pillow)
  dsh-ar-aging-flow-v5-{light,dark}.svg         1100x660 hand-written SVG

Design notes
------------
* Hero: left column is prose (kicker / title / two value lines / one subtitle /
  one meta / footer), right column is this repo's own semantic graphic — the
  fixed five aging buckets, the overdue ratio ring and the top-overdue list,
  all carrying the numbers of the checked-in quickstart fixture
  (samples/quickstart/expected/result.json: 13 rows, 6 customers, CNY,
  as_of 2026-06-30, outstanding 773.0 万, overdue 549.5 万, ratio 0.7113).
* Flow: a staircase grammar, not a row of boxes. The five fixed buckets climb
  as steps whose bar width is each bucket's share of outstanding; two clock
  rails split the same dataset — CLOCK A (invoice_date -> age_days -> bucket)
  and CLOCK B (due_date -> days_past_due -> overdue) — then merge into the
  report fields and the CSV export. Text is token-only (tool names, field
  names, bucket keys, paths, numbers), so all five READMEs share one pair.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ with Pillow; Windows fonts msyh.ttc / msyhbd.ttc /
           consola.ttf / segoeui.ttf / segoeuib.ttf.
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"
FONT_EN_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_EN, FONT_EN_BOLD):
    if not os.path.exists(_p):
        raise SystemExit(f"FATAL: font missing: {_p}")

WARNINGS: list[str] = []

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
        card_edge="#e4e1ee", zone="#f5f2fb", zone_edge="#e3def1",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", warn="#c2410c", good="#16a34a",
        pill="#ece7f9", track="#eae6f3", grid="#e7e4f0",
        shadow=(32, 26, 64),
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
        card_edge="#2e374b", zone="#171e2d", zone_edge="#2b3448",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", warn="#d9a03c", good="#3fb950",
        pill="#242d42", track="#243049", grid="#1e2636",
        shadow=(0, 0, 0),
    ),
}

# ---------------------------------------------------------------- primitives


def font(size, kind="cjk"):
    return ImageFont.truetype(
        {"cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD, "mono": FONT_MONO,
         "en": FONT_EN, "en_bold": FONT_EN_BOLD}[kind], max(8, int(size)))


def hx(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = 0.25 * (y / h) + 0.75 * (y / h) ** 1.6
        d.line([(0, y), (w, y)],
               fill=tuple(int(p + (q - p) * t) for p, q in zip(hx(c1), hx(c2))))
    return img


def glow(img, cx, cy, r, color, alpha=40):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(10, 0, -1):
        rr = r * i / 10
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 11)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img, box, skin, radius=20, shadow=26):
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 5, y0 + i // 2, x1 + i // 5, y1 + i],
                             radius=radius + i // 5,
                             fill=skin["shadow"] + (int(7 * (1 - i / shadow)),))
    base = Image.alpha_composite(
        img.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(skin["card"]),
                        outline=hx(skin["card_edge"]), width=2)
    return base.convert("RGB")


def pill(img, xy, text, skin, size=20, kind="cjk_bold", fg=None, bg=None):
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    tw = d.textlength(text, font=f)
    x, y = xy
    h = size + 22
    d.rounded_rectangle([x, y, x + tw + 36, y + h], radius=h // 2,
                        fill=hx(bg or skin["pill"]))
    d.text((x + 18, y + 10), text, font=f, fill=hx(fg or skin["accent"]))
    return img


def fit(d, text, kind, max_w, size, min_size=14):
    size = int(size)
    while size > min_size:
        if d.textlength(text, font=font(size, kind)) <= max_w:
            return size
        size -= 2
    return max(min_size, size)


def write(img, xy, text, skin, size, kind="cjk", color="text",
          max_w=None, min_size=14, tag=""):
    d = ImageDraw.Draw(img)
    if max_w is not None:
        size = fit(d, text, kind, max_w, size, min_size)
        if d.textlength(text, font=font(size, kind)) > max_w:
            WARNINGS.append(f"{tag}: {text!r} exceeds {max_w}px at {size}px")
            print(f"WARN {tag}: {text!r} exceeds {max_w}px at {size}px")
    d.text(xy, text, font=font(size, kind), fill=hx(skin[color]))
    return size


# --------------------------------------------------------------- hero model

HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 应收账龄插件",
        title="dsh-ar-aging",
        value=["一份 CSV，五个固定账龄桶", "逾期占比与 Top 客户排序"],
        sub="读本地 CSV → 五桶账龄 → 导出 CSV，全程本地",
        meta="R0 只读 / R1 本地写 · 无网络 · 不调模型",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        bucket_title="固定五桶账龄",
        bucket_sub="按开票日算账龄 · 占比按未收金额",
        bucket_foot="张数 4 · 2 · 2 · 1 · 2",
        bucket_note="as_of 2026-06-30 · CNY · quickstart 样例",
        ratio_title="逾期占比",
        ratio_caption=["未收 7.73M · 13 张发票", "逾期 5.50M / 未到期 2.23M"],
        names=["北方重工设备有限公司", "华东精密制造有限公司", "江南纺织, 苏州"],
        top_title="Top 逾期客户",
        top_note="top_n=5",
    ),
    "en": dict(
        kicker="DeepSeek Harness · AR aging plugin",
        title="dsh-ar-aging",
        value=["One CSV in, five fixed buckets out",
               "Overdue ratio and top overdue list"],
        sub="Local CSV → five-bucket aging → CSV, all offline",
        meta="R0 read-only / R1 local write · no network · no model call",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        bucket_title="five fixed buckets",
        bucket_sub="age from invoice_date · share of outstanding",
        bucket_foot="invoices 4 · 2 · 2 · 1 · 2",
        bucket_note="as_of 2026-06-30 · CNY · quickstart fixture",
        ratio_title="overdue ratio",
        ratio_caption=["outstanding 7.73M · 13 invoices",
                       "overdue 5.50M / not due 2.23M"],
        names=["北方重工设备有限公司", "华东精密制造有限公司", "江南纺织, 苏州"],
        top_title="Top overdue",
        top_note="top_n=5",
    ),
}

# real quickstart fixture numbers (see samples/quickstart/expected/result.json)
BUCKETS = [
    ("0-30", "2.23M", 0.2887, 223000000),
    ("31-60", "1.62M", 0.2097, 162000000),
    ("61-90", "0.46M", 0.0589, 45500000),
    ("91-180", "2.10M", 0.2718, 210000000),
    ("180+", "1.32M", 0.1709, 132000000),
]
TOP = [("3.30M", "177d"), ("0.96M", "22d"), ("0.66M", "1d")]
OVERDUE_RATIO = 0.7113


def hero(lang, skin_name):
    s = SKIN[skin_name]
    h_model = HERO[lang]
    w, h = 1440, 576
    img = gradient(w, h, s["bg_from"], s["bg_to"])
    img = glow(img, 1200, 40, 430, hx(s["accent"]), 22 if skin_name == "light" else 40)
    img = glow(img, 120, 560, 300, hx(s["accent"]), 10 if skin_name == "light" else 16)

    # ---------------------------------------------------------- left column
    m = 60
    img = pill(img, (m, 62), h_model["kicker"], s,
               size=20 if lang == "zh" else 19,
               kind="cjk_bold" if lang == "zh" else "en_bold")

    d = ImageDraw.Draw(img)
    tsize = fit(d, h_model["title"], "mono", 540, 84, 64)
    d.text((m, 124), h_model["title"], font=font(tsize, "mono"),
           fill=hx(s["text"]))

    vkind = "cjk_bold" if lang == "zh" else "en_bold"
    vmax = 540
    vsize = 38 if lang == "zh" else 32
    for line in h_model["value"]:
        vsize = min(vsize, fit(d, line, vkind, vmax, vsize, 26))
    for i, line in enumerate(h_model["value"]):
        write(img, (m, 258 + i * (vsize + 14)), line, s, vsize, vkind,
              "text", vmax, 26, f"hero.{lang}.value{i}")

    write(img, (m + 2, 374), h_model["sub"], s, 25, "cjk" if lang == "zh" else "en",
          "sub", 540, 21, f"hero.{lang}.sub")
    write(img, (m + 2, 436), h_model["meta"], s, 20, "cjk" if lang == "zh" else "en",
          "faint", 540, 17, f"hero.{lang}.meta")

    d = ImageDraw.Draw(img)
    d.line([m + 2, 474, m + 540, 474], fill=hx(s["grid"]), width=2)
    write(img, (m + 2, 492), h_model["foot"], s, 17, "en", "faint", 540, 14,
          f"hero.{lang}.foot")

    # ------------------------------------------- card L: five fixed buckets
    img = card(img, (660, 48, 1030, 504), s, radius=22)
    d = ImageDraw.Draw(img)
    write(img, (686, 78), h_model["bucket_title"], s, 25, "cjk_bold" if lang == "zh"
          else "en_bold", "text", 320, 20, f"hero.{lang}.bucket_title")
    write(img, (686, 112), h_model["bucket_sub"], s, 17, "cjk" if lang == "zh" else "en",
          "sub", 320, 14, f"hero.{lang}.bucket_sub")
    d = ImageDraw.Draw(img)
    d.line([686, 142, 1004, 142], fill=hx(s["grid"]), width=2)

    rows_y = [178, 240, 302, 364, 426]
    bar_x0, bar_w, bar_h = 792, 132, 26
    track = hx(s["track"])
    max_amt = BUCKETS[0][3]
    for i, (key, amount, share, cents) in enumerate(BUCKETS):
        y = rows_y[i]
        d.text((686, y - 20), key, font=font(26, "mono"), fill=hx(s["text"]))
        d.rounded_rectangle([bar_x0, y - 20, bar_x0 + bar_w, y + 6],
                            radius=bar_h // 2, fill=track)
        fw = max(10, int(bar_w * cents / max_amt))
        d.rounded_rectangle([bar_x0, y - 20, bar_x0 + fw, y + 6],
                            radius=bar_h // 2, fill=hx(s["accent"]))
        d.text((1004, y - 15), f"{share * 100:.1f}%", font=font(20, "mono"),
               fill=hx(s["sub"]), anchor="ra")
        d.text((1004, y + 12), amount, font=font(18, "mono"),
               fill=hx(s["faint"]), anchor="ra")

    d.line([686, 452, 1004, 452], fill=hx(s["grid"]), width=2)
    write(img, (686, 462), h_model["bucket_foot"], s, 16,
          "cjk" if lang == "zh" else "en", "sub", 320, 14,
          f"hero.{lang}.bucket_foot")
    write(img, (686, 482), h_model["bucket_note"], s, 16,
          "cjk" if lang == "zh" else "en", "faint", 320, 13,
          f"hero.{lang}.bucket_note")

    # --------------------------------------------- card R: ratio + top list
    img = card(img, (1050, 48, 1380, 504), s, radius=22)
    d = ImageDraw.Draw(img)
    cx = 1215
    write(img, (cx - 110, 74), h_model["ratio_title"], s, 24,
          "cjk_bold" if lang == "zh" else "en_bold", "text", 240, 18,
          f"hero.{lang}.ratio_title")
    ring = [cx - 74, 122, cx + 74, 270]
    d.ellipse(ring, outline=hx(s["track"]), width=19)
    d.arc(ring, start=-90, end=-90 + 360 * OVERDUE_RATIO,
          fill=hx(s["warn"]), width=19)
    d.text((cx, 196), "71.13%", font=font(32, "mono"), fill=hx(s["text"]),
           anchor="mm")
    for i, line in enumerate(h_model["ratio_caption"]):
        write(img, (cx - 140, 286 + i * 22), line, s, 17,
              "cjk" if lang == "zh" else "en", "sub", 280, 14,
              f"hero.{lang}.ratio_caption{i}")
    d = ImageDraw.Draw(img)
    d.line([1074, 336, 1356, 336], fill=hx(s["grid"]), width=2)

    write(img, (1074, 352), h_model["top_title"], s, 19,
          "cjk_bold" if lang == "zh" else "en_bold", "text", 180, 15,
          f"hero.{lang}.top_title")
    write(img, (1356, 354), h_model["top_note"], s, 15, "mono", "faint", 80, 13,
          f"hero.{lang}.top_note")
    for i, (amount, days) in enumerate(TOP):
        y = 386 + i * 36
        write(img, (1074, y), h_model["names"][i], s, 17,
              "cjk", "sub", 172, 15,
              f"hero.{lang}.name{i}")
        d.text((1300, y), amount, font=font(17, "mono"), fill=hx(s["text"]),
               anchor="ra")
        d.text((1356, y + 2), days, font=font(15, "mono"), fill=hx(s["faint"]),
               anchor="ra")

    img.save(os.path.join(OUT, f"dsh-ar-aging-hero-{lang}-{skin_name}.webp"),
             "WEBP", quality=92)
    print(f"wrote dsh-ar-aging-hero-{lang}-{skin_name}.webp")


# ------------------------------------------------------------- flow diagram
FLOW = {
    "light": dict(bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
                  edge="#e4e1ee", zone="#f4f1fb", text="#141419",
                  sub="#4d5261", faint="#8f94a4", accent="#4B67B4",
                  warn="#b0470f", pill="#ece7f9", track="#eae6f3",
                  grid="#e7e4f0", dot="#d9d3ea"),
    "dark": dict(bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
                 edge="#2e374b", zone="#171e2d", text="#f0f3f9",
                 sub="#a8b1c4", faint="#737b8d", accent="#8496f5",
                 warn="#d9a03c", pill="#242d42", track="#243049",
                 grid="#1e2636", dot="#26314a"),
}

MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
SANS = ("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', "
        "sans-serif")


def flow_svg(skin_name):
    s = FLOW[skin_name]
    p: list[str] = []
    shadow_op = "0.10" if skin_name == "light" else "0.55"
    shadow_col = "#1b1735" if skin_name == "light" else "#000000"

    p.append(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" viewBox="0 0 1100 660" role="img" aria-label="dsh-ar-aging: one AR ledger CSV is read by ar_ingest, then two clocks run on the same dataset - invoice_date gives age_days and one of five fixed buckets, due_date gives days_past_due and the overdue flag - and ar_export writes summary or detail CSV under DSH_HOME">
<title>dsh-ar-aging: two clocks, five fixed buckets, one local CSV</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="{s['bg_from']}"/>
    <stop offset="1" stop-color="{s['bg_to']}"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="180%">
    <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="{shadow_col}" flood-opacity="{shadow_op}"/>
  </filter>
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="1.4" cy="1.4" r="1.4" fill="{s['dot']}"/>
  </pattern>
</defs>
<rect width="1100" height="660" fill="url(#bg)"/>
<rect width="1100" height="660" fill="url(#dots)" opacity=".45"/>
<text x="44" y="62" fill="{s['text']}" font-family="{MONO}" font-size="34" font-weight="700">dsh-ar-aging</text>
<text x="44" y="88" fill="{s['sub']}" font-family="{SANS}" font-size="15">one local CSV · two clocks · five fixed buckets</text>
<rect x="644" y="40" width="412" height="34" rx="17" fill="{s['pill']}"/>
<text x="850" y="62" fill="{s['accent']}" font-family="{MONO}" font-size="14" text-anchor="middle">as_of 2026-06-30 · CNY · quickstart fixture</text>
<line x1="44" y1="106" x2="1056" y2="106" stroke="{s['grid']}" stroke-width="1.5"/>''')

    # ---- input card (ar-ledger.csv + 7 columns)
    p.append(f'''<g filter="url(#soft)"><rect x="40" y="124" width="232" height="346" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="60" y="160" fill="{s['accent']}" font-family="{MONO}" font-size="14" letter-spacing="1.4">INPUT · CSV</text>
<text x="60" y="194" fill="{s['text']}" font-family="{MONO}" font-size="20" font-weight="700">ar-ledger.csv</text>
<text x="60" y="220" fill="{s['sub']}" font-family="{SANS}" font-size="14">13 rows · 6 customers</text>
<text x="60" y="242" fill="{s['sub']}" font-family="{SANS}" font-size="14">CNY · UTF-8 · ≤20 MB</text>
<line x1="60" y1="258" x2="252" y2="258" stroke="{s['grid']}" stroke-width="1.4"/>
<text x="60" y="282" fill="{s['faint']}" font-family="{SANS}" font-size="14">columns · 7</text>''')
    cols = ["customer", "invoice_no", "invoice_date", "due_date",
            "amount_cents", "currency", "paid_cents"]
    for i, name in enumerate(cols):
        y = 306 + i * 20
        p.append(f'<circle cx="66" cy="{y - 4}" r="2.6" fill="{s["accent"]}" opacity=".55"/>')
        p.append(f'<text x="78" y="{y}" fill="{s["sub"]}" font-family="{MONO}" font-size="14">{name}</text>')
    p.append(f'''<rect x="60" y="430" width="142" height="26" rx="13" fill="{s['pill']}"/>
<text x="72" y="448" fill="{s['accent']}" font-family="{MONO}" font-size="14">ar_ingest · R0</text>
<path d="M275 291 L285 300 L275 309" fill="none" stroke="{s['accent']}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>''')

    # ---- engine zone (two clocks + staircase)
    p.append(f'''<rect x="292" y="124" width="492" height="404" rx="20" fill="{s['zone']}" stroke="{s['edge']}" stroke-width="1.5"/>
<text x="312" y="158" fill="{s['accent']}" font-family="{MONO}" font-size="14" font-weight="700" letter-spacing="1.2">CLOCK A · invoice_date</text>
<text x="312" y="182" fill="{s['sub']}" font-family="{SANS}" font-size="14">as_of − invoice_date → age_days → bucket</text>
<text x="312" y="202" fill="{s['faint']}" font-family="{SANS}" font-size="14">fixed · 0 / 31 / 61 / 91 / 181 days · bar ∝ share</text>
<rect x="664" y="140" width="104" height="26" rx="13" fill="{s['pill']}"/>
<text x="674" y="158" fill="{s['accent']}" font-family="{MONO}" font-size="14">ar_aging · R0</text>
<path d="M795 229 L805 238 L795 247" fill="none" stroke="{s['accent']}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>''')

    max_amt = BUCKETS[0][3]
    for i, (key, amount, share, cents) in enumerate(BUCKETS):
        x = 306 + i * 94
        bottom = 424 - i * 26
        top = bottom - 104
        cx = x + 44
        p.append(f'<g filter="url(#soft)"><rect x="{x}" y="{top}" width="88" height="104" rx="18" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.5"/></g>')
        p.append(f'<text x="{cx}" y="{top + 30}" fill="{s["text"]}" font-family="{MONO}" font-size="18" font-weight="700" text-anchor="middle">{key}</text>')
        p.append(f'<text x="{cx}" y="{top + 56}" fill="{s["accent"]}" font-family="{MONO}" font-size="15" text-anchor="middle">{amount}</text>')
        bw = 52
        p.append(f'<rect x="{cx - bw // 2}" y="{top + 68}" width="{bw}" height="6" rx="3" fill="{s["track"]}"/>')
        p.append(f'<rect x="{cx - bw // 2}" y="{top + 68}" width="{max(4, round(bw * cents / max_amt))}" height="6" rx="3" fill="{s["accent"]}"/>')
        p.append(f'<text x="{cx}" y="{top + 94}" fill="{s["sub"]}" font-family="{MONO}" font-size="14" text-anchor="middle">{share * 100:.1f}%</text>')
        if i < 4:
            gap_x = x + 88 + 3
            p.append(f'<line x1="{gap_x}" y1="{bottom}" x2="{gap_x}" y2="{bottom - 26}" stroke="{s["accent"]}" stroke-width="2" opacity=".45"/>')

    # ---- CLOCK B + overdue split
    p.append(f'''<text x="312" y="448" fill="{s['accent']}" font-family="{MONO}" font-size="14" font-weight="700" letter-spacing="1.2">CLOCK B · due_date</text>
<text x="312" y="472" fill="{s['sub']}" font-family="{SANS}" font-size="14">due_date &lt; as_of → days_past_due &gt; 0 → overdue</text>
<text x="312" y="494" fill="{s['warn']}" font-family="{MONO}" font-size="14">overdue 5.50M · 71.13%</text>
<text x="770" y="494" fill="{s['faint']}" font-family="{MONO}" font-size="14" text-anchor="end">not due 2.23M · 28.87%</text>
<rect x="312" y="502" width="458" height="16" rx="8" fill="{s['track']}"/>''')
    p.append(f'<rect x="312" y="502" width="{round(458 * OVERDUE_RATIO)}" height="16" rx="8" fill="{s["warn"]}" opacity=".85"/>')

    # ---- right column: top overdue
    p.append(f'''<g filter="url(#soft)"><rect x="820" y="124" width="240" height="228" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="840" y="158" fill="{s['accent']}" font-family="{MONO}" font-size="17" font-weight="700">top_overdue</text>
<text x="1040" y="158" fill="{s['faint']}" font-family="{MONO}" font-size="14" text-anchor="end">top_n=5</text>
<text x="840" y="182" fill="{s['faint']}" font-family="{SANS}" font-size="14">rank · CNY · max days past due</text>''')
    top = [("3.30M", "177d"), ("0.96M", "22d"), ("0.66M", "1d"),
           ("0.33M", "36d"), ("0.13M", "60d")]
    for i, (amount, days) in enumerate(top):
        y = 212 + i * 28
        p.append(f'<text x="840" y="{y}" fill="{s["faint"]}" font-family="{MONO}" font-size="14">#{i + 1}</text>')
        p.append(f'<text x="1004" y="{y}" fill="{s["text"]}" font-family="{MONO}" font-size="14" font-weight="700" text-anchor="end">{amount}</text>')
        p.append(f'<text x="1040" y="{y}" fill="{s["sub"]}" font-family="{MONO}" font-size="14" text-anchor="end">{days}</text>')

    # ---- right column: report fields
    p.append(f'''<g filter="url(#soft)"><rect x="820" y="368" width="240" height="160" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="840" y="398" fill="{s['accent']}" font-family="{MONO}" font-size="17" font-weight="700">report · ar_aging</text>''')
    for i, field in enumerate(["as_of · currency", "totals · overdue_ratio",
                               "buckets[5] · share", "customers[] · top_overdue"]):
        y = 426 + i * 24
        p.append(f'<text x="840" y="{y}" fill="{s["sub"]}" font-family="{MONO}" font-size="14">{field}</text>')

    # ---- export strip (receives both clocks)
    for x in (380, 940):
        p.append(f'<line x1="{x}" y1="530" x2="{x}" y2="536" stroke="{s["accent"]}" stroke-width="2" opacity=".55"/>')
        p.append(f'<path d="M{x - 4} 535 L{x + 4} 535 L{x} 541 Z" fill="{s["accent"]}" opacity=".7"/>')
    p.append(f'''<g filter="url(#soft)"><rect x="40" y="540" width="1020" height="64" rx="18" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="60" y="566" fill="{s['accent']}" font-family="{MONO}" font-size="17" font-weight="700">ar_export · R1</text>
<text x="218" y="566" fill="{s['text']}" font-family="{MONO}" font-size="14">layout=summary → customer × 5 buckets + TOTAL</text>
<text x="616" y="566" fill="{s['text']}" font-family="{MONO}" font-size="14">layout=detail → 1 row/invoice</text>
<text x="1040" y="566" fill="{s['faint']}" font-family="{MONO}" font-size="14" text-anchor="end">sha256 · bytes</text>
<text x="60" y="590" fill="{s['sub']}" font-family="{MONO}" font-size="14">write → $DSH_HOME/dsh-ar-aging/exports/ar-aging-&lt;as_of&gt;-&lt;layout&gt;.csv</text>
<text x="1040" y="590" fill="{s['faint']}" font-family="{SANS}" font-size="14" text-anchor="end">source CSV never modified</text>''')

    # ---- footer rules
    p.append(f'''<text x="44" y="624" fill="{s['sub']}" font-family="{MONO}" font-size="14">age = as_of − invoice_date (UTC days) · overdue ⟺ due_date &lt; as_of · 180+ starts at day 181</text>
<text x="44" y="644" fill="{s['faint']}" font-family="{SANS}" font-size="14">one CSV = one currency · R0 read-only, R1 local write · no network · no model call</text>
</svg>''')

    path = os.path.join(OUT, f"dsh-ar-aging-flow-v5-{skin_name}.svg")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(p) + "\n")
    print(f"wrote dsh-ar-aging-flow-v5-{skin_name}.svg")


def main():
    os.makedirs(OUT, exist_ok=True)
    for skin_name in ("light", "dark"):
        for lang in ("zh", "en"):
            hero(lang, skin_name)
        flow_svg(skin_name)
    if WARNINGS:
        print(f"{len(WARNINGS)} layout warning(s)")


if __name__ == "__main__":
    main()

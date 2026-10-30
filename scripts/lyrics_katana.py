"""Katana-strike kinetic lyrics as an ASS subtitle file for ffmpeg/libass (owner's chosen style).

Every new lyric line arrives with a sword strike: a glowing blade streak slashes across the line, the old
line is cut in two (top half slides up-left, bottom half slides down-right, both fade), and the new line is
revealed right behind the blade with a short impact punch and white flash. Strikes alternate direction.
Long instrumental gaps fade the line out.
"""
import subprocess

FONT_SIZE = 76
STRIKE = 0.16      # blade crossing time (s)
SPLIT = 0.55       # old-line split/fall time (s)
GAP_FADE = 4.0


def _font_file(family="Inter", style="Bold"):
    try:
        f = subprocess.run(["fc-match", "-f", "%{file}", f"{family}:style={style}"], capture_output=True, text=True).stdout.strip()
        if f:
            return f
    except Exception:
        pass
    return "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _family(path):
    try:
        return subprocess.run(["fc-query", "-f", "%{family[0]}", path], capture_output=True, text=True).stdout.strip() or "DejaVu Sans"
    except Exception:
        return "DejaVu Sans"


def _t(s):
    s = max(0.0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def _esc(txt):
    return txt.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ").strip()


def _wrap(txt, fnt, maxw):
    if fnt.getlength(txt) <= maxw or " " not in txt:
        return [txt], fnt.getlength(txt)
    words, best = txt.split(), None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        w = max(fnt.getlength(a), fnt.getlength(b))
        if best is None or w < best[0]:
            best = (w, [a, b])
    return best[1], best[0]


def write(lines, path, W, H, start_after=0.0, accent="&H4AC8FF&"):
    """accent is the blade glow colour in ASS BGR (default warm gold)."""
    from PIL import ImageFont
    ffile = _font_file()
    family = _family(ffile)
    fnt = ImageFont.truetype(ffile, FONT_SIZE)
    cx, cy = W / 2, H * 0.80
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyric,{family},{FONT_SIZE},&H00F4F4F4,&H00F4F4F4,&H64000000,&H8C000000,-1,0,0,0,100,100,-0.5,0,1,0,3,5,0,0,0,1
Style: Fx,{family},10,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    rows = []
    for l in lines or []:
        a, b, txt = float(l.get("start", 0)), float(l.get("end", 0)), _esc(str(l.get("text", "")))
        if txt and b > start_after:
            rows.append([max(a, start_after + 0.4), max(b, a + 1.0), txt])
    if not rows:
        open(path, "w", encoding="utf-8").write(head)
        return 0
    for i in range(len(rows) - 1):
        rows[i][1] = min(rows[i][1], rows[i + 1][0] - STRIKE / 2)

    ev = []
    blade = "m 0 0 l 520 -5 l 1040 0 l 520 5"       # tapered blade streak
    prev = None
    for i, (a, b, txt) in enumerate(rows):
        parts, w = _wrap(txt, fnt, W * 0.74)
        text = "\\N".join(parts)
        h = FONT_SIZE * 1.25 * len(parts)
        xl, xr = cx - w / 2 - 30, cx + w / 2 + 30
        ltr = i % 2 == 0
        s0, s1 = a - STRIKE / 2, a + STRIKE / 2
        last = i + 1 >= len(rows) or rows[i + 1][0] - b > GAP_FADE
        end = b + (0.5 if last else 0.0)
        tilt = -7 if ltr else 7
        # 1) blade streak: core + soft glow, crossing the text fast
        x0, x1 = (xl - 600, xr + 600) if ltr else (xr + 600, xl - 600)
        for layer, col, blur, alpha in ((7, accent, 9, "&H40&"), (8, "&HFFFFFF&", 1.5, "&H00&")):
            ev.append(f"Dialogue: {layer},{_t(s0)},{_t(s1 + 0.12)},Fx,,0,0,0,,{{\\an5\\move({x0:.0f},{cy:.0f},{x1:.0f},{cy:.0f},0,{int(STRIKE * 1000)})"
                      f"\\frz{tilt}\\bord0\\shad0\\blur{blur}\\1c{col}\\1a{alpha}\\fad(0,120)\\p1}}{blade}")
        # 2) flash on impact (thin bright line along the cut)
        ev.append(f"Dialogue: 6,{_t(a)},{_t(a + 0.22)},Fx,,0,0,0,,{{\\an5\\pos({cx:.0f},{cy:.0f})\\frz{tilt}\\bord0\\shad0\\blur4\\1c&HFFFFFF&\\fad(0,200)\\p1}}"
                  f"m {-(xr - xl) / 2:.0f} -2 l {(xr - xl) / 2:.0f} -2 l {(xr - xl) / 2:.0f} 2 l {-(xr - xl) / 2:.0f} 2")
        # 3) new line revealed behind the blade, then a short impact punch
        c0 = f"\\clip(0,0,{x0:.0f},{H})" if ltr else f"\\clip({x0:.0f},0,{W},{H})"   # reveal edge rides with the blade
        c1 = f"\\clip(0,0,{x1:.0f},{H})" if ltr else f"\\clip({x1:.0f},0,{W},{H})"
        d = int(STRIKE * 1000)
        punch = f"\\fscx112\\fscy112\\1c&HFFFFFF&\\t({d},{d + 220},0.6,\\fscx100\\fscy100\\1c&HF4F4F4&)"
        fo = "\\fad(0,450)" if last else ""
        ev.append(f"Dialogue: 3,{_t(s0)},{_t(end)},Lyric,,0,0,0,,{{\\an5\\pos({cx:.0f},{cy:.0f}){c0}\\t(0,{d},{c1}){punch}{fo}}}{text}")
        # 4) old line: stays whole ahead of the blade; behind it, it is cut in two and the halves fly apart
        if prev and a - prev[2] <= GAP_FADE:
            ptext = prev[0]
            ahead0 = f"\\clip({x0:.0f},0,{W},{H})" if ltr else f"\\clip(0,0,{x0:.0f},{H})"
            ahead1 = f"\\clip({x1:.0f},0,{W},{H})" if ltr else f"\\clip(0,0,{x1:.0f},{H})"
            ev.append(f"Dialogue: 2,{_t(s0)},{_t(s1)},Lyric,,0,0,0,,{{\\an5\\pos({cx:.0f},{cy:.0f}){ahead0}\\t(0,{d},{ahead1})}}{ptext}")
            dx = 160 if ltr else -160
            for top in (True, False):
                y0, y1 = (0, cy) if top else (cy, H)
                b0 = f"\\clip(0,{y0:.0f},{x0:.0f},{y1:.0f})" if ltr else f"\\clip({x0:.0f},{y0:.0f},{W},{y1:.0f})"
                b1 = f"\\clip(0,{y0:.0f},{x1:.0f},{y1:.0f})" if ltr else f"\\clip({x1:.0f},{y0:.0f},{W},{y1:.0f})"
                ddx, ddy, rot = (-dx, -70, -5 if ltr else 5) if top else (dx, 70, 5 if ltr else -5)
                ms = int(SPLIT * 1000)
                ev.append(f"Dialogue: 2,{_t(s0)},{_t(s0 + SPLIT)},Lyric,,0,0,0,,{{\\an5\\move({cx:.0f},{cy:.0f},{cx + ddx:.0f},{cy + ddy:.0f},{d // 2},{ms})"
                          f"{b0}\\t(0,{d},{b1})\\1c&HC8C8C8&\\t({d // 2},{ms},0.6,\\frz{rot}\\alpha&HFF&)}}{ptext}")
        prev = (text, w, b)
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")
    return len(rows)

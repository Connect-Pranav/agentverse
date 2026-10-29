#!/usr/bin/env python3
"""Sunverse Song-to-Video runner (agent: sunverse_songvideo_agent). Runs on GitHub Actions.

Stage "analyze" (free): Gemini text model listens to the uploaded song and returns timed lyrics, mood,
theme, a scene/image plan and the YouTube title/description/tags. The Worker then waits for the owner to
approve the image spend.
Stage "render" (paid images, after approval): makes one 16:9 image per scene (Gemini image model, or OpenAI
gpt-image when SONGVIDEO_IMAGE_ENGINE=openai), renders a 1080p MP4 with ffmpeg (Sunverse logo intro,
credits card, Ken Burns motion, crossfades, lyric captions, end card) and uploads it in parts.
Nothing is published from here.

Env: SV_MCP_URL (the sunverse-mcp Worker), SV_MCP_TOKEN (its MCP_TOKEN), GEMINI_API_KEY (+ OPENAI_API_KEY for the openai engine).
Optional: GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, OPENAI_IMAGE_MODEL, SONGVIDEO_IMAGE_ENGINE, SONGVIDEO_IMAGE_USD.
"""
import base64, json, math, os, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

GL = "https://generativelanguage.googleapis.com"
PART = 22 * 1024 * 1024
W, H, FPS = 1920, 1080, 30
INTRO_S, CREDITS_S, OUTRO_S = 5.0, 4.0, 5.0


def log(*a):
    print("[songvideo]", *a, flush=True)


def env(name, required=True, default=None):
    v = os.environ.get(name, "").strip() or default
    if required and not v:
        sys.exit(f"missing env {name}")
    return v


def redact(t):
    t = str(t)
    for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "SV_MCP_TOKEN"):
        v = os.environ.get(k)
        if v:
            t = t.replace(v, "***")
    return t[:600]


def http(method, url, body=None, headers=None, timeout=180, want="json"):
    h = dict(headers or {})
    data = body
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
        h.setdefault("content-type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if want == "raw":
                return raw, dict(r.headers)
            return json.loads(raw or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {url.split('?')[0]}: {redact(e.read().decode(errors='replace'))}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error {url.split('?')[0]}: {redact(e)}")


def ganesha(method, path, body=None, headers=None, timeout=300, want="json"):
    """Call the sunverse-mcp Worker (name kept for the shared runner code)."""
    h = {"authorization": f"Bearer {env('SV_MCP_TOKEN')}"}
    h.update(headers or {})
    return http(method, env("SV_MCP_URL").rstrip("/") + path, body, h, timeout, want)


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {p.stderr[-1500:]}")
    return p.stdout


def probe_duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


# ---------------- Gemini ----------------
def gkey():
    return env("GEMINI_API_KEY")


def ver(name):
    m = re.search(r"(\d+(?:\.\d+)?)", name)
    return float(m.group(1)) if m else 0.0


def gemini_models():
    j = http("GET", f"{GL}/v1beta/models?pageSize=200&key={gkey()}")
    return [m for m in j.get("models", []) if "generateContent" in (m.get("supportedGenerationMethods") or [])]


def pick_text_model(models):
    if os.environ.get("GEMINI_TEXT_MODEL"):
        return [os.environ["GEMINI_TEXT_MODEL"]]
    ms = [m["name"].split("/")[-1] for m in models if "gemini" in m["name"] and "flash" in m["name"] and not re.search(r"image|tts|audio|live|embed|vision|banana", m["name"])]
    ms.sort(key=lambda n: (("preview" in n or "exp" in n), ("lite" in n), -ver(n.replace("gemini-", ""))))
    return ms[:3] or ["gemini-flash-latest"]


def pick_image_models(models):
    if os.environ.get("GEMINI_IMAGE_MODEL"):
        return [os.environ["GEMINI_IMAGE_MODEL"]]
    ms = [m["name"].split("/")[-1] for m in models if re.search(r"image|banana", m["name"]) and not re.search(r"pro|edit|embed", m["name"])]
    ms.sort(key=lambda n: (("preview" in n), -ver(n.replace("gemini-", ""))))
    if not ms:
        raise RuntimeError("no Gemini image model is available on this key (image generation needs billing on the Gemini API key)")
    return ms[:3]


def gemini_upload(path, mime):
    size = os.path.getsize(path)
    _, hdr = http("POST", f"{GL}/upload/v1beta/files?key={gkey()}", {"file": {"display_name": os.path.basename(path)}},
                  {"X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                   "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": mime}, want="raw")
    up = {k.lower(): v for k, v in hdr.items()}.get("x-goog-upload-url")
    if not up:
        raise RuntimeError("Gemini Files API did not return an upload URL")
    with open(path, "rb") as f:
        res = http("POST", up, f.read(), {"Content-Length": str(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"}, timeout=600)
    file = res.get("file", {})
    for _ in range(60):
        if file.get("state") in (None, "ACTIVE"):
            return file
        time.sleep(3)
        file = http("GET", f"{GL}/v1beta/{file['name']}?key={gkey()}")
    raise RuntimeError("Gemini never finished processing the audio")


def gemini_json(model, parts):
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.6}}
    r = http("POST", f"{GL}/v1beta/models/{model}:generateContent?key={gkey()}", body, timeout=300)
    text = "".join(p.get("text", "") for c in r.get("candidates", []) for p in c.get("content", {}).get("parts", []))
    text = re.sub(r"```(?:json)?", "", text)
    a, b = text.find("{"), text.rfind("}")
    if a < 0:
        raise RuntimeError(f"Gemini returned no JSON ({model})")
    return json.loads(text[a:b + 1])


def gemini_image(models, prompt, out):
    last = None
    for model in models:
        for mods in (["IMAGE"], ["TEXT", "IMAGE"]):
            body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"responseModalities": mods, "imageConfig": {"aspectRatio": "16:9"}}}
            try:
                r = http("POST", f"{GL}/v1beta/models/{model}:generateContent?key={gkey()}", body, timeout=240)
            except RuntimeError as e:
                last = e
                if "HTTP 400" in str(e) and mods == ["IMAGE"]:
                    continue
                break
            for c in r.get("candidates", []):
                for p in c.get("content", {}).get("parts", []):
                    d = p.get("inlineData") or p.get("inline_data")
                    if d and d.get("data"):
                        open(out, "wb").write(base64.b64decode(d["data"]))
                        return model
            last = RuntimeError(f"{model} returned no image (finish: {[c.get('finishReason') for c in r.get('candidates', [])]})")
            break
    raise last or RuntimeError("image generation failed")


def openai_image(prompt, out):
    key = env("OPENAI_API_KEY")
    model = os.environ.get("OPENAI_IMAGE_MODEL") or "gpt-image-1"
    r = http("POST", "https://api.openai.com/v1/images/generations", {"model": model, "prompt": prompt, "size": "1536x1024", "n": 1},
             {"authorization": f"Bearer {key}"}, timeout=300)
    d = (r.get("data") or [{}])[0]
    if d.get("b64_json"):
        open(out, "wb").write(base64.b64decode(d["b64_json"]))
    elif d.get("url"):
        raw, _ = http("GET", d["url"], want="raw")
        open(out, "wb").write(raw)
    else:
        raise RuntimeError("OpenAI returned no image")
    return model


# ---------------- stage 1: analyze ----------------
ANALYZE = """You are the creative director for SUNVERSE, a YouTube music channel (original Hindi songs; lyrics by {lyricist}, singer {singer}).
Listen to the attached song (duration {dur:.1f} s) and return ONE JSON object:
{{
 "durationS": number, "language": "e.g. Hindi", "mood": "max 12 words", "theme": "max 40 words: what the song is about",
 "lyrics_lines": [{{"start": seconds, "end": seconds, "text": "one sung line"}}],
 "scenes": [{{"start": seconds, "end": seconds, "summary": "max 15 words", "image_prompt": "detailed prompt"}}],
 "youtube": {{"title": "max 70 chars, catchy, include song name", "description": "3 short paragraphs: the story/feeling of the song, credits (Lyrics: {lyricist} · Singer: {singer}), a line inviting viewers to subscribe to Sunverse; end with 5 hashtags", "tags": ["15-20 search tags, Hindi + English"]}}
}}
Rules:
- {lyrics_rule}
- Time every lyric line to the audio as accurately as you can (seconds from song start). Skip instrumental parts.
- Make exactly {n} scenes that cover 0 → {dur:.1f} s with no gaps, following the song's story and emotion section by section.
- Every image_prompt: visual style "{style}"; 16:9 cinematic wide shot; keep the same main characters (describe them the same way in every prompt) and colour palette across scenes so the video feels like one story; absolutely no text, letters, words, subtitles, logos or watermarks in the image.
- Song title given by the owner: "{title}" (if empty, choose one from the lyrics).
- Write EVERYTHING in English / Roman letters: lyrics_lines, title, description, tags, mood, theme. No Devanagari script anywhere.
- Never invent facts about the artists beyond the credits given."""


def analyze(job, work):
    jid = job["id"]
    audio = os.path.join(work, "song")
    raw, _ = ganesha("GET", f"/api/songvideo/runner/{jid}/audio", want="raw", timeout=600)
    open(audio, "wb").write(raw)
    dur = probe_duration(audio)
    n = max(6, min(16, round(dur / 15)))
    models = gemini_models()
    f = gemini_upload(audio, job.get("audioMime") or "audio/mpeg")
    cr = job.get("credits") or {}
    lyrics = (job.get("lyrics") or "").strip()
    prompt = ANALYZE.format(dur=dur, n=n, style=job.get("style") or "watercolor anime", title=job.get("title") or "",
                            lyricist=cr.get("lyrics", "COCO"), singer=cr.get("singer", "KoBhit"),
                            lyrics_rule=("Use these lyrics from the owner (same words), only add timing. If any line is in Devanagari, transliterate it to Roman/Latin letters (Hinglish):\n" + lyrics[:8000]) if lyrics
                            else "Transcribe the sung lyrics in Roman/Latin letters only (Hindi words written in Hinglish, e.g. 'Shaam ki laali chhaayi hai'). Never use Devanagari.")
    last = None
    for model in pick_text_model(models):
        try:
            a = gemini_json(model, [{"file_data": {"mime_type": f.get("mimeType") or "audio/mpeg", "file_uri": f["uri"]}}, {"text": prompt}])
            a["durationS"] = dur
            # make scenes contiguous and inside the song
            sc = sorted([s for s in a.get("scenes", []) if s.get("image_prompt")], key=lambda s: float(s.get("start", 0)))[:16]
            if not sc:
                raise RuntimeError("no scenes in the plan")
            for i, s in enumerate(sc):
                s["start"] = 0.0 if i == 0 else float(sc[i - 1]["end"])
                s["end"] = dur if i == len(sc) - 1 else max(s["start"] + 2.0, min(dur, float(s.get("end", s["start"] + 10))))
            a["scenes"] = sc
            log(f"[{jid}] analysed with {model}: {len(sc)} scenes, {len(a.get('lyrics_lines', []))} lyric lines")
            ganesha("PUT", f"/api/songvideo/runner/{jid}/analysis", a)
            return
        except Exception as e:  # try the next free model
            last = e
            log(f"[{jid}] {model} failed: {redact(e)}")
    raise last


# ---------------- graphics (Pillow) ----------------
def font(size, bold=True, deva=False):
    from PIL import ImageFont
    cands = []
    if deva:
        cands += ["/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf", "/usr/share/fonts/opentype/noto/NotoSansDevanagari-Bold.ttf"]
        try:  # any installed font that covers Hindi
            cands += [l.split(":")[0] for l in subprocess.run(["fc-list", ":lang=hi", "file"], capture_output=True, text=True).stdout.splitlines() if l.strip()]
        except Exception:
            pass
    cands += ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for c in cands:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def has_deva(s):
    return any("ऀ" <= ch <= "ॿ" for ch in s or "")


def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def soft_logo(path):
    """The brand logo sits on a dark square: give it a soft round edge so it floats on the scene."""
    from PIL import Image, ImageDraw, ImageFilter, ImageChops
    lg = Image.open(path).convert("RGBA")
    m = Image.new("L", lg.size, 0)
    pad = int(min(lg.size) * 0.04)
    ImageDraw.Draw(m).ellipse((pad, pad, lg.width - pad, lg.height - pad), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(min(lg.size) * 0.05))
    lg.putalpha(ImageChops.multiply(lg.getchannel("A"), m))
    return lg


def render_card_frames(folder, logo_path, title, credits, kind):
    """Intro (logo reveal + credits) or outro, as RGBA PNG frames. The last/first frames fade alpha for blending."""
    from PIL import Image, ImageDraw, ImageFilter
    import random
    os.makedirs(folder, exist_ok=True)
    random.seed(7)
    logo = soft_logo(logo_path)
    base_logo = logo.resize((520, int(520 * logo.height / logo.width)), Image.LANCZOS)
    glow = base_logo.filter(ImageFilter.GaussianBlur(28))
    stars = [(random.random() * W, random.random() * H, random.random()) for _ in range(160)]
    total = INTRO_S + CREDITS_S if kind == "intro" else OUTRO_S
    frames = int(total * FPS)
    bg = Image.new("RGBA", (W, H), (6, 6, 22, 255))
    g = Image.new("L", (W, H), 0)
    ImageDraw.Draw(g).ellipse((W / 2 - 700, H / 2 - 500, W / 2 + 700, H / 2 + 500), fill=110)
    g = g.filter(ImageFilter.GaussianBlur(160))
    bg.paste(Image.new("RGBA", (W, H), (70, 40, 140, 255)), (0, 0), g)
    t_font, c_font, s_font = font(84, deva=has_deva(title)), font(46), font(30, bold=False)
    for i in range(frames):
        t = i / FPS
        im = bg.copy()
        d = ImageDraw.Draw(im)
        for (x, y, s) in stars:
            a = int(60 + 120 * s * (0.5 + 0.5 * math.sin(t * 2 + s * 9)))
            d.ellipse((x, y, x + 2 + s * 2, y + 2 + s * 2), fill=(200, 210, 255, a))
        if kind == "intro":
            if t < INTRO_S:
                k = ease(t / 1.6)
                sc = 0.55 + 0.45 * k + 0.03 * max(0, t - 1.6)
                lg = base_logo.resize((max(1, int(base_logo.width * sc)), max(1, int(base_logo.height * sc))), Image.LANCZOS)
                gl = glow.resize(lg.size, Image.LANCZOS)
                alpha = min(1.0, t / 0.9)
                if t > INTRO_S - 0.8:
                    alpha *= max(0.0, (INTRO_S - t) / 0.8)
                for layer, mult in ((gl, 1.6), (lg, 1.0)):
                    L = layer.copy()
                    L.putalpha(L.getchannel("A").point(lambda v: int(min(255, v * alpha * mult))))
                    im.alpha_composite(L, (int(W / 2 - L.width / 2), int(H / 2 - L.height / 2 - 40)))
                # light sweep across the logo
                sx = int(-400 + (W + 800) * ease((t - 1.2) / 1.4))
                if 1.2 < t < 2.8:
                    sw = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    ImageDraw.Draw(sw).polygon([(sx, 0), (sx + 140, 0), (sx - 160, H), (sx - 300, H)], fill=(255, 255, 255, 38))
                    im.alpha_composite(sw.filter(ImageFilter.GaussianBlur(30)))
                if 1.55 < t < 1.9:  # flash
                    fl = Image.new("RGBA", (W, H), (255, 255, 255, int(150 * (1 - (t - 1.55) / 0.35))))
                    im.alpha_composite(fl)
                if t > 2.2:
                    a2 = int(255 * min(1, (t - 2.2) / 0.8) * (alpha if t > INTRO_S - 0.8 else 1))
                    txt = "S U N V E R S E   P R E S E N T S"
                    w = d.textlength(txt, font=s_font)
                    d.text((W / 2 - w / 2, H / 2 + 200), txt, font=s_font, fill=(220, 210, 255, a2))
            else:
                ct = t - INTRO_S
                rows = [(title or "Sunverse", t_font, (255, 255, 255), 0.0), ("Lyrics — " + credits.get("lyrics", "COCO"), c_font, (230, 215, 255), 0.6), ("Singer — " + credits.get("singer", "KoBhit"), c_font, (230, 215, 255), 1.0)]
                y = H / 2 - 150
                for text, fnt, col, delay in rows:
                    a = ease((ct - delay) / 0.7)
                    w = d.textlength(text, font=fnt)
                    d.text((W / 2 - w / 2, y + 30 * (1 - a)), text, font=fnt, fill=col + (int(255 * a),))
                    y += 150 if fnt is t_font else 80
                lx = int(W / 2 - 260 * ease(ct / 1.2))
                d.line((lx, H / 2 - 20, W - lx, H / 2 - 20), fill=(180, 150, 255, 200), width=2)
        else:  # outro end card
            a = ease(t / 1.0)
            lg = base_logo.resize((380, int(380 * base_logo.height / base_logo.width)), Image.LANCZOS)
            L = lg.copy()
            L.putalpha(L.getchannel("A").point(lambda v: int(v * a)))
            im.alpha_composite(L, (int(W / 2 - L.width / 2), int(H / 2 - L.height / 2 - 80)))
            for k, (text, fnt) in enumerate((("Subscribe to SUNVERSE", c_font), (f"Lyrics — {credits.get('lyrics', 'COCO')}   ·   Singer — {credits.get('singer', 'KoBhit')}", s_font))):
                w = d.textlength(text, font=fnt)
                d.text((W / 2 - w / 2, H / 2 + 150 + k * 70), text, font=fnt, fill=(235, 225, 255, int(255 * ease((t - 0.4 - k * 0.3) / 0.8))))
        # alpha fade so the card blends into the song visuals
        if kind == "intro" and t > total - 1.0:
            im.putalpha(im.getchannel("A").point(lambda v: int(v * max(0.0, (total - t) / 1.0))))
        if kind == "outro" and t < 0.8:
            im.putalpha(im.getchannel("A").point(lambda v: int(v * (t / 0.8))))
        im.save(os.path.join(folder, f"{i:04d}.png"), compress_level=1)


def thumbnail(img_path, logo_path, title, out):
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.open(img_path).convert("RGB").resize((1280, 720), Image.LANCZOS)
    grad = Image.new("L", (1280, 720), 0)
    ImageDraw.Draw(grad).rectangle((0, 430, 1280, 720), fill=200)
    im.paste(Image.new("RGB", (1280, 720), (8, 6, 24)), (0, 0), grad.filter(ImageFilter.GaussianBlur(80)))
    d = ImageDraw.Draw(im)
    f = font(76, deva=has_deva(title))
    t = title or "Sunverse"
    while d.textlength(t, font=f) > 1150 and f.size > 40:
        f = font(f.size - 4, deva=has_deva(title))
    d.text((60, 560), t, font=f, fill=(255, 255, 255), stroke_width=3, stroke_fill=(30, 10, 60))
    lg = soft_logo(logo_path)
    lg = lg.resize((150, int(150 * lg.height / lg.width)), Image.LANCZOS)
    im.paste(lg, (1280 - 190, 40), lg)
    im.save(out, "JPEG", quality=88)


# ---------------- stage 2: render ----------------
def ass_time(s):
    s = max(0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def write_ass(lines, path, start_after):
    deva = any(has_deva(l.get("text", "")) for l in lines)
    fontname = "Noto Sans Devanagari" if deva else "DejaVu Sans"
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyric,{fontname},64,&H00FFFFFF,&H00FFFFFF,&H00301040,&H96000000,1,0,0,0,100,100,1,0,1,3,2,2,120,120,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for l in lines:
        a, b = float(l["start"]), float(l["end"])
        if b <= start_after:
            continue
        a = max(a, start_after)
        txt = l["text"].replace("{", "(").replace("}", ")").replace("\n", " ")
        ev.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Lyric,,0,0,0,,{{\\fad(250,250)}}{txt}")
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")


def render(job, work):
    jid = job["id"]
    a = job.get("analysis") or {}
    scenes = a.get("scenes") or []
    if not scenes:
        raise RuntimeError("job has no scene plan")
    audio = os.path.join(work, "song")
    raw, _ = ganesha("GET", f"/api/songvideo/runner/{jid}/audio", want="raw", timeout=600)
    open(audio, "wb").write(raw)
    dur = probe_duration(audio)
    engine = (os.environ.get("SONGVIDEO_IMAGE_ENGINE") or "gemini").lower()
    per = float(os.environ.get("SONGVIDEO_IMAGE_USD") or 0.067)
    imgs, used = [], None
    models = pick_image_models(gemini_models()) if engine == "gemini" else None
    for i, s in enumerate(scenes):
        out = os.path.join(work, f"img{i:02d}.png")
        p = s["image_prompt"] + " Wide 16:9 cinematic composition. No text, no letters, no logos, no watermark."
        used = openai_image(p, out) if engine == "openai" else gemini_image(models, p, out)
        norm = os.path.join(work, f"scene{i:02d}.png")
        run(["ffmpeg", "-y", "-v", "error", "-i", out, "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}", norm])
        imgs.append(norm)
        log(f"[{jid}] image {i + 1}/{len(scenes)} via {used}")
    cost = round(len(imgs) * per, 3)

    # logo from the studio (Sunverse brand asset)
    here = os.path.dirname(os.path.abspath(__file__))
    shutil.copy(os.path.join(here, "..", "mcp", "assets", "sunverse-logo.webp"), os.path.join(work, "logo.webp"))
    logo = os.path.join(work, "logo.png")
    run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(work, "logo.webp"), logo])
    title = (job.get("youtube") or {}).get("title") or job.get("title") or "Sunverse"
    song_title = job.get("title") or title
    credits = job.get("credits") or {"lyrics": "COCO", "singer": "KoBhit"}
    render_card_frames(os.path.join(work, "intro"), logo, song_title, credits, "intro")
    render_card_frames(os.path.join(work, "outro"), logo, song_title, credits, "outro")

    # scene clips with Ken Burns motion, crossfaded
    XF = 1.0
    inputs, filt, labels = [], [], []
    for i, (s, img) in enumerate(zip(scenes, imgs)):
        d = float(s["end"]) - float(s["start"]) + (XF if i < len(scenes) - 1 else OUTRO_S)
        frames = int(math.ceil(d * FPS))
        zin = i % 2 == 0
        z = f"min(1.0+0.0009*on,1.18)" if zin else f"max(1.18-0.0009*on,1.0)"
        x = "iw/2-(iw/zoom/2)" if i % 3 else f"(iw-iw/zoom)*on/{frames}"
        inputs += ["-loop", "1", "-t", f"{d:.3f}", "-i", img]
        filt.append(f"[{i}:v]scale={W * 2}:{H * 2},zoompan=z='{z}':x='{x}':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},format=yuv420p,setpts=PTS-STARTPTS[v{i}]")
        labels.append(f"v{i}")
    cur, off = labels[0], float(scenes[0]["end"]) - float(scenes[0]["start"])
    for i in range(1, len(labels)):
        filt.append(f"[{cur}][{labels[i]}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
        cur = f"x{i}"
        off += float(scenes[i]["end"]) - float(scenes[i]["start"])
    total = dur + OUTRO_S
    ass = os.path.join(work, "lyrics.ass")
    write_ass(a.get("lyrics_lines") or [], ass, INTRO_S + CREDITS_S - 0.5)
    n = len(imgs)
    inputs += ["-framerate", str(FPS), "-i", os.path.join(work, "intro", "%04d.png"),
               "-framerate", str(FPS), "-i", os.path.join(work, "outro", "%04d.png"), "-i", audio]
    filt.append(f"[{cur}]trim=0:{total:.3f},setpts=PTS-STARTPTS[base]")
    filt.append(f"[base][{n}:v]overlay=0:0:eof_action=pass[wi]")
    filt.append(f"[{n + 1}:v]setpts=PTS-STARTPTS+{dur:.3f}/TB[oc]")
    filt.append(f"[wi][oc]overlay=0:0:eof_action=pass,subtitles='{ass}'[vout]")
    filt.append(f"[{n + 2}:a]afade=t=in:d=1.5,apad,atrim=0:{total:.3f},afade=t=out:st={dur - 2:.3f}:d=2[aout]")
    out = os.path.join(work, "video.mp4")
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt), "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", out])
    vdur = probe_duration(out)
    size = os.path.getsize(out)
    log(f"[{jid}] rendered {vdur:.1f}s, {size / 1e6:.1f} MB")

    th = os.path.join(work, "thumb.jpg")
    thumbnail(imgs[0], logo, title, th)
    tb = open(th, "rb").read()
    ganesha("PUT", f"/api/songvideo/runner/{jid}/thumb", tb, {"content-type": "image/jpeg"})
    meta = {"durationS": round(vdur, 1), "width": W, "height": H, "images": n, "imageEngine": used, "imageCostUsd": cost}
    parts = max(1, math.ceil(size / PART))
    with open(out, "rb") as f:
        for p in range(1, parts + 1):
            chunk = f.read(PART)
            q = urllib.parse.urlencode({"part": p, "parts": parts, "meta": json.dumps(meta)})
            ganesha("PUT", f"/api/songvideo/runner/{jid}/video?{q}", chunk, {"content-type": "application/octet-stream"}, timeout=600)
    log(f"[{jid}] uploaded in {parts} part(s)")


def main():
    for _ in range(3):  # up to three jobs per run
        c = ganesha("POST", "/api/songvideo/runner/claim", {})
        job = c.get("job")
        if not job:
            log("no song jobs waiting")
            return
        work = tempfile.mkdtemp(prefix="sv_")
        try:
            (analyze if c["stage"] == "analyze" else render)(job, work)
        except Exception as e:
            log(f"[{job['id']}] {c['stage']} failed: {redact(e)}")
            try:
                ganesha("POST", f"/api/songvideo/runner/{job['id']}/fail", {"error": redact(e)})
            except Exception as e2:
                log("could not report the failure:", redact(e2))
        finally:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()

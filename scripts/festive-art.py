#!/usr/bin/env python3
"""Festival artwork: generates original devotional/festive paintings with Gemini and builds an animated GIF
that festive.js shows on the site during that festival.

Reads festive/art.json:  {"diwali": {"title": "...", "scenes": [{"name": "...", "prompt": "..."}]}}
Writes festive/<id>/<n>.png (stills) and festive/<id>.gif (crossfade slideshow with twinkling lights).

Env: GEMINI_API_KEY (required), GEMINI_IMAGE_MODEL (optional), FESTIVE_ONLY=<id> (optional).
Fails loudly (non-zero exit, clear message) when no image could be made — never writes a placeholder.
"""
import base64, json, math, os, re, sys, urllib.error, urllib.request
from PIL import Image, ImageDraw, ImageFilter

GL = "https://generativelanguage.googleapis.com"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
W, H = 480, 600  # 4:5 portrait card


def key():
    k = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not k:
        sys.exit("::error title=AGENTVERSE festive art::GEMINI_API_KEY secret is not set")
    return k


def http(method, url, body=None, timeout=240):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace").replace(key(), "***")[:400]
        raise RuntimeError(f"HTTP {e.code} {url.split('?')[0]}: {msg}")


def ver(name):
    m = re.search(r"(\d+(?:\.\d+)?)", name)
    return float(m.group(1)) if m else 0.0


def image_models():
    if os.environ.get("GEMINI_IMAGE_MODEL"):
        return [os.environ["GEMINI_IMAGE_MODEL"]]
    j = http("GET", f"{GL}/v1beta/models?pageSize=200&key={key()}")
    ms = [m["name"].split("/")[-1] for m in j.get("models", [])
          if re.search(r"image|banana", m["name"]) and "generateContent" in m.get("supportedGenerationMethods", [])
          and not re.search(r"edit|embed", m["name"])]
    ms.sort(key=lambda n: (("preview" in n), -ver(n.replace("gemini-", ""))))
    if not ms:
        raise RuntimeError("no Gemini image model is available on this key (image generation may need billing)")
    return ms[:3]


def generate(models, prompt, out):
    last = None
    for model in models:
        for mods in (["IMAGE"], ["TEXT", "IMAGE"]):
            body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"responseModalities": mods, "imageConfig": {"aspectRatio": "4:5"}}}
            try:
                r = http("POST", f"{GL}/v1beta/models/{model}:generateContent?key={key()}", body)
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


def cover(img):
    img = img.convert("RGB")
    s = max(W / img.width, H / img.height)
    img = img.resize((math.ceil(img.width * s), math.ceil(img.height * s)), Image.LANCZOS)
    l, t = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((l, t, l + W, t + H))


def lights(frame, i, seed):
    """Warm twinkling lights along the top edge (kept to a thin strip so the GIF stays small)."""
    over = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for k in range(14):
        x = (k + 0.5) * W / 14
        y = 14 + 8 * math.sin(k / 14 * math.pi * 3)
        a = 0.5 + 0.5 * math.sin(i * 0.55 + k * 1.7)
        c = [(255, 196, 92), (255, 150, 70), (255, 226, 140)][k % 3]
        r = 5
        d.ellipse([x - r * 2.2, y - r * 2.2, x + r * 2.2, y + r * 2.2], fill=c + (int(60 * a),))
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (int(120 + 135 * a),))
    over = over.filter(ImageFilter.GaussianBlur(0.6))
    return Image.alpha_composite(frame.convert("RGBA"), over).convert("RGB")


def build_gif(stills, out):
    hold, fade = 10, 6  # frames per scene; ~120 ms each → ~1.9 s per scene incl. crossfade
    frames, i = [], 0
    for n, img in enumerate(stills):
        nxt = stills[(n + 1) % len(stills)]
        for _ in range(hold):
            frames.append(lights(img, i, 7)); i += 1
        for f in range(1, fade + 1):
            frames.append(lights(Image.blend(img, nxt, f / (fade + 1)), i, 7)); i += 1
    # One shared palette keeps colours stable across frames and the file small.
    pal = frames[0].quantize(colors=160, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG) for f in frames]
    q[0].save(out, save_all=True, append_images=q[1:], duration=120, loop=0, optimize=True, disposal=1)
    return len(frames)


def main():
    spec = json.load(open(os.path.join(ROOT, "festive", "art.json")))
    only = os.environ.get("FESTIVE_ONLY")
    models = image_models()
    print("image models:", models)
    failed = 0
    for fid, cfg in spec.items():
        if only and fid != only:
            continue
        folder = os.path.join(ROOT, "festive", fid)
        os.makedirs(folder, exist_ok=True)
        stills = []
        for n, sc in enumerate(cfg["scenes"], 1):
            path = os.path.join(folder, f"{n}.png")
            try:
                used = generate(models, sc["prompt"] + " " + cfg.get("style", ""), path)
                print(f"{fid}: {sc['name']} ← {used}")
                stills.append(cover(Image.open(path)))
            except Exception as e:  # report each failure; keep going with the rest
                failed += 1
                print(f"::error title=AGENTVERSE festive art::{fid} / {sc['name']}: {e}")
        if len(stills) < 2:
            print(f"::error title=AGENTVERSE festive art::{fid}: only {len(stills)} image(s) made — GIF not built")
            continue
        out = os.path.join(ROOT, "festive", f"{fid}.gif")
        nf = build_gif(stills, out)
        print(f"{fid}: {out} — {nf} frames, {os.path.getsize(out) // 1024} KB")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

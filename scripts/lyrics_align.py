"""Lock lyric lines to the voice: align the known lyric sheet to word timings heard by speech-to-text.

Before this, owner/embedded lyrics were spread over the song by character count, so they drifted away
from the singer. Here every sheet word is matched (fuzzy, Hindi/Hinglish spelling tolerant) to a heard
word with its real start/end time, in order (Needleman-Wunsch style). Choruses that the sheet lists once
but the singer repeats are filled in by matching the leftover sung stretches to the best sheet line.
"""
import re
from difflib import SequenceMatcher

_REPL = (("chh", "c"), ("ch", "c"), ("sh", "s"), ("ph", "f"), ("kh", "k"), ("gh", "g"), ("th", "t"), ("dh", "d"),
         ("bh", "b"), ("jh", "j"), ("aa", "a"), ("ee", "i"), ("ii", "i"), ("oo", "u"), ("uu", "u"), ("w", "v"),
         ("q", "k"), ("z", "j"), ("y", "i"))


def key(word, roman=None):
    """Spelling-tolerant sound key: 'Mahaadev', 'mahadev' and 'महादेव' all give 'mahadev'."""
    w = word or ""
    if roman and re.search(r"[ऀ-ॿ]", w):
        w = roman(w) or ""
    w = re.sub(r"[^a-z]", "", w.lower())
    for a, b in _REPL:
        w = w.replace(a, b)
    w = re.sub(r"(.)\1+", r"\1", w)
    if len(w) > 2 and w.endswith("a"):
        w = w[:-1]
    return w


def _sim(a, b, cache):
    if not a or not b:
        return 0.0
    k = (a, b)
    if k not in cache:
        cache[k] = 1.0 if a == b else SequenceMatcher(None, a, b).ratio()
    return cache[k]


def words_to_lines(words, max_chars=42, gap=0.7):
    """Heard words → caption lines, broken at breaths/pauses (used when there is no lyric sheet)."""
    out, cur = [], []
    for w in words:
        if cur and (w["start"] - cur[-1]["end"] > gap or len(" ".join(x["w"] for x in cur + [w])) > max_chars):
            out.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [{"start": round(c[0]["start"], 2), "end": round(c[-1]["end"], 2), "text": " ".join(x["w"] for x in c).strip()} for c in out if c]


def align(sheet_lines, words, roman=None, max_gap=15.0):
    """sheet_lines: [str]; words: [{start, end, w}] from speech-to-text.
    Returns (timed_lines, stats). timed_lines is [] when the voice could not be matched well enough."""
    cache = {}
    otoks = []  # (key, line index)
    for li, line in enumerate(sheet_lines):
        for tok in line.split():
            k = key(tok, roman)
            if k:
                otoks.append((k, li))
    hw = [dict(w, k=key(w["w"], roman)) for w in words]
    hw = [w for w in hw if w["k"]]
    n, m = len(otoks), len(hw)
    stats = {"sheet_words": n, "heard_words": m, "matched": 0, "lines": len(sheet_lines), "anchored": 0, "repeats": 0}
    if not n or not m:
        return [], stats
    GAP_O, GAP_H = -0.6, -0.25          # skipping a sheet word costs more than skipping a heard word
    NEG = -1e9
    # score[i][j]: best alignment of first i sheet words with first j heard words; heard prefix is free (intro noise)
    prev = [0.0] * (m + 1)
    back = [bytearray(m + 1) for _ in range(n + 1)]  # 1 = diag, 2 = up (skip sheet), 3 = left (skip heard)
    for j in range(1, m + 1):
        back[0][j] = 3
    for i in range(1, n + 1):
        cur = [NEG] * (m + 1)
        cur[0] = prev[0] + GAP_O
        back[i][0] = 2
        ok = otoks[i - 1][0]
        bi = back[i]
        for j in range(1, m + 1):
            s = _sim(ok, hw[j - 1]["k"], cache)
            d = prev[j - 1] + (2.0 * s - 0.4 if s >= 0.5 else -0.8)
            u = prev[j] + GAP_O
            l = cur[j - 1] + GAP_H
            if d >= u and d >= l:
                cur[j], bi[j] = d, 1
            elif u >= l:
                cur[j], bi[j] = u, 2
            else:
                cur[j], bi[j] = l, 3
        prev = cur
    j = max(range(m + 1), key=lambda x: prev[x])  # heard suffix is free too (outro noise)
    i = n
    match = {}  # sheet token index → heard word index
    while i > 0 and j > 0:
        b = back[i][j]
        if b == 1:
            if _sim(otoks[i - 1][0], hw[j - 1]["k"], cache) >= 0.5:
                match[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif b == 2:
            i -= 1
        else:
            j -= 1
    stats["matched"] = len(match)

    # per line: anchored when enough of its words were heard
    per_line = {}
    for ti, (_, li) in enumerate(otoks):
        per_line.setdefault(li, []).append(ti)
    timed = []
    for li, line in enumerate(sheet_lines):
        toks = per_line.get(li, [])
        hit = [match[t] for t in toks if t in match]
        if toks and hit and (len(hit) >= 2 or len(toks) <= 2) and len(hit) / len(toks) >= 0.3:
            timed.append({"li": li, "start": hw[min(hit)]["start"], "end": hw[max(hit)]["end"], "text": line, "used": set(range(min(hit), max(hit) + 1))})
        else:
            timed.append({"li": li, "start": None, "end": None, "text": line, "used": set()})
    stats["anchored"] = sum(1 for t in timed if t["start"] is not None)
    if stats["anchored"] < max(3, 0.3 * len(sheet_lines)):
        return [], stats

    # unanchored lines between two anchored ones: share the gap by length (only if the gap is short = still singing)
    k = 0
    while k < len(timed):
        if timed[k]["start"] is not None:
            k += 1
            continue
        e = k
        while e < len(timed) and timed[e]["start"] is None:
            e += 1
        a = timed[k - 1]["end"] if k > 0 else None
        b = timed[e]["start"] if e < len(timed) else None
        if a is not None and b is not None and 0 < b - a <= max_gap:
            wts = [len(timed[x]["text"]) + 8 for x in range(k, e)]
            tot, acc = float(sum(wts)), 0.0
            for x, wt in zip(range(k, e), wts):
                timed[x]["start"] = a + (b - a) * acc / tot
                acc += wt
                timed[x]["end"] = a + (b - a) * acc / tot - 0.1
        k = e

    # repeated choruses: leftover sung stretches → best-matching sheet line
    used = set().union(*[t["used"] for t in timed])
    runs, cur = [], []
    for idx, w in enumerate(hw):
        free = idx not in used and not any(t["start"] is not None and t["start"] <= w["start"] < t["end"] for t in timed)
        if free and (not cur or w["start"] - hw[cur[-1]]["end"] <= 0.7):
            cur.append(idx)
        else:
            if len(cur) >= 3:
                runs.append(cur)
            cur = [idx] if free else []
    if len(cur) >= 3:
        runs.append(cur)
    line_keys = ["".join(key(t, roman) for t in l.split()) for l in sheet_lines]
    for run in runs:
        s = 0
        while s < len(run):
            best = None
            for li, lk in enumerate(line_keys):
                nw = max(1, len(sheet_lines[li].split()))
                seg = run[s:s + nw]
                if len(seg) < max(2, nw // 2):
                    continue
                r = SequenceMatcher(None, lk, "".join(hw[x]["k"] for x in seg)).ratio()
                if best is None or r > best[0]:
                    best = (r, li, seg)
            if best and best[0] >= 0.55:
                _, li, seg = best
                timed.append({"li": li, "start": hw[seg[0]]["start"], "end": hw[seg[-1]]["end"], "text": sheet_lines[li], "used": set()})
                stats["repeats"] += 1
                s += len(seg)
            else:
                s += 1

    out = sorted(({"start": round(t["start"], 2), "end": round(max(t["end"], t["start"] + 0.8), 2), "text": t["text"]}
                  for t in timed if t["start"] is not None), key=lambda x: x["start"])
    for x in range(len(out) - 1):  # never overlap the next line
        out[x]["end"] = round(max(out[x]["start"] + 0.3, min(out[x]["end"] + 0.35, out[x + 1]["start"] - 0.05)), 2)
    return out, stats

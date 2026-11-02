/* Festive themes — dresses the site up for festivals around the world, starting 4 days before.
 *
 * What it does while a festival window is open:
 *   - recolours the site's accent variables (each site maps the palette onto its own variables),
 *   - hangs a twinkling light garland along the top edge,
 *   - drifts a few light, original decorations (diyas, snow, petals, lanterns, hearts…) across the page,
 *   - shows a small greeting pill with a countdown ("in 3 days" / "today"), dismissible per festival.
 *
 * It never blocks the page: no network calls, no dependencies, pointer-events off on decorations,
 * no particles for prefers-reduced-motion. Lunar/regional dates come from the verified table below;
 * when a year is missing from that table it logs a console warning instead of guessing.
 *
 * Preview any festival: add ?festival=<id> to the URL (e.g. ?festival=diwali). Turn off: ?festival=off.
 * The same file is used by AGENTVERSE (festive.js) and Ganesha AI Studio (src/services/festive.js):
 * keep the two copies identical.
 */
(function (root) {
  'use strict';

  var LEAD_DAYS = 4; // decorations go up this many days before the festival day

  // Dates that move every year (lunar/regional calendars). Sources checked 2026-11-02:
  // drikpanchang/hindu-blog/calendardate (Hindu festivals), publicholidays.in (Raksha Bandhan),
  // Khaleej Times + publicholidays.ae + calendar.center (Eid — expected, subject to moon sighting),
  // chinatravel.com (Lunar New Year).
  var LUNAR = {
    lunar_new_year: { 2027: '02-06', 2028: '01-26' },
    holi: { 2027: '03-22', 2028: '03-11' },
    eid_al_fitr: { 2027: '03-09', 2028: '02-26' },
    eid_al_adha: { 2027: '05-16', 2028: '05-04' },
    raksha_bandhan: { 2027: '08-17', 2028: '08-05' },
    ganesh_chaturthi: { 2027: '09-04', 2028: '08-23' },
    dussehra: { 2027: '10-09', 2028: '09-27' },
    diwali: { 2026: '11-08', 2027: '10-29', 2028: '10-17' },
  };
  var LUNAR_LAST_YEAR = 2028;

  // Palette: hi = bright accent for text/borders on dark, hi2 = second accent, deep = fill behind white text.
  // fx = decoration style; garland = string of lights along the top; days = extra days after the main day.
  var FESTIVALS = [
    { id: 'new_year', name: 'New Year', greet: 'Happy New Year', fixed: '01-01', fx: 'confetti', garland: true, prio: 6, colors: ['#ffd76a', '#ffffff', '#c9a2ff'], hi: '#ffd76a', hi2: '#e8d9ff', deep: '#6b3fd4' },
    { id: 'lunar_new_year', name: 'Lunar New Year', greet: 'Happy Lunar New Year', fx: 'lanterns', garland: true, days: 2, prio: 6, colors: ['#ff4d4d', '#ffcc4d'], hi: '#ff6b5e', hi2: '#ffd36b', deep: '#b3261e' },
    { id: 'republic_day_in', name: 'Republic Day', greet: 'Happy Republic Day', fixed: '01-26', lead: 2, fx: 'tricolor', prio: 4, colors: ['#ff9933', '#ffffff', '#138808'], hi: '#ffa94d', hi2: '#7fdc8a', deep: '#0b6b2e' },
    { id: 'valentines', name: "Valentine's Day", greet: "Happy Valentine's Day", fixed: '02-14', fx: 'hearts', prio: 3, colors: ['#ff4d8d', '#ff9ec4'], hi: '#ff6fa3', hi2: '#ffb3cf', deep: '#c2185b' },
    { id: 'eid_al_fitr', name: 'Eid al-Fitr', greet: 'Eid Mubarak', fx: 'stars', garland: true, days: 2, prio: 7, colors: ['#ffd76a', '#9ff0d4'], hi: '#ffd76a', hi2: '#7fe3c4', deep: '#0d6b55' },
    { id: 'holi', name: 'Holi', greet: 'Happy Holi', fx: 'colors', prio: 8, colors: ['#ff3d7f', '#ffd23f', '#2ec4ff', '#7cff6b', '#b46bff'], hi: '#ff5c95', hi2: '#ffd23f', deep: '#b0177a' },
    { id: 'easter', name: 'Easter', greet: 'Happy Easter', calc: 'easter', fx: 'petals', prio: 5, colors: ['#ffd1e8', '#d6f5c9', '#fff1a8', '#cbd8ff'], hi: '#ffb3d9', hi2: '#c4f0b0', deep: '#7a4fc9' },
    { id: 'eid_al_adha', name: 'Eid al-Adha', greet: 'Eid Mubarak', fx: 'stars', garland: true, days: 2, prio: 7, colors: ['#ffd76a', '#9ff0d4'], hi: '#ffd76a', hi2: '#7fe3c4', deep: '#0d6b55' },
    { id: 'raksha_bandhan', name: 'Raksha Bandhan', greet: 'Happy Raksha Bandhan', fx: 'petals', prio: 6, colors: ['#ff9f43', '#ff5e8a', '#ffd23f'], hi: '#ffa94d', hi2: '#ff8fb1', deep: '#c0392b' },
    { id: 'independence_day_in', name: 'Independence Day', greet: 'Happy Independence Day', fixed: '08-15', lead: 2, fx: 'tricolor', prio: 5, colors: ['#ff9933', '#ffffff', '#138808'], hi: '#ffa94d', hi2: '#7fdc8a', deep: '#0b6b2e' },
    { id: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', greet: 'Happy Ganesh Chaturthi', fx: 'petals', garland: true, days: 2, prio: 8, colors: ['#ff9f1c', '#ff5e5b', '#ffd23f'], hi: '#ffa94d', hi2: '#ffd23f', deep: '#c2410c' },
    { id: 'dussehra', name: 'Dussehra', greet: 'Happy Dussehra', fx: 'petals', garland: true, prio: 7, colors: ['#ff9f1c', '#ffd23f', '#ff5e5b'], hi: '#ffb347', hi2: '#ffd23f', deep: '#b45309' },
    { id: 'diwali', name: 'Diwali', greet: 'Happy Diwali', art: 'festive/diwali.gif', artTitle: 'Shubh Deepavali', fx: 'diyas', garland: true, days: 2, prio: 10, colors: ['#ffb347', '#ffd76a', '#ff7a3d'], hi: '#ffbe55', hi2: '#ffe08a', deep: '#b8520a' },
    { id: 'halloween', name: 'Halloween', greet: 'Happy Halloween', fixed: '10-31', fx: 'bats', prio: 3, colors: ['#ff8a1f', '#b26bff'], hi: '#ff9a3d', hi2: '#c49bff', deep: '#9a3c00' },
    { id: 'thanksgiving', name: 'Thanksgiving', greet: 'Happy Thanksgiving', calc: 'thanksgiving', fx: 'leaves', prio: 4, colors: ['#e76f24', '#c2410c', '#f2b134', '#9c4221'], hi: '#f59e4b', hi2: '#f2c14e', deep: '#9a3412' },
    { id: 'christmas', name: 'Christmas', greet: 'Merry Christmas', fixed: '12-25', fx: 'snow', garland: true, days: 1, prio: 9, colors: ['#ffffff', '#dff4ff'], hi: '#ff5a5f', hi2: '#7fe0a0', deep: '#b3121a' },
  ];

  var DAY = 86400000;
  function ymd(y, md) { var p = md.split('-'); return new Date(y, +p[0] - 1, +p[1]); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }

  function easter(y) { // Anonymous Gregorian computus
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function thanksgiving(y) { // US: fourth Thursday of November
    var first = new Date(y, 10, 1), offset = (4 - first.getDay() + 7) % 7;
    return new Date(y, 10, 1 + offset + 21);
  }

  var warned = {};
  function dateFor(f, y) {
    if (f.fixed) return ymd(y, f.fixed);
    if (f.calc === 'easter') return easter(y);
    if (f.calc === 'thanksgiving') return thanksgiving(y);
    var t = LUNAR[f.id];
    if (t && t[y]) return ymd(y, t[y]);
    if (y > LUNAR_LAST_YEAR && !warned[f.id + y] && typeof console !== 'undefined') {
      warned[f.id + y] = 1;
      console.warn('[festive] no verified ' + y + ' date for ' + f.name + ' — add it to LUNAR in festive.js');
    }
    return null;
  }

  // Every festival whose window [day - lead, day + days] contains `now`, best first.
  function active(now) {
    now = now || new Date();
    var out = [];
    for (var y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      FESTIVALS.forEach(function (f) {
        var d = dateFor(f, y);
        if (!d) return;
        var until = dayDiff(d, now); // >0 upcoming, 0 today, <0 after
        var lead = f.lead == null ? LEAD_DAYS : f.lead;
        if (until <= lead && until >= -(f.days || 0)) out.push({ festival: f, date: d, daysUntil: until });
      });
    }
    // Upcoming/today beats the tail of an earlier festival; then importance; then nearness.
    out.sort(function (a, b) {
      return (a.daysUntil < 0) - (b.daysUntil < 0) || b.festival.prio - a.festival.prio || Math.abs(a.daysUntil) - Math.abs(b.daysUntil);
    });
    return out;
  }

  // The next festival day on or after `now` (for status displays/tests).
  function upcoming(now, limit) {
    now = now || new Date();
    var out = [];
    for (var y = now.getFullYear(); y <= now.getFullYear() + 1; y++) {
      FESTIVALS.forEach(function (f) {
        var d = dateFor(f, y);
        if (d && dayDiff(d, now) >= 0) out.push({ festival: f, date: d, daysUntil: dayDiff(d, now) });
      });
    }
    out.sort(function (a, b) { return a.date - b.date; });
    return out.slice(0, limit || 5);
  }

  function byId(id) { for (var i = 0; i < FESTIVALS.length; i++) if (FESTIVALS[i].id === id) return FESTIVALS[i]; return null; }

  // ---------------- DOM ----------------
  var CSS = [
    '.fst-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483000}',
    '.fst-tint{position:fixed;inset:0;pointer-events:none;z-index:2147482999;mix-blend-mode:screen;',
    ' background:radial-gradient(90% 55% at 50% -10%,color-mix(in srgb,var(--fst-hi) 22%,transparent),transparent 70%),',
    ' radial-gradient(60% 40% at 100% 110%,color-mix(in srgb,var(--fst-hi2) 12%,transparent),transparent 70%)}',
    '.fst-garland{position:fixed;left:0;right:0;top:0;height:22px;pointer-events:none;z-index:2147483001;',
    ' background:radial-gradient(120% 22px at 50% -12px,transparent 60%,rgba(255,255,255,.18) 61%,transparent 64%) 0 0/120px 22px repeat-x}',
    '.fst-bulb{position:absolute;top:var(--y);left:var(--x);width:7px;height:9px;border-radius:50% 50% 45% 45%;background:var(--c);',
    ' box-shadow:0 0 6px 2px var(--c),0 0 14px 4px color-mix(in srgb,var(--c) 45%,transparent);animation:fst-tw 2.4s ease-in-out var(--d) infinite}',
    '@keyframes fst-tw{0%,100%{opacity:1}50%{opacity:.35}}',
    '.fst-p{position:absolute;top:-40px;left:var(--x);opacity:.9;will-change:transform;animation:fst-fall var(--t) linear var(--d) infinite}',
    '.fst-p.up{top:auto;bottom:-40px;animation-name:fst-rise}',
    '.fst-p svg{display:block;width:var(--s);height:var(--s);animation:fst-sway calc(var(--t) / 3) ease-in-out infinite alternate}',
    '@keyframes fst-fall{to{transform:translate3d(var(--dx),calc(100vh + 80px),0) rotate(var(--r))}}',
    '@keyframes fst-rise{to{transform:translate3d(var(--dx),calc(-100vh - 80px),0)}}',
    '@keyframes fst-sway{from{transform:translateX(-10px) rotate(-8deg)}to{transform:translateX(10px) rotate(8deg)}}',
    '.fst-pill{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483002;display:flex;align-items:center;gap:10px;',
    ' max-width:calc(100vw - 32px);padding:8px 8px 8px 14px;border-radius:999px;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;',
    ' background:linear-gradient(135deg,color-mix(in srgb,var(--fst-deep) 88%,#000),color-mix(in srgb,var(--fst-deep) 60%,#000));',
    ' border:1px solid color-mix(in srgb,var(--fst-hi) 55%,transparent);box-shadow:0 10px 30px -10px rgba(0,0,0,.7),0 0 24px -6px var(--fst-hi);',
    ' backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fst-in .6s cubic-bezier(.2,.8,.2,1) both}',
    '.fst-pill.top{top:calc(env(safe-area-inset-top,0px) + var(--fst-offset,64px))}',
    '.fst-pill.bottom{bottom:calc(env(safe-area-inset-bottom,0px) + var(--fst-offset,88px))}',
    '.fst-pill b{color:var(--fst-hi2);font-weight:700}',
    '.fst-pill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.fst-pill i{font-style:normal;opacity:.8;font-weight:500;white-space:nowrap}',
    '.fst-pill button{all:unset;cursor:pointer;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:none;',
    ' background:rgba(255,255,255,.12);color:#fff;font-size:15px;line-height:1}',
    '.fst-pill button:hover{background:rgba(255,255,255,.22)}.fst-pill button:focus-visible{outline:2px solid var(--fst-hi2);outline-offset:2px}',
    '@keyframes fst-in{from{opacity:0;transform:translate(-50%,-10px)}}',
    '.fst-pill img{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:none;margin-left:-6px;border:1.5px solid var(--fst-hi2);cursor:pointer}',
    '.fst-pill.has-art span{cursor:pointer}',
    '.fst-scrim{position:fixed;inset:0;z-index:2147483003;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.55);',
    ' backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:fst-fade .35s ease both}',
    '.fst-card{position:relative;width:min(360px,100%);border-radius:22px;overflow:hidden;color:#fff;font:600 15px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;',
    ' background:color-mix(in srgb,var(--fst-deep) 70%,#000);border:1.5px solid color-mix(in srgb,var(--fst-hi2) 70%,transparent);',
    ' box-shadow:0 30px 80px -20px rgba(0,0,0,.8),0 0 60px -10px var(--fst-hi);animation:fst-pop .5s cubic-bezier(.2,.8,.2,1) both}',
    '.fst-card img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}',
    '.fst-card .cap{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px}',
    '.fst-card .cap b{color:var(--fst-hi2);font-size:18px;letter-spacing:.01em}',
    '.fst-card .cap i{font-style:normal;font-weight:500;opacity:.8;font-size:13px}',
    '.fst-card button{all:unset;cursor:pointer;position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;',
    ' background:rgba(0,0,0,.45);color:#fff;font-size:18px}',
    '.fst-card button:focus-visible{outline:2px solid var(--fst-hi2);outline-offset:2px}',
    '@keyframes fst-fade{from{opacity:0}}@keyframes fst-pop{from{opacity:0;transform:scale(.92) translateY(10px)}}',
    '@media (prefers-reduced-motion:reduce){.fst-bulb,.fst-p,.fst-p svg{animation:none}.fst-pill,.fst-scrim,.fst-card{animation:none}}',
  ].join('\n');

  // Small original shapes; `c` is the fill colour.
  var SHAPES = {
    diyas: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 2c2 3 3 5 0 8-3-3-2-5 0-8z" fill="#ffe08a"/><path d="M12 4.5c.9 1.6 1.2 2.8 0 4.3-1.2-1.5-.9-2.7 0-4.3z" fill="#fff6d6"/><path d="M3 12h18c-1 5-5 8-9 8s-8-3-9-8z" fill="' + c + '"/><path d="M5 13.5h14" stroke="#7a2e00" stroke-width="1" opacity=".5"/></svg>'; },
    snow: function (c) { return '<svg viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 2l-2 2m2-2l2 2M12 22l-2-2m2 2l2-2"/></svg>'; },
    stars: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z" fill="' + c + '"/></svg>'; },
    lanterns: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 1v3" stroke="#ffcc4d" stroke-width="1.2"/><rect x="9" y="4" width="6" height="2" rx="1" fill="#ffcc4d"/><ellipse cx="12" cy="12.5" rx="7" ry="6.5" fill="' + c + '"/><path d="M12 6v13M8 7.5c-1.5 3-1.5 7 0 10M16 7.5c1.5 3 1.5 7 0 10" stroke="#7a0d0d" stroke-width=".8" fill="none" opacity=".5"/><rect x="9" y="18.5" width="6" height="2" rx="1" fill="#ffcc4d"/><path d="M12 20.5v3" stroke="#ffcc4d" stroke-width="1.2"/></svg>'; },
    hearts: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill="' + c + '"/></svg>'; },
    petals: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 3c4 3 5 9 0 18C7 12 8 6 12 3z" fill="' + c + '" opacity=".95"/></svg>'; },
    colors: function (c) { return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="' + c + '" opacity=".75"/><circle cx="8" cy="9" r="3" fill="#fff" opacity=".25"/></svg>'; },
    confetti: function (c) { return '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="2" fill="' + c + '"/></svg>'; },
    tricolor: function (c) { return '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" fill="' + c + '"/></svg>'; },
    bats: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 9c1-1.5 1-3 1-3l1 2c2-2 5-2 8-1-2 1-3 3-3 5-2-1-4 0-5 2-1-1-1.5-1.5-2-1.5S11 13 10 14c-1-2-3-3-5-2 0-2-1-4-3-5 3-1 6-1 8 1l1-2s0 1.5 1 3z" fill="' + c + '"/></svg>'; },
    leaves: function (c) { return '<svg viewBox="0 0 24 24"><path d="M12 2l1.5 4 3-2-.5 4 4-1-2 3.5 3 1.5-4 1.5 1 3-3.5-1L12 22l-2.5-5.5L6 17.5l1-3-4-1.5 3-1.5L4 8l4 1-.5-4 3 2z" fill="' + c + '"/></svg>'; },
  };
  var RISES = { diyas: 1, lanterns: 1, stars: 0 };

  function rand(a, b) { return a + Math.random() * (b - a); }

  function buildGarland(f) {
    var g = document.createElement('div');
    g.className = 'fst-garland';
    g.setAttribute('aria-hidden', 'true');
    var n = Math.max(10, Math.round(window.innerWidth / 42));
    var html = '';
    for (var i = 0; i < n; i++) {
      var x = (i + 0.5) / n * 100;
      var y = 6 + Math.sin((i % 3) / 3 * Math.PI) * 6; // gentle sag between hooks
      html += '<i class="fst-bulb" style="--x:' + x.toFixed(2) + '%;--y:' + y.toFixed(1) + 'px;--c:' + f.colors[i % f.colors.length] + ';--d:' + (-(i % 5) * 0.45).toFixed(2) + 's"></i>';
    }
    g.innerHTML = html;
    return g;
  }

  function buildLayer(f, count) {
    var layer = document.createElement('div');
    layer.className = 'fst-layer';
    layer.setAttribute('aria-hidden', 'true');
    var shape = SHAPES[f.fx] || SHAPES.stars;
    var html = '';
    for (var i = 0; i < count; i++) {
      var c = f.colors[i % f.colors.length];
      html += '<div class="fst-p' + (RISES[f.fx] ? ' up' : '') + '" style="--x:' + rand(0, 100).toFixed(1) + 'vw;--s:' + rand(12, 24).toFixed(0) + 'px;--t:' + rand(14, 26).toFixed(1) + 's;--d:' + (-rand(0, 26)).toFixed(1) + 's;--dx:' + rand(-60, 60).toFixed(0) + 'px;--r:' + rand(-240, 240).toFixed(0) + 'deg;opacity:' + rand(0.45, 0.9).toFixed(2) + '">' + shape(c) + '</div>';
    }
    layer.innerHTML = html;
    return layer;
  }

  function when(n) { return n > 1 ? 'in ' + n + ' days' : n === 1 ? 'tomorrow' : n === 0 ? 'today' : ''; }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { /* private mode */ }
    return null;
  }

  var state = { els: [], vars: [], target: null };

  function clear() {
    state.els.forEach(function (el) { el.remove(); });
    state.vars.forEach(function (v) { state.target.style.removeProperty(v); });
    if (state.target) delete state.target.dataset.festival;
    document.documentElement.removeAttribute('data-festival');
    state = { els: [], vars: [], target: null };
  }

  // Festival artwork card (animated GIF made by scripts/festive-art.py). Shown only if the file really exists.
  function openArt(fest, src, sub) {
    var old = document.querySelector('.fst-scrim');
    if (old) old.remove();
    var scrim = document.createElement('div');
    scrim.className = 'fst-scrim';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', fest.artTitle || fest.greet);
    ['--fst-hi', '--fst-hi2', '--fst-deep'].forEach(function (v, i) { scrim.style.setProperty(v, [fest.hi, fest.hi2, fest.deep][i]); });
    scrim.innerHTML = '<div class="fst-card"><img alt="' + (fest.artTitle || fest.greet) + ' festival artwork" src="' + src + '"><div class="cap"><b>' + (fest.artTitle || fest.greet) + '</b><i>' + sub + '</i></div><button type="button" aria-label="Close">×</button></div>';
    var close = function () { scrim.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    scrim.addEventListener('click', function (e) { if (e.target === scrim || e.target.tagName === 'BUTTON') close(); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(scrim);
    state.els.push(scrim);
    scrim.querySelector('button').focus({ preventScroll: true });
  }

  /* opts:
   *   target      element whose CSS variables are recoloured (default <html>)
   *   vars        { hi: ['--accent'], hi2: [...], deep: [...] } — site variables to set from the palette
   *   position    'top' | 'bottom' for the greeting pill (default 'top'); offset: px from that edge
   *   particles   how many decorations (default 16; 0 disables); minimal(): return true to skip particles
   *   artBase     URL prefix for festival artwork (default '' → relative to the page)
 *   now         Date override (tests)
   */
  function init(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return null;
    clear();
    var q = /[?&]festival=([a-z_]+)/.exec(location.search);
    if (q && q[1] === 'off') return null;
    var now = opts.now || new Date();
    var pick = null;
    if (q && byId(q[1])) {
      var f = byId(q[1]);
      pick = { festival: f, date: dateFor(f, now.getFullYear()) || now, daysUntil: 2, preview: true };
    } else {
      pick = active(now)[0] || null;
    }
    if (!pick) return null;
    var fest = pick.festival;
    var target = opts.target || document.documentElement;
    state.target = target;

    // Theme: palette onto the site's own variables + generic --fst-* for anyone who wants them.
    var pal = { hi: fest.hi, hi2: fest.hi2, deep: fest.deep };
    Object.keys(pal).forEach(function (k) {
      [('--fst-' + k)].concat((opts.vars && opts.vars[k]) || []).forEach(function (v) {
        target.style.setProperty(v, pal[k]);
        state.vars.push(v);
      });
    });
    target.dataset.festival = fest.id;
    document.documentElement.setAttribute('data-festival', fest.id);

    if (!document.getElementById('fst-css')) {
      var st = document.createElement('style');
      st.id = 'fst-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var add = function (el) { document.body.appendChild(el); state.els.push(el); };

    var tint = document.createElement('div');
    tint.className = 'fst-tint';
    tint.setAttribute('aria-hidden', 'true');
    tint.style.setProperty('--fst-hi', fest.hi);
    tint.style.setProperty('--fst-hi2', fest.hi2);
    add(tint);
    if (fest.garland) add(buildGarland(fest));
    var count = opts.particles == null ? 16 : opts.particles;
    if (window.innerWidth < 600) count = Math.round(count * 0.6);
    if (count > 0 && !reduced && !(opts.minimal && opts.minimal())) add(buildLayer(fest, count));

    var year = pick.date.getFullYear();
    var dkey = 'festive.dismissed.' + fest.id + '.' + year;
    if (pick.preview || store(dkey) !== '1') {
      var pill = document.createElement('div');
      pill.className = 'fst-pill ' + (opts.position === 'bottom' ? 'bottom' : 'top');
      pill.setAttribute('role', 'status');
      if (opts.offset != null) pill.style.setProperty('--fst-offset', opts.offset + 'px');
      ['--fst-hi', '--fst-hi2', '--fst-deep'].forEach(function (v, i) { pill.style.setProperty(v, [fest.hi, fest.hi2, fest.deep][i]); });
      var w = when(pick.daysUntil);
      var dateTxt = pick.date.getDate() + ' ' + MONTHS[pick.date.getMonth()];
      pill.innerHTML = '<span><b>' + fest.greet + '</b></span><i>' + (pick.preview ? 'preview' : (w ? w + ' · ' : '') + dateTxt) + '</i><button type="button" aria-label="Hide festival greeting">×</button>';
      pill.querySelector('button').addEventListener('click', function () {
        if (!pick.preview) store(dkey, '1');
        pill.remove();
      });
      add(pill);
      if (fest.art) {
        // Only wire the artwork once the GIF has actually loaded — no art yet means no thumbnail, no card.
        var src = (opts.artBase || '') + fest.art;
        var probe = new Image();
        probe.onload = function () {
          if (!pill.isConnected) return;
          var sub = pill.querySelector('i').textContent;
          var thumb = document.createElement('img');
          thumb.src = src;
          thumb.alt = '';
          pill.insertBefore(thumb, pill.firstChild);
          pill.classList.add('has-art');
          var open = function () { openArt(fest, src, sub); };
          thumb.addEventListener('click', open);
          pill.querySelector('span').addEventListener('click', open);
          var seen = 'festive.art.' + fest.id + '.' + year;
          if (!pick.preview && store(seen) !== '1') { store(seen, '1'); setTimeout(open, 1200); } // once per festival
        };
        probe.src = src;
      }
    }
    return pick;
  }

  // Re-check at midnight-ish so a tab left open rolls into/out of a festival on its own.
  function auto(opts) {
    var cur = init(opts);
    var last = cur ? cur.festival.id : '';
    setInterval(function () {
      var next = active(new Date())[0];
      var id = next ? next.festival.id : '';
      if (id !== last && !/[?&]festival=/.test(location.search)) { last = id; init(opts); }
    }, 30 * 60 * 1000);
    return cur;
  }

  root.Festive = { FESTIVALS: FESTIVALS, LUNAR: LUNAR, LEAD_DAYS: LEAD_DAYS, active: active, upcoming: upcoming, dateFor: dateFor, easter: easter, thanksgiving: thanksgiving, init: init, auto: auto, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);

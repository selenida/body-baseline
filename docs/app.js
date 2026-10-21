"use strict";
// Baseline — a private 30-day open-center tracking experiment. Everything lives in this phone's localStorage.

const KEY = "baseline30.v1";
const OLD_KEY = "baseline.v1"; // the finished 7-day log, kept only so it can be saved or deleted

// Severity ramp, 1 = no symptoms (green) → 10 = severe (rose).
const RAMP = ["#2F8F6B", "#4E9F6F", "#77AE63", "#A3B957", "#CDBE4E", "#E3AC47", "#E79148", "#E0754B", "#D25B55", "#B8445C"];
const BAD_HIGH = v => RAMP[v - 1];        // centers: high = worse
const GOOD_HIGH = v => RAMP[10 - v];      // energy, clarity, mood, sleep: high = better

const CENTERS = [
  ["head", "Head", "Pressure / mental loops", "#D9A93F"],
  ["ajna", "Ajna", "Fixation / anxiety", "#6E9E5E"],
  ["throat", "Throat", "Tension / metabolism issues", "#4F95B8"],
  ["g", "G Center", "Directional confusion", "#E08A3C"],
  ["heart", "Heart / Ego", "Exhaustion / chest tightness", "#D25E6A"],
  ["solar", "Solar Plexus", "Emotional swings / digestive issues", "#B9784A"],
  ["sacral", "Sacral", "Depletion / energy crashes", "#C9467A"],
  ["spleen", "Splenic", "Immune / fear activation", "#7C68B5"],
  ["root", "Root", "Adrenal pressure / deadline stress", "#8A6D52"],
];
const CMAP = Object.fromEntries(CENTERS.map(c => [c[0], c]));
const SCORES = [["energy", "Energy", "#E08A3C"], ["clarity", "Clarity", "#4F95B8"], ["mood", "Mood", "#C9467A"]];
const SLEEP_C = "#7C68B5";
const WOKE = [["rested", "Rested", "#2F8F6B"], ["neutral", "Neutral", "#7A8794"], ["fatigued", "Fatigued", "#E0754B"]];
const LATER = [["fine", "Felt fine", "#2F8F6B"], ["mild", "Mild reaction", "#E3AC47"], ["strong", "Strong reaction", "#D25B55"]];
const CHECKS = [["10", "10:00"], ["14", "14:00"], ["18", "18:00"]];
const COMPANY = [["alone", "Alone", "#7A8794"], ["with", "With someone", "#4F95B8"]];
const COND = [["yes", "Yes", "#2F8F6B"], ["partly", "Partly", "#E3AC47"], ["no", "No", "#D25B55"]];
const TASTE = [["sharper", "Sharper", "#2F8F6B"], ["same", "The same", "#7A8794"], ["duller", "Duller", "#E0754B"]];
const FIVE = v => RAMP[[9, 7, 5, 2, 0][v - 1]]; // 1–5, high = better
const RESET = [["1h", "Under 1 h", "#2F8F6B"], ["3h", "1–3 h", "#A3B957"], ["half", "Half a day", "#E3AC47"], ["next", "Next day", "#E0754B"], ["not", "Not yet", "#B8445C"]];
const TAG_COLORS = ["#4F95B8", "#6E9E5E", "#E08A3C", "#7C68B5", "#C9467A", "#B9784A", "#D9A93F", "#3F9C93"];

let db = load();
let tab = "today";
let cur = clampDay(logicalToday());
let openWeek = null;
let block = null;

/* ---------------- storage ---------------- */
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!d || !d.start) {
    // The 30-day experiment starts the first time the app opens in this mode.
    const t = logicalToday();
    d = { start: t, protocol: { start: t, focus: "" }, open: ["spleen"], days: {}, weeks: {}, milestones: {} };
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
  }
  return d;
}
let savedTimer;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert("Could not save: " + e.message); return; }
  const el = document.getElementById("saved");
  el.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove("show"), 900);
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

function blankDay() {
  return {
    sleep: null, hours: "", woke: "", mind: "", body: "",
    c: {}, energy: null, clarity: null, mood: null, checks: {},
    places: [], placeNote: "", people: [], peopleNote: "", group: null, reset: "",
    food: [], foodNote: "", unusual: "",
  };
}
// Fields added after launch get filled in lazily, so earlier days still load.
function upgrade(d) { if (!d.checks) d.checks = {}; if (d.cond == null) d.cond = ""; if (d.taste == null) d.taste = ""; if (d.mealEnergy === undefined) d.mealEnergy = null; return d; }
function day(iso = cur) { if (!db.days[iso]) db.days[iso] = blankDay(); return upgrade(db.days[iso]); }
function peek(iso) { return db.days[iso] ? upgrade(db.days[iso]) : null; }
function morningDone(d) { return !!(d && d.sleep && d.hours && d.woke); }
function centersDone(d) { return !!(d && CENTERS.every(([k]) => d.c[k])); }
function scoresDone(d) { return !!(d && SCORES.every(([k]) => d[k])); }
function anyData(d) {
  if (!d) return false;
  return !!(d.sleep || d.hours || d.woke || d.mind || d.body || Object.keys(d.c).length || d.energy || d.clarity || d.mood ||
    d.places.length || d.placeNote || d.people.length || d.peopleNote || d.group != null || Object.keys(d.checks || {}).length || d.cond || d.mealEnergy || d.taste || d.food.length || d.foodNote || d.unusual);
}
function status(iso) {
  const d = peek(iso);
  if (morningDone(d) && centersDone(d) && scoresDone(d)) return "done";
  return anyData(d) ? "part" : "";
}

/* ---------------- dates ---------------- */
function isoOf(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function parseIso(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); }
function diffDays(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 864e5); }
// Before 4am still counts as the previous day.
function logicalToday() { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); return isoOf(d); }
function fmtDay(iso, opts = { weekday: "short", day: "numeric", month: "short" }) { return parseIso(iso).toLocaleDateString(undefined, opts); }
function dayNo(iso) { return diffDays(db.start, iso) + 1; }
function protoNo(iso) { return diffDays(db.protocol.start, iso) + 1; }
function isoOfDay(n) { return addDays(db.start, n - 1); }
function todayNo() { return dayNo(logicalToday()); }
function clampDay(iso) {
  const t = logicalToday();
  if (iso > t) return t;
  if (db && iso < db.start) return db.start;
  return iso;
}

/* ---------------- maths ---------------- */
function mean(xs) { xs = xs.filter(x => x != null && x !== "" && !isNaN(x)); return xs.length ? xs.reduce((a, b) => a + +b, 0) / xs.length : null; }
function fmt1(x) { return x == null ? "–" : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ""); }
function hoursNum(s) { const n = parseFloat(String(s).replace(",", ".")); return isNaN(n) ? null : n; }
function daysIn(fromNo, toNo) {
  const out = [];
  for (let n = fromNo; n <= Math.min(toNo, todayNo()); n++) out.push(isoOfDay(n));
  return out;
}
function averages(isos) {
  const ds = isos.map(peek).filter(Boolean);
  const a = {
    energy: mean(ds.map(d => d.energy)), clarity: mean(ds.map(d => d.clarity)),
    mood: mean(ds.map(d => d.mood)),
    mealEnergy: mean(ds.map(d => d.mealEnergy)),
    cond: Object.fromEntries(COND.map(([k]) => [k, ds.filter(d => d.cond === k).length])),
    taste: Object.fromEntries(TASTE.map(([k]) => [k, ds.filter(d => d.taste === k).length])),
    checks: Object.fromEntries(CHECKS.map(([k]) => [k, mean(ds.map(d => d.checks[k]))])), sleep: mean(ds.map(d => d.sleep)), hours: mean(ds.map(d => hoursNum(d.hours))),
    c: {}, n: ds.filter(anyData).length,
  };
  for (const [k] of CENTERS) a.c[k] = mean(ds.map(d => d.c[k]));
  return a;
}
function rankCenters(avg) {
  return CENTERS.map(([k]) => [k, avg.c[k]]).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1]);
}
function symptomLoad(d) { return mean(CENTERS.map(([k]) => d.c[k])); }

/* ---------------- tiny DOM helper ---------------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

/* ---------------- reusable inputs ---------------- */
// 1–10 colour scale. `color(v)` picks each button's colour; tap the chosen value again to clear.
function scale(value, onPick, { color = BAD_HIGH, ends, valEl, max = 10 } = {}) {
  const row = h("div", { class: "scale", role: "group", style: max === 10 ? null : { "grid-template-columns": `repeat(${max}, 1fr)` } });
  const paint = () => {
    row.classList.toggle("has", value != null);
    row.querySelectorAll("button").forEach(b => {
      const on = +b.dataset.v === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    if (valEl) valEl.textContent = value ? `${value}/${max}` : "";
  };
  for (let v = 1; v <= max; v++) {
    const b = h("button", { type: "button", "data-v": v, style: { "--c": color(v) } }, v);
    b.onclick = () => { value = value === v ? null : v; paint(); onPick(value); };
    row.append(b);
  }
  paint();
  const wrap = h("div", { class: "stack", style: { gap: "6px" } }, row);
  if (ends) wrap.append(h("div", { class: "scale-ends" }, h("span", {}, ends[0]), h("span", {}, ends[1])));
  return wrap;
}
function scaleField(label, value, onPick, opts = {}) {
  const val = h("span", { class: "val" });
  return h("div", { class: "field" }, h("div", { class: "flabel" }, label, val), scale(value, onPick, { ...opts, valEl: val }));
}
// Single-select coloured buttons. `opts` = [[key, label, colour]].
function choice(opts, value, onPick, { wrap } = {}) {
  const box = h("div", { class: "choices" + (wrap ? " wrap" : "") });
  const paint = () => box.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.k === value));
  for (const [k, label, c] of opts) {
    const b = h("button", { type: "button", class: "choice", "data-k": k, style: { "--c": c } }, label);
    b.onclick = () => { value = value === k ? "" : k; paint(); onPick(value); };
    box.append(b);
  }
  paint();
  return box;
}
function text(value, onInput, { placeholder, area, cls } = {}) {
  const el = h(area ? "textarea" : "input", { class: "inputline" + (cls ? " " + cls : ""), type: area ? null : "text", placeholder, rows: area ? 2 : null, value: value || "" });
  el.addEventListener("input", () => onInput(el.value));
  el.addEventListener("change", () => { onInput(el.value.trim()); save(); });
  return el;
}
function field(label, ...kids) { return h("div", { class: "field" }, h("div", { class: "flabel" }, label), ...kids); }

// Tags seen anywhere, most used first, each with a stable colour.
function known(prop) {
  const n = {};
  for (const d of Object.values(db.days)) {
    const lists = [d[prop] || []];
    if (prop === "people") for (const f of d.food) lists.push(f.with || []);
    for (const l of lists) for (const t of l) n[t] = (n[t] || 0) + 1;
  }
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
}
function tagColor(t) { let s = 0; for (const ch of t) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return TAG_COLORS[s % TAG_COLORS.length]; }
function tagPicker(prop, selected, addLabel) {
  const wrap = h("div");
  const draw = () => {
    wrap.textContent = "";
    const box = h("div", { class: "chips" });
    for (const t of [...new Set([...known(prop), ...selected])]) {
      const c = h("button", { type: "button", class: "chip" + (selected.includes(t) ? " on" : ""), style: { "--c": tagColor(t) } }, t);
      c.onclick = () => {
        const i = selected.indexOf(t);
        if (i >= 0) selected.splice(i, 1); else selected.push(t);
        save(); draw();
      };
      box.append(c);
    }
    const add = h("button", { type: "button", class: "chip add" }, "+ " + addLabel);
    add.onclick = () => {
      const v = (prompt(addLabel) || "").trim();
      if (v && !selected.includes(v)) { selected.push(v); save(); }
      draw();
    };
    box.append(add);
    wrap.append(box);
  };
  draw();
  return wrap;
}
function sec(title, hint) { return h("div", { class: "sec" }, h("span", {}, title), hint ? h("span", { class: "sec-hint" }, hint) : null); }
function card(...kids) { return h("div", { class: "card" }, ...kids); }

/* ---------------- header ---------------- */
function appHead() {
  const n = dayNo(cur);
  const target = n <= 30 ? 30 : n <= 60 ? 60 : 90;
  const prev = h("button", { class: "navbtn", "aria-label": "Previous day", disabled: cur <= db.start }, "‹");
  prev.onclick = () => { cur = addDays(cur, -1); render(); };
  const next = h("button", { class: "navbtn", "aria-label": "Next day", disabled: cur >= logicalToday() }, "›");
  next.onclick = () => { cur = addDays(cur, 1); render(); };
  const sub = [cur === logicalToday() ? "Today" : null, fmtDay(cur, { weekday: "short", day: "numeric", month: "short" }), `protocol day ${protoNo(cur)}`].filter(Boolean);

  // 30-day strip for the block this day sits in
  const b = Math.floor((n - 1) / 30);
  const strip = h("div", { class: "strip" });
  for (let i = 1; i <= 30; i++) {
    const dn = b * 30 + i, iso = isoOfDay(dn);
    const fut = iso > logicalToday();
    const cell = h("button", { type: "button", class: ["d", fut ? "future" : status(iso), iso === cur ? "cur" : ""].join(" "), "aria-label": `Day ${dn}`, disabled: fut }, dn);
    if (!fut) cell.onclick = () => { cur = iso; render(); };
    strip.append(cell);
  }
  return h("header", { class: "apphead" },
    h("div", { class: "row1" },
      h("div", {}, h("div", { class: "date" }, `Day ${n} of ${target}`), h("div", { class: "date-sub" }, sub.join(" · "))),
      h("div", { class: "navbtns" }, prev, next)),
    strip);
}

/* ---------------- Today ---------------- */
function renderToday() {
  const d = day();
  const isToday = cur === logicalToday();
  const out = [];
  if (dayNo(cur) === 1 && !anyData(peek(cur))) {
    out.push(h("div", { class: "card ok-soft" },
      h("h3", {}, "Day 1 of your 30-day experiment"),
      h("p", {}, "You are not trying to feel better quickly. You are trying to understand what your body is actually doing. Record honestly — a bad day is data, not failure.")));
  }

  // Morning
  out.push(sec("Morning check-in", "within 30 min of waking"));
  out.push(card(
    scaleField("Sleep quality last night", d.sleep, v => { d.sleep = v; save(); refreshStrip(); }, { color: GOOD_HIGH, ends: ["poor", "great"] }),
    field("Hours slept", h("div", { class: "row" },
      text(d.hours, v => { d.hours = v; }, { placeholder: "7,5", cls: "hours" }),
      h("span", { class: "sub" }, "hours"))),
    field("Woke feeling", choice(WOKE, d.woke, v => { d.woke = v; save(); refreshStrip(); })),
    field("First mental state on waking", text(d.mind, v => { d.mind = v; }, { area: true, placeholder: "What was the mind doing?" })),
    field("Body sensations on waking", text(d.body, v => { d.body = v; }, { area: true, placeholder: "Heavy, light, tight, warm…" })),
  ));
  // hours text saves on change; make the strip catch up too
  out[out.length - 1].querySelector(".hours").addEventListener("change", refreshStrip);

  // Centers
  out.push(sec("Center symptoms", "1 = none · 10 = severe"));
  const cc = card();
  cc.style.gap = "0";
  for (const [k, name, desc, col] of CENTERS) {
    const val = h("span", { class: "val" });
    const isOpen = db.open.includes(k);
    cc.append(h("div", { class: "center", style: { "--cc": col } },
      h("div", { class: "chead" }, h("span", { class: "cdot" }),
        h("div", {}, h("div", { class: "cname" }, name, " ", isOpen ? h("span", { class: "tag" }, "open") : null), h("div", { class: "cdesc" }, desc)),
        val),
      scale(d.c[k] || null, v => { if (v) d.c[k] = v; else delete d.c[k]; save(); refreshStrip(); }, { valEl: val })));
  }
  out.push(cc);
  out.push(h("p", { class: "disc" }, "Defined or open, any center can show symptoms — rate all nine."));

  // Overall
  out.push(sec("Overall scores"));
  out.push(card(...SCORES.map(([k, label]) =>
    scaleField(label, d[k], v => { d[k] = v; save(); refreshStrip(); }, { color: GOOD_HIGH, ends: ["low", "high"] }))));

  // Daytime energy check-ins (carried over from the 7-day log)
  out.push(sec("Energy check-ins", "1 = drained · 10 = full"));
  out.push(card(...CHECKS.map(([k, label]) =>
    scaleField(label, d.checks[k] || null, v => { if (v) d.checks[k] = v; else delete d.checks[k]; save(); refreshStrip(); }, { color: GOOD_HIGH })),
    h("p", { class: "sub" }, "A quick tap at 10, 14 and 18 o'clock. Fill them in later if you miss the moment.")));

  // Observations
  out.push(sec("Patterns & observations"));
  out.push(card(
    field("Environments today", tagPicker("places", d.places, "Add place"),
      text(d.placeNote, v => { d.placeNote = v; }, { area: true, placeholder: "How the spaces felt" })),
  ));
  const resetBox = h("div", { class: "field", style: { display: d.group ? "" : "none" } },
    h("div", { class: "flabel" }, "How long did it take you to reset?"),
    choice(RESET, d.reset, v => { d.reset = v; save(); }, { wrap: true }),
    h("p", { class: "sub" }, "Your recovery window — how much buffer you need between social obligations."));
  out.push(card(
    field("People / interactions", tagPicker("people", d.people, "Add person"),
      text(d.peopleNote, v => { d.peopleNote = v; }, { area: true, placeholder: "What happened, how it felt" })),
    field("Group time today?", choice([["yes", "Yes, I was in a group", "#4F95B8"], ["no", "No", "#7A8794"]], d.group === true ? "yes" : d.group === false ? "no" : "",
      v => { d.group = v === "yes" ? true : v === "no" ? false : null; if (!d.group) d.reset = ""; resetBox.style.display = d.group ? "" : "none"; save(); })),
    resetBox,
  ));
  out.push(foodCard(d, isToday));
  out.push(card(field("Anything unusual", text(d.unusual, v => { d.unusual = v; }, { area: true, placeholder: "Anything that stood out" }))));
  return out;
}

// Alone or with someone, and who — names are shared with the People list.
function companyPicker(f) {
  if (!f.with) f.with = [];
  const who = h("div", { style: { display: f.company === "with" ? "" : "none" } }, tagPicker("people", f.with, "Add person"));
  return h("div", { class: "stack" },
    choice(COMPANY, f.company || "", v => { f.company = v; if (v !== "with") f.with.length = 0; who.style.display = v === "with" ? "" : "none"; save(); }),
    who);
}

// Open spleen: what was eaten, and how it felt 2–4 h later.
function foodCard(d, isToday) {
  const list = h("div", { class: "stack" });
  const draw = () => {
    list.textContent = "";
    d.food.forEach((f, i) => {
      const t = h("input", { type: "time", class: "inputline time", value: f.time || "" });
      t.onchange = () => { f.time = t.value; save(); };
      const x = h("button", { type: "button", class: "xbtn", "aria-label": "Remove" }, "×");
      x.onclick = () => { if (!f.what || confirm(`Remove “${f.what}”?`)) { d.food.splice(i, 1); save(); draw(); } };
      list.append(h("div", { class: "food" },
        h("div", { class: "row" }, t, h("div", { class: "grow" }, text(f.what, v => { f.what = v; }, { placeholder: "What you ate" })), x),
        companyPicker(f),
        h("div", { class: "food-later" }, "2–4 hours later"),
        choice(LATER, f.later, v => { f.later = v; save(); }),
        text(f.note, v => { f.note = v; }, { placeholder: "Body response (optional)" })));
    });
    const add = h("button", { type: "button", class: "addbtn" }, "+ Add food");
    add.onclick = () => {
      const now = new Date();
      d.food.push({ time: isToday ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "", what: "", company: "", with: [], later: "", note: "" });
      save(); draw();
      const inputs = list.querySelectorAll(".food input[type=text]");
      inputs[inputs.length - 1]?.focus();
    };
    list.append(add);
  };
  draw();
  return card(
    h("div", { class: "field" },
      h("div", { class: "flabel" }, "Food / digestion", db.open.includes("spleen") ? h("span", { class: "tag", style: { "--cc": CMAP.spleen[3] } }, "open spleen") : null),
      h("p", { class: "sub" }, "Log what you eat, then come back 2–4 hours later and note how you felt."),
      list,
      text(d.foodNote, v => { d.foodNote = v; }, { area: true, placeholder: "Digestion notes" })),
    field("Ate under my condition?", choice(COND, d.cond, v => { d.cond = v; save(); })),
    scaleField("Energy 30 minutes after the main meal", d.mealEnergy, v => { d.mealEnergy = v; save(); }, { color: FIVE, max: 5, ends: ["low", "high"] }),
    field("My taste sense today", choice(TASTE, d.taste, v => { d.taste = v; save(); })));
}

// Repaint just the header strip, so tapping scales doesn't jump the page.
function refreshStrip() {
  const old = document.querySelector(".apphead");
  if (old) old.replaceWith(appHead());
}

/* ---------------- Weeks ---------------- */
function weekCount() { return Math.ceil(todayNo() / 7); }
function renderWeeks() {
  const out = [h("h1", { class: "view-title" }, "Weekly reviews"),
    h("p", { class: "disc" }, "Complete one every 7 days. The averages fill in from your daily log.")];
  const wc = weekCount();
  if (openWeek == null) openWeek = todayNo() % 7 === 0 || wc === 1 ? wc : wc - 1;
  for (let w = wc; w >= 1; w--) out.push(weekCard(w));
  return out;
}
function weekCard(w) {
  const from = (w - 1) * 7 + 1, to = w * 7;
  const isos = daysIn(from, to);
  const avg = averages(isos);
  const r = db.weeks[w] || (db.weeks[w] = {});
  const ended = todayNo() >= to;
  const filled = ["env", "food", "social", "surprise", "adjust"].some(k => r[k]);
  const badge = filled ? h("span", { class: "badge ok" }, "Reviewed") : ended ? h("span", { class: "badge warn" }, "Review due") : h("span", { class: "badge" }, `Day ${todayNo() - from + 1} of 7`);
  const head = h("button", { type: "button", class: "wk-head" },
    h("div", {}, h("h3", {}, `Week ${w}`), h("div", { class: "sub" }, `${fmtDay(isoOfDay(from), { day: "numeric", month: "short" })} – ${fmtDay(isoOfDay(to), { day: "numeric", month: "short" })} · ${avg.n} day${avg.n === 1 ? "" : "s"} logged`)),
    badge);
  head.onclick = () => { openWeek = openWeek === w ? 0 : w; render(); };
  const c = card(head);
  if (openWeek !== w) return c;

  const ranked = rankCenters(avg);
  const centerLine = (pair) => {
    if (!pair) return h("span", { class: "sub" }, "not enough data yet");
    const [k, v] = pair, cc = CMAP[k];
    return h("span", { class: "k" }, h("span", { class: "cdot", style: { "--cc": cc[3] } }), `${cc[1]} · ${fmt1(v)}/10`);
  };
  c.append(
    h("div", { class: "sub" }, "Average daily scores"),
    tiles([["Energy", avg.energy, SCORES[0][2]], ["Clarity", avg.clarity, SCORES[1][2]], ["Mood", avg.mood, SCORES[2][2]], ["Sleep", avg.sleep, SLEEP_C]]),
    h("div", {},
      h("div", { class: "kv" }, h("span", {}, "Most symptomatic"), centerLine(ranked[0])),
      h("div", { class: "kv" }, h("span", {}, "Least symptomatic"), centerLine(ranked.length > 1 ? ranked[ranked.length - 1] : null)),
      avg.hours != null ? h("div", { class: "kv" }, h("span", {}, "Hours slept"), h("span", { class: "v" }, fmt1(avg.hours))) : null,
      h("div", { class: "kv" }, h("span", {}, "Energy at 10 · 14 · 18"), h("span", { class: "v" }, CHECKS.map(([k]) => fmt1(avg.checks[k])).join(" · "))),
      h("div", { class: "kv" }, h("span", {}, "Ate under my condition"), countTags(COND, avg.cond)),
      h("div", { class: "kv" }, h("span", {}, "Energy after main meal"), h("span", { class: "v" }, avg.mealEnergy == null ? "–" : `${fmt1(avg.mealEnergy)}/5`)),
      h("div", { class: "kv" }, h("span", {}, "Taste sense"), countTags(TASTE, avg.taste))),
    centerBars(avg),
    ...[["env", "Pattern I noticed about environments"], ["food", "Pattern I noticed about food / digestion"],
      ["social", "Pattern I noticed about social interactions"], ["surprise", "Surprise observation from this week"],
      ["adjust", "Adjustment I want to make next week"]].map(([k, label]) =>
      field(label, text(r[k], v => { r[k] = v; }, { area: true }))));
  return c;
}
function tiles(list) {
  return h("div", { class: "tiles" }, list.map(([label, v, col]) =>
    h("div", { class: "tile", style: { "--c": v == null ? "#9A9A94" : col } }, h("b", {}, fmt1(v)), h("span", {}, label))));
}
function centerBars(avg) {
  return h("div", { class: "stack", style: { gap: "7px" } }, CENTERS.map(([k, name]) => {
    const v = avg.c[k];
    return h("div", { class: "row", style: { gap: "10px" } },
      h("span", { class: "sub", style: { width: "92px", flex: "none" } }, name),
      h("div", { class: "bar grow" }, h("i", { style: { width: v ? `${v * 10}%` : "0", "--c": v ? BAD_HIGH(Math.round(v)) : "transparent" } })),
      h("span", { class: "sub", style: { width: "28px", "text-align": "right" } }, fmt1(v)));
  }));
}

/* ---------------- 30 days ---------------- */
function renderMilestone() {
  const tn = todayNo();
  const maxBlock = Math.max(0, Math.floor((tn - 1) / 30));
  if (block == null || block > maxBlock) block = maxBlock;
  const b = block, m = (b + 1) * 30;
  const out = [h("h1", { class: "view-title" }, `${m}-day milestone`)];
  if (maxBlock > 0) {
    out.push(choice(Array.from({ length: maxBlock + 1 }, (_, i) => [String(i), `Days ${i * 30 + 1}–${(i + 1) * 30}`, "#2F6F5E"]), String(b), v => { block = v === "" ? b : +v; render(); }, { wrap: true }));
  }
  const left = m - tn;
  if (left > 0) {
    out.push(h("div", { class: "card warn-soft" },
      h("h3", {}, left === 1 ? "Milestone review tomorrow" : `Milestone review in ${left} days`),
      h("p", {}, `On ${fmtDay(isoOfDay(m), { weekday: "long", day: "numeric", month: "long" })}. Everything below is building from your log as you go.`),
      h("div", { class: "prog" }, h("i", { style: { width: `${Math.round(((tn - b * 30) / 30) * 100)}%` } }))));
  }
  const isos = daysIn(b * 30 + 1, m);

  out.push(sec("Scores over time"), card(lineChart(isos), h("div", { class: "legend" },
    [...SCORES, ["sleep", "Sleep", SLEEP_C]].map(([, l, c]) => h("span", {}, h("i", { class: "sw", style: { "--c": c } }), l)))));
  out.push(sec("Center map", "green = calm · rose = severe"), card(heatmap(isos)));

  // Week 1 vs week 4 of this block
  const wA = averages(daysIn(b * 30 + 1, b * 30 + 7)), wB = averages(daysIn(b * 30 + 22, b * 30 + 28));
  out.push(sec(`Week 1 vs week 4`, tn < b * 30 + 22 ? "week 4 not reached yet" : null), card(compareTable(wA, wB),
    h("p", { class: "sub" }, "That delta is your signal about which protocols are working and which centers still need attention.")));

  out.push(...patternCards(isos));

  // Reflection + decision
  const r = db.milestones[m] || (db.milestones[m] = {});
  const focus = db.protocol.focus;
  let focusNote = null;
  if (focus && wA.c[focus] != null && wB.c[focus] != null) {
    const drop = wA.c[focus] - wB.c[focus];
    focusNote = h("div", { class: "card " + (drop >= 3 ? "ok-soft" : "warn-soft") },
      h("p", {}, `${CMAP[focus][1]} (your priority center) moved from ${fmt1(wA.c[focus])} to ${fmt1(wB.c[focus])} — ${drop >= 3 ? "stabilized by 3+ points. Ready to add a second center if you want." : `${fmt1(Math.max(0, drop))} points so far. Add a second center only once it has stabilized by at least 3.`}`));
  }
  const startBtn = h("button", { class: "btn primary", style: { display: r.decision === "add" ? "" : "none" } }, "Start the new protocol today");
  startBtn.onclick = () => {
    if (!confirm("Protocol day 1 starts today. Your experiment day count keeps going.")) return;
    db.protocol.start = logicalToday(); r.protocolStarted = logicalToday(); save(); tab = "info"; render();
  };
  out.push(sec("Your review"), card(
    field("The most surprising thing about how your open centers operate in your actual life",
      h("p", { class: "sub" }, "3–5 sentences. Not in theory — in the specific environments and relationships of your world."),
      text(r.reflection, v => { r.reflection = v; }, { area: true })),
    field("Next 30 days", choice([["same", "Continue the same protocol", "#2F6F5E"], ["add", "Add a protocol for a second center", "#7C68B5"]], r.decision || "",
      v => { r.decision = v; save(); startBtn.style.display = v === "add" ? "" : "none"; }, { wrap: true })),
    focusNote, startBtn));
  out.push(h("p", { class: "disc" }, "The goal is not completion — it is ongoing self-awareness. With 90+ days, the aim is to recognize center distortion within minutes of it starting, with a strategy ready before the conditioning takes hold."));
  return out;
}

function lineChart(isos) {
  const W = 320, H = 150, P = 18, n = 30;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Energy, clarity, mood and sleep across the days" });
  const x = i => P + (i * (W - P * 2)) / (n - 1), y = v => H - P - ((v - 1) * (H - P * 2)) / 9;
  for (const v of [1, 5, 10]) {
    svg.append(svgEl("line", { x1: P, x2: W - P, y1: y(v), y2: y(v), stroke: "#EDEDEA", "stroke-width": 1 }));
    const t = svgEl("text", { x: 2, y: y(v) + 3.5, "font-size": 9, fill: "#A9A9A3" }); t.textContent = v; svg.append(t);
  }
  for (const wk of [7, 14, 21, 28]) svg.append(svgEl("line", { x1: x(wk - 0.5), x2: x(wk - 0.5), y1: P - 6, y2: H - P, stroke: "#F3F3F0", "stroke-width": 1 }));
  for (const [k, , col] of [...SCORES, ["sleep", "", SLEEP_C]]) {
    let path = "", pen = false;
    isos.forEach((iso, i) => {
      const v = peek(iso)?.[k];
      if (!v) { pen = false; return; }
      path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
      svg.append(svgEl("circle", { cx: x(i), cy: y(v), r: 2.6, fill: col }));
    });
    if (path) svg.append(svgEl("path", { d: path, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: .85 }));
  }
  if (!isos.some(i => SCORES.some(([k]) => peek(i)?.[k]))) {
    const t = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", "font-size": 12, fill: "#A9A9A3" }); t.textContent = "Lines appear as you log scores"; svg.append(t);
  }
  return svg;
}
function heatmap(isos) {
  const grid = h("div", { class: "heat", style: { "grid-template-columns": "62px repeat(30, minmax(0, 1fr))" } });
  for (const [k, name, , col] of CENTERS) {
    grid.append(h("span", { class: "hl" }, h("span", { class: "cdot", style: { "--cc": col, width: "8px", height: "8px" } }), name.replace(" / Ego", "").replace(" Center", "").replace(" Plexus", " Pl.")));
    for (let i = 0; i < 30; i++) {
      const v = isos[i] && peek(isos[i])?.c[k];
      grid.append(h("span", { class: "hc", title: v ? `${name}: ${v}` : "", style: v ? { background: BAD_HIGH(v) } : null }));
    }
  }
  grid.append(h("span"));
  for (let i = 1; i <= 30; i++) grid.append(h("span", { class: "hx" }, i % 7 === 1 ? i : ""));
  return grid;
}
function compareTable(a, b) {
  const row = (label, va, vb, higherIsBetter, dot) => {
    let cls = "same", txt = "–";
    if (va != null && vb != null) {
      const dlt = vb - va, good = higherIsBetter ? dlt : -dlt;
      txt = (dlt > 0 ? "+" : "") + fmt1(dlt);
      cls = Math.abs(dlt) < 0.5 ? "same" : good > 0 ? "up" : "down";
    }
    return h("tr", {}, h("td", {}, dot ? h("span", { class: "k", style: { display: "inline-flex", gap: "7px", "align-items": "center" } }, h("span", { class: "cdot", style: { "--cc": dot } }), label) : label),
      h("td", {}, fmt1(va)), h("td", {}, fmt1(vb)), h("td", {}, h("span", { class: "delta " + cls }, txt)));
  };
  return h("table", { class: "cmp" },
    h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Wk 1"), h("th", {}, "Wk 4"), h("th", {}, "Change"))),
    h("tbody", {},
      row("Energy", a.energy, b.energy, true), row("Clarity", a.clarity, b.clarity, true),
      row("Mood", a.mood, b.mood, true), row("Sleep", a.sleep, b.sleep, true),
      CHECKS.map(([k, t]) => row(`Energy ${t}`, a.checks[k], b.checks[k], true)),
      CENTERS.map(([k, name, , col]) => row(name, a.c[k], b.c[k], false, col))));
}
function patternCards(isos) {
  const ds = isos.map(i => [i, peek(i)]).filter(([, d]) => d && anyData(d));
  const out = [sec("Recurring correlations")];

  // environment → symptoms
  const byPlace = {};
  for (const [, d] of ds) for (const p of d.places) (byPlace[p] = byPlace[p] || []).push(d);
  const placeRows = Object.entries(byPlace).sort((x, y) => y[1].length - x[1].length).slice(0, 8);
  out.push(card(h("h3", {}, "Environments → symptoms"),
    placeRows.length ? h("div", {}, placeRows.map(([p, list]) => {
      const load = mean(list.map(symptomLoad)), en = mean(list.map(d => d.energy));
      const worst = rankCenters({ c: Object.fromEntries(CENTERS.map(([k]) => [k, mean(list.map(d => d.c[k]))])) })[0];
      return h("div", { class: "kv" }, h("span", { class: "k" }, h("span", { class: "cdot", style: { "--cc": tagColor(p) } }), `${p} `, h("span", { class: "sub" }, `${list.length}×`)),
        h("span", { class: "sub" }, `symptoms ${fmt1(load)} · energy ${fmt1(en)}${worst ? ` · ${CMAP[worst[0]][1]} ${fmt1(worst[1])}` : ""}`));
    })) : h("p", {}, "Tag your environments each day and the links show up here.")));

  // food → spleen
  const foods = {};
  for (const [, d] of ds) for (const f of d.food) {
    if (!f.what) continue;
    const k = f.what.trim().toLowerCase();
    const e = foods[k] || (foods[k] = { name: f.what.trim(), fine: 0, mild: 0, strong: 0, n: 0 });
    e.n++; if (f.later) e[f.later]++;
  }
  const foodRows = Object.values(foods).sort((x, y) => (y.strong * 2 + y.mild) - (x.strong * 2 + x.mild) || y.n - x.n).slice(0, 10);
  out.push(card(h("h3", {}, "Food → body 2–4 h later"),
    foodRows.length ? h("div", {}, foodRows.map(f => h("div", { class: "kv" }, h("span", {}, f.name, " ", h("span", { class: "sub" }, `${f.n}×`)),
      h("span", { class: "chips", style: { gap: "4px" } }, LATER.map(([k, , c]) => f[k] ? h("span", { class: "tag", style: { "--cc": c } }, `${f[k]} ${k}`) : null))))) :
      h("p", {}, "Log meals with how you felt 2–4 hours later to see which foods your spleen reacts to."),
    companyRows(ds)));

  // eating under condition → energy after the meal
  const condRows = COND.map(([k, label, c]) => {
    const list = ds.filter(([, d]) => d.cond === k).map(([, d]) => d);
    return [label, c, list.length, mean(list.map(d => d.mealEnergy)), mean(list.map(symptomLoad))];
  }).filter(r => r[2]);
  out.push(card(h("h3", {}, "Condition → energy after the meal"),
    condRows.length ? h("div", {}, condRows.map(([label, c, n, me, load]) => h("div", { class: "kv" },
      h("span", { class: "k" }, h("span", { class: "cdot", style: { "--cc": c } }), label, " ", h("span", { class: "sub" }, `${n}×`)),
      h("span", { class: "sub" }, `meal energy ${me == null ? "–" : fmt1(me) + "/5"} · symptoms ${fmt1(load)}`)))) :
      h("p", {}, "Answer “Ate under my condition?” each day to compare how you feel after."),
    (() => { const t = countTags(TASTE, Object.fromEntries(TASTE.map(([k]) => [k, ds.filter(([, d]) => d.taste === k).length]))); return h("div", { class: "kv" }, h("span", {}, "Taste sense"), t); })()));

  // social recovery window
  const resets = ds.filter(([, d]) => d.group && d.reset);
  out.push(card(h("h3", {}, "Social recovery window"),
    resets.length ? h("div", { class: "stack", style: { gap: "7px" } }, RESET.map(([k, label, c]) => {
      const n = resets.filter(([, d]) => d.reset === k).length;
      return h("div", { class: "row", style: { gap: "10px" } }, h("span", { class: "sub", style: { width: "84px", flex: "none" } }, label),
        h("div", { class: "bar grow" }, h("i", { style: { width: `${(n / resets.length) * 100}%`, "--c": c } })), h("span", { class: "sub", style: { width: "20px", "text-align": "right" } }, n));
    })) : h("p", {}, "On days with group time, note how long it took you to reset.")));
  return out;
}

// Reactions after eating alone vs with each person.
function companyRows(ds) {
  const g = {};
  for (const [, d] of ds) for (const f of d.food) {
    if (!f.company || !f.later) continue;
    const keys = f.company === "alone" ? ["Alone"] : (f.with && f.with.length ? f.with : ["With someone"]);
    for (const k of keys) { const e = g[k] || (g[k] = { fine: 0, mild: 0, strong: 0, n: 0 }); e.n++; e[f.later]++; }
  }
  const rows = Object.entries(g).sort((x, y) => y[1].n - x[1].n);
  if (!rows.length) return null;
  return h("div", { class: "stack", style: { gap: "4px" } },
    h("div", { class: "sub", style: { "margin-top": "4px" } }, "Who you ate with"),
    h("div", {}, rows.map(([k, e]) => h("div", { class: "kv" },
      h("span", { class: "k" }, h("span", { class: "cdot", style: { "--cc": k === "Alone" ? COMPANY[0][2] : tagColor(k) } }), k, " ", h("span", { class: "sub" }, `${e.n}×`)),
      h("span", { class: "chips", style: { gap: "4px" } }, LATER.map(([lk, , c]) => e[lk] ? h("span", { class: "tag", style: { "--cc": c } }, `${e[lk]} ${lk}`) : null))))));
}

function countTags(opts, counts) {
  const tags = opts.filter(([k]) => counts[k]).map(([k, label, c]) => h("span", { class: "tag", style: { "--cc": c } }, `${counts[k]} ${label.toLowerCase()}`));
  return tags.length ? h("span", { class: "chips", style: { gap: "4px", "justify-content": "flex-end" } }, tags) : h("span", { class: "sub" }, "–");
}

/* ---------------- Info ---------------- */
function renderInfo() {
  const logged = Object.keys(db.days).filter(k => anyData(db.days[k])).length;
  const out = [h("h1", { class: "view-title" }, "About the experiment"),
    h("p", { class: "disc" }, `Started ${fmtDay(db.start, { day: "numeric", month: "long", year: "numeric" })} · ${logged} day${logged === 1 ? "" : "s"} logged on this phone`)];

  out.push(card(h("h3", {}, "The core principle"),
    h("p", {}, "You are not trying to feel better quickly. You are trying to understand what your body is actually doing. Record honestly — a bad day is data, not failure."),
    h("ul", {},
      h("li", {}, h("b", {}, "30 days minimum, "), "90 recommended for full pattern recognition."),
      h("li", {}, h("b", {}, "Same time each day: "), "morning works best, within 30 minutes of waking."),
      h("li", {}, h("b", {}, "Keep your bodygraph "), "printed or saved for reference."),
      h("li", {}, h("b", {}, "Weekly review "), "every 7 days, milestone review on day 30."),
      h("li", {}, h("b", {}, "Look for recurring correlations, "), "not day-to-day fluctuations."))));

  // Settings
  const startIn = h("input", { type: "date", class: "inputline", value: db.start, max: logicalToday() });
  startIn.onchange = () => {
    if (!startIn.value) return;
    if (db.protocol.start === db.start) db.protocol.start = startIn.value;
    db.start = startIn.value; cur = clampDay(cur); save(); render();
  };
  const protoIn = h("input", { type: "date", class: "inputline", value: db.protocol.start, max: logicalToday() });
  protoIn.onchange = () => { if (protoIn.value) { db.protocol.start = protoIn.value; save(); } };
  const openBox = h("div", { class: "chips" }, CENTERS.map(([k, name, , col]) => {
    const c = h("button", { type: "button", class: "chip" + (db.open.includes(k) ? " on" : ""), style: { "--c": col } }, name);
    c.onclick = () => { const i = db.open.indexOf(k); if (i >= 0) db.open.splice(i, 1); else db.open.push(k); c.classList.toggle("on", i < 0); save(); };
    return c;
  }));
  out.push(sec("Your setup"), card(
    field("Experiment day 1", startIn),
    field("Protocol day 1", protoIn, h("p", { class: "sub" }, "Resets when you add a protocol after a milestone review.")),
    field("Priority center for this protocol", choice(CENTERS.map(([k, name, , col]) => [k, name, col]), db.protocol.focus, v => { db.protocol.focus = v; save(); }, { wrap: true })),
    field("My open centers", h("p", { class: "sub" }, "From your bodygraph. Marked “open” on the daily check-in."), openBox)));

  // Data
  const exportBtn = h("button", { class: "btn" }, "Export as spreadsheet (CSV)");
  exportBtn.onclick = () => shareFile(`baseline-30day-${logicalToday()}.csv`, toCSV(), "text/csv");
  const backupBtn = h("button", { class: "btn" }, "Save a backup file");
  backupBtn.onclick = () => shareFile(`baseline-30day-backup-${logicalToday()}.json`, JSON.stringify(db, null, 2), "application/json");
  const file = h("input", { type: "file", accept: "application/json,.json", style: "display:none" });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !data.start || typeof data.days !== "object") throw new Error("Not a 30-day Baseline backup file.");
      if (!confirm(`Restore ${Object.keys(data.days).length} days from this backup? This replaces what's on this phone.`)) return;
      db = data; save(); cur = clampDay(logicalToday()); render();
    } catch (e) { alert(e.message); }
  };
  const restoreBtn = h("button", { class: "btn", onclick: () => file.click() }, "Restore from backup");
  const eraseBtn = h("button", { class: "btn danger" }, "Erase everything and restart");
  eraseBtn.onclick = () => {
    if (!confirm("Erase every entry and restart the experiment from today? Save a backup first if you want to keep it.")) return;
    if (!confirm("Really erase? This can't be undone.")) return;
    localStorage.removeItem(KEY); db = load(); cur = logicalToday(); render();
  };
  out.push(sec("Your data"), card(
    h("p", {}, "Everything stays on this phone. Nothing is sent anywhere. Removing the app from your home screen deletes the log, so save a backup now and then."),
    h("div", { class: "stack" }, exportBtn, backupBtn, restoreBtn, file, eraseBtn)));

  // The finished 7-day log, if it's still on this phone
  let old = null;
  try { old = localStorage.getItem(OLD_KEY); } catch {}
  if (old) {
    let n = 0; try { n = Object.keys(JSON.parse(old).days || {}).length; } catch {}
    const dl = h("button", { class: "btn" }, "Save the 7-day log as a file");
    dl.onclick = () => shareFile("baseline-7day-log.json", old, "application/json");
    const del = h("button", { class: "btn danger" }, "Delete the 7-day log from this phone");
    del.onclick = () => { if (confirm("Delete the old 7-day log? Save it as a file first if you want to keep it.")) { localStorage.removeItem(OLD_KEY); render(); } };
    out.push(sec("Your finished 7-day log"), card(
      h("p", {}, `${n} days from the first experiment are still stored here, untouched. Save them as a file, then delete them when you're ready.`),
      h("div", { class: "stack" }, dl, del)));
  }

  out.push(card(h("h3", {}, "Put it on your home screen"), h("p", {},
    "On iPhone, open this page in Safari, tap Share, then Add to Home Screen.")));
  return out;
}

function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function toCSV() {
  const lbl = (opts, k) => (opts.find(o => o[0] === k) || [, ""])[1];
  const head = ["date", "day", "protocol_day", "sleep_quality", "hours_slept", "woke", "mental_state", "body_sensations",
    ...CENTERS.map(c => c[0]), "energy", "clarity", "mood", "energy_10", "energy_14", "energy_18", "environments", "environment_note", "people", "people_note",
    "group_time", "reset_time", "food", "food_note", "ate_under_condition", "energy_after_main_meal_1_5", "taste_sense", "unusual"];
  const rows = [head];
  for (const iso of Object.keys(db.days).sort()) {
    const d = db.days[iso];
    if (!anyData(d)) continue;
    rows.push([iso, dayNo(iso), protoNo(iso), d.sleep, d.hours, lbl(WOKE, d.woke), d.mind, d.body,
      ...CENTERS.map(([k]) => d.c[k]), d.energy, d.clarity, d.mood, ...CHECKS.map(([k]) => d.checks[k]), d.places.join("; "), d.placeNote, d.people.join("; "), d.peopleNote,
      d.group === true ? "yes" : d.group === false ? "no" : "", lbl(RESET, d.reset),
      d.food.map(f => [f.time, f.what, f.company === "alone" ? "(alone)" : f.company === "with" ? `(with ${f.with.join(" & ") || "someone"})` : "", f.later && `2-4h: ${lbl(LATER, f.later).toLowerCase()}`, f.note].filter(Boolean).join(" ")).join(" | "),
      d.foodNote, lbl(COND, d.cond), d.mealEnergy, lbl(TASTE, d.taste), d.unusual]);
  }
  return rows.map(r => r.map(csvCell).join(",")).join("\n");
}
async function shareFile(name, content, type) {
  const f = new File([content], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = h("a", { href: URL.createObjectURL(f), download: name });
  document.body.append(a); a.click(); a.remove();
}

/* ---------------- shell ---------------- */
function render() {
  const view = document.getElementById("view");
  const y = tab === "today" ? window.scrollY : 0;
  view.textContent = "";
  const screens = { today: renderToday, weeks: renderWeeks, milestone: renderMilestone, info: renderInfo };
  if (tab === "today") view.append(appHead());
  view.append(h("div", { class: "screen" }, ...screens[tab]().filter(Boolean)));
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  window.scrollTo(0, y);
}
document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  tab = b.dataset.tab; openWeek = null;
  window.scrollTo(0, 0); render();
});
// Coming back to the app the next morning should land on the new day.
let lastDay = logicalToday();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const t = logicalToday();
  if (t !== lastDay) { if (cur === lastDay) cur = t; lastDay = t; render(); }
});

render();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

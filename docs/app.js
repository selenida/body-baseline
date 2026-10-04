"use strict";
// Baseline — a private 7-day body log. Everything lives in this phone's localStorage.

const KEY = "baseline.v1";
const NONE = "__none"; // "no one nearby" / "alone"
const NO_SIGNALS = ["Tightness", "Fatigue", "Nausea", "Irritation"];
const YES_SIGNALS = ["Ease", "Appetite", "Calm", "Clarity"];
const SLEEP = ["Easily", "Slowly", "Restless", "Busy mind", "Wired but tired", "Woke in the night"];
const ENERGY = [["10", "10:00"], ["14", "14:00"], ["18", "18:00"]];

let db = load();
let tab = "today";
let cur = logicalToday();
let revEnd = null;

/* ---------------- storage ---------------- */
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { days: {} }; }
  catch { return { days: {} }; }
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

function blankMoment() { return { signals: [], other: "", time: "", doing: "", near: [] }; }
function blankDay() {
  return {
    wake: { time: "", feel: null },
    tracker: { rhr: "", hrv: "" },
    meals: [],
    energy: { 10: null, 14: null, 18: null },
    no: blankMoment(),
    yes: blankMoment(),
    bed: { time: "", how: [], note: "" },
    env: blankEnv(),
  };
}
// Evening environment check-in (added after launch, so older days get it on first touch).
function blankEnv() { return { place: "", energy: null, calm: null, met: [] }; }
function withEnv(d) { if (!d.env) d.env = blankEnv(); return d; }
function envHas(e) { return !!(e && (e.place || e.energy || e.calm || e.met.length)); }
function day(iso = cur) {
  if (!db.days[iso]) db.days[iso] = blankDay();
  return withEnv(db.days[iso]);
}
function peek(iso) { return db.days[iso] ? withEnv(db.days[iso]) : blankDay(); }
function momentHas(m) { return !!(m.signals.length || m.other || m.doing || m.time || m.near.length); }
function hasData(d) {
  if (!d) return false;
  return !!(d.wake.time || d.wake.feel || d.tracker.rhr || d.tracker.hrv || d.meals.length ||
    d.energy[10] || d.energy[14] || d.energy[18] || momentHas(d.no) || momentHas(d.yes) ||
    d.bed.time || d.bed.how.length || d.bed.note || envHas(d.env));
}

/* ---------------- dates ---------------- */
function isoOf(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function parseIso(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); }
// Before 4am still counts as the previous day, so a late bedtime lands on the right date.
function logicalToday() { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); return isoOf(d); }
function fmtDay(iso, opts = { weekday: "short", day: "numeric", month: "short" }) {
  return parseIso(iso).toLocaleDateString(undefined, opts);
}
function nowHM() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function plus30(hm) {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number); const t = (h * 60 + m + 30) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function loggedDays() { return Object.keys(db.days).filter(k => hasData(db.days[k])).sort(); }
function dayNumber(iso) {
  const first = loggedDays()[0];
  if (!first || iso < first) return null;
  return Math.round((parseIso(iso) - parseIso(first)) / 864e5) + 1;
}

/* ---------------- tiny DOM helper ---------------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

/* ---------------- reusable inputs ---------------- */
function scale(value, onPick, { ends, label } = {}) {
  const wrap = h("div");
  const row = h("div", { class: "scale", role: "group", "aria-label": label || null });
  // Reads like a level meter: every step up to the chosen value fills in.
  const paint = () => row.querySelectorAll("button").forEach(x => {
    const v = +x.dataset.v;
    x.classList.toggle("fill", value != null && v <= value);
    x.classList.toggle("top", v === value);
    x.setAttribute("aria-pressed", v === value);
  });
  for (let v = 1; v <= 5; v++) {
    const b = h("button", { type: "button", "data-v": v }, v);
    b.onclick = () => {
      value = value === v ? null : v; // tap again to clear
      paint();
      onPick(value);
    };
    row.append(b);
  }
  paint();
  wrap.append(row);
  if (ends) wrap.append(h("div", { class: "scale-ends" }, h("span", {}, ends[0]), h("span", {}, ends[1])));
  return wrap;
}

function text(value, onInput, { placeholder, area } = {}) {
  const el = h(area ? "textarea" : "input", { type: area ? null : "text", placeholder, rows: area ? 1 : null, value: value || "" });
  el.addEventListener("input", () => onInput(el.value));
  el.addEventListener("change", () => onInput(el.value.trim()));
  return el;
}

function timeInput(value, onChange) {
  const inp = h("input", { type: "time", value: value || "" });
  inp.addEventListener("change", () => onChange(inp.value));
  const now = h("button", { type: "button", class: "btn small" }, "Now");
  now.onclick = () => { inp.value = nowHM(); onChange(inp.value); };
  return h("div", { class: "row" }, h("div", { class: "grow" }, inp), now);
}

// Multi-select chips; `options` fixed, `selected` array mutated in place.
function chips(options, selected, onChange) {
  const box = h("div", { class: "chips" });
  for (const o of options) {
    const c = h("button", { type: "button", class: "chip" + (selected.includes(o) ? " on" : "") }, o);
    c.onclick = () => {
      const i = selected.indexOf(o);
      if (i >= 0) selected.splice(i, 1); else selected.push(o);
      c.classList.toggle("on", i < 0);
      onChange();
    };
    box.append(c);
  }
  return box;
}

// Names seen anywhere, most frequent first.
function knownPeople() {
  const n = {};
  for (const d of Object.values(db.days)) {
    const lists = [d.no.near, d.yes.near, ...d.meals.map(m => m.with), ...(d.env ? d.env.met.map(m => m.who) : [])];
    for (const l of lists) for (const p of l) if (p !== NONE) n[p] = (n[p] || 0) + 1;
  }
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
}
function knownPlaces() {
  const n = {};
  for (const d of Object.values(db.days)) {
    for (const m of d.meals) if (m.where) n[m.where] = (n[m.where] || 0) + 1;
    if (d.env && d.env.place) n[d.env.place] = (n[d.env.place] || 0) + 1;
  }
  return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 8);
}
function personLabel(p, noneLabel = "No one") { return p === NONE ? noneLabel : p; }

// People picker: known-name chips + "No one"/"Alone" (exclusive) + add-a-name.
function peoplePicker(selected, onChange, noneLabel) {
  const wrap = h("div");
  const draw = () => {
    wrap.textContent = "";
    const names = [...new Set([...knownPeople(), ...selected.filter(p => p !== NONE)])];
    const box = h("div", { class: "chips" });
    if (noneLabel) {
      const noneChip = h("button", { type: "button", class: "chip" + (selected.includes(NONE) ? " on" : "") }, noneLabel);
      noneChip.onclick = () => {
        const had = selected.includes(NONE);
        selected.splice(0, selected.length);
        if (!had) selected.push(NONE);
        onChange(); draw();
      };
      box.append(noneChip);
    }
    for (const p of names) {
      const c = h("button", { type: "button", class: "chip" + (selected.includes(p) ? " on" : "") }, p);
      c.onclick = () => {
        const i = selected.indexOf(p);
        if (i >= 0) selected.splice(i, 1);
        else { const j = selected.indexOf(NONE); if (j >= 0) selected.splice(j, 1); selected.push(p); }
        onChange(); draw();
      };
      box.append(c);
    }
    const addBtn = h("button", { type: "button", class: "chip add" }, "+ Name");
    box.append(addBtn);
    wrap.append(box);
    addBtn.onclick = () => {
      addBtn.remove();
      const inp = h("input", { type: "text", placeholder: "Name or role, e.g. partner", autocapitalize: "words", enterkeyhint: "done" });
      const commit = () => {
        const v = inp.value.trim().replace(/\s+/g, " ");
        if (v && !selected.includes(v)) {
          const j = selected.indexOf(NONE); if (j >= 0) selected.splice(j, 1);
          selected.push(v); onChange();
        }
        draw();
      };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
      const ok = h("button", { type: "button", class: "btn small primary" }, "Add");
      ok.onclick = commit;
      wrap.append(h("div", { class: "add-row" }, inp, ok));
      inp.focus();
    };
  };
  draw();
  return wrap;
}

function field(label, ...kids) { return h("div", { class: "field" }, h("span", { class: "label" }, label), ...kids); }
// A stop on the day's line. The node fills in once the check-in is complete.
function step(title, { cls, hint } = {}, ...kids) {
  const node = h("span", { class: "node", "aria-hidden": "true" });
  const gut = h("span", { class: "gut" });
  const s = h("section", { class: "step" + (cls ? " " + cls : "") },
    h("div", { class: "step-h" }, node, gut, h("h2", {}, title)),
    hint ? h("p", { class: "hint" }, hint) : null,
    ...kids);
  let was = null;
  s.setDone = on => {
    on = !!on;
    if (was === false && on) { node.classList.remove("pop"); void node.offsetWidth; node.classList.add("pop"); }
    node.classList.toggle("on", on); was = on;
  };
  s.setTime = t => { gut.textContent = t || ""; };
  return s;
}
function card(title, { cls, hint } = {}, ...kids) {
  return h("section", { class: "block" + (cls ? " " + cls : "") },
    h("h2", {}, title), hint ? h("p", { class: "hint" }, hint) : null, ...kids);
}

/* ---------------- Today ---------------- */
function dayHeader() {
  const today = logicalToday();
  const n = dayNumber(cur);
  const rel = cur === today ? "today, " : cur === addDays(today, -1) ? "yesterday, " : "";

  const prev = h("button", { class: "nav", "aria-label": "Previous day" }, "‹");
  const next = h("button", { class: "nav", "aria-label": "Next day", disabled: cur >= today }, "›");
  prev.onclick = () => { cur = addDays(cur, -1); render(); };
  next.onclick = () => { cur = addDays(cur, 1); render(); };

  // Seven marks for the baseline week: filled = logged, tall = the day on screen.
  const first = loggedDays()[0];
  const wStart = first && n && n <= 7 ? first : addDays(cur, -6);
  const week = h("nav", { class: "week", "aria-label": "Days of this week" },
    Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(wStart, i);
      const cls = [hasData(db.days[iso]) && "has", iso === cur && "cur", iso > today && "future"].filter(Boolean).join(" ");
      return h("button", { type: "button", class: cls, disabled: iso > today, "aria-current": iso === cur ? "date" : null,
        "aria-label": fmtDay(iso, { weekday: "long", day: "numeric", month: "long" }),
        onclick: () => { cur = iso; render(); } }, h("i"), h("span", {}, fmtDay(iso, { weekday: "narrow" })));
    }));

  const top = h("header", { class: "top" },
    h("div", { class: "top-row" },
      h("div", { class: "top-title" },
        h("h1", {}, n ? [`day ${n}`, n <= 7 ? h("span", { class: "of" }, "of 7") : null] : "day 1"),
        h("p", { class: "date" }, rel + fmtDay(cur, { weekday: "long", day: "numeric", month: "long" }).toLowerCase())),
      h("div", { class: "navs" }, prev, next)),
    week);
  return top;
}

function renderToday() {
  const d = day(); // chips & people pickers mutate these arrays in place, so bind to the stored day
  const today = logicalToday();
  const top = dayHeader();

  // Every edit goes through here: materialise the day, mutate, save, refresh card ticks.
  const edit = fn => { fn(day()); save(); refreshDone(); };

  // Morning
  const morning = step("Waking", { hint: "Right after you wake up" },
    field("Wake time", timeInput(d.wake.time, v => edit(x => { x.wake.time = v; }))),
    field("How you felt on waking", scale(d.wake.feel, v => edit(x => { x.wake.feel = v; }), { ends: ["awful", "great"], label: "How you felt on waking" })),
    (() => {
      const det = h("details", { class: "opt", open: d.tracker.rhr || d.tracker.hrv ? true : null },
        h("summary", {}, "Heart rate or HRV (optional)"),
        h("div", { class: "two" },
          field("Resting HR (bpm)", num(d.tracker.rhr, v => edit(x => { x.tracker.rhr = v; }))),
          field("HRV (ms)", num(d.tracker.hrv, v => edit(x => { x.tracker.hrv = v; })))));
      return det;
    })());

  // Meals
  const mealList = h("div");
  const drawMeals = () => {
    mealList.textContent = "";
    const meals = peek(cur).meals.slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    if (!meals.length) mealList.append(h("p", { class: "empty" }, "Nothing yet. Add each meal or snack as it happens."));
    for (const m of meals) {
      const company = !m.with.length ? "" : m.with.includes(NONE) ? "alone" : "with " + m.with.join(", ");
      const meta = [m.where, company].filter(Boolean).join(", ");
      const due = plus30(m.time);
      const row = h("div", { class: "meal" },
        h("span", { class: "gut" }, m.time || "–"),
        h("button", { type: "button", class: "meal-open", "aria-label": `Edit ${m.kind}: ${m.what || "no description"}`, onclick: () => openMeal(m) },
          h("span", { class: "what" }, m.what || "No description", h("span", { class: "kind" }, m.kind === "snack" ? " (snack)" : "")),
          meta ? h("span", { class: "meta" }, meta) : null),
        h("div", { class: "after" },
          h("span", { class: "label" }, h("span", {}, "How you felt 30 min after"), m.after == null && due ? h("span", {}, "at " + due) : null),
          scale(m.after, v => edit(() => { m.after = v; }), { label: "How you felt 30 minutes after" })));
      mealList.append(row);
    }
  };
  drawMeals();
  mealList.className = "meals";
  const meals = step("Meals and snacks", { hint: "What, when, where, with whom. Rate each one half an hour later." }, mealList,
    h("button", { type: "button", class: "btn primary wide", onclick: () => openMeal(null) }, "Add a meal or snack"));

  // Energy
  const hr = new Date().getHours();
  const nowSlot = cur !== today ? null : hr < 12 ? "10" : hr < 16 ? "14" : "18";
  const energy = step("Energy", { hint: "At 10:00, 14:00 and 18:00" },
    ...ENERGY.map(([k, t]) => h("div", { class: "energy-row" + (k === nowSlot ? " now" : "") },
      h("span", { class: "gut" }, t),
      scale(d.energy[k], v => edit(x => { x.energy[k] = v; }), { label: "Energy at " + t }))),
    h("div", { class: "scale-ends" }, h("span", {}, "drained"), h("span", {}, "full")));

  const moment = (kind, title, hint, signals) => step(title, { cls: kind, hint },
    field("Signal", chips(signals, d[kind].signals, () => edit(() => {})),
      h("div", { style: "margin-top:8px" }, text(d[kind].other, v => edit(x => { x[kind].other = v; }), { placeholder: "Something else…" }))),
    field("When", timeInput(d[kind].time, v => edit(x => { x[kind].time = v; }))),
    field("What you were doing", text(d[kind].doing, v => edit(x => { x[kind].doing = v; }), { area: true, placeholder: "e.g. on a call, in the car, cooking" })),
    field("Who was within six feet", peoplePicker(d[kind].near, () => edit(() => {}), "No one")));
  const noCard = moment("no", "Body said no", "One moment of tightness, fatigue, nausea or irritation", NO_SIGNALS);
  const yesCard = moment("yes", "Body said yes", "One moment of ease, appetite, calm or clarity", YES_SIGNALS);

  const night = step("Night", { hint: "At bedtime, or first thing tomorrow" },
    field("Bedtime", timeInput(d.bed.time, v => edit(x => { x.bed.time = v; }))),
    field("How you fell asleep", chips(SLEEP, d.bed.how, () => edit(() => {})),
      h("div", { style: "margin-top:8px" }, text(d.bed.note, v => edit(x => { x.bed.note = v; }), { placeholder: "Anything else (optional)" }))));

  function refreshDone() {
    const x = peek(cur);
    morning.setDone(x.wake.time && x.wake.feel);
    meals.setDone(x.meals.length && x.meals.every(m => m.after != null));
    energy.setDone(x.energy[10] && x.energy[14] && x.energy[18]);
    noCard.setDone((x.no.signals.length || x.no.other) && x.no.doing && x.no.near.length);
    yesCard.setDone((x.yes.signals.length || x.yes.other) && x.yes.doing && x.yes.near.length);
    night.setDone(x.bed.time && (x.bed.how.length || x.bed.note));
    morning.setTime(x.wake.time); noCard.setTime(x.no.time); yesCard.setTime(x.yes.time); night.setTime(x.bed.time);
  }
  refreshDone();

  return [top, h("div", { class: "day" }, morning, meals, energy, noCard, yesCard, night),
    h("p", { class: "coda" }, "Notice, don’t correct. This is a baseline, not a cleanse.")];
}

/* ---------------- Place (evening environment check-in) ---------------- */
function renderPlace() {
  const d = day();
  const e = d.env;
  const edit = fn => { fn(e); save(); refreshDone(); };

  const whereInput = text(e.place, v => edit(x => { x.place = v; }), { placeholder: "e.g. home office, café, studio" });
  const places = knownPlaces();
  const where = step("Where you were", { hint: "The place you spent most of today" }, h("div", { class: "field" }, whereInput),
    places.length ? h("div", { class: "chips", style: "margin-top:8px" },
      places.map(p => h("button", { type: "button", class: "chip", onclick: () => { whereInput.value = p; edit(x => { x.place = p; }); } }, p))) : null);

  const energy = step("Energy", { hint: "Left arrow, Observed: in its right place the body is stimulated and moves toward others. In the wrong place it struggles to find energy. (Ra, p. 46)" },
    h("div", { class: "field" }, scale(e.energy, v => edit(x => { x.energy = v; }), { ends: ["flat", "lit up"], label: "Energy in this place" })));
  const calm = step("Calm", { hint: "Right arrow, Observer: the body is sensitive to the frequencies around it and quiets in its correct environment. (Ra, p. 65)" },
    h("div", { class: "field" }, scale(e.calm, v => edit(x => { x.calm = v; }), { ends: ["buzzing", "quiet"], label: "Calm in this place" })));

  const list = h("div");
  const drawMet = () => {
    list.textContent = "";
    if (!e.met.length) list.append(h("p", { class: "empty" }, "No one yet. Add each person or group you met there."));
    for (const m of e.met) {
      const remove = h("button", { type: "button", class: "btn small", onclick: () => { e.met = e.met.filter(x => x !== m); save(); drawMet(); refreshDone(); } }, "Remove");
      list.append(h("div", { class: "meeting" },
        field("Who", peoplePicker(m.who, () => edit(() => {}), null)),
        field("How it felt", scale(m.felt, v => edit(() => { m.felt = v; }), { ends: ["draining", "nourishing"], label: "How the meeting felt" })),
        h("div", { class: "row", style: "margin-top:8px" },
          h("div", { class: "grow" }, text(m.note, v => edit(() => { m.note = v; }), { placeholder: "In a few words (optional)" })), remove)));
    }
  };
  drawMet();
  const met = step("Who you met there", { hint: "And how each meeting felt" }, list,
    h("button", { type: "button", class: "btn primary wide", onclick: () => {
      e.met.push({ id: Date.now().toString(36), who: [], felt: null, note: "" }); save(); drawMet(); refreshDone();
    } }, "Add a meeting"));

  function refreshDone() {
    where.setDone(e.place); energy.setDone(e.energy); calm.setDone(e.calm);
    met.setDone(e.met.length && e.met.every(m => m.who.length && m.felt));
  }
  refreshDone();

  return [dayHeader(), h("div", { class: "day" }, where, energy, calm, met),
    h("p", { class: "coda" }, "Fill this in each evening."), placePatterns()];
}

// Across every logged evening: how each place and each person tends to land.
function placePatterns() {
  const avg = a => { const x = a.filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
  const fmt = v => v == null ? h("span", { class: "num m" }, "–") : h("span", { class: "num" }, v.toFixed(1));
  const byPlace = {}, byPerson = {};
  for (const i of loggedDays()) {
    const e = db.days[i].env;
    if (!envHas(e)) continue;
    const p = e.place || "Not recorded";
    (byPlace[p] = byPlace[p] || []).push(e);
    for (const m of e.met) for (const who of m.who) (byPerson[who] = byPerson[who] || []).push(m.felt);
  }
  const places = Object.entries(byPlace).sort((a, b) => b[1].length - a[1].length);
  if (!places.length) return null;
  const people = Object.entries(byPerson).sort((a, b) => b[1].length - a[1].length);
  return card("What the evenings show", {
    hint: "Averages across every evening you've logged. Left arrow: watch energy. Right arrow: watch calm.",
  },
    h("table", { class: "people" },
      h("thead", {}, h("tr", {}, h("th", {}, "Place"), h("th", { style: "text-align:right" }, "Energy"), h("th", { style: "text-align:right" }, "Calm"))),
      h("tbody", {}, places.map(([p, es]) => h("tr", {},
        h("td", { class: "who" }, p, h("span", { class: "sig" }, es.length + (es.length === 1 ? " evening" : " evenings"))),
        h("td", { style: "text-align:right" }, fmt(avg(es.map(e => e.energy)))),
        h("td", { style: "text-align:right" }, fmt(avg(es.map(e => e.calm)))))))),
    people.length ? h("table", { class: "people" },
      h("thead", {}, h("tr", {}, h("th", {}, "Person"), h("th", {}, "Times"), h("th", { style: "text-align:right" }, "Felt"))),
      h("tbody", {}, people.map(([p, fs]) => h("tr", {},
        h("td", { class: "who" }, p), h("td", { class: "m" }, fs.length + "×"),
        h("td", { style: "text-align:right" }, fmt(avg(fs))))))) : null);
}

function num(value, onInput) {
  const el = h("input", { type: "number", inputmode: "numeric", min: 0, step: 1, placeholder: "–", value: value || "" });
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

/* ---------------- meal sheet ---------------- */
function openMeal(existing) {
  const isToday = cur === logicalToday();
  const m = existing ? JSON.parse(JSON.stringify(existing))
    : { id: Date.now().toString(36), kind: "meal", what: "", time: isToday ? nowHM() : "", where: "", with: [], after: null, note: "" };

  const seg = h("div", { class: "seg" });
  for (const k of ["meal", "snack"]) {
    const b = h("button", { type: "button", class: m.kind === k ? "on" : "" }, k[0].toUpperCase() + k.slice(1));
    b.onclick = () => { m.kind = k; seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
    seg.append(b);
  }

  const whereInput = text(m.where, v => { m.where = v; }, { placeholder: "e.g. kitchen table, desk, café" });
  const places = knownPlaces();
  const placeChips = places.length ? h("div", { class: "chips", style: "margin-top:8px" },
    places.map(p => h("button", { type: "button", class: "chip", onclick: () => { whereInput.value = p; m.where = p; } }, p))) : null;

  const close = () => overlay.remove();
  const saveBtn = h("button", { type: "button", class: "btn primary" }, existing ? "Save" : "Add");
  saveBtn.onclick = () => {
    const d = day();
    const i = d.meals.findIndex(x => x.id === m.id);
    if (i >= 0) d.meals[i] = m; else d.meals.push(m);
    save(); close(); render();
  };
  const del = existing ? h("button", { type: "button", class: "btn danger" }, "Delete") : null;
  if (del) del.onclick = () => {
    if (!confirm(`Delete this ${m.kind}?`)) return;
    const d = day(); d.meals = d.meals.filter(x => x.id !== m.id); save(); close(); render();
  };

  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" },
    h("h2", {}, existing ? "Edit " + m.kind : "Meal or snack"),
    seg,
    field("What", text(m.what, v => { m.what = v; }, { area: true, placeholder: "What you ate or drank" })),
    field("When", timeInput(m.time, v => { m.time = v; })),
    field("Where", whereInput, placeChips),
    field("With whom", peoplePicker(m.with, () => {}, "Alone")),
    field("How you felt 30 min after", scale(m.after, v => { m.after = v; }, { ends: ["awful", "great"], label: "How you felt 30 minutes after" }),
      h("p", { class: "small", style: "margin:8px 0 0" }, "Leave it for now and rate it from the list later.")),
    field("Note (optional)", text(m.note, v => { m.note = v; }, { placeholder: "e.g. bloated, sleepy, clear" })),
    h("div", { class: "sheet-actions" }, del, h("button", { type: "button", class: "btn", onclick: close }, "Cancel"), saveBtn));
  const overlay = h("div", { class: "overlay", onclick: e => { if (e.target === overlay) close(); } }, sheet);
  document.body.append(overlay);
}

function pageHead(title, sub, navs) {
  return h("header", { class: "top" }, h("div", { class: "top-row" },
    h("div", { class: "top-title" }, h("h1", {}, title), h("p", { class: "date" }, sub)),
    navs ? h("div", { class: "navs" }, navs) : null));
}

/* ---------------- 7-day review ---------------- */
function renderReview() {
  const logged = loggedDays();
  // Default: the first 7 days while that week is running, the most recent 7 after.
  if (!revEnd) {
    const [first, last] = [logged[0], logged[logged.length - 1]];
    revEnd = !first ? logicalToday() : last <= addDays(first, 6) ? addDays(first, 6) : last;
  }
  const start = addDays(revEnd, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const prev = h("button", { class: "nav", "aria-label": "Previous week" }, "‹");
  const next = h("button", { class: "nav", "aria-label": "Next week", disabled: revEnd >= logicalToday() }, "›");
  prev.onclick = () => { revEnd = addDays(revEnd, -7); render(); };
  next.onclick = () => { revEnd = addDays(revEnd, 7); render(); };
  const dm = { day: "numeric", month: "long" };
  const top = pageHead("7 days", `${fmtDay(start, dm)} to ${fmtDay(revEnd, dm)}`.toLowerCase(), [prev, next]);

  const inRange = days.filter(i => hasData(db.days[i]));
  if (!inRange.length) {
    return [top, card("Nothing logged this week", {}, h("p", { class: "hint" }, "Log a few days on the Today tab. Your scores then line up here side by side, along with who was nearby each time your body said yes or no."))];
  }

  // Daily grid
  const cell = (v, sub) => h("td", { class: v ? "v" + Math.round(v) : "nil" }, v ? (Math.round(v * 10) / 10) : "·", sub ? h("small", { class: "tm" }, sub) : null);
  const avg = a => { const x = a.filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
  const grid = h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, ["", "Wake", "10", "14", "18", "Meals", "Bed"].map(t => h("th", {}, t)))),
    h("tbody", {}, days.map(i => {
      const d = peek(i);
      return h("tr", {},
        h("td", { class: "d" }, fmtDay(i, { weekday: "short" }), h("small", {}, fmtDay(i, { day: "numeric", month: "numeric" }))),
        cell(d.wake.feel, d.wake.time),
        cell(d.energy[10]), cell(d.energy[14]), cell(d.energy[18]),
        cell(avg(d.meals.map(m => m.after)), d.meals.length ? `${d.meals.length}×` : ""),
        h("td", { class: d.bed.time ? "bed" : "nil" }, d.bed.time || "·"));
    })));
  const scores = card("Scores", { hint: "The stronger the tone, the higher the score, from 1 to 5. Meals shows the average of how you felt 30 minutes after eating." }, h("div", { class: "scroll-x" }, grid));

  // Who was near when the body said yes / no
  const tally = {};
  const bump = (p, kind, sigs) => {
    tally[p] = tally[p] || { yes: 0, no: 0, ys: [], ns: [] };
    tally[p][kind]++;
    tally[p][kind === "yes" ? "ys" : "ns"].push(...sigs);
  };
  for (const i of inRange) {
    const d = db.days[i];
    for (const kind of ["yes", "no"]) {
      const m = d[kind];
      if (!momentHas(m)) continue;
      const sigs = [...m.signals, m.other].filter(Boolean);
      const near = m.near.length ? m.near : ["__unknown"];
      for (const p of near) bump(p, kind, sigs);
    }
  }
  const order = Object.keys(tally).sort((a, b) =>
    (a === NONE) - (b === NONE) || (a === "__unknown") - (b === "__unknown") ||
    (tally[b].yes + tally[b].no) - (tally[a].yes + tally[a].no));
  // One mark per moment, so a lopsided person is visible at a glance.
  const marks = (n, k) => h("div", { class: "marks", "aria-label": `${n} ${k}` },
    !n ? h("span", { class: "zero" }, "0") : n > 8 ? [h("i", { class: "mark " + k }), h("b", {}, "×" + n)]
      : Array.from({ length: n }, () => h("i", { class: "mark " + k })));
  const uniq = a => [...new Set(a.map(s => s.toLowerCase()))].join(", ");
  const people = card("Who was within six feet", {
    hint: "Signals that come whoever is around, or when no one is, are more likely yours. Signals that gather around one person may be coming in through your open centers.",
  }, h("table", { class: "people" },
    h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Yes"), h("th", {}, "No"))),
    h("tbody", {}, order.map(p => h("tr", {},
      h("td", { class: "who" }, p === NONE ? "No one" : p === "__unknown" ? h("span", { class: "m" }, "Not recorded") : p,
        tally[p].ns.length ? h("span", { class: "sig" }, "no: " + uniq(tally[p].ns)) : null,
        tally[p].ys.length ? h("span", { class: "sig" }, "yes: " + uniq(tally[p].ys)) : null),
      h("td", {}, marks(tally[p].yes, "yes")),
      h("td", {}, marks(tally[p].no, "no")))))));

  // Meals by company and by place
  const groups = (keyFn) => {
    const g = {};
    for (const i of inRange) for (const m of db.days[i].meals) for (const k of keyFn(m)) {
      g[k] = g[k] || []; if (m.after != null) g[k].push(m.after); else g[k].push(null);
    }
    return Object.entries(g).map(([k, v]) => [k, v.length, avg(v)]).sort((a, b) => b[1] - a[1]);
  };
  const mealTable = (title, rows) => rows.length ? h("table", { class: "people" },
    h("thead", {}, h("tr", {}, h("th", {}, title), h("th", {}, "Times"), h("th", { style: "text-align:right" }, "After"))),
    h("tbody", {}, rows.map(([k, n, a]) => h("tr", {},
      h("td", { class: "who" }, k), h("td", { class: "m" }, n + "×"),
      h("td", { style: "text-align:right" }, a == null ? h("span", { class: "num m" }, "–") : h("span", { class: "num" }, a.toFixed(1))))))) : null;
  const byWho = groups(m => m.with.length ? m.with.map(p => p === NONE ? "Alone" : p) : ["Not recorded"]);
  const byWhere = groups(m => [m.where || "Not recorded"]);
  const mealsCard = byWho.length ? card("Meals", { hint: "How often, and how you felt 30 minutes after on average." },
    mealTable("By company", byWho), mealTable("By place", byWhere)) : null;

  // Day journal
  const who = l => l.length ? l.map(p => personLabel(p)).join(", ") : "not recorded";
  const journal = card("The week in words", {}, inRange.map(i => {
    const d = db.days[i];
    const line = (kind) => {
      const m = d[kind];
      if (!momentHas(m)) return null;
      const sigs = [...m.signals, m.other].filter(Boolean).join(", ").toLowerCase();
      return h("p", {}, h("span", { class: "k" }, h("i", { class: "mark " + kind }), kind === "yes" ? "Yes" : "No"),
        m.time ? h("span", { class: "m" }, m.time + " ") : null,
        sigs, m.doing ? `, ${m.doing}` : "", h("span", { class: "m" }, `. Near: ${who(m.near).toLowerCase()}`));
    };
    const tr = [d.tracker.rhr && `Resting HR ${d.tracker.rhr}`, d.tracker.hrv && `HRV ${d.tracker.hrv}`].filter(Boolean).join(", ");
    return h("div", { class: "day-log" }, h("h3", {}, fmtDay(i, { weekday: "long", day: "numeric", month: "long" })),
      d.meals.length ? h("p", {}, h("span", { class: "m" }, "Ate: "),
        d.meals.slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).map(m => `${m.time ? m.time + " " : ""}${m.what || m.kind}${m.after ? ` (${m.after})` : ""}`).join("; ")) : null,
      line("no"), line("yes"),
      envHas(d.env) ? h("p", {}, h("span", { class: "m" }, "Place: "),
        [d.env.place || "not recorded", d.env.energy && `energy ${d.env.energy}`, d.env.calm && `calm ${d.env.calm}`].filter(Boolean).join(", "),
        d.env.met.length ? h("span", { class: "m" }, ". Met: " + d.env.met.map(m => `${m.who.join(" & ") || "someone"}${m.felt ? ` (${m.felt})` : ""}`).join(", ")) : null) : null,
      d.bed.time || d.bed.how.length || d.bed.note ? h("p", {}, h("span", { class: "m" }, "Night: "),
        [d.bed.time, d.bed.how.join(", ").toLowerCase(), d.bed.note].filter(Boolean).join(", ")) : null,
      tr ? h("p", { class: "m" }, tr) : null);
  }));

  return [top, scores, people, mealsCard, journal];
}

/* ---------------- Info ---------------- */
function renderInfo() {
  const logged = loggedDays();
  const exportBtn = h("button", { class: "btn wide" }, "Export as spreadsheet (CSV)");
  exportBtn.onclick = () => shareFile(`baseline-${logicalToday()}.csv`, toCSV(), "text/csv");
  const backupBtn = h("button", { class: "btn wide" }, "Save a backup file");
  backupBtn.onclick = () => shareFile(`baseline-backup-${logicalToday()}.json`, JSON.stringify(db, null, 2), "application/json");
  const file = h("input", { type: "file", accept: "application/json,.json", style: "display:none" });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data.days !== "object") throw new Error("Not a Baseline backup file.");
      if (!confirm(`Restore ${Object.keys(data.days).length} days from this backup? This replaces what's on this phone.`)) return;
      db = data; save(); render();
    } catch (e) { alert(e.message); }
  };
  const restoreBtn = h("button", { class: "btn wide", onclick: () => file.click() }, "Restore from backup");
  const eraseBtn = h("button", { class: "btn wide danger" }, "Erase everything");
  eraseBtn.onclick = () => {
    if (!confirm("Erase every entry on this phone? Save a backup first if you want to keep it.")) return;
    if (!confirm("Really erase? This can't be undone.")) return;
    db = { days: {} }; save(); cur = logicalToday(); revEnd = null; render();
  };

  return [
    pageHead("about", `${logged.length} day${logged.length === 1 ? "" : "s"} logged on this phone`),
    card("Rules", { cls: "info" }, h("ul", {},
      h("li", {}, h("b", {}, "Don’t correct anything you notice. "), "This is a baseline, not a cleanse."),
      h("li", {}, h("b", {}, "Same format every day "), "so patterns are visible."),
      h("li", {}, h("b", {}, "Keep it short. "), "Two minutes at each check-in."),
      h("li", {}, h("b", {}, "Keep your log private. "), "Please don’t post personal health details in comments."))),
    card("Each day", { cls: "info" }, h("ul", {},
      h("li", {}, "Wake time and how you felt on waking (1–5)"),
      h("li", {}, "Every meal or snack: what, when, where, with whom, and how you felt 30 min after"),
      h("li", {}, "Energy at 10:00, 14:00, 18:00 (1–5)"),
      h("li", {}, "One moment your body said no, and one it said yes: what you were doing and who was within about six feet"),
      h("li", {}, "Bedtime and how you fell asleep"),
      h("li", {}, "In the evening, on the Place tab: where you spent most of the day, energy and calm there (1–5), and who you met and how it felt"),
      h("li", {}, "Optional: resting heart rate or HRV each morning")),
      h("p", { class: "small" }, "After seven days, the 7 days tab shows which signals are yours and which you may be picking up through your open centers. Anything you enter before 4am counts toward the previous day.")),
    card("Your data", { cls: "info" },
      h("p", { class: "hint" }, "Everything stays on this phone. Nothing is sent anywhere. Removing the app from your home screen deletes the log, so save a backup now and then."),
      h("div", { class: "stack" }, exportBtn, backupBtn, restoreBtn, file, eraseBtn)),
    card("Put it on your home screen", { cls: "info" }, h("p", { class: "hint" },
      "On iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, open the Chrome menu and tap Add to Home screen.")),
  ];
}

function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function toCSV() {
  const rows = [["date", "entry", "time", "score_1_5", "what_or_doing", "where", "people", "signals", "note"]];
  const ppl = l => l.map(p => personLabel(p, "none")).join("; ");
  for (const i of loggedDays()) {
    const d = db.days[i];
    if (d.wake.time || d.wake.feel) rows.push([i, "wake", d.wake.time, d.wake.feel]);
    if (d.tracker.rhr) rows.push([i, "resting_hr", "", "", "", "", "", "", d.tracker.rhr]);
    if (d.tracker.hrv) rows.push([i, "hrv", "", "", "", "", "", "", d.tracker.hrv]);
    for (const [k, t] of ENERGY) if (d.energy[k]) rows.push([i, "energy", t, d.energy[k]]);
    for (const m of d.meals) rows.push([i, m.kind, m.time, m.after, m.what, m.where, ppl(m.with), "", m.note]);
    for (const kind of ["no", "yes"]) {
      const m = d[kind];
      if (momentHas(m)) rows.push([i, "body_" + kind, m.time, "", m.doing, "", ppl(m.near), [...m.signals, m.other].filter(Boolean).join("; ")]);
    }
    if (d.bed.time || d.bed.how.length || d.bed.note) rows.push([i, "bed", d.bed.time, "", "", "", "", d.bed.how.join("; "), d.bed.note]);
    if (envHas(d.env)) {
      rows.push([i, "place_energy", "", d.env.energy, "", d.env.place]);
      rows.push([i, "place_calm", "", d.env.calm, "", d.env.place]);
      for (const m of d.env.met) rows.push([i, "meeting", "", m.felt, "", d.env.place, m.who.join("; "), "", m.note]);
    }
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
  const screens = { today: renderToday, place: renderPlace, review: renderReview, info: renderInfo };
  view.append(...screens[tab]().filter(Boolean));
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  window.scrollTo(0, y);
}
document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  tab = b.dataset.tab; if (tab === "review") revEnd = null;
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

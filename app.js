(() => {
"use strict";

/* ================= хранилище ================= */
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DB = (window.FIREBASE_DB_URL || "").trim().replace(/\/+$/, "");
const USERS = window.USERS;
const TOPICS = window.TOPICS;
const GROUPS = window.TOPIC_GROUPS || {};
const ALL_WORDS = TOPICS.flatMap(t => t.words);
const WORD_BY_ID = Object.fromEntries(ALL_WORDS.map(w => [w.id, w]));
const TOPIC_ICON = {
  general: "🏃", qualities: "💪", kinds: "🏅", people: "🧑‍🤝‍🧑", career: "📈", competitions: "🏆",
  team: "👥", scoring: "🔢", records: "⏱️", refereeing: "🧑‍⚖️", fans: "📣",
  facilities: "🏟️", equipment: "🎾", anatomy: "🫀",
};

let data = LS.get("ec_data", { progress: {}, stars: {}, seen: {} });
let pending = LS.get("ec_pending", []);
let syncState = DB ? "ok" : "off";
let flushing = false;

function applyLocal(kind, user, key, value) {
  data[kind] ??= {};
  data[kind][user] ??= {};
  if (value === null || value === undefined) delete data[kind][user][key];
  else data[kind][user][key] = value;
}
function setVal(kind, user, key, value) {
  applyLocal(kind, user, key, value);
  LS.set("ec_data", data);
  if (!DB) return;
  pending.push({ kind, user, key, value: value ?? null });
  LS.set("ec_pending", pending);
  flush();
}
async function flush() {
  if (!DB || flushing || !pending.length) return;
  flushing = true;
  const batch = pending.slice();
  const groups = {};
  for (const p of batch) (groups[`${p.kind}/${p.user}`] ??= {})[p.key] = p.value;
  try {
    for (const [path, body] of Object.entries(groups)) {
      const r = await fetch(`${DB}/${path}.json`, { method: "PATCH", body: JSON.stringify(body) });
      if (!r.ok) throw new Error("HTTP " + r.status);
    }
    pending = pending.slice(batch.length);
    LS.set("ec_pending", pending);
    syncState = "ok";
  } catch (e) {
    syncState = "err";
  }
  flushing = false;
  updateSyncNote();
  if (pending.length && syncState === "ok") flush();
}
async function pull() {
  if (!DB) return;
  try {
    const r = await fetch(`${DB}/.json`, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const remote = (await r.json()) || {};
    data = { progress: remote.progress || {}, stars: remote.stars || {}, seen: remote.seen || {} };
    for (const p of pending) applyLocal(p.kind, p.user, p.key, p.value);
    LS.set("ec_data", data);
    syncState = pending.length ? syncState : "ok";
  } catch (e) {
    syncState = "err";
  }
  if (S.view !== "study") render(); else updateSyncNote();
}
let lastSeen = 0;
function touchSeen() {
  if (!S.user || Date.now() - lastSeen < 60000) return;
  lastSeen = Date.now();
  setVal("seen", S.user, "t", lastSeen);
}

/* ================= состояние ================= */
const S = {
  user: LS.get("ec_user", null),
  tab: LS.get("ec_tab", "topics"),
  view: "home",
  topicId: null,
  settings: Object.assign({ shuffle: true, front: "en" }, LS.get("ec_settings", {})),
  study: null,
};
if (!USERS.some(u => u.id === S.user)) S.user = null;

const prog = (user, id) => data.progress?.[user]?.[id];
const starred = (user, id) => !!data.stars?.[user]?.[id];
const userById = id => USERS.find(u => u.id === id);
const face = (u, cls = "") => u.photo
  ? `<img class="face-img ${cls}" src="${u.photo}?v=1" alt="${esc(u.name)}" draggable="false">`
  : `<span class="${cls}">${u.emoji}</span>`;
const other = () => USERS.find(u => u.id !== S.user);
function stats(user, words) {
  let k = 0, l = 0;
  for (const w of words) { const p = prog(user, w.id); if (p === 1) k++; else if (p === 0) l++; }
  return { k, l, total: words.length, pct: words.length ? k / words.length : 0 };
}

/* ================= утилиты ================= */
const $app = document.getElementById("app");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const cards = n => `${n} ${plural(n, "карточка", "карточки", "карточек")}`;
const words = n => `${n} ${plural(n, "слово", "слова", "слов")}`;
function ago(ts) {
  if (!ts) return "ещё не заходил(а)";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return "в сети сейчас";
  if (m < 60) return `был(а) ${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `был(а) ${h} ч назад`;
  const d = Math.round(h / 24);
  return `был(а) ${d} ${plural(d, "день", "дня", "дней")} назад`;
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function speak(text) {
  if (!("speechSynthesis" in window)) return toast("Озвучка не поддерживается в этом браузере");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g, "").replace(/\//g, ", "));
  u.lang = "en-GB"; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(v => /^en[-_]GB/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

const I = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="15" rx="2.5"/><path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5V17"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
};

/* ================= рендер ================= */
function render() {
  if (!S.user) return renderWho();
  if (S.view === "study") return renderStudy();
  if (S.view === "result") return renderResult();
  if (S.view === "topic") return renderTopic();
  renderHome();
}

function syncNoteHtml() {
  if (syncState === "off") return `<span class="sync-note off" id="sync"><i></i>только на этом устройстве</span>`;
  if (syncState === "err") return `<span class="sync-note err" id="sync"><i></i>нет связи, сохраню позже</span>`;
  return `<span class="sync-note" id="sync"><i></i>синхронизировано</span>`;
}
function updateSyncNote() {
  const el = document.getElementById("sync");
  if (el) el.outerHTML = syncNoteHtml();
}

function renderWho() {
  $app.innerHTML = `
    <div class="who">
      <div style="font-size:56px">🏅</div>
      <h1 class="h1">Sport English</h1>
      <div class="sub">Кто учит слова?</div>
      <div class="who-list">
        ${USERS.map(u => `<button class="who-card" data-who="${u.id}"><div class="avatar">${face(u)}</div>${esc(u.name)}</button>`).join("")}
      </div>
    </div>`;
}

function nav() {
  const b = (id, icon, label) => `<button data-tab="${id}" class="${S.tab === id ? "on" : ""}">${icon}${label}</button>`;
  return `<nav class="nav">${b("topics", I.home, "Темы")}${b("all", I.cards, "Все карточки")}${b("progress", I.chart, "Прогресс")}</nav>`;
}
function header(title) {
  const u = userById(S.user);
  return `<div class="topbar">
      <div><h1 class="h1">${title}</h1>${syncNoteHtml()}</div>
      <button class="avatar" data-act="switch" title="Сменить пользователя">${face(u)}</button>
    </div>`;
}

function topicCard(t) {
  const me = stats(S.user, t.words), o = other(), os = stats(o.id, t.words);
  return `<button class="topic" data-topic="${t.id}">
    <div class="topic-ico">${TOPIC_ICON[t.id] || "📘"}</div>
    <div class="topic-body">
      <div class="topic-title">${esc(t.en)}</div>
      <div class="topic-ru">${esc(t.ru)} · ${cards(t.words.length)}</div>
      <div class="bar"><i class="g" style="width:${me.k / me.total * 100}%"></i><i class="o" style="width:${me.l / me.total * 100}%"></i></div>
      <div class="topic-meta"><span>Выучено ${me.k}/${me.total}</span>
        <span class="mini-users"><span>${face(o, "mini")} ${os.k}/${os.total}</span></span></div>
    </div>
  </button>`;
}

function renderHome() {
  let body = "";
  if (S.tab === "topics") {
    const u = userById(S.user);
    let html = "", subs = [];
    const flushSubs = () => { if (subs.length) { html += `<div class="sub-topics">${subs.join("")}</div>`; subs = []; } };
    for (const t of TOPICS) {
      if (GROUPS[t.id]) { subs.push(topicCard(t)); continue; }
      flushSubs();
      html += topicCard(t);
    }
    flushSubs();
    body = `${header(`Привет, ${esc(u.name)}!`)}
      <div class="sub" style="margin:-8px 0 16px">Общеспортивная терминология · ${words(ALL_WORDS.length)}</div>
      <div class="stack">${html}</div>`;
  } else if (S.tab === "all") {
    const me = stats(S.user, ALL_WORDS);
    const left = ALL_WORDS.length - me.k;
    const starN = ALL_WORDS.filter(w => starred(S.user, w.id)).length;
    body = `${header("Все карточки")}
      <div class="hero">
        <div class="hero-title">Слова из всех ${TOPICS.length} тем</div>
        <div class="bar"><i class="g" style="width:${me.pct * 100}%"></i><i class="o" style="width:${me.l / me.total * 100}%"></i></div>
        <div class="sub">Выучено ${me.k} из ${me.total} · ещё учу ${me.l}</div>
        <div class="stack">
          <button class="pill-btn" data-start="all-left">${left ? `Учить невыученные · ${left}` : "Все выучены! Повторить всё"}</button>
          <button class="pill-btn secondary" data-start="all-all">Все карточки подряд · ${ALL_WORDS.length}</button>
          <button class="pill-btn secondary" data-start="all-learning" ${me.l ? "" : "disabled style=opacity:.5"}>🟠 Только «ещё учу» · ${me.l}</button>
          <button class="pill-btn secondary" data-start="all-star" ${starN ? "" : "disabled style=opacity:.5"}>⭐ Избранное · ${starN}</button>
        </div>
      </div>
      <div class="sub" style="margin:14px 4px">Карточки перемешиваются из всех тем. Звёздочкой ⭐ на карточке можно отметить трудные слова.</div>`;
  } else {
    const [a, b] = USERS.map(u => ({ u, s: stats(u.id, ALL_WORDS) }));
    const lead = a.s.k === b.s.k ? "Пока ничья 🤝"
      : (() => { const w = a.s.k > b.s.k ? a : b, l = w === a ? b : a; return `${face(w.u, "mini")} ${esc(w.u.name)} впереди на ${words(w.s.k - l.s.k)}`; })();
    const duo = [a, b].map(({ u, s }) => `
      <div class="duo-card ${u.id === S.user ? "me" : ""}">
        <div class="avatar" style="box-shadow:0 0 0 3px ${u.color}">${face(u)}</div>
        <div class="name">${esc(u.name)}</div>
        <div class="num" style="color:${u.color}">${s.k}</div>
        <div class="of">из ${s.total} выучено</div>
        <div class="bar"><i class="g" style="width:${s.pct * 100}%"></i><i class="o" style="width:${s.l / s.total * 100}%"></i></div>
        <div class="seen">ещё учит: ${s.l} · ${ago(data.seen?.[u.id]?.t)}</div>
      </div>`).join("");
    const rows = TOPICS.map(t => `
      <div class="pt"><div class="pt-title">${TOPIC_ICON[t.id] || ""} ${esc(t.en)}</div>
      ${USERS.map(u => { const s = stats(u.id, t.words); return `
        <div class="pt-row">${face(u, "mini")}
          <div class="bar"><i style="width:${s.pct * 100}%;background:${u.color}"></i></div>
          <span class="num">${s.k}/${s.total}</span></div>`; }).join("")}
      </div>`).join("");
    body = `${header("Прогресс")}
      <div class="duo">${duo}</div>
      <div class="leader">${lead}</div>
      <h2 class="h2">По темам</h2>
      <div class="stack">${rows}</div>`;
  }
  $app.innerHTML = `<div class="screen">${body}</div>${nav()}`;
}

function renderTopic() {
  const t = TOPICS.find(x => x.id === S.topicId);
  const me = stats(S.user, t.words);
  const left = t.words.length - me.k;
  const list = t.words.map(w => {
    const p = prog(S.user, w.id), st = starred(S.user, w.id);
    return `<div class="word-row"><span class="dot ${p === 1 ? "k" : p === 0 ? "l" : ""}"></span>
      <div><div class="en">${esc(w.en)}</div><div class="ru">${esc(w.ru)}</div></div>
      <button class="star" data-star="${w.id}" aria-label="Избранное" style="width:28px;height:28px;color:${st ? "#f5b700" : "var(--line)"}">${st ? I.starOn : I.star}</button></div>`;
  }).join("");
  $app.innerHTML = `<div class="screen" style="padding-bottom:40px">
    <div class="topbar"><button class="icon-btn" data-act="home">${I.back}</button><div style="flex:1"></div></div>
    <div style="font-size:40px">${TOPIC_ICON[t.id] || "📘"}</div>
    <h1 class="h1">${esc(t.en)}</h1>
    <div class="sub" style="margin:4px 0 16px">${esc(t.ru)} · ${cards(t.words.length)}</div>
    <div class="bar"><i class="g" style="width:${me.pct * 100}%"></i><i class="o" style="width:${me.l / me.total * 100}%"></i></div>
    <div class="sub" style="margin:8px 0 18px">Выучено ${me.k} · ещё учу ${me.l} · новых ${me.total - me.k - me.l}</div>
    <div class="stack">
      <button class="pill-btn" data-start="topic-left">${left ? `Учить карточки · ${left}` : (S.user === "sasha" ? "Пупсик, ты молодец! Нажми сюда, если хочешь повторить" : "Тема выучена! Повторить")}</button>
      ${left && left !== t.words.length ? `<button class="pill-btn secondary" data-start="topic-all">Все карточки темы · ${t.words.length}</button>` : ""}
    </div>
    <h2 class="h2">Слова темы</h2>
    <div class="legend"><span><i style="background:var(--green)"></i>знаю</span><span><i style="background:var(--orange)"></i>ещё учу</span><span><i style="background:var(--line)"></i>не видел(а)</span></div>
    <div class="stack" style="gap:6px">${list}</div>
    <div style="margin-top:20px"><button class="pill-btn danger" data-act="reset-topic">Сбросить мой прогресс по этой теме</button></div>
  </div>`;
}

/* ================= изучение ================= */
function startStudy(list, title) {
  if (!list.length) return toast("Здесь пока нет карточек");
  list = list.slice();
  if (S.settings.shuffle) shuffle(list);
  S.study = { title, list, i: 0, known: 0, learning: 0, history: [], again: [], flipped: false, back: S.view === "topic" ? "topic" : (S.study?.back || "home") };
  S.view = "study";
  render();
}
function startByKey(key) {
  if (key.startsWith("topic")) {
    const t = TOPICS.find(x => x.id === S.topicId);
    const left = t.words.filter(w => prog(S.user, w.id) !== 1);
    if (key === "topic-all" || !left.length) return startStudy(t.words, t.en);
    return startStudy(left, t.en);
  }
  const left = ALL_WORDS.filter(w => prog(S.user, w.id) !== 1);
  if (key === "all-left") return startStudy(left.length ? left : ALL_WORDS, "Все темы");
  if (key === "all-all") return startStudy(ALL_WORDS, "Все темы");
  if (key === "all-learning") return startStudy(ALL_WORDS.filter(w => prog(S.user, w.id) === 0), "Ещё учу");
  if (key === "all-star") return startStudy(ALL_WORDS.filter(w => starred(S.user, w.id)), "Избранное");
}

function faceHtml(w, side) {
  const lang = side === "front" ? S.settings.front : (S.settings.front === "en" ? "ru" : "en");
  const text = lang === "en" ? w.en : w.ru;
  const size = text.length > 70 ? "sm" : text.length > 30 ? "md" : "";
  const st = starred(S.user, w.id);
  return `<div class="face ${side}">
    <div class="tools">
      <button data-say="${w.id}" aria-label="Озвучить">${I.sound}</button>
      <button data-star="${w.id}" class="${st ? "on" : ""}" aria-label="Избранное">${st ? I.starOn : I.star}</button>
    </div>
    <div class="txt ${size}">${esc(text)}</div>
    ${side === "front" ? `<div class="hint">нажми, чтобы перевернуть</div>` : ""}
  </div>`;
}
function cardHtml(w, cls) {
  return `<div class="card ${cls}" data-card>
    <div class="stamp k">ЗНАЮ</div><div class="stamp l">ЕЩЁ УЧУ</div>
    <div class="card-inner">${faceHtml(w, "front")}${faceHtml(w, "back")}</div>
  </div>`;
}
function renderStudy() {
  const st = S.study, w = st.list[st.i], next = st.list[st.i + 1];
  $app.innerHTML = `<div class="study">
    <div class="study-top">
      <button class="icon-btn" data-act="close">${I.x}</button>
      <div><div class="study-count" style="text-align:center">${st.i + 1} / ${st.list.length}</div><div class="study-title">${esc(st.title)}</div></div>
      <button class="icon-btn" data-act="settings">${I.gear}</button>
    </div>
    <div class="study-bar"><i style="width:${st.i / st.list.length * 100}%"></i></div>
    <div class="counters"><div class="counter l" id="cl">${st.learning}</div><div class="counter k" id="ck">${st.known}</div></div>
    <div class="deck">${next ? cardHtml(next, "behind") : ""}${cardHtml(w, "current enter" + (st.flipped ? " flipped" : ""))}</div>
    <div class="study-actions">
      <button class="round-btn" data-act="undo" ${st.history.length ? "" : "disabled"} aria-label="Отменить">${I.undo}</button>
      <button class="act l" data-act="no">✕ Ещё учу</button>
      <button class="act k" data-act="yes">✓ Знаю</button>
    </div>
  </div>`;
  bindCard($app.querySelector(".card.current"));
}

function feedback(card, dx) {
  const p = Math.min(Math.abs(dx) / 90, 1);
  card.classList.toggle("to-k", dx > 40);
  card.classList.toggle("to-l", dx < -40);
  card.querySelector(".stamp.k").style.opacity = dx > 0 ? p : 0;
  card.querySelector(".stamp.l").style.opacity = dx < 0 ? p : 0;
  document.getElementById("ck")?.classList.toggle("hot", dx > 90);
  document.getElementById("cl")?.classList.toggle("hot", dx < -90);
}
function bindCard(card) {
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, pid = null;
  card.addEventListener("pointerdown", e => {
    if (e.target.closest("button") || busy) return;
    pid = e.pointerId; card.setPointerCapture(pid);
    sx = e.clientX; sy = e.clientY; dx = dy = 0; dragging = false;
    card.classList.remove("enter");
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", e => {
    if (e.pointerId !== pid) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!dragging && Math.hypot(dx, dy) > 8) dragging = true;
    if (dragging) { card.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${dx / 16}deg)`; feedback(card, dx); }
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!dragging) { if (e.type === "pointerup") flip(); return; }
    if (Math.abs(dx) > 90) return fly(dx > 0, dx, dy);
    card.style.transition = "transform .25s";
    card.style.transform = "";
    feedback(card, 0);
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}
function flip() {
  const card = $app.querySelector(".card.current");
  if (!card) return;
  S.study.flipped = !S.study.flipped;
  card.classList.toggle("flipped", S.study.flipped);
}
let busy = false;
function fly(knew, dx = 0, dy = 0) {
  if (busy || S.view !== "study") return;
  busy = true;
  const card = $app.querySelector(".card.current");
  const dir = knew ? 1 : -1;
  if (card) {
    feedback(card, dir * 200);
    card.classList.remove("enter");
    card.style.transition = "transform .3s ease-in, opacity .3s";
    card.style.transform = `translate(${dir * window.innerWidth * 1.1}px, ${dy * 0.35 + 40}px) rotate(${dir * 24}deg)`;
    card.style.opacity = "0";
  }
  setTimeout(() => { busy = false; answer(knew); }, card ? 260 : 0);
}
function answer(knew) {
  const st = S.study, w = st.list[st.i];
  st.history.push({ w, prev: prog(S.user, w.id), knew });
  setVal("progress", S.user, w.id, knew ? 1 : 0);
  touchSeen();
  if (knew) st.known++; else { st.learning++; st.again.push(w); }
  st.i++; st.flipped = false;
  if (st.i >= st.list.length) { S.view = "result"; render(); }
  else renderStudy();
}
function undo() {
  const st = S.study, h = st.history.pop();
  if (!h) return;
  setVal("progress", S.user, h.w.id, h.prev === undefined ? null : h.prev);
  if (h.knew) st.known--; else { st.learning--; st.again.pop(); }
  st.i--; st.flipped = false;
  S.view = "study";
  renderStudy();
}

function renderResult() {
  const st = S.study, done = !st.again.length;
  $app.innerHTML = `<div class="result">
    <div class="topbar"><button class="icon-btn" data-act="close">${I.x}</button><div></div></div>
    <div class="big">${done ? "🎉" : "💪"}</div>
    <h1 class="h1">${done ? "Все карточки знаешь!" : "Раунд пройден"}</h1>
    <div class="sub">${esc(st.title)} · ${cards(st.list.length)}</div>
    <div class="score-row">
      <div class="score k"><b>${st.known}</b>знаю</div>
      <div class="score l"><b>${st.learning}</b>ещё учу</div>
    </div>
    <div class="stack" style="margin-top:auto">
      ${done ? "" : `<button class="pill-btn" data-act="again">Повторить «ещё учу» · ${st.learning}</button>`}
      <button class="pill-btn secondary" data-act="restart">Пройти все карточки заново</button>
      <button class="pill-btn secondary" data-act="undo">${I.undo.replace("<svg", '<svg width="20" height="20"')} Отменить последнюю</button>
      <button class="pill-btn ${done ? "" : "secondary"}" data-act="close">Готово</button>
    </div>
  </div>`;
}

/* ================= шторки ================= */
function sheet(html, onClick) {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener("click", e => {
    if (e.target === bg) return bg.remove();
    const b = e.target.closest("[data-opt]");
    if (b) onClick(b.dataset.opt, bg);
  });
  document.body.appendChild(bg);
}
function openSettings() {
  const html = () => `<h3>Настройки карточек</h3>
    <button class="opt" data-opt="shuffle">Перемешивать карточки<span class="switch ${S.settings.shuffle ? "on" : ""}"></span></button>
    <button class="opt" data-opt="front">Сначала русское слово<span class="switch ${S.settings.front === "ru" ? "on" : ""}"></span></button>
    <div class="sub" style="margin:6px 4px 0">Свайп вправо — «знаю», влево — «ещё учу». На компьютере: пробел — перевернуть, ← / → — ответ.</div>`;
  sheet(html(), (opt, bg) => {
    if (opt === "shuffle") S.settings.shuffle = !S.settings.shuffle;
    if (opt === "front") S.settings.front = S.settings.front === "en" ? "ru" : "en";
    LS.set("ec_settings", S.settings);
    bg.querySelector(".sheet").innerHTML = html();
    if (S.view === "study") renderStudy();
  });
}
function openSwitch() {
  sheet(`<h3>Кто учит?</h3>${USERS.map(u => `<button class="opt" data-opt="${u.id}"><span class="opt-who">${face(u, "mini")} ${esc(u.name)}</span>${u.id === S.user ? "✓" : ""}</button>`).join("")}`,
    (id, bg) => { S.user = id; LS.set("ec_user", id); bg.remove(); lastSeen = 0; touchSeen(); render(); });
}

/* ================= события ================= */
$app.addEventListener("click", e => {
  const t = e.target.closest("button, [data-who]");
  if (!t) return;
  const d = t.dataset;
  if (d.who) { S.user = d.who; LS.set("ec_user", d.who); touchSeen(); return render(); }
  if (d.tab) { S.tab = d.tab; LS.set("ec_tab", d.tab); S.view = "home"; window.scrollTo(0, 0); return render(); }
  if (d.topic) { S.topicId = d.topic; S.view = "topic"; window.scrollTo(0, 0); return render(); }
  if (d.start) return startByKey(d.start);
  if (d.say) { const w = WORD_BY_ID[d.say]; return speak(w.en); }
  if (d.star) {
    const on = !starred(S.user, d.star);
    setVal("stars", S.user, d.star, on ? true : null);
    toast(on ? "⭐ Добавлено в избранное" : "Убрано из избранного");
    if (S.view === "study") {
      $app.querySelectorAll(`.card.current [data-star="${d.star}"]`).forEach(b => { b.classList.toggle("on", on); b.innerHTML = on ? I.starOn : I.star; });
    } else render();
    return;
  }
  switch (d.act) {
    case "home": S.view = "home"; return render();
    case "switch": return openSwitch();
    case "settings": return openSettings();
    case "close": S.view = S.study?.back || "home"; S.study = null; window.scrollTo(0, 0); return render();
    case "undo": return undo();
    case "yes": return fly(true);
    case "no": return fly(false);
    case "again": return startStudy(S.study.again, S.study.title);
    case "restart": { const all = [...S.study.list]; return startStudy(all, S.study.title); }
    case "reset-topic": {
      const t = TOPICS.find(x => x.id === S.topicId);
      if (!confirm(`Сбросить твой прогресс по теме «${t.en}»? Прогресс ${other().name} не изменится.`)) return;
      for (const w of t.words) if (prog(S.user, w.id) !== undefined) setVal("progress", S.user, w.id, null);
      toast("Прогресс по теме сброшен");
      return render();
    }
  }
});
document.addEventListener("keydown", e => {
  if (S.view !== "study" || document.querySelector(".sheet-bg")) return;
  if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); flip(); }
  else if (e.key === "ArrowRight") fly(true);
  else if (e.key === "ArrowLeft") fly(false);
  else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); undo(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) { pull(); flush(); } });
window.addEventListener("online", () => { flush(); pull(); });

render();
if (S.user) touchSeen();
if (DB) { pull(); flush(); setInterval(() => { if (!document.hidden) pull(); }, 15000); }
})();

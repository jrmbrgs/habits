'use strict';

/* =========================================================
   Habits — petit tracker d'habitudes (PWA, données locales)
   ========================================================= */

const STORE = 'habits.v1';
const COLORS = ['#7fdc9f', '#5ed1d1', '#6aa8f0', '#b48cf0', '#f08cc4', '#f07a6a', '#f0a35a', '#d9d36a'];
const EMOJIS = ['📖', '🚶', '💧', '🧘', '💪', '🏃', '🚴', '🏊', '🥗', '🍎', '💊', '😴',
  '✍️', '🧠', '🎸', '🎨', '💻', '📚', '🗣️', '🌱', '🧹', '🦷', '☀️', '🛏️',
  '📵', '🚭', '🍷', '☕', '💰', '❤️', '🙏', '⭐'];
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const SUGGESTIONS = [
  { name: 'Lire', emoji: '📖', color: '#6aa8f0' },
  { name: 'Marcher 20 min', emoji: '🚶', color: '#7fdc9f' },
  { name: 'Courir', emoji: '🏃', color: '#5ed1d1' },
  { name: 'Méditer 5 min', emoji: '🧘', color: '#b48cf0' },
  { name: 'Sport', emoji: '💪', color: '#f07a6a', schedule: { type: 'weekly', days: [], times: 3 } },
  { name: 'Écrire', emoji: '✍️', color: '#f0a35a' },
];

/* ---------- State ---------- */
let state = load();
let tab = 'today';
let statsSel = 'all';
let popId = null;

/*
 * stamps[`${day}|${habitId}`] = date de la dernière modif d'une case,
 * deleted[habitId] = date de suppression, habit.updatedAt, orderAt :
 * ces horodatages permettent de fusionner les données de plusieurs appareils.
 */
function emptyState() { return { v: 2, habits: [], log: {}, stamps: {}, deleted: {}, orderAt: 0 }; }
function normalize(s) {
  if (!s || !Array.isArray(s.habits) || typeof s.log !== 'object') return emptyState();
  s.v = 2; s.stamps ||= {}; s.deleted ||= {}; s.orderAt ||= 0;
  for (const h of s.habits) h.updatedAt ||= 0;
  return s;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE))); } catch (e) { return emptyState(); }
}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Sauvegarde impossible'); }
}
function save() { persist(); scheduleSync(); }

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dow = d => (d.getDay() + 6) % 7; // 0 = lundi
const weekStart = d => addDays(d, -dow(d));

/* ---------- Log ---------- */
const val = (h, k) => state.log[k]?.[h.id];
function setVal(h, k, v) {
  const day = state.log[k] || (state.log[k] = {});
  if (v === undefined || v === 0) delete day[h.id]; else day[h.id] = v;
  if (!Object.keys(day).length) delete state.log[k];
  state.stamps[`${k}|${h.id}`] = Date.now();
  if (v !== undefined && v !== 0 && k < h.createdAt) { h.createdAt = k; h.updatedAt = Date.now(); } // log rétroactif
  save();
}
function scheduledOn(h, d) {
  if (key(d) < h.createdAt) return false;
  return h.schedule.type !== 'weekdays' || h.schedule.days.includes(dow(d));
}
/** done | part | rest | off | miss */
function status(h, d) {
  const v = val(h, key(d));
  if (v === 'r') return 'rest';
  if (typeof v === 'number' && v >= h.target) return 'done';
  if (typeof v === 'number' && v > 0) return 'part';
  return scheduledOn(h, d) ? 'miss' : 'off';
}

/* ---------- Streaks & stats ---------- */
function weekTally(h, ws) {
  let done = 0, rest = 0;
  for (let i = 0; i < 7; i++) {
    const s = status(h, addDays(ws, i));
    if (s === 'done') done++; else if (s === 'rest') rest++;
  }
  return { done, rest, met: done + rest >= h.schedule.times };
}
function streak(h) {
  const t = today();
  if (h.schedule.type === 'weekly') {
    let ws = weekStart(t), n = 0;
    const created = parse(h.createdAt);
    if (!weekTally(h, ws).met) ws = addDays(ws, -7);
    while (addDays(ws, 6) >= created && weekTally(h, ws).met) { n++; ws = addDays(ws, -7); }
    return n;
  }
  let d = t, n = 0;
  if (status(h, d) === 'miss' || status(h, d) === 'part') d = addDays(d, -1); // aujourd'hui pas encore fait : on ne casse rien
  for (let i = 0; i < 4000; i++) {
    if (key(d) < h.createdAt) break;
    const s = status(h, d);
    if (s === 'done') n++;
    else if (s === 'miss' || s === 'part') break;
    d = addDays(d, -1);
  }
  return n;
}
function bestStreak(h) {
  const t = today();
  let best = 0, run = 0;
  if (h.schedule.type === 'weekly') {
    for (let ws = weekStart(parse(h.createdAt)); ws <= t; ws = addDays(ws, 7)) {
      if (weekTally(h, ws).met) best = Math.max(best, ++run);
      else if (ws < weekStart(t)) run = 0;
    }
    return best;
  }
  const tk = key(t);
  for (let d = parse(h.createdAt); d <= t; d = addDays(d, 1)) {
    const s = status(h, d);
    if (s === 'done') best = Math.max(best, ++run);
    else if ((s === 'miss' || s === 'part') && key(d) !== tk) run = 0;
  }
  return best;
}
function rate(h, n = 30) {
  const t = today(), created = parse(h.createdAt);
  if (h.schedule.type === 'weekly') {
    let done = 0, rest = 0, days = 0;
    for (let i = 0; i < n; i++) {
      const d = addDays(t, -i);
      if (d < created) break;
      days++;
      const s = status(h, d);
      if (s === 'done') done++; else if (s === 'rest') rest++;
    }
    const expected = days * h.schedule.times / 7 - rest;
    if (expected <= 0) return done ? 1 : null;
    return Math.min(1, done / expected);
  }
  let sched = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(t, -i);
    if (d < created) break;
    if (!scheduledOn(h, d)) continue;
    const s = status(h, d);
    if (i === 0 && s !== 'done') continue; // aujourd'hui encore ouvert
    if (s === 'done') { sched++; done++; } else if (s !== 'rest') sched++;
  }
  return sched ? done / sched : null;
}
function totalDone(h) {
  let n = 0;
  for (const k in state.log) { const v = state.log[k][h.id]; if (typeof v === 'number' && v >= h.target) n++; }
  return n;
}
function showedUpDays() {
  const byId = Object.fromEntries(state.habits.map(h => [h.id, h]));
  let n = 0;
  for (const k in state.log) {
    const day = state.log[k];
    if (Object.keys(day).some(id => byId[id] && typeof day[id] === 'number' && day[id] >= byId[id].target)) n++;
  }
  return n;
}

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const byId = id => state.habits.find(h => h.id === id);
const pct = r => r == null ? '–' : Math.round(r * 100) + '%';

function scheduleLabel(h) {
  const s = h.schedule;
  let txt;
  if (s.type === 'daily') txt = 'Chaque jour';
  else if (s.type === 'weekdays') {
    const ds = [...s.days].sort();
    if (ds.length === 5 && ds.every((d, i) => d === i)) txt = 'En semaine';
    else if (ds.length === 2 && ds[0] === 5 && ds[1] === 6) txt = 'Le week-end';
    else txt = ds.map(d => DAY_SHORT[d]).join(', ');
  } else txt = `${s.times}× par semaine`;
  if (h.target > 1) txt += ` · ${h.target}× par jour`;
  return txt;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';

function ring(h, k, size = 46) {
  const v = val(h, k);
  const rest = v === 'r';
  const count = typeof v === 'number' ? v : 0;
  const done = count >= h.target;
  const p = rest ? 0 : Math.min(1, count / h.target);
  const r = 20, c = 2 * Math.PI * r;
  const mark = rest ? ICON_PAUSE : done ? ICON_CHECK : (h.target > 1 && count ? `${count}/${h.target}` : '');
  return `<button class="check ${done ? 'done' : ''} ${rest ? 'rest' : ''} ${popId === h.id ? 'pop' : ''}" data-act="check" data-id="${h.id}" data-day="${k}" style="--c:${h.color}" aria-label="Valider ${esc(h.name)}">
    <svg viewBox="0 0 46 46" width="${size}" height="${size}"><circle class="track" cx="23" cy="23" r="${r}" fill="none" stroke-width="3"/><circle class="prog" cx="23" cy="23" r="${r}" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
    <span class="fill"></span><span class="mark">${mark}</span>
  </button>`;
}

/* =========================================================
   Views
   ========================================================= */
function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = { today: "Aujourd'hui", week: '7 derniers jours', stats: 'Analyse' }[tab];
  const view = $('#view');
  if (!state.habits.length) view.innerHTML = emptyView();
  else view.innerHTML = tab === 'today' ? todayView() : tab === 'week' ? weekView() : statsView();
  popId = null;
  if (tab === 'stats') { const sc = view.querySelector('.heat-scroll'); if (sc) sc.scrollLeft = sc.scrollWidth; }
}

function emptyView() {
  return `<div class="empty">
    <h2>Tes objectifs,<br>un jour à la fois.</h2>
    <p>Les grands changements naissent de petites actions répétées.<br>Choisis la première.</p>
    <div class="suggest">${SUGGESTIONS.map((s, i) => `<button data-act="suggest" data-i="${i}"><span>${s.emoji}</span>${esc(s.name)}</button>`).join('')}</div>
    <button class="btn accent" data-act="new" style="margin-top:14px">Créer ma propre habitude</button>
  </div>`;
}

function todayView() {
  const t = today(), k = key(t);
  const due = [], other = [];
  for (const h of state.habits) (scheduledOn(h, t) || h.schedule.type !== 'weekdays' ? due : other).push(h);
  // un habit "x/semaine" déjà atteint compte comme fait
  const complete = h => {
    const s = status(h, t);
    if (s === 'done') return true;
    return h.schedule.type === 'weekly' && weekTally(h, weekStart(t)).met;
  };
  const counted = due.filter(h => status(h, t) !== 'rest');
  const doneN = counted.filter(complete).length;
  const p = counted.length ? doneN / counted.length : 1;
  const r = 22, c = 2 * Math.PI * r;
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
  const dateStr = t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return `<div class="summary">
      <div class="ring-wrap">
        <svg viewBox="0 0 52 52" width="52" height="52" style="transform:rotate(-90deg)"><circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--card-2)" stroke-width="4"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset .4s"/></svg>
        <span>${Math.round(p * 100)}%</span>
      </div>
      <div><div class="greet">${greet} · ${dateStr}</div><div class="count">${doneN} sur ${counted.length} ${counted.length > 1 ? 'faites' : 'faite'}</div></div>
      <div class="day"><b>${String(showedUpDays()).padStart(3, '0')}</b><small>jours présents</small></div>
    </div>
    <div class="list">${due.map(h => habitRow(h, t)).join('')}</div>
    ${other.length ? `<div class="section-label">Pas prévu aujourd'hui</div><div class="list">${other.map(h => habitRow(h, t, true)).join('')}</div>` : ''}
    <p class="hint">Touche l'anneau pour valider · appui long pour un jour de repos.<br>Un repos ne casse jamais ta série.</p>`;
}

function habitRow(h, t, dim = false) {
  const k = key(t);
  const st = streak(h);
  const weekly = h.schedule.type === 'weekly';
  let sub = scheduleLabel(h);
  if (weekly) { const w = weekTally(h, weekStart(t)); sub = `${Math.min(w.done, h.schedule.times)}/${h.schedule.times} cette semaine${w.met ? ' ✓' : ''}`; }
  if (status(h, t) === 'rest') sub = 'Jour de repos';
  let strip = '';
  for (let i = 13; i >= 0; i--) {
    const d = addDays(t, -i), s = status(h, d);
    strip += `<i class="${s === 'miss' && i === 0 ? '' : s}${i === 0 ? ' today' : ''}"></i>`;
  }
  return `<div class="habit ${dim ? 'dim' : ''}" data-act="edit" data-id="${h.id}" style="--c:${h.color}">
    <div class="emoji">${h.emoji}</div>
    <div class="body">
      <div class="name"><span style="overflow:hidden;text-overflow:ellipsis">${esc(h.name)}</span>${st ? `<span class="streak">🔥 ${st}${weekly ? ' sem' : ''}</span>` : ''}</div>
      <div class="sub">${esc(sub)}</div>
      <div class="strip">${strip}</div>
    </div>
    ${ring(h, k)}
  </div>`;
}

function weekView() {
  const t = today();
  const days = [...Array(7)].map((_, i) => addDays(t, i - 6));
  const head = `<div class="week-row">${days.map(d => `<div class="week-head ${key(d) === key(t) ? 'is-today' : ''}">${DAY_LETTERS[dow(d)]}<b>${d.getDate()}</b></div>`).join('')}</div>`;
  const rows = state.habits.map(h => `<div class="week-row" style="--c:${h.color}">
      <div class="week-name"><span>${h.emoji}</span><span>${esc(h.name)}</span>${streak(h) ? `<small>🔥 ${streak(h)}${h.schedule.type === 'weekly' ? ' sem' : ''}</small>` : ''}</div>
      ${days.map(d => {
        const s = status(h, d), v = val(h, key(d));
        const label = s === 'part' ? v : s === 'done' ? '✓' : s === 'rest' ? '❙❙' : '';
        return `<button class="cell ${s}" data-act="cell" data-id="${h.id}" data-day="${key(d)}">${label}</button>`;
      }).join('')}
    </div>`).join('');
  const foot = `<div class="week-foot"><span>Réussite du jour</span>${days.map(d => {
    const hs = state.habits.filter(h => scheduledOn(h, d) && h.schedule.type !== 'weekly' && status(h, d) !== 'rest');
    return `<span>${hs.length ? Math.round(hs.filter(h => status(h, d) === 'done').length / hs.length * 100) + '%' : '–'}</span>`;
  }).join('')}</div>`;
  return `<div class="week">${head}${rows}${foot}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Fait</span><span><i style="background:var(--rest)"></i>Repos</span><span><i style="background:var(--card-2)"></i>Manqué</span><span><i style="box-shadow:inset 0 0 0 1px var(--card-2)"></i>Non prévu</span></div>
    <p class="hint">Touche une case pour la valider ou l'annuler · appui long pour un repos.</p>`;
}

function statsView() {
  if (statsSel !== 'all' && !byId(statsSel)) statsSel = 'all';
  const chips = `<div class="chips"><button class="chip ${statsSel === 'all' ? 'active' : ''}" data-act="sel" data-id="all">Toutes</button>${state.habits.map(h => `<button class="chip ${statsSel === h.id ? 'active' : ''}" data-act="sel" data-id="${h.id}">${h.emoji} ${esc(h.name)}</button>`).join('')}</div>`;
  return chips + (statsSel === 'all' ? statsAll() : statsOne(byId(statsSel)));
}

function statsAll() {
  const rates = state.habits.map(h => ({ h, r: rate(h) }));
  const valid = rates.filter(x => x.r != null);
  const avg = valid.length ? valid.reduce((a, x) => a + x.r, 0) / valid.length : null;
  const bestCur = Math.max(0, ...state.habits.filter(h => h.schedule.type !== 'weekly').map(streak));
  const t = today();
  const heat = heatmap('var(--accent)', d => {
    const hs = state.habits.filter(h => scheduledOn(h, d) || status(h, d) === 'done');
    if (!hs.length) return 'off';
    const counted = hs.filter(h => status(h, d) !== 'rest');
    if (!counted.length) return 'rest';
    const f = counted.filter(h => status(h, d) === 'done').length / counted.length;
    return f === 0 ? '' : 'lvl' + Math.max(1, Math.ceil(f * 4));
  }, false);
  return `<div class="kpis">
      <div class="kpi"><small>Jours présents</small><b>${showedUpDays()}</b></div>
      <div class="kpi"><small>Réussite 30 j</small><b>${pct(avg)}</b></div>
      <div class="kpi"><small>Meilleure série</small><b>${bestCur}<em>jours</em></b></div>
      <div class="kpi"><small>Habitudes</small><b>${state.habits.length}</b></div>
    </div>
    <div class="card" style="--c:var(--accent)"><h3><span>Une année de présence</span><span>${t.getFullYear()}</span></h3>${heat}</div>
    <div class="card"><h3>Réussite sur 30 jours</h3><div class="rates">${rates.map(({ h, r }) => `<div class="r" style="--c:${h.color}"><span>${h.emoji}</span><span class="n">${esc(h.name)}</span><span class="track"><span style="width:${(r || 0) * 100}%"></span></span><span class="pct">${pct(r)}</span></div>`).join('')}</div></div>
    ${weekdayCard(state.habits, 'var(--accent)')}`;
}

function statsOne(h) {
  const weekly = h.schedule.type === 'weekly';
  const unit = weekly ? 'sem' : 'jours';
  const heat = heatmap(h.color, d => { const s = status(h, d); return s === 'miss' ? '' : s; }, h.id);
  return `<div class="kpis" style="--c:${h.color}">
      <div class="kpi"><small>Série actuelle</small><b style="color:var(--c)">${streak(h)}<em>${unit}</em></b></div>
      <div class="kpi"><small>Meilleure série</small><b>${bestStreak(h)}<em>${unit}</em></b></div>
      <div class="kpi"><small>Réussite 30 j</small><b>${pct(rate(h))}</b></div>
      <div class="kpi"><small>Total</small><b>${totalDone(h)}<em>fois</em></b></div>
    </div>
    <div class="card" style="--c:${h.color}"><h3><span>${h.emoji} ${esc(h.name)}</span><span>${scheduleLabel(h)}</span></h3>${heat}
      <div class="legend"><span><i style="background:var(--c)"></i>Fait</span><span><i style="background:var(--rest)"></i>Repos</span><span><i style="background:var(--card-2)"></i>Manqué</span></div>
    </div>
    ${weekdayCard([h], h.color)}`;
}

function heatmap(color, cls, editId) {
  const t = today();
  const start = addDays(weekStart(t), -52 * 7);
  let html = '';
  for (let ws = start; ws <= t; ws = addDays(ws, 7)) {
    let label = '';
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d.getDate() === 1) label = MONTHS[d.getMonth()]; }
    if (ws.getTime() === start.getTime()) label = MONTHS[ws.getMonth()];
    html += `<i class="m">${label}</i>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      if (d > t) { html += '<i class="none"></i>'; continue; }
      const c = cls(d);
      html += editId ? `<i class="${c}" data-act="cell" data-id="${editId}" data-day="${key(d)}"></i>` : `<i class="${c}"></i>`;
    }
  }
  return `<div class="heat-scroll"><div class="heat" style="--c:${color}">${html}</div></div>`;
}

function weekdayCard(habits, color) {
  const t = today();
  const done = Array(7).fill(0), elig = Array(7).fill(0);
  for (let i = 0; i < 84; i++) {
    const d = addDays(t, -i);
    for (const h of habits) {
      if (key(d) < h.createdAt) continue;
      const s = status(h, d);
      if (s === 'rest' || (i === 0 && s !== 'done')) continue;
      if (s === 'done' || scheduledOn(h, d)) elig[dow(d)]++;
      if (s === 'done') done[dow(d)]++;
    }
  }
  const rates = done.map((n, i) => elig[i] ? n / elig[i] : 0);
  const max = Math.max(...rates, 0.0001);
  return `<div class="card" style="--c:${color}"><h3><span>Tes meilleurs jours</span><span>12 semaines</span></h3>
    <div class="bars">${rates.map((r, i) => `<div><span>${elig[i] ? Math.round(r * 100) + '%' : ''}</span><span class="bar" style="height:${(r / max) * 70}%;opacity:${r === max ? 1 : .55}"></span>${DAY_LETTERS[i]}</div>`).join('')}</div></div>`;
}

/* =========================================================
   Actions
   ========================================================= */
function tapCheck(h, k) {
  const v = val(h, k);
  const count = typeof v === 'number' ? v : 0;
  const next = h.target > 1 ? (count >= h.target ? 0 : count + 1) : (count >= 1 ? 0 : 1);
  setVal(h, k, next);
  if (next >= h.target) {
    popId = h.id;
    const t = today();
    if (k === key(t)) {
      const left = state.habits.filter(x => scheduledOn(x, t) && x.schedule.type !== 'weekly' && !['done', 'rest'].includes(status(x, t)));
      const st = streak(h);
      if (!left.length) toast('Tout est fait aujourd\'hui ✦');
      else if (st > 1 && h.schedule.type !== 'weekly') toast(`🔥 ${st} jours d'affilée`);
    }
  }
  render();
}
function tapCell(h, k) {
  if (parse(k) > today()) return;
  setVal(h, k, status(h, parse(k)) === 'done' ? 0 : h.target);
  render();
}
function toggleRest(h, k) {
  if (parse(k) > today()) return;
  const isRest = val(h, k) === 'r';
  setVal(h, k, isRest ? 0 : 'r');
  if (!isRest) toast('Jour de repos · ta série est préservée');
  render();
}

/* ---------- Gestures (tap + appui long) ---------- */
let pressTimer = null, pressEl = null, pressStart = null, suppressClick = false;
const view = document.getElementById('view');
view.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-act="check"],[data-act="cell"]');
  if (!el) return;
  pressEl = el; pressStart = { x: e.clientX, y: e.clientY };
  el.closest('.habit')?.classList.add('pressing');
  pressTimer = setTimeout(() => {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 600);
    clearPress();
    toggleRest(byId(el.dataset.id), el.dataset.day);
  }, 480);
});
function clearPress() {
  clearTimeout(pressTimer); pressTimer = null;
  document.querySelectorAll('.pressing').forEach(x => x.classList.remove('pressing'));
}
view.addEventListener('pointermove', e => {
  if (pressTimer && pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) clearPress();
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => view.addEventListener(ev, clearPress));
view.addEventListener('contextmenu', e => { if (e.target.closest('[data-act]')) e.preventDefault(); });

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (suppressClick) { suppressClick = false; return; }
  const h = byId(el.dataset.id);
  switch (el.dataset.act) {
    case 'check': tapCheck(h, el.dataset.day); break;
    case 'cell': tapCell(h, el.dataset.day); break;
    case 'edit': openEditor(h); break;
    case 'sel': statsSel = el.dataset.id; render(); break;
    case 'new': openEditor(); break;
    case 'suggest': {
      const s = SUGGESTIONS[+el.dataset.i];
      addHabit({ ...s });
      toast(`« ${s.name} » ajoutée`);
      break;
    }
  }
});

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab; render(); window.scrollTo({ top: 0 });
});
$('#btn-add').addEventListener('click', () => openEditor());
$('#btn-settings').addEventListener('click', openSettings);

/** Supprime une habitude et son historique, en gardant une trace pour la synchro. */
function removeHabit(id) {
  state.habits = state.habits.filter(x => x.id !== id);
  state.deleted[id] = Date.now();
  for (const k in state.log) { delete state.log[k][id]; if (!Object.keys(state.log[k]).length) delete state.log[k]; }
  for (const sk in state.stamps) if (sk.endsWith('|' + id)) delete state.stamps[sk];
}

function addHabit(d) {
  state.habits.push({
    id: uid(),
    name: d.name.trim(),
    emoji: d.emoji || '⭐',
    color: d.color || COLORS[state.habits.length % COLORS.length],
    schedule: d.schedule || { type: 'daily', days: [], times: 3 },
    target: d.target || 1,
    createdAt: key(today()),
    updatedAt: Date.now(),
  });
  save(); render();
}

/* =========================================================
   Sheets
   ========================================================= */
function openSheet(build) {
  const root = $('#sheet-root');
  root.innerHTML = '<div class="backdrop"></div><div class="sheet"><div class="grab"></div><div class="sheet-body"></div></div>';
  const backdrop = root.querySelector('.backdrop'), sheet = root.querySelector('.sheet');
  const close = () => {
    backdrop.classList.remove('open'); sheet.classList.remove('open');
    setTimeout(() => (root.innerHTML = ''), 300);
  };
  backdrop.addEventListener('click', close);
  // glisser vers le bas pour fermer
  let y0 = null;
  sheet.addEventListener('touchstart', e => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 110) close();
  });
  build(sheet.querySelector('.sheet-body'), close);
  requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
}

function openEditor(h) {
  const isNew = !h;
  const d = h ? JSON.parse(JSON.stringify(h)) : {
    name: '', emoji: EMOJIS[state.habits.length % EMOJIS.length], color: COLORS[state.habits.length % COLORS.length],
    schedule: { type: 'daily', days: [0, 1, 2, 3, 4], times: 3 }, target: 1,
  };
  if (!d.schedule.days.length) d.schedule.days = [0, 1, 2, 3, 4];

  openSheet((body, close) => {
    const draw = () => {
      const emojis = EMOJIS.includes(d.emoji) ? EMOJIS : [d.emoji, ...EMOJIS.slice(0, -1)];
      const s = d.schedule;
      body.style.setProperty('--c', d.color);
      body.innerHTML = `
        <div class="sheet-head"><button data-a="cancel">Annuler</button><h2>${isNew ? 'Nouvelle habitude' : 'Modifier'}</h2><button class="primary" data-a="save">${isNew ? 'Ajouter' : 'OK'}</button></div>
        <div class="field"><div class="name-row"><div class="emoji-preview">${d.emoji}</div><input class="text" id="f-name" maxlength="40" placeholder="Ex. Lire 10 pages" value="${esc(d.name)}" autocomplete="off"></div></div>
        <div class="field"><span class="label">Icône</span><div class="emojis">${emojis.map(e => `<button data-a="emoji" data-v="${e}" class="${e === d.emoji ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Couleur</span><div class="colors">${COLORS.map(c => `<button data-a="color" data-v="${c}" class="${c === d.color ? 'sel' : ''}" style="--sw:${c}" aria-label="couleur"></button>`).join('')}</div></div>
        <div class="field"><span class="label">Fréquence</span>
          <div class="seg">
            <button data-a="type" data-v="daily" class="${s.type === 'daily' ? 'sel' : ''}">Chaque jour</button>
            <button data-a="type" data-v="weekdays" class="${s.type === 'weekdays' ? 'sel' : ''}">Certains jours</button>
            <button data-a="type" data-v="weekly" class="${s.type === 'weekly' ? 'sel' : ''}">X / semaine</button>
          </div>
          ${s.type === 'weekdays' ? `<div class="days">${DAY_LETTERS.map((l, i) => `<button data-a="day" data-v="${i}" class="${s.days.includes(i) ? 'sel' : ''}">${l}</button>`).join('')}</div>` : ''}
          ${s.type === 'weekly' ? `<div class="stepper"><span>Fois par semaine</span><div><button data-a="times" data-v="-1">−</button><b>${s.times}</b><button data-a="times" data-v="1">+</button></div></div>` : ''}
          <div class="stepper"><span>Fois par jour</span><div><button data-a="target" data-v="-1">−</button><b>${d.target}</b><button data-a="target" data-v="1">+</button></div></div>
        </div>
        ${isNew ? '' : `
          <div class="field"><span class="label">Ordre</span><div class="order"><button class="btn" data-a="move" data-v="-1">↑ Monter</button><button class="btn" data-a="move" data-v="1">↓ Descendre</button></div></div>
          <button class="btn danger" data-a="delete">Supprimer l'habitude</button>`}
      `;
      const input = body.querySelector('#f-name');
      input.addEventListener('input', () => (d.name = input.value));
      if (isNew && !d.name) setTimeout(() => input.focus(), 350);
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const v = b.dataset.v, s = d.schedule;
      switch (b.dataset.a) {
        case 'cancel': return close();
        case 'emoji': d.emoji = v; break;
        case 'color': d.color = v; break;
        case 'type': s.type = v; break;
        case 'day': { const i = +v; s.days = s.days.includes(i) ? s.days.filter(x => x !== i) : [...s.days, i].sort(); break; }
        case 'times': s.times = Math.min(6, Math.max(1, s.times + +v)); break;
        case 'target': d.target = Math.min(20, Math.max(1, d.target + +v)); break;
        case 'move': {
          const i = state.habits.findIndex(x => x.id === h.id), j = i + +v;
          if (j < 0 || j >= state.habits.length) return;
          [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
          state.orderAt = Date.now();
          save(); render(); toast(+v < 0 ? 'Remontée' : 'Descendue');
          return;
        }
        case 'delete':
          if (!confirm(`Supprimer « ${h.name} » et tout son historique ?`)) return;
          removeHabit(h.id);
          save(); render(); close(); toast('Habitude supprimée');
          return;
        case 'save': {
          if (!d.name.trim()) { body.querySelector('#f-name').focus(); return toast('Donne-lui un nom'); }
          if (s.type === 'weekdays' && !s.days.length) return toast('Choisis au moins un jour');
          if (isNew) addHabit(d);
          else { Object.assign(h, { name: d.name.trim(), emoji: d.emoji, color: d.color, schedule: d.schedule, target: d.target, updatedAt: Date.now() }); save(); render(); }
          return close();
        }
      }
      draw();
    });
    draw();
  });
}

function openSettings() {
  openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>Réglages</h2><button class="primary" data-a="close">OK</button></div>
      <div class="field"><span class="label">Apparence</span><div class="seg" id="theme-seg"></div></div>
      <div class="field"><span class="label">Synchronisation</span><div id="sync-box"></div></div>
      <div class="field"><span class="label">Sauvegarde</span>
      <button class="btn" data-a="export" style="margin-top:0">Exporter une sauvegarde</button>
      <button class="btn" data-a="import">Importer une sauvegarde</button>
      <input type="file" id="f-import" accept="application/json,.json" hidden></div>
      <button class="btn danger" data-a="reset" style="margin-top:24px">Tout effacer</button>
      <p class="note" style="text-align:center;margin-top:18px">${state.habits.length} habitudes · ${Object.keys(state.log).length} jours enregistrés</p>`;
    drawSyncBox(); drawThemeSeg();
    const file = body.querySelector('#f-import');
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.habits) || typeof data.log !== 'object') throw new Error();
        if (!confirm(`Remplacer tes données par cette sauvegarde (${data.habits.length} habitudes) ?`)) return;
        // l'import devient la version la plus récente, y compris face aux autres appareils
        const now = Date.now(), imported = normalize(data);
        for (const h of state.habits) if (!imported.habits.some(x => x.id === h.id)) imported.deleted[h.id] = now;
        for (const h of imported.habits) h.updatedAt = now;
        for (const k in imported.log) for (const id in imported.log[k]) imported.stamps[`${k}|${id}`] = now;
        imported.orderAt = now;
        state = imported; save(); render(); close(); toast('Sauvegarde importée');
      } catch (e) { toast('Fichier invalide'); }
    });
    body.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') close();
      if (a === 'import') file.click();
      if (a === 'export') exportData();
      if (a === 'sync-now') syncNow();
      if (a === 'theme') { setTheme(e.target.closest('[data-a]').dataset.v); drawThemeSeg(); }
      if (a === 'sync-connect') {
        const token = body.querySelector('#f-token').value.trim();
        if (!token) return toast('Colle ton token GitHub');
        sync = { token, gistId: null, last: null, error: null }; saveSync();
        drawSyncBox(); syncNow();
      }
      if (a === 'sync-off' && confirm('Déconnecter cet appareil ? Tes données restent ici et sur GitHub.')) {
        sync = {}; saveSync(); drawSyncBox();
      }
      if (a === 'reset' && confirm('Effacer toutes les habitudes et tout l\'historique ? C\'est définitif.')) {
        for (const h of [...state.habits]) removeHabit(h.id);
        state.log = {}; state.stamps = {}; state.orderAt = Date.now();
        save(); render(); close();
      }
    });
  });
}

async function exportData() {
  const name = `habits-${key(today())}.json`;
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'Sauvegarde Habits' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================================================
   Synchro via un gist GitHub privé
   ========================================================= */
const SYNC_KEY = 'habits.sync';
const GIST_FILE = 'habits.json';
const GIST_DESC = 'Habits — synchronisation';
let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })();
let syncTimer = null, syncing = false, syncAgain = false;

function saveSync() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) {} }
function scheduleSync(delay = 1500) {
  if (!sync.token) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay);
}

/** Fusionne deux états : pour chaque case et chaque habitude, la modification la plus récente gagne. */
function merge(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, t);
  const hs = new Map();
  for (const h of [...a.habits, ...b.habits]) {
    const cur = hs.get(h.id);
    if (!cur || h.updatedAt > cur.updatedAt) hs.set(h.id, h);
  }
  for (const [id, h] of hs) if (deleted[id] != null && deleted[id] >= h.updatedAt) hs.delete(id);
  const [first, second] = b.orderAt > a.orderAt ? [b, a] : [a, b];
  const order = [...first.habits, ...second.habits].map(h => h.id).filter((id, i, arr) => arr.indexOf(id) === i && hs.has(id));

  const keys = new Set([...Object.keys(a.stamps), ...Object.keys(b.stamps)]);
  for (const s of [a, b]) for (const k in s.log) for (const id in s.log[k]) keys.add(`${k}|${id}`);
  const log = {}, stamps = {};
  for (const sk of keys) {
    const [k, id] = sk.split('|');
    if (!hs.has(id)) continue;
    const ta = a.stamps[sk] || 0, tb = b.stamps[sk] || 0;
    const va = a.log[k]?.[id], vb = b.log[k]?.[id];
    const [v, t] = ta > tb ? [va, ta] : tb > ta ? [vb, tb] : [va !== undefined ? va : vb, ta];
    if (t) stamps[sk] = t;
    if (v !== undefined) (log[k] ||= {})[id] = v;
  }
  return { v: 2, habits: order.map(id => hs.get(id)), log, stamps, deleted, orderAt: Math.max(a.orderAt, b.orderAt) };
}

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + sync.token, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'Token invalide ou expiré' : r.status === 404 ? 'Gist introuvable (droit « gist » manquant ?)' : `Erreur GitHub ${r.status}`);
  return r.json();
}
/** Retrouve le gist créé par un autre appareil, ou en crée un. */
async function findOrCreateGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const g = list.find(g => g.description === GIST_DESC && g.files[GIST_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(state) } } }) });
  return g.id;
}

async function syncNow() {
  if (!sync.token) return;
  if (syncing) { syncAgain = true; return; }
  clearTimeout(syncTimer);
  syncing = true; drawSyncBox();
  try {
    if (!sync.gistId) { sync.gistId = await findOrCreateGist(); saveSync(); }
    const g = await gh('/gists/' + sync.gistId);
    const f = g.files[GIST_FILE];
    let remote = emptyState();
    if (f) remote = normalize(JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content));
    const merged = merge(state, remote);
    const out = JSON.stringify(merged);
    if (out !== JSON.stringify(state)) { state = merged; persist(); render(); }
    if (out !== JSON.stringify(remote)) {
      await gh('/gists/' + sync.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content: out } } }) });
    }
    sync.last = Date.now(); sync.error = null;
  } catch (e) {
    sync.error = e instanceof TypeError ? 'Hors ligne' : e.message;
  } finally {
    syncing = false; saveSync(); drawSyncBox();
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

function drawSyncBox() {
  const box = document.getElementById('sync-box');
  if (!box) return;
  if (!sync.token) {
    box.innerHTML = `
      <p class="note" style="margin-top:0">Synchronise tes habitudes entre ton iPhone et ton Mac via un gist privé de ton compte GitHub.</p>
      <p class="note">1. <a href="https://github.com/settings/tokens/new?scopes=gist&description=Habits%20sync" target="_blank" rel="noopener">Crée un token GitHub</a> avec uniquement le droit « gist ».<br>2. Colle-le ici, sur chaque appareil.</p>
      <input class="text" id="f-token" type="password" placeholder="ghp_…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn accent" data-a="sync-connect">Connecter</button>`;
    return;
  }
  const time = sync.last ? new Date(sync.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const st = syncing ? '<span class="sync-dot busy"></span>Synchronisation…'
    : sync.error ? `<span class="sync-dot err"></span>${esc(sync.error)}`
    : time ? `<span class="sync-dot ok"></span>Synchronisé à ${time}` : '<span class="sync-dot"></span>En attente';
  box.innerHTML = `
    <div class="sync-status">${st}</div>
    <div class="order"><button class="btn" data-a="sync-now">Synchroniser</button><button class="btn danger" data-a="sync-off">Déconnecter</button></div>`;
}

/* ---------- Thème (par appareil, non synchronisé) ---------- */
const THEME_KEY = 'habits.theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch (e) {}
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  applyThemeColor();
}
/** Aligne la couleur de la barre système sur le thème effectif. */
function applyThemeColor() {
  const t = getTheme();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.media) m.dataset.media = m.media;
    m.media = t === 'auto' ? m.dataset.media : (m.dataset.media.includes(t) ? '' : 'not all');
  });
}
function drawThemeSeg() {
  const el = document.getElementById('theme-seg');
  if (!el) return;
  const t = getTheme();
  el.innerHTML = [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]
    .map(([v, l]) => `<button data-a="theme" data-v="${v}" class="${t === v ? 'sel' : ''}">${l}</button>`).join('');
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
function $(s) { return document.querySelector(s); }

/* ---------- Boot ---------- */
let lastDay = key(today());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (key(today()) !== lastDay) { lastDay = key(today()); render(); }
    syncNow();
  } else if (syncTimer) syncNow(); // on part : envoie ce qui reste en attente
});
applyThemeColor();
render();
syncNow();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBb6nTYnuhG6W8kxDqPGrFOcrZWfqJZ-uw",
  authDomain: "dl-padel.firebaseapp.com",
  projectId: "dl-padel",
  storageBucket: "dl-padel.firebasestorage.app",
  messagingSenderId: "591938588680",
  appId: "1:591938588680:web:d21b2b80421910c6c841bd"
};

const SITE = "DL Padel";
const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);
const auth = getAuth(fb);
getRedirectResult(auth).catch(() => {});

const app = document.getElementById("app");

// ---------- State ----------
const S = {
  players: {}, comps: {}, playersReady: false, compsReady: false, loadError: null,
  user: null, isAdmin: false, authReady: false,
  draft: null, draftId: null, dirty: false, pending: null, notice: null, saving: false,
};

onSnapshot(collection(db, "players"), snap => {
  S.players = {}; snap.forEach(d => S.players[d.id] = d.data());
  S.playersReady = true; onData("players");
}, err => { S.loadError = err; render(); });

onSnapshot(collection(db, "comps"), snap => {
  S.comps = {}; snap.forEach(d => S.comps[d.id] = d.data());
  S.compsReady = true; onData("comps");
}, err => { S.loadError = err; render(); });

let adminUnsub = null;
onAuthStateChanged(auth, user => {
  S.user = user; S.isAdmin = false; S.adminChecked = false; S.adminError = null;
  if (adminUnsub) { adminUnsub(); adminUnsub = null; }
  if (user && user.email) {
    // A live listener retries on its own when the connection is slow or drops.
    adminUnsub = onSnapshot(doc(db, "admins", user.email.toLowerCase()),
      snap => { S.isAdmin = snap.exists(); S.adminChecked = true; S.adminError = null; render(); },
      err => { S.adminError = err; S.adminChecked = true; render(); });
  } else S.adminChecked = true;
  S.authReady = true; render();
});

function onData(kind) {
  const r = route();
  // Don't overwrite an admin's unsaved edits with incoming data.
  if (r.name === "editComp" && S.draft) { if (kind === "players") render(); return; }
  render();
}

// ---------- Helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const pname = id => (id && S.players[id]?.name) || "";
const played = m => m.sa !== null && m.sb !== null && m.sa !== undefined && m.sb !== undefined && m.sa !== "" && m.sb !== "";
const playersOf = t => [pname(t.p1), pname(t.p2)].filter(Boolean).join(" & ");
const teamName = t => (t?.name || "").trim() || playersOf(t) || ("Team " + String(t?.id || "").replace(/\D/g, ""));
const teamById = (c, id) => c.teams.find(t => t.id === id) || { name: "?" };
const roundsOf = c => c.matches.reduce((mx, m) => Math.max(mx, m.round), 0);
const courtCount = c => Math.floor(c.teams.length / 2);
function roundTime(c, r) {
  const [h, m] = (c.start || "00:00").split(":").map(Number);
  let mins = (h || 0) * 60 + (m || 0) + (r - 1) * ((+c.gameMins || 30) + (+c.breakMins || 0));
  mins = ((mins % 1440) + 1440) % 1440;
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}
function fmtDate(d, long) {
  if (!d) return "";
  const x = new Date(d + "T12:00:00");
  if (isNaN(x)) return d;
  return x.toLocaleDateString("en-GB", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
// Header format: "Sun, 27 Sept | 8am"
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
function fmtTime12(t) {
  const [h, m] = (t || "").split(":").map(Number);
  if (isNaN(h)) return "";
  const suf = h < 12 ? "am" : "pm", h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suf}` : `${h12}${suf}`;
}
function headerWhen(c) {
  const x = c.date ? new Date(c.date + "T12:00:00") : null;
  const day = x && !isNaN(x) ? `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]}` : "";
  return [day, fmtTime12(c.start)].filter(Boolean).join(" | ");
}
function headerWhenHtml(c) {
  const x = c.date ? new Date(c.date + "T12:00:00") : null;
  const day = x && !isNaN(x) ? `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]}` : "", time = fmtTime12(c.start);
  const parts = [];
  if (day) parts.push(`<span class="when-i"><span class="ms" aria-hidden="true">calendar_today</span>${esc(day)}</span>`);
  if (time) parts.push(`<span class="when-i"><span class="ms" aria-hidden="true">schedule</span>${esc(time)}</span>`);
  return `<span class="when">${parts.join("")}</span>`;
}
// Date, time and team count, shared by homepage cards and the competition header.
function detailsHtml(c) {
  const x = c.date ? new Date(c.date + "T12:00:00") : null;
  const day = x && !isNaN(x) ? `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]}` : "Date to be set", time = fmtTime12(c.start);
  const line = (icon, text) => `<span class="card-line"><span class="ms" aria-hidden="true">${icon}</span>${esc(text)}</span>`;
  return `<div class="card-lines">${line("calendar_today", day)}${time ? line("schedule", time) : ""}${line("group", `${c.teams.length} teams`)}</div>`;
}
function status(c) {
  const n = c.matches.filter(played).length;
  if (n && n === c.matches.length) return "done";
  if (n) return "live";
  return "upcoming";
}
const statusLabel = { live: "Live", upcoming: "Upcoming", done: "Finished" };

// Circle-method round robin; courts rotate each round.
// The club's whiteboard running order. Each round lists court 1, 2, 3 as [team, team] using team numbers.
const CLUB_ORDER = {
  4: [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]],
  6: [[[1, 2], [3, 4], [5, 6]], [[2, 5], [1, 3], [4, 6]], [[3, 5], [2, 6], [1, 4]], [[2, 4], [1, 5], [3, 6]], [[1, 6], [4, 5], [2, 3]]],
};
function buildMatches(teams) {
  const order = CLUB_ORDER[teams.length];
  if (order) {
    const out = [];
    order.forEach((round, r) => round.forEach(([a, b], ci) => out.push({ id: `m${r + 1}-${ci + 1}`, round: r + 1, court: ci + 1, a: teams[a - 1].id, b: teams[b - 1].id, sa: null, sb: null })));
    return out;
  }
  return buildCircle(teams);
}
function buildCircle(teams) {
  const ids = teams.map(t => t.id);
  if (ids.length < 2) return [];
  if (ids.length % 2) ids.push(null);
  const m = ids.length, out = [];
  let arr = ids.slice();
  for (let r = 0; r < m - 1; r++) {
    const real = [];
    for (let i = 0; i < m / 2; i++) {
      let a = arr[i], b = arr[m - 1 - i];
      if (a && b) { if (r % 2 && i === 0) [a, b] = [b, a]; real.push([a, b]); }
    }
    real.forEach((p, j) => {
      const court = ((j + r) % real.length) + 1;
      out.push({ id: `m${r + 1}-${court}`, round: r + 1, court, a: p[0], b: p[1], sa: null, sb: null });
    });
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  return out;
}

// Ranking: wins, then games won, then games difference.
function standings(c) {
  const rows = {};
  c.teams.forEach(t => rows[t.id] = { t, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, form: [] });
  c.matches.slice().sort((a, b) => a.round - b.round || a.court - b.court).forEach(m => {
    if (!played(m) || !rows[m.a] || !rows[m.b]) return;
    const A = rows[m.a], B = rows[m.b], sa = +m.sa, sb = +m.sb;
    A.P++; B.P++; A.GF += sa; A.GA += sb; B.GF += sb; B.GA += sa;
    if (sa > sb) { A.W++; B.L++; A.form.push("W"); B.form.push("L"); }
    else if (sb > sa) { B.W++; A.L++; B.form.push("W"); A.form.push("L"); }
    else { A.D++; B.D++; A.form.push("D"); B.form.push("D"); }
  });
  return Object.values(rows).sort((a, b) => b.W - a.W || b.GF - a.GF || (b.GF - b.GA) - (a.GF - a.GA) || teamName(a.t).localeCompare(teamName(b.t)));
}
function streakOf(form) {
  if (!form.length) return null;
  const last = form[form.length - 1]; let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return n >= 2 && last === "W" ? `${n} in a row` : null;
}
function newTeams(n) { return Array.from({ length: n }, (_, i) => ({ id: "t" + (i + 1), name: "", p1: "", p2: "" })); }
function slugify(s) { return (s || "comp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "comp"; }
function sortedComps() {
  return Object.entries(S.comps).sort(([, a], [, b]) => (b.date || "").localeCompare(a.date || ""));
}

// ---------- Routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const p = h.split("/").map(decodeURIComponent);
  if (p[0] === "c" && p[1]) return { name: "comp", id: p[1] };
  if (p[0] === "admin" && p[1] === "c" && p[2]) return { name: "editComp", id: p[2] };
  if (p[0] === "admin") return { name: "admin" };
  return { name: "home" };
}
const go = h => { location.hash = h; };
let lastRoute = "";
addEventListener("hashchange", () => {
  if (S.dirty && lastRoute.startsWith("#/admin/c/") && location.hash !== lastRoute) {
    S.notice = { err: true, t: "You have unsaved changes. Save them or tap Discard first." };
    history.replaceState(null, "", lastRoute); render(); return;
  }
  S.draft = null; S.draftId = null; S.dirty = false; S.pending = null; S.notice = null;
  render(); scrollTo(0, 0);
});

// ---------- Rendering ----------
let spyHandler = null;
function render() {
  lastRoute = location.hash || "#/";
  if (spyHandler) { removeEventListener("scroll", spyHandler); spyHandler = null; }
  const r = route();
  if (S.loadError) return renderError();
  if (r.name === "comp") return renderComp(r.id);
  if (r.name === "admin") return renderAdmin();
  if (r.name === "editComp") return renderEditComp(r.id);
  return renderHome();
}
function renderError() {
  app.innerHTML = header(SITE, "", { back: false }) + `<main><div class="msg err">Couldn't load the competitions (${esc(S.loadError.code || S.loadError.message)}). If this is a new setup, the Firestore security rules still need publishing.</div></main>`;
  wire();
}

function header(title, sub, o = {}) {
  let h = `<header class="bar"><div class="bar-in">`;
  if (o.back) h += `<a class="icon-btn" href="${o.back}" aria-label="Back"><span class="ms">arrow_back</span></a>`;
  h += `<div class="bar-title"><h1>${title}</h1>${sub ? `<div class="bar-sub">${sub}</div>` : ""}</div>`;
  if (o.refresh) h += `<button class="icon-btn" id="refresh" aria-label="Refresh scores" title="Refresh scores"><span class="ms">refresh</span></button>`;
  if (o.admin) h += `<a class="icon-btn" href="${o.admin}" aria-label="Admin" title="Admin"><span class="ms">${S.isAdmin ? "edit_square" : "admin_panel_settings"}</span></a>`;
  return h + `</div></header>`;
}
function wire() {
  const r = document.getElementById("refresh");
  if (r) r.onclick = () => { r.classList.add("spin"); setTimeout(() => location.reload(), 250); };
}

// ----- Home -----
function renderHome() {
  document.title = SITE;
  if (!S.compsReady || !S.playersReady) { app.innerHTML = header(SITE, "") + `<div class="loading">Loading…</div>`; return; }
  const list = sortedComps();
  let h = header(SITE, "Competitions, fixtures and tables", { admin: "#/admin" }) + `<main>`;
  h += `<section><div class="sec-h"><h2>Competitions</h2><span>${list.length} so far</span></div>`;
  if (!list.length) h += `<div class="empty">No competitions yet. The first one appears here once an admin creates it.</div>`;
  else {
    const featured = list.find(([, c]) => status(c) === "live") || list.find(([, c]) => status(c) === "upcoming");
    h += `<div class="comp-list">` + list.map(([id, c]) => {
      const st = status(c), top = standings(c)[0];
      // One pill per card: winners when finished, otherwise the status.
      const pill = st === "done" && top
        ? `<span class="chip gold"><span class="ms" aria-hidden="true">trophy</span><span class="sr">Winners: </span>${esc(teamName(top.t))}</span>`
        : `<span class="chip ${st}">${statusLabel[st]}</span>`;
      return `<a class="comp-card st-${st}" href="#/c/${encodeURIComponent(id)}"><div class="card-main"><div class="chips">${pill}</div><h3>${esc(c.name)}</h3>${detailsHtml(c)}</div><span class="ms chev" aria-hidden="true">chevron_right</span></a>`;
    }).join("") + `</div>`;
  }
  h += `</section></main>`;
  app.innerHTML = h; wire();
}

// ----- Competition page -----
// Defending champions: a team with the same two players as the winners of
// the most recent finished competition dated before this one.
let DEFENDING = new Set();
function defendingTeamIds(c, selfId) {
  if (!c) return new Set();
  const prev = Object.entries(S.comps)
    .filter(([k, x]) => k !== selfId && x.date && status(x) === "done" && (!c.date || x.date < c.date))
    .sort(([, a], [, b]) => b.date.localeCompare(a.date))[0];
  if (!prev) return new Set();
  const top = standings(prev[1])[0];
  const key = t => [t.p1, t.p2].filter(Boolean).sort().join("|");
  const wk = top ? key(top.t) : "";
  if (!wk.includes("|")) return new Set();
  return new Set(c.teams.filter(t => key(t) === wk).map(t => t.id));
}
const crown = t => DEFENDING.has(t.id) ? '<span class="ms crown" role="img" aria-label="Defending champions" title="Defending champions">crown</span>' : "";

function matchCard(c, m) {
  const A = teamById(c, m.a), B = teamById(c, m.b), done = played(m), sa = +m.sa, sb = +m.sb;
  const side = (t, sc, o) => {
    const cls = !done ? "" : sc > o ? " won" : sc < o ? " lost" : "";
    const pl = (t.name || "").trim() ? playersOf(t) : "";
    return `<div class="side${cls}"><span class="nm">${esc(teamName(t))}${crown(t)}${pl ? `<small>${esc(pl)}</small>` : ""}</span>${done ? `<span class="sc num">${sc}</span>` : ""}</div>`;
  };
  return `<div class="match"><div class="court"><span><small>Court</small><b>${m.court}</b></span></div>${side(A, sa, sb)}${side(B, sb, sa)}</div>`;
}
function roundBlock(c, r, list, isNext) {
  return `<div class="round${isNext ? " next" : ""}"><div class="round-h">${isNext ? '<span class="chip upcoming">Up next</span>' : ""}<b>Round ${r}</b><span>·</span><span class="num">${roundTime(c, r)}</span></div>${list.map(m => matchCard(c, m)).join("")}</div>`;
}
function renderComp(id) {
  if (!S.compsReady || !S.playersReady) { app.innerHTML = header(SITE, "", { back: "#/" }) + `<div class="loading">Loading…</div>`; return; }
  const c = S.comps[id];
  if (!c) { app.innerHTML = header("Not found", "", { back: "#/" }) + `<main><div class="empty">This competition doesn't exist or has been deleted. <a href="#/">See all competitions</a></div></main>`; return; }
  document.title = `${c.name} · ${SITE}`;
  DEFENDING = defendingTeamIds(c, id);
  const st = standings(c), R = roundsOf(c), anyDraw = st.some(r => r.D > 0), playedCount = c.matches.filter(played).length;
  const byRound = {}; c.matches.forEach(m => (byRound[m.round] ||= []).push(m));
  Object.values(byRound).forEach(l => l.sort((a, b) => a.court - b.court));
  let nextR = 0; for (let r = 1; r <= R; r++) if (byRound[r]?.some(m => !played(m))) { nextR = r; break; }

  const sub = detailsHtml(c);
  let h = header(esc(c.name), sub, { back: "#/", refresh: true, admin: S.isAdmin ? `#/admin/c/${encodeURIComponent(id)}` : null }) + `<main class="has-nav">`;

  h += `<section id="table"><div class="sec-h"><h2>Table</h2><span>${playedCount} of ${c.matches.length} played</span></div><div class="card"><div class="tbl-wrap"><table><thead><tr><th></th><th class="l">Team</th><th>P</th><th>W</th>${anyDraw ? "<th>D</th>" : ""}<th>L</th><th title="Games won">GF</th><th title="Games lost">GA</th><th>Form</th></tr></thead><tbody>`;
  st.forEach((r, i) => {
    const pl = (r.t.name || "").trim() ? playersOf(r.t) : "";
    const form = r.form.length ? r.form.slice(-5).map(f => `<span class="fchip f${f}">${f}</span>`).join("") : `<span class="fnone">–</span>`;
    const champ = i === 0 && status(c) === "done";
    h += `<tr${champ ? ' class="champ"' : i === 0 && playedCount ? ' class="lead"' : ""}><td class="pos num">${champ ? '<span class="ms trophy" aria-label="Winners" title="Winners">trophy</span>' : i + 1}</td><td class="team l"><span class="tname">${esc(teamName(r.t))}</span>${crown(r.t)}${pl ? `<span class="tplayers">${esc(pl)}</span>` : ""}</td><td>${r.P}</td><td class="w">${r.W}</td>${anyDraw ? `<td>${r.D}</td>` : ""}<td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td><td><div class="form">${form}</div></td></tr>`;
  });
  h += `</tbody></table></div></div></section>`;

  h += `<section id="fixtures"><div class="sec-h"><h2>Fixtures</h2><span>${nextR ? `Round ${nextR} of ${R} next` : "Games still to play"}</span></div>`;
  let any = false;
  for (let r = 1; r <= R; r++) { const l = (byRound[r] || []).filter(m => !played(m)); if (l.length) { any = true; h += roundBlock(c, r, l, r === nextR); } }
  if (!any) h += `<div class="empty">All games played. Check the table for the final standings.</div>`;
  h += `</section>`;

  h += `<section id="results"><div class="sec-h"><h2>Results</h2><span>Latest first</span></div>`;
  any = false;
  for (let r = R; r >= 1; r--) { const l = (byRound[r] || []).filter(played); if (l.length) { any = true; h += roundBlock(c, r, l); } }
  if (!any) h += `<div class="empty">No scores yet. Results appear here as soon as they are entered.</div>`;

  h += `</section></main>`;

  const nav = (t, icon, label) => `<button data-t="${t}"><span class="pill"><span class="ms" aria-hidden="true">${icon}</span></span>${label}</button>`;
  h += `<nav class="nav" aria-label="Sections"><div class="nav-in">${nav("table", "leaderboard", "Table")}${nav("fixtures", "calendar_month", "Fixtures")}${nav("results", "task_alt", "Results")}</div></nav>`;

  const y = scrollY;
  app.innerHTML = h; wire();
  scrollTo(0, y);
  const smooth = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  app.querySelectorAll(".nav button").forEach(b => b.onclick = () => document.getElementById(b.dataset.t)?.scrollIntoView({ behavior: smooth }));
  const ids = ["table", "fixtures", "results"];
  spyHandler = () => {
    let cur = "table";
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = "results";
    else ids.forEach(i => { const el = document.getElementById(i); if (el && el.getBoundingClientRect().top < 140) cur = i; });
    app.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.t === cur));
  };
  addEventListener("scroll", spyHandler, { passive: true }); spyHandler();
}

// ----- Admin -----
async function signIn() {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { S.notice = { err: true, t: `Sign-in failed (${e.code}).` }; render(); }
  }
}
function adminGate() {
  if (!S.authReady) return `<div class="loading">Checking sign-in…</div>`;
  if (!S.user) return `<div class="card signin"><p class="hint">Admins sign in with Google to add players, set up competitions and enter scores. On iPhone, use Safari.</p><button class="btn filled" id="signin"><span class="ms">login</span>Sign in with Google</button></div>`;
  if (!S.isAdmin && !S.adminChecked) return `<div class="loading">Checking admin access…</div>`;
  if (!S.isAdmin && S.adminError) return `<div class="card signin"><p>Couldn't check admin access (${esc(S.adminError.code || "connection problem")}).</p><p class="hint">This is usually a slow connection. Reload to try again.</p><button class="btn filled" id="reload"><span class="ms">refresh</span>Reload</button><button class="btn text" id="signout">Sign out</button></div>`;
  if (!S.isAdmin) return `<div class="card signin"><p>You're signed in as <b>${esc(S.user.email)}</b>, but this account isn't an admin.</p><p class="hint">Ask an existing admin to add your email to the admins list in Firebase.</p><button class="btn tonal" id="signout">Sign out</button></div>`;
  return null;
}
function wireGate() {
  const si = document.getElementById("signin"); if (si) si.onclick = signIn;
  const so = document.getElementById("signout"); if (so) so.onclick = () => signOut(auth);
  const rl = document.getElementById("reload"); if (rl) rl.onclick = () => location.reload();
}
// One-off import of a past competition from the group chat.
const PAST_IMPORTS = [{
  id: "september-2026", label: "Sunday 27 September 2026",
  comp: { name: "September 2026", date: "2026-09-27", start: "08:00", gameMins: 30, breakMins: 5 },
  teams: [["Cally", "Rodrigo"], ["Ben", "Jack"], ["Piers", "Nico"], ["Benji", "Andreas"]],
  // [round, court, teamA, teamB, gamesA, gamesB] using team numbers 1-4
  games: [[1, 1, 1, 2, 10, 2], [1, 2, 3, 4, 8, 5], [2, 1, 3, 1, 6, 6], [2, 2, 4, 2, 6, 7], [3, 1, 4, 1, 7, 6], [3, 2, 3, 2, 6, 5]],
}];
async function importPast(imp) {
  const idByName = {};
  Object.entries(S.players).forEach(([id, p]) => idByName[p.name.toLowerCase()] = id);
  for (const name of new Set(imp.teams.flat())) {
    if (!idByName[name.toLowerCase()]) {
      const ref = await addDoc(collection(db, "players"), { name, createdAt: serverTimestamp() });
      idByName[name.toLowerCase()] = ref.id;
    }
  }
  const teams = imp.teams.map((pair, i) => ({ id: "t" + (i + 1), name: "", p1: idByName[pair[0].toLowerCase()], p2: idByName[pair[1].toLowerCase()] }));
  const matches = imp.games.map(([round, court, a, b, sa, sb]) => ({ id: `m${round}-${court}`, round, court, a: "t" + a, b: "t" + b, sa, sb }));
  await setDoc(doc(db, "comps", imp.id), { ...imp.comp, teams, matches, updatedAt: serverTimestamp() });
}

function renderAdmin() {
  document.title = `Admin · ${SITE}`;
  let h = header("Admin", S.user ? esc(S.user.email) : SITE, { back: "#/" }) + `<main class="admin">`;
  if (S.notice) h += `<div class="msg${S.notice.err ? " err" : ""}">${esc(S.notice.t)}</div>`;
  const gate = adminGate();
  if (gate) { app.innerHTML = h + gate + `</main>`; wire(); wireGate(); return; }

  const comps = sortedComps();
  PAST_IMPORTS.filter(imp => !S.comps[imp.id]).forEach(imp => {
    h += `<section><div class="card"><p><b>Past competition ready to add</b></p><p class="hint">${esc(imp.label)} · ${imp.teams.length} teams · ${imp.games.length} games with scores. Players are added to the list if they're new.</p><button class="btn filled" data-import="${imp.id}" style="align-self:flex-start"><span class="ms">download</span>Import ${esc(imp.comp.name)}</button></div></section>`;
  });
  h += `<section><div class="sec-h"><h2>Competitions</h2></div><div class="card"><a class="btn filled" href="#/admin/c/new" style="align-self:flex-start"><span class="ms">add</span>New competition</a><div class="alist">`;
  h += comps.map(([id, c]) => `<a href="#/admin/c/${encodeURIComponent(id)}"><span class="t"><b>${esc(c.name)}</b><small>${esc(fmtDate(c.date)) || "No date"} · ${statusLabel[status(c)]}</small></span><span class="ms">edit</span></a>`).join("") || `<p class="hint">No competitions yet.</p>`;
  h += `</div></div></section>`;

  const plist = Object.entries(S.players).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  h += `<section><div class="sec-h"><h2>Players</h2><span>${plist.length}</span></div><div class="card">`;
  h += `<form class="row" id="addp"><div class="field"><label for="newp">New player</label><input id="newp" placeholder="Name" autocomplete="off" required></div><button class="btn filled" type="submit"><span class="ms">person_add</span>Add</button></form>`;
  h += `<div class="plist">` + plist.map(([id, p]) => `<div class="row"><div class="field"><input id="pn-${id}" data-p="${id}" value="${esc(p.name)}" aria-label="Player name" autocomplete="off"></div></div>`).join("") + `</div>`;
  h += `<p class="hint">Edit a name to fix a typo. It updates everywhere, including past competitions.</p></div></section>`;

  h += `<section><div class="card"><button class="btn tonal" id="signout" style="align-self:flex-start"><span class="ms">logout</span>Sign out</button></div></section></main>`;
  app.innerHTML = h; wire(); wireGate();

  app.querySelectorAll("button[data-import]").forEach(b => b.onclick = async () => {
    const imp = PAST_IMPORTS.find(x => x.id === b.dataset.import);
    b.disabled = true; b.textContent = "Importing…";
    try { await importPast(imp); S.notice = { t: `${imp.comp.name} imported. Check it on the homepage.` }; }
    catch (err) { S.notice = { err: true, t: `Couldn't import (${err.code || err.message}).` }; }
    render();
  });
  document.getElementById("addp").onsubmit = async e => {
    e.preventDefault();
    const inp = document.getElementById("newp"), name = inp.value.trim();
    if (!name) return;
    if (Object.values(S.players).some(p => p.name.toLowerCase() === name.toLowerCase())) { S.notice = { err: true, t: `${name} is already in the player list.` }; render(); return; }
    try { await addDoc(collection(db, "players"), { name, createdAt: serverTimestamp() }); S.notice = { t: `Added ${name}.` }; }
    catch (err) { S.notice = { err: true, t: `Couldn't add player (${err.code}).` }; render(); }
  };
  app.querySelectorAll("input[data-p]").forEach(inp => inp.onchange = async () => {
    const name = inp.value.trim(); if (!name) { inp.value = S.players[inp.dataset.p].name; return; }
    try { await updateDoc(doc(db, "players", inp.dataset.p), { name }); }
    catch (err) { S.notice = { err: true, t: `Couldn't rename (${err.code}).` }; render(); }
  });
}

// ----- Competition editor -----
function playerSelect(id, val) {
  const opts = Object.entries(S.players).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  return `<select id="${id}">${`<option value="">Choose player</option>`}${opts.map(([pid, p]) => `<option value="${pid}"${pid === val ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
}
function renderEditComp(id) {
  let h = header(id === "new" ? "New competition" : "Edit competition", "", { back: "#/admin" }) + `<main class="admin has-save">`;
  const gate = adminGate();
  if (gate) { app.innerHTML = h + gate + `</main>`; wire(); wireGate(); return; }
  if (!S.compsReady || !S.playersReady) { app.innerHTML = h + `<div class="loading">Loading…</div></main>`; return; }

  if (!S.draft || S.draftId !== id) {
    if (id === "new") {
      const teams = newTeams(6);
      S.draft = { name: new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }), date: "", start: "18:00", gameMins: 30, breakMins: 5, teams, matches: buildMatches(teams) };
    } else if (S.comps[id]) S.draft = clone(S.comps[id]);
    else { app.innerHTML = h + `<div class="empty">This competition doesn't exist. <a href="#/admin">Back to admin</a></div></main>`; return; }
    S.draftId = id;
  }
  const d = S.draft, R = roundsOf(d), scored = d.matches.filter(played).length;
  const sc = window.scrollY;
  if (S.notice) h += `<div class="msg${S.notice.err ? " err" : ""}">${esc(S.notice.t)}</div>`;

  // Details
  h += `<section><div class="sec-h"><h2>Details</h2></div><div class="card">
    <div class="field"><label for="d-name">Competition name</label><input id="d-name" data-d="name" value="${esc(d.name)}"></div>
    <div class="row"><div class="field"><label for="d-date">Date</label><input type="date" id="d-date" data-d="date" value="${esc(d.date)}"></div>
    <div class="field"><label for="d-start">Start time</label><input type="time" id="d-start" data-d="start" value="${esc(d.start)}"></div></div>
    <div class="row"><div class="field"><label for="d-game">Game length (min)</label><input type="number" inputmode="numeric" id="d-game" data-d="gameMins" value="${d.gameMins}"></div>
    <div class="field"><label for="d-break">Break (min)</label><input type="number" inputmode="numeric" id="d-break" data-d="breakMins" value="${d.breakMins}"></div></div>
    <p class="hint">Round times: ${Array.from({ length: R }, (_, i) => roundTime(d, i + 1)).join(", ")}</p></div></section>`;

  // Teams
  const n = d.teams.length;
  h += `<section><div class="sec-h"><h2>Teams</h2></div><div class="card">
    <div class="seg" role="group" aria-label="Number of teams">${[4, 6].map(k => `<button data-n="${k}" class="${n === k ? "on" : ""}">${n === k ? '<span class="ms" style="font-size:18px;width:18px">check</span>' : ""}${k} teams · ${k / 2} courts</button>`).join("")}</div>`;
  if (S.pending?.type === "count") h += `<div class="confirm"><p>Switching to ${S.pending.n} teams rebuilds every fixture and clears the ${scored} scores entered.</p><div class="row"><button class="btn danger" id="cf-yes">Switch and clear scores</button><button class="btn text" id="cf-no">Cancel</button></div></div>`;
  h += `<form class="row" id="addp"><div class="field"><label for="newp">Player not listed? Add them</label><input id="newp" placeholder="Name" autocomplete="off"></div><button class="btn tonal" type="submit"><span class="ms">person_add</span>Add</button></form>`;
  const defIds = defendingTeamIds(d, id); DEFENDING = defIds;
  d.teams.forEach((t, i) => {
    h += `<div class="team-ed"><h4>Team ${i + 1}${playersOf(t) ? " · " + esc(playersOf(t)) : ""}${defIds.has(t.id) ? " " + crown(t) + " Defending champions" : ""}</h4>
      <div class="row"><div class="field"><label for="p1-${t.id}">Player 1</label>${playerSelect("p1-" + t.id, t.p1)}</div>
      <div class="field"><label for="p2-${t.id}">Player 2</label>${playerSelect("p2-" + t.id, t.p2)}</div></div>
      <div class="field"><label for="tn-${t.id}">Team name (optional)</label><input id="tn-${t.id}" data-t="${t.id}" value="${esc(t.name)}" placeholder="Uses player names if empty" autocomplete="off"></div></div>`;
  });
  h += `<p class="hint">Number teams as on the whiteboard. Swap a player if someone drops out; fixtures and scores stay as they are.</p>`;
  h += S.pending?.type === "rebuild"
    ? `<div class="confirm"><p>Rebuild every fixture in the club order? This clears the ${scored} scores entered.</p><div class="row"><button class="btn danger" id="cf-yes">Rebuild and clear scores</button><button class="btn text" id="cf-no">Cancel</button></div></div>`
    : `<button class="btn tonal" id="rebuild" style="align-self:flex-start"><span class="ms">refresh</span>Rebuild fixtures</button>`;
  h += `</div></section>`;

  // Scores
  h += `<section><div class="sec-h"><h2>Scores</h2><span>Total games won</span></div><div class="card">`;
  for (let r = 1; r <= R; r++) {
    h += `<div class="sm-meta"><b>Round ${r}</b> · ${roundTime(d, r)}</div>`;
    d.matches.filter(m => m.round === r).sort((a, b) => a.court - b.court).forEach(m => {
      const A = teamName(teamById(d, m.a)), B = teamName(teamById(d, m.b));
      h += `<div class="sm"><span class="a" title="${esc(A)}">${esc(A)}</span>
        <input type="number" inputmode="numeric" min="0" max="99" id="sa-${m.id}" data-m="${m.id}" data-k="sa" value="${m.sa ?? ""}" aria-label="${esc(A)} games">
        <span class="dash">–</span>
        <input type="number" inputmode="numeric" min="0" max="99" id="sb-${m.id}" data-m="${m.id}" data-k="sb" value="${m.sb ?? ""}" aria-label="${esc(B)} games">
        <span class="b" title="${esc(B)}">${esc(B)}</span></div>`;
    });
  }
  h += `<p class="hint">Leave both boxes empty for a game not yet played.</p></div></section>`;

  if (id !== "new") {
    h += `<section><div class="sec-h"><h2>Delete</h2></div><div class="card">`;
    h += S.pending?.type === "delete"
      ? `<div class="confirm"><p>Delete ${esc(d.name)} and all its scores? Player stats from it will be lost.</p><div class="row"><button class="btn danger" id="cf-yes">Delete competition</button><button class="btn text" id="cf-no">Cancel</button></div></div>`
      : `<button class="btn danger" id="del" style="align-self:flex-start"><span class="ms">delete</span>Delete competition</button>`;
    h += `</div></section>`;
  }
  h += `</main><div class="savebar"><div class="savebar-in"><p id="sb-msg"></p><button class="btn text" id="discard">Discard</button><button class="btn filled" id="save"><span class="ms">cloud_upload</span>Save</button></div></div>`;
  app.innerHTML = h; wire(); scrollTo(0, sc);

  const markDirty = () => { S.dirty = true; updateSaveBar(); };
  app.querySelectorAll("input[data-d]").forEach(inp => {
    inp.oninput = () => { const k = inp.dataset.d; d[k] = (k === "gameMins" || k === "breakMins") ? (parseInt(inp.value, 10) || 0) : inp.value; markDirty(); };
    if (["start", "gameMins", "breakMins"].includes(inp.dataset.d)) inp.onchange = () => renderEditComp(id);
  });
  app.querySelectorAll("input[data-t]").forEach(inp => inp.oninput = () => { d.teams.find(t => t.id === inp.dataset.t).name = inp.value; markDirty(); });
  d.teams.forEach(t => ["p1", "p2"].forEach(k => {
    document.getElementById(`${k}-${t.id}`).onchange = e => { t[k] = e.target.value; markDirty(); renderEditComp(id); };
  }));
  app.querySelectorAll("input[data-m]").forEach(inp => inp.oninput = () => {
    const m = d.matches.find(x => x.id === inp.dataset.m), v = inp.value.trim();
    m[inp.dataset.k] = v === "" ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0)); markDirty();
  });
  app.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    const k = +b.dataset.n; if (k === d.teams.length) return;
    if (d.matches.some(played)) { S.pending = { type: "count", n: k }; renderEditComp(id); return; }
    setTeamCount(k); renderEditComp(id);
  });
  document.getElementById("addp").onsubmit = async e => {
    e.preventDefault();
    const name = document.getElementById("newp").value.trim(); if (!name) return;
    if (Object.values(S.players).some(p => p.name.toLowerCase() === name.toLowerCase())) { S.notice = { err: true, t: `${name} is already in the player list.` }; renderEditComp(id); return; }
    try { await addDoc(collection(db, "players"), { name, createdAt: serverTimestamp() }); S.notice = { t: `Added ${name}. Pick them from a player list below.` }; renderEditComp(id); }
    catch (err) { S.notice = { err: true, t: `Couldn't add player (${err.code}).` }; renderEditComp(id); }
  };
  const rb = document.getElementById("rebuild"); if (rb) rb.onclick = () => {
    if (d.matches.some(played)) { S.pending = { type: "rebuild" }; renderEditComp(id); return; }
    d.matches = buildMatches(d.teams); S.dirty = true; S.notice = { t: "Fixtures rebuilt in the club order. Tap Save to keep them." }; renderEditComp(id);
  };
  const del = document.getElementById("del"); if (del) del.onclick = () => { S.pending = { type: "delete" }; renderEditComp(id); };
  const yes = document.getElementById("cf-yes"); if (yes) yes.onclick = async () => {
    if (S.pending.type === "count") { setTeamCount(S.pending.n); renderEditComp(id); }
    else if (S.pending.type === "rebuild") { d.matches = buildMatches(d.teams); S.pending = null; S.dirty = true; S.notice = { t: "Fixtures rebuilt in the club order. Tap Save to keep them." }; renderEditComp(id); }
    else if (S.pending.type === "delete") {
      try { await deleteDoc(doc(db, "comps", id)); S.dirty = false; go("#/admin"); }
      catch (err) { S.pending = null; S.notice = { err: true, t: `Couldn't delete (${err.code}).` }; renderEditComp(id); }
    }
  };
  const no = document.getElementById("cf-no"); if (no) no.onclick = () => { S.pending = null; renderEditComp(id); };
  document.getElementById("discard").onclick = () => {
    if (id === "new") { S.dirty = false; go("#/admin"); return; }
    S.draft = null; S.dirty = false; S.pending = null; S.notice = null; renderEditComp(id);
  };
  document.getElementById("save").onclick = () => save(id);
  updateSaveBar();
}
function setTeamCount(n) {
  const d = S.draft, t = d.teams.slice(0, n);
  for (let i = t.length; i < n; i++) { let tid = "t" + (i + 1); while (t.some(x => x.id === tid)) tid += "x"; t.push({ id: tid, name: "", p1: "", p2: "" }); }
  d.teams = t; d.matches = buildMatches(t); S.pending = null; S.dirty = true;
}
function updateSaveBar() {
  const p = document.getElementById("sb-msg"), s = document.getElementById("save"), dc = document.getElementById("discard");
  if (!p) return;
  const isNew = S.draftId === "new";
  p.textContent = S.saving ? "Saving…" : S.dirty || isNew ? (isNew ? "Not created yet" : "Unsaved changes") : "Everything is saved";
  s.disabled = S.saving || !(S.dirty || isNew); dc.disabled = S.saving || !(S.dirty || isNew);
}
async function save(id) {
  const d = S.draft;
  if (!d.name.trim()) { S.notice = { err: true, t: "Give the competition a name before saving." }; renderEditComp(id); return; }
  S.saving = true; updateSaveBar();
  let targetId = id;
  if (id === "new") { targetId = slugify(d.name); while (S.comps[targetId]) targetId = slugify(d.name) + "-" + Math.random().toString(36).slice(2, 5); }
  try {
    await setDoc(doc(db, "comps", targetId), { ...d, updatedAt: serverTimestamp() });
    S.saving = false; S.dirty = false; S.notice = { t: "Saved. Everyone's screens update straight away." };
    if (id === "new") { S.draftId = targetId; history.replaceState(null, "", `#/admin/c/${encodeURIComponent(targetId)}`); }
    S.draft = null; renderEditComp(targetId);
  } catch (err) {
    S.saving = false; S.notice = { err: true, t: `Couldn't save (${err.code || err.message}). Check your connection and try again.` }; renderEditComp(id);
  }
}

render();

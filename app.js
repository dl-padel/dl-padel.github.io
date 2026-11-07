import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
  keepChamps: true,
  isScorer: false, scorerChecked: false,
  league: {}, leagueReady: false, leagueError: null, leagueShow: 30,
  ldraft: null, ldraftId: null, carry: null,
  scorers: null, scorersError: null,
};

onSnapshot(collection(db, "players"), snap => {
  S.players = {}; snap.forEach(d => S.players[d.id] = d.data());
  S.playersReady = true; onData("players");
}, err => { S.loadError = err; render(); });

onSnapshot(collection(db, "comps"), snap => {
  S.comps = {}; snap.forEach(d => S.comps[d.id] = d.data());
  S.compsReady = true; onData("comps");
}, err => { S.loadError = err; render(); });

let adminUnsub = null, scorerUnsub = null, scorersUnsub = null;
onAuthStateChanged(auth, user => {
  S.user = user; S.isAdmin = false; S.adminChecked = false; S.adminError = null;
  S.isScorer = false; S.scorerChecked = false;
  if (adminUnsub) { adminUnsub(); adminUnsub = null; }
  if (scorerUnsub) { scorerUnsub(); scorerUnsub = null; }
  if (scorersUnsub) { scorersUnsub(); scorersUnsub = null; S.scorers = null; }
  if (user && user.email) {
    const email = user.email.toLowerCase();
    // A live listener retries on its own when the connection is slow or drops.
    adminUnsub = onSnapshot(doc(db, "admins", email),
      snap => { S.isAdmin = snap.exists(); S.adminChecked = true; S.adminError = null; render(); },
      err => { S.adminError = err; S.adminChecked = true; render(); });
    // League scorers can add league matches but can't touch competitions.
    scorerUnsub = onSnapshot(doc(db, "scorers", email),
      snap => { S.isScorer = snap.exists(); S.scorerChecked = true; render(); },
      () => { S.isScorer = false; S.scorerChecked = true; render(); });
  } else { S.adminChecked = true; S.scorerChecked = true; }
  S.authReady = true; render();
});
const canScore = () => S.isAdmin || S.isScorer;

// League matches only load on pages that need them, so competition pages stay light.
let leagueUnsub = null;
function ensureLeague() {
  if (leagueUnsub) return;
  leagueUnsub = onSnapshot(collection(db, "league"), snap => {
    S.league = {}; snap.forEach(d => S.league[d.id] = d.data({ serverTimestamps: "estimate" }));
    S.leagueReady = true; S.leagueError = null; onData("league");
  }, err => { S.leagueError = err; S.leagueReady = true; render(); });
}
function ensureScorers() {
  if (scorersUnsub || !S.isAdmin) return;
  scorersUnsub = onSnapshot(collection(db, "scorers"), snap => {
    S.scorers = []; snap.forEach(d => S.scorers.push(d.id)); S.scorers.sort(); S.scorersError = null; render();
  }, err => { S.scorersError = err; S.scorers = []; render(); });
}

function onData(kind) {
  const r = route();
  // Don't overwrite an admin's unsaved edits with incoming data.
  if (r.name === "editComp" && S.draft) { if (kind === "players") render(); return; }
  if (r.name === "leagueEdit" && S.ldraft) { if (kind === "players") render(); return; }
  render();
}

// ---------- Helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const pname = id => (id && S.players[id]?.name) || "";
const played = m => m.sa !== null && m.sb !== null && m.sa !== undefined && m.sb !== undefined && m.sa !== "" && m.sb !== "";
const playersOf = t => [pname(t.p1), pname(t.p2)].filter(Boolean).join(" & ");
const teamName = t => playersOf(t) || ("Team " + String(t?.id || "").replace(/\D/g, ""));
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
  if (p[0] === "comps") return { name: "comps" };
  if (p[0] === "league" && p[1] === "add") return { name: "leagueEdit", id: "new" };
  if (p[0] === "league" && p[1] === "m" && p[2]) return { name: "leagueEdit", id: p[2] };
  if (p[0] === "league") return { name: "league" };
  if (p[0] === "p" && p[1]) return { name: "player", id: p[1] };
  if (p[0] === "admin" && p[1] === "c" && p[2]) return { name: "editComp", id: p[2] };
  if (p[0] === "admin") return { name: "admin" };
  return { name: "home" };
}
const go = h => { location.hash = h; };
let lastRoute = "";
addEventListener("hashchange", () => {
  if (S.dirty && /^#\/(admin\/c|league\/add|league\/m)\b/.test(lastRoute) && location.hash !== lastRoute) {
    S.notice = { err: true, t: "You have unsaved changes. Save them or tap Discard first." };
    history.replaceState(null, "", lastRoute); render(); return;
  }
  S.draft = null; S.draftId = null; S.ldraft = null; S.ldraftId = null; S.dirty = false; S.pending = null;
  S.notice = S.carry; S.carry = null; // a message meant for the next page, e.g. "Match saved"
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
  if (r.name === "comps") return renderComps();
  if (r.name === "admin") return renderAdmin();
  if (r.name === "editComp") return renderEditComp(r.id);
  if (r.name === "league") { ensureLeague(); return renderLeague(); }
  if (r.name === "leagueEdit") { ensureLeague(); return renderLeagueEdit(r.id); }
  if (r.name === "player") { ensureLeague(); return renderPlayer(r.id); }
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
  if (o.admin) h += `<a class="icon-btn" href="${o.admin}" aria-label="Admin" title="Admin"><span class="ms">edit_square</span></a>`;
  if (o.extra) h += o.extra;
  return h + `</div></header>`;
}
// Homepage hero: the club logo, centred. Replaces the top bar on the homepage.
let heroPlayed = false; // the logo animation plays once per visit, not on every live update
const hero = () => `<header class="hero"><h1 class="sr">${SITE}</h1><img src="logo.svg?v=2" alt="DL Padel" width="359" height="345"${heroPlayed ? "" : ' class="pre"'}></header>`;
// Subtle entrance built from the logo's parts, all at once: the court and lettering
// fade in together while the two green letters slide in from either side.
async function playHero() {
  if (heroPlayed) return;
  heroPlayed = true;
  const img = app.querySelector(".hero img");
  if (!img) return;
  const show = () => img.classList.remove("pre");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return show();
  try {
    const txt = await (await fetch(img.getAttribute("src"))).text();
    const svg = new DOMParser().parseFromString(txt, "image/svg+xml").documentElement;
    const paths = [...svg.querySelectorAll("path")];
    if (svg.nodeName !== "svg" || paths.length < 4 || !img.isConnected || !svg.animate) return show();
    svg.removeAttribute("width"); svg.removeAttribute("height");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "DL Padel");
    img.replaceWith(svg);
    const ease = "cubic-bezier(.2,.7,.2,1)", fill = "backwards";
    const [court, ...rest] = paths, right = rest.pop(), left = rest.pop();
    court.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: ease, fill });
    court.style.transformOrigin = "center"; court.style.transformBox = "fill-box";
    rest.forEach(p => p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: ease, fill }));
    left.animate([{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: ease, fill });
    right.animate([{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: ease, fill });
  } catch { show(); }
}
// Footer for public pages: WhatsApp group link, mock-serious small print and a quiet link to admin.
const WHATSAPP_URL = "https://chat.whatsapp.com/KwsMD6jcUIwKcm8NZJQboH"; // group invite link; keep "Approve new participants" on in WhatsApp
function footer(secret = { href: "#/admin", text: "Super secret admin area" }) {
  return `<footer class="foot"><hr>
<p>© ${new Date().getFullYear()} DL Padel. All rights reserved.</p>
<p>Results are final and binding, except when disputed loudly in the car park, or via WhatsApp. Any resemblance to professional padel is purely coincidental. No balls were harmed in the making of this site, though several were lost over the fence.</p>
<a class="wa" href="${WHATSAPP_URL}" target="_blank" rel="noopener"><img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="" width="20" height="20">Complaints department</a>
<a class="secret" href="${secret.href}">${secret.text}</a></footer>`;
}
function wire() {
  const r = document.getElementById("refresh");
  if (r) r.onclick = () => { r.classList.add("spin"); setTimeout(() => location.reload(), 250); };
}

// ----- Home: pick League or Competitions -----
function renderHome() {
  document.title = SITE;
  if (!S.compsReady || !S.playersReady) { app.innerHTML = hero() + `<div class="loading">Loading…</div>`; return; }
  const list = sortedComps(), n = list.length;
  const live = list.find(([, c]) => status(c) === "live");
  const next = list.filter(([, c]) => status(c) === "upcoming").sort(([, a], [, b]) => (a.date || "9").localeCompare(b.date || "9"))[0];
  const line = (icon, text) => `<span class="card-line"><span class="ms" aria-hidden="true">${icon}</span>${esc(text)}</span>`;
  const compPill = live ? `<span class="chip live">Live now</span>` : next ? `<span class="chip upcoming">Next: ${esc(shortDate(next[1].date) || "date to be set")}</span>` : "";
  let h = hero() + `<main><section><div class="sec-h"><h2>David Lloyd Advanced Padel</h2></div><div class="comp-list">`;
  h += `<a class="comp-card" href="#/league"><div class="card-main"><h3>League</h3><div class="card-lines">${line("sports_tennis", "Weekly matches")}${line("leaderboard", "Tables and player stats")}</div></div><span class="ms chev" aria-hidden="true">chevron_right</span></a>`;
  h += `<a class="comp-card" href="#/comps"><div class="card-main">${compPill ? `<div class="chips">${compPill}</div>` : ""}<h3>Competitions</h3><div class="card-lines">${line("trophy", `${n} competition${n === 1 ? "" : "s"}`)}</div></div><span class="ms chev" aria-hidden="true">chevron_right</span></a>`;
  h += `</div></section>${footer()}</main>`;
  const oldHero = heroPlayed && app.querySelector(".hero"); // keep the logo (and any running animation) across live redraws
  app.innerHTML = h;
  if (oldHero) app.querySelector(".hero").replaceWith(oldHero);
  wire(); playHero();
}
const shortDate = d => { const x = d ? new Date(d + "T12:00:00") : null; return x && !isNaN(x) ? `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]}` : ""; };

// ----- Competitions list -----
function renderComps() {
  document.title = `Competitions · ${SITE}`;
  let h = header("Competitions", "", { back: "#/" });
  if (!S.compsReady || !S.playersReady) { app.innerHTML = h + `<div class="loading">Loading…</div>`; return; }
  const list = sortedComps();
  h += `<main><section>`;
  if (!list.length) h += `<div class="empty">No competitions yet. The first one appears here once an admin creates it.</div>`;
  else {
    h += `<div class="comp-list">` + list.map(([id, c]) => {
      const st = status(c), top = standings(c)[0];
      // One pill per card: winners when finished, otherwise the status.
      const pill = st === "done" && top
        ? `<span class="chip gold"><span class="ms" aria-hidden="true">trophy</span><span class="sr">Winners: </span>${esc(teamName(top.t))}</span>`
        : `<span class="chip ${st}">${statusLabel[st]}</span>`;
      return `<a class="comp-card st-${st}" href="#/c/${encodeURIComponent(id)}"><div class="card-main"><div class="chips">${pill}</div><h3>${esc(c.name)}</h3>${detailsHtml(c)}</div><span class="ms chev" aria-hidden="true">chevron_right</span></a>`;
    }).join("") + `</div>`;
  }
  h += `</section>${footer()}</main>`;
  app.innerHTML = h; wire();
}

// ----- Competition page -----
// Defending champions: a team with the same two players as the winners of
// the most recent finished competition dated before this one.
let DEFENDING = new Set();
const pairKey = t => [t.p1, t.p2].filter(Boolean).sort().join("|");
// The two players who won that competition, as "id1|id2", or "".
function prevWinnersKey(c, selfId) {
  if (!c) return "";
  const prev = Object.entries(S.comps)
    .filter(([k, x]) => k !== selfId && x.date && status(x) === "done" && (!c.date || x.date < c.date))
    .sort(([, a], [, b]) => b.date.localeCompare(a.date))[0];
  const top = prev && standings(prev[1])[0];
  const wk = top ? pairKey(top.t) : "";
  return wk.includes("|") ? wk : "";
}
function defendingTeamIds(c, selfId) {
  const wk = prevWinnersKey(c, selfId);
  return new Set(wk ? c.teams.filter(t => pairKey(t) === wk).map(t => t.id) : []);
}
const crown = t => DEFENDING.has(t.id) ? '<span class="ms crown" role="img" aria-label="Defending champions" title="Defending champions">crown</span>' : "";

// A match is two table rows: court (spanning both), then each team with its score.
function matchRows(c, m) {
  const A = teamById(c, m.a), B = teamById(c, m.b), done = played(m), sa = +m.sa, sb = +m.sb;
  const row = (t, sc, o, first) => {
    const cls = [first ? "m1" : "m2", !done ? "" : sc > o ? "won" : sc < o ? "lost" : ""].filter(Boolean).join(" ");
    return `<tr class="${cls}">${first ? `<td class="fx-court" rowspan="2"><small>Court</small><b class="num">${m.court}</b></td>` : ""}<td class="l fx-team"><span class="nm">${esc(teamName(t))}${crown(t)}</span></td><td class="fx-sc num">${done ? sc : ""}</td></tr>`;
  };
  return row(A, sa, sb, true) + row(B, sb, sa, false);
}
function roundBlock(c, r, list, isNext) {
  return `<div class="round${isNext ? " next" : ""}"><div class="round-h">${isNext ? '<span class="chip upcoming">Up next</span>' : ""}<b>Round ${r}</b><span>·</span><span class="num">${roundTime(c, r)}</span></div><div class="card"><table class="fx"><colgroup><col class="c-court"><col><col class="c-sc"></colgroup><tbody>${list.map(m => matchRows(c, m)).join("")}</tbody></table></div></div>`;
}
function renderComp(id) {
  if (!S.compsReady || !S.playersReady) { app.innerHTML = header(SITE, "", { back: "#/comps" }) + `<div class="loading">Loading…</div>`; return; }
  const c = S.comps[id];
  if (!c) { app.innerHTML = header("Not found", "", { back: "#/comps" }) + `<main><div class="empty">This competition doesn't exist or has been deleted. <a href="#/comps">See all competitions</a></div></main>`; return; }
  document.title = `${c.name} · ${SITE}`;
  DEFENDING = defendingTeamIds(c, id);
  const st = standings(c), R = roundsOf(c), anyDraw = st.some(r => r.D > 0), playedCount = c.matches.filter(played).length;
  const byRound = {}; c.matches.forEach(m => (byRound[m.round] ||= []).push(m));
  Object.values(byRound).forEach(l => l.sort((a, b) => a.court - b.court));
  let nextR = 0; for (let r = 1; r <= R; r++) if (byRound[r]?.some(m => !played(m))) { nextR = r; break; }

  const sub = detailsHtml(c);
  let h = header(esc(c.name), sub, { back: "#/comps", refresh: true, admin: S.isAdmin ? `#/admin/c/${encodeURIComponent(id)}` : null }) + `<main class="has-nav">`;

  h += `<section id="table"><div class="sec-h"><h2>Table</h2><span>${playedCount} of ${c.matches.length} played</span></div><div class="card"><div class="tbl-wrap"><table><thead><tr><th></th><th class="l">Team</th><th>P</th><th>W</th>${anyDraw ? "<th>D</th>" : ""}<th>L</th><th title="Games won">GF</th><th title="Games lost">GA</th><th class="l">Form</th></tr></thead><tbody>`;
  st.forEach((r, i) => {
    const form = r.form.length ? r.form.slice(-5).map(f => { const lab = { W: "Win", L: "Loss", D: "Draw" }[f] || f; return `<span class="fchip f${f}" role="img" aria-label="${lab}" title="${lab}"></span>`; }).join("") : `<span class="fnone">–</span>`;
    const champ = i === 0 && status(c) === "done";
    h += `<tr${champ ? ' class="champ"' : i === 0 && playedCount ? ' class="lead"' : ""}><td class="pos num">${champ ? '<span class="ms trophy" aria-label="Winners" title="Winners">trophy</span>' : i + 1}</td><td class="team l"><span class="tname">${esc(teamName(r.t))}</span>${crown(r.t)}</td><td>${r.P}</td><td class="w">${r.W}</td>${anyDraw ? `<td>${r.D}</td>` : ""}<td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td><td class="l"><div class="form">${form}</div></td></tr>`;
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

  h += `</section>${footer()}</main>`;

  const tabs = [["table", "leaderboard", "Table"], ["fixtures", "calendar_month", "Fixtures"], ["results", "event_available", "Results"]];
  h += sectionNav(tabs);
  const y = scrollY;
  app.innerHTML = h; wire();
  scrollTo(0, y);
  wireSectionNav(tabs);
}
// Sticky bottom nav that scrolls to page sections and highlights the one in view.
function sectionNav(tabs) {
  const nav = ([t, icon, label]) => `<button data-t="${t}"><span class="pill"><span class="ms" aria-hidden="true">${icon}</span></span>${label}</button>`;
  return `<nav class="nav" aria-label="Sections"><div class="nav-in">${tabs.map(nav).join("")}</div></nav>`;
}
function wireSectionNav(tabs) {
  const smooth = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  app.querySelectorAll(".nav button").forEach(b => b.onclick = () => document.getElementById(b.dataset.t)?.scrollIntoView({ behavior: smooth }));
  const ids = tabs.map(t => t[0]);
  spyHandler = () => {
    let cur = ids[0];
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = ids[ids.length - 1];
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
function renderAdmin() {
  document.title = `Admin · ${SITE}`;
  let h = header("Admin", S.user ? esc(S.user.email) : SITE, { back: "#/" }) + `<main class="admin">`;
  if (S.notice) h += `<div class="msg${S.notice.err ? " err" : ""}">${esc(S.notice.t)}</div>`;
  const gate = adminGate();
  if (gate) { app.innerHTML = h + gate + `</main>`; wire(); wireGate(); return; }

  const comps = sortedComps();
  h += `<section><div class="sec-h"><h2>Competitions</h2></div><div class="card"><a class="btn filled" href="#/admin/c/new" style="align-self:flex-start"><span class="ms">add</span>New competition</a><div class="alist">`;
  h += comps.map(([id, c]) => `<a href="#/admin/c/${encodeURIComponent(id)}"><span class="t"><b>${esc(c.name)}</b><small>${esc(fmtDate(c.date)) || "No date"} · ${statusLabel[status(c)]}</small></span><span class="ms">edit</span></a>`).join("") || `<p class="hint">No competitions yet.</p>`;
  h += `</div></div></section>`;

  const plist = Object.entries(S.players).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  h += `<section><div class="sec-h"><h2>Players</h2><span>${plist.length}</span></div><div class="card">`;
  h += `<form class="row" id="addp"><div class="field"><label for="newp">New player</label><input id="newp" placeholder="Name" autocomplete="off" required></div><button class="btn filled" type="submit"><span class="ms">person_add</span>Add</button></form>`;
  h += `<div class="plist">` + plist.map(([id, p]) => `<div class="row"><div class="field"><input id="pn-${id}" data-p="${id}" value="${esc(p.name)}" aria-label="Player name" autocomplete="off"></div></div>`).join("") + `</div>`;
  h += `<p class="hint">Edit a name to fix a typo. It updates everywhere, including past competitions.</p></div></section>`;

  ensureScorers();
  h += `<section><div class="sec-h"><h2>League scorers</h2>${S.scorers ? `<span>${S.scorers.length}</span>` : ""}</div><div class="card">`;
  h += `<p class="hint">Scorers can add and edit league matches (and add new players) but can't change competitions. Admins can do both. Add the Google email they'll sign in with.</p>`;
  h += `<form class="row" id="adds"><div class="field"><label for="news">Email</label><input id="news" type="email" placeholder="name@gmail.com" autocomplete="off" autocapitalize="off" required></div><button class="btn filled" type="submit"><span class="ms">person_add</span>Add</button></form>`;
  if (S.scorersError) h += `<p class="hint">Couldn't load scorers (${esc(S.scorersError.code || "error")}). The Firestore rules may need publishing.</p>`;
  else if (!S.scorers) h += `<p class="hint">Loading…</p>`;
  else h += `<div class="alist">` + (S.scorers.map(e => `<div class="arow"><span class="t">${esc(e)}</span><button class="icon-btn" data-rm="${esc(e)}" aria-label="Remove ${esc(e)}" title="Remove"><span class="ms">delete</span></button></div>`).join("") || `<p class="hint">No scorers yet.</p>`) + `</div>`;
  h += `</div></section>`;

  ensureLeague();
  const nSample = sampleIds().length, nPlayers = Object.keys(S.players).length;
  h += `<section><div class="sec-h"><h2>League sample data</h2></div><div class="card">`;
  if (!S.leagueReady) h += `<p class="hint">Loading…</p>`;
  else if (S.leagueError) h += `<p class="hint">Couldn't load the league (${esc(S.leagueError.code || "error")}).</p>`;
  else if (nSample) h += `<p class="hint">${nSample} made-up matches are in the league, with a banner saying so. Remove them before real matches start. Real matches aren't touched.</p><button class="btn danger" id="rmsample" style="align-self:flex-start"><span class="ms">delete</span>Remove sample data</button>`;
  else if (nPlayers < 8) h += `<p class="hint">Add at least 8 players to make sample data.</p>`;
  else h += `<p class="hint">Fills the league with about 25 made-up matches from the last five weeks, using everyone in the player list, so people can see how the tables, matches and profiles work. Everyone viewing the site sees them. You can remove them all with one tap.</p><button class="btn tonal" id="addsample" style="align-self:flex-start"><span class="ms">science</span>Load sample data</button>`;
  h += `</div></section>`;

  h += `<section><div class="card"><button class="btn tonal" id="signout" style="align-self:flex-start"><span class="ms">logout</span>Sign out</button></div></section></main>`;
  app.innerHTML = h; wire(); wireGate();

  const sampleBtn = (el, fn, ok) => { if (el) el.onclick = async () => {
    el.disabled = true;
    try { const n = await fn(); S.notice = { t: ok(n) }; } catch (err) { S.notice = { err: true, t: `Couldn't do that (${err.code || err.message}).` }; }
    render(); scrollTo(0, 0);
  }; };
  sampleBtn(document.getElementById("addsample"), loadSampleLeague, n => `Added ${n} sample matches. Have a look at the league.`);
  sampleBtn(document.getElementById("rmsample"), removeSampleLeague, n => `Removed ${n} sample matches.`);
  document.getElementById("adds").onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById("news").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { S.notice = { err: true, t: "That doesn't look like an email address." }; render(); return; }
    try { await setDoc(doc(db, "scorers", email), { addedBy: S.user.email, addedAt: serverTimestamp() }); S.notice = { t: `${email} can now add league matches.` }; }
    catch (err) { S.notice = { err: true, t: `Couldn't add scorer (${err.code}).` }; }
    render();
  };
  app.querySelectorAll("button[data-rm]").forEach(b => b.onclick = async () => {
    try { await deleteDoc(doc(db, "scorers", b.dataset.rm)); S.notice = { t: `Removed ${b.dataset.rm}.` }; }
    catch (err) { S.notice = { err: true, t: `Couldn't remove (${err.code}).` }; }
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
      <div class="field"><label for="p2-${t.id}">Player 2</label>${playerSelect("p2-" + t.id, t.p2)}</div></div></div>`;
  });
  const champKey = prevWinnersKey(d, id), picked = d.teams.flatMap(t => [t.p1, t.p2]);
  const champsIn = champKey && champKey.split("|").every(p => picked.includes(p));
  if (scored) h += `<div class="shuffle-box"><p class="hint"><span class="ms lock" aria-hidden="true">lock</span>Teams are locked for shuffling because scores have been entered. Clear every score to shuffle again.</p></div>`;
  else {
    h += `<div class="shuffle-box"><p class="hint">Pick all ${n * 2} players in any order, then shuffle for random partners and team numbers. Not happy? Shuffle again.</p>`;
    if (champsIn) h += `<label class="check"><input type="checkbox" id="keepch"${S.keepChamps ? " checked" : ""}><span>Keep defending champions <b>${esc(champKey.split("|").map(pname).join(" & "))}</b> together</span></label>`;
    h += `<button class="btn filled" id="shuffle" style="align-self:flex-start"><span class="ms">shuffle</span>Shuffle teams</button></div>`;
  }
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
  const kc = document.getElementById("keepch"); if (kc) kc.onchange = () => { S.keepChamps = kc.checked; };
  const sh = document.getElementById("shuffle"); if (sh) sh.onclick = () => {
    if (d.matches.some(played)) { renderEditComp(id); return; }
    const err = shuffleTeams(d, champsIn && S.keepChamps ? champKey : "");
    if (err) { S.notice = { err: true, t: err }; renderEditComp(id); return; }
    S.dirty = true; S.notice = { t: "Teams shuffled. Tap Save to keep them." }; renderEditComp(id);
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
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Random pairs and team numbers from the players already picked. keepKey
// ("id1|id2") keeps those two together. Returns an error message or null.
function shuffleTeams(d, keepKey) {
  const all = d.teams.flatMap(t => [t.p1, t.p2]);
  if (all.some(p => !p)) return "Pick every player first, then shuffle.";
  if (new Set(all).size !== all.length) return "Someone is picked twice. Fix that, then shuffle.";
  const keep = keepKey ? keepKey.split("|") : [];
  const sig = list => list.map(x => x.slice().sort().join("|")).sort().join(",");
  const before = sig(d.teams.map(t => [t.p1, t.p2]));
  let pairs;
  // Try for different partners than before (not always possible).
  for (let tries = 0; tries < 30; tries++) {
    const rest = shuffle(all.filter(p => !keep.includes(p)));
    pairs = [];
    for (let i = 0; i < rest.length; i += 2) pairs.push({ p: [rest[i], rest[i + 1]] });
    if (keep.length) pairs.push({ p: keep });
    if (sig(pairs.map(x => x.p)) !== before) break;
  }
  shuffle(pairs);
  d.teams.forEach((t, i) => { t.p1 = pairs[i].p[0]; t.p2 = pairs[i].p[1]; });
  return null;
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

// ---------- League ----------
// Weekly doubles matches, best of 3 sets. Stored in league/{autoId} as
// { date, a: [p1, p2], b: [p1, p2], sets: [{ a, b, ta, tb }] } where ta/tb are
// tiebreak points (null unless the set went to a tiebreak).
const LEAGUE_MIN = 3; // matches needed to be ranked in the players table
const FIRE_STREAK = 3; // wins in a row for the fire icon
const pct = r => r.P ? r.W / r.P : 0;
const pctText = r => r.P ? Math.round(pct(r) * 100) + "%" : "–";
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const msOf = t => (t && typeof t.toMillis === "function") ? t.toMillis() : (typeof t === "number" ? t : Date.now());
// Oldest first: by date, then by when it was entered.
function leagueMatches() {
  return Object.entries(S.league).map(([id, m]) => ({ id, ...m }))
    .filter(m => Array.isArray(m.a) && Array.isArray(m.b) && Array.isArray(m.sets))
    .sort((x, y) => (x.date || "").localeCompare(y.date || "") || msOf(x.createdAt) - msOf(y.createdAt));
}
// Sets and games for each side, and who won.
function matchScore(m) {
  let sa = 0, sb = 0, ga = 0, gb = 0;
  m.sets.forEach(st => { ga += +st.a; gb += +st.b; if (+st.a > +st.b) sa++; else if (+st.b > +st.a) sb++; });
  return { sa, sb, ga, gb, aWon: sa > sb };
}
const isBagel = (mine, theirs) => +mine === 0 && +theirs === 6;
function blankRow(extra) { return { P: 0, W: 0, L: 0, SW: 0, SL: 0, GW: 0, GL: 0, form: [], cur: 0, best: 0, bagS: 0, bagE: 0, ...extra }; }
function addResult(r, won, s, side) {
  const mySets = side === "a" ? s.sa : s.sb, theirSets = side === "a" ? s.sb : s.sa;
  const myGames = side === "a" ? s.ga : s.gb, theirGames = side === "a" ? s.gb : s.ga;
  r.P++; won ? r.W++ : r.L++; r.SW += mySets; r.SL += theirSets; r.GW += myGames; r.GL += theirGames;
  r.form.push(won ? "W" : "L");
  r.cur = won ? r.cur + 1 : 0; r.best = Math.max(r.best, r.cur);
}
// Everything the league pages show, worked out from the full match list.
function leagueStats() {
  const players = {}, pairs = {}, matches = leagueMatches();
  const P = id => players[id] ||= blankRow({ id, partners: {}, opps: {} });
  matches.forEach(m => {
    const s = matchScore(m);
    [["a", m.a, m.b], ["b", m.b, m.a]].forEach(([side, mine, theirs]) => {
      const won = side === "a" ? s.aWon : !s.aWon;
      const bagS = m.sets.filter(st => side === "a" ? isBagel(st.b, st.a) : isBagel(st.a, st.b)).length;
      const bagE = m.sets.filter(st => side === "a" ? isBagel(st.a, st.b) : isBagel(st.b, st.a)).length;
      mine.forEach((id, i) => {
        const r = P(id); addResult(r, won, s, side); r.bagS += bagS; r.bagE += bagE;
        const mate = mine[1 - i], pt = r.partners[mate] ||= { P: 0, W: 0 };
        pt.P++; if (won) pt.W++;
        theirs.forEach(o => { const op = r.opps[o] ||= { P: 0, W: 0, L: 0 }; op.P++; won ? op.W++ : op.L++; });
      });
      const key = mine.slice().sort().join("|");
      const pr = pairs[key] ||= blankRow({ ids: mine.slice().sort((x, y) => pname(x).localeCompare(pname(y))) });
      addResult(pr, won, s, side); pr.bagS += bagS; pr.bagE += bagE;
    });
  });
  const tieBreak = (x, y) => (y.SW - y.SL) - (x.SW - x.SL) || (y.GW - y.GL) - (x.GW - x.GL);
  const playerRows = Object.values(players).sort((x, y) =>
    (y.P >= LEAGUE_MIN) - (x.P >= LEAGUE_MIN) || pct(y) - pct(x) || y.W - x.W || tieBreak(x, y) || pname(x.id).localeCompare(pname(y.id)));
  const pairRows = Object.values(pairs).sort((x, y) => y.W - x.W || pct(y) - pct(x) || tieBreak(x, y));
  return { players, playerRows, pairRows, matches };
}
const plink = id => `<a class="plink" href="#/p/${encodeURIComponent(id)}">${esc(pname(id) || "Unknown")}</a>`;
const fire = r => r.cur >= FIRE_STREAK ? `<span class="ms fire" role="img" aria-label="${r.cur} wins in a row" title="${r.cur} wins in a row">local_fire_department</span>` : "";
const formDots = form => form.length ? form.slice(-5).map(f => { const lab = f === "W" ? "Win" : "Loss"; return `<span class="fchip f${f}" role="img" aria-label="${lab}" title="${lab}"></span>`; }).join("") : `<span class="fnone">–</span>`;

// Two table rows per match: each pair with its set scores. Tiebreak points
// sit small next to the losing score, tennis style; a bagel gets a 🥯.
function leagueMatchRows(m, editable) {
  const s = matchScore(m), n = m.sets.length;
  const row = (side, ids, first) => {
    const won = side === "a" ? s.aWon : !s.aWon;
    const cells = [0, 1, 2].map(i => {
      const st = m.sets[i]; if (!st) return `<td class="set"></td>`;
      const mine = +st[side], theirs = +st[side === "a" ? "b" : "a"], wonSet = mine > theirs;
      const tb = st.ta != null && st.tb != null && !wonSet ? `<sup>${side === "a" ? st.ta : st.tb}</sup>` : "";
      const bagel = isBagel(mine, theirs) ? `<sup class="bagel" title="Bagel">🥯</sup>` : "";
      return `<td class="set num${wonSet ? " sw" : ""}">${mine}${tb}${bagel}</td>`;
    }).join("");
    const edit = editable && first ? `<td class="ed" rowspan="2"><a class="icon-btn" href="#/league/m/${encodeURIComponent(m.id)}" aria-label="Edit match"><span class="ms">edit</span></a></td>` : "";
    return `<tr class="${first ? "m1" : "m2"} ${won ? "won" : "lost"}"><td class="l fx-team"><span class="nm">${plink(ids[0])} &amp; ${plink(ids[1])}</span></td>${cells}${edit}</tr>`;
  };
  return row("a", m.a, true) + row("b", m.b, false);
}
function leagueMatchTable(list, editable) {
  return `<div class="card"><table class="fx lg"><colgroup><col>${"<col class=\"c-set\">".repeat(3)}${editable ? '<col class="c-ed">' : ""}</colgroup><tbody>${list.map(m => leagueMatchRows(m, editable)).join("")}</tbody></table></div>`;
}
// Newest first, one block per day.
function leagueMatchBlocks(list, editable) {
  const byDate = [];
  list.slice().reverse().forEach(m => { const last = byDate[byDate.length - 1]; if (last && last.date === m.date) last.list.push(m); else byDate.push({ date: m.date, list: [m] }); });
  return byDate.map(g => `<div class="round"><div class="round-h"><b>${esc(shortDate(g.date) || "No date")}</b><span>·</span><span>${g.list.length} match${g.list.length === 1 ? "" : "es"}</span></div>${leagueMatchTable(g.list, editable)}</div>`).join("");
}
function leagueGateMsg() {
  const e = S.leagueError;
  return `<div class="msg err">Couldn't load the league (${esc(e.code || e.message)}). If it's new, the Firestore security rules need publishing.</div>`;
}

function renderLeague() {
  document.title = `League · ${SITE}`;
  const add = canScore() ? `<a class="icon-btn" href="#/league/add" aria-label="Add a match" title="Add a match"><span class="ms">add</span></a>` : "";
  const top = sub => header("League", sub, { back: "#/", refresh: true, extra: add });
  if (!S.leagueReady || !S.playersReady) { app.innerHTML = top("") + `<div class="loading">Loading…</div>`; return; }
  if (S.leagueError) { app.innerHTML = top("") + `<main>${leagueGateMsg()}</main>`; wire(); return; }
  const st = leagueStats(), n = st.matches.length;
  let h = top(n ? `${n} match${n === 1 ? "" : "es"} · ${st.playerRows.length} players` : "") + `<main class="has-nav">`;
  if (S.notice) h += `<div class="msg${S.notice.err ? " err" : ""}">${esc(S.notice.t)}</div>`;
  if (st.matches.some(m => m.sample)) h += `<div class="msg sample"><span class="ms" aria-hidden="true">science</span><span><b>Sample data.</b> These matches are made up to show how the league works. Real results start soon.</span></div>`;

  // Players: ranked by win %, once they've played enough to count.
  h += `<section id="players"><div class="sec-h"><h2>Players</h2><span>By win %</span></div>`;
  if (!n) h += `<div class="empty">No matches yet. ${canScore() ? `Tap <b>+</b> to add the first one.` : "The table fills in as matches are added."}</div>`;
  else {
    h += `<div class="card"><div class="tbl-wrap"><table class="lt"><thead><tr><th></th><th class="l">Player</th><th>P</th><th>W</th><th>L</th><th>Win%</th><th class="l">Form</th></tr></thead><tbody>`;
    let shownSep = false;
    st.playerRows.forEach((r, i) => {
      const ok = r.P >= LEAGUE_MIN;
      if (!ok && !shownSep) { shownSep = true; h += `<tr class="sep"><td colspan="7">Fewer than ${LEAGUE_MIN} matches · not ranked yet</td></tr>`; }
      h += `<tr${ok && i === 0 ? ' class="lead"' : ""}><td class="pos num">${ok ? i + 1 : ""}</td><td class="team l">${plink(r.id)}${fire(r)}</td><td>${r.P}</td><td class="w">${r.W}</td><td>${r.L}</td><td>${pctText(r)}</td><td class="l"><div class="form">${formDots(r.form)}</div></td></tr>`;
    });
    h += `</tbody></table></div></div>`;
  }
  h += `</section>`;

  // Pairs: ranked by total wins.
  h += `<section id="pairs"><div class="sec-h"><h2>Pairs</h2><span>By wins</span></div>`;
  if (!n) h += `<div class="empty">Pairs appear here once they've played.</div>`;
  else {
    h += `<div class="card"><div class="tbl-wrap"><table class="lt"><thead><tr><th></th><th class="l">Pair</th><th>P</th><th>W</th><th>L</th><th>Win%</th><th class="l">Form</th></tr></thead><tbody>`;
    st.pairRows.forEach((r, i) => {
      h += `<tr${i === 0 ? ' class="lead"' : ""}><td class="pos num">${i + 1}</td><td class="team l">${plink(r.ids[0])} &amp; ${plink(r.ids[1])}${fire(r)}</td><td>${r.P}</td><td class="w">${r.W}</td><td>${r.L}</td><td>${pctText(r)}</td><td class="l"><div class="form">${formDots(r.form)}</div></td></tr>`;
    });
    h += `</tbody></table></div></div>`;
  }
  h += `</section>`;

  h += `<section id="matches"><div class="sec-h"><h2>Matches</h2><span>Latest first</span></div>`;
  if (!n) h += `<div class="empty">Results appear here as they're added.</div>`;
  else {
    const shown = st.matches.slice(-S.leagueShow);
    h += leagueMatchBlocks(shown, canScore());
    if (shown.length < n) h += `<button class="btn tonal" id="more" style="align-self:center">Show older matches</button>`;
  }
  h += `</section>${footer({ href: "#/league/add", text: "Scorers' entrance" })}</main>`;
  const tabs = [["players", "person", "Players"], ["pairs", "group", "Pairs"], ["matches", "sports_tennis", "Matches"]];
  h += sectionNav(tabs);
  const y = scrollY;
  app.innerHTML = h; wire(); scrollTo(0, y);
  wireSectionNav(tabs);
  const more = document.getElementById("more"); if (more) more.onclick = () => { S.leagueShow += 30; renderLeague(); };
}

// ----- Player profile -----
function renderPlayer(id) {
  const name = pname(id);
  document.title = `${name || "Player"} · ${SITE}`;
  const top = header(esc(name || "Player"), "", { back: "#/league" });
  if (!S.playersReady || !S.leagueReady || !S.compsReady) { app.innerHTML = top + `<div class="loading">Loading…</div>`; return; }
  if (!S.players[id]) { app.innerHTML = top + `<main><div class="empty">This player isn't in the list any more. <a href="#/league">Back to the league</a></div></main>`; wire(); return; }
  let h = top + `<main>`;
  if (S.leagueError) h += leagueGateMsg();
  const st = leagueStats(), r = st.players[id];
  const tile = (label, value, sub) => `<div class="stat"><small>${label}</small><b class="num">${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;

  h += `<section><div class="sec-h"><h2>League</h2>${r ? `<span>${r.P >= LEAGUE_MIN ? `Ranked ${st.playerRows.indexOf(r) + 1} of ${st.playerRows.filter(x => x.P >= LEAGUE_MIN).length}` : `${LEAGUE_MIN - r.P} more to be ranked`}</span>` : ""}</div>`;
  if (!r) h += `<div class="empty">No league matches yet.</div>`;
  else {
    h += `<div class="stats">`
      + tile("Played", r.P) + tile("Won", r.W) + tile("Win rate", pctText(r))
      + tile("Streak", r.cur ? `${r.cur}W${r.cur >= FIRE_STREAK ? ` <span class="ms fire" aria-hidden="true">local_fire_department</span>` : ""}` : (r.form.length ? "–" : "0"), r.cur ? "wins in a row" : "")
      + tile("Best streak", r.best, "wins in a row") + tile("Form", `<div class="form">${formDots(r.form)}</div>`)
      + tile("Sets", `${r.SW}–${r.SL}`) + tile("Games", `${r.GW}–${r.GL}`) + tile("Bagels", `${r.bagS} <span class="dim">/</span> ${r.bagE}`, "served / eaten")
      + `</div>`;
    // Partner and rival highlights
    const partners = Object.entries(r.partners).sort(([a, x], [b, y]) => y.P - x.P || y.W - x.W || pname(a).localeCompare(pname(b)));
    const opps = Object.entries(r.opps).sort(([a, x], [b, y]) => y.P - x.P || y.L - x.L || pname(a).localeCompare(pname(b)));
    const hl = (label, icon, pid, text) => `<div class="hl"><span class="ms" aria-hidden="true">${icon}</span><div><small>${label}</small><b>${plink(pid)}</b><span>${text}</span></div></div>`;
    h += `<div class="hls">`;
    if (partners[0]) { const [pid, x] = partners[0]; h += hl("Favourite partner", "handshake", pid, `${x.P} match${x.P === 1 ? "" : "es"} together, ${x.W} won`); }
    if (opps[0]) { const [pid, x] = opps[0]; h += hl("Biggest rival", "swords", pid, `Played ${x.P}, won ${x.W}, lost ${x.L}`); }
    h += `</div>`;
    h += `</section><section><div class="sec-h"><h2>Partners</h2></div><div class="card"><div class="tbl-wrap"><table class="lt"><thead><tr><th class="l">With</th><th>P</th><th>W</th><th>Win%</th></tr></thead><tbody>`
      + partners.map(([pid, x]) => `<tr><td class="team l">${plink(pid)}</td><td>${x.P}</td><td class="w">${x.W}</td><td>${pctText(x)}</td></tr>`).join("")
      + `</tbody></table></div></div></section>`;
    h += `<section><div class="sec-h"><h2>Opponents</h2></div><div class="card"><div class="tbl-wrap"><table class="lt"><thead><tr><th class="l">Against</th><th>P</th><th>W</th><th>L</th></tr></thead><tbody>`
      + opps.map(([pid, x]) => `<tr><td class="team l">${plink(pid)}</td><td>${x.P}</td><td class="w">${x.W}</td><td>${x.L}</td></tr>`).join("")
      + `</tbody></table></div></div></section>`;
    const mine = st.matches.filter(m => m.a.includes(id) || m.b.includes(id)).slice(-10);
    h += `<section><div class="sec-h"><h2>Recent matches</h2><span>Last ${mine.length}</span></div>${leagueMatchBlocks(mine, false)}`;
  }
  h += `</section>`;

  // Competition record
  const comps = sortedComps().filter(([, c]) => c.teams.some(t => t.p1 === id || t.p2 === id));
  const won = comps.filter(([, c]) => { if (status(c) !== "done") return false; const t = standings(c)[0]?.t; return t && (t.p1 === id || t.p2 === id); });
  h += `<section><div class="sec-h"><h2>Competitions</h2></div>`;
  h += comps.length ? `<div class="stats">${tile("Played", comps.length)}${tile("Won", won.length ? `${won.length} <span class="ms trophy" aria-hidden="true">trophy</span>` : 0)}</div>` : `<div class="empty">No competitions yet.</div>`;
  h += `</section>${footer({ href: "#/league/add", text: "Scorers' entrance" })}</main>`;
  app.innerHTML = h; wire();
}

// ----- Add or edit a league match (scorers and admins) -----
function scorerGate() {
  if (!S.authReady) return `<div class="loading">Checking sign-in…</div>`;
  if (!S.user) return `<div class="card signin"><p class="hint">League scorers sign in with Google to add matches. On iPhone, use Safari.</p><button class="btn filled" id="signin"><span class="ms">login</span>Sign in with Google</button></div>`;
  if (!canScore() && (!S.adminChecked || !S.scorerChecked)) return `<div class="loading">Checking access…</div>`;
  if (!canScore()) return `<div class="card signin"><p>You're signed in as <b>${esc(S.user.email)}</b>, but this account can't add league matches yet.</p><p class="hint">Ask an admin to add your email as a league scorer.</p><button class="btn tonal" id="signout">Sign out</button></div>`;
  return null;
}
// Best of 3 sets. Returns an error message, or null if the score is valid.
function checkSets(sets) {
  const done = [];
  for (let i = 0; i < sets.length; i++) {
    const st = sets[i], n = `Set ${i + 1}`;
    const empty = st.a === null && st.b === null;
    if (empty) { if (sets.slice(i + 1).some(x => x.a !== null || x.b !== null)) return `${n} is empty but a later set has a score.`; break; }
    if (st.a === null || st.b === null) return `${n} needs a score for both pairs.`;
    const w = Math.max(st.a, st.b), l = Math.min(st.a, st.b);
    if (!((w === 6 && l <= 4) || (w === 7 && (l === 5 || l === 6)))) return `${n}: ${st.a}–${st.b} isn't a finished set. Sets end 6–0 to 6–4, 7–5 or 7–6.`;
    if (st.ta !== null || st.tb !== null) {
      if (l !== 6) return `${n}: only a 7–6 set has a tiebreak.`;
      if (st.ta === null || st.tb === null) return `${n}: enter both tiebreak scores, or leave both empty.`;
      const tw = Math.max(st.ta, st.tb), tl = Math.min(st.ta, st.tb);
      if ((st.ta > st.tb) !== (st.a > st.b)) return `${n}: the tiebreak winner should also win the set.`;
      if (tw < 7 || tw - tl < 2) return `${n}: a tiebreak is won by reaching 7, 2 points clear (e.g. 7–5 or 9–7).`;
    }
    done.push(st);
  }
  let a = 0, b = 0;
  for (let i = 0; i < done.length; i++) {
    if (a === 2 || b === 2) return "The match was already won after 2 sets. Clear set 3.";
    done[i].a > done[i].b ? a++ : b++;
  }
  if (a < 2 && b < 2) return done.length < 2 ? "Enter at least 2 sets." : "Someone needs to win 2 sets. Add set 3.";
  return null;
}
function renderLeagueEdit(id) {
  const isNew = id === "new";
  document.title = `${isNew ? "Add match" : "Edit match"} · ${SITE}`;
  let h = header(isNew ? "Add match" : "Edit match", S.user ? esc(S.user.email) : "", { back: "#/league" }) + `<main class="admin has-save">`;
  if (S.notice) h += `<div class="msg${S.notice.err ? " err" : ""}">${esc(S.notice.t)}</div>`;
  const gate = scorerGate();
  if (gate) { app.innerHTML = h + gate + `</main>`; wire(); wireGate(); return; }
  if (!S.leagueReady || !S.playersReady) { app.innerHTML = h + `<div class="loading">Loading…</div></main>`; return; }
  if (S.leagueError) { app.innerHTML = h + leagueGateMsg() + `</main>`; wire(); return; }

  if (!S.ldraft || S.ldraftId !== id) {
    const blankSet = () => ({ a: null, b: null, ta: null, tb: null });
    if (isNew) S.ldraft = { date: todayISO(), a: ["", ""], b: ["", ""], sets: [blankSet(), blankSet(), blankSet()] };
    else if (S.league[id]) {
      const m = clone(S.league[id]);
      S.ldraft = { date: m.date || todayISO(), a: m.a.slice(), b: m.b.slice(), sets: [0, 1, 2].map(i => ({ ...blankSet(), ...(m.sets[i] || {}) })) };
    } else { app.innerHTML = h + `<div class="empty">This match doesn't exist any more. <a href="#/league">Back to the league</a></div></main>`; wire(); return; }
    S.ldraftId = id;
  }
  const d = S.ldraft, sc = scrollY;
  const pairLabel = side => [pname(d[side][0]), pname(d[side][1])].filter(Boolean).join(" & ") || (side === "a" ? "Pair A" : "Pair B");

  h += `<section><div class="sec-h"><h2>Match</h2></div><div class="card">
    <div class="field"><label for="m-date">Date played</label><input type="date" id="m-date" value="${esc(d.date)}"></div>`;
  ["a", "b"].forEach(side => {
    h += `<div class="team-ed"><h4>${side === "a" ? "Pair A" : "Pair B"}</h4><div class="row">
      <div class="field"><label for="${side}0">Player 1</label>${playerSelect(side + "0", d[side][0])}</div>
      <div class="field"><label for="${side}1">Player 2</label>${playerSelect(side + "1", d[side][1])}</div></div></div>`;
  });
  h += `<form class="row" id="addp"><div class="field"><label for="newp">Player not listed? Add them</label><input id="newp" placeholder="Name" autocomplete="off"></div><button class="btn tonal" type="submit"><span class="ms">person_add</span>Add</button></form>`;
  h += `</div></section>`;

  h += `<section><div class="sec-h"><h2>Score</h2><span>Best of 3 sets</span></div><div class="card">`;
  h += `<div class="set-row set-head"><span></span><span title="${esc(pairLabel("a"))}">${esc(pairLabel("a"))}</span><span></span><span title="${esc(pairLabel("b"))}">${esc(pairLabel("b"))}</span></div>`;
  d.sets.forEach((st, i) => {
    const num = (k, v, lab) => `<input type="number" inputmode="numeric" min="0" max="99" data-s="${i}" data-k="${k}" value="${v ?? ""}" aria-label="${lab}">`;
    h += `<div class="set-row"><span class="set-l">Set ${i + 1}</span>${num("a", st.a, `Set ${i + 1}, ${pairLabel("a")}`)}<span class="dash">–</span>${num("b", st.b, `Set ${i + 1}, ${pairLabel("b")}`)}</div>`;
    const tie = Math.max(st.a ?? 0, st.b ?? 0) === 7 && Math.min(st.a ?? 0, st.b ?? 0) === 6;
    if (tie || st.ta !== null || st.tb !== null) h += `<div class="set-row tb"><span class="set-l">Tiebreak</span>${num("ta", st.ta, `Set ${i + 1} tiebreak, ${pairLabel("a")}`)}<span class="dash">–</span>${num("tb", st.tb, `Set ${i + 1} tiebreak, ${pairLabel("b")}`)}</div>`;
  });
  h += `<p class="hint">Leave set 3 empty if it was won in 2. A tiebreak row appears for a 7–6 set; its scores are optional.</p></div></section>`;

  if (!isNew) {
    h += `<section><div class="sec-h"><h2>Delete</h2></div><div class="card">`;
    h += S.pending?.type === "ldelete"
      ? `<div class="confirm"><p>Delete this match? It comes off the tables and everyone's stats.</p><div class="row"><button class="btn danger" id="cf-yes">Delete match</button><button class="btn text" id="cf-no">Cancel</button></div></div>`
      : `<button class="btn danger" id="del" style="align-self:flex-start"><span class="ms">delete</span>Delete match</button>`;
    h += `</div></section>`;
  }
  h += `</main><div class="savebar"><div class="savebar-in"><p id="sb-msg">${S.saving ? "Saving…" : isNew ? "Not added yet" : S.dirty ? "Unsaved changes" : "Everything is saved"}</p><button class="btn text" id="discard">${isNew ? "Cancel" : "Discard"}</button><button class="btn filled" id="save"${S.saving || (!isNew && !S.dirty) ? " disabled" : ""}><span class="ms">cloud_upload</span>${isNew ? "Add match" : "Save"}</button></div></div>`;
  app.innerHTML = h; wire(); scrollTo(0, sc);

  const markDirty = () => {
    S.dirty = true;
    const p = document.getElementById("sb-msg"), s = document.getElementById("save");
    if (p && !isNew) p.textContent = "Unsaved changes";
    if (s) s.disabled = false;
  };
  document.getElementById("m-date").oninput = e => { d.date = e.target.value; markDirty(); };
  ["a", "b"].forEach(side => [0, 1].forEach(i => {
    document.getElementById(side + i).onchange = e => { d[side][i] = e.target.value; markDirty(); renderLeagueEdit(id); };
  }));
  app.querySelectorAll("input[data-s]").forEach(inp => {
    inp.oninput = () => { const v = inp.value.trim(); d.sets[+inp.dataset.s][inp.dataset.k] = v === "" ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0)); markDirty(); };
    // Redraw on change so the tiebreak row appears or goes as the set score changes.
    if (inp.dataset.k === "a" || inp.dataset.k === "b") inp.onchange = () => {
      const st = d.sets[+inp.dataset.s];
      const tie = Math.max(st.a ?? 0, st.b ?? 0) === 7 && Math.min(st.a ?? 0, st.b ?? 0) === 6;
      if (!tie && (st.ta !== null || st.tb !== null)) { st.ta = null; st.tb = null; }
      const shown = !!app.querySelector(`input[data-s="${inp.dataset.s}"][data-k="ta"]`);
      if (shown !== tie) renderLeagueEdit(id);
    };
  });
  document.getElementById("addp").onsubmit = async e => {
    e.preventDefault();
    const name = document.getElementById("newp").value.trim(); if (!name) return;
    if (Object.values(S.players).some(p => p.name.toLowerCase() === name.toLowerCase())) { S.notice = { err: true, t: `${name} is already in the player list.` }; renderLeagueEdit(id); return; }
    try { await addDoc(collection(db, "players"), { name, createdAt: serverTimestamp() }); S.notice = { t: `Added ${name}. Pick them from a player list.` }; }
    catch (err) { S.notice = { err: true, t: `Couldn't add player (${err.code}).` }; }
    renderLeagueEdit(id);
  };
  const del = document.getElementById("del"); if (del) del.onclick = () => { S.pending = { type: "ldelete" }; renderLeagueEdit(id); };
  const no = document.getElementById("cf-no"); if (no) no.onclick = () => { S.pending = null; renderLeagueEdit(id); };
  const yes = document.getElementById("cf-yes"); if (yes) yes.onclick = async () => {
    try { await deleteDoc(doc(db, "league", id)); S.dirty = false; S.carry = { t: "Match deleted." }; go("#/league"); }
    catch (err) { S.pending = null; S.notice = { err: true, t: `Couldn't delete (${err.code}).` }; renderLeagueEdit(id); }
  };
  document.getElementById("discard").onclick = () => { S.dirty = false; go("#/league"); };
  document.getElementById("save").onclick = () => saveLeagueMatch(id);
}
async function saveLeagueMatch(id) {
  const d = S.ldraft, fail = t => { S.notice = { err: true, t }; renderLeagueEdit(id); scrollTo(0, 0); };
  const four = [...d.a, ...d.b];
  if (!d.date) return fail("Pick the date the match was played.");
  if (four.some(p => !p)) return fail("Pick all four players.");
  if (new Set(four).size !== 4) return fail("Someone is picked twice. Each player can only be in the match once.");
  const err = checkSets(d.sets); if (err) return fail(err);
  const sets = d.sets.filter(st => st.a !== null).map(st => ({ a: st.a, b: st.b, ta: st.ta, tb: st.tb }));
  const data = { date: d.date, a: d.a.slice(), b: d.b.slice(), sets, updatedAt: serverTimestamp(), updatedBy: S.user.email };
  S.saving = true; renderLeagueEdit(id);
  try {
    if (id === "new") await addDoc(collection(db, "league"), { ...data, createdAt: serverTimestamp() });
    else await updateDoc(doc(db, "league", id), data);
    S.saving = false; S.dirty = false; S.carry = { t: id === "new" ? "Match added. Tables are updated." : "Match saved." }; go("#/league");
  } catch (e) {
    S.saving = false; fail(`Couldn't save (${e.code || e.message}). Check your connection and try again.`);
  }
}


// ----- Sample league data (admin only) -----
// Made-up matches to show people how the league looks. Every one is tagged
// sample: true so "Remove sample data" deletes exactly these and nothing else.
function sampleRng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeSampleLeague(ids, seed) {
  const rnd = sampleRng(seed), pick = a => a[Math.floor(rnd() * a.length)];
  const order = ids.slice().sort(() => rnd() - .5);
  const skill = {}, target = {}, played = {}, mate = {};
  order.forEach(id => { skill[id] = .3 + rnd() * .6; target[id] = 5 + Math.floor(rnd() * 6); played[id] = 0; });
  // Three regular pairs who usually play together; everyone else mixes.
  for (let i = 0; i + 1 < Math.min(6, order.length); i += 2) { mate[order[i]] = order[i + 1]; mate[order[i + 1]] = order[i]; }
  const need = id => target[id] - played[id];
  const free = (taken, cap) => ids.filter(id => !taken.includes(id) && played[id] < cap);
  const best = list => list.sort((x, y) => need(y) - need(x) || rnd() - .5)[0];
  const pairFor = taken => {
    const p = best(free(taken, 10).filter(id => need(id) > 0)) || best(free(taken, 10)); if (!p) return null;
    const m = mate[p];
    if (m && !taken.includes(m) && played[m] < 10 && rnd() < .8) return [p, m];
    const others = free([...taken, p], 10).filter(id => id !== m);
    return others.length ? [p, best(others)] : null;
  };
  // A set score: the loser's games, weighted towards close sets, with some bagels and tiebreaks.
  const loserGames = () => { const r = rnd(); return r < .09 ? 0 : r < .19 ? 1 : r < .34 ? 2 : r < .54 ? 3 : r < .74 ? 4 : r < .87 ? 5 : 6; };
  const matches = [];
  for (let guard = 0; guard < 200 && ids.some(id => need(id) > 0); guard++) {
    const A = pairFor([]); if (!A) break;
    const B = pairFor(A); if (!B) break;
    [...A, ...B].forEach(id => played[id]++);
    const sa = (skill[A[0]] + skill[A[1]]) / 2, sb = (skill[B[0]] + skill[B[1]]) / 2;
    const pA = 1 / (1 + Math.exp(-(sa - sb) * 6));
    const sets = []; let wa = 0, wb = 0;
    while (wa < 2 && wb < 2) {
      const aWins = rnd() < pA, l = loserGames(), w = l >= 5 ? 7 : 6;
      let ta = null, tb = null;
      if (l === 6) { const lp = rnd() < .8 ? Math.floor(rnd() * 6) : 6 + Math.floor(rnd() * 3); const wp = Math.max(7, lp + 2); [ta, tb] = aWins ? [wp, lp] : [lp, wp]; }
      sets.push(aWins ? { a: w, b: l, ta, tb } : { a: l, b: w, ta, tb }); aWins ? wa++ : wb++;
    }
    matches.push({ a: A, b: B, sets });
  }
  // Spread over the last five weeks, 3-5 match days a week, oldest first.
  const days = [];
  for (let wk = 4; wk >= 0; wk--) {
    const n = 3 + Math.floor(rnd() * 3), opts = [0, 1, 2, 3, 4, 5, 6].sort(() => rnd() - .5).slice(0, n).sort((x, y) => y - x);
    opts.forEach(o => { const back = wk * 7 + o + 1; days.push(back); });
  }
  const iso = back => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const base = Date.now() - 40 * 864e5;
  return matches.map((m, i) => ({ ...m, date: iso(days[Math.floor(i * days.length / matches.length)]), createdAt: base + i * 1000, sample: true }));
}
// Try seeds until the data shows everything off: everyone on 5-10 matches,
// a fire streak, a few bagels and tiebreaks.
function goodSampleLeague(ids) {
  const saved = S.league;
  try {
    for (let seed = 1; seed < 500; seed++) {
      const list = makeSampleLeague(ids, seed);
      S.league = Object.fromEntries(list.map((m, i) => ["s" + i, m]));
      const st = leagueStats(), rows = Object.values(st.players);
      const sets = list.flatMap(m => m.sets);
      if (rows.length === ids.length && rows.every(r => r.P >= 5 && r.P <= 10) && rows.some(r => r.cur >= FIRE_STREAK)
        && st.pairRows.some(r => r.P >= 4) && sets.filter(x => x.ta != null).length >= 3 && sets.filter(x => Math.min(x.a, x.b) === 0).length >= 3) return list;
    }
    return null;
  } finally { S.league = saved; }
}
const sampleIds = () => Object.entries(S.league).filter(([, m]) => m.sample).map(([id]) => id);
async function loadSampleLeague() {
  const list = goodSampleLeague(Object.keys(S.players));
  if (!list) throw new Error("couldn't build sample data");
  const b = writeBatch(db);
  list.forEach(m => b.set(doc(collection(db, "league")), { ...m, updatedBy: S.user.email }));
  await b.commit();
  return list.length;
}
async function removeSampleLeague() {
  const ids = sampleIds(), b = writeBatch(db);
  ids.forEach(id => b.delete(doc(db, "league", id)));
  await b.commit();
  return ids.length;
}

render();

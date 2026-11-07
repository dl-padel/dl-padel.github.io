# DL Padel — project notes

Casual padel competition app for Piers and friends at the local club. Live at https://dl-padel.github.io (repo `dl-padel/dl-padel.github.io`, GitHub Pages from `main`). Viewers need no account; admins sign in with Google.

## Stack
- Plain `index.html`, `styles.css`, `app.js` (ES module). No build step. Firebase JS SDK 10.12.2 loaded from gstatic.
- Firebase project `dl-padel` (Spark/free). Firestore in europe-west2, Google Auth only. Config is in `app.js` (public by design).
- **Icons are subset:** the Material Symbols link in `index.html` has `icon_names=` (alphabetical, comma-separated). Add any new icon name there or it shows as text. Cuts the font from ~540 KB to ~6 KB.
- **Cache busting:** bump `?v=N` on both `styles.css` and `app.js` in `index.html` on every change, or phones keep the old version.

## Data (Firestore)
- `players/{autoId}` → `{ name }`. Shared list so stats add up across comps.
- `comps/{slug}` → `{ name, date "YYYY-MM-DD", start "HH:MM", gameMins, breakMins, teams[{id:"t1", name, p1, p2}] (team `name` is unused: teams always show as "P1 & P2", there's no team name box), matches[{id, round, court, a, b, sa, sb}] }`. `sa`/`sb` null = not played.
- `league/{autoId}` → `{ date, time?, court?, a:[p1,p2], b:[p1,p2], sets:[{a, b, ta, tb}], createdAt, updatedAt, updatedBy }`. Best of 3; `ta`/`tb` are tiebreak points (null unless the set was 7-6). Loaded lazily (`ensureLeague`) only on league, profile and match-entry pages.
- `admins/{lowercase email}` → any field. Added by hand in the Firebase console.
- `scorers/{lowercase email}` → league scorers. Admins add/remove them on `#/admin`. Scorers can write `league` and create (not rename) players; nothing else.
- Rules in `firestore.rules` (public read; comps writes need an admin, league writes an admin or scorer, verified email). Rules must be pasted into the Firebase console manually after every change.

## Competition rules
- Teams of 2. 4 teams = 3 rounds on courts 1–2; 6 teams = 5 rounds on courts 1–3. Each round = game length + break (default 30 + 5).
- Fixtures follow the club's whiteboard order (`CLUB_ORDER` in app.js); other team counts fall back to a circle round-robin.
- Scoring is total games won in 30 minutes, with no sets. Table order: wins, then games won, then games difference. Columns: P W (D only if any draws) L GF GA Form (last 5, left-aligned).
- A comp is "done" when every match has a score. Winners get a gold row with a trophy instead of "1".
- Defending champions: a team with the same two players as the winners of the most recent finished comp before this one gets a gold crown, worked out automatically.

## League (`#/league`)
- Weekly doubles, partners change. Two tables: **Players** ranked by win % (need `LEAGUE_MIN` = 3 matches to be ranked; others listed under a "not ranked yet" line), then wins, set diff, game diff. **Pairs** ranked by total wins, then win %. Columns: P W L Win% Form. The league page shows the top `TOP_N` = 10 of each, with a "See full table · N players/pairs" link to `#/league/players` and `#/league/pairs` (full table, back to the league). Full tables add SF SA GF GA (sets and games won/lost) after Win%, scroll sideways with rank and name pinned, and have a key line underneath.
- League page Matches section shows the last `RECENT_N` = 5 with "See all matches · N" → `#/league/matches`: one block per week (Mon–Sun). "This week" is open (or says no matches yet); older weeks ("Last week", then "19–25 Oct") are collapsed `<details>` that stay open across live updates (`S.openWeeks`). Piers may want months instead later.
- League matches render newest first, one card per match (no day headings), with 3 set columns. Tiebreak points as superscript on both teams' set scores (7⁷ over 6⁵), not the tennis loser-only convention. No bagel marker on scores (bagels only appear as profile stats).
- 🔥 (`local_fire_department`, orange `#ff8a3d`) after a player or pair on `FIRE_STREAK` = 3+ wins in a row. League only; the comps table still has no badges.
- Player profile `#/p/{id}` (tap any league name): played/won/win %, current and best streak, form, sets, games, bagels served/eaten, favourite partner (most matches together), biggest rival (most played against), partner and opponent tables, last 10 matches, competition played/won.
- League matches can have an optional `time` ("HH:MM") and `court` (1–6); profiles show Favourite court once courts are recorded. Sample data includes times and courts.
- Match entry `#/league/add`, edit `#/league/m/{id}` (scorers and admins; + in the league header, edit icon on each match, "Scorers' entrance" footer link). Validates set scores (6-0..6-4, 7-5, 7-6), optional tiebreak for 7-6, 2 sets to win, no 3rd set after 2-0.
- Sample data: `#/admin` → League sample data → Load (about 25 made-up matches over the last 5 weeks, with times and courts, everyone 5–10 matches, 3 regular pairs, seeds retried until there's a 🔥, bagels and tiebreaks). Docs carry `sample: true`; the league page shows a "Sample data" banner while any exist; Remove deletes only those. While a set exists there's also "Make a new sample set", which swaps the old sample matches for a fresh random set (random starting seed) in one batch.
- Future ideas Piers mentioned: planned fixtures / formal league with only league games counting, more stats.

## UI decisions (agreed with Piers, keep these)
- Material 3 look, Roboto Flex plus Material Symbols Rounded. **Dark mode only**, vibrant brand colours generated with Material colour utilities from two seeds: purple `#8c3cff` and padel-ball yellow-green `#d4f22c`. Vivid purple (`--primary-container`) for filled buttons, lilac `--primary` for text accents and court numbers, ball colour (`--ball`) for the active nav pill, selected segmented buttons, trophy/crown icons and winning scores, purple-tinted near-black surfaces. Keep the ball green for brand moments only (form-guide win dots use a separate green).
- Winners styling (homepage pill and the table's winning row): dark olive `--champ-row` `#364000` with pale lime text `#eaff81` and a ball-green trophy. Defending champions crown is small (12px) and raised like a seed number.
- Homepage `#/` is a hub: hero logo, "David Lloyd Advanced Padel", then two cards, **League** and **Competitions** (Competitions card has one pill: red "Live now" or grey "Next: date"). The competitions list lives at `#/comps` with a normal top bar; comp pages go back there.
- Hero: no top bar. A hero with the centred logo (`logo.svg`, 180px wide) whose parts animate in together once per visit (court and lettering fade, green letters slide in from the sides; skipped for reduced motion; the hero node is kept across live redraws). Comps list: neutral grey cards only, with colour only on pills. Exactly **one pill** per card: olive 🏆 winners (finished), red Live, or grey Upcoming. Title 24px. One inline details row: calendar date ("Sun, 27 Sept"), clock time ("8am"), 👥 "N teams"; 16px icons, 4px icon gap, 16px between items.
- Comp page header uses the same shared details row (`detailsHtml`). No "|" dividers.
- Comp page sections: Table, Fixtures (next round first with a small grey "Up next" label, styled like the others), Results (latest first). Sticky bottom nav with those 3 tabs (icons leaderboard, calendar_month, event_available), plus a refresh button in the header.
- **Match cards** (`matchCard`, shared by comps and league; one card per match, 10px apart): scores first, then a footer row (`.mc-h`) on the left: time, date (league only) and court joined by " · " (comps: "8:35am · Court 1" under the kept "Round N · 08:35" headings; league: "7pm · Thu, 5 Nov · Court 2", parts left out if not recorded) and a small lilac **Edit** text link on the right for admins (comps → editor) or scorers (league → match edit). Middle: one 44px row per side, name then a ball-green filled 🏆 on the winning row, then score(s). Winner name and the scores they won semibold white; other scores and the loser greyed. Faint line between the two sides, normal line above the footer.
- Standings: team names regular weight. Form guide is plain 12px dots: green `#00cc58` win, red `#ff4260` loss, grey draw.
- All table rows 44px (10px padding, 24px line height).
- Footer on public pages: divider (40px above, 60px below), © line, mock-serious small print, WhatsApp "Complaints department" link (group invite; keep "Approve new participants" on), then a subtle "Super secret admin area" link. No admin icon in the homepage header.
- No streak badges or other extra labels in the table.
- Keep row heights fixed so played and unplayed games space out the same.

## Admin
- `#/admin`: Google sign-in only (on iPhone use Safari; Chrome's pop-up fails). Add or rename players, list and create comps.
- `#/admin/c/{id}`: details, 4/6 team switch (rebuilds fixtures and clears scores after confirming), player dropdowns per team, Shuffle teams (random partners and team numbers from the players picked; a ticked-by-default box keeps the defending champions paired, shown only when both are picked; locked once any score is entered, no separate Start button), Rebuild fixtures (club order), score entry, delete. Save writes the whole comp doc; viewers update live.

## Working notes
- Commit as Claude with the session attribution lines; push straight to `main` (Piers reviews on his phone).
- Test logic with jsdom and stubbed Firebase before pushing. I can't see the live site, so ask for screenshots.
- Home-screen icons: `apple-touch-icon.png` (180px), `icon-192.png`, `icon-512.png`, rendered from `logo.svg` on `#15121b`, plus `manifest.webmanifest`. Re-render them if the logo changes. Browser tab icon is `icon-192.png`.
- Local editing: Piers keeps a clone at `~/Documents/DL-Padel/dl-padel.github.io` on his Mac and previews with `python3 -m http.server 8000` (http://localhost:8000). Edit there via the device shell, then push from the cloud clone. Local admin saves still hit the live database.

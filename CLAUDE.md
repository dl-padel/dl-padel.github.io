# DL Padel — project notes

Casual padel competition app for Piers and friends at the local club. Live at https://dl-padel.github.io (repo `dl-padel/dl-padel.github.io`, GitHub Pages from `main`). Viewers need no account; admins sign in with Google.

## Stack
- Plain `index.html`, `styles.css`, `app.js` (ES module). No build step. Firebase JS SDK 10.12.2 loaded from gstatic.
- Firebase project `dl-padel` (Spark/free). Firestore in europe-west2, Google Auth only. Config is in `app.js` (public by design).
- **Cache busting:** bump `?v=N` on both `styles.css` and `app.js` in `index.html` on every change, or phones keep the old version.

## Data (Firestore)
- `players/{autoId}` → `{ name }`. Shared list so stats add up across comps.
- `comps/{slug}` → `{ name, date "YYYY-MM-DD", start "HH:MM", gameMins, breakMins, teams[{id:"t1", name, p1, p2}], matches[{id, round, court, a, b, sa, sb}] }`. `sa`/`sb` null = not played.
- `admins/{lowercase email}` → any field. Added by hand in the Firebase console. Rules in `firestore.rules` (public read; writes need an admin with a verified email). Rules must be pasted into the console manually.

## Competition rules
- Teams of 2. 4 teams = 3 rounds on courts 1–2; 6 teams = 5 rounds on courts 1–3. Each round = game length + break (default 30 + 5).
- Fixtures follow the club's whiteboard order (`CLUB_ORDER` in app.js); other team counts fall back to a circle round-robin.
- Scoring is total games won in 30 minutes, with no sets. Table order: wins, then games won, then games difference. Columns: P W (D only if any draws) L GF GA Form (last 5, left-aligned).
- A comp is "done" when every match has a score. Winners get a gold row with a trophy instead of "1".
- Defending champions: a team with the same two players as the winners of the most recent finished comp before this one gets a gold crown, worked out automatically.

## UI decisions (agreed with Piers, keep these)
- Material 3 look, Roboto Flex plus Material Symbols Rounded. **Dark mode only**, vibrant brand colours generated with Material colour utilities from two seeds: purple `#8c3cff` and padel-ball yellow-green `#d4f22c`. Vivid purple (`--primary-container`) for filled buttons, lilac `--primary` for text accents and court numbers, ball colour (`--ball`) for the active nav pill, selected segmented buttons, trophy/crown icons and winning scores, purple-tinted near-black surfaces. Keep the ball green for brand moments only (form-guide win dots use a separate green).
- Winners styling (homepage pill and the table's winning row): dark olive `--champ-row` `#364000` with pale lime text `#eaff81` and a ball-green trophy. Defending champions crown is small (12px) and raised like a seed number.
- Homepage: no top bar. A hero with the centred logo (`logo.svg`, 180px wide) whose parts animate in together once per visit (court and lettering fade, green letters slide in from the sides; skipped for reduced motion; the hero node is kept across live redraws). Section title "David Lloyd Advanced Padel", no count. Neutral grey cards only, with colour only on pills. Exactly **one pill** per card: olive 🏆 winners (finished), red Live, or grey Upcoming. Title 24px. One inline details row: calendar date ("Sun, 27 Sept"), clock time ("8am"), 👥 "N teams"; 16px icons, 4px icon gap, 16px between items.
- Comp page header uses the same shared details row (`detailsHtml`). No "|" dividers.
- Comp page sections: Table, Fixtures (next round first with a small grey "Up next" label, styled like the others), Results (latest first). Sticky bottom nav with those 3 tabs (icons leaderboard, calendar_month, event_available), plus a refresh button in the header.
- Fixtures and results are tables, one card per round, no header row: a court column (small "COURT" label over the number, spanning both rows), then one row per team with name and score. Faint line between the two teams, normal line between games. Scores same size as names; winner name and score semibold, winning score in ball green; loser greyed, regular weight.
- Standings: team names regular weight. Form guide is plain 12px dots: green `#00cc58` win, red `#ff4260` loss, grey draw.
- All table rows 44px (10px padding, 24px line height).
- Footer on public pages: divider (40px above, 60px below), © line, mock-serious small print, WhatsApp "Complaints department" link (group invite; keep "Approve new participants" on), then a subtle "Super secret admin area" link. No admin icon in the homepage header.
- No streak badges or other extra labels in the table.
- Keep row heights fixed so played and unplayed games space out the same.

## Admin
- `#/admin`: Google sign-in only (on iPhone use Safari; Chrome's pop-up fails). Add or rename players, list and create comps.
- `#/admin/c/{id}`: details, 4/6 team switch (rebuilds fixtures and clears scores after confirming), player dropdowns per team, Rebuild fixtures (club order), score entry, delete. Save writes the whole comp doc; viewers update live.
- `PAST_IMPORTS` in app.js is a one-off import button for September 2026; it hides once that comp exists.

## Working notes
- Commit as Claude with the session attribution lines; push straight to `main` (Piers reviews on his phone).
- Test logic with jsdom and stubbed Firebase before pushing. I can't see the live site, so ask for screenshots.
- Home-screen icons: `apple-touch-icon.png` (180px), `icon-192.png`, `icon-512.png`, rendered from `logo.svg` on `#15121b`, plus `manifest.webmanifest`. Re-render them if the logo changes. Browser tab icon is `icon-192.png`.
- Local editing: Piers keeps a clone at `~/Documents/DL-Padel/dl-padel.github.io` on his Mac and previews with `python3 -m http.server 8000` (http://localhost:8000). Edit there via the device shell, then push from the cloud clone. Local admin saves still hit the live database.

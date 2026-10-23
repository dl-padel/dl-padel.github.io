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
- Material 3 look, Roboto Flex plus Material Symbols Rounded. Purple primary (#6750a4 light / #d0bcff dark), purple-tinted neutrals, light-purple active nav pill. Supports light and dark.
- Homepage: neutral grey cards only, with colour only on pills. Exactly **one pill** per card: gold 🏆 winners (finished), red Live, or grey Upcoming. Title 24px. One inline details row: calendar date ("Sun, 27 Sept"), clock time ("8am"), 👥 "N teams"; 16px icons, 4px icon gap, 16px between items.
- Comp page header uses the same shared details row (`detailsHtml`). No "|" dividers.
- Comp page sections: Table, Fixtures (next round first with a small grey "Up next" label, styled like the others), Results (latest first). Sticky bottom nav with those 3 tabs, plus a refresh button in the header.
- No streak badges or other extra labels in the table.
- Keep row heights fixed so played and unplayed games space out the same.

## Admin
- `#/admin`: Google sign-in only (on iPhone use Safari; Chrome's pop-up fails). Add or rename players, list and create comps.
- `#/admin/c/{id}`: details, 4/6 team switch (rebuilds fixtures and clears scores after confirming), player dropdowns per team, Rebuild fixtures (club order), score entry, delete. Save writes the whole comp doc; viewers update live.
- `PAST_IMPORTS` in app.js is a one-off import button for September 2026; it hides once that comp exists.

## Working notes
- Commit as Claude with the session attribution lines; push straight to `main` (Piers reviews on his phone).
- Test logic with jsdom and stubbed Firebase before pushing. I can't see the live site, so ask for screenshots.

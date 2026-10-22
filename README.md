# DL Padel

Fixtures, live scores and tables for our padel competitions. Live at https://dl-padel.github.io

- Plain HTML, CSS and JavaScript hosted on GitHub Pages. No build step.
- Data lives in Firebase Firestore (project `dl-padel`): `players`, `comps` and `admins`.
- Admins sign in with Google. An admin is a document in `admins` whose ID is their lowercase email.
- Security rules are in `firestore.rules`; paste them into Firestore → Rules after any change.

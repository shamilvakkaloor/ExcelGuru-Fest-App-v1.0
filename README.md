# Fest Tabulation

Scoring, ranking and results for school and college cultural fests.

Runs entirely on Firebase's free tier. **No credit card, no terminal, no build
step.** Edit one file, drag the folder onto a host, done.

---

## Start here

**→ [SETUP.md](./SETUP.md)** — the full walkthrough, about 15 minutes.

**→ [UPLOAD-TO-GITHUB.md](./UPLOAD-TO-GITHUB.md)** — if you are using GitHub Pages.

The short version:

1. Create a Firebase project, turn on Firestore and Email/Password auth
2. Paste your config into `config.js`
3. Paste `firestore.rules` into the Firestore Rules tab
4. Add the two composite indexes
5. Drag this folder onto <https://app.netlify.com/drop>
6. Open the URL and run first-time setup

---

## What it does

**Four event classes** — Category Individual, Category Group, General
Individual, General Group. Each has its own rank point ladder; all share one
grade points table.

**Scoring** — judges score out of a configurable scale. Scores are averaged,
converted to a percentage, graded A/B/C/Without, and ranked with dense
ranking. Points are rank points plus grade points.

**Absence is explicit.** A blank score is never read as zero, and finalizing
refuses to run until every entry has either a score or an Absent mark. A
genuine zero is graded Without, which is a different thing.

**Blind judging** — for a blind event, judges see code letters and nothing
else. This is enforced by what is stored, not by what the interface hides.

**Roles**

| Role | Can |
|---|---|
| Admin | Everything, including publishing results |
| Co-Admin | Everything except publishing and account/settings changes |
| Judge | Score their assigned events, mark absences |
| House Manager | Register their house's participants, withdraw before code letters |
| Public | Published results, participant lookup, schedule, slideshow |

**Also included** — participant event-count caps with a compliance report,
CSV import and export throughout, a drag-to-reorder schedule builder with
clash detection, print-to-PDF for every report, and a projector slideshow.

---

## For developers

- [`CLAUDE.md`](./CLAUDE.md) — conventions and the constraints that must hold
- [`docs/decisions/`](./docs/decisions/) — why it is built this way
- [`tests.html`](./tests.html) — open in a browser; 30 checks on the scoring logic

Stack: vanilla ES modules, Firebase SDK 11 from CDN, Firestore, Firebase Auth.
No npm, no bundler, no framework.

## Not included

Certificate and poster generation (the "Generator Studio") was deliberately
left out of this build. The seam for it is clean — it would read the same
`results` and `participants` data and add one admin screen.

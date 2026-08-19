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
4. Add the composite indexes (the app links you straight to any it still wants)
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
| Stage Manager | Assign code letters and tick entries in as they go on. Cannot score, finalize or publish |
| Public | Published results, participant lookup, schedule, slideshow |

**Group entries are teams, not lists of names.** A group entry is shown as
"Red", or "Red A" / "Red B" where a house may field more than one — so a
substitution mid-fest does not make the same entry look like a different one.

**Also included** — participant event-count caps across nine tiers with a
compliance report, CSV import and export throughout, an event-by-event
registration sheet as a real `.xlsx`, a drag-to-reorder
schedule builder with clash detection, certificate and poster generation with
a canvas editor, participant ID cards, print-to-PDF for every report, and a
projector slideshow.

### Optional, and off until you switch them on

Every one of these is invisible — no nav item, no tab, no behaviour change —
until an Admin enables it. An existing fest upgrades with nothing altered.

| Feature | Turn on at |
|---|---|
| Appeals against a published result | Settings → Appeals |
| Messaging between accounts | Settings → Fest details |
| Event material (song titles and the like) | Events → edit an event |
| Substitutions | Events → edit an event |
| Whole-team events (no roster) | Events → edit an event |
| Entry constraint groups ("at most N of these") | Settings → Entry constraints |
| Custom leaderboards, with qualification rules | Settings → Leaderboard |
| Rank-only (gradeless) scoring | Settings → Fest details |
| Custom grade names and thresholds | Settings → Fest details |
| Renaming "House" to Team, Zone, … | Settings → Fest details |
| Public contact directory | Settings → Fest details |
| House Managers adding their own participants | Settings → Fest details |
| Admin/Co-Admin registering on a house's behalf | Settings → Fest details |

---

## For developers

- [`CLAUDE.md`](./CLAUDE.md) — conventions and the constraints that must hold
- [`docs/decisions/`](./docs/decisions/) — why it is built this way
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the full data model and scoring rules
- [`DEPLOY-CHECKLIST.md`](./DEPLOY-CHECKLIST.md) — read before upgrading a fest
  that is already running
- [`tests.html`](./tests.html) — open in a browser; 236 checks on the scoring
  logic, no Firebase connection needed

Stack: vanilla ES modules, Firebase SDK 11 from CDN, Firestore, Firebase Auth.
No npm, no bundler, no framework.

## Not included

**No push notifications, and no scheduled or server-side anything.** Cloud
Functions, Cloud Storage and Cloud Scheduler all require a billing account, so
none are used. Three consequences worth knowing before you rely on something:

- Messages appear live while the Messages tab is open. They cannot reach
  anyone who is not looking at it.
- The fest manual is a Google Drive **link**, not an upload. A Firestore
  document caps at 1 MiB and there is no file storage.
- The appeal fee is a **screenshot** of the transfer, not a payment
  integration.

Photos and logos are stored as base64 inside Firestore documents, resized in
the browser, for the same reason.

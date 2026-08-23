# Project: Fest Tabulation Web App

Scoring, ranking and results system for school/college cultural fests.

## Hard constraints — do not break these

- **No build step.** Plain ES modules loaded straight from the filesystem.
  No npm, no bundler, no TypeScript, no JSX. Anything requiring compilation
  is out of scope by design: the deploy story is "drag the folder onto a
  host", and that is a product requirement, not laziness.
- **Firebase free (Spark) tier only.** No Cloud Functions, no Cloud Storage,
  no Cloud Scheduler — all three require a billing account. If a feature
  seems to need a server, it belongs in Security Rules or in the browser.
- **Reads are the scarce resource.** 50,000/day. Any public-facing page must
  read a pre-built snapshot document, never a collection scan. Adding a
  listener to a large collection on a public page is the one change most
  likely to take the fest offline mid-event.

## Stack

- Vanilla JS ES modules, Firebase SDK 11 from `gstatic.com` CDN
- Firestore, Firebase Auth (email/password with synthetic addresses)
- Hash routing, no server rewrites needed
- CSS custom properties, no framework

## Commands

There are none. Edit a file, reload the browser.

- Tests: open `tests.html` in a browser (pure logic, no Firebase needed)
- Local server: `python3 -m http.server` — `file://` will not work with ES modules

## Layout

```
config.js              Firebase config — the only file a deployer edits
firestore.rules        The permission system. Not a formality.
js/lib/                Infrastructure: db, session, router, ui, csv, xlsx, pdf, photo
js/domain/             Pure logic: scoring, limits, registration, publish, constants
js/pages/              One module per screen; admin screens under pages/admin/
```

## Conventions

- `js/domain/scoring.js` and `js/domain/limits.js` are **pure** — no Firestore,
  no DOM. Keep them that way; they are the only tested code.
- Every page module default-exports `async (root) => cleanupFn?`. Returning a
  cleanup function is how listeners get torn down between routes.
- All DOM is built with `el()` from `lib/ui.js`. No innerHTML for user data.
- Async click handlers are wrapped in `guard()` so failures surface as a toast.
- Firestore access goes through `lib/db.js`. Do not import the Firestore SDK
  directly into a page.

## Domain rules that are easy to get wrong

- **Absence is explicit.** A missing score is never a zero. `finalizeEvent`
  refuses to run until every entry has a score or an Absent flag.
- **Zero is a real score.** 0% is graded `Without`, not `Absent`.
- **Dense ranking.** 90, 90, 80 ranks 1, 1, 2. Absent entries take no rank.
- **Group points split two ways.** A four-member winning team earns the
  *house* the entry's points **once**. Each *participant* is separately
  credited the full amount in their own group pool, which feeds only the
  Student Talent leaderboard. Never roll participant pools into house totals.
- **Blind judging is enforced by what is stored.** For a blind event, names
  are absent from `judgingEntries`, not merely hidden in the UI.
- **Publish is Admin-only**, enforced in `firestore.rules` on the
  `results.publishStatus` transition, not by hiding a button.

## v9 — patterns established, worth following

- **Grades are data, and an ID is forever.** `gradeScale: [{id,label,minPercent}]`
  in festSettings. Results and `config/gradePoints` are keyed by **id**, so a
  rename only ever touches `label`. `gradeScaleFrom(settings)` also reads the
  legacy `{aMin,bMin,cMin}` shape, so old fests need no migration. Never key
  anything new by a grade's label.
- **Anything a judge needs travels in `judgingEntries`.** A judge never reads
  the event document — that indirection is what enforces blind judging. Adding
  a field a judge must see means adding it to the snapshot in
  `admin/registrations.js`.
- **Public documents cannot hide a field.** Firestore rules are document-level.
  `houses` is world-readable, so phone numbers live in `houseContacts`
  (staff-only) and reach the public only through the `publicContacts`
  snapshot. If a new field is sensitive, it needs its own collection — not a
  flag on a public one.
- **Manual interventions carry a reason.** Adjustments, score overrides and
  substitution requests all require one, and all store it on the result.
  Anything that moves points by hand and cannot be explained afterwards is
  indistinguishable from tampering.
- **Preview and finalize share one code path.** `computeEventResult()` does
  everything `finalizeEvent()` does except write. Never add a second
  implementation of the points model for a preview.
- **Overrides are another input, not the output.** A score override joins the
  judges' real marks as one more value averaged in — a 3-judge entry with an
  override becomes a 4-way average — and lets percentage/grade/rank/points
  follow from that; it never sets a rank directly, which would let the stored
  rank and score contradict. A judge's individual mark can also be frozen
  (excluded) on one entry without touching that judge's marks elsewhere;
  excluded scores are kept, not deleted, so un-freezing restores them exactly.
- **Once finalized, scores are locked — not just once published.** Security
  Rules gate `scores`/`entryFlags`/`directResults`/`scoreOverrides` writes on
  a `results` doc existing at all, Finalized or Published. Correcting a mark
  after finalize means Unfinalize first (`unfinalizeEvent()`), which itself
  refuses on a published event — unpublish first.

## Recent additions worth knowing

- **Passwords are padded.** `session.js` appends a constant `PAD` before
  talking to Firebase, so 3-character passwords clear Firebase's 6-character
  floor. Changing `PAD` invalidates every existing password.
- **Photos are base64 in Firestore**, resized in-browser to 240px. There is
  no Storage bucket. `photo.js` owns compression, the placeholder silhouette
  and the `avatar()` helper.
- **Designs are data.** `domain/templates.js` defines certificate and poster
  layouts as arrays of millimetre-positioned elements; `lib/designRender.js`
  renders the same data to both the editor canvas and the print output. Add
  a template by adding a function there, not by writing HTML.
  - 24 built-ins: three themes (Modern, Classic, Bold Grid) × the same eight
    pieces. A new one needs a function, a `TEMPLATES` entry and a
    `TEMPLATE_LIST` row carrying both `theme` and `kind`.
  - Letter-spacing goes through `sp(em, sizePt)`. The engine's `spacing` is
    absolute (tenths of a mm) but every design source states it in `em`,
    which is relative to that element's own size — convert at the source so
    the number in the file is the design's real value.
  - Text is shrunk to fit **in the editor only** (`shrinkToFit`), so an
    element whose text is meant to bleed off the page needs a box wider than
    the text, positioned so the page's own `overflow:hidden` does the
    cropping. Otherwise the editor silently disagrees with the print.
- **Chest numbers can come from a house range** (`domain/chest.js`), falling
  back to the shared counter when a house has no range.
- **Judging is Admin-only** — enforced in `firestore.rules` on the `scores`
  collection, not just hidden in the nav.

## When adding a feature

1. If it writes to Firestore, add or extend the matching rule. A rule that
   allows the app to work but also allows anything else is not done.
2. If it shows data publicly, it reads a snapshot document.
3. If it changes scoring, add a case to `tests.html` first.
4. If it is an architectural choice, write an ADR in `docs/decisions/`.

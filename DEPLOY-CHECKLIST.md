# Deploy checklist — v8.8

Read this before pushing v8.8 to a live fest. Two of these steps are
**mandatory**: the app will appear broken without them.

---

## 1. Publish the security rules ⚠ REQUIRED

`firestore.rules` gained several new collections in v8.8. Until the file is
published, every feature below fails with *"You do not have permission to do
that"* — the code is correct, the rules simply are not live yet.

**Firebase console → Firestore Database → Rules → paste the whole of
`firestore.rules` → Publish.**

New or changed rules in v8.8:

| Collection | Who can read | Who can write | Why |
|---|---|---|---|
| `titles` | anyone | staff | Hand-awarded titles appear on the public results page |
| `adjustments` | anyone | **Admin only** | Moving a total by hand is the most consequential non-publish act |
| `scoreOverrides` | staff | Admin, and only before publish | Locked once published, same as `scores` |
| `houseContacts` | staff + that house | Admin only | **Holds phone numbers — must never be public** |
| `publicContacts` | anyone | staff | Only the numbers ticked as public |
| `substitutions` | *(changed)* | now also checks the event is open | Per-event substitution gate |
| `participants` | *(changed)* | now also allows a House Manager to create, in-window | Self-service roster |
| `constraintGroups` | anyone | Admin only | "At most N of these events" rules |
| `stageManagers` | anyone | Admin only | The account records for the new role |
| `stageArrivals` | staff + stage | staff + stage | Who has gone on; never an absence |
| `registrations` | *(changed)* | Stage may set **only** `codeLetter*`, and only before publish | Lettering without any other power |
| `judgingEntries` | *(changed)* | now also Stage, before publish | Lettering must reach the judges' view |
| `appeals` | staff, the filing house, judges on their own events | House files; staff decides once, terminally | Appeal system |
| `judgeAssignments` | *(changed)* | now also House (read only) | Filing an appeal denormalises the assigned judges onto it |

## 2. Add the composite index ⚠ REQUIRED IF USING SUBSTITUTIONS

The substitution duplicate-check queries `substitutions` by
`houseId + registrationId + status`. Firestore will refuse that query until
the index exists. The console's error message contains a direct link that
creates it in one click — open a substitution request once, follow the link.

## 3. Rebuild the public snapshots

Several v8.8 features are carried inside the public snapshot documents
(grade names, the House term, the category breakdown, championship
percentages). They appear only after a rebuild.

**Admin → Results → Republish**, or save anything in Settings.

---

## What each new feature needs before it does anything

Most of v8.8 is **off by default**, deliberately — an existing fest upgrades
with nothing visibly changed until it opts in.

| Feature | Turn on at |
|---|---|
| Rank-only scoring | Settings → Fest details → *Rank only by default* |
| Custom grades | Settings → Fest details → **Grades** |
| Rename "House" | Settings → Fest details → **Terminology** |
| Fest manual | Settings → Fest details → **Fest manual** (paste a Drive link) |
| Public Contact page | Settings → Fest details → Visibility → *Contact page visible* |
| House self-service roster | Settings → Fest details → Registration window |
| Championship by % | Settings → Leaderboard → **Top house metric** |
| Rename the boards | Settings → Leaderboard → **Board names** |
| Manual tie resolution | Settings → Leaderboard → **Manual tie resolution** |
| Titles | Admin → **Titles** |
| Adjustments | Admin → **Adjustments** |
| Substitutions, per event | Events → edit an event → *Substitutions* |
| Whole-team events | Events → edit a group event → *Whole-team event* |
| Exclude from totals | Events → edit an event |
| Event descriptions | Events → edit an event → *Description* |
| Registration extensions | Registrations → **Extend registration** |
| Score override | Judging → the **Override** column |
| Entry constraint groups | Settings → **Entry constraints** |
| Stage Manager | People → Accounts → **Stage Managers** (create a login) |
| Appeals | Settings → **Appeals** |

---

## Known limits, stated plainly

- **The fest manual is a link, not an upload.** A Firestore document caps at
  1 MiB and the Spark plan has no Cloud Storage, so a multi-MB PDF cannot
  live in the app. Host it on Drive and set sharing to *Anyone with the
  link*, or visitors hit a request-access screen.
- **A logo is capped at 1400 px / ~700 KB** and downscaled to fit. Before
  v8.8 a large logo silently exceeded the 1 MiB document limit and the save
  failed with nothing on screen. The cap cannot be removed — past 1 MiB the
  write does not degrade, it fails.
- **Phone numbers left unticked are not merely hidden.** They live in a
  staff-only collection and never reach any public document. That is why
  they are not stored on the house record, which is world-readable.

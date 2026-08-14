# Fest Tabulation — Architecture

**Specification, v8.7 — as built.** Supersedes v7.2.1.

Sections marked **⚠ NEW** do not exist in the shipped code. Sections marked
**⚠ FIX** exist but are wrong, with the root cause stated. Everything else is
as built and verified.

v8 is a large release. It adds a second way of awarding points, two new
classification axes, gradeless events, custom leaderboards, a reporting
suite, and a public template gallery — on top of five confirmed bug fixes and
a performance rework. Read §1 before anything else: the points model is the
part where a mistake is worst and hardest to notice.

---

## 0. Confirmed defects carried into v8

Four things were diagnosed against the running v7.2.1 code. All have exact
root causes; none need further investigation.

| # | Symptom | Root cause |
|---|---|---|
| B1 | Logging in lands on the public home; clicking *Log in* again opens the panel | `login()` awaits only `signInWithEmailAndPassword`. The `onAuthStateChanged` callback that reads the role document fires **after** it resolves, so `homeForRole()` runs while `session.role` is still `null` and returns `/`. |
| B2 | Mobile panel overlaps the page and the content is cut off | `.navpanel` sits at `left: var(--rail-w)` (76px) but is hidden with `translateX(-100%)`, which moves it by its **own width** only. 76px of the panel stays on screen. |
| B3 | Settings shows the same tabs twice | Regression from 7.2. The nav panel began deep-linking to tabs, but the in-page tab strip was left in place. Same on Accounts. |
| B4 | Certificate *Generate* produces nothing | `generateDialog()` builds its list from **published results only** (`participants.filter(p => byParticipant[p.id]?.length)`). Before any event is published, every participant is filtered out and the run reports "No participants match." It also hard-codes `rank <= 3`, ignoring the rank ladder. |

---

## 1. The points model — ⚠ NEW

### 1.1 What v7 does

```
points = rankPoints[eventClass][rank] + gradePoints[grade]
```

One rank ladder per event class, one shared grade table. The event class is
the only thing that can vary an award.

### 1.2 What v8 adds

An event may take its points from a **different axis** than its class.

**This is opt-in, explicit, and singular.** Three rules, in order of
importance:

1. **Nothing changes unless an Admin turns it on.** Settings → Points gains
   three independent switches: *award points by Stage*, *by Type*, *by Tier*.
   With all three off — the default, and what every existing fest gets on
   upgrade — scoring behaves exactly as v7.
2. **Each event names its own source.** When any switch is on, the event form
   gains a **Points from** field: *Event class* (default), *Stage*, *Type*, or
   *Tier*. Only the enabled axes appear as choices.
3. **Exactly one source applies.** There is no precedence chain, no fallback
   cascade, and no adding of ladders. The event names one source and that
   source alone decides its points. If the named source has no ladder
   configured, the event falls back to its class ladder and the compliance
   report flags it.

*Why singular rather than a precedence chain.* A precedence order (tier beats
type beats stage beats class) means the points an event awards depend on
which axes happen to be filled in elsewhere — so adding a tier ladder months
later silently re-values events nobody touched. An explicit per-event choice
is longer to configure and impossible to get wrong by accident.

### 1.3 Where ladders live

```
pointsConfig/{eventClass}          rankPoints  — as today, four documents
pointsConfig/stage_onStage         rankPoints, gradePoints?
pointsConfig/stage_offStage        rankPoints, gradePoints?
pointsConfig/type_{typeId}         rankPoints, gradePoints?
pointsConfig/tier_{tierId}         rankPoints, gradePoints?
```

A ladder document is created per **axis value**, not per axis — Speech gets
its own ladder, Song gets its own. An axis with one shared ladder would be
indistinguishable from the class ladder it replaced.

### 1.4 Grade points follow the same source

Grade points may also vary by axis. The event's single **Points from** choice
governs **both** its rank ladder and its grade table: choosing *Type* means
Speech's rank ladder and Speech's grade table.

A ladder document may define `rankPoints` only. When its `gradePoints` is
absent, the global `config/gradePoints` is used — so a fest that wants
different rank values but one shared grade scale configures exactly that and
nothing more.

### 1.5 Resolution, in one function

```js
// domain/scoring.js — the only place that answers "what is this worth?"
resolvePoints(event, axes) → { rankPoints, gradePoints, source, fellBack }
```

Every consumer calls it. Nothing else reads `pointsConfig` directly. `source`
and `fellBack` are returned so the Results screen can show which ladder was
applied and warn when an event fell back.

### 1.6 The rank ladder still defines how many ranks exist

Unchanged from v7 (§5.3): the number of positions carrying points **is** the
number of ranks the fest awards, and it drives the public rank limit. With
per-axis ladders this becomes per-event: an event on the Speech ladder awards
as many places as that ladder defines. `publicRankLimit` therefore takes the
**widest ladder in use** unless an Admin overrides it.

---

## 2. Classification — Type and Tier — ⚠ NEW

Two optional axes alongside Stage, each enabled independently in Settings.

- **Type** — what kind of programme: Speech, Song, Essay, Language
- **Tier** — its bracket: Grade 1, Grade 2

Stage is untouched and remains load-bearing: it drives split-by-stage
participant caps and the schedule.

```
programTypes/{id} = { name, sortOrder }
programTiers/{id} = { name, sortOrder }
events/{id}      += { typeId, tierId, pointsFrom }
```

Type and Tier do three things and nothing else:

1. **Filter** — every list, schedule and download can filter on them.
2. **Define custom leaderboards** (§5).
3. **Optionally carry points**, but only when §1.2's switch is on and the
   event names that axis.

Type may also carry its own participant cap ("no more than two Speech
programmes"), which joins the existing five caps in §4.

---

## 3. Gradeless events and direct results — AS BUILT

**Correction to the original spec:** direct events are judged by **judges**,
not only by an Admin. A judge assigned to a direct event sees a placement
dropdown where a score box would be. The earlier design made these Admin-only,
which was wrong.

A fest-wide **result policy** (`both` / `scored` / `direct`) sits above the
per-event choice. Forcing a mode hides the per-event field entirely — there is
no point offering a choice that is overridden. `effectiveResultMode()` is the
only place that question is answered.



Two independent per-event settings. B4's fix and these share a screen, but
they are separate ideas.

### 3.1 `awardsGradePoints` — default true

When false, the event's grade is still computed and displayed — a participant
still learns they got a B — but **contributes zero grade points**. Rank
points are unaffected.

### 3.2 `resultMode` — `scored` (default) or `direct`

| | `scored` | `direct` |
|---|---|---|
| Who enters | judges, as marks | Admin, in Judging |
| What is entered | a score out of `scoreScale` | a **rank chosen from a dropdown** of the event's ladder positions, plus optionally a grade |
| Ranking | computed, dense | the operator's choice is authoritative |
| Ties | equal scores tie | two entries may be given the same rank; each takes that rank's full points |

`direct` exists for items settled off-system: an essay pile returned in rank
order, a quiz decided on paper. The rank dropdown lists exactly the positions
the event's ladder defines, plus *No place*.

**Grades in `direct` mode are picked, not derived.** There is no percentage to
derive from, and awarding zero grade points would quietly make a direct event
worth less than a scored one and distort house totals. When the event is also
`awardsGradePoints: false`, the grade field is hidden entirely and the result
is a placement alone.

`finalizeEvent()` still refuses to run until every entry has a placement, a
grade, or an Absent flag. Absence remains explicit and is never inferred.

---

## 4. Participant limits — AS BUILT

Two scopes coexist, deliberately, because they answer different questions.

**The participant's OWN category decides their limits — never the event's.**
That distinction is the whole point: a General event has no category, so
reading the event's category meant every per-category limit was silently
ignored on every General event.

| | Question it answers | What counts toward it |
|---|---|---|
| **Overall** | how many events, total? | everything, General included |
| **Class caps** | how many Category Individual events? | category events only — General sits outside |
| **Type / Tier caps** | how many Speech programmes, full stop? | every matching programme, General included |

The Type cap's *value* is read from the participant's own category — Junior
may allow 2 Speech, Senior 3 — but what is counted against it is not confined
to that category's events. Those are different scopes on purpose, and the
Settings screen says so where they are configured.

```
config/participantLimits = {
  …global caps…,
  perCategory: false,
  byCategory: { [categoryId]: { …same shape, plus… } },
  useTypeCaps: false, typeCaps: { [typeId]: { max, min } },
  useTierCaps: false, tierCaps: { [tierId]: { max, min } }
}
```

A category holding an override uses it **completely**; one without falls back
to the shared default. Never a field-by-field merge — a half-inherited cap set
cannot be explained to a House Manager being told "you cannot register this".

`splitByStage` is settable per category.

### 4.1 Recount, and why some settings refuse to save

Counter **keys** depend on settings: `splitByStage` decides whether counts go
to `categoryIndividual` or `categoryIndividual.onStage`; the Type/Tier
switches add `type:<id>` keys. Change one of those and historic counts sit
under keys nothing reads any more — so a participant can exceed a cap the app
believes they are nowhere near.

Two halves to the fix. **Recount** (Participants → Recount limits) rebuilds
every count from the actual registrations, and is idempotent. And any setting
that changes the counting *shape* **refuses to save** while registrations
exist until Recount has been run. Blocking is deliberate: a warning that can
be clicked past is not protection against silent miscounting.

## 4b. Substitutions — AS BUILT

v7 has one set of five caps applying to every participant in the fest:

```
overallMax + one max per event class (+ on/off-stage variants)
```

v8 keeps that as the default and adds an **optional per-category override**.

```
config/participantLimits = {
  …global caps as today…,
  perCategory: false,                  // master switch
  byCategory: { [categoryId]: { …the same five-cap shape… } }
}
```

- With `perCategory: false` — the default and what every upgrade gets —
  behaviour is identical to v7.
- With it on, a category holding an override uses it **completely**; a
  category with no override falls back to the global caps. There is no
  field-by-field merge, because a half-inherited cap set is impossible to
  reason about when a House Manager is told "you cannot register this".
- Type caps (§2) sit alongside and are checked in the same pass.

Maximums still hard-block with a message naming the specific cap. Minimums
still never block — they surface in the compliance report only.

---

## 5. Custom leaderboards — AS BUILT

An Admin defines any number of additional boards.

```
leaderboards/{id} = {
  name,                      // "Best in Speech"
  stageIds:  [],             // multi-select; empty = all
  typeIds:   [],             // multi-select; empty = all
  tierIds:   [],             // multi-select; empty = all
  categoryIds: [],           // empty = all
  eventIds:  [],             // ticking events REPLACES the axes above
  // Boards rank participants. Each row carries the participant's house,
  // because knowing who is on a board without knowing whose house they are
  // from is useless on the day.
  isPublic: false,           // Admin decides per board
  sortOrder
}
```

**They re-tally points already awarded. They never recalculate and never
reweight.** That single constraint is what guarantees "Best in Speech"
reconciles with the overall standings — every point on a custom board is a
point that also exists on the main one.

Boards marked public appear on `/results` as their own tab and are written
into `publicLeaderboard/main` as a `boards[]` array. Non-public boards are
staff-only and never enter a snapshot.

---

## 6. Reporting and downloads — ⚠ NEW

Every list below is available as **CSV and print/PDF**, and every one accepts
the standard filters — category, house, class, stage, type, tier.

| List | Selection |
|---|---|
| Winners | **multi-select ranks** (1st, 2nd, 3rd, …) |
| Grade-wise | **multi-select grades** (A, B, C, Without) |
| Rank + grade | one rank **and** one grade |
| Non-rank holders | select which ranks count as "holding a rank"; everyone else is listed |
| House roster with points | — |
| Below minimum caps | participants and houses under their minimums |
| Absentees | entries flagged Absent |
| Events with no entries | — |
| Per-participant summary | one row per participant: events, placements, grades, total |

Published results only. A list built from unpublished results would leak
placements before the announcement, which is the one thing the staged publish
workflow exists to prevent.

---

## 7. Chest number cards — ⚠ NEW

A printable card per participant carrying chest number, name, house,
category, photo, and **every event they are entered in**.

**Several cards per sheet**, laid out on a grid with cut guides — a fest of
600 participants is 600 sheets at one per page and about 75 at eight per
page. The count per sheet is chosen at generation time (2, 4, 6, 8, 9).

This is a **fixed layout, not a design-editor template**. The editor
positions elements in absolute millimetres against a single page; repeating
that across a grid would mean a second coordinate system inside the first.
The card takes the fest name, logo and house colour and is otherwise laid out
by the app.

Available as soon as registration closes — it does not wait for results.

---

## 8. Certificates and posters — ⚠ FIX

### 8.1 The B4 defect

Generation lists only participants who appear in a **published** result. Before
publication that set is empty and the run reports "No participants match",
which reads as the feature being broken.

**v8 contract:** generation covers three populations, chosen at run time.

| Population | Requires results? |
|---|---|
| Every registered participant | no — participation certificates print before results |
| Participants in published events | yes |
| Winners | yes |

### 8.2 Selection

The generate dialog gains the same selectors as §6: category, house, class,
stage, type, tier, **multi-select ranks**, **multi-select grades**, and
specific events. The hard-coded `rank <= 3` is replaced by the event's ladder
(§1.6).

### 8.3 Public template gallery — ⚠ NEW

An Admin may mark a saved design **public**. Public designs appear at
`/templates`, where anyone may browse and print them.

```
designs/{id} += { isPublic: false, publicLabel }
```

Two limits, stated plainly:

- A public design is printed with **fest-level tokens only** — fest name,
  school, date, logo. Participant tokens are left blank. Filling `{name}` for
  an arbitrary visitor would turn the gallery into a way to mint a
  certificate in anyone's name.
- Designs are public **individually**. There is no "publish all".

Anyone wanting their own certificate goes through chest-number lookup (§9),
which is authenticated by knowing the chest number and prints only that
participant's real results.

---

## 9. Chest number lookup — ⚠ EXTENDED

`/lookup` gains, for the searched participant:

- **every event they are entered in**, not only the ones with results
- a **status** per event
- their **placement** where one exists, their **grade** where the fest allows
  it, and their **total points**

| Status | Derived from |
|---|---|
| Not scheduled | no venue slot |
| Upcoming | slot start is in the future |
| Ongoing | now falls inside the slot window |
| Finished | slot has ended, result not published |
| Result published | `publicResults` exists for the event |

Status comes from the schedule snapshot, so it costs no extra reads.

**The v7 honesty rule stands.** A participant sees real placements only: a
finish outside the ranked positions carries no rank at all, because the
snapshot never wrote one. `showGradesForUnranked` still governs whether the
grade shows for such a finish.

---

## 10. Schedule — AS BUILT

### 10.0 Clash detection

Two invariants, answering different questions.

**One event, one slot** — refused outright. An event in two slots would have
two contradictory times, and nothing could resolve which is real.

**One PERSON, one place** — warned, never refused. A participant entered in
two overlapping events, or a judge assigned to two, is surfaced on the
Schedule screen with both venues and times. Checked across every venue and
every day at once, because the whole premise is that two venues run
simultaneously; a per-venue check would find nothing.

*Why warn rather than block.* Real fests overlap deliberately — an off-stage
essay runs while the main stage continues, and a participant may be excused
from one. Refusing to save would leave an organiser unable to express a
schedule they have already agreed with the people involved. The app knows the
times; it does not know who has been excused.

`domain/clashes.js` is pure: given timed slots and who is needed at each
event, it returns one row per clashing pair per person. Slots on different
days never compare, and touching slots (one ending exactly as another begins)
do not count as overlapping.



### 10.1 Slot editing

v7 can only remove and re-add a slot. v8 adds an edit dialog covering:

- **duration**
- **swapping the event** in an existing slot for another unscheduled one
- **moving** the slot to a different venue or day

The one-event-one-slot invariant (§5.8) is re-checked on every one of those,
globally across all venues and days — the v6 bug was checking only the venue
currently open.

### 10.2 A judge's own schedule — ⚠ NEW

The judge panel gains a **My schedule** view: their assigned events with day,
venue, start and end time, and scoring state (not started / in progress /
finalized). Built from the schedule snapshot filtered by their assignments —
no new reads.

---

## 11. The delete guard — AS BUILT

A second password, set during first-run setup, required before *Delete
everything* will run.

```
guard/deleteGuard = { hash, algo: "SHA-256", salt, updatedAt }
rules: allow read, write: if isAdmin();
```

The password is hashed with Web Crypto and a per-fest random salt. It is
never stored in plaintext and never in `config`, which is publicly readable.

**What this does and does not protect against, stated honestly.** It stops an
unattended logged-in machine, a misclick, and a Co-Admin who has borrowed the
screen. It does **not** stop a determined person who is already signed in as
Admin: with no server, the comparison happens in the browser, and anyone able
to run devtools can bypass a client-side check. Real protection against that
would need a Cloud Function, which requires the paid plan.

Changing or resetting it requires the current guard password **or** a Firebase
re-authentication with the Admin login — otherwise forgetting it would make
the fest permanently un-resettable.

---

## 12. Performance — ⚠ FIX

Saving takes three to four seconds. Four causes, stacked.

| # | Cause | Fix |
|---|---|---|
| P1 | **Every settings save runs a full `rebuildPublicSnapshots()`** — 4 collection reads, then one write per published event *plus one write per participant*. At 600 participants that is ~700 writes before the button releases. | Only saves that can change public output rebuild at all. Renaming a house rebuilds; changing the judging scale does not. |
| P2 | **The rebuild is on the save path.** The operator waits for it. | Writes commit and the dialog closes immediately; the rebuild runs behind a small *publishing…* indicator. |
| P3 | **Schedule rebuilds read slots one venue at a time** (N+1). | One pass, and only when the schedule actually changed. |
| P4 | **Nothing is cached.** Config documents are re-read on every render, and every dialog save refetches the whole page from Firestore. | Config docs cache for the session and invalidate on write. Saves update the in-memory row and repaint, instead of refetching. |

**The trade-off, stated.** Moving the rebuild off the save path means closing
the tab mid-rebuild leaves public pages behind the private data. A
`snapshotDirty` flag on `config/festSettings` survives reload and drives a
persistent **"Public pages need republishing"** banner with a one-press fix.
Silent staleness would be worse than the wait; a visible flag is not.

---

## 13. Interface — ⚠ FIX

**B2 — the mobile drawer.** `.navpanel` is offset by the rail width but hidden
by its own width, leaving 76px on screen over the content. It must translate
by `calc(-100% - var(--rail-w))`, and `.shell` needs `overflow-x: hidden` so a
wide table cannot scroll the whole page sideways.

The same pass covers the rest of the phone experience, which has never been
audited: tables that overflow become card lists below 720px, the design editor
declares itself desktop-only rather than failing quietly, and dialogs get a
sticky action bar so the primary button is never below the fold.

**B3 — duplicate tabs.** Where the nav panel deep-links to a section's tabs —
Settings and Accounts — the in-page tab strip is removed. The panel is the
navigation. Sections whose tabs are *not* in the nav (House Manager, Judge,
public Results) keep their strip.

**B1 — login.** `login()` resolves only once the session is ready **and
carries a role**, so `homeForRole()` cannot run against a half-populated
session. A login that succeeds against Firebase Auth but whose role document
cannot be read reports that explicitly rather than dropping the person on the
public home with no explanation.

---

## 14. Schema summary

New and changed collections:

| Collection | Change |
|---|---|
| `programTypes` / `programTiers` | **new** — `{ name, sortOrder }` |
| `pointsConfig` | **new documents** keyed `stage_*`, `type_*`, `tier_*` |
| `events` | `+ typeId, tierId, pointsFrom, awardsGradePoints, resultMode` |
| `config/participantLimits` | `+ perCategory, byCategory{}`, Type caps |
| `config/festSettings` | `+ pointsAxes{stage,type,tier}, useTiebreakers, snapshotDirty` |
| `leaderboards` | **new** — custom board definitions (§5) |
| `designs` | `+ isPublic, publicLabel` |
| `guard/deleteGuard` | **new** — salted hash, Admin-only |
| `directResults` | **new** — `{eventId}_{regId}` placement and grade for `direct` events |
| `publicLeaderboard/main` | `+ boards[]` for public custom boards |
| `participantPublic/{id}` | `+ per-event status` (§9) |

---

## 15. Testing

The v7 suite is 49 + 45 assertions across grading, ranking, caps, chest
numbers and the public rank limit. v8 adds pure-function cases for:

- `resolvePoints()` across all four sources, including fallback when the
  named ladder is missing — **the most important new tests in the release**
- grade points suppressed by `awardsGradePoints: false`
- direct-mode placement with ties taking full points
- per-category cap resolution, including fallback to global
- custom leaderboard tallies matching the main board for the same events
- rank/grade multi-select filters in the reporting suite

Untested, as before: everything touching Firestore, the DOM, and the design
editor.

---

## 16. Build order

1. **Fixes first** — B1 login, B2 mobile, B3 duplicate tabs, B4 certificate
   population, and the §12 performance rework. These land on the existing
   test suite and can ship independently.
2. **Classification** — Type and Tier as filters only, with no points
   involvement. Additive and low-risk.
3. **The points model** — §1, behind its switches, defaulting to exactly v7
   behaviour. Tests before UI.
4. **Gradeless and direct results** — §3, which depends on 3.
5. **Per-category limits** — §4.
6. **Custom leaderboards** — §5, which depends on 2.
7. **Reporting, chest cards, template gallery, lookup, schedule, delete
   guard** — §§6–11, which depend on nothing above and can be done in any
   order.

Steps 3 and 4 are where a mistake corrupts standings silently, which is why
they sit behind switches that default to off and why their tests are written
first.

---

## 17. To settle before step 3

Four points where I have made a choice rather than received one. Each has a
stated default that will be built unless overridden.

1. **One choice covers both ladders.** An event's *Points from* selection
   governs its rank ladder **and** its grade table together (§1.4). *Default:
   together.* The alternative — choosing the rank source and the grade source
   separately — is more flexible and considerably easier to misconfigure.
2. **Missing ladder behaviour.** An event naming an axis whose ladder was
   never filled in falls back to its class ladder and is flagged in the
   compliance report. *Alternative: refuse to finalize the event.* The
   fallback keeps a fest running on the day; the refusal catches the mistake
   earlier.
3. **Custom leaderboard scope.** Boards can rank students, houses, or both
   (§5). *Default: chosen per board.*
4. **Public template tokens.** Public designs print with fest-level tokens
   only, participant tokens blank (§8.3). Confirm that is acceptable — the
   alternative lets a visitor print a certificate carrying any name they type.

---

## 18. Unchanged from v7

Everything not named above. In particular: the free-tier constraints and the
snapshot architecture (§7 of v7), security rules as the only enforcement
boundary, blind judging enforced at the storage layer, dense ranking, absence
never inferred, the house-once/member-each group split, minimums never
blocking, and chest number formats.

---

## 19. v9 — as built

Everything in §§1–18 still holds. This section records what v9 added on
top, and the constraints that shaped each decision. Sections above were
written as a build spec; this one is written after the fact.

### 19.1 New collections

| Collection | Read | Write | Notes |
|---|---|---|---|
| `titles` | public | staff | Hand-awarded, no publish gate — awarding one *is* the publication |
| `adjustments` | public | **Admin** | Public because the totals it moves are public |
| `scoreOverrides` | staff | Admin, frozen once published | Replaces the *input*, never the rank |
| `houseContacts` | staff + own house | Admin | **Holds phone numbers — never public** |
| `publicContacts` | public | staff | Only the numbers ticked as public |
| `constraintGroups` | public | Admin | "At most N of these" |
| `stageManagers` | public | Admin | Account records for the fifth role |
| `stageArrivals` | staff + stage | staff + stage | Running-order tick. **Not** an absence |
| `appeals` | staff, own house, assigned judges | house creates, staff decides once | §19.4 |
| `eventMaterials` | staff, stage, own house | house submits, staff decides | §19.5 |
| `conversations` + `messages` | participants only | staff starts, participants reply | §19.6 |

### 19.2 The nine-tier cap hierarchy

`overall` → four roll-ups (`group`, `individual`, `category`, `general`) →
four classes, each optionally split by stage. `category` + `general`
partition the four classes, and so do `group` + `individual`, so any one
event is counted by exactly one cap from each pair — never twice by the same
cap. Every applicable tier is checked; the tightest one blocks.

⚠ **Behaviour change from v8.7.** `maxFor()` used to return null for
`generalIndividual` and `generalGroup`, so the two General cap boxes in
Settings were accepted and then silently ignored. They now apply. A fest
that had values sitting in those boxes will start enforcing them.

### 19.3 Group entries are teams

A group entry carries `teamLabel`, computed once at registration:
`"Red"` where a house may field one team, `"Red A"` / `"Red B"` where it may
field several (including where no cap is set, since a second team can appear
at any time and renaming the first afterwards would be worse).

Stored rather than derived, because a substitution changes the roster and a
cap can be edited later — an entry that renamed itself afterwards would look
like a different entry to anyone holding a printed sheet.

### 19.4 Appeals

Window opens automatically at publish, closes itself after
`appealWindowHours`. Requires `results.publishedAtMs` — plain epoch
milliseconds stored alongside the existing server timestamp, because
Security Rules can only compare `request.time` against a value they can
convert themselves. Events published before v9 have no such field and
therefore no window; both the rule and `appealWindowState()` independently
reach that same answer.

**A decision never moves points.** Upheld/Overturned is recorded with a
written reason; correcting an overturned result is a separate Score Override
or Adjustment. A third path that wrote scores directly would be a way to move
points with no reason attached — the exact thing those two mechanisms exist
to prevent.

The active-appeal limit is **queried, not tallied**: a house may hold N open
at once, and an Overturned appeal stops counting so being right frees the
slot. Deliberately not a rules-enforced tally document — appeals are rare and
every one is read by a human before anything follows from it, so a
double-submission race is a nuisance an Admin notices, not a silent overrun.
Same reasoning as constraint groups (§19.7).

### 19.5 Event material

Per-event opt-in, named by `event.materialLabel` ("Song title", "Prop list").
House submits one item per entry; staff approves oldest-first.

An approved title reaches a judge **through `judgingEntries`**, never by
reading `eventMaterials` — the same indirection the event description already
relies on, and the reason blind judging is enforced by what is stored rather
than what the UI hides. Shown even on a blind event: it describes the
performance, not the performer.

Stage can read `eventMaterials`, because assigning code letters rewrites
`judgingEntries`, and a Stage Manager re-lettering after an approval must not
blank the material back out.

### 19.6 Messaging

Off by default. Staff starts a conversation, personal or group, across any
role; every participant may reply.

Access is decided by the **query**, not by a `get()` per document:
`participantUids array-contains request.auth.uid`, matching the rule's
`request.auth.uid in resource.data.participantUids`. A `get()`-gated list
query is what failed for substitutions in v8.7 — Firestore cannot statically
prove a per-document rule holds across an unfiltered query and rejects the
whole thing.

The only live listener in the app, and therefore the only continuous read
cost. There is no push notification and cannot be one: Cloud Functions need
billing.

⚠ A Co-Admin cannot message the **Admin** by name. There is no queryable list
of Admin accounts — the model is one Admin created at setup — and `users`,
the role document itself, is readable only by its owner and an Admin. Every
other pairing works.

### 19.7 Constraint groups and reserved places

Both need a *query*, and the Web SDK cannot query inside a transaction — the
same constraint that produced the `entryCounts` tally. Both are therefore
evaluated **before** the transaction, and two simultaneous submissions could
each see room and both commit. That is a far milder failure than the cap race
the tally exists to prevent: a group is a fairness rule, not a bound on
points. Closing it properly would mean a tally document per
(participant, group). Documented rather than left to be discovered.

### 19.8 Leaderboard qualification

Three opt-in gates on **membership**, never on the sum: a qualifying
participant's total is still every point the board's axis filters matched.
Rank-or-grade N times; participant-category scope (`entryCategoryId`, the
participant's own category — distinct from the pre-existing `categoryIds`,
which scopes by the *event's*); and mutual exclusion.

Mutual exclusion is resolved by the **caller**, not by `tallyBoard()`:
`rebuildPublicSnapshots()` walks boards in `sortOrder` remembering who topped
each, so a board can exclude whoever tops an earlier one. Referencing itself
or a later board is a documented no-op.

⚠ `entryCategoryId` is new on stored result rows. An event finalized before
v9 does not carry it, so a category-scoped board shows nobody from that
event until it is **finalized** again — re-publishing alone is not enough.

### 19.9 The fifth role — Stage Manager

Two jobs: assign code letters, and tick entries in as they go on. Cannot
score, finalize or publish.

Reads registrations in full — they have to call the right people to the
stage, and blind judging is enforced against *judges* through
`judgingEntries`, not against everyone. May update **only** the three
`codeLetter*` fields (`affectedKeys().hasOnly`), and only before publish;
without that narrowing, "may update a registration" would also mean moving an
entry to another house.

`stageArrivals` is its own collection rather than a field on the registration
or an `entryFlag`. **Absence moves points; arrival does not.** Keeping them
apart means no later rule change here can be mistaken for the power to mark
somebody absent.

### 19.10 Testing

`tests.html` is now **213 assertions**, still pure logic and still needing no
Firebase connection.

⚠ The pass/fail summary had been computed mid-file since a point in this
file's history where that was the end — every `check()` added below it, which
by v9 was most of the suite, rendered its own row but was left out of the
total. The count was never really 149. Fixed by moving the summary last.

# Upgrading to v8.7

Replace the folder as usual. Then do these — the first is required.

## 1. Republish the security rules  ← REQUIRED

Firebase console → Firestore → Rules → paste `firestore.rules` → Publish.

v8 adds five collections that will not work without it:

| Collection | What breaks without the rules |
|---|---|
| `programTypes` / `programTiers` | Type & Tier cannot be saved |
| `directResults` | judges cannot record placements |
| `leaderboards` | custom boards cannot be created |
| `guard` | the delete-everything password |
| `substitutions` | requesting and approving a swap |
| `entryCounts`, `festDays` | (from v7) registration and the schedule |

## 2. Set a delete-everything password

Settings → Danger zone offers one if your fest predates v8. Optional, but
without it the wipe is protected only by your Admin password as before.

## 3. Run Recount if you already have registrations

Participants → **Recount limits**. v8.6 changed how a participant's limits are
decided — their own category now governs, not the event's — so counts written
under the old rule may be filed differently. Recount rebuilds every count from
the actual registrations. Safe at any time, safe to run twice.

## 4. Nothing else changes by itself

Every v8 scoring feature defaults to OFF. Existing events keep
`pointsFrom: "class"`, so standings are identical after upgrading. Turn
things on deliberately:

- **Type & Tier** — Settings → Type & Tier
- **Points by axis** — Settings → Points & grades
- **Minimum entries per house** — Settings → Fest details
- **Per-category participant limits** — Settings → Participant limits
- **Custom leaderboards** — Settings → Leaderboard
- **Public templates** — Certificates → *Share publicly* per design

---

# What changed

## v8.7 — clash detection, and finishing what v8.6 started

**Schedule clash detection.** The scheduler already refused to put one event
in two slots. It now also finds the clash that actually bites on the day: a
**person needed in two places at once** — a participant entered in two
overlapping events, or a judge assigned to two. Checked across every venue and
every day, since the whole point is that two venues run at once. Warned, never
blocked: overlaps are often deliberate, and only the organiser knows whether
someone is excused.

**Substitutions are now visible.** A request used to sit in a queue nobody had
a reason to open. There is a count on the menu item and a dashboard warning
while any are waiting, the Substitute button says when a request is already
pending instead of failing after the form is filled in, and a House Manager
sees when theirs was rejected and why.

**A result-policy change now reaches events already given code letters.** The
mode is baked into the judging document at lettering time, so switching the
fest policy afterwards left judges entering scores on an event finalize
treated as direct. Those documents are rewritten on change.

**Recount is always reachable**, and the block that sends you there now links
to it rather than naming a screen.

**`{type}` and `{tier}` fill on participation certificates** where every one
of that participant's results shares the same value. A mix stays blank, which
is honest rather than misleading.

**Tests for the parts that had none** — the multi-select filter used on ten
screens, chest card rendering, the event CSV round-trip that once silently
stripped every Type/Tier setting, and the substitution swap arithmetic
including cap refusal.

## v8.6

**Participant limits, reworked**
- A participant is measured against **their own category's** limits. Before,
  the *event's* category decided — so on a General event, which has no
  category, every per-category limit was silently ignored.
- A General event counts only towards the **overall** limit, never towards a
  category's class limits.
- **Type and Tier limits** — "at most 2 Speech programmes". The number comes
  from the participant's own category, but counts every matching programme
  they enter anywhere, General included.
- `split by stage` is settable per category.
- **Recount limits** rebuilds counts from registrations. Settings that change
  how entries are counted refuse to save until it has been run.
- The compliance report and the House Manager's shortfall column now use each
  participant's own limits, group by category, and name which limit set
  applied.

**Substitutions** — a House Manager requests a swap once registration closes;
an Admin or Co-Admin approves. Open until code letters are assigned. A swap
that would breach a cap is refused outright — otherwise substitution becomes
the quiet way around the fest's own limits. Nothing marks the swap publicly.

**Timezone, properly** — the fest's IANA zone is chosen at setup and daylight
saving is worked out per date, so a fest spanning a clock change stays right.
The previous fixed offset was correct only for zones without DST.

**Light and dark theme** — toggle in the top bar and the icon rail. Light is
the default deliberately: a hall projector in daylight needs it. Print is
always light.

**Fest-wide result policy** — force every event to Scored or Direct, or let
each event choose.

**Certificates** — batched printing for large runs, a **Print one** search by
chest number, `{type}` and `{tier}` tokens, and external photo links no longer
print as broken images.

**Custom boards** can target specific ticked events, which then replace the
axis filters entirely.

## v8.5 — audit fixes

- **Rank pickers read every ladder.** Winners reports and certificates
  computed their rank ceiling from the four class ladders alone, so a
  six-place Type or Tier ladder left 4th, 5th and 6th unselectable.
- **Event status uses the FEST's timezone**, captured from the Admin's
  browser at setup and correctable in Settings → Public display. Schedule
  times are wall-clock where the fest happens, so a spectator abroad no
  longer sees events flip Upcoming/Ongoing hours early.
- **Custom boards count zero-point entries** when summing, and drop only
  participants whose TOTAL is zero. Someone scoring 0 in one event and 5 in
  another was being dropped entirely.
- **A substituted points ladder is now visible.** Finalizing an event whose
  named axis has no ladder is allowed again, but the Results screen flags
  every affected event and Judging warns before you start.
- **Judging and finalize agree.** Judging resolved the ladder independently
  and could offer placements finalize would not award.
- **Withdrawing from a direct event deletes its placement**, which used to
  linger as an orphan.
- **Chest cards** print a silhouette rather than a broken image for
  participants whose photo is an external Drive link.
- **Type and Tier are shown**, not just filterable — on schedules (screen,
  CSV and print) and as a column on the Events table.

## v8.3 — the rest of the feature list

- **Chest number cards** — Participants → *Chest number cards*. 2/4/6/8/9 per
  sheet with cut guides, photo, house colour and every event they are in.
  Code letters are deliberately omitted: they are the blind-judging secret.
- **Custom leaderboards** — named boards filtered by any mix of stage, type,
  tier and category. They re-tally points already awarded, never recalculate,
  so a board can never disagree with the main standings. Public ones appear
  as their own tab on the results page.
- **Public template gallery** at `/templates`. A visitor may type a name, but
  rank, grade and event stay blank so nobody can print a placement they did
  not win. Settings → Public display can lift that if you want it.
- **Chest lookup** now lists every event a participant is entered in, each
  with a status — Not scheduled, Upcoming, Ongoing, Finished, Result
  published — plus their total points.
- **Schedule slot editing** — change a duration, swap in a different event, or
  move a slot to another venue or day, without losing its place in the order.
- **Judge's own schedule** — a *My schedule* tab showing when and where each
  assigned event runs, and whether it has been scored.
- **Type & Tier filters** on all ten screens that list events.
- **Filters are multi-select** checkbox dropdowns, so "Junior AND Senior"
  works. The old chips allowed one value and wrapped over three lines.
- **Favicon and app icon** — the ExcelGuru mark, plus a web manifest so it
  installs to a phone home screen properly.

## v8.2 — reporting and the CSV fix

- **Eight result reports** in Downloads: winners (multi-select ranks),
  grade-wise (multi-select grades), rank+grade, non-rank holders,
  per-participant summary, house roster, absentees, events with no entries.
  Six shared filters, CSV and print for each.
- **Event CSV round-trip fixed.** Exporting and re-importing used to strip
  every Type, Tier and points setting silently. Those columns now exist.
  Types and Tiers named in a file are created automatically.
- **Direct events go to judges**, who pick a placement from the ladder
  instead of typing a mark.
- **Finalize refuses** when an event names a points axis with no ladder
  configured, rather than quietly using the class ladder instead.

## v8.1 — the points model

- **Type & Tier classification.**
- **Points by axis.** Settings turns an axis on; each event then names ONE
  source for its rank and grade points. No precedence chain, no adding
  ladders together.
- **Gradeless and direct events**, per event.
- **Per-category participant limits.**
- **Optional tiebreakers.**
- **Delete-everything password** — salted hash, Admin-only document. Worth
  being straight about what it is: a safety catch against an unattended
  machine or a misclick, not protection against someone already signed in as
  Admin who is willing to bypass a browser-side check. That would need a
  server.

## v8.0 — fixes

- Login landed on the public home instead of your panel.
- The mobile nav panel covered the page.
- Settings showed its tabs twice.
- Certificates produced nothing before results were published.
- Saving took 3–4 seconds; snapshot rebuilds now run behind the save with a
  visible indicator, and a flag survives reload if one is interrupted.

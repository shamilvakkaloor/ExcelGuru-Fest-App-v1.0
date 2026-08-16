// Pure functions — no Firestore, no DOM. This is the part of the system
// that must be right, so it is deliberately isolated and independently
// testable (open tests.html in a browser to run the checks).

/* ══ Grades ══════════════════════════════════════════════════════════
 *
 * A fest defines its own grades — A+/A/B/C/D, or just Pass, or the
 * original A/B/C — as an ordered list of { id, label, minPercent }.
 *
 * AN ID IS FOREVER; A LABEL IS NOT.
 * Every finalized result stores its grade by ID, and config/gradePoints is
 * keyed by ID. So renaming "C" to "Satisfactory" changes `label` and
 * nothing else: past results keep their meaning and no points table is
 * orphaned. Deleting a grade that results already reference is the one
 * genuinely destructive edit, and the editor refuses it.
 *
 * WITHOUT is not in the list. It is whatever falls below the lowest
 * threshold, so it cannot be removed and always exists; only its label is
 * configurable. Absent is never inferred here — the caller passes isAbsent.
 */
export const WITHOUT = "Without";

export const DEFAULT_GRADE_SCALE = [
  { id: "A", label: "A", minPercent: 85 },
  { id: "B", label: "B", minPercent: 70 },
  { id: "C", label: "C", minPercent: 50 }
];

/**
 * The fest's grade scale, however it happens to be configured.
 *
 * Fests created before custom grades hold `gradeThresholds: {aMin,bMin,cMin}`
 * and no scale. Reading both shapes here means old fests keep working with
 * no migration step and no rewrite of stored data.
 */
export function gradeScaleFrom(settings) {
  const scale = settings?.gradeScale;
  if (Array.isArray(scale) && scale.length) {
    return scale
      .map(g => ({ id: g.id, label: g.label || g.id, minPercent: Number(g.minPercent) }))
      .filter(g => g.id && !isNaN(g.minPercent))
      .sort((a, b) => b.minPercent - a.minPercent);
  }
  const t = settings?.gradeThresholds;
  if (t && [t.aMin, t.bMin, t.cMin].every(v => v !== undefined && v !== null)) {
    return [
      { id: "A", label: "A", minPercent: Number(t.aMin) },
      { id: "B", label: "B", minPercent: Number(t.bMin) },
      { id: "C", label: "C", minPercent: Number(t.cMin) }
    ];
  }
  return [...DEFAULT_GRADE_SCALE];
}

/** Display label for a stored grade id. */
export function gradeLabel(id, settings) {
  if (id === WITHOUT) return settings?.withoutLabel || WITHOUT;
  if (id === "Absent") return "Absent";
  return gradeScaleFrom(settings).find(g => g.id === id)?.label || id;
}

/**
 * Grade for a percentage score, as a stored ID.
 *
 * Accepts either the ordered scale or the legacy {aMin,bMin,cMin} object,
 * so every existing caller keeps working unchanged.
 */
export function gradeFor(percent, thresholdsOrScale) {
  const scale = Array.isArray(thresholdsOrScale)
    ? [...thresholdsOrScale].sort((a, b) => b.minPercent - a.minPercent)
    : gradeScaleFrom({ gradeThresholds: thresholdsOrScale });
  for (const g of scale) {
    if (percent >= g.minPercent) return g.id;
  }
  return WITHOUT;
}

/* ══ v8 — the points model ═══════════════════════════════════════════
 *
 * v7: points = rankPoints[eventClass][rank] + gradePoints[grade]. One
 * ladder per class, one shared grade table.
 *
 * v8 lets an event take BOTH its rank ladder and its grade table from a
 * DIFFERENT axis instead — Stage, Type or Tier. This is opt-in per axis in
 * Settings, and each event names exactly ONE source. There is no
 * precedence chain and no adding ladders together: the fest owner said
 * explicitly that at a time, one point source only. A fest that turns
 * nothing on behaves exactly as v7 — every event's pointsFrom defaults to
 * "class" and resolvePoints falls straight through to the class ladder.
 */

/** The document id a ladder is stored under, for a given source. */
export function ladderKey(pointsFrom, event) {
  if (pointsFrom === "stage")    return "stage_" + (event.stage || "onStage");
  if (pointsFrom === "type")     return "type_" + (event.typeId || "");
  if (pointsFrom === "tier")     return "tier_" + (event.tierId || "");
  // v9.2 — a mixed-category event's categoryId is already the FIRST of its
  // categoryIds (see events.js), so this reads the same ladder a
  // single-category event with that category would.
  if (pointsFrom === "category") return "category_" + (event.categoryId || "");
  return event.eventClass;                      // "class" — the default
}

/**
 * Resolve which rank ladder and grade table an event actually uses.
 *
 * `ladders` is a map of ladder-doc-id -> { rankPoints, gradePoints? },
 * covering every event class plus every stage/type/tier ladder that has
 * been configured. This is the ONLY function that should ever be asked
 * "what is this event worth" — every caller (finalize, aggregate,
 * downloads, certificates) goes through it rather than reading
 * pointsConfig directly, so there is exactly one place the rule lives.
 *
 * Falls back to the event's class ladder when the named source has no
 * ladder configured — a fest stays running on the day rather than a
 * missing document silently zeroing an event's points. `fellBack` is
 * returned so the caller can flag it (compliance report, Results screen).
 */
export function resolvePoints(event, ladders, globalGradePoints) {
  const from = event.pointsFrom || "class";

  // "custom" is not a ladder document at all — the points live on the event
  // itself, set by the Admin when this one event needs to be worth more (or
  // less) than its class/stage/type/tier would give it. No fallback: an
  // Admin who turns this on and leaves it empty gets zero, visibly, rather
  // than a silent reversion to the class ladder.
  if (from === "custom") {
    return {
      rankPoints: event.customRankPoints || {},
      // v9.2 — an event can also give its own grade points a different
      // value from the shared table, same choice every axis ladder
      // already offers. Leaving it off (customGradePoints null/absent)
      // keeps inheriting the shared table, same as before this existed.
      gradePoints: event.customGradePoints || globalGradePoints || {},
      source: "custom",
      fellBack: false
    };
  }

  const key = ladderKey(from, event);
  const classLadder = ladders[event.eventClass] || null;

  let source = from, fellBack = false, ladder = ladders[key];
  if (!ladder || !ladder.rankPoints) {
    ladder = classLadder;
    source = "class";
    fellBack = from !== "class";
  }

  return {
    rankPoints: ladder?.rankPoints || {},
    // A ladder document may define rankPoints only and lean on the shared
    // grade table — that is what lets a fest vary rank values per axis
    // while keeping one grade scale everywhere.
    gradePoints: ladder?.gradePoints || globalGradePoints || {},
    source,
    fellBack
  };
}

export function averageOf(scores) {
  const nums = scores.filter(s => typeof s === "number" && !isNaN(s));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Dense ranking, highest score first. Equal scores share a rank and the
 * next distinct score takes the next consecutive rank — so 90, 90, 80
 * ranks 1, 1, 2 (not 1, 1, 3).
 */
export function denseRank(entries) {
  const sorted = [...entries].sort((a, b) => b.averageScore - a.averageScore);
  let rank = 0, prev = null;
  return sorted.map(e => {
    if (prev === null || e.averageScore !== prev) { rank++; prev = e.averageScore; }
    return { ...e, rank };
  });
}

/**
 * Turn raw judge scores into a finished, ranked result table.
 *
 * entries: [{ regId, houseId, participantIds, codeLetter, scores:[n], isAbsent }]
 * Returns the same rows with averageScore, percent, rank, grade and points.
 */
export function computeResults(entries, { scoreScale, thresholds, rankPoints, gradePoints, awardsGradePoints = true }) {
  const absent = [];
  const scored = [];

  for (const e of entries) {
    if (e.isAbsent) {
      absent.push({
        ...e, averageScore: null, percent: null, rank: null, isAbsent: true,
        grade: "Absent", rankPoints: 0, gradePoints: 0, totalPoints: 0
      });
      continue;
    }
    const avg = averageOf(e.scores);
    if (avg === null) continue;            // caller must guarantee this cannot happen
    scored.push({ ...e, averageScore: avg, percent: (avg / scoreScale) * 100, isAbsent: false });
  }

  const ranked = denseRank(scored).map(e => {
    const grade = gradeFor(e.percent, thresholds);
    const rp = Number(rankPoints?.[e.rank] ?? 0);
    // awardsGradePoints:false — the grade is still shown (a participant
    // still learns they got a B) but contributes nothing. Rank points are
    // unaffected. Default true keeps every existing fest unchanged.
    const gp = awardsGradePoints ? Number(gradePoints?.[grade] ?? 0) : 0;
    return { ...e, grade, rankPoints: rp, gradePoints: gp, totalPoints: rp + gp };
  });

  return [...ranked, ...absent];
}

/**
 * Result table for a "direct" event — one where an Admin picks placements
 * by hand instead of judges scoring it (essays returned in rank order, a
 * quiz decided on paper).
 *
 * entries: [{ regId, houseId, participantIds, codeLetter, isAbsent,
 *              placement: number|null, grade: string|null }]
 *
 * Two rules that make this different from computeResults:
 *
 *  · The OPERATOR'S PLACEMENT IS AUTHORITATIVE. It is not recomputed from
 *    anything, so two entries may share a placement on purpose and each
 *    takes that placement's full points — exactly as dense ranking would
 *    have produced from equal scores.
 *  · The grade is PICKED, not derived — there is no percentage to derive
 *    it from, and defaulting to zero grade points would quietly make a
 *    direct event worth less than a scored one and distort house totals.
 *    When awardsGradePoints is false the grade is dropped entirely and
 *    the result is a placement alone.
 */
export function computeDirectResults(entries, { rankPoints, gradePoints, awardsGradePoints = true }) {
  return entries.map(e => {
    if (e.isAbsent) {
      return { ...e, rank: null, grade: "Absent", rankPoints: 0, gradePoints: 0, totalPoints: 0, isAbsent: true };
    }
    const rank = e.placement || null;
    const grade = awardsGradePoints ? (e.grade || null) : null;
    const rp = rank ? Number(rankPoints?.[rank] ?? 0) : 0;
    const gp = (awardsGradePoints && grade) ? Number(gradePoints?.[grade] ?? 0) : 0;
    return { ...e, rank, grade, rankPoints: rp, gradePoints: gp, totalPoints: rp + gp, isAbsent: false };
  });
}

/** Which direct-mode entries block a Finalize: no placement AND no Absent flag. */
export function directFinalizeBlockers(entries) {
  return entries.filter(e => !e.isAbsent && !e.placement).map(e => e.codeLetter || e.regId);
}

/**
 * Which entries block a Finalize. Every entry must have at least one score
 * or an explicit Absent flag — a missing score is never read as a zero.
 */
export function finalizeBlockers(entries) {
  return entries
    .filter(e => !e.isAbsent && averageOf(e.scores) === null)
    .map(e => e.codeLetter || e.regId);
}

/**
 * Roll finished events up into House and Participant totals.
 *
 * Two deliberately different rules, per the fest's scoring decision:
 *
 *  · HOUSE totals count each ENTRY once. A four-member group placing first
 *    earns the House the entry's points a single time, not once per member.
 *
 *  · PARTICIPANT pools credit every member of a group entry with the full
 *    entry points. These pools drive the Student Talent leaderboard only and
 *    are never rolled back into House totals, so there is no double counting.
 */
export function aggregate(events, resultDocs, houses, adjustments = []) {
  const housePoints = {};
  const participants = {};
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  // The legacy single number on the house record still counts, so fests
  // that used it before the adjustments ledger existed are unaffected.
  for (const h of houses) housePoints[h.id] = Number(h.adjustmentPoints || 0);

  /* Discipline and other manual adjustments — each one a record carrying
   * its own reason and description, rather than a single opaque number.
   * Applied here, alongside earned points, so one total is the only total
   * anybody has to reconcile. */
  for (const adj of adjustments || []) {
    const pts = Number(adj.points || 0);
    if (!pts) continue;
    if (adj.scope === "participant" && adj.targetId) {
      if (!participants[adj.targetId]) {
        participants[adj.targetId] = {
          categoryIndividualPoints: 0, categoryGroupPoints: 0,
          generalIndividualPoints: 0, generalGroupPoints: 0
        };
      }
      participants[adj.targetId].adjustmentPoints =
        (participants[adj.targetId].adjustmentPoints || 0) + pts;
      // A participant adjustment also moves their house, since a house
      // total is the sum of what its people did.
      if (adj.houseId) housePoints[adj.houseId] = (housePoints[adj.houseId] || 0) + pts;
    } else if (adj.targetId) {
      housePoints[adj.targetId] = (housePoints[adj.targetId] || 0) + pts;
    }
  }

  for (const res of resultDocs) {
    const ev = eventById[res.id];
    if (!ev) continue;
    // An excluded event is judged, ranked and published like any other; it
    // simply does not move a house total or a participant's pool. Filtering
    // here rather than at finalize keeps the event's own result intact, so
    // the flag can be turned off again without re-finalizing.
    if (ev.excludeFromTotals) continue;
    const poolField = {
      categoryIndividual: "categoryIndividualPoints",
      categoryGroup:      "categoryGroupPoints",
      generalIndividual:  "generalIndividualPoints",
      generalGroup:       "generalGroupPoints"
    }[ev.eventClass];

    for (const entry of res.entries || []) {
      const pts = Number(entry.totalPoints || 0);
      if (entry.houseId) housePoints[entry.houseId] = (housePoints[entry.houseId] || 0) + pts;

      for (const pid of entry.participantIds || []) {
        if (!participants[pid]) {
          participants[pid] = {
            categoryIndividualPoints: 0, categoryGroupPoints: 0,
            generalIndividualPoints: 0, generalGroupPoints: 0
          };
        }
        participants[pid][poolField] += pts;
      }
    }
  }
  return { housePoints, participants };
}

/**
 * House points split by category — who the category champions are.
 *
 * A General event has no category of its own, so its points are reported
 * under a "General" bucket rather than being spread across categories or
 * silently dropped. The per-category totals plus General therefore always
 * reconcile with the house's overall total, which is what makes this table
 * checkable against the main standings.
 */
export function categoryBreakdown(events, resultDocs, houses, categories) {
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const byHouse = {};
  for (const h of houses) byHouse[h.id] = { id: h.id, name: h.name, byCategory: {}, total: 0 };

  for (const res of resultDocs) {
    const ev = eventById[res.id];
    if (!ev || ev.excludeFromTotals) continue;
    const key = ev.categoryId || "__general";
    for (const entry of res.entries || []) {
      if (!entry.houseId || !byHouse[entry.houseId]) continue;
      const pts = Number(entry.totalPoints || 0);
      const row = byHouse[entry.houseId];
      row.byCategory[key] = (row.byCategory[key] || 0) + pts;
      row.total += pts;
    }
  }

  const columns = [
    ...categories.map(c => ({ id: c.id, name: c.name })),
    { id: "__general", name: "General" }
  ];

  // Winner per column, so the category champion is readable at a glance.
  const leaders = {};
  for (const col of columns) {
    let best = null;
    for (const row of Object.values(byHouse)) {
      const v = row.byCategory[col.id] || 0;
      if (v > 0 && (best === null || v > best.value)) best = { houseId: row.id, value: v };
    }
    if (best) leaders[col.id] = best;
  }

  return {
    columns,
    rows: Object.values(byHouse).sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name))),
    leaders
  };
}

/**
 * Championship-by-percentage: each house's points ÷ what it could
 * plausibly have earned, not ÷ every point in the fest.
 *
 * "Maximum earnable" is the sum of the best possible score across every
 * event the house is actually eligible for: every General event (open to
 * all houses by definition), plus every Category event in a category the
 * house has at least one participant in. A house fielding only Seniors and
 * Juniors is never compared against Subjunior events it structurally
 * cannot enter — that asymmetry is the entire point of this metric.
 *
 * Pure and read-only: it never recomputes a result, only what that result
 * could have been worth at best.
 */
export function championshipStandings({ events, houses, participants, housePoints, ladders, gradePoints }) {
  const eligibleCategories = {};
  for (const p of participants || []) {
    if (!p.houseId || !p.categoryId) continue;
    (eligibleCategories[p.houseId] ||= new Set()).add(p.categoryId);
  }

  const maxOf = obj => Object.values(obj || {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);

  const bestPossible = {};   // eventId -> points
  for (const ev of events || []) {
    if (ev.excludeFromTotals) continue;
    const { rankPoints, gradePoints: evGrade } = resolvePoints(ev, ladders, gradePoints);
    const awardsGrade = ev.awardsGradePoints !== false;
    bestPossible[ev.id] = maxOf(rankPoints) + (awardsGrade ? maxOf(evGrade) : 0);
  }

  const isGeneral = ev => ev.eventClass === "generalIndividual" || ev.eventClass === "generalGroup";

  const maxEarnable = {};
  for (const h of houses || []) {
    let total = 0;
    for (const ev of events || []) {
      if (ev.excludeFromTotals) continue;
      const eligible = isGeneral(ev) || (ev.categoryId && eligibleCategories[h.id]?.has(ev.categoryId));
      if (eligible) total += bestPossible[ev.id] || 0;
    }
    maxEarnable[h.id] = total;
  }

  const sorted = (houses || []).map(h => {
    const earned = Number(housePoints?.[h.id] || 0);
    const max = maxEarnable[h.id] || 0;
    return { id: h.id, name: h.name, points: earned, maxEarnable: max,
      percent: max > 0 ? Math.round((earned / max) * 1000) / 10 : 0 };
  }).sort((a, b) => b.percent - a.percent || String(a.name).localeCompare(String(b.name)));

  // Dense ranking, same rule as everywhere else: equal percentages share a
  // rank and the next distinct value takes the next consecutive one.
  let rank = 0, prev = null;
  return sorted.map(r => {
    if (prev === null || r.percent !== prev) { rank++; prev = r.percent; }
    return { ...r, rank };
  });
}

/** Leaderboard score for one participant, honouring the pool toggles. */
export function studentScore(pools, cfg) {
  let total = pools.categoryIndividualPoints || 0;
  if (cfg.includeCategoryGroupPoints)     total += pools.categoryGroupPoints || 0;
  if (cfg.includeGeneralIndividualPoints) total += pools.generalIndividualPoints || 0;
  if (cfg.includeGeneralGroupPoints)      total += pools.generalGroupPoints || 0;
  // Always counted, never behind a pool toggle: an adjustment is a
  // deliberate decision about this person, not a class of points a fest
  // might choose to leave out of the reckoning.
  total += pools.adjustmentPoints || 0;
  return total;
}

/** Pools not counted in the main score — the only valid tiebreakers. */
export function availableTieBreakers(cfg) {
  const out = [];
  if (!cfg.includeCategoryGroupPoints)     out.push("categoryGroupPoints");
  if (!cfg.includeGeneralIndividualPoints) out.push("generalIndividualPoints");
  if (!cfg.includeGeneralGroupPoints)      out.push("generalGroupPoints");
  return out;
}

/** Sort by total, then walk the tiebreak list until the tie resolves. */
export function rankLeaderboard(rows, tieBreakOrder = [], manualOrder = null) {
  /* `manualOrder` is a map of id -> position, set by an Admin after a toss
   * or a judges' decision. It is the LAST word before the alphabetical
   * fallback, never the first: a tie that the configured pools can settle
   * is still settled by the pools, so a manual entry left behind from an
   * earlier round cannot silently override real scoring. An id with no
   * entry sorts after every id that has one.
   *
   * Manual placements also SPLIT the rank — that is the whole point of
   * resolving a tie. Two rows left genuinely tied still share a rank
   * (co-toppers), which is what happens with tiebreakers switched off. */
  const manualOf = id => {
    const v = manualOrder?.[id];
    return (v === undefined || v === null || v === "") ? Infinity : Number(v);
  };

  const sorted = [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const key of tieBreakOrder) {
      const d = (b.pools?.[key] || 0) - (a.pools?.[key] || 0);
      if (d !== 0) return d;
    }
    const ma = manualOf(a.id), mb = manualOf(b.id);
    if (ma !== mb) return ma - mb;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  let rank = 0, prevTotal = null, prevManual = null;
  return sorted.map(r => {
    const mine = manualOf(r.id);
    // A new rank when the total changes, or when a manual placement
    // distinguishes this row from the previous one at the same total.
    const distinct = prevTotal === null || r.total !== prevTotal
      || (mine !== Infinity && mine !== prevManual);
    if (distinct) { rank++; prevTotal = r.total; prevManual = mine; }
    return { ...r, rank };
  });
}

/* ══ v8 — custom leaderboards ════════════════════════════════════════
 * A board is a FILTER AND SORT over points already awarded. It never
 * recalculates and never reweights — that constraint is what guarantees
 * "Best in Speech" reconciles with the overall standings: every point on a
 * custom board is a point that also exists on the main one.
 *
 * Boards rank PARTICIPANTS. Each row still carries the participant's house,
 * because knowing who is on the board without knowing whose house they are
 * from is useless on the day.
 */

/** Does this event belong on this board? Empty selection = no filter. */
export function boardMatchesEvent(board, event) {
  const has = (arr, v) => !arr?.length || arr.map(String).includes(String(v ?? ""));
  // An explicit event list, when present, is the whole rule — ticking
  // events by hand means "exactly these", not "these as well as the axes".
  if (board.eventIds?.length) return board.eventIds.map(String).includes(String(event.id));
  return has(board.stages, event.stage)
      && has(board.typeIds, event.typeId ?? "")
      && has(board.tierIds, event.tierId ?? "")
      && has(board.categoryIds, event.categoryId ?? "")
      && has(board.classIds, event.eventClass);
}

/**
 * Tally one board from published result documents.
 *
 * `resultDocs` are the same documents the main leaderboard reads, and the
 * points summed are the ones already stored on each entry — so a board can
 * never disagree with the standings it is drawn from.
 *
 * v9 — three qualification constraints, all opt-in and additive to the
 * plain point tally above:
 *
 *   QUALIFY (rank/grade, N times). board.qualifyMode is "" (off), "rank"
 *   or "grade". A participant's points still total everything the axis
 *   filters match, exactly as before — qualification gates MEMBERSHIP, not
 *   which points are summed, so a board that qualifies never disagrees
 *   with the SIZE of a total it does show, only with who is shown at all.
 *
 *   CATEGORY SCOPE (participant, not event). board.qualifyCategoryIds
 *   restricts by the PARTICIPANT'S own category (entry.entryCategoryId,
 *   taken from the entry's first member — the same convention reserved
 *   slots already uses, and the same limitation: a mixed-category group
 *   entry is scoped by whoever entered first). This is distinct from the
 *   existing board.categoryIds, which scopes by the EVENT's category and
 *   already existed — a general event has none, so that filter alone
 *   cannot express "Junior participants only" across general events.
 *
 *   MUTUAL EXCLUSION is NOT decided in here. `opts.excludeId`, if passed,
 *   is simply dropped from the totals before ranking — the caller (see
 *   publish.js) is the one walking boards in sortOrder and deciding who
 *   currently tops the referenced board, because that is inherently a
 *   cross-board question this function has no way to answer on its own.
 */
export function tallyBoard(board, resultDocs, eventById, meta = {}, opts = {}) {
  const totals = new Map();
  const qualifying = new Map();
  const mode = board.qualifyMode || "";
  const minCount = Math.max(1, Number(board.qualifyMinCount) || 1);
  const catScope = (board.qualifyCategoryIds || []).map(String);

  for (const res of resultDocs) {
    const ev = eventById[res.id];
    if (!ev || ev.excludeFromTotals || !boardMatchesEvent(board, ev)) continue;

    for (const entry of res.entries || []) {
      if (entry.isAbsent) continue;
      if (catScope.length && !catScope.includes(String(entry.entryCategoryId ?? ""))) continue;

      const pts = Number(entry.totalPoints || 0);
      const meetsQualify =
        mode === "rank"  ? (entry.rank != null && entry.rank <= (Number(board.qualifyMaxRank) || 1)) :
        mode === "grade" ? (board.qualifyGrades || []).includes(entry.grade) :
        false;

      // A zero-point entry is still COUNTED here rather than skipped: a
      // participant scoring 0 in one event and 5 in another must total 5,
      // not be dropped from the board entirely. Zero TOTALS are filtered
      // once at the end, matching the main Student Talent board.
      (entry.participantIds || []).forEach((pid, i) => {
        const cur = totals.get(pid) || {
          id: pid,
          name: (entry.participantNames || [])[i] || meta[pid]?.name || "",
          chestNumber: (entry.chestNumbers || [])[i] || meta[pid]?.chestNumber || "",
          houseName: entry.houseName || meta[pid]?.houseName || "",
          categoryName: meta[pid]?.categoryName || "",
          total: 0, events: 0
        };
        cur.total += pts;
        cur.events += 1;
        totals.set(pid, cur);
        if (meetsQualify) qualifying.set(pid, (qualifying.get(pid) || 0) + 1);
      });
    }
  }

  // Dense ranking, same rule as everywhere else in the app. Participants
  // who ended on nothing are left off, as on the main board — as is anyone
  // excluded by a mutual-exclusion rule, or who never met the qualifying
  // count this board asks for.
  const rows = [...totals.values()]
    .filter(r => r.total > 0)
    .filter(r => r.id !== opts.excludeId)
    .filter(r => !mode || (qualifying.get(r.id) || 0) >= minCount)
    .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
  let rank = 0, prev = null;
  return rows.map(r => {
    if (prev === null || r.total !== prev) { rank++; prev = r.total; }
    return { ...r, rank };
  });
}

/**
 * The highest place any ladder in this fest awards — v8.
 *
 * Every screen that offers a rank picker needs this, and each one computing
 * it from the four CLASS ladders alone was a real bug: a six-place ladder on
 * a Type or Tier left 4th, 5th and 6th unselectable in the Winners report
 * and the certificate generator, so those placements were invisible.
 *
 * Pass every pointsConfig document; the floor of 3 keeps a brand-new fest
 * sensible before anything is configured.
 */
export function highestRankAwarded(ladderDocs) {
  const counts = (ladderDocs || [])
    .filter(Boolean)
    .map(l => {
      const keys = Object.keys(l.rankPoints || {}).map(Number).filter(n => !isNaN(n) && n > 0);
      return keys.length ? Math.max(...keys) : 0;
    });
  return Math.max(3, ...counts);
}

// Pure functions — no Firestore, no DOM. This is the part of the system
// that must be right, so it is deliberately isolated and independently
// testable (open tests.html in a browser to run the checks).

/**
 * Grade for a percentage score.
 *   A / B / C  — highest threshold met
 *   Without    — scored, but under the C threshold (0% included)
 *   Absent     — never inferred here; the caller passes isAbsent explicitly
 */
export function gradeFor(percent, thresholds) {
  const { aMin, bMin, cMin } = thresholds;
  if (percent >= aMin) return "A";
  if (percent >= bMin) return "B";
  if (percent >= cMin) return "C";
  return "Without";
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
  if (pointsFrom === "stage") return "stage_" + (event.stage || "onStage");
  if (pointsFrom === "type")  return "type_" + (event.typeId || "");
  if (pointsFrom === "tier")  return "tier_" + (event.tierId || "");
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
export function aggregate(events, resultDocs, houses) {
  const housePoints = {};
  const participants = {};
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  for (const h of houses) housePoints[h.id] = Number(h.adjustmentPoints || 0);

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

/** Leaderboard score for one participant, honouring the pool toggles. */
export function studentScore(pools, cfg) {
  let total = pools.categoryIndividualPoints || 0;
  if (cfg.includeCategoryGroupPoints)     total += pools.categoryGroupPoints || 0;
  if (cfg.includeGeneralIndividualPoints) total += pools.generalIndividualPoints || 0;
  if (cfg.includeGeneralGroupPoints)      total += pools.generalGroupPoints || 0;
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
export function rankLeaderboard(rows, tieBreakOrder = []) {
  const sorted = [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const key of tieBreakOrder) {
      const d = (b.pools?.[key] || 0) - (a.pools?.[key] || 0);
      if (d !== 0) return d;
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  let rank = 0, prev = null;
  return sorted.map(r => {
    if (prev === null || r.total !== prev) { rank++; prev = r.total; }
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
 */
export function tallyBoard(board, resultDocs, eventById, meta = {}) {
  const totals = new Map();

  for (const res of resultDocs) {
    const ev = eventById[res.id];
    if (!ev || ev.excludeFromTotals || !boardMatchesEvent(board, ev)) continue;

    for (const entry of res.entries || []) {
      if (entry.isAbsent) continue;
      const pts = Number(entry.totalPoints || 0);
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
      });
    }
  }

  // Dense ranking, same rule as everywhere else in the app. Participants
  // who ended on nothing are left off, as on the main board.
  const rows = [...totals.values()]
    .filter(r => r.total > 0)
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

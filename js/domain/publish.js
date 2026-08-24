// Finalizing, publishing, and building the public snapshot documents.
//
// COST NOTE — this is the single most important design decision in the app.
// Public pages never read the raw `results` collection. They read one
// pre-built document per event plus one leaderboard document. A spectator
// loading /results costs 2–4 Firestore reads instead of several thousand,
// which is what keeps a whole fest inside the free tier's 50,000 reads/day.
import { getAll, getOne, put, remove, batchWrite, where, serverTimestamp } from "../lib/db.js";
import { computeResults, computeDirectResults, finalizeBlockers, directFinalizeBlockers,
         resolvePoints, ladderKey, aggregate, studentScore, rankLeaderboard,
         tallyBoard, gradeScaleFrom, championshipStandings, categoryBreakdown } from "./scoring.js";
import { PUBLISH_STATUS, DEFAULTS, EVENT_CLASSES, publicRankLimit, rankIsPublic,
         effectiveResultMode, houseTerm, housePluralTerm,
         eventCategoryIds, eventCategoryLabel } from "./constants.js";
import { wallClockToEpoch } from "../lib/timezone.js";

/* Bumped whenever a rebuild starts writing a field the public pages need.
 * Stamped onto publicLeaderboard as `snapshotBuild` — see the comment
 * where it is written. Bump this, not a date: the point is only to tell
 * "this snapshot predates the feature" from "the feature is broken". */
/* 4 — published results now carry categoryIds and categoryNames, so a
 * mixed event can be named "Junior and Senior" and can answer to each of
 * its categories in the public filter. A snapshot built before this has
 * neither, which is why the rebuild banner needs to notice. */
export const SNAPSHOT_BUILD = 4;

/** Load the four config documents every calculation needs. */
export async function loadConfig() {
  const [settings, gradePoints, limits, leaderboard, ...ladders] = await Promise.all([
    getOne("config", "festSettings"),
    getOne("config", "gradePoints"),
    getOne("config", "participantLimits"),
    getOne("config", "leaderboard"),
    ...EVENT_CLASSES.map(c => getOne("pointsConfig", c.id).catch(() => null))
  ]);
  const merged = { ...DEFAULTS.festSettings, ...(settings || {}) };
  return {
    settings:    merged,
    gradePoints: { ...DEFAULTS.gradePoints, ...(gradePoints || {}) },
    limits:      { ...DEFAULTS.participantLimits, ...(limits || {}) },
    leaderboard: { ...DEFAULTS.leaderboard, ...(leaderboard || {}) },
    ladders:     ladders.filter(Boolean),
    // How many places the public sees. Derived from the rank ladder unless
    // an Admin overrode it — ARCHITECTURE section 5.3 and 6.1.
    rankLimit:   publicRankLimit(merged, ladders.filter(Boolean))
  };
}

/** Everything needed to score one event: entries, their scores, absences. */
export async function loadEventEntries(eventId) {
  const [regs, scores, flags, direct, overrides] = await Promise.all([
    getAll("registrations", where("eventId", "==", eventId)),
    getAll("scores", where("eventId", "==", eventId)),
    getAll("entryFlags", where("eventId", "==", eventId)),
    // v8 — placements for "direct" events, where an Admin picks the order
    // instead of judges scoring. Empty for every scored event, so this
    // costs one read and changes nothing for existing fests.
    getAll("directResults", where("eventId", "==", eventId)).catch(() => []),
    getAll("scoreOverrides", where("eventId", "==", eventId)).catch(() => [])
  ]);
  const byReg = {};
  for (const s of scores) (byReg[s.regId] ||= []).push(s);
  const absentBy = Object.fromEntries(flags.map(f => [f.regId, !!f.isAbsent]));
  const directBy = Object.fromEntries(direct.map(d => [d.regId, d]));
  const overrideBy = Object.fromEntries(overrides.map(o => [o.regId, o]));

  return regs.map(r => {
    /* v9.2 — AN OVERRIDE IS ANOTHER MARK, AVERAGED IN — NOT A REPLACEMENT.
     *
     * Earlier this replaced the whole scores array with a single value,
     * which meant an Admin's one number silently outweighed however many
     * judges had actually scored the entry. It now joins the real marks as
     * one more input to the SAME average — a 3-judge entry with one
     * override becomes a 4-way average — which is what actually happens
     * when an Admin fills a missing judge's column too (that path has
     * always worked this way, via a `scores` doc under that judge's own
     * uid). The override still never touches rank/percent/grade/points
     * directly; those keep following from whatever the average comes out
     * to, exactly as before.
     *
     * A judge's individual mark can also be independently EXCLUDED
     * (`excluded: true` on that one `scores` doc) — a freeze for the one
     * entry it's wrong on, without touching that judge's marks anywhere
     * else. Excluded marks are kept in Firestore, not deleted, so
     * un-freezing restores the exact original number. */
    const ov = overrideBy[r.id];
    const realScores = (byReg[r.id] || [])
      .filter(s => !s.excluded)
      .map(s => Number(s.score));
    const allScores = ov && ov.value !== null && ov.value !== undefined
      ? [...realScores, Number(ov.value)]
      : realScores;
    return {
      regId: r.id,
      houseId: r.houseId,
      houseName: r.houseName || "",
      categoryId: r.categoryId || null,
      // The PARTICIPANT'S own category (from the first member), distinct
      // from categoryId above which is the EVENT's — null for a general
      // event regardless of who entered it. Board qualification scopes by
      // who a participant actually is, not which event they scored in.
      entryCategoryId: r.entryCategoryId || null,
      participantIds: r.participantIds || [],
      participantNames: r.participantNames || [],
      chestNumbers: r.chestNumbers || [],
      // A group entry is named as a team; carried from here to the public
      // snapshot so no screen has to re-derive it.
      teamLabel: r.teamLabel || "",
      wholeTeam: !!r.wholeTeam,
      codeLetter: r.codeLetter || "",
      entryNumber: r.entryNumber || 1,
      isAbsent: !!absentBy[r.id],
      scores: allScores,
      overridden: !!ov,
      overrideReason: ov?.reason || "",
      placement: directBy[r.id]?.placement ?? null,
      grade: directBy[r.id]?.grade ?? null
    };
  });
}

/**
 * Score, rank and store one event. Refuses if any entry has neither a score
 * nor an Absent flag — a blank is never treated as a zero.
 * Re-running simply recomputes: a score correction is "finalize again".
 */
/**
 * The ladder documents one event might use: always its class ladder (the
 * fallback), plus the one its `pointsFrom` names. Two reads at most, and
 * they are cached — pointsConfig is in the config cache in lib/db.js.
 */
async function loadLadders(event) {
  const out = {};
  out[event.eventClass] = await getOne("pointsConfig", event.eventClass).catch(() => null);
  const from = event.pointsFrom || "class";
  if (from !== "class") {
    const key = ladderKey(from, event);
    if (key) out[key] = await getOne("pointsConfig", key).catch(() => null);
  }
  return out;
}

/**
 * Everything finalize works out, with nothing written.
 *
 * Finalize and the Judging screen's preview both go through here, so the
 * table an Admin studies before committing cannot disagree with the result
 * they get — the alternative is a second implementation of the points model
 * that drifts. Unlike finalizeEvent this does NOT throw on blockers: a
 * preview of a half-scored event is exactly when it is most useful, so the
 * blockers are returned for the caller to show.
 */
export async function computeEventResult(eventId) {
  const event = await getOne("events", eventId);
  if (!event) throw new Error("Event not found.");

  const cfg = await loadConfig();
  const entries = await loadEventEntries(eventId);
  if (!entries.length) throw new Error("No entries are registered for this event.");

  // The fest policy can force a mode; effectiveResultMode() is the only
  // place that question is answered.
  const isDirect = effectiveResultMode(event, cfg.settings) === "direct";

  const blockers = isDirect
    ? directFinalizeBlockers(entries)
    : finalizeBlockers(entries);

  /* v8 — THE POINT SOURCE.
   *
   * resolvePoints() is the one place that answers "what is this event
   * worth". It reads the event's single `pointsFrom` choice and returns
   * that ladder's rank points and grade table, falling back to the class
   * ladder (and flagging it) when the named source has none configured.
   * Nothing here reads pointsConfig directly any more.
   */
  const ladders = await loadLadders(event);
  const { rankPoints, gradePoints, source, fellBack } =
    resolvePoints(event, ladders, cfg.gradePoints);

  /* Q3 — ALLOW, BUT WARN VISIBLY.
   *
   * A missing ladder falls back to the event's class ladder so the fest
   * keeps moving on the day. `pointsFellBack` is stored on the result and
   * surfaced on the Results and Judging screens — the whole point of the
   * flag is that the substitution is never silent. */

  const awardsGradePoints = event.awardsGradePoints !== false;

  const computed = isDirect
    ? computeDirectResults(entries, { rankPoints, gradePoints, awardsGradePoints })
    : computeResults(entries, {
        scoreScale:  Number(cfg.settings.scoreScale) || 100,
        thresholds:  gradeScaleFrom(cfg.settings),
        rankPoints, gradePoints, awardsGradePoints
      });

  // Participant names are copied into the result rows on purpose. It costs a
  // little duplication and saves reading the participants collection every
  // time a leaderboard is rebuilt.
  const rows = computed.map(e => ({
    regId: e.regId, houseId: e.houseId, houseName: e.houseName,
    categoryId: e.categoryId, entryCategoryId: e.entryCategoryId || null, codeLetter: e.codeLetter,
    participantIds: e.participantIds, participantNames: e.participantNames,
    chestNumbers: e.chestNumbers,
    teamLabel: e.teamLabel || "", wholeTeam: !!e.wholeTeam,
    averageScore: e.averageScore, percent: e.percent, rank: e.rank,
    isAbsent: e.isAbsent, grade: e.grade,
    // Carried onto the stored result so the override is visible on the
    // Results screen, not just at the moment it was applied.
    overridden: !!e.overridden, overrideReason: e.overrideReason || "",
    rankPoints: e.rankPoints, gradePoints: e.gradePoints, totalPoints: e.totalPoints
  })).sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999));

  return { event, isDirect, blockers, rows, source, fellBack, awardsGradePoints };
}

export async function finalizeEvent(eventId) {
  const { event, isDirect, blockers, rows, source, fellBack, awardsGradePoints } =
    await computeEventResult(eventId);

  if (blockers.length) {
    throw new Error((isDirect
      ? "Missing a placement or an Absent mark for: "
      : "Missing a score or an Absent mark for: ") + blockers.join(", "));
  }

  const existing = await getOne("results", eventId);
  await put("results", eventId, {
    eventId,
    eventName: event.name,
    eventCode: event.code || "",
    eventClass: event.eventClass,
    categoryId: event.categoryId || null,
    /* The whole set, so a published result can name every category it was
     * open to. categoryId above is only the first of them and is kept for
     * anything written before mixed events existed. */
    categoryIds: eventCategoryIds(event),
    // v8 — which ladder actually decided these points, and whether the
    // event's named source was missing and had to fall back. Surfaced on
    // the Results screen rather than silently swallowed.
    typeId: event.typeId || null,
    tierId: event.tierId || null,
    pointsSource: source,
    pointsFellBack: !!fellBack,
    resultMode: isDirect ? "direct" : "scored",
    awardsGradePoints,
    entries: rows,
    finalizedAt: serverTimestamp(),
    publishStatus: existing?.publishStatus === PUBLISH_STATUS.PUBLISHED
      ? PUBLISH_STATUS.PUBLISHED : PUBLISH_STATUS.FINALIZED,
    stagedForPublish: existing?.stagedForPublish ?? false
  });

  // Already-public results must reflect the correction immediately.
  if (existing?.publishStatus === PUBLISH_STATUS.PUBLISHED) await publishEvents([eventId]);
  return rows;
}

/**
 * Read-only simulation: what would standings look like if everything
 * currently checked were published? Nothing is written.
 */
export async function previewImpact(stagedEventIds) {
  const [events, houses, published] = await Promise.all([
    getAll("events"),
    getAll("houses"),
    getAll("results", where("publishStatus", "==", PUBLISH_STATUS.PUBLISHED))
  ]);
  const staged = [];
  for (const id of stagedEventIds) {
    if (published.some(r => r.id === id)) continue;
    const r = await getOne("results", id);
    if (r) staged.push(r);
  }
  const before = aggregate(events, published, houses);
  const after  = aggregate(events, [...published, ...staged], houses);

  return houses.map(h => ({
    houseId: h.id,
    name: h.name,
    before: before.housePoints[h.id] || 0,
    after:  after.housePoints[h.id]  || 0,
    delta: (after.housePoints[h.id] || 0) - (before.housePoints[h.id] || 0)
  })).sort((a, b) => b.after - a.after);
}

/**
 * Make results live. Admin only — Security Rules reject writes to the
 * `public*` collections from any other role, so this is enforced by the
 * database, not just by hiding the button.
 */
export async function publishEvents(eventIds) {
  if (!eventIds.length) return;

  const ops = eventIds.map(id => ({
    type: "set", path: "results", id,
    data: {
      publishStatus: PUBLISH_STATUS.PUBLISHED, stagedForPublish: false,
      publishedAt: serverTimestamp(),
      // Epoch milliseconds alongside the server timestamp — the appeal
      // window is computed in Security Rules, which can only compare
      // request.time against a plain number it can convert itself, the
      // same reason registration windows are stored as ms rather than a
      // Timestamp.
      publishedAtMs: Date.now()
    }
  }));
  await batchWrite(ops);
  await rebuildPublicSnapshots();
}

export async function unpublishEvent(eventId) {
  await put("results", eventId, { publishStatus: PUBLISH_STATUS.FINALIZED, stagedForPublish: false });
  await batchWrite([{ type: "delete", path: "publicResults", id: eventId }]);
  await rebuildPublicSnapshots();
}

/**
 * v9 — undo a finalize entirely, back to "not finalized". Scores and
 * absences are locked the moment a results doc exists (Security Rules gate
 * on that, not just on Published — see I22), so a correction now needs this
 * explicit step first rather than silently editing under a finalized result.
 *
 * Refuses on a published event — unpublish() first. That ordering is not
 * just a courtesy: the security rules only allow deleting a `results` doc
 * that is not published, precisely so a live public result can never
 * vanish out from under a spectator without an explicit unpublish first.
 */
export async function unfinalizeEvent(eventId) {
  const existing = await getOne("results", eventId);
  if (!existing) return;
  if (existing.publishStatus === PUBLISH_STATUS.PUBLISHED) {
    throw new Error("This event is published. Unpublish it on the Results screen first.");
  }
  await remove("results", eventId);
}

/**
 * Rebuild every public document from the published results.
 *
 * Deliberately a full rebuild rather than an incremental update: it costs
 * roughly one read per event (results store their entries inline) and
 * removes a whole category of drift bug where a correction leaves a stale
 * number on the public leaderboard.
 */
export async function rebuildPublicSnapshots() {
  const cfg = await loadConfig();
  const [events, houses, categories, results, types, tiers, adjustments] = await Promise.all([
    getAll("events"), getAll("houses"), getAll("categories"),
    getAll("results", where("publishStatus", "==", PUBLISH_STATUS.PUBLISHED)),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
    getAll("adjustments").catch(() => [])
  ]);
  // Only public boards enter a snapshot; staff-only boards never leave the
  // admin screens.
  const publicBoards = (await getAll("leaderboards").catch(() => []))
    .filter(b => b.isPublic)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const catName   = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const typeName  = Object.fromEntries(types.map(t => [t.id, t.name]));
  const tierName  = Object.fromEntries(tiers.map(t => [t.id, t.name]));
  const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const ops = [];

  /* Photos on the public results page — opt-in (Settings → Public display).
   *
   * Only for entries that are PUBLICLY RANKED, and capped per event. A photo
   * is base64 in Firestore (there is no Storage bucket on the free tier), so
   * a 20 KB portrait against every entry of a 60-entry event would push the
   * document toward Firestore's hard 1 MiB ceiling and take the whole event
   * offline — a far worse outcome than a missing thumbnail. An external
   * photoURL is preferred where one exists precisely because it costs a URL
   * instead of an image.
   *
   * The read only happens when the switch is on, so a fest that never turns
   * it on pays nothing for it. */
  const showPhotos = !!cfg.settings.resultsShowPhotos;
  const PHOTO_CAP_PER_EVENT = 12;
  let photoById = {};
  if (showPhotos) {
    const roster = await getAll("participants").catch(() => []);
    photoById = Object.fromEntries(roster.map(p =>
      [p.id, p.photoURL || p.photoData || null]).filter(([, v]) => v));
  }

  // ── One document per published event ──────────────────────────────
  for (const res of results) {
    const ev = eventById[res.id];
    // Budget spent per event, so one big group entry cannot use up the
    // whole document on portraits.
    let photoBudget = showPhotos ? PHOTO_CAP_PER_EVENT : 0;
    const photosFor = e => {
      if (!photoBudget || e.isAbsent || !rankIsPublic(e.rank, cfg.rankLimit)) return [];
      const out = [];
      for (const pid of (e.participantIds || [])) {
        if (!photoBudget) break;
        const src = photoById[pid];
        if (!src) continue;
        out.push(src);
        photoBudget--;
      }
      return out;
    };
    ops.push({
      type: "set", path: "publicResults", id: res.id, merge: false,
      data: {
        eventId: res.id,
        eventName: res.eventName || ev?.name || "",
        eventCode: res.eventCode || ev?.code || "",
        eventClass: res.eventClass || ev?.eventClass || "",
        /* "Junior and Senior" for a mixed event, so the public page names
         * every category that competed rather than just the first. */
        categoryName: eventCategoryLabel(
          { eventClass: res.eventClass || ev?.eventClass,
            categoryId: res.categoryId,
            categoryIds: res.categoryIds?.length ? res.categoryIds : eventCategoryIds(ev) },
          catName),
        categoryIds: res.categoryIds?.length ? res.categoryIds : eventCategoryIds(ev),
        /* Each category on its own, so the public page can offer "Junior"
         * as a filter and have a Junior+Senior event answer to it. The
         * combined categoryName above is for reading; this is for
         * matching. */
        categoryNames: (res.categoryIds?.length ? res.categoryIds : eventCategoryIds(ev))
          .map(id => catName[id]).filter(Boolean),
        // v8 — denormalised so public pages filter on Type/Tier with no
        // extra reads, exactly as categoryName already does.
        typeName: typeName[res.typeId ?? ev?.typeId] || "",
        tierName: tierName[res.tierId ?? ev?.tierId] || "",
        publishedAt: Date.now(),
        // The ACTUAL publish moment, carried from results.publishedAtMs —
        // publishedAt above is when this snapshot was last rebuilt, which
        // moves on any settings change and would make every event look
        // freshly published after one. The appeal window needs the real
        // moment, and House Managers cannot read the staff-only results
        // collection to get it any other way.
        publishedAtMs: res.publishedAtMs || null,
        publishStatus: res.publishStatus || "Published",
        entries: (res.entries || []).map(e => ({
          rank: e.rank, codeLetter: e.codeLetter,
          names: e.participantNames || [], chestNumbers: e.chestNumbers || [],
          teamLabel: e.teamLabel || "", wholeTeam: !!e.wholeTeam,
          houseId: e.houseId || null,
          houseName: e.houseName || houseName[e.houseId] || "",
          grade: e.grade, percent: e.percent === null ? null : Math.round(e.percent * 100) / 100,
          totalPoints: e.totalPoints, isAbsent: e.isAbsent,
          photos: photosFor(e)
        }))
      }
    });
  }

  // ── Totals ────────────────────────────────────────────────────────
  const { housePoints, participants } = aggregate(events, results, houses, adjustments);

  const houseRows = rankLeaderboard(houses.map(h => ({
    id: h.id, name: h.name, total: housePoints[h.id] || 0, pools: {}
  })), [], cfg.leaderboard.manualHouseOrder || null);

  // Championship-by-percentage is opt-in and reads the whole participant
  // roster plus every points ladder to work out what each house COULD have
  // earned — real cost, so it only runs when an Admin has actually turned
  // it on. "points" mode (the default) never pays for either read.
  let championship = null;
  if (cfg.leaderboard.championshipMode && cfg.leaderboard.championshipMode !== "points") {
    const [roster, ladderDocs] = await Promise.all([
      getAll("participants").catch(() => []),
      getAll("pointsConfig").catch(() => [])
    ]);
    const ladderMap = Object.fromEntries(ladderDocs.map(d => [d.id, d]));
    championship = championshipStandings({
      events, houses, participants: roster, housePoints, ladders: ladderMap, gradePoints: cfg.gradePoints
    });
  }

  // Names come from the result rows, so no participants read is needed here.
  const meta = {};
  for (const res of results) {
    for (const e of res.entries || []) {
      (e.participantIds || []).forEach((pid, i) => {
        meta[pid] ||= {
          name: (e.participantNames || [])[i] || "",
          chestNumber: (e.chestNumbers || [])[i] || "",
          houseId: e.houseId || null,
          houseName: e.houseName || houseName[e.houseId] || "",
          categoryId: e.categoryId || null
        };
      });
    }
  }

  const studentRows = rankLeaderboard(Object.entries(participants).map(([pid, pools]) => ({
    id: pid,
    name: meta[pid]?.name || "",
    chestNumber: meta[pid]?.chestNumber || "",
    houseId: meta[pid]?.houseId || null,
    houseName: meta[pid]?.houseName || "",
    categoryName: catName[meta[pid]?.categoryId] || "",
    pools,
    total: studentScore(pools, cfg.leaderboard)
  })).filter(r => r.total > 0),
    // v8 — tiebreakers are optional. Off, ties simply share a rank, exactly
    // like dense ranking anywhere else in the app.
    cfg.leaderboard.useTiebreakers === false ? [] : (cfg.leaderboard.tieBreakOrder || []));

  /* Photos on the Student Talent board — same opt-in switch and roster
   * (photoById, above) as a winner's photo on an event result, but capped
   * hard: this is ONE document shared by the whole fest, not one per event,
   * so an unbounded number of portraits here — a fest can have hundreds of
   * scoring participants — could push the whole leaderboard past
   * Firestore's 1 MiB ceiling and take it offline for everyone, not just
   * fail to show a thumbnail.
   *
   * The cap is the ONLY gate. An earlier version also required
   * rankIsPublic(r.rank, rankLimit), copying the rule an event result
   * follows — wrong here. rankLimit answers "how many PLACES does an event
   * publish", typically 3; a talent board is a ranked list ten or more rows
   * deep, so that gate gave the top three rows a photo and left every row
   * below them blank, which reads as broken rather than as a policy. Rows
   * are already in rank order, so taking them in order means the board
   * fills from the top and stops at the cap. */
  const TALENT_PHOTO_CAP = 30;
  let talentPhotoBudget = showPhotos ? TALENT_PHOTO_CAP : 0;
  for (const r of studentRows) {
    if (!talentPhotoBudget) break;
    const src = photoById[r.id];
    if (!src) continue;
    r.photo = src;
    talentPhotoBudget--;
  }

  // ── Per-participant lookup cards ──────────────────────────────────
  //
  // Merged, not overwritten: the registered event list is written when a
  // House Manager registers, and this only stamps results onto events that
  // have gone public.
  //
  // ARCHITECTURE section 6.2 — a participant sees REAL PLACEMENTS ONLY. A
  // finish outside the ranked positions carries no rank at all: not "7th",
  // not a dash pretending to be one. Unlike the display trim on /results,
  // this one is genuine — the rank is never written, so it cannot be read
  // out of the document either.
  //
  // The grade still goes out when the fest allows it, because for an
  // unranked entry the grade is the meaningful feedback.
  const showGrades = !!cfg.settings.showGradesForUnranked;
  const talentRank = Object.fromEntries(studentRows.map(r => [r.id, r.rank]));
  const talentTotal = Object.fromEntries(studentRows.map(r => [r.id, r.total]));

  /* v8 — per-event STATUS on the lookup card.
   *
   * Built from the schedule snapshot that was just rebuilt, so searching a
   * chest number costs the same one read it always did. Every event the
   * participant is entered in appears, not only the ones with results —
   * that is the point of the status column. */
  const slotByEvent = {};
  try {
    const sched = await getOne("publicSchedule", "main");
    for (const d of sched?.days || []) {
      for (const v of d.venues || []) {
        for (const sl of v.slots || []) {
          if (sl.eventId) slotByEvent[sl.eventId] = { date: d.date, start: sl.startTime, end: sl.endTime, venue: v.name };
        }
      }
    }
  } catch (e) { /* schedule not published — every event reads "Not scheduled" */ }

  const publishedIds = new Set(results.map(r => r.id));
  // Recorded from the Admin's browser; null on fests that predate it.
  const festZone = cfg.settings.festTimeZone ?? null;

  const cards = {};
  for (const res of results) {
    for (const e of res.entries || []) {
      const ranked = !e.isAbsent && rankIsPublic(e.rank, cfg.rankLimit);
      for (const pid of e.participantIds || []) {
        (cards[pid] ||= {})[res.id] = {
          name: res.eventName,
          code: res.eventCode || "",
          rank: ranked ? e.rank : null,
          ranked,
          grade: (ranked || showGrades) ? e.grade : null,
          points: e.totalPoints,
          isAbsent: !!e.isAbsent,
          published: true
        };
      }
    }
  }
  // Events with no result yet still belong on the card, with a status.
  const allRegs = await getAll("registrations");
  const eventNameById = Object.fromEntries(events.map(e => [e.id, e]));
  for (const r of allRegs) {
    for (const pid of r.participantIds || []) {
      const card = (cards[pid] ||= {});
      if (card[r.eventId]) continue;              // already has a published result
      const ev = eventNameById[r.eventId];
      card[r.eventId] = {
        name: r.eventName || ev?.name || "",
        code: ev?.code || "",
        rank: null, ranked: false, grade: null, points: 0,
        isAbsent: false, published: false
      };
    }
  }

  for (const [pid, events] of Object.entries(cards)) {
    for (const [eid, e] of Object.entries(events)) {
      e.status = eventStatus(eid, publishedIds, slotByEvent, Date.now(), festZone);
      const slot = slotByEvent[eid];
      if (slot) { e.venue = slot.venue || ""; e.startTime = slot.start || ""; e.date = slot.date || ""; }
    }
    ops.push({
      type: "set", path: "participantPublic", id: pid, merge: true,
      data: {
        events,
        // I22 — the total a spectator searching a chest number wants to see.
        totalPoints: talentTotal[pid] ?? 0,
        talentRank: talentRank[pid] ?? null,
        rankLimit: cfg.rankLimit,
        showGradesForUnranked: showGrades,
        updatedAt: Date.now()
      }
    });
  }

  ops.push({
    type: "set", path: "publicLeaderboard", id: "main", merge: false,
    data: {
      festName: cfg.settings.festName,
      updatedAt: Date.now(),
      /* Which build of this file wrote the snapshot. A rebuild is triggered
       * from a browser tab, so a tab opened before a deploy rebuilds using
       * the OLD module still in memory — the snapshot then silently lacks
       * whatever the new build adds, and looks identical to "the feature is
       * broken". Stamping the build makes the two distinguishable without
       * guessing: compare this against SNAPSHOT_BUILD in the deployed
       * source, and if it is behind, the tab needs a hard reload before
       * rebuilding. */
      snapshotBuild: SNAPSHOT_BUILD,
      config: cfg.leaderboard,
      houses: houseRows,
      championship,
      championshipMode: cfg.leaderboard.championshipMode || "points",
      // Category champions. Derived from the same published results as the
      // totals above, so the two can never disagree.
      categoryBreakdown: categoryBreakdown(events, results, houses, categories),
      students: studentRows,
      // v8 — public custom boards, tallied from the same published results
      // so they can never disagree with the standings above.
      //
      // v9 — SEQUENTIAL, not a bare map, because a board may exclude
      // whoever currently tops an earlier one (qualifyExcludesTopOf). Only
      // a board that already ran by the time this one is reached can be
      // referenced — publicBoards is sorted by sortOrder, so an Admin
      // controls the order simply by where a board sits in that list. A
      // board naming itself, or one later in the order, is a no-op:
      // documented rather than solved, the same choice made for the
      // constraint-groups registration race.
      boards: (() => {
        const built = [];
        const topOf = {};
        for (const b of publicBoards) {
          const excludeId = b.qualifyExcludesTopOf ? topOf[b.qualifyExcludesTopOf] : undefined;
          const rows = tallyBoard(b, results, eventById, meta, { excludeId });
          topOf[b.id] = rows[0]?.id;
          built.push({ id: b.id, name: b.name, rowLimit: b.rowLimit ?? null, rows });
        }
        return built;
      })(),
      eventCount: results.length,
      rankLimit: cfg.rankLimit,
      talentBoardLimit: Number(cfg.settings.talentBoardLimit) || 0,
      showGradesForUnranked: !!cfg.settings.showGradesForUnranked,
      slideshowRecentLimit: cfg.settings.slideshowRecentLimit ?? 12,
      slideshowTalentByCategory: !!cfg.settings.slideshowTalentByCategory,
      // Slideshow composition. `?? true` rather than `!!` for the three
      // that default ON, so a fest whose settings predate them keeps
      // showing those slides instead of going blank.
      slideshowShowHouses: cfg.settings.slideshowShowHouses ?? true,
      slideshowShowTalent: cfg.settings.slideshowShowTalent ?? true,
      slideshowShowResults: cfg.settings.slideshowShowResults ?? true,
      slideshowCategoryBoards: !!cfg.settings.slideshowCategoryBoards,
      slideshowBoardIds: Array.isArray(cfg.settings.slideshowBoardIds) ? cfg.settings.slideshowBoardIds : [],
      slideshowSeconds: Math.max(3, Number(cfg.settings.slideshowSeconds) || 8),
      resultsShowPhotos: !!cfg.settings.resultsShowPhotos,
      // 0 is meaningful here ("show every house"), so no `|| 4` and no
      // Math.max(1, …) — either would erase the setting the Admin chose.
      homeHouseCards: cfg.settings.homeHouseCards === undefined || cfg.settings.homeHouseCards === null
        ? 4 : Math.max(0, Number(cfg.settings.homeHouseCards) || 0),
      // The fest's own grade names, so a public page can show them without
      // a second document read — the pattern every other setting here
      // already follows.
      gradeScale: gradeScaleFrom(cfg.settings),
      withoutLabel: cfg.settings.withoutLabel || "Without",
      houseTerm: houseTerm(cfg.settings),
      housePluralTerm: housePluralTerm(cfg.settings),
      rankArt: cfg.settings.rankArt || {},
      houseStyle: Object.fromEntries(houses.map(h =>
        [h.id, { color: h.color || null, logoData: h.logoData || null,
                  useAsNameColor: !!(h.color && h.useAsNameColor) }]))
    }
  });

  await batchWrite(ops);
  return { events: results.length, students: studentRows.length };
}

/**
 * Cascade each venue's start time down its slots, so the snapshot carries
 * real clock times rather than the app having to recompute them on every
 * public page load.
 */
function withTimes(venue, slots) {
  const ordered = slots.sort((a, b) => (a.order || 0) - (b.order || 0));
  let cursor = parseHHMM(venue.startTime) ?? 540;
  return ordered.map(s => {
    const start = cursor;
    cursor += Number(s.durationMin) || 0;
    return { ...s, startTime: fmtHHMM(start), endTime: fmtHHMM(cursor) };
  });
}
function parseHHMM(v) {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmtHHMM(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/**
 * Fest days, with a compatibility shim.
 *
 * v6 hung a `date` off each venue, which forced "Stage 1 on Day 1" and
 * "Stage 1 on Day 2" to be two venue records with the same name — and made
 * it impossible to list days in order without duplicating venues. v7 makes
 * the day its own record (ARCHITECTURE section 6.3).
 *
 * A fest built under v6 has no festDays documents, so days are synthesised
 * from the distinct venue dates. Nothing breaks on upgrade; the Schedule
 * screen writes real festDays the first time it is saved.
 */
export async function loadDays(venues) {
  const days = await getAll("festDays").catch(() => []);
  if (days.length) {
    return days
      .map(d => ({ id: d.id, date: d.date || "", label: d.label || "", order: d.order ?? 0 }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.order - b.order));
  }
  const dates = [...new Set((venues || []).map(v => v.date || ""))].sort();
  return dates.map((date, i) => ({
    id: "legacy_" + (date || "undated"),
    date,
    label: date ? "Day " + (i + 1) : "Unscheduled",
    order: i + 1,
    legacy: true
  }));
}

/** Which day does this venue/slot pair belong to, including legacy data? */
function dayIdFor(slot, venue, days) {
  if (slot?.dayId) return slot.dayId;
  if (venue?.dayId) return venue.dayId;
  const legacy = days.find(d => d.legacy && d.date === (venue?.date || ""));
  return legacy?.id || days[0]?.id || null;
}

/** A venue's opening time on a given day. */
export function venueStart(venue, dayId) {
  return venue?.dayStart?.[dayId] || venue?.startTime || "09:00";
}

/**
 * Public contact snapshot — only the numbers an Admin ticked as public.
 *
 * The filtering happens HERE rather than on the page, because a page-level
 * filter would still require the raw contact document to be publicly
 * readable to be filtered at all. Anything omitted from this document is
 * genuinely unreachable without a staff login.
 */
export async function rebuildContactSnapshot() {
  const cfg = await loadConfig();
  const [houses, contacts, book] = await Promise.all([
    getAll("houses"),
    getAll("houseContacts").catch(() => []),
    getOne("config", "contactBook").catch(() => null)
  ]);
  const byId = Object.fromEntries(contacts.map(c => [c.id, c]));

  const rows = [];
  for (const h of houses) {
    const c = byId[h.id];
    if (!c) continue;
    const people = [];
    const add = (role, name, phone, isPublic) => {
      if (!name && !(isPublic && phone)) return;
      people.push({ role, name: name || "", phone: isPublic ? (phone || "") : "" });
    };
    add("Manager", c.managerName, c.managerPhone, c.managerPhonePublic);
    add("Leader", c.leaderName, c.leaderPhone, c.leaderPhonePublic);
    add("Assistant leader", c.assistantLeaderName, c.assistantLeaderPhone, c.assistantLeaderPhonePublic);
    if (people.length) rows.push({ houseId: h.id, houseName: h.name, people });
  }

  await put("publicContacts", "main", {
    visible: !!cfg.settings.contactsVisible,
    updatedAt: Date.now(),
    houses: rows,
    // Free-form organiser contacts, entirely Admin-authored — everything
    // here is public by definition, since it is typed into a public list.
    organisers: (book?.entries || []).map(e => ({
      name: e.name || "", role: e.role || "", phone: e.phone || ""
    }))
  }, false);
}

/** Public schedule snapshot — rebuilt whenever the schedule is edited. */
export async function rebuildScheduleSnapshot() {
  const cfg = await loadConfig();
  const [venues, events, categories, types, tiers] = await Promise.all([
    getAll("venues"), getAll("events"), getAll("categories"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
  const typeName = Object.fromEntries(types.map(t => [t.id, t.name]));
  const tierName = Object.fromEntries(tiers.map(t => [t.id, t.name]));
  const days = await loadDays(venues);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));

  // One read per venue, not per day — slots carry their own dayId.
  const slotsByVenue = {};
  for (const v of venues) slotsByVenue[v.id] = await getAll(`venues/${v.id}/slots`);

  const mapSlot = s => {
    const ev = eventById[s.eventId];
    return {
      type: s.type, order: s.order,
      title: s.type === "break" ? (s.title || "Break") : (ev?.name || "—"),
      code: s.type === "event" ? (ev?.code || "") : "",
      categoryName: ev ? eventCategoryLabel(ev, catName) : "",
      categoryId: ev?.categoryId || null,
      categoryIds: ev ? eventCategoryIds(ev) : [],
      typeName: typeName[ev?.typeId] || "",
      tierName: tierName[ev?.tierId] || "",
      stage: ev ? (ev.stage === "onStage" ? "On stage" : "Off stage") : "",
      eventClass: ev?.eventClass || "",
      // Rules and criteria, so the public schedule can show them without a
      // second read per event.
      description: ev?.description || "",
      eventId: s.eventId || null,
      durationMin: s.durationMin || 0,
      startTime: s.startTime, endTime: s.endTime
    };
  };

  const dayOut = [];
  const flat = [];

  for (const d of days) {
    const venueOut = [];
    for (const v of venues) {
      const mine = (slotsByVenue[v.id] || []).filter(s => dayIdFor(s, v, days) === d.id);
      if (!mine.length) continue;
      const timed = withTimes({ startTime: venueStart(v, d.id) }, mine).map(mapSlot);
      venueOut.push({
        id: v.id, name: v.name, startTime: venueStart(v, d.id), slots: timed
      });
      flat.push({
        id: v.id, name: v.name, date: d.date || "", dayId: d.id, dayLabel: d.label,
        startTime: venueStart(v, d.id), slots: timed
      });
    }
    if (venueOut.length) {
      dayOut.push({ id: d.id, date: d.date || "", label: d.label, order: d.order, venues: venueOut });
    }
  }

  await put("publicSchedule", "main", {
    visible: !!cfg.settings.scheduleVisible,
    festName: cfg.settings.festName,
    updatedAt: Date.now(),
    days: dayOut,
    // Flat list retained so anything still reading `venues` keeps working.
    venues: flat
  }, false);
}

/**
 * Where an event stands, from a spectator's point of view — v8.
 *
 * Derived, never stored: the schedule and the publish state already say
 * everything, and a stored status would be one more thing to keep in step.
 */
export function eventStatus(eventId, publishedIds, slotByEvent, now = Date.now(), zone = null) {
  if (publishedIds.has?.(eventId) ?? publishedIds[eventId]) return "Result published";
  const slot = slotByEvent[eventId];
  if (!slot || !slot.date || !slot.start) return "Not scheduled";

  // DST-correct: the offset is resolved for THIS date, not captured once.
  const startAt = wallClockToEpoch(slot.date, slot.start, zone);
  if (startAt === null) return "Not scheduled";
  const endAt = slot.end ? (wallClockToEpoch(slot.date, slot.end, zone) ?? startAt + 30 * 60000)
                         : startAt + 30 * 60000;

  if (now < startAt) return "Upcoming";
  if (now <= endAt) return "Ongoing";
  return "Finished";
}



// Result reporting — ARCHITECTURE section 6.
//
// Every list here is built from PUBLISHED results only. A report drawn from
// unpublished results would leak placements before the announcement, which
// is the one thing the staged publish workflow exists to prevent.
//
// All of these are pure given their inputs, so the filtering rules are
// testable without a browser. The one import is domain/constants.js, which
// is equally pure and imports nothing itself.
import { entryCategoryOf } from "./constants.js";

/** Flatten published results into one row per participant per event. */
export function flattenResults(results, { events = [], categories = [], houses = [] } = {}) {
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
  const rows = [];

  for (const res of results) {
    const ev = eventById[res.id] || {};
    for (const e of res.entries || []) {
      (e.participantIds || []).forEach((pid, i) => {
        rows.push({
          participantId: pid,
          name: (e.participantNames || [])[i] || "",
          chestNumber: (e.chestNumbers || [])[i] || "",
          houseId: e.houseId || null,
          houseName: e.houseName || houseName[e.houseId] || "",
          eventId: res.id,
          eventName: res.eventName || ev.name || "",
          eventCode: res.eventCode || ev.code || "",
          eventClass: res.eventClass || ev.eventClass || "",
          /* A report row is one ENTRY, so it is filed under the category
           * that entry's participant is in. For an ordinary event that is
           * simply the event's category; for a mixed one it means a Junior
           * competing in a Junior+Senior event is reported as Junior,
           * which is what filtering by category has to mean to be useful. */
          categoryId: entryCategoryOf(ev, e) ?? res.categoryId ?? null,
          categoryName: (entryCategoryOf(ev, e) ?? res.categoryId)
            ? (catName[entryCategoryOf(ev, e) ?? res.categoryId] || "") : "General",
          typeId: res.typeId ?? ev.typeId ?? null,
          tierId: res.tierId ?? ev.tierId ?? null,
          stage: ev.stage || "",
          rank: e.isAbsent ? null : (e.rank ?? null),
          grade: e.grade ?? null,
          isAbsent: !!e.isAbsent,
          points: e.totalPoints ?? 0
        });
      });
    }
  }
  return rows;
}

/**
 * Winners — everyone who placed in one of the selected ranks.
 * An empty `ranks` means every placement.
 */
export function winnersList(rows, { ranks = [] } = {}) {
  const want = ranks.map(Number);
  return rows
    .filter(r => !r.isAbsent && r.rank)
    .filter(r => !want.length || want.includes(Number(r.rank)))
    .sort((a, b) => (a.rank - b.rank)
      || String(a.eventName).localeCompare(String(b.eventName))
      || String(a.name).localeCompare(String(b.name)));
}

/** Grade-wise — everyone holding one of the selected grades. */
export function gradeList(rows, { grades = [] } = {}) {
  const want = grades.map(String);
  return rows
    .filter(r => !r.isAbsent && r.grade)
    .filter(r => !want.length || want.includes(String(r.grade)))
    .sort((a, b) => String(a.grade).localeCompare(String(b.grade))
      || String(a.name).localeCompare(String(b.name)));
}

/** One rank AND one grade together — e.g. every 1st place that graded A. */
export function rankGradeList(rows, { rank, grade } = {}) {
  return rows
    .filter(r => !r.isAbsent)
    .filter(r => (rank ? Number(r.rank) === Number(rank) : true))
    .filter(r => (grade ? String(r.grade) === String(grade) : true))
    .sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)));
}

/**
 * Non-rank holders — took part, but placed in none of the ranks the fest
 * counts as "holding a rank".
 *
 * Deduplicated to one row per PARTICIPANT, not per entry: someone who came
 * 4th in three events is one person without a rank, not three. A
 * participant who placed in ANY selected rank anywhere is excluded
 * entirely — they are a rank holder, even if they also ran three other
 * events without placing.
 */
export function nonRankHolders(rows, { ranks = [], includeAbsent = false, gradeOrder = ["A", "B", "C", "Without"] } = {}) {
  const want = (ranks.length ? ranks : [1, 2, 3]).map(Number);
  const holders = new Set(
    rows.filter(r => !r.isAbsent && r.rank && want.includes(Number(r.rank)))
        .map(r => r.participantId));

  const byParticipant = new Map();
  for (const r of rows) {
    if (holders.has(r.participantId)) continue;
    if (r.isAbsent && !includeAbsent) continue;
    const cur = byParticipant.get(r.participantId) || {
      participantId: r.participantId, name: r.name, chestNumber: r.chestNumber,
      houseName: r.houseName, categoryName: r.categoryName,
      events: [], bestGrade: null, points: 0
    };
    cur.events.push(r.eventName);
    cur.points += r.points || 0;
    if (r.grade && r.grade !== "Absent") {
      // Best-to-worst, so it holds for any custom scale: gradeOrder is the
      // fest's own grades highest first, Without last. A grade this fest
      // does not currently define (e.g. from data recorded before a rename
      // or removal) sorts after everything the fest does define.
      const rankOf = id => { const i = gradeOrder.indexOf(id); return i === -1 ? gradeOrder.length : i; };
      if (!cur.bestGrade || rankOf(r.grade) < rankOf(cur.bestGrade)) cur.bestGrade = r.grade;
    }
    byParticipant.set(r.participantId, cur);
  }
  return [...byParticipant.values()]
    .map(p => ({ ...p, eventCount: p.events.length, eventList: p.events.join(", ") }))
    .sort((a, b) => String(a.houseName).localeCompare(String(b.houseName))
      || String(a.name).localeCompare(String(b.name)));
}

/** Every participant's placements rolled into one row each. */
export function participantSummary(rows) {
  const byId = new Map();
  for (const r of rows) {
    const cur = byId.get(r.participantId) || {
      participantId: r.participantId, name: r.name, chestNumber: r.chestNumber,
      houseName: r.houseName, categoryName: r.categoryName,
      events: 0, firsts: 0, seconds: 0, thirds: 0, placed: 0, absent: 0, points: 0, grades: []
    };
    cur.events++;
    cur.points += r.points || 0;
    if (r.isAbsent) cur.absent++;
    if (r.rank === 1) cur.firsts++;
    if (r.rank === 2) cur.seconds++;
    if (r.rank === 3) cur.thirds++;
    if (r.rank) cur.placed++;
    if (r.grade && r.grade !== "Absent") cur.grades.push(r.grade);
    byId.set(r.participantId, cur);
  }
  return [...byId.values()]
    .map(p => ({ ...p, gradeList: p.grades.join(", ") }))
    .sort((a, b) => b.points - a.points || String(a.name).localeCompare(String(b.name)));
}

/** House roster with points — one row per participant, grouped by house. */
export function houseRoster(rows) {
  return participantSummary(rows)
    .sort((a, b) => String(a.houseName).localeCompare(String(b.houseName))
      || b.points - a.points);
}

/** Entries marked Absent. */
export function absenteeList(rows) {
  return rows.filter(r => r.isAbsent)
    .sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)));
}

/** Events that nobody entered — from the events list, not the results. */
export function emptyEvents(events, registrations) {
  const used = new Set((registrations || []).map(r => r.eventId));
  return (events || []).filter(e => !used.has(e.id))
    .map(e => ({ code: e.code || "", name: e.name, eventClass: e.eventClass }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

/** The filter predicate every report shares. Empty array = no filter. */
export function reportFilter(sel) {
  const has = (arr, v) => !arr?.length || arr.map(String).includes(String(v ?? ""));
  return r =>
    has(sel.categoryIds, r.categoryId ?? "") &&
    has(sel.houseIds, r.houseId ?? "") &&
    has(sel.classIds, r.eventClass) &&
    has(sel.stages, r.stage) &&
    has(sel.typeIds, r.typeId ?? "") &&
    has(sel.tierIds, r.tierId ?? "");
}

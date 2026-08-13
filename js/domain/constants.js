// Vocabulary shared by the whole app. Change a label here and it changes
// everywhere — nothing else hard-codes these strings.

export const EVENT_CLASSES = [
  { id: "categoryIndividual", label: "Category Individual", group: false, general: false },
  { id: "categoryGroup",      label: "Category Group",      group: true,  general: false },
  { id: "generalIndividual",  label: "General Individual",  group: false, general: true  },
  { id: "generalGroup",       label: "General Group",       group: true,  general: true  }
];

export const CLASS_BY_ID = Object.fromEntries(EVENT_CLASSES.map(c => [c.id, c]));
export const classLabel = id => CLASS_BY_ID[id]?.label ?? id;
export const isGroupClass = id => !!CLASS_BY_ID[id]?.group;
export const isGeneralClass = id => !!CLASS_BY_ID[id]?.general;

export const STAGES = [
  { value: "onStage",  label: "On stage"  },
  { value: "offStage", label: "Off stage" }
];

export const GRADES = ["A", "B", "C", "Without", "Absent"];

export const PUBLISH_STATUS = {
  NOT_FINALIZED: "NotFinalized",
  FINALIZED:     "Finalized",
  PUBLISHED:     "Published"
};

// Binary by decision — see ARCHITECTURE §11.6. Records still holding the old
// "other" value are surfaced in the compliance report rather than rewritten
// silently, because quietly changing someone's recorded gender is not a
// migration the app should perform on its own.
export const GENDERS = [
  { value: "",       label: "—" },
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" }
];
export const LEGACY_GENDERS = ["other"];

export const ROLES = [
  { value: "admin",   label: "Admin"         },
  { value: "coAdmin", label: "Co-Admin"      },
  { value: "judge",   label: "Judge"         },
  { value: "house",   label: "House Manager" }
];

/* ── Chest number formats ─────────────────────────────────────────────
 * digits        101, 102 …            allocation: house range or one shared run
 * alphanumeric  RED-A01, RED-A02 …    seeded: admin types the first, we continue
 * alphabets     AAA, AAB …            seeded: same
 */
export const CHEST_FORMATS = [
  { value: "digits",       label: "Digits only" },
  { value: "alphanumeric", label: "Alphanumerical" },
  { value: "alphabets",    label: "Alphabets only" }
];

export const CHEST_ALLOCATIONS = [
  { value: "houseRange", label: "Each house owns a number range" },
  { value: "mixed",      label: "One shared sequence across all houses" }
];

/* ── v8 — classification and the points model ─────────────────────────
 * Type and Tier are optional axes alongside Stage. All three can carry
 * points, but only when Settings turns that on for the axis, and only for
 * an event that names it as its ONE point source — see domain/scoring.js
 * resolvePoints() for exactly how that resolution works.
 */
export const POINTS_FROM = [
  { value: "class", label: "Event class (default)" },
  { value: "stage", label: "Stage" },
  { value: "type",  label: "Type" },
  { value: "tier",  label: "Tier" }
];

/* Fest-wide policy. `both` keeps the per-event choice; the other two force
 * every event to one mode and hide the per-event field entirely — there is
 * no point offering a choice that is overridden. */
export const RESULT_POLICIES = [
  { value: "both",   label: "Let each event choose" },
  { value: "scored", label: "Every event is scored by judges" },
  { value: "direct", label: "Every event has its placement entered directly" }
];

/** The mode an event actually runs in, once the fest policy is applied. */
export function effectiveResultMode(event, settings) {
  const policy = settings?.resultPolicy || "both";
  if (policy === "scored" || policy === "direct") return policy;
  return event?.resultMode === "direct" ? "direct" : "scored";
}

export const RESULT_MODES = [
  { value: "scored", label: "Scored — judges enter marks" },
  { value: "direct",  label: "Direct — Admin enters the placement" }
];

export const DEFAULTS = {
  festSettings: {
    festName: "Our Fest",
    subtitle: "",
    schoolName: "",
    scoreScale: 100,
    gradeThresholds: { aMin: 85, bMin: 70, cMin: 50 },
    registrationWindow: { start: null, end: null },
    blindJudgingDefault: true,
    scheduleVisible: false,
    resultsVisible: true,
    logoData: null,          // uploaded typography lockup, base64
    useLogo: false,          // show the lockup instead of the fest name
    logoScale: 100,          // percent — scales the lockup everywhere it appears
    runningEventId: null,    // manual override for the "now on" banner
    runningEventAuto: true,  // otherwise derived from the schedule

    // ── v7 ──────────────────────────────────────────────────────────
    chestFormat: "digits",
    chestAllocation: "houseRange",
    useMinEntryCaps: false,
    publicRankLimit: null,       // null = derive from the rank ladder
    talentBoardLimit: 10,        // 0 = show all
    showGradesForUnranked: false,
    rankArt: {},                 // { "1": dataUrl, … } — overrides the built-ins

    // ── v8 ──────────────────────────────────────────────────────────
    // Each switch turns on POINTS for that axis. Off by default, so an
    // event's pointsFrom stays "class" everywhere and scoring is
    // unchanged from v7 until an Admin deliberately opts in.
    pointsAxes: { stage: false, type: false, tier: false },
    useTypeTier: false,          // shows Type/Tier as filters even with no points
    useTiebreakers: true,        // off hides the tiebreaker order entirely
    hasDeleteGuard: false,       // set once guard/deleteGuard exists
    publicTemplatesFreeText: false, // restricted by default — see pages/templates.js
    resultPolicy: "both",           // both | scored | direct — see effectiveResultMode()
    // Rank-only scoring, fest-wide. An event still decides for itself
    // (events.awardsGradePoints); this only sets what a NEW event starts as,
    // the same way blindJudgingDefault does. Turning it on later does not
    // silently restate what existing events are worth.
    gradelessDefault: false,
    // v8.8 — renaming "House" (e.g. to "Team", "Zone"). Everywhere that
    // reads this goes through houseTerm()/housePluralTerm() in this file,
    // so a fest that never touches it sees literally "House" — the
    // vocab-substitution pattern Type/Tier already established.
    houseTermSingular: "House",
    houseTermPlural: "Houses",
    // The fest's own timezone, captured from the Admin's browser at setup.
    // Schedule times are wall-clock in THIS zone, not the reader's.
    // IANA zone name, e.g. "Asia/Kolkata". Resolved per date so daylight
    // saving is handled; see lib/timezone.js.
    festTimeZone: null
  },
  gradePoints: { A: 5, B: 3, C: 1, Without: 0 },
  participantLimits: {
    overallMax: null, overallMin: null,
    categoryIndividual: { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },
    categoryGroup:      { max: null, min: null },
    generalIndividual:  { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },
    generalGroup:       { max: null, min: null },

    // ── v8 — per-category overrides ──────────────────────────────────
    // With perCategory off (default), every category shares the caps
    // above, exactly as v7. Turned on, a category holding an entry in
    // byCategory uses it COMPLETELY in place of the global caps — never a
    // field-by-field merge, because a half-inherited cap set is
    // impossible to reason about when a House Manager is told "you
    // cannot register this."
    perCategory: false,
    byCategory: {}               // { [categoryId]: <same five-cap shape> }
  },
  rankPoints: { 1: 5, 2: 3, 3: 1 },
  leaderboard: {
    includeCategoryGroupPoints: false,
    includeGeneralIndividualPoints: false,
    includeGeneralGroupPoints: false,
    splitByCategory: true,
    tieBreakOrder: ["categoryGroupPoints", "generalIndividualPoints", "generalGroupPoints"],
    useTiebreakers: true,         // v8 — off, ties simply share the same rank
    // v8.8 — "points" ranks houses by raw total, unchanged default.
    // "percentage" ranks by points earned ÷ maximum earnable, so a house
    // missing a whole category (no Subjuniors, say) is judged only against
    // what it could plausibly contest. "both" shows the raw table with the
    // percentage alongside rather than replacing it.
    championshipMode: "points"
  }
};

/** Zero-filled point pools — the shape every participant total uses. */
export const emptyPools = () => ({
  categoryIndividualPoints: 0,
  categoryGroupPoints: 0,
  generalIndividualPoints: 0,
  generalGroupPoints: 0
});

export const POOL_FIELD = {
  categoryIndividual: "categoryIndividualPoints",
  categoryGroup:      "categoryGroupPoints",
  generalIndividual:  "generalIndividualPoints",
  generalGroup:       "generalGroupPoints"
};

export const POOL_LABEL = {
  categoryIndividualPoints: "Category Individual",
  categoryGroupPoints:      "Category Group",
  generalIndividualPoints:  "General Individual",
  generalGroupPoints:       "General Group"
};

/**
 * Display label for an event: code, name and category together.
 *
 * ARCHITECTURE §11.1 — no screen composes an event label by hand. Every
 * list, table, picker, print sheet and CSV that names an event calls this,
 * so the category is never dropped on one screen and shown on another.
 */
export function eventLabel(event, catName) {
  if (!event) return "";
  const code = event.code ? event.code + " · " : "";
  const cat = isGeneralClass(event.eventClass)
    ? "General"
    : (catName?.[event.categoryId] || event.categoryName || "");
  return code + event.name + (cat ? " (" + cat + ")" : "");
}

/** Just the category part, for tables that give it its own column. */
export function eventCategoryLabel(event, catName) {
  if (!event) return "";
  return isGeneralClass(event.eventClass)
    ? "General"
    : (catName?.[event.categoryId] || event.categoryName || "—");
}

/** Code letters A…Z, then AA, AB… so an event is never capped at 26 entries. */
export function codeLetterAt(index) {
  let n = index, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/* ── Entry caps per house ─────────────────────────────────────────────
 * ARCHITECTURE §5.6. Both caps apply to all four event classes. Blank max
 * means unlimited; blank min means no minimum. Minimums NEVER block — a
 * house sits below its minimum for the whole registration period, so
 * blocking would make the last registration the only one that could pass.
 */

/** Normalise a cap field off an event document. null = not set. */
export function entryCap(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n) || n <= 0) return null;
  return Math.floor(n);
}

export const maxEntriesFor = event => entryCap(event?.maxEntriesPerHouse);
export const minEntriesFor = event => entryCap(event?.minEntriesPerHouse);

/**
 * Is this event complete for a house?
 *
 * When minimums are switched off fest-wide, or this event leaves the minimum
 * blank, one entry counts as complete — the sensible floor when no explicit
 * minimum is stated (ARCHITECTURE §11.5).
 */
export function entryCompletion(event, count, useMinCaps) {
  const min = useMinCaps ? minEntriesFor(event) : null;
  const need = min ?? 1;
  return { need, count, complete: count >= need, min };
}

/**
 * How many ranks does this fest award?
 *
 * The rank ladder is the single source of truth (ARCHITECTURE §5.3): the
 * number of positions carrying points IS the number of ranks. There is no
 * second setting to keep in sync.
 */
export function rankCountFromLadder(rankPoints) {
  const keys = Object.keys(rankPoints || {})
    .map(Number)
    .filter(n => !isNaN(n) && n > 0);
  return keys.length ? Math.max(...keys) : 0;
}

/**
 * How many ranks the public sees. An explicit admin override wins; otherwise
 * it follows the widest ladder across the four classes. 0 means "show all".
 */
export function publicRankLimit(settings, ladders) {
  const override = Number(settings?.publicRankLimit);
  if (settings?.publicRankLimit !== null && settings?.publicRankLimit !== undefined
      && settings?.publicRankLimit !== "" && !isNaN(override) && override >= 0) {
    return override;
  }
  const counts = (ladders || []).map(l => rankCountFromLadder(l?.rankPoints));
  const widest = counts.length ? Math.max(...counts) : 0;
  return widest || rankCountFromLadder(DEFAULTS.rankPoints);
}

/** Does this rank fall inside the public limit? limit 0 = everything shows. */
export function rankIsPublic(rank, limit) {
  if (!rank) return false;
  if (!limit) return true;
  return rank <= limit;
}

/* ── v8 — shared filter axis builders ────────────────────────────────
 * Every screen that filters events offers the same axes in the same
 * order, built here rather than assembled by hand nine times. An axis
 * with no values configured returns an empty option list, and filterBar
 * drops it — so a fest not using Type/Tier sees no extra controls.
 */
export function typeTierFilters({ types = [], tiers = [], enabled = true } = {}) {
  if (!enabled) return [];
  return [
    { key: "filterType", label: "Type", options: types.map(t => ({ value: t.id, label: t.name })) },
    { key: "filterTier", label: "Tier", options: tiers.map(t => ({ value: t.id, label: t.name })) }
  ].filter(f => f.options.length);
}

/** The filter keys an event row must expose for the axes above to work. */
export function eventFilterKeys(event, { catName } = {}) {
  return {
    filterCategory: isGeneralClass(event.eventClass) ? "__general" : (event.categoryId || ""),
    filterClass: event.eventClass || "",
    filterStage: event.stage || "onStage",
    filterType: event.typeId || "",
    filterTier: event.tierId || ""
  };
}

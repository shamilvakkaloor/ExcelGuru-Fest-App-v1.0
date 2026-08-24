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

/**
 * The fest's own word for "House" — e.g. "Team", "Zone", "Wing".
 *
 * The stored role value is always "house" and every collection is always
 * `houses`/`houseId`; only display text changes. Call wherever settings is
 * already loaded. Pages that don't load settings just to render one label
 * keep the literal word "House" — see lib/shell.js applyHouseTerm() for the
 * one place this needs no settings object (the nav, via a boot-time global).
 */
export const houseTerm = settings => (settings?.houseTermSingular || "House").trim() || "House";
export const housePluralTerm = settings => (settings?.houseTermPlural || "Houses").trim() || "Houses";

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
  { value: "house",   label: "House Manager" },
  // v9 — a fifth role for the person running the stage: assigns code
  // letters and ticks entries in as they go on. Deliberately narrow.
  { value: "stage",   label: "Stage Manager" }
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
  { value: "class",    label: "Event class (default)" },
  { value: "stage",    label: "Stage" },
  { value: "type",     label: "Type" },
  { value: "tier",     label: "Tier" },
  { value: "category", label: "Category" },
  /* Only ever offered on a mixed event — a single-category event has no
   * "mixed" ladder to read. One ladder covers every mixed event, rather
   * than one per combination of categories. */
  { value: "mixed",    label: "Mixed category" },
  { value: "custom",   label: "Custom for this event" }
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
    // What a judge sees on a NON-blind event — a blind one still shows code
    // letters only, regardless of any of these. All three default true so
    // an upgraded fest's judges see exactly what they always saw (name,
    // house) plus chest number now included with it. Turning judgeShowName
    // off on its own gives a middle ground between fully blind and fully
    // open: house and/or chest number visible, but no name to read off.
    judgeShowName: true,
    judgeShowHouse: true,
    judgeShowChest: true,
    scheduleVisible: false,
    resultsVisible: true,
    // The public hero band. Deliberately NOT tied to the viewer's dark-mode
    // preference: it is the organisers' artwork, so they choose it once and
    // every visitor sees the same thing. "dark" is what every fest already
    // has, so an upgrade changes nothing until someone picks otherwise.
    heroTheme: "dark",       // "dark" | "light"
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
    slideshowRecentLimit: 12,    // 0 = show every published event
    slideshowTalentByCategory: false,
    // ── Slideshow composition ───────────────────────────────────────
    // Which slides the projector cycles, and how long each one holds.
    // Defaults reproduce exactly what the slideshow showed before these
    // existed, so an upgraded fest sees no change until someone opts in.
    slideshowShowHouses: true,
    slideshowShowTalent: true,
    slideshowShowResults: true,
    slideshowCategoryBoards: false,  // house points, one slide per category
    slideshowBoardIds: [],           // custom leaderboards, by board id
    slideshowSeconds: 8,             // seconds per slide
    // Public results may carry the participant's photo. Off by default:
    // a photo is personal data and a results page is world-readable, so
    // showing one has to be a deliberate choice.
    resultsShowPhotos: false,
    // How many houses the home page podium shows. Was hard-coded to 4,
    // which cut off a fest with more.
    homeHouseCards: 4,
    // How many of the latest published events get a card in the home
    // page's "Just published" feed. Was hard-coded to 4 there too, with no
    // setting to change it — unlike the slideshow's own recent-results
    // limit, which already had one. 0 shows every published event.
    homeRecentResultsLimit: 4,
    rankArt: {},                 // { "1": dataUrl, … } — overrides the built-ins

    // ── v8 ──────────────────────────────────────────────────────────
    // Each switch turns on POINTS for that axis. Off by default, so an
    // event's pointsFrom stays "class" everywhere and scoring is
    // unchanged from v7 until an Admin deliberately opts in.
    pointsAxes: { stage: false, type: false, tier: false, category: false, mixed: false },
    /* Mixed-category events are off until a fest asks for them. An event
     * open to several categories at once changes how points, limits and
     * the public results read, so it is a decision a fest makes once
     * rather than something every event form offers by default. */
    mixedCategory: false,
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
    // v9 — renaming "House" (e.g. to "Team", "Zone"). Everywhere that
    // reads this goes through houseTerm()/housePluralTerm() in this file,
    // so a fest that never touches it sees literally "House" — the
    // vocab-substitution pattern Type/Tier already established.
    houseTermSingular: "House",
    houseTermPlural: "Houses",
    // v9 — the fest manual is LINKED, not uploaded. A real manual is
    // several MB and Firestore caps a document at 1 MiB, with no Cloud
    // Storage on the free tier — so the file lives in Drive and the app
    // holds the URL.
    manualUrl: "",
    manualLabel: "Fest manual",
    contactsVisible: false,   // v9 — the public Contact page is opt-in
    // v9 — House Managers adding their own participants. Off by default:
    // most fests want the roster centrally controlled. The window is
    // separate from the event registration window, because "who is in my
    // house" and "which events they enter" close at different moments.
    houseAddParticipants: false,
    houseAddWindow: { start: null, end: null },

    // I9 — Admin/Co-Admin registering participants on a house's behalf.
    // Switched on independently for each role. `...NeedsApproval` is not
    // hand-set — it is computed once, the moment a role's toggle flips from
    // off to on (see admin/settings.js): true if any registration already
    // existed, or the fest's registration window had already opened, at
    // that moment. Off (no approval) only for a fest that turned this on
    // before anyone had registered anything.
    allowAdminRegisterForHouse: false,
    adminRegOnBehalfNeedsApproval: false,
    allowCoAdminRegisterForHouse: false,
    coAdminRegOnBehalfNeedsApproval: false,

    /* v9 — automatic category assignment.
     *
     * "none" (default) keeps the manual dropdown. "class" derives the
     * category from the participant's class/grade, "dob" from their date
     * of birth, "both" tries each. When both are on and they disagree,
     * autoCategoryWinner decides — a real clash happens often enough
     * (a repeated year, a late admission) that refusing to guess would
     * stall data entry, and picking silently would be worse.
     */
    autoCategory: "none",           // none | class | dob | both
    autoCategoryWinner: "dob",      // dob | class — only consulted on a clash
    // The fest's own timezone, captured from the Admin's browser at setup.
    // Schedule times are wall-clock in THIS zone, not the reader's.
    // IANA zone name, e.g. "Asia/Kolkata". Resolved per date so daylight
    // saving is handled; see lib/timezone.js.
    festTimeZone: null,

    // v9 — appeals against a published result. Off by default: a fest
    // that never turns this on sees no new tab anywhere. The window opens
    // automatically at publish and closes itself; there is no separate
    // "open appeals" switch to remember to flip.
    appealsEnabled: false,
    // v9.2 — minutes, not hours. appealWindowHours stays only so a fest
    // that saved a window before this change still reads correctly; it is
    // never written again once appealWindowMinutes is saved.
    appealWindowHours: 24,
    appealWindowMinutes: 24 * 60,
    appealMaxActive: 2,
    // On by default — matches the behaviour before this was a choice, so an
    // existing fest's appeal flow does not silently change underneath it.
    appealFeeRequired: true,

    // v9 — messaging. Off by default: nothing about the nav or any
    // account changes until an Admin turns it on.
    messagingEnabled: false
  },
  gradePoints: { A: 5, B: 3, C: 1, Without: 0 },
  participantLimits: {
    overallMax: null, overallMin: null,

    /* ── v9 — the four ROLL-UP caps ──────────────────────────────────
     * Each spans two of the four classes, and each is opt-in: a null max
     * is no cap, so a fest that ignores these is unaffected. They sit
     * between `overall` and the per-class caps, and every one of them is
     * checked, so the tightest applicable cap is what blocks.
     *
     *   group      = categoryGroup      + generalGroup
     *   individual = categoryIndividual + generalIndividual
     *   category   = categoryIndividual + categoryGroup
     *   general    = generalIndividual  + generalGroup
     *
     * Note that `category` and `general` partition the four classes, and
     * so do `group` and `individual` — the same event is counted by one
     * cap from each pair, never twice by the same cap.
     */
    useRollupCaps: false,
    group:      { max: null, min: null },
    individual: { max: null, min: null },
    category:   { max: null, min: null },
    general:    { max: null, min: null },

    /* All four classes may now split by stage, not just the two
     * individual ones. When a class IS split, its own `max` still applies
     * as the combined cap across both stages — that is the "additionally"
     * in the spec: on-stage 2, off-stage 2, but no more than 3 in total. */
    categoryIndividual: { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },
    categoryGroup:      { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },
    generalIndividual:  { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },
    generalGroup:       { splitByStage: false, max: null, min: null, onStageMax: null, onStageMin: null, offStageMax: null, offStageMin: null },

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
    // v9 — "points" ranks houses by raw total, unchanged default.
    // "percentage" ranks by points earned ÷ maximum earnable, so a house
    // missing a whole category (no Subjuniors, say) is judged only against
    // what it could plausibly contest. "both" shows the raw table with the
    // percentage alongside rather than replacing it.
    championshipMode: "points",
    // v9 — the two built-in boards are renameable, so a fest can call
    // them what it actually calls them. Blank falls back to the defaults
    // below rather than showing an empty tab.
    houseBoardName: "",
    talentBoardName: "",
    // v9 — id -> position, set by an Admin to settle a tie the configured
    // pools cannot (a toss, a judges' decision). Empty for most fests.
    manualHouseOrder: {}
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
  const cat = eventCategoryLabel(event, catName);
  return code + event.name + (cat && cat !== "—" ? " (" + cat + ")" : "");
}

/* ── v9 — mixed-category events ────────────────────────────────────────
 *
 * An event may be open to SEVERAL categories at once — a handwriting
 * competition for Kids and Sub Junior together. That is stored as
 * `categoryIds: [...]`, and `categoryId` stays as it was for the ordinary
 * single-category case, so no existing event needs migrating and every
 * caller that only ever reads `categoryId` keeps working.
 *
 * The three states, in the order they are checked:
 *   general class          → open to everyone, no category at all
 *   categoryIds non-empty  → mixed: open to exactly those categories
 *   categoryId set         → the ordinary single-category event
 *
 * A mixed event still produces ONE combined ranking — everyone entered
 * competes against everyone else. It is a wider door, not a split result.
 */
export function eventCategoryIds(event) {
  if (!event || isGeneralClass(event.eventClass)) return [];
  const many = Array.isArray(event.categoryIds) ? event.categoryIds.filter(Boolean) : [];
  if (many.length) return [...new Set(many)];
  return event.categoryId ? [event.categoryId] : [];
}

/** Is this event open to a participant in `categoryId`? */
export function eventAcceptsCategory(event, categoryId) {
  if (!event || isGeneralClass(event.eventClass)) return true;
  const ids = eventCategoryIds(event);
  if (!ids.length) return true;              // no category set — treat as open
  return ids.includes(categoryId);
}

/** True when the event names more than one category. */
export function isMixedCategory(event) {
  return eventCategoryIds(event).length > 1;
}

/** Just the category part, for tables that give it its own column. */
export function eventCategoryLabel(event, catName) {
  if (!event) return "";
  if (isGeneralClass(event.eventClass)) return "General";
  const ids = eventCategoryIds(event);
  if (!ids.length) return event.categoryName || "—";
  const names = ids.map(id => catName?.[id]).filter(Boolean);
  if (!names.length) return event.categoryName || "—";
  return joinCategoryNames(names);
}

/**
 * The category column as the CSV writes it: "Kids + Sub Junior".
 *
 * Deliberately NOT the display label. The importer splits this column on
 * "+" to rebuild a mixed event, so the separator is a data format and has
 * to stay stable and unambiguous — a category could legitimately have the
 * word "and" in its own name, which would make an "and"-joined column
 * impossible to split back apart. Humans get eventCategoryLabel(); the
 * round trip gets this.
 */
export function eventCategoryExportLabel(event, catName) {
  if (!event) return "";
  if (isGeneralClass(event.eventClass)) return "";
  const names = eventCategoryIds(event).map(id => catName?.[id]).filter(Boolean);
  return names.join(" + ");
}

/**
 * "Junior and Senior" — the way a results sheet would say it out loud.
 *
 * A mixed event is announced as one event open to several categories, so
 * the label reads as a sentence rather than a formula: two names joined
 * with "and", three or more with commas and a final "and".
 */
export function joinCategoryNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return list[0] + " and " + list[1];
  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
}

/**
 * The category a single ENTRY should be counted under.
 *
 * For an ordinary event that is just the event's own category. For a mixed
 * event the entry belongs to whichever category the participant is in —
 * a Junior entering a Junior+Senior event is still a Junior, and their
 * points belong in the Junior column. `entryCategoryId` has been recorded
 * on every registration since v9 (see domain/registration.js); older
 * entries have none, so those fall back to the event's own category
 * rather than vanishing from the breakdown.
 */
export function entryCategoryOf(event, entry) {
  if (isGeneralClass(event?.eventClass)) return null;
  if (isMixedCategory(event) && entry?.entryCategoryId) return entry.entryCategoryId;
  return event?.categoryId || eventCategoryIds(event)[0] || null;
}

/** Code letters A…Z, then AA, AB… so an event is never capped at 26 entries. */
export function codeLetterAt(index) {
  let n = index, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/* ── Team identity for group entries ──────────────────────────────────
 *
 * v9 — a group entry is a HOUSE'S TEAM, not a bag of names. Identifying
 * it by its roster read badly everywhere it appeared ("Aisha, Ravi, Meera,
 * Tom" as a column heading) and broke down entirely when a substitution
 * changed a member mid-fest: the entry appeared to become a different
 * entry. So a group entry carries a stable name of its own.
 *
 * One entry per house needs no suffix — "Red" is unambiguous. Only when the
 * event permits more than one does it become "Red A", "Red B". An unlimited
 * event (no cap set) always suffixes, because a second team may appear at
 * any time and renaming the first one afterwards would be worse.
 */
export function teamName(event, houseName, entryNumber) {
  const name = houseName || "";
  if (!isGroupClass(event?.eventClass)) return name;
  if (maxEntriesFor(event) === 1) return name;
  return (name + " " + codeLetterAt(Math.max(0, (entryNumber || 1) - 1))).trim();
}

/**
 * How to name an entry on screen.
 *
 * Group: the team name. Individual: the participant. Falls back to a
 * derived team name for entries written before teamLabel existed, so no
 * migration is needed.
 */
export function entryLabel(reg, event) {
  if (!reg) return "";
  if (reg.wholeTeam) return reg.teamLabel || reg.houseName || "Whole team";
  if (isGroupClass(reg.eventClass || event?.eventClass)) {
    return reg.teamLabel || teamName(event || { eventClass: reg.eventClass }, reg.houseName, reg.entryNumber);
  }
  return (reg.participantNames || []).join(", ");
}

/**
 * Join parallel `names`/`chestNumbers` arrays into "Name #128, Name #129" —
 * wherever a name is shown, the chest number that actually identifies the
 * person in a crowded hall should be right next to it. Falls back to the
 * name alone when a chest number is missing for that slot, rather than
 * printing a stray "#".
 */
export function namesWithChest(names, chestNumbers) {
  return (names || []).map((n, i) => {
    const c = (chestNumbers || [])[i];
    return c ? `${n} #${c}` : n;
  }).join(", ");
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
    // An array, so a mixed-category event surfaces under EVERY category it
    // is open to — filterBar.matches() already accepts one.
    filterCategory: isGeneralClass(event.eventClass)
      ? "__general"
      : (eventCategoryIds(event).length ? eventCategoryIds(event) : ""),
    filterClass: event.eventClass || "",
    filterStage: event.stage || "onStage",
    filterType: event.typeId || "",
    filterTier: event.tierId || ""
  };
}

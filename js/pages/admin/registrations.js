import { el, card, field, input, select, button, table, toast, guard, notice, empty, modal, confirmDialog, badge, fmtDateTime, fromLocalInput, filterBar, hint } from "../../lib/ui.js";
import { getAll, getOne, put, patch, remove, batchWrite, where } from "../../lib/db.js";
import { codeLetterAt, classLabel, isGroupClass, eventLabel, entryLabel,
         eventFilterKeys, typeTierFilters, EVENT_CLASSES,
         eventCategoryIds, eventAcceptsCategory, maxEntriesFor } from "../../domain/constants.js";
import { registerEntry, registerMany, withdrawEntry, windowState } from "../../domain/registration.js";
import { DEFAULTS, effectiveResultMode } from "../../domain/constants.js";
import { ladderKey } from "../../domain/scoring.js";
import { session, is } from "../../lib/session.js";
import { compareChest } from "../../domain/chest.js";
import { avatar } from "../../lib/photo.js";
import { onBehalfAllowed, onBehalfNeedsApproval,
         onBehalfReady } from "../../domain/registrationRequests.js";

export default async function registrations(root) {
  root.appendChild(el("h1", { text: "Registrations" }));

  const [events, houses, settings, limits, categories, types, tiers, constraintGroups] = await Promise.all([
    getAll("events"), getAll("houses"), getOne("config", "festSettings"), getOne("config", "participantLimits"),
    getAll("categories"), getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
    getAll("constraintGroups").catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  // I9 — which role, if either, this account may register a house's
  // participants under. Neither toggle on: the feature stays invisible.
  const onBehalfRole = is.admin() && onBehalfAllowed("admin", settings) ? "admin"
    : is.coAdmin() && onBehalfAllowed("coAdmin", settings) ? "coAdmin" : null;

  if (!events.length) { root.appendChild(empty("No events yet", "Create events first.")); return; }

  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const picker = select([]);
  const panel = el("div");

  // A fest with many events makes "pick an event" from one flat
  // alphabetical list a real chore — the same filter bar every other
  // event picker in the app already carries (stage.js, house.js,
  // participants.js).
  const bar = filterBar({
    remember: "admin-registrations",
    filters: [
      { key: "filterCategory", label: "Category",
        options: [...categories.map(c => ({ value: c.id, label: c.name })),
                  { value: "__general", label: "General" }] },
      { key: "filterClass", label: "Event class",
        options: EVENT_CLASSES.filter(c => events.some(e => e.eventClass === c.id))
          .map(c => ({ value: c.id, label: c.label })) },
      ...typeTierFilters({ types, tiers, enabled: !!settings?.useTypeTier })
    ],
    onChange: fillPicker
  });

  root.appendChild(card(el("div", {}, [bar.node, field("Event", picker)]), "Pick an event"));
  root.appendChild(panel);
  picker.addEventListener("change", paint);

  function fillPicker() {
    const keep = picker.value;
    const list = events
      .map(e => ({ e, ...eventFilterKeys(e) }))
      .filter(bar.matches).map(x => x.e)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    picker.innerHTML = "";
    for (const e of list) picker.appendChild(el("option", { value: e.id, text: eventLabel(e, catName) }));
    if (list.some(e => e.id === keep)) picker.value = keep;
    paint();
  }
  fillPicker();

  async function paint() {
    const event = events.find(e => e.id === picker.value);
    panel.innerHTML = "";
    if (!event) return;

    const [regs, judges, assigned, entriesDoc, result] = await Promise.all([
      getAll("registrations", where("eventId", "==", event.id)),
      getAll("judges"),
      getAll("judgeAssignments", where("eventId", "==", event.id)),
      getOne("judgingEntries", event.id).catch(() => null),
      getOne("results", event.id).catch(() => null)
    ]);
    const state = windowState(event, settings);
    const lettersAssigned = regs.some(r => r.codeLetter);
    // I9 (bug) — a code letter is what a judge's mark is attached to, and
    // a judge is who a finalized/published result already trusts, so both
    // lock on the same condition: any mark recorded, or the event locked
    // outright. Unfinalize first for either to reopen them.
    const resultLocked = !!result;
    const scoringUnderway = !!entriesDoc?.scoringStarted;
    const anyUnlettered = regs.some(r => !r.codeLetter);
    // The full shuffle touches every entry, including ones a judge has
    // already scored, so it locks the moment the first mark is saved — same
    // as the firestore.rules registrations rule. "Set letters manually" is
    // narrower: it can still hand a first letter to an entry that never had
    // one (a late registration), just not move one that already exists —
    // so it only fully locks at finalize, and only hides mid-judging once
    // there is nobody left to letter.
    const shuffleLocked = resultLocked || scoringUnderway;
    const manualLocked = resultLocked || (scoringUnderway && !anyUnlettered);

    panel.appendChild(notice("info",
      "Entries are created by House Managers in their own panel. This screen is for code letters, judges and review."));

    panel.appendChild(card(el("div", {}, [
      el("div.btn-row", {}, [
        badge(classLabel(event.eventClass)),
        badge(event.stage === "onStage" ? "On stage" : "Off stage"),
        badge(state.open ? "Registration open" : "Registration closed", state.open ? "badge-ok" : "badge-warn"),
        badge(`${regs.length} entries`)
      ]),
      el("div.btn-row", { style: "margin-top:.8rem" }, [
        lettersAssigned && shuffleLocked
          ? null
          : button(lettersAssigned ? "Reassign code letters" : "Assign code letters", {
              onclick: guard(() => assignLetters(event, regs, paint))
            }),
        manualLocked
          ? null
          : button("Set letters manually", {
              disabled: !regs.length,
              onclick: () => manualLetterDialog(event, regs, paint, scoringUnderway)
            }),
        button(`Assign judges (${assigned.length})`, {
          disabled: resultLocked,
          onclick: () => judgeDialog(event, judges, assigned, catName, paint)
        }),
        button("Extend registration", { onclick: () => extensionDialog(event, houses, paint) }),
        button("Open substitutions", { onclick: () => substitutionDialog(event, houses, paint) }),
        onBehalfRole
          ? button("Register on behalf of a house", { onclick: () =>
              houseDialog(event, houses, settings, lim, catName, constraintGroups, eventById, onBehalfRole, paint) })
          : null
      ]),
      lettersAssigned && resultLocked
        ? el("div.hint", { style: "margin-top:.5rem", text:
            "Code letters are locked because this event has a result. Unfinalize it first if a correction is genuinely needed." })
        : null,
      lettersAssigned && !resultLocked && scoringUnderway && anyUnlettered
        ? el("div.hint", { style: "margin-top:.5rem", text:
            "Judging has already started, so an existing letter can no longer be reassigned — a judge already " +
            "has it in front of them. A newly registered entry with no letter yet can still be given one, from " +
            "“Set letters manually”." })
        : null,
      lettersAssigned && !resultLocked && scoringUnderway && !anyUnlettered
        ? el("div.hint", { style: "margin-top:.5rem", text:
            "Code letters are locked because judging has already started for this event — a judge already has " +
            "these letters in front of them. If a genuine correction is needed, it has to be made deliberately, " +
            "not from this screen." })
        : null,
      resultLocked
        ? el("div.hint", { style: "margin-top:.3rem", text:
            "Judge assignment is locked while this event has a result — Unfinalize it first to add or remove one." })
        : null,
      extensionSummary(event, houses),
      substitutionSummary(event, houses)
    ]), event.name));

    if (!regs.length) { panel.appendChild(empty("No entries yet")); return; }

    panel.appendChild(card(table([
      { key: "codeLetter", label: "Code", render: r => r.codeLetter
          ? el("span.code-letter", { text: r.codeLetter }) : badge("Not assigned", "badge-warn") },
      { key: "houseName", label: "House" },
      { key: "entry", label: "Entry", render: r => entryCell(r, event) },
      { key: "chest", label: "Chest", render: r => el("span.mono", { text: (r.chestNumbers || []).join(", ") }) },
      { key: "act", label: "", render: r => button("Remove", { class: "btn-sm btn-danger", onclick: guard(async () => {
          if (!await confirmDialog("Remove entry", `Remove ${entryLabel(r, event)} from ${event.name}?`, "Remove")) return;
          await withdrawEntry({ registration: r, event, limits: lim });
          toast("Entry removed."); paint();
        })})}
    ], regs.sort((a, b) => String(a.codeLetter).localeCompare(String(b.codeLetter)) || a.houseName.localeCompare(b.houseName)))));
  }
}

/**
 * Assign code letters in a shuffled order so the letter sequence carries no
 * information about house or registration order — that is what makes blind
 * judging actually blind.
 */
// A group entry's primary line is now the team ("Red B"), not the roster —
// the roster still matters, so it drops to a hint line underneath rather
// than disappearing.
function entryCell(r, event) {
  if (r.wholeTeam) return el("span.hint", { text: "Whole team" });
  if (!isGroupClass(event?.eventClass || r.eventClass)) return (r.participantNames || []).join(", ");
  return el("div", {}, [
    el("div", { text: entryLabel(r, event) }),
    el("div.hint", { style: "margin:0", text: (r.participantNames || []).join(", ") })
  ]);
}

async function assignLetters(event, regs, refresh) {
  if (!regs.length) { toast("No entries to letter.", true); return; }
  if (regs.some(r => r.codeLetter)) {
    const ok = await confirmDialog("Reassign code letters",
      "Existing letters will be replaced. Every score already recorded stays attached to the entry that " +
      "earned it — a mark is filed against the entry, not the letter.",
      "Reassign");
    if (!ok) return;
  }

  const shuffled = [...regs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const ops = shuffled.map((r, i) => ({
    type: "set", path: "registrations", id: r.id,
    data: { codeLetter: codeLetterAt(i), codeLetterAssignedBy: session.name, codeLetterAssignedAt: Date.now() }
  }));
  await batchWrite(ops);
  await writeJudgingEntries(event, shuffled.map((r, i) => ({ ...r, codeLetter: codeLetterAt(i) })));
  toast("Code letters assigned.");
  refresh();
}

/**
 * Set code letters by hand.
 *
 * The shuffle exists so nobody can infer whose entry is whose from the
 * running order, and it stays the default for exactly that reason. But a
 * fest sometimes has an order it must honour — a lot drawn in front of the
 * houses, a sequence printed in the programme — and re-rolling until the
 * dice agree is not a workflow. Letters typed here are checked for
 * duplicates and blanks, because two entries sharing a letter is the one
 * mistake a judge cannot recover from.
 */
function manualLetterDialog(event, regs, refresh, scoringUnderway = false) {
  const rows = [...regs].sort((a, b) =>
    String(a.codeLetter || "~").localeCompare(String(b.codeLetter || "~")) ||
    String(a.houseName || "").localeCompare(String(b.houseName || "")));

  const inputs = new Map();
  const warn = el("div.hint", { style: "margin:.4rem 0 0;color:var(--danger)" });

  const body = el("div", {}, [
    el("p.hint", { text:
      "One letter or short code per entry — A, B, C, or whatever your programme uses. Every entry needs " +
      "one and no two may match. Leave the dialog to keep what is already set." }),
    // firestore.rules refuses to move a letter that already exists once
    // judging has started — see the registrations rule — so those rows are
    // locked here too, rather than letting the admin type a change that
    // would only fail silently at Save. A row with no letter yet (a late
    // registration) stays open, which is the one thing this screen still
    // needs to do mid-judging.
    scoringUnderway
      ? notice("warn", "Judging has already started, so an entry that already has a letter can't be reassigned " +
          "from here — only entries with no letter yet, shown open below, can be set.")
      : null,
    ...rows.map(r => {
      const alreadyLettered = !!r.codeLetter;
      const inp = input({
        value: r.codeLetter || "", maxlength: 4, style: "text-transform:uppercase",
        disabled: scoringUnderway && alreadyLettered
      });
      inputs.set(r.id, inp);
      return el("div.slot-row", {}, [
        el("div.body", {}, [
          el("div", { text: entryLabel(r, event) }),
          el("div.hint", { style: "margin:0", text:
            (r.houseName || "") + (r.wholeTeam ? " · Whole team"
              : ((r.participantNames || []).length ? " · " + r.participantNames.join(", ") : "")) })
        ]),
        el("div", { style: "width:84px;flex:0 0 auto" }, inp)
      ]);
    }),
    warn
  ]);

  modal({
    title: "Set letters manually — " + event.name,
    body,
    actions: [
      { label: "Cancel" },
      { label: "Save letters", kind: "accent", closes: false, busyLabel: "Saving…",
        onClick: guard(async close => {
          const picked = rows.map(r => ({ r, v: (inputs.get(r.id).value || "").trim().toUpperCase() }));
          const blank = picked.filter(p => !p.v);
          if (blank.length) {
            warn.textContent = `${blank.length} ${blank.length === 1 ? "entry has" : "entries have"} no letter. Every entry needs one.`;
            return false;
          }
          const seen = new Map();
          for (const p of picked) {
            if (seen.has(p.v)) {
              warn.textContent = `Two entries are both set to "${p.v}". Letters have to be unique.`;
              return false;
            }
            seen.set(p.v, p.r.id);
          }
          warn.textContent = "";

          await batchWrite(picked.map(p => ({
            type: "set", path: "registrations", id: p.r.id,
            data: { codeLetter: p.v, codeLetterAssignedBy: session.name, codeLetterAssignedAt: Date.now() }
          })));
          // Same rewrite the shuffle does — judgingEntries is the only thing
          // a judge reads, so letters that never reach it never took effect.
          await writeJudgingEntries(event, picked.map(p => ({ ...p.r, codeLetter: p.v })));
          toast("Letters saved.");
          close(true);
          refresh();
        })
      }
    ]
  });
}

/**
 * The judge-facing view of an event.
 *
 * Blind judging is enforced by what is stored, not by what is hidden in the
 * UI: when an event is blind, names and house never enter this document, so
 * there is nothing for a judge to inspect in devtools.
 */
export async function writeJudgingEntries(event, regs, settings = null) {
  const blind = !!event.blindJudging;

  /* v8 — a DIRECT event is judged by picking a placement, not by scoring.
   * The available placements are baked in here, taken from whichever ladder
   * the event actually uses, so the judge panel needs no extra reads and
   * offers exactly the positions that will award points. */
  // Read the policy here rather than trusting a caller to pass it.
  const cfg = settings || await getOne("config", "festSettings");
  const isDirect = effectiveResultMode(event, cfg) === "direct";
  // Settings → Fest details → Visibility. Only meaningful for a NON-blind
  // event — a blind one never carries house or chest number here at all,
  // whatever these say, since the blind branch below never reads them.
  const showHouse = cfg.judgeShowHouse ?? true;
  const showChest = cfg.judgeShowChest ?? true;
  let placements = [];
  if (isDirect) {
    // "custom" points live on the event itself, not a pointsConfig doc.
    const rankPoints = event.pointsFrom === "custom"
      ? (event.customRankPoints || {})
      : (await getOne("pointsConfig", ladderKey(event.pointsFrom || "class", event)).catch(() => null)
          || await getOne("pointsConfig", event.eventClass).catch(() => null))?.rankPoints
        || DEFAULTS.rankPoints;
    placements = Object.keys(rankPoints)
      .map(Number).filter(n => n > 0).sort((a, b) => a - b)
      .map(rank => ({ rank, label: ordinalPlace(rank) }));
  }

  // v9 — approved event material (a song title, and the like) travels
  // here too, the same indirection the description already relies on: a
  // judge never reads eventMaterials directly, so material text can never
  // carry a house's identity along with it by accident. Read fresh on
  // every call, same as the ladder above, so re-lettering or a fresh
  // approval both end up reflected without a second code path.
  let materialByReg = {};
  if (event.materialsEnabled) {
    const materials = await getAll("eventMaterials", where("eventId", "==", event.id)).catch(() => []);
    // The link was submitted alongside the title but only the title ever
    // reached the judge — Admin could see both on the Event material tab,
    // a judge saw text with nowhere to click.
    for (const m of materials) if (m.status === "approved") {
      materialByReg[m.registrationId] = { title: m.title, link: m.link || "" };
    }
  }

  await put("judgingEntries", event.id, {
    eventId: event.id,
    eventName: event.name,
    eventCode: event.code || "",
    // The rules and criteria travel with the entries, because a judge reads
    // judgingEntries and never the event document — that indirection is what
    // enforces blind judging, so anything a judge needs has to come through
    // here. Reveals nothing about who is competing.
    description: event.description || "",
    blind,
    resultMode: isDirect ? "direct" : "scored",
    placements,
    scoreScale: null,
    materialLabel: event.materialsEnabled ? (event.materialLabel || "Material") : "",
    entries: regs
      .filter(r => r.codeLetter)
      .sort((a, b) => a.codeLetter.localeCompare(b.codeLetter))
      .map(r => blind
        ? { regId: r.id, codeLetter: r.codeLetter,
            material: materialByReg[r.id]?.title || "", materialLink: materialByReg[r.id]?.link || "" }
        : { regId: r.id, codeLetter: r.codeLetter, label: r.wholeTeam ? r.houseName : (r.participantNames || []).join(", "),
            houseName: showHouse ? (r.houseName || "") : "",
            chestNumbers: showChest ? (r.chestNumbers || []) : [],
            material: materialByReg[r.id]?.title || "", materialLink: materialByReg[r.id]?.link || "" })
  }, false);
}

/** A line naming any extensions in force, so they are never invisible. */
function extensionSummary(event, houses) {
  const ext = event.registrationExtensions || {};
  const live = Object.entries(ext).filter(([, until]) => until && until > Date.now());
  if (!live.length) return null;
  const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
  return el("div.hint", { style: "margin-top:.6rem", text:
    "Extended until " + live.map(([k, until]) =>
      `${k === "__all" ? "everyone" : (houseName[k] || "a house")}: ${fmtDateTime(until)}`).join(" · ") });
}

/**
 * Grant an extension — for one house or for everybody.
 *
 * Only ever moves the deadline later. There is deliberately no way to open
 * registration EARLY for one house, because that would be an advantage
 * rather than a remedy.
 */
function extensionDialog(event, houses, refresh) {
  const ext = { ...(event.registrationExtensions || {}) };
  const who = select([
    { value: "__all", label: "Every house" },
    ...houses.map(h => ({ value: h.id, label: h.name }))
  ]);
  const until = input({ type: "datetime-local" });
  const listBox = el("div");

  function paintList() {
    listBox.innerHTML = "";
    const rows = Object.entries(ext);
    if (!rows.length) { listBox.appendChild(hint("No extensions in force.")); return; }
    const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
    for (const [key, ts] of rows) {
      listBox.appendChild(el("div.slot-row", {}, [
        el("div.body", { text: (key === "__all" ? "Every house" : (houseName[key] || key)) + " — " + fmtDateTime(ts) }),
        button("Remove", { class: "btn-sm btn-danger", onclick: () => { delete ext[key]; paintList(); } })
      ]));
    }
  }
  paintList();

  modal({
    title: "Extend registration",
    body: el("div", {}, [
      el("p.hint", { text:
        "Reopens this event past its deadline, for one house or for all of them. An extension can only " +
        "move the deadline later — it never opens registration early, which would be an advantage rather " +
        "than a remedy. Withdrawing stays possible for as long as the extension runs." }),
      el("div.grid.grid-2", {}, [field("Who", who), field("Open until", until)]),
      el("div.btn-row", {}, button("Add extension", { class: "btn-sm", onclick: () => {
        const ts = fromLocalInput(until.value);
        if (!ts) { toast("Choose a date and time.", true); return; }
        if (ts <= Date.now()) { toast("That time has already passed.", true); return; }
        ext[who.value] = ts;
        until.value = "";
        paintList();
      }})),
      el("hr", { style: "border:0;border-top:1px solid var(--line);margin:1rem 0" }),
      listBox
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          await patch("events", event.id, { registrationExtensions: ext });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

/** A line naming which houses currently hold substitution permission. */
function substitutionSummary(event, houses) {
  const openFor = event.substitutionOpenFor || {};
  const on = Object.entries(openFor).filter(([, v]) => v);
  if (!on.length) return null;
  const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
  return el("div.hint", { style: "margin-top:.4rem", text:
    "Substitutions open for " + on.map(([k]) => k === "__all" ? "every house" : (houseName[k] || k)).join(", ") });
}

/**
 * Grant substitution permission — for one house at a time, or every house
 * at once via the explicit "__all" choice. Never event-wide by default:
 * the whole point of moving this here is that opening a swap for Team Red
 * does not also open it for every other house registered in the event.
 */
function substitutionDialog(event, houses, refresh) {
  const openFor = { ...(event.substitutionOpenFor || {}) };
  const who = select([
    { value: "__all", label: "Every house" },
    ...houses.map(h => ({ value: h.id, label: h.name }))
  ]);
  const listBox = el("div");

  function paintList() {
    listBox.innerHTML = "";
    const rows = Object.entries(openFor).filter(([, v]) => v);
    if (!rows.length) { listBox.appendChild(hint("Substitutions are closed for every house on this event.")); return; }
    const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
    for (const [key] of rows) {
      listBox.appendChild(el("div.slot-row", {}, [
        el("div.body", { text: key === "__all" ? "Every house" : (houseName[key] || key) }),
        button("Close", { class: "btn-sm btn-danger", onclick: () => { delete openFor[key]; paintList(); } })
      ]));
    }
  }
  paintList();

  modal({
    title: "Open substitutions — " + event.name,
    body: el("div", {}, [
      el("p.hint", { text:
        "Lets the house you pick ask to replace any current participant in one of their entries for this " +
        "event — you still approve or reject each request on the Substitutions screen. Closes automatically " +
        "once code letters are assigned, regardless of what is granted here." }),
      el("div.btn-row", {}, [field("House", who),
        button("Open", { class: "btn-sm", onclick: () => { openFor[who.value] = true; paintList(); } })]),
      el("hr", { style: "border:0;border-top:1px solid var(--line);margin:1rem 0" }),
      listBox
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          await patch("events", event.id, { substitutionOpenFor: openFor });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

function judgeDialog(event, judges, assigned, catName, refresh) {
  const assignedIds = new Set(assigned.map(a => a.judgeUid));
  const boxes = judges.map(j => {
    const cb = el("input", { type: "checkbox", checked: assignedIds.has(j.uid) });
    return { j, cb, row: el("label.inline", { style: "padding:.35rem 0" }, [cb, el("span", { text: j.name })]) };
  });

  modal({
    title: "Assign judges — " + event.name,
    body: judges.length
      ? el("div", {}, [
          el("p.hint", { text: "Assigned judges see this event in their panel. An event can also run with no judges — Admin can fill every score directly." }),
          ...boxes.map(b => b.row)
        ])
      : el("p", { text: "No judge accounts exist yet. Create them under Accounts." }),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          /* I19 — assignments are keyed by the AUTH UID, never the Firestore
           * document id.
           *
           * v6 fell back to `b.j.uid || b.j.id`. Because createAccount()'s
           * uid was thrown away and never written onto the judge record,
           * that fallback ALWAYS fired — so every assignment was filed under
           * the wrong key, the judge panel (which queries by
           * request.auth.uid) matched nothing, and the judgingEntries rule
           * failed its exists() check too.
           *
           * The fallback is gone. A judge without a uid is reported instead
           * of being silently mis-assigned; Accounts has a Repair logins
           * button that fills it in.
           */
          const noUid = boxes.filter(b => b.cb.checked && !b.j.uid).map(b => b.j.name);
          if (noUid.length) {
            toast("No login id for " + noUid.join(", ") +
              ". Open Accounts and press Repair logins, then assign again.", true);
            return false;
          }

          const ops = [];
          for (const b of boxes) {
            const uid = b.j.uid;
            if (!uid) continue;
            const has = assignedIds.has(uid);
            if (b.cb.checked && !has) ops.push({ type: "set", path: "judgeAssignments", id: `${event.id}_${uid}`,
              data: { eventId: event.id, eventName: event.name, eventCode: event.code || "",
                      // I5 — carried on the assignment so the judge panel can show
                      // the category without reading events and categories itself.
                      categoryName: catName[event.categoryId] || (event.categoryId ? "" : "General"),
                      eventClass: event.eventClass,
                      judgeUid: uid, judgeName: b.j.name, assignedAt: Date.now() } });
            if (!b.cb.checked && has) ops.push({ type: "delete", path: "judgeAssignments", id: `${event.id}_${uid}` });
          }
          if (ops.length) await batchWrite(ops);
          toast("Judges updated."); close(true); refresh();
        })
      }
    ]
  });
}

/**
 * I9 — Admin/Co-Admin registering on a house's behalf. Step one: which
 * house. Step two (onBehalfEntryDialog) mirrors house.js's own
 * entryDialog closely, since the picking rules — caps, categories,
 * already-registered ticks — belong to the house, not to staff.
 */
function houseDialog(event, houses, settings, limits, catName, constraintGroups, eventById, role, refresh) {
  if (!houses.length) { toast("No houses exist yet.", true); return; }
  const who = select(houses.map(h => ({ value: h.id, label: h.name })));

  // Consent is per house, so the answer changes as the picker changes.
  const consentLine = el("div");
  let consents = [];
  const paintConsent = () => {
    consentLine.innerHTML = "";
    if (!onBehalfNeedsApproval(role, settings)) return;
    const { ok, reason } = onBehalfReady(role, settings, who.value, consents);
    consentLine.appendChild(ok
      ? notice("info", "This House Manager has agreed to staff registering for them.")
      : notice("warn", reason));
  };
  who.addEventListener("change", paintConsent);
  getAll("onBehalfConsents").catch(() => []).then(rows => { consents = rows; paintConsent(); });

  modal({
    title: "Register on behalf of — " + event.name,
    body: el("div", {}, [
      el("p.hint", { text: "Pick the house this entry is for. The same participant limits and category rules apply as when the House Manager registers directly." }),
      field("House", who),
      consentLine
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Continue", kind: "accent", closes: false, busyLabel: "Loading…", onClick: guard(async close => {
          const house = houses.find(h => h.id === who.value);
          if (!house) { toast("Choose a house.", true); return false; }
          // Re-read rather than trust the copy fetched when the dialog
          // opened — the House Manager may have answered in the meantime.
          consents = await getAll("onBehalfConsents").catch(() => []);
          const gate = onBehalfReady(role, settings, house.id, consents);
          if (!gate.ok) { paintConsent(); toast(gate.reason, true); return false; }
          const [people, ourRegs] = await Promise.all([
            getAll("participants", where("houseId", "==", house.id)),
            getAll("registrations", where("houseId", "==", house.id))
          ]);
          close(true);
          onBehalfEntryDialog(event, house, people, settings, limits, catName, ourRegs,
            constraintGroups, eventById, role, refresh);
        })
      }
    ]
  });
}

function onBehalfEntryDialog(event, house, people, settings, limits, catName, ourRegs,
                             constraintGroups, eventById, role, refresh) {
  // No per-entry approval any more. Permission was settled once, before
  // this dialog opened (houseDialog gates on it), so by the time anyone is
  // picking participants the answer is already yes and every entry is a
  // real registration.
  const eligible = eventCategoryIds(event).length
    ? people.filter(p => eventAcceptsCategory(event, p.categoryId))
    : people;
  const chosen = new Set();
  const group = isGroupClass(event.eventClass);
  const alreadyIn = new Set(
    ourRegs.filter(r => r.eventId === event.id).flatMap(r => r.participantIds || []));
  const used = ourRegs.filter(r => r.eventId === event.id).length;

  const submitLabel = "Register";
  const approvalNotice =
    notice("info", `This registers directly, exactly as if ${house.name}'s House Manager had done it themselves.`);

  if (event.wholeTeam && group) {
    modal({
      title: event.name,
      body: el("div", {}, [
        approvalNotice,
        notice("info",
          `${house.name} enters this as a whole team — there is no participant list. The points go to the ` +
          `${(window.__HOUSE_TERM__ || "house").toLowerCase()}, and nothing counts against anyone's event limits.`)
      ]),
      actions: [
        { label: "Cancel" },
        { label: submitLabel, kind: "accent", closes: false, busyLabel: "Working…",
          onClick: guard(async close => {
            try {
              await registerEntry({
                event, house, participants: [], settings, limits, registeredBy: session.name
              });
              toast("Entered.");
            } catch (err) { toast(err.message, true); return false; }
            close(true); refresh();
          })
        }
      ]
    });
    return;
  }

  const perEntryMax = group ? (event.maxParticipantsPerEntry || 1) : 1;
  const cap = maxEntriesFor(event);
  const roomLeft = cap === null ? eligible.length : Math.max(0, cap - used);
  const selectMax = group ? perEntryMax : Math.max(1, Math.min(eligible.length, roomLeft));

  const search = input({ placeholder: "Search name or chest number", autocomplete: "off" });
  const counter = el("div.pick-count");
  const list = el("div.pick-grid");
  const sorted = [...eligible].sort((a, b) => compareChest(a.chestNumber, b.chestNumber));

  function updateCounter() {
    counter.textContent = group
      ? `${chosen.size} of ${perEntryMax} selected`
      : (chosen.size
          ? `${chosen.size} selected — ${chosen.size} separate ${chosen.size === 1 ? "entry" : "entries"}`
          : "Select one or more participants");
    counter.className = "pick-count" + (chosen.size ? " has" : "");
  }

  function paintList() {
    const term = search.value.trim().toLowerCase();
    list.innerHTML = "";
    const shown = sorted.filter(p => !term
      || p.name.toLowerCase().includes(term) || String(p.chestNumber).toLowerCase().includes(term));

    if (!shown.length) {
      list.appendChild(el("div.hint", { style: "padding:1rem", text: eligible.length
        ? "Nobody matches that search." : "No participant in this house is eligible for this event." }));
      return;
    }

    for (const p of shown) {
      const selected = chosen.has(p.id);
      const inThis = alreadyIn.has(p.id);
      const blocked = inThis && !group;
      const cardEl = el("button.pick-card" + (selected ? ".selected" : "") + (blocked ? ".pick-card-disabled" : ""),
        { type: "button", disabled: blocked }, [
        avatar(p, 46),
        el("div.pick-body", {}, [
          el("div.pick-name", { text: p.name }),
          el("div.pick-meta", {}, [
            el("span.mono", { text: "#" + (p.chestNumber ?? "") }),
            p.className ? el("span", { text: " · " + p.className }) : null,
            inThis ? el("span", { style: "color:var(--ok);font-weight:600", text: " · Already registered" }) : null
          ])
        ]),
        el("span.pick-tick", { text: selected ? "✓" : (inThis ? "✓" : "") })
      ]);
      if (!blocked) cardEl.addEventListener("click", () => {
        if (chosen.has(p.id)) chosen.delete(p.id);
        else {
          if (group && chosen.size >= perEntryMax) { toast(`At most ${perEntryMax} per entry.`, true); return; }
          if (!group && chosen.size >= selectMax) {
            toast(`Only ${selectMax} more ${selectMax === 1 ? "entry is" : "entries are"} allowed for this event.`, true);
            return;
          }
          chosen.add(p.id);
        }
        updateCounter();
        paintList();
      });
      list.appendChild(cardEl);
    }
  }

  search.addEventListener("input", paintList);
  paintList();
  updateCounter();

  modal({
    title: "Register " + house.name + " for " + eventLabel(event, catName),
    body: el("div", {}, [
      approvalNotice,
      el("p.hint", { text: group
        ? `Tap to select up to ${perEntryMax} participants for this entry.`
        : "Tap to select as many participants as you like — each becomes its own entry." }),
      search, counter, list
    ]),
    actions: [
      { label: "Cancel" },
      { label: submitLabel, kind: "accent", closes: false, busyLabel: "Working…", onClick: guard(async close => {
          const picked = eligible.filter(p => chosen.has(p.id));
          if (!picked.length) { toast("Select at least one participant.", true); return false; }

          if (group) {
            try {
              await registerEntry({ event, house, participants: picked, settings, limits,
                registeredBy: session.name, constraintGroups, eventById });
              toast("Registered.");
            } catch (err) { toast(err.message, true); return false; }
            close(true); refresh();
            return;
          }

          // Partial success, same contract as registerMany(): one capped
          // participant must not block the rest.
          const { done, failed } = await registerMany({
            event, house, participants: picked, settings, limits,
            registeredBy: session.name, constraintGroups, eventById });

          if (!failed.length) {
            toast(`Registered ${done.length} ${done.length === 1 ? "entry" : "entries"}.`);
            close(true); refresh();
            return;
          }

          close(true);
          refresh();
          modal({
            title: "Registration report",
            body: el("div", {}, [
              notice(done.length ? "warn" : "danger",
                `${done.length} registered, ${failed.length} could not be.`),
              ...failed.map(f => el("div", { style: "padding:.4rem 0;border-top:1px solid var(--line)" }, [
                el("strong", { text: f.participant.name }),
                el("div.hint", { style: "margin:0", text: f.reason })
              ]))
            ]),
            actions: [{ label: "Close" }]
          });
        })
      }
    ]
  });
}

function ordinalPlace(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " place";
}

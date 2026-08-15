import { el, card, field, input, select, button, table, toast, guard, notice, empty, modal, confirmDialog, badge, fmtDateTime, fromLocalInput, filterBar, hint } from "../../lib/ui.js";
import { getAll, getOne, put, patch, remove, batchWrite, where } from "../../lib/db.js";
import { codeLetterAt, classLabel, isGroupClass, eventLabel, entryLabel,
         eventFilterKeys, typeTierFilters, EVENT_CLASSES } from "../../domain/constants.js";
import { registerEntry, withdrawEntry, windowState } from "../../domain/registration.js";
import { DEFAULTS, effectiveResultMode } from "../../domain/constants.js";
import { ladderKey } from "../../domain/scoring.js";
import { session } from "../../lib/session.js";

export default async function registrations(root) {
  root.appendChild(el("h1", { text: "Registrations" }));

  const [events, houses, settings, limits, categories, types, tiers] = await Promise.all([
    getAll("events"), getAll("houses"), getOne("config", "festSettings"), getOne("config", "participantLimits"),
    getAll("categories"), getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };

  if (!events.length) { root.appendChild(empty("No events yet", "Create events first.")); return; }

  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const picker = select([]);
  const panel = el("div");

  // A fest with many events makes "pick an event" from one flat
  // alphabetical list a real chore — the same filter bar every other
  // event picker in the app already carries (stage.js, house.js,
  // participants.js).
  const bar = filterBar({
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

    const [regs, judges, assigned] = await Promise.all([
      getAll("registrations", where("eventId", "==", event.id)),
      getAll("judges"),
      getAll("judgeAssignments", where("eventId", "==", event.id))
    ]);
    const state = windowState(event, settings);
    const lettersAssigned = regs.some(r => r.codeLetter);

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
        button(lettersAssigned ? "Reassign code letters" : "Assign code letters", {
          onclick: guard(() => assignLetters(event, regs, paint))
        }),
        button(`Assign judges (${assigned.length})`, { onclick: () => judgeDialog(event, judges, assigned, catName, paint) }),
        button("Extend registration", { onclick: () => extensionDialog(event, houses, paint) }),
        button("Open substitutions", { onclick: () => substitutionDialog(event, houses, paint) })
      ]),
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
      "Existing letters will be replaced. Any scores already recorded stay attached to their entry, but judges will see different letters.", "Reassign");
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
    for (const m of materials) if (m.status === "approved") materialByReg[m.registrationId] = m.title;
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
        ? { regId: r.id, codeLetter: r.codeLetter, material: materialByReg[r.id] || "" }
        : { regId: r.id, codeLetter: r.codeLetter, label: r.wholeTeam ? r.houseName : (r.participantNames || []).join(", "),
            houseName: r.houseName, material: materialByReg[r.id] || "" })
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

function ordinalPlace(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " place";
}

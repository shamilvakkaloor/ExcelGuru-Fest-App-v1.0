// Stage Manager panel — the person running the stage on the day.
//
// Deliberately narrow. Two jobs only:
//   1. Assign code letters to an event's entries.
//   2. Tick an entry in as it goes on, so nobody is called twice and
//      nobody is missed.
//
// A Stage Manager can see WHO is in an entry — they have to call people to
// the stage — but they cannot score, finalize, publish, or change a result.
// The arrival tick is a running-order aid and is stored apart from
// entryFlags, so it can never be mistaken for an absence: absence moves
// points, arrival does not.
import { el, card, field, select, button, table, toast, guard, notice, empty,
         badge, loading, filterBar, friendlyError, confirmDialog } from "../lib/ui.js";
import { getAll, getOne, put, remove, where, batchWrite } from "../lib/db.js";
import { appShell } from "../lib/shell.js";
import { session } from "../lib/session.js";
import { classLabel, eventLabel, EVENT_CLASSES, eventFilterKeys } from "../domain/constants.js";
import { codeLetterAt, entryLabel, isGroupClass } from "../domain/constants.js";
import { writeJudgingEntries } from "./admin/registrations.js";

export default async function stagePage(root) {
  const { content: wrap } = appShell(root, { title: "Stage" });
  wrap.appendChild(el("h1", { text: "Stage" }));

  let events, categories, myAssignments;
  try {
    [events, categories, myAssignments] = await Promise.all([
      getAll("events"), getAll("categories"),
      session.refId ? getAll("stageAssignments", where("stageRefId", "==", session.refId)).catch(() => []) : []
    ]);
  } catch (err) {
    wrap.appendChild(notice("danger", friendlyError(err)));
    return;
  }
  if (!events.length) { wrap.appendChild(empty("No events yet")); return; }

  // I9 — a Stage Manager can now hold several assignments (different
  // venues, different days), set from the Schedule screen. Sees every
  // event scheduled inside ANY of them, cross-referenced against the same
  // pre-built schedule snapshot the public schedule page reads (cheap: one
  // read, already up to date whenever the schedule is saved). No
  // assignments at all still means "sees every event", the original
  // behaviour.
  if (myAssignments.length) {
    const schedule = await getOne("publicSchedule", "main").catch(() => null);
    const inWindow = new Set();
    for (const a of myAssignments) {
      const d = (schedule?.days || []).find(x => x.id === a.dayId);
      const v = d && (d.venues || []).find(x => x.id === a.venueId);
      if (!v) continue;
      for (const s of v.slots || []) {
        if (s.type === "event" && s.eventId && s.startTime >= a.startTime && s.startTime < a.endTime) {
          inWindow.add(s.eventId);
        }
      }
    }
    events = events.filter(e => inWindow.has(e.id));
    wrap.appendChild(notice("info",
      `Scoped to ${myAssignments.length} assignment${myAssignments.length === 1 ? "" : "s"} on the schedule. ` +
      (events.length ? `${events.length} event${events.length === 1 ? "" : "s"} shown.`
        : "No events fall in your assigned time yet — check the schedule.")));
    if (!events.length) return;
  }

  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const picker = select([]);
  const panel = el("div");

  const bar = filterBar({
    remember: "stage",
    filters: [
      { key: "filterCategory", label: "Category",
        options: [...categories.map(c => ({ value: c.id, label: c.name })),
                  { value: "__general", label: "General" }] },
      { key: "filterClass", label: "Event class",
        options: EVENT_CLASSES.filter(c => events.some(e => e.eventClass === c.id))
          .map(c => ({ value: c.id, label: c.label })) }
    ],
    onChange: fillPicker
  });

  wrap.appendChild(card(el("div", {}, [bar.node, field("Event", picker)]), "Pick an event"));
  wrap.appendChild(panel);
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
    panel.appendChild(loading("Loading entries…"));

    let regs, arrivals, entriesDoc, result;
    try {
      [regs, arrivals, entriesDoc, result] = await Promise.all([
        getAll("registrations", where("eventId", "==", event.id)),
        getAll("stageArrivals", where("eventId", "==", event.id)).catch(() => []),
        getOne("judgingEntries", event.id).catch(() => null),
        getOne("results", event.id).catch(() => null)
      ]);
    } catch (err) {
      panel.innerHTML = "";
      panel.appendChild(notice("danger", friendlyError(err)));
      return;
    }
    panel.innerHTML = "";

    const here = new Set(arrivals.filter(a => a.arrived).map(a => a.regId));
    const lettered = regs.filter(r => r.codeLetter);
    const done = lettered.filter(r => here.has(r.id)).length;
    // Locks the moment the first mark is saved, same as the firestore.rules
    // registrations rule — see that file for why this is a hard stop.
    const scoringUnderway = !!entriesDoc?.scoringStarted;
    const lettersLocked = !!result || scoringUnderway;

    panel.appendChild(card(el("div.btn-row", {}, [
      badge(classLabel(event.eventClass)),
      badge(`${regs.length} entries`),
      lettered.length
        ? badge(`${done} of ${lettered.length} on stage`, done === lettered.length ? "badge-ok" : "badge-warn")
        : badge("No code letters yet", "badge-warn"),
      lettered.length && lettersLocked
        ? null
        : button(lettered.length ? "Reassign code letters" : "Assign code letters", {
            class: lettered.length ? "" : "btn-accent",
            onclick: guard(() => assignLetters(event, regs, paint))
          })
    ]), event.name));

    if (lettered.length && result) {
      panel.appendChild(notice("info",
        "Code letters are locked because this event has a result. An organiser can unfinalize it if a correction is genuinely needed."));
    } else if (lettered.length && scoringUnderway) {
      panel.appendChild(notice("warn",
        "Code letters are locked because judging has already started for this event. If a genuine " +
        "correction is needed, an organiser has to make it deliberately, not from this screen."));
    }

    if (!regs.length) { panel.appendChild(empty("Nothing registered for this event")); return; }
    if (!lettered.length) {
      panel.appendChild(notice("info",
        "Assign code letters first — they set the running order and are what a judge scores against."));
      return;
    }

    const rows = [...lettered].sort((a, b) => String(a.codeLetter).localeCompare(String(b.codeLetter)));

    panel.appendChild(card(table([
      { key: "codeLetter", label: "Code", render: r => el("span.code-letter", { text: r.codeLetter }) },
      { key: "who", label: "Entry", render: r => el("div", {}, [
          el("div", { text: entryLabel({ ...r, eventClass: event.eventClass }, event) }),
          el("div.hint", { style: "margin:0", text:
            isGroupClass(event.eventClass) && !r.wholeTeam
              ? (r.participantNames || []).join(", ")
              : (r.houseName || "") })
        ])},
      { key: "chest", label: "Chest", render: r => el("span.mono", { text: (r.chestNumbers || []).join(", ") }) },
      { key: "arrived", label: "On stage", render: r => {
          const on = here.has(r.id);
          return button(on ? "✓ On stage" : "Mark on stage", {
            class: "btn-sm " + (on ? "btn-ok" : ""),
            onclick: guard(async () => {
              const id = event.id + "_" + r.id;
              if (on) await remove("stageArrivals", id);
              else await put("stageArrivals", id, {
                eventId: event.id, regId: r.id, arrived: true,
                markedBy: session.name || "", markedAt: Date.now()
              });
              paint();
            })
          });
        }}
    ], rows)));

    panel.appendChild(el("p.hint", { text:
      "Ticking an entry on stage is a running-order aid only. It is not an absence — if somebody does not " +
      "turn up, a judge or an Admin marks them Absent, which is what actually affects their result." }));
  }
}

/**
 * Assign code letters in a shuffled order.
 *
 * Shares writeJudgingEntries() with the Admin screen rather than writing
 * registrations alone. Skipping it would leave judges with no entries to
 * score — judgingEntries is the ONLY thing a judge reads, which is what
 * enforces blind judging. A second lettering path that forgot that would
 * silently break judging for the event.
 *
 * Fisher-Yates, not sort(() => Math.random() - 0.5): the latter is not a
 * uniform shuffle, and a running order that subtly favours some positions
 * is exactly the kind of unfairness code letters exist to prevent.
 */
async function assignLetters(event, regs, refresh) {
  if (!regs.length) { toast("No entries to letter.", true); return; }
  if (regs.some(r => r.codeLetter)) {
    const ok = await confirmDialog("Reassign code letters",
      "Existing letters will be replaced. Any scores already recorded stay attached to their entry, but judges will see different letters.",
      "Reassign");
    if (!ok) return;
  }

  const shuffled = [...regs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const lettered = shuffled.map((r, i) => ({ ...r, codeLetter: codeLetterAt(i) }));
  await batchWrite(lettered.map(r => ({
    type: "set", path: "registrations", id: r.id,
    data: { codeLetter: r.codeLetter, codeLetterAssignedBy: session.name, codeLetterAssignedAt: Date.now() }
  })));
  await writeJudgingEntries(event, lettered);
  toast("Code letters assigned.");
  refresh();
}

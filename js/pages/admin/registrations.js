import { el, card, field, input, select, button, table, toast, guard, notice, empty,
         modal, confirmDialog, badge } from "../../lib/ui.js";
import { getAll, getOne, put, remove, batchWrite, where } from "../../lib/db.js";
import { codeLetterAt, classLabel, isGroupClass, eventLabel } from "../../domain/constants.js";
import { registerEntry, withdrawEntry, windowState } from "../../domain/registration.js";
import { DEFAULTS, effectiveResultMode } from "../../domain/constants.js";
import { ladderKey } from "../../domain/scoring.js";
import { session } from "../../lib/session.js";

export default async function registrations(root) {
  root.appendChild(el("h1", { text: "Registrations" }));

  const [events, houses, settings, limits] = await Promise.all([
    getAll("events"), getAll("houses"), getOne("config", "festSettings"), getOne("config", "participantLimits")
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };

  if (!events.length) { root.appendChild(empty("No events yet", "Create events first.")); return; }

  const categories = await getAll("categories");
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const picker = select(events
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map(e => ({ value: e.id, label: eventLabel(e, catName) })));
  const panel = el("div");
  root.appendChild(card(field("Event", picker), "Pick an event"));
  root.appendChild(panel);

  picker.addEventListener("change", paint);
  await paint();

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
        button(`Assign judges (${assigned.length})`, { onclick: () => judgeDialog(event, judges, assigned, catName, paint) })
      ])
    ]), event.name));

    if (!regs.length) { panel.appendChild(empty("No entries yet")); return; }

    panel.appendChild(card(table([
      { key: "codeLetter", label: "Code", render: r => r.codeLetter
          ? el("span.code-letter", { text: r.codeLetter }) : badge("Not assigned", "badge-warn") },
      { key: "houseName", label: "House" },
      { key: "participantNames", label: "Participants", render: r => (r.participantNames || []).join(", ") },
      { key: "chest", label: "Chest", render: r => el("span.mono", { text: (r.chestNumbers || []).join(", ") }) },
      { key: "act", label: "", render: r => button("Remove", { class: "btn-sm btn-danger", onclick: guard(async () => {
          if (!await confirmDialog("Remove entry", `Remove ${(r.participantNames || []).join(", ")} from ${event.name}?`, "Remove")) return;
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
    const key = ladderKey(event.pointsFrom || "class", event);
    const ladder = await getOne("pointsConfig", key).catch(() => null)
                || await getOne("pointsConfig", event.eventClass).catch(() => null);
    placements = Object.keys(ladder?.rankPoints || DEFAULTS.rankPoints)
      .map(Number).filter(n => n > 0).sort((a, b) => a - b)
      .map(rank => ({ rank, label: ordinalPlace(rank) }));
  }

  await put("judgingEntries", event.id, {
    eventId: event.id,
    eventName: event.name,
    eventCode: event.code || "",
    blind,
    resultMode: isDirect ? "direct" : "scored",
    placements,
    scoreScale: null,
    entries: regs
      .filter(r => r.codeLetter)
      .sort((a, b) => a.codeLetter.localeCompare(b.codeLetter))
      .map(r => blind
        ? { regId: r.id, codeLetter: r.codeLetter }
        : { regId: r.id, codeLetter: r.codeLetter, label: (r.participantNames || []).join(", "), houseName: r.houseName })
  }, false);
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

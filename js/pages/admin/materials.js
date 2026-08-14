// Event material approval queue — a song title, a prop list, whatever an
// event's own materialLabel asks for. Same shape as Substitutions on
// purpose: a House submits, staff decides, oldest first.
import { el, card, field, input, button, table, toast, guard, notice,
         empty, badge, modal, loading, friendlyError } from "../../lib/ui.js";
import { getAll, where } from "../../lib/db.js";
import { MATERIAL_STATUS, decideMaterial } from "../../domain/materials.js";
import { writeJudgingEntries } from "./registrations.js";
import { session } from "../../lib/session.js";

export default async function materialsPage(root) {
  root.appendChild(el("h1", { text: "Event material" }));
  root.appendChild(notice("info",
    "A House Manager submits one item per entry for an event that asks for it — a song title, and the " +
    "like. Approve or reject each, oldest first; once approved, it is shown to a judge beside the code " +
    "letter, never the house's name."));

  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading submissions…"));
    let rows, events;
    try {
      [rows, events] = await Promise.all([getAll("eventMaterials"), getAll("events")]);
    } catch (err) {
      panel.innerHTML = "";
      panel.appendChild(notice("danger", friendlyError(err)));
      return;
    }
    panel.innerHTML = "";
    const eventById = Object.fromEntries(events.map(e => [e.id, e]));

    const pending = rows.filter(r => r.status === MATERIAL_STATUS.PENDING)
      .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0)); // oldest first
    const decided = rows.filter(r => r.status !== MATERIAL_STATUS.PENDING)
      .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));

    panel.appendChild(card(pending.length ? table([
      { key: "eventName", label: "Event", render: r => el("div", {}, [
          el("div", { text: r.eventName }), el("div.hint", { style: "margin:0", text: eventById[r.eventId]?.materialLabel || "Material" })
        ])},
      { key: "houseName", label: "House" },
      { key: "title", label: "Submission", render: r => el("div", {}, [
          el("div", { text: r.title }),
          r.link ? el("a", { href: r.link, target: "_blank", rel: "noopener", text: r.link, style: "font-size:.85em" }) : null
        ])},
      { key: "act", label: "", render: r => el("div.btn-row", {}, [
          button("Approve", { class: "btn-sm btn-accent", onclick: guard(async () => {
            await decideMaterial({ material: r, status: MATERIAL_STATUS.APPROVED, decidedBy: session.name });
            await refreshJudging(eventById[r.eventId]);
            toast("Approved."); paint();
          })}),
          button("Reject", { class: "btn-sm btn-danger", onclick: guard(async () => {
            const why = await promptReason();
            if (why === null) return;
            await decideMaterial({ material: r, status: MATERIAL_STATUS.REJECTED, decidedBy: session.name, reason: why });
            toast("Rejected."); paint();
          })})
        ])}
    ], pending) : empty("Nothing awaiting approval"),
      `Awaiting approval${pending.length ? " (" + pending.length + ")" : ""}`));

    if (decided.length) {
      panel.appendChild(card(table([
        { key: "eventName", label: "Event" },
        { key: "houseName", label: "House" },
        { key: "title", label: "Submission" },
        { key: "status", label: "Outcome", render: r => r.status === MATERIAL_STATUS.APPROVED
            ? badge("Approved", "badge-ok") : badge("Rejected", "badge-danger") },
        { key: "decidedBy", label: "By" },
        { key: "reason", label: "Reason", render: r => r.reason
            ? el("span.hint", { text: r.reason }) : el("span.hint", { text: "—" }) }
      ], decided), "Decided"));
    }
  }

  /**
   * Push an approval into judgingEntries immediately. Without this, a
   * judge would see the new title only after the next unrelated
   * re-lettering — writeJudgingEntries rebuilds from the registrations it
   * is given, so a decision here has to hand it a fresh set.
   */
  async function refreshJudging(event) {
    if (!event) return;
    const regs = await getAll("registrations", where("eventId", "==", event.id)).catch(() => []);
    if (regs.some(r => r.codeLetter)) await writeJudgingEntries(event, regs).catch(() => {});
  }
}

function promptReason() {
  return new Promise(resolve => {
    const why = input({ placeholder: "Optional — shown to the House Manager" });
    modal({
      title: "Reject submission",
      body: el("div", {}, [field("Reason", why)]),
      actions: [
        { label: "Cancel", onClick: () => resolve(null) },
        { label: "Reject", kind: "danger", onClick: () => resolve(why.value.trim() || "") }
      ]
    });
  });
}

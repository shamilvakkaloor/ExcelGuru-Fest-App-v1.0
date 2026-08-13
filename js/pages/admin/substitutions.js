import { el, card, field, input, select, button, table, toast, guard, notice,
         empty, badge, modal, confirmDialog, loading } from "../../lib/ui.js";
import { getAll, getOne, where } from "../../lib/db.js";
import { DEFAULTS } from "../../domain/constants.js";
import { SUB_STATUS, approveSubstitution, rejectSubstitution } from "../../domain/substitution.js";
import { session } from "../../lib/session.js";
import { queueRepublish } from "../../domain/republish.js";

/**
 * The approval queue. Admin and Co-Admin may both decide — a substitution
 * is an administrative correction, not a publishing act, so it does not
 * need to wait for the one person who can publish.
 */
export default async function substitutions(root) {
  root.appendChild(el("h1", { text: "Substitutions" }));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading requests…"));

    const [rows, events, limits, types, tiers] = await Promise.all([
      getAll("substitutions").catch(() => []),
      getAll("events"),
      getOne("config", "participantLimits"),
      getAll("programTypes").catch(() => []),
      getAll("programTiers").catch(() => [])
    ]);
    const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
    const eventById = Object.fromEntries(events.map(e => [e.id, e]));
    const vocab = {
      types: Object.fromEntries(types.map(t => [t.id, t.name])),
      tiers: Object.fromEntries(tiers.map(t => [t.id, t.name]))
    };

    panel.innerHTML = "";
    panel.appendChild(notice("info",
      "House Managers request a swap once registration has closed. It stays possible until code letters " +
      "are assigned — after that the running order is fixed and a name change is a result correction in Judging."));

    const pending = rows.filter(r => r.status === SUB_STATUS.PENDING);
    const decided = rows.filter(r => r.status !== SUB_STATUS.PENDING)
      .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));

    panel.appendChild(card(pending.length ? table([
      { key: "houseName", label: "House" },
      { key: "eventName", label: "Event" },
      { key: "swap", label: "Swap", render: r => el("div", {}, [
          el("div", {}, [el("strong", { text: r.outgoingName }), " → ",
                         el("strong", { text: r.incomingName })]),
          el("div.hint", { style: "margin:0", text: "requested by " + (r.requestedBy || "—") })
        ])},
      { key: "act", label: "", render: r => el("div.btn-row", {}, [
          button("Approve", { class: "btn-sm btn-accent", onclick: guard(async () => {
            const event = eventById[r.eventId];
            if (!event) { toast("That event no longer exists.", true); return; }
            try {
              await approveSubstitution({
                request: r, event, limits: lim, decidedBy: session.name, vocab
              });
            } catch (err) {
              // A cap breach is refused outright — substitution must never
              // become the quiet route around the fest's own limits.
              toast(err.message, true);
              return;
            }
            queueRepublish({ results: true });
            toast("Substitution approved.");
            paint();
          })}),
          button("Reject", { class: "btn-sm btn-danger", onclick: guard(async () => {
            const why = await promptReason();
            if (why === null) return;
            await rejectSubstitution({ request: r, decidedBy: session.name, reason: why });
            toast("Rejected."); paint();
          })})
        ])}
    ], pending) : empty("Nothing awaiting approval"),
      `Awaiting approval${pending.length ? " (" + pending.length + ")" : ""}`));

    if (decided.length) {
      panel.appendChild(card(table([
        { key: "houseName", label: "House" },
        { key: "eventName", label: "Event" },
        { key: "swap", label: "Swap", render: r => `${r.outgoingName} → ${r.incomingName}` },
        { key: "status", label: "Outcome", render: r => r.status === SUB_STATUS.APPROVED
            ? badge("Approved", "badge-ok") : badge("Rejected", "badge-danger") },
        { key: "decidedBy", label: "By" },
        { key: "reason", label: "Reason", render: r => r.reason
            ? el("span.hint", { text: r.reason }) : el("span.hint", { text: "—" }) }
      ], decided), "Decided"));
    }
  }
}

/** Rejections carry a reason, so the House Manager learns why. */
function promptReason() {
  return new Promise(resolve => {
    const why = input({ placeholder: "Optional — shown to the House Manager" });
    modal({
      title: "Reject substitution",
      body: el("div", {}, [field("Reason", why)]),
      actions: [
        { label: "Cancel", onClick: () => resolve(null) },
        { label: "Reject", kind: "danger", onClick: () => resolve(why.value.trim() || "") }
      ]
    });
  });
}

import { el, card, empty, badge, button, notice } from "../../lib/ui.js";
import { getAll, getOne, where } from "../../lib/db.js";
import { PUBLISH_STATUS, housePluralTerm } from "../../domain/constants.js";
import { is, session } from "../../lib/session.js";

export default async function dashboard(root) {
  const [events, participants, houses, results, settings] = await Promise.all([
    getAll("events"), getAll("participants"), getAll("houses"),
    getAll("results"), getOne("config", "festSettings")
  ]);

  const published = results.filter(r => r.publishStatus === PUBLISH_STATUS.PUBLISHED).length;
  const finalized = results.filter(r => r.publishStatus === PUBLISH_STATUS.FINALIZED).length;

  root.appendChild(el("h1", { text: settings?.festName || "Dashboard" }));

  root.appendChild(el("div.grid.grid-3", { style: "margin-bottom:1rem" }, [
    stat(participants.length, "Participants"),
    stat(events.length, "Events"),
    stat(houses.length, housePluralTerm(settings)),
    stat(finalized, "Finalized, not public"),
    stat(published, "Published")
  ]));

  // Pending substitutions are time-critical — they block a House Manager
  // from fixing an entry, and the window closes when code letters go out.
  const pendingSubs = await getAll("substitutions", where("status", "==", "pending")).catch(() => []);
  if (pendingSubs.length) {
    root.appendChild(notice("warn", el("div", {}, [
      el("strong", { text: `${pendingSubs.length} substitution request${pendingSubs.length === 1 ? "" : "s"} awaiting approval.` }),
      el("div.hint", { style: "margin:.3rem 0 0", text:
        "The window closes once code letters are assigned for that event." }),
      el("div.btn-row", { style: "margin-top:.5rem" },
        el("a.btn.btn-sm", { href: "#/admin/substitutions", text: "Review them" }))
    ])));
  }

  if (!houses.length || !events.length) {
    root.appendChild(card(el("div", {}, [
      el("p", { text: "Recommended order for a new fest:" }),
      el("ol", {}, [
        "Settings — fest details, grade thresholds, registration window",
        "Settings — categories, points ladders, participant limits",
        "Accounts — houses, judges, co-admins",
        "Events — create the competition items",
        "Schedule — venues and timings",
        "Hand the house passwords out and open registration"
      ].map(t => el("li", { text: t })))
    ]), "Getting started"));
  }

  if (settings && !settings.registrationWindow?.end) {
    root.appendChild(notice("warn", "No registration deadline is set, so registration stays open indefinitely. Set one in Settings."));
  }

  const pending = events.filter(e => {
    const r = results.find(x => x.id === e.id);
    return !r || r.publishStatus === PUBLISH_STATUS.NOT_FINALIZED;
  });
  if (pending.length) {
    root.appendChild(card(el("div", {}, pending.slice(0, 12).map(e =>
      el("div", { style: "display:flex;gap:.6rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--line)" }, [
        el("span.mono", { text: e.code || "" }),
        el("strong", { text: e.name }),
        el("div", { style: "flex:1" }),
        badge("Not finalized", "badge-warn")
      ]))), `Awaiting results (${pending.length})`,
      el("a.btn.btn-sm", { href: "#/admin/judging", text: "Go to judging" })));
  }

  function stat(n, label) {
    return el("div.stat", {}, [el("div.n", { text: String(n) }), el("div.l", { text: label })]);
  }
}

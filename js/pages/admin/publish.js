import { el, card, button, table, toast, guard, notice, empty, badge, modal, confirmDialog } from "../../lib/ui.js";
import { getAll, put } from "../../lib/db.js";
import { previewImpact, publishEvents, unpublishEvent, rebuildPublicSnapshots } from "../../domain/publish.js";
import { PUBLISH_STATUS, classLabel } from "../../domain/constants.js";
import { is } from "../../lib/session.js";

export default async function publishPage(root) {
  root.appendChild(el("h1", { text: "Results" }));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    const [events, results, categories] = await Promise.all([
      getAll("events"), getAll("results"), getAll("categories")
    ]);
    const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const byId = Object.fromEntries(results.map(r => [r.id, r]));

    const rows = events.map(e => ({
      ...e,
      result: byId[e.id] || null,
      status: byId[e.id]?.publishStatus || PUBLISH_STATUS.NOT_FINALIZED,
      staged: !!byId[e.id]?.stagedForPublish,
      // Recorded at finalize when an event's named points axis had no
      // ladder and its class ladder was used instead.
      fellBack: !!byId[e.id]?.pointsFellBack,
      pointsSource: byId[e.id]?.pointsSource || "class"
    })).sort((a, b) => String(a.code).localeCompare(String(b.code)));

    const fellBackRows = rows.filter(r => r.fellBack);
    if (fellBackRows.length) {
      panel.appendChild(notice("warn",
        fellBackRows.length + (fellBackRows.length === 1 ? " event was" : " events were") +
        " scored on their class ladder because the axis they name has no ladder configured: " +
        fellBackRows.slice(0, 6).map(r => r.name).join(", ") +
        (fellBackRows.length > 6 ? "…" : "") +
        ". Set the ladders in Settings \u2192 Points & grades and finalize again if that is not what you want."));
    }

    const finalized = rows.filter(r => r.status === PUBLISH_STATUS.FINALIZED);
    const staged = rows.filter(r => r.staged && r.status === PUBLISH_STATUS.FINALIZED);

    panel.appendChild(card(el("div", {}, [
      el("p.hint", { text: is.admin()
        ? "Check the events you want to go live, preview the effect on standings, then publish. Publishing is Admin-only."
        : "You can finalize and check events for publishing. Only an Admin can make results live." }),
      el("div.btn-row", {}, [
        button(`Preview impact (${staged.length} checked)`, {
          disabled: !staged.length,
          onclick: guard(() => showPreview(staged.map(s => s.id)))
        }),
        is.admin() ? button(`Publish ${staged.length} checked`, {
          class: "btn-accent", disabled: !staged.length,
          onclick: guard(async () => {
            if (!await confirmDialog("Publish results",
              `Make ${staged.length} event${staged.length > 1 ? "s" : ""} public? Everyone will see them immediately.`, "Publish")) return;
            await publishEvents(staged.map(s => s.id));
            toast("Published.");
            paint();
          })
        }) : null,
        is.admin() ? button("Rebuild public pages", { onclick: guard(async () => {
          const r = await rebuildPublicSnapshots();
          toast(`Rebuilt ${r.events} events, ${r.students} participants.`);
        })}) : null
      ])
    ]), "Publishing"));

    if (!rows.length) { panel.appendChild(empty("No events yet")); return; }

    panel.appendChild(card(table([
      { key: "check", label: "Publish?", render: r => {
          if (r.status !== PUBLISH_STATUS.FINALIZED) return el("span.hint", { text: "—" });
          const cb = el("input", { type: "checkbox", checked: r.staged, onchange: guard(async e => {
            await put("results", r.id, { stagedForPublish: e.target.checked });
            toast(e.target.checked ? "Checked to publish." : "Unchecked.");
            paint();
          })});
          return cb;
        }},
      { key: "code", label: "Code", render: r => el("span.mono", { text: r.code || "" }) },
      { key: "name", label: "Event" },
      { key: "category", label: "Category", render: r => badge(
          r.categoryId ? (catName[r.categoryId] || "—") : "General", "badge-cat") },
      { key: "eventClass", label: "Event class", render: r => badge(classLabel(r.eventClass)) },
      { key: "status", label: "Status", render: r => el("div.btn-row", {}, [
          r.status === PUBLISH_STATUS.PUBLISHED ? badge("Published", "badge-ok")
          : r.status === PUBLISH_STATUS.FINALIZED ? badge("Finalized", "badge-live")
          : badge("Not finalized", "badge-warn"),
          // The whole purpose of the flag: a substituted ladder is never
          // silent, because it changes what the event was worth.
          r.fellBack
            ? el("span", { title:
                `This event is set to take points from "${r.pointsFrom || r.pointsSource || "another axis"}", but no ladder was configured for it, so its class ladder was used instead.` },
                badge("Class ladder used", "badge-warn"))
            : null
        ])},
      { key: "act", label: "", render: r =>
          r.status === PUBLISH_STATUS.PUBLISHED && is.admin()
            ? button("Unpublish", { class: "btn-sm btn-danger", onclick: guard(async () => {
                if (!await confirmDialog("Unpublish", `Hide ${r.name} from the public again?`, "Unpublish")) return;
                await unpublishEvent(r.id);
                toast("Unpublished."); paint();
              })})
            : "" }
    ], rows)));
  }

  async function showPreview(ids) {
    const impact = await previewImpact(ids);
    modal({
      title: "Preview impact",
      body: el("div", {}, [
        el("p.hint", { text: "Standings if everything currently checked were published. Nothing has been saved." }),
        table([
          { key: "name", label: "House" },
          { key: "before", label: "Now", num: true },
          { key: "delta", label: "Change", num: true, render: r => r.delta ? "+" + r.delta : "—" },
          { key: "after", label: "After", num: true }
        ], impact)
      ]),
      actions: [{ label: "Close" }]
    });
  }
}

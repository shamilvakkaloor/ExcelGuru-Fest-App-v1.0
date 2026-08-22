import { el, card, button, table, toast, guard, notice, empty, badge, modal, confirmDialog, filterBar } from "../../lib/ui.js";
import { getAll, getOne, put } from "../../lib/db.js";
import { previewImpact, publishEvents, unpublishEvent, rebuildPublicSnapshots,
         SNAPSHOT_BUILD } from "../../domain/publish.js";
import { PUBLISH_STATUS, classLabel, DEFAULTS, typeTierFilters, eventFilterKeys } from "../../domain/constants.js";
import { is } from "../../lib/session.js";

export default async function publishPage(root) {
  root.appendChild(el("h1", { text: "Results" }));
  const panel = el("div");
  root.appendChild(panel);

  /* Second half of the "Reload and rebuild" button below. The rebuild has
   * to happen AFTER the reload, because the whole problem it solves is a
   * tab running a stale module — so the click stores a flag, reloads, and
   * this picks the flag up on the way back in, when the fresh modules are
   * the ones doing the work. Cleared before the rebuild runs, so a failure
   * cannot leave the page rebuilding on every load. */
  const REBUILD_FLAG = "festRebuildAfterReload";
  let pendingRebuild = false;
  try {
    pendingRebuild = sessionStorage.getItem(REBUILD_FLAG) === "1";
    if (pendingRebuild) sessionStorage.removeItem(REBUILD_FLAG);
  } catch (e) { /* private mode — the manual button still works */ }

  await paint();

  if (pendingRebuild) {
    try {
      const r = await rebuildPublicSnapshots();
      toast(`Rebuilt ${r.events} events, ${r.students} participants.`);
      await paint();
    } catch (err) {
      console.error(err);
      toast("Could not rebuild the public pages. " + (err?.message || ""), true);
    }
  }

  async function paint() {
    panel.innerHTML = "";
    const [events, results, categories, settings, types, tiers, board] = await Promise.all([
      getAll("events"), getAll("results"), getAll("categories"),
      getOne("config", "festSettings").catch(() => null),
      getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
      getOne("publicLeaderboard", "main").catch(() => null)
    ]);
    const cfg = { ...DEFAULTS.festSettings, ...(settings || {}) };
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
          paint();
        })}) : null
      ]),
      /* A snapshot written by an older build of the app than the one now
       * loaded. Happens when a rebuild is run from a tab that was opened
       * before a deploy: the tab still holds the previous module in memory,
       * so the rebuild succeeds and reports success while quietly omitting
       * whatever the newer build adds. Without this the only symptom is a
       * feature that "does not work" on the public pages. */
      board && (board.snapshotBuild || 0) < SNAPSHOT_BUILD
        ? notice("warn", el("div", {}, [
            el("div", { text:
              "The public pages were last built by an older version of this app, so anything added since — " +
              "participant photos on the talent board, for one — is missing from them. Rebuilding from this " +
              "tab alone would repeat the same stale build: the tab is what runs the rebuild, and it is " +
              "still holding the older code. This button reloads first, then rebuilds by itself." }),
            el("div.btn-row", { style: "margin-top:.6rem" },
              button("Reload and rebuild", { class: "btn-accent", onclick: () => {
                try { sessionStorage.setItem(REBUILD_FLAG, "1"); } catch (e) {}
                location.reload();
              }}))
          ]))
        : null
    ]), "Publishing"));

    if (!rows.length) { panel.appendChild(empty("No events yet")); return; }

    // 151 events on one page with no way to narrow it. Status is the axis
    // that matters here — "show me everything still not finalized" — so it
    // leads, with the same Category/Class/Type/Tier axes the other screens
    // already offer. `remember` keeps the choice across the repaint that
    // every check, publish and unpublish triggers.
    const listBox = el("div");
    const bar = filterBar({
      remember: "admin-publish",
      filters: [
        { key: "filterStatus", label: "Status", allLabel: "All statuses",
          options: [
            { value: PUBLISH_STATUS.NOT_FINALIZED, label: "Not finalized" },
            { value: PUBLISH_STATUS.FINALIZED, label: "Finalized" },
            { value: PUBLISH_STATUS.PUBLISHED, label: "Published" }
          ] },
        { key: "filterStaged", label: "Checked", allLabel: "Checked or not",
          options: [{ value: "yes", label: "Checked to publish" }, { value: "no", label: "Not checked" }] },
        { key: "filterCategory", label: "Category",
          options: [...categories.map(c => ({ value: c.id, label: c.name })),
                    { value: "__general", label: "General" }] },
        { key: "filterClass", label: "Event class",
          options: [...new Map(rows.map(r =>
            [r.eventClass, { value: r.eventClass, label: classLabel(r.eventClass) }])).values()] },
        ...typeTierFilters({ types, tiers, enabled: !!cfg.useTypeTier })
      ],
      onChange: paintList
    });
    panel.append(bar.node, listBox);
    paintList();

    function paintList() {
      const list = rows
        .map(r => ({ ...r, ...eventFilterKeys(r),
                     filterStatus: r.status, filterStaged: r.staged ? "yes" : "no" }))
        .filter(bar.matches);
      listBox.innerHTML = "";
      if (!list.length) { listBox.appendChild(empty("No events match those filters")); return; }
      listBox.appendChild(card(table([
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
      ], list)));
    }
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

// Titles — admin-created awards (Best Debater, Best Singer) assigned by hand
// to one participant at a time, distinct from the ranked results a scored
// event produces. A title always carries a description, because "why" is
// the part a plaque or a public listing actually needs.
import { el, card, field, input, table, button, badge, toast, guard, notice, empty, modal, confirmDialog, loading, debounce, friendlyError, hint } from "../../lib/ui.js";
import { getAll, add, patch, remove, where, limit, orderBy } from "../../lib/db.js";
import { session } from "../../lib/session.js";

export default async function titlesPage(root) {
  root.appendChild(el("h1", { text: "Titles" }));
  root.appendChild(notice("info",
    "A title is awarded by hand, separate from any scored event — Best Debater, Best All-rounder, and " +
    "the like. It shows on the public results page and, for the participant's own house, in the House " +
    "Manager panel."));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading titles…"));
    let rows;
    try {
      rows = (await getAll("titles")).sort((a, b) => (b.awardedAt || 0) - (a.awardedAt || 0));
    } catch (err) {
      panel.innerHTML = "";
      panel.appendChild(notice("danger", friendlyError(err)));
      return;
    }
    panel.innerHTML = "";

    panel.appendChild(card(el("div", {}, [
      el("div.btn-row", {}, button("New title", { class: "btn-accent",
        onclick: () => titleDialog(null, paint) }))
    ]), "Award a title"));

    panel.appendChild(card(rows.length ? table([
      { key: "name", label: "Title", render: r => el("div", {}, [
          el("strong", { text: r.name }),
          el("div.hint", { style: "margin:0", text: r.description || "" })
        ])},
      { key: "participantName", label: "Awarded to", render: r => r.participantId
          ? el("div", {}, [
              el("div", { text: r.participantName }),
              el("div.hint", { style: "margin:0", text: r.houseName || "" })
            ])
          : badge("Not assigned yet", "badge-warn") },
      { key: "act", label: "", render: r => el("div.btn-row", {}, [
          button("Edit", { class: "btn-sm", onclick: () => titleDialog(r, paint) }),
          button("Remove", { class: "btn-sm btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Remove title",
              `Remove "${r.name}"? This does not affect any scored result.`, "Remove")) return;
            await remove("titles", r.id);
            toast("Removed."); paint();
          })})
        ])}
    ], rows) : empty("No titles yet", "Award the first one above."), "Awarded"));
  }
}

function titleDialog(existing, refresh) {
  const name = input({ value: existing?.name || "", placeholder: "e.g. Best Debater" });
  const description = el("textarea", { rows: 3, placeholder: "Why this title, and how it was decided." });
  description.value = existing?.description || "";

  // A simple name/chest search rather than a 600-option <select> — a fest
  // this size makes a plain dropdown unusable, and titles are awarded one
  // at a time, not often enough to need anything fancier.
  //
  // The participant is optional. A title can be created ahead of a
  // decision — "Best Debater" as a named category with no winner yet —
  // and assigned by editing it later. `existing.participantId` is the
  // real signal, not "existing carries a title at all": a title without
  // a winner still has a name and description to edit.
  let chosen = existing?.participantId
    ? { id: existing.participantId, name: existing.participantName, houseId: existing.houseId, houseName: existing.houseName }
    : null;
  const searchBox = input({ placeholder: "Search participant by name or chest number", autocomplete: "off" });
  const searchOut = el("div");
  const chosenOut = el("div");

  function paintChosen() {
    chosenOut.innerHTML = "";
    if (chosen) {
      chosenOut.appendChild(el("div.btn-row", {}, [
        notice("info", `Awarding to ${chosen.name}${chosen.houseName ? " — " + chosen.houseName : ""}.`),
        button("Clear", { class: "btn-sm", onclick: () => { chosen = null; paintChosen(); } })
      ]));
    } else {
      chosenOut.appendChild(hint("No winner chosen yet — save the title as-is and assign one later by editing it."));
    }
  }
  paintChosen();

  const runSearch = debounce(async () => {
    const term = searchBox.value.trim();
    searchOut.innerHTML = "";
    if (term.length < 2) return;
    const start = term.toLowerCase();
    const byName = await getAll("participants",
      orderBy("nameLower"), where("nameLower", ">=", start), where("nameLower", "<=", start + ""), limit(6))
      .catch(() => []);
    const byChest = /\d/.test(term)
      // Chest numbers are stored as strings in every format (chest.js) —
      // querying with Number(term) here compared a number against a
      // string field, which never matches. A search for a real chest
      // number silently returned nothing, every time.
      ? await getAll("participants", where("chestNumber", "==", term), limit(6)).catch(() => [])
      : [];
    const matches = [...byChest, ...byName].filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
    if (!matches.length) { searchOut.appendChild(hint("No match.")); return; }
    for (const p of matches) {
      searchOut.appendChild(button(`${p.name} — #${p.chestNumber ?? "—"} · ${p.houseName || ""}`, {
        class: "btn-sm", style: "display:block;width:100%;text-align:left;margin-bottom:.3rem",
        onclick: () => {
          chosen = { id: p.id, name: p.name, houseId: p.houseId || null, houseName: p.houseName || "" };
          searchBox.value = ""; searchOut.innerHTML = "";
          paintChosen();
        }
      }));
    }
  }, 300);
  searchBox.addEventListener("input", runSearch);

  modal({
    title: existing ? "Edit title" : "Award a title",
    body: el("div", {}, [
      field("Title", name),
      field("Description", description, "Why this title, and how it was decided. Shown wherever the title appears."),
      field("Participant", searchBox),
      searchOut,
      chosenOut
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Give the title a name.", true); return false; }
          if (!description.value.trim()) { toast("Add a description — why this title, and how.", true); return false; }
          // No participant required — a title can be named ahead of a
          // decision and assigned later by editing it.
          const data = {
            name: name.value.trim(),
            description: description.value.trim(),
            participantId: chosen?.id ?? null,
            participantName: chosen?.name ?? "",
            houseId: chosen?.houseId ?? null,
            houseName: chosen?.houseName ?? "",
            awardedAt: existing?.awardedAt || Date.now(),
            awardedBy: session.name || ""
          };
          if (existing) await patch("titles", existing.id, data);
          else await add("titles", data);
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

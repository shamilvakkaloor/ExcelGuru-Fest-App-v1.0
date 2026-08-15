// Manual point adjustments — discipline penalties, bonuses, corrections.
//
// Each adjustment is its own record carrying a reason and a description,
// rather than one opaque number on the house. That is the whole point: six
// months later "Red: -15" tells nobody anything, and a fest that cannot
// explain a deduction cannot defend it to the house that lost the points.
//
// Applied in domain/scoring.js aggregate(), alongside earned points, so a
// house or participant total is the only number anyone has to reconcile.
import { el, card, field, input, select, table, button, badge, toast, guard, notice, empty, modal, confirmDialog, loading, debounce, friendlyError, hint } from "../../lib/ui.js";
import { getAll, add, remove, where, limit, orderBy } from "../../lib/db.js";
import { housePluralTerm, houseTerm } from "../../domain/constants.js";
import { queueRepublish } from "../../domain/republish.js";
import { session } from "../../lib/session.js";
import { getOne } from "../../lib/db.js";

const REASONS = [
  { value: "discipline",  label: "Discipline" },
  { value: "lateEntry",   label: "Late entry" },
  { value: "rulesBreach", label: "Rules breach" },
  { value: "bonus",       label: "Bonus / special mention" },
  { value: "correction",  label: "Scoring correction" },
  { value: "other",       label: "Other" }
];
const reasonLabel = v => REASONS.find(r => r.value === v)?.label || v || "—";

export default async function adjustmentsPage(root) {
  root.appendChild(el("h1", { text: "Adjustments" }));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading adjustments…"));
    let rows, houses, settings;
    try {
      [rows, houses, settings] = await Promise.all([
        getAll("adjustments"), getAll("houses"), getOne("config", "festSettings").catch(() => null)
      ]);
    } catch (err) {
      panel.innerHTML = "";
      panel.appendChild(notice("danger", friendlyError(err)));
      return;
    }
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    panel.innerHTML = "";

    const hTerm = houseTerm(settings);
    const hPlural = housePluralTerm(settings);

    panel.appendChild(notice("info",
      `Add or take away points from a ${hTerm.toLowerCase()} or a participant. Every adjustment needs a ` +
      `reason and a description — a deduction nobody can explain is one the fest cannot defend. ` +
      `Adjustments count towards totals immediately once the standings rebuild.`));

    panel.appendChild(card(el("div.btn-row", {}, [
      button("Add adjustment", { class: "btn-accent",
        onclick: () => adjustmentDialog(houses, hTerm, paint) })
    ]), "Add"));

    // Running effect per target, so the net position is visible without
    // adding the column up by hand.
    const net = {};
    for (const r of rows) net[r.targetId] = (net[r.targetId] || 0) + Number(r.points || 0);

    panel.appendChild(card(rows.length ? table([
      { key: "target", label: "Applied to", render: r => el("div", {}, [
          el("div", { text: r.targetName || "—" }),
          el("div.hint", { style: "margin:0", text:
            (r.scope === "participant" ? "Participant" : hTerm) +
            (r.scope === "participant" && r.houseName ? " · " + r.houseName : "") })
        ])},
      { key: "points", label: "Points", num: true, render: r => {
          const p = Number(r.points || 0);
          return badge((p > 0 ? "+" : "") + p, p < 0 ? "badge-danger" : "badge-ok");
        }},
      { key: "reason", label: "Reason", render: r => el("div", {}, [
          el("div", { text: reasonLabel(r.reason) }),
          el("div.hint", { style: "margin:0", text: r.description || "" })
        ])},
      { key: "net", label: "Net so far", num: true, render: r => String(net[r.targetId] ?? 0) },
      { key: "by", label: "By", render: r => el("span.hint", { text: r.createdBy || "—" }) },
      { key: "act", label: "", render: r => button("Remove", {
          class: "btn-sm btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Remove adjustment",
              `Remove ${r.points > 0 ? "+" : ""}${r.points} from ${r.targetName}? Totals rebuild immediately.`,
              "Remove")) return;
            await remove("adjustments", r.id);
            queueRepublish({ results: true });
            toast("Removed. Standings rebuilding."); paint();
          })
        })}
    ], rows) : empty("No adjustments", `Totals are exactly what the ${hPlural.toLowerCase()} earned.`),
      "All adjustments"));
  }
}

function adjustmentDialog(houses, hTerm, refresh) {
  const scope = select([
    { value: "house", label: hTerm },
    { value: "participant", label: "Participant" }
  ], { value: "house" });

  const houseSel = select(houses.map(h => ({ value: h.id, label: h.name })));
  const houseField = field(hTerm, houseSel);

  // Participant chosen by search, same pattern as Titles — a fest-sized
  // roster makes a plain dropdown unusable.
  let chosen = null;
  const searchBox = input({ placeholder: "Search by name or chest number", autocomplete: "off" });
  const searchOut = el("div");
  const chosenOut = el("div");
  const participantField = el("div", {}, [field("Participant", searchBox), searchOut, chosenOut]);
  participantField.style.display = "none";

  scope.addEventListener("change", () => {
    const isHouse = scope.value === "house";
    houseField.style.display = isHouse ? "" : "none";
    participantField.style.display = isHouse ? "none" : "";
  });

  const runSearch = debounce(async () => {
    const term = searchBox.value.trim();
    searchOut.innerHTML = "";
    if (term.length < 2) return;
    const start = term.toLowerCase();
    const byName = await getAll("participants",
      orderBy("nameLower"), where("nameLower", ">=", start), where("nameLower", "<=", start + ""), limit(6))
      .catch(() => []);
    // Chest numbers are stored as strings in every format (chest.js) —
    // querying with Number(term) compared a number against a string
    // field, which never matches. A search for a real chest number
    // silently returned nothing, every time.
    const byChest = /\d/.test(term)
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
          chosenOut.innerHTML = "";
          chosenOut.appendChild(notice("info", `Applying to ${chosen.name}${chosen.houseName ? " — " + chosen.houseName : ""}.`));
        }
      }));
    }
  }, 300);
  searchBox.addEventListener("input", runSearch);

  const points = input({ type: "number", placeholder: "-5" });
  const reason = select(REASONS, { value: "discipline" });
  const description = el("textarea", { rows: 3, placeholder: "What happened, and who decided." });

  modal({
    title: "Add adjustment",
    body: el("div", {}, [
      field("Apply to", scope),
      houseField,
      participantField,
      field("Points", points, "Negative to deduct, positive to award."),
      field("Reason", reason),
      field("Description", description, "Required. Shown alongside the adjustment wherever it is listed.")
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const pts = Number(points.value);
          if (!points.value.trim() || isNaN(pts) || pts === 0) {
            toast("Enter a non-zero number of points.", true); return false;
          }
          if (!description.value.trim()) {
            toast("Add a description — an unexplained adjustment cannot be defended.", true); return false;
          }
          const isHouse = scope.value === "house";
          if (!isHouse && !chosen) { toast("Search for and choose a participant.", true); return false; }
          if (isHouse && !houseSel.value) { toast(`Choose a ${hTerm.toLowerCase()}.`, true); return false; }

          const target = isHouse
            ? { targetId: houseSel.value,
                targetName: houses.find(h => h.id === houseSel.value)?.name || "",
                houseId: houseSel.value, houseName: "" }
            : { targetId: chosen.id, targetName: chosen.name,
                houseId: chosen.houseId, houseName: chosen.houseName };

          await add("adjustments", {
            scope: isHouse ? "house" : "participant",
            ...target,
            points: pts,
            reason: reason.value,
            description: description.value.trim(),
            createdBy: session.name || "",
            createdAt: Date.now()
          });
          queueRepublish({ results: true });
          toast("Saved. Standings rebuilding.");
          close(true); refresh();
        })
      }
    ]
  });
}

// Public schedule. One snapshot document, gated by the Schedule Visible toggle.
//
// v7 is day-structured (ARCHITECTURE section 6.3): days first, in date order,
// then the venues running that day. A fest built under v6 has no festDays
// records, so the snapshot synthesises days from the venue dates and this
// screen renders them identically.
import { el, card, empty, badge, button, notice, filterBar, uniqOptions } from "../lib/ui.js";
import { getOne } from "../lib/db.js";
import { topbar } from "../app.js";
import { printDocument, escapeHTML } from "../lib/pdf.js";
import { toCSV, downloadText } from "../lib/csv.js";

export default async function schedulePage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap");
  root.appendChild(wrap);

  const snap = await getOne("publicSchedule", "main").catch(() => null);
  if (!snap || !snap.visible) {
    wrap.appendChild(empty("Schedule not published yet", "It will appear here once the organisers make it visible."));
    return;
  }

  const days = snap.days?.length
    ? snap.days
    : [{ id: "all", label: "Programme", date: "", venues: snap.venues || [] }];

  // Flattened once, for exports and for building the filter options.
  const flat = [];
  for (const d of days) {
    for (const v of d.venues || []) {
      for (const s of v.slots || []) {
        flat.push({
          day: d.label, date: d.date || "", venue: v.name, venueId: v.id, ...s,
          filterCategory: s.categoryName || "", filterVenue: v.id, filterDay: d.id,
          filterStage: s.stage || "",
          filterType: s.typeName || "", filterTier: s.tierName || ""
        });
      }
    }
  }

  if (!flat.length) { wrap.appendChild(empty("Nothing scheduled")); return; }

  const catOptions = [...new Map(flat.filter(r => r.categoryName)
    .map(r => [r.categoryName, { value: r.categoryName, label: r.categoryName }])).values()];
  const venueOptions = [...new Map(flat.map(r => [r.venueId, { value: r.venueId, label: r.venue }])).values()];
  const dayOptions = days.length > 1 ? days.map(d => ({ value: d.id, label: d.label })) : [];
  const stageOptions = [...new Map(flat.filter(r => r.stage)
    .map(r => [r.stage, { value: r.stage, label: r.stage }])).values()];

  const listBox = el("div");

  // I6 — the same shared filter bar every other screen uses.
  const bar = filterBar({
    remember: "schedule",
    filters: [
      { key: "filterDay", label: "Day", options: dayOptions },
      { key: "filterVenue", label: "Venue", options: venueOptions },
      { key: "filterCategory", label: "Category", options: catOptions },
      { key: "filterStage", label: "Stage", options: stageOptions },
      { key: "filterType", label: "Type", options: uniqOptions(flat, "typeName") },
      { key: "filterTier", label: "Tier", options: uniqOptions(flat, "tierName") }
    ],
    onChange: paint
  });

  wrap.appendChild(el("div.btn-row", { style: "margin-bottom:1rem" }, [
    button("Download CSV", { onclick: () => downloadText("schedule.csv", toCSV([
      { label: "Day", key: "day" }, { label: "Date", key: "date" },
      { label: "Venue", key: "venue" },
      { label: "Start", key: "startTime" }, { label: "End", key: "endTime" },
      { label: "Item", key: "title" }, { label: "Code", key: "code" },
      { label: "Category", key: "categoryName" },
      { label: "Type", key: "typeName" }, { label: "Tier", key: "tierName" }
    ], visible())) }),
    button("Print / PDF", { onclick: () => printDocument({
      title: (snap.festName || "Fest") + " — Schedule",
      bodyHTML: printHTML()
    }) })
  ]));
  wrap.append(bar.node, listBox);
  paint();

  function visible() { return flat.filter(bar.matches); }

  function paint() {
    listBox.innerHTML = "";
    const rows = visible();
    if (!rows.length) { listBox.appendChild(empty("Nothing matches those filters")); return; }

    for (const d of days) {
      const inDay = rows.filter(r => r.filterDay === d.id);
      if (!inDay.length) continue;

      if (days.length > 1) {
        listBox.appendChild(el("h2.day-head", {
          text: d.label + (d.date ? " · " + d.date : "")
        }));
      }

      for (const v of d.venues || []) {
        const slots = inDay.filter(r => r.venueId === v.id);
        if (!slots.length) continue;
        listBox.appendChild(card(
          el("div", {}, slots.map(s => el("div.slot-row" + (s.type === "break" ? ".break" : ""), {}, [
            el("span.time", { text: (s.startTime || "") + " – " + (s.endTime || "") }),
            el("div.body", {}, [
              el("strong", { text: s.title }),
              // I5 / I21 — the category travels with the item everywhere.
              el("div.hint", { style: "margin:0", text:
                [s.code, s.categoryName, s.typeName, s.tierName, s.stage].filter(Boolean).join(" · ") }),
              // Collapsed: the schedule is a scanning surface first.
              s.description
                ? el("details", { style: "margin-top:.3rem" }, [
                    el("summary.hint", { text: "Rules & criteria" }),
                    el("div.hint", { style: "white-space:pre-wrap;margin:.3rem 0 0", text: s.description })
                  ])
                : null
            ]),
            s.type === "break" ? badge("Break", "badge-warn") : null
          ]))),
          v.name + (d.date && days.length === 1 ? " · " + d.date : "")));
      }
    }
  }

  /** Print sheet: one section per day, then per venue — matches the screen. */
  function printHTML() {
    const rows = visible();
    let out = "";
    for (const d of days) {
      const inDay = rows.filter(r => r.filterDay === d.id);
      if (!inDay.length) continue;
      if (days.length > 1) {
        out += `<h1 style="page-break-before:always">${escapeHTML(d.label)}` +
               (d.date ? " · " + escapeHTML(d.date) : "") + `</h1>`;
      }
      for (const v of d.venues || []) {
        const slots = inDay.filter(r => r.venueId === v.id);
        if (!slots.length) continue;
        out += `<h2>${escapeHTML(v.name)}</h2>` +
          `<table><thead><tr><th>Time</th><th>Item</th><th>Code</th><th>Category</th><th>Type</th><th>Tier</th></tr></thead><tbody>` +
          slots.map(s =>
            `<tr><td class="mono">${escapeHTML(s.startTime || "")}–${escapeHTML(s.endTime || "")}</td>` +
            `<td>${escapeHTML(s.title || "")}</td>` +
            `<td class="mono">${escapeHTML(s.code || "")}</td>` +
            `<td>${escapeHTML(s.categoryName || "")}</td>` +
            `<td>${escapeHTML(s.typeName || "")}</td>` +
            `<td>${escapeHTML(s.tierName || "")}</td></tr>`).join("") +
          `</tbody></table>`;
      }
    }
    return out || "<p>Nothing scheduled.</p>";
  }
}

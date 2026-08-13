// Public results. Reads ONLY the pre-built snapshot documents — one for the
// leaderboard, one per published event — so a page load costs a handful of
// reads no matter how many participants the fest has.
import { el, card, table, empty, badge, button, notice, filterBar } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { topbar } from "../app.js";
import { POOL_LABEL, classLabel, EVENT_CLASSES, rankIsPublic } from "../domain/constants.js";
import { gradeLabel } from "../domain/scoring.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { printDocument, htmlTable } from "../lib/pdf.js";
import { toCSV, downloadText } from "../lib/csv.js";

export default async function resultsPage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap");
  root.appendChild(wrap);

  const board = await getOne("publicLeaderboard", "main").catch(() => null);
  // Per-event tables are fetched only when that tab is opened: the leaderboard
  // is two reads, the event list is one per published event.
  let events = null;

  if (!board?.eventCount) {
    wrap.appendChild(empty("No results published yet", "Standings appear here as soon as the organisers publish them."));
    return;
  }

  // ARCHITECTURE section 6.2 — how many places the public sees. Derived from
  // the rank ladder at publish time, so adding a fourth prize automatically
  // shows fourth place with no second setting to keep in sync.
  const rankLimit = board.rankLimit ?? 3;
  const talentLimit = Number(board.talentBoardLimit) || 0;
  const rankArt = board.rankArt || {};
  const houseStyle = board.houseStyle || {};

  // v8 — public custom boards get their own tab, under their own name.
  const boards = board.boards || [];
  const TABS = [["houses", "House rankings"], ["students", "Student talent"],
    ...boards.map(b => ["board:" + b.id, b.name]), ["events", "By event"]];

  let tab = "houses";
  const tabs = el("div.tabs");
  const panel = el("div");
  TABS.forEach(([id, label]) => tabs.appendChild(button(label, {
    class: id === tab ? "active" : "", onclick: () => { tab = id; paint(); }
  })));
  wrap.append(tabs, panel);

  function paint() {
    tabs.querySelectorAll("button").forEach((b, i) =>
      b.className = TABS[i][0] === tab ? "active" : "");
    panel.innerHTML = "";
    if (tab === "houses") paintHouses();
    else if (tab === "students") paintStudents();
    else if (tab.startsWith("board:")) paintBoard(tab.slice(6));
    else paintEvents();
  }

  /** A custom board — participants, with their house alongside. */
  function paintBoard(id) {
    const b = boards.find(x => x.id === id);
    if (!b) return panel.appendChild(empty("Board not found"));
    const rows = b.rows || [];
    if (!rows.length) {
      return panel.appendChild(empty("Nothing on this board yet",
        "It fills up as results in its events are published."));
    }
    const cap = b.rowLimit ?? talentLimit;
    const shown = cap ? rows.slice(0, cap) : rows;
    panel.appendChild(card(table([
      { key: "rank", label: "Rank", render: rankCell },
      { key: "name", label: "Participant" },
      { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: r.chestNumber || "" }) },
      { key: "houseName", label: "House", render: houseTag },
      { key: "events", label: "Events", num: true },
      { key: "total", label: "Points", num: true }
    ], shown), b.name + (cap && rows.length > cap ? ` — top ${cap}` : ""),
      exportRow(slug(b.name), rows,
        [{ label: "Rank", key: "rank" }, { label: "Name", key: "name" },
         { label: "Chest", key: "chestNumber" }, { label: "House", key: "houseName" },
         { label: "Events", key: "events" }, { label: "Points", key: "total" }])));
  }

  /** Medal for a ranked place, plain numeral past the artwork. */
  const rankCell = r => hasMedal(r.rank)
    ? rankNode(r.rank, { size: 38, rankArt })
    : el("span.rank-medal.rank-" + r.rank, { text: "#" + r.rank });

  function houseTag(row) {
    const st = houseStyle[row.id] || houseStyle[row.houseId] || {};
    return el("span.house-tag", {}, [
      st.logoData ? el("img.house-crest-sm", { src: st.logoData, alt: "" })
        : st.color ? el("i.house-dot", { style: "background:" + st.color }) : null,
      el("span", { text: row.name || row.houseName || "" })
    ]);
  }

  function paintHouses() {
    const rows = board?.houses || [];
    if (!rows.length) return panel.appendChild(empty("Nothing published yet"));
    panel.appendChild(card(table([
      { key: "rank", label: "Rank", render: rankCell },
      { key: "name", label: "House", render: houseTag },
      { key: "total", label: "Points", num: true }
    ], rows), "House rankings", exportRow("house-rankings", rows,
      [{ label: "Rank", key: "rank" }, { label: "House", key: "name" }, { label: "Points", key: "total" }])));
  }

  function paintStudents() {
    const all = board?.students || [];
    if (!all.length) return panel.appendChild(empty("Nothing published yet"));
    const cfg = board?.config || {};
    const included = ["Category Individual"]
      .concat(cfg.includeCategoryGroupPoints ? ["Category Group"] : [])
      .concat(cfg.includeGeneralIndividualPoints ? ["General Individual"] : [])
      .concat(cfg.includeGeneralGroupPoints ? ["General Group"] : []);

    const groups = cfg.splitByCategory
      ? groupBy(all, r => r.categoryName || "All categories")
      : { "All participants": all };

    panel.appendChild(notice("info", "Counting: " + included.join(", ")));
    for (const [name, list] of Object.entries(groups)) {
      const ranked = cfg.splitByCategory ? reRank(list) : list;
      // I4 — the board is trimmed for display only. The export below still
      // carries the full table.
      const shown = talentLimit ? ranked.slice(0, talentLimit) : ranked;
      panel.appendChild(card(table([
        { key: "rank", label: "Rank", render: rankCell },
        { key: "name", label: "Participant" },
        { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: r.chestNumber || "" }) },
        { key: "houseName", label: "House", render: houseTag },
        { key: "total", label: "Points", num: true }
      ], shown), name + (talentLimit && ranked.length > talentLimit ? ` — top ${talentLimit}` : ""),
        exportRow("talent-" + slug(name), ranked,
          [{ label: "Rank", key: "rank" }, { label: "Name", key: "name" }, { label: "Chest", key: "chestNumber" },
           { label: "House", key: "houseName" }, { label: "Points", key: "total" }])));
    }
  }

  async function paintEvents() {
    if (events === null) {
      panel.appendChild(el("div.hint", { text: "Loading events…" }));
      events = await getAll("publicResults").catch(() => []);
      panel.innerHTML = "";
    }
    if (!events.length) return panel.appendChild(empty("No event results published yet"));

    // I3 — filter by category and class. Rows expose the keys the filter
    // names, so the shared component in ui.js does the matching.
    const cats = [...new Map(events
      .filter(e => e.categoryName)
      .map(e => [e.categoryName, { value: e.categoryName, label: e.categoryName }])).values()];

    const listBox = el("div");
    const bar = filterBar({
      filters: [
        { key: "filterCategory", label: "Category", options: cats },
        { key: "filterClass", label: "Event class",
          options: EVENT_CLASSES.filter(c => events.some(e => e.eventClass === c.id))
            .map(c => ({ value: c.id, label: c.label })) },
        // Names travel on the snapshot, so the public page needs no extra reads.
        { key: "filterType", label: "Type",
          options: [...new Map(events.filter(e => e.typeName)
            .map(e => [e.typeName, { value: e.typeName, label: e.typeName }])).values()] },
        { key: "filterTier", label: "Tier",
          options: [...new Map(events.filter(e => e.tierName)
            .map(e => [e.tierName, { value: e.tierName, label: e.tierName }])).values()] }
      ],
      onChange: paintList
    });
    panel.append(bar.node, listBox);
    paintList();

    function paintList() {
      listBox.innerHTML = "";
      const sorted = [...events]
        .map(ev => ({ ...ev, filterCategory: ev.categoryName || "", filterClass: ev.eventClass || "",
                      filterType: ev.typeName || "", filterTier: ev.tierName || "" }))
        .filter(bar.matches)
        .sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)));

      if (!sorted.length) { listBox.appendChild(empty("No events match those filters")); return; }

      for (const ev of sorted) {
        const full = (ev.entries || []).filter(e => !e.isAbsent);
        // I2 — public tables stop at the ranked places. The CSV and print
        // buttons below deliberately carry the full table: a download is a
        // working document, not a display.
        const shown = full.filter(e => rankIsPublic(e.rank, rankLimit));
        listBox.appendChild(card(
          shown.length
            ? table([
                { key: "rank", label: "Rank", render: rankCell },
                { key: "names", label: "Participant", render: r => (r.names || []).join(", ") },
                { key: "houseName", label: "House", render: houseTag },
                { key: "grade", label: "Grade", render: r => badge(gradeLabel(r.grade, board), gradeKind(r.grade)) },
                { key: "totalPoints", label: "Points", num: true }
              ], shown)
            : el("div.hint", { text: "No placements to show." }),
          ev.eventName + (ev.categoryName ? " · " + ev.categoryName : "") +
            (ev.eventClass ? " · " + classLabel(ev.eventClass) : ""),
          exportRow(slug(ev.eventName), full,
            [{ label: "Rank", key: "rank" }, { label: "Participant", value: r => (r.names || []).join(", ") },
             { label: "House", key: "houseName" }, { label: "Grade", value: r => gradeLabel(r.grade, board) }, { label: "Points", key: "totalPoints" }])));
      }
    }
  }

  function exportRow(name, rows, cols) {
    return [
      button("CSV", { class: "btn-sm", onclick: () => downloadText(name + ".csv", toCSV(cols, rows)) }),
      button("Print / PDF", { class: "btn-sm", onclick: () =>
        printDocument({ title: name.replace(/-/g, " "), subtitle: board?.festName || "", bodyHTML: htmlTable(cols, rows) }) })
    ];
  }

  paint();
}

function gradeKind(g) {
  return g === "A" ? "badge-ok" : g === "Absent" ? "badge-danger" : g === "Without" ? "badge-warn" : "";
}
function groupBy(rows, fn) {
  const out = {};
  for (const r of rows) (out[fn(r)] ||= []).push(r);
  return out;
}
function reRank(list) {
  let rank = 0, prev = null;
  return [...list].sort((a, b) => b.total - a.total).map(r => {
    if (prev === null || r.total !== prev) { rank++; prev = r.total; }
    return { ...r, rank };
  });
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

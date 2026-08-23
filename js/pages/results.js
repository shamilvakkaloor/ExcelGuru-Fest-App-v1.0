// Public results. Reads ONLY the pre-built snapshot documents — one for the
// leaderboard, one per published event — so a page load costs a handful of
// reads no matter how many participants the fest has.
import { el, card, table, empty, badge, button, notice, filterBar, hint } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { topbar } from "../app.js";
import { POOL_LABEL, classLabel, EVENT_CLASSES, rankIsPublic, isGroupClass, namesWithChest } from "../domain/constants.js";
import { gradeLabel } from "../domain/scoring.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { nameColorStyle } from "../domain/houseColor.js";
import { printDocument, htmlTable } from "../lib/pdf.js";
import { toCSV, downloadText } from "../lib/csv.js";

export default async function resultsPage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap");
  root.appendChild(wrap);

  const [board, titles] = await Promise.all([
    getOne("publicLeaderboard", "main").catch(() => null),
    getAll("titles").catch(() => [])
  ]);
  // Per-event tables are fetched only when that tab is opened: the leaderboard
  // is two reads, the event list is one per published event.
  let events = null;

  // Titles are hand-awarded and independent of any scored event, so they can
  // exist before a single result is published — the page should still show
  // them rather than the blanket "nothing yet" empty state.
  if (!board?.eventCount && !titles.length) {
    wrap.appendChild(empty("No results published yet", "Standings appear here as soon as the organisers publish them."));
    return;
  }

  // ARCHITECTURE section 6.2 — how many places the public sees. Derived from
  // the rank ladder at publish time, so adding a fourth prize automatically
  // shows fourth place with no second setting to keep in sync.
  const rankLimit = board?.rankLimit ?? 3;
  const talentLimit = Number(board?.talentBoardLimit) || 0;
  const rankArt = board?.rankArt || {};
  const houseStyle = board?.houseStyle || {};
  // The snapshot carries the fest's own word for "House" so this page needs
  // no second document read to show a rename.
  const hTerm = board?.houseTerm || "House";
  const hPlural = board?.housePluralTerm || "Houses";

  // v8 — public custom boards get their own tab, under their own name.
  const boards = board?.boards || [];
  // The whole leaderboard tab set only makes sense once results exist; a
  // fest that has only awarded titles so far gets just that one tab.
  const boardCfg = board?.config || {};
  const houseBoardName  = (boardCfg.houseBoardName || "").trim() || (hPlural + " rankings");
  const talentBoardName = (boardCfg.talentBoardName || "").trim() || "Student talent";

  const TABS = board?.eventCount
    ? [["houses", houseBoardName], ["students", talentBoardName],
       ...boards.map(b => ["board:" + b.id, b.name]), ["events", "By event"],
       ...(titles.length ? [["titles", "Titles"]] : [])]
    : [["titles", "Titles"]];

  let tab = TABS[0][0];
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
    else if (tab === "titles") paintTitles();
    else if (tab.startsWith("board:")) paintBoard(tab.slice(6));
    else paintEvents();
  }

  /** Hand-awarded titles — always public, independent of any scored result. */
  function paintTitles() {
    if (!titles.length) return panel.appendChild(empty("No titles awarded yet"));
    const sorted = [...titles].sort((a, b) => (b.awardedAt || 0) - (a.awardedAt || 0));
    // The title-HOLDER'S name is the point of a title, so it carries the
    // same visual weight a rank-holder's name gets everywhere else on this
    // page — the title itself is now the small label, not the headline.
    panel.appendChild(card(el("div", {}, sorted.map(t => el("div", {
      style: "padding:.7rem 0;border-top:1px solid var(--line)"
    }, [
      badge(t.name, "badge-warn"),
      t.participantName
        ? el("div", { style: "font-family:var(--display);font-size:1.25rem;font-weight:700;margin-top:.35rem",
            text: t.participantName })
        : null,
      t.houseName ? el("div.hint", { style: "margin:0", text: t.houseName }) : null,
      t.description ? el("div.hint", { style: "margin:.3rem 0 0", text: t.description }) : null
    ]))), "Titles"));
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
      { key: "name", label: "Participant", render: r => el("span", { text: r.name, style: nameColorStyle(houseStyle, r.houseId) }) },
      { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: r.chestNumber || "" }) },
      { key: "houseName", label: hTerm, render: houseTag },
      { key: "events", label: "Events", num: true },
      { key: "total", label: "Points", num: true }
    ], shown), b.name + (cap && rows.length > cap ? ` — top ${cap}` : ""),
      exportRow(slug(b.name), rows,
        [{ label: "Rank", key: "rank" }, { label: "Name", key: "name" },
         { label: "Chest", key: "chestNumber" }, { label: hTerm, key: "houseName" },
         { label: "Events", key: "events" }, { label: "Points", key: "total" }])));
  }

  /** Medal for a ranked place, plain numeral past the artwork. */
  const rankCell = r => hasMedal(r.rank)
    ? rankNode(r.rank, { size: 38, rankArt })
    : el("span.rank-medal.rank-" + r.rank, { text: "#" + r.rank });

  function houseTag(row) {
    const st = houseStyle[row.id] || houseStyle[row.houseId] || {};
    // houseName first: a house row (paintHouses) has no houseName field, so
    // this still falls through to `name` there — but a PARTICIPANT row
    // (Student talent, a custom board) has both, and `name` on that row is
    // the participant's own name, not their house. Checking `name` first
    // showed a student's own name in their own House column.
    return el("span.house-tag", {}, [
      st.logoData ? el("img.house-crest-sm", { src: st.logoData, alt: "" })
        : st.color ? el("i.house-dot", { style: "background:" + st.color }) : null,
      el("span", { text: row.houseName || row.name || "" })
    ]);
  }

  function paintHouses() {
    const rows = board?.houses || [];
    if (!rows.length) return panel.appendChild(empty("Nothing published yet"));
    const mode = board?.championshipMode || "points";
    const champ = board?.championship || [];

    if (mode === "percentage" && champ.length) {
      panel.appendChild(card(table([
        { key: "rank", label: "Rank", render: rankCell },
        { key: "name", label: hTerm, render: houseTag },
        { key: "percent", label: "%", num: true, render: r => r.percent.toFixed(1) + "%" },
        { key: "points", label: "Points", num: true },
        { key: "maxEarnable", label: "Max earnable", num: true }
      ], champ), "Championship — " + houseBoardName.toLowerCase(),
        exportRow("house-rankings", champ,
          [{ label: "Rank", key: "rank" }, { label: hTerm, key: "name" }, { label: "%", key: "percent" },
           { label: "Points", key: "points" }, { label: "Max earnable", key: "maxEarnable" }])));
      panel.appendChild(el("p.hint", { text:
        "Ranked by points earned as a share of the most that house could plausibly have earned — not by raw points." }));
      return;
    }

    panel.appendChild(card(table([
      { key: "rank", label: "Rank", render: rankCell },
      { key: "name", label: hTerm, render: houseTag },
      { key: "total", label: "Points", num: true }
    ], rows), houseBoardName, exportRow("house-rankings", rows,
      [{ label: "Rank", key: "rank" }, { label: hTerm, key: "name" }, { label: "Points", key: "total" }])));

    if (mode === "both" && champ.length) {
      panel.appendChild(card(table([
        { key: "rank", label: "Rank", render: rankCell },
        { key: "name", label: hTerm, render: houseTag },
        { key: "percent", label: "%", num: true, render: r => r.percent.toFixed(1) + "%" },
        { key: "points", label: "Points", num: true },
        { key: "maxEarnable", label: "Max earnable", num: true }
      ], champ), "Championship (by percentage)"));
    }

    paintCategoryBreakdown();
  }

  /** Points split by category, so the category champions are visible. */
  function paintCategoryBreakdown() {
    const cb = board?.categoryBreakdown;
    if (!cb?.rows?.length || !cb.columns?.length) return;
    // A column nobody has scored in is noise on a public page.
    const cols = cb.columns.filter(c => cb.rows.some(r => (r.byCategory?.[c.id] || 0) > 0));
    if (!cols.length) return;

    panel.appendChild(card(table([
      { key: "name", label: hTerm, render: houseTag },
      ...cols.map(c => ({
        key: "cat_" + c.id, label: c.name, num: true,
        render: r => {
          const v = r.byCategory?.[c.id] || 0;
          const isLeader = cb.leaders?.[c.id]?.houseId === r.id && v > 0;
          return isLeader
            ? el("strong", { text: String(v), title: c.name + " champion" })
            : el("span", { text: String(v) });
        }
      })),
      { key: "total", label: "Total", num: true }
    ], cb.rows), "Points by category",
      exportRow("points-by-category", cb.rows,
        [{ label: hTerm, key: "name" },
         ...cols.map(c => ({ label: c.name, value: r => r.byCategory?.[c.id] || 0 })),
         { label: "Total", key: "total" }])));
    panel.appendChild(el("p.hint", { text: "The leading total in each category is shown in bold. General events are counted in their own column, so the category columns and General add up to the total." }));
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
        // Only the top of the board ever carries one — see the cap in
        // rebuildPublicSnapshots(), same "only a winner has a photo" rule an
        // event result already follows.
        { key: "name", label: "Participant", render: r => el("span", { style: "display:inline-flex;align-items:center;gap:.5rem" }, [
            r.photo ? el("img.result-photo", { src: r.photo, alt: "", loading: "lazy", onerror: e => e.target.remove() }) : null,
            el("span", { text: r.name, style: nameColorStyle(houseStyle, r.houseId) })
          ]) },
        { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: r.chestNumber || "" }) },
        { key: "houseName", label: hTerm, render: houseTag },
        { key: "total", label: "Points", num: true }
      ], shown), name + (talentLimit && ranked.length > talentLimit ? ` — top ${talentLimit}` : ""),
        exportRow("talent-" + slug(name), ranked,
          [{ label: "Rank", key: "rank" }, { label: "Name", key: "name" }, { label: "Chest", key: "chestNumber" },
           { label: hTerm, key: "houseName" }, { label: "Points", key: "total" }])));
    }
  }

  async function paintEvents() {
    if (events === null) {
      panel.appendChild(hint("Loading events…"));
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
      remember: "results-public",
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
                { key: "names", label: "Participant", render: r => entryDisplay(r, ev, houseStyle) },
                { key: "houseName", label: hTerm, render: houseTag },
                { key: "grade", label: "Grade", render: r => badge(gradeLabel(r.grade, board), gradeKind(r.grade)) },
                { key: "totalPoints", label: "Points", num: true }
              ], shown)
            : hint("No placements to show."),
          ev.eventName + (ev.categoryName ? " · " + ev.categoryName : "") +
            (ev.eventClass ? " · " + classLabel(ev.eventClass) : ""),
          exportRow(slug(ev.eventName), full,
            [{ label: "Rank", key: "rank" },
             { label: "Team", value: r => r.teamLabel || "" },
             { label: "Participant", value: r => namesWithChest(r.names, r.chestNumbers) },
             { label: hTerm, key: "houseName" }, { label: "Grade", value: r => gradeLabel(r.grade, board) }, { label: "Points", key: "totalPoints" }])));
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

// A group entry shows its team name first, roster underneath — the public
// snapshot carries teamLabel precomputed, so this reads it rather than
// re-deriving it from a house name and entry number.
function entryDisplay(r, ev, houseStyle = {}) {
  const nameStyle = nameColorStyle(houseStyle, r.houseId);

  /* Photos ride along only when an Admin switched them on, and the
   * snapshot only carries them for publicly-ranked entries — see
   * rebuildPublicSnapshots(). onerror removes the node rather than leaving
   * a broken-image icon: a Drive link that stopped being shared should
   * read as "no photo", not as a fault on the results page. */
  const photos = Array.isArray(r.photos) ? r.photos.filter(Boolean) : [];
  const withPhotos = node => photos.length
    ? el("div", { style: "display:flex;gap:.5rem;align-items:center" }, [
        el("div", { style: "display:flex;flex:0 0 auto" }, photos.slice(0, 4).map((src, i) =>
          el("img.result-photo", {
            src, alt: "", loading: "lazy",
            style: i ? "margin-left:-14px" : null,
            onerror: e => e.target.remove()
          }))),
        node
      ])
    : node;

  if (!isGroupClass(ev.eventClass) || !r.teamLabel) {
    return withPhotos(el("span", { text: namesWithChest(r.names, r.chestNumbers), style: nameStyle }));
  }
  if (r.wholeTeam) return withPhotos(el("span", { text: r.teamLabel, style: nameStyle }));
  return withPhotos(el("div", {}, [
    el("div", { text: r.teamLabel, style: nameStyle }),
    el("div.hint", { style: "margin:0", text: namesWithChest(r.names, r.chestNumbers) })
  ]));
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

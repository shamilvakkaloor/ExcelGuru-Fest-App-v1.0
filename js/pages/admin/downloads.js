import { el, card, button, table, toast, guard, notice, empty, badge, modal,
         filterBar, field, select, checkbox } from "../../lib/ui.js";
import { getAll, getOne, where } from "../../lib/db.js";
import { toCSV, downloadText } from "../../lib/csv.js";
import { printDocument, htmlTable, escapeHTML } from "../../lib/pdf.js";
import { shortfalls, limitsForCategory } from "../../domain/limits.js";
import { DEFAULTS, classLabel, PUBLISH_STATUS } from "../../domain/constants.js";
import { is } from "../../lib/session.js";
import { compareChest } from "../../domain/chest.js";
import { flattenResults, winnersList, gradeList, rankGradeList, nonRankHolders,
         participantSummary, houseRoster, absenteeList, emptyEvents,
         reportFilter } from "../../domain/reports.js";
import { EVENT_CLASSES, STAGES } from "../../domain/constants.js";
import { highestRankAwarded, gradeScaleFrom, gradeLabel, WITHOUT } from "../../domain/scoring.js";

export default async function downloads(root) {
  root.appendChild(el("h1", { text: "Downloads" }));

  root.appendChild(card(el("div", {}, [
    el("p.hint", { text: "CSV opens in Excel or Sheets. Print / PDF opens your browser's print dialog — choose \"Save as PDF\" as the destination." }),
    el("div.grid.grid-2", {}, [
      pack("Master participant list", participantsData),
      pack("Full results report", resultsData),
      pack("All-venue schedule", scheduleData),
      pack("Judge assignments", judgeData),
      pack("Registrations by event", registrationsData)
    ])
  ]), "Reports"));

  // v8 — the result reporting suite.
  root.appendChild(await resultReportsCard());

  if (is.admin()) {
    root.appendChild(card(el("div", {}, [
      el("p.hint", { text: "Every participant currently below a configured minimum. Minimums never block a registration — this is how you catch shortfalls." }),
      el("div.btn-row", {}, button("Run compliance report", { class: "btn-accent", onclick: guard(runCompliance) }))
    ]), "Compliance report"));
  }

  function pack(title, loader) {
    return el("div.card", { style: "margin:0" }, [
      el("h3", { text: title }),
      el("div.btn-row", {}, [
        button("CSV", { class: "btn-sm", onclick: guard(async () => {
          const { columns, rows, name } = await loader();
          if (!rows.length) { toast("Nothing to export yet.", true); return; }
          downloadText(name + ".csv", toCSV(columns, rows));
        })}),
        button("Print / PDF", { class: "btn-sm", onclick: guard(async () => {
          const { columns, rows, name } = await loader();
          if (!rows.length) { toast("Nothing to export yet.", true); return; }
          printDocument({ title, subtitle: window.__FEST_NAME__ || "", bodyHTML: htmlTable(columns, rows), landscape: columns.length > 6 });
        })})
      ])
    ]);
  }
}

async function participantsData() {
  const [rows, houses, cats] = await Promise.all([getAll("participants"), getAll("houses"), getAll("categories")]);
  const h = Object.fromEntries(houses.map(x => [x.id, x.name]));
  const c = Object.fromEntries(cats.map(x => [x.id, x.name]));
  return {
    name: "participants",
    columns: [
      { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
      { label: "House", value: r => h[r.houseId] || "" }, { label: "Category", value: r => c[r.categoryId] || "" },
      { label: "Class", key: "className" },
      { label: "Events entered", value: r => r.eventCounts?.overall || 0 }
    ],
    // Chest numbers are strings in all three formats from v7, so this is a
    // natural sort on the padded key, not a numeric subtraction.
    rows: rows.sort((a, b) => compareChest(a.chestNumber, b.chestNumber))
  };
}

async function resultsData() {
  const [results, settings] = await Promise.all([getAll("results"), getOne("config", "festSettings")]);
  const rows = [];
  for (const r of results) {
    for (const e of r.entries || []) {
      rows.push({
        event: r.eventName, code: r.eventCode, cls: classLabel(r.eventClass),
        status: r.publishStatus,
        rank: e.isAbsent ? "" : e.rank,
        team: e.teamLabel || "",
        names: (e.participantNames || []).join(" / "),
        house: e.houseName, grade: e.grade ? gradeLabel(e.grade, settings) : "",
        percent: e.percent === null ? "" : e.percent.toFixed(2),
        points: e.totalPoints
      });
    }
  }
  return {
    name: "results",
    columns: [
      { label: "Code", key: "code" }, { label: "Event", key: "event" }, { label: "Event class", key: "cls" },
      { label: "Status", key: "status" }, { label: "Rank", key: "rank" }, { label: "Team", key: "team" },
      { label: "Entry", key: "names" },
      { label: "House", key: "house" }, { label: "%", key: "percent" }, { label: "Grade", key: "grade" },
      { label: "Points", key: "points" }
    ],
    rows
  };
}

async function scheduleData() {
  const venues = await getAll("venues");
  const events = await getAll("events");
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  const rows = [];
  for (const v of venues) {
    const slots = (await getAll(`venues/${v.id}/slots`)).sort((a, b) => (a.order || 0) - (b.order || 0));
    let cursor = toMin(v.startTime) ?? 540;
    for (const s of slots) {
      const start = cursor; cursor += Number(s.durationMin) || 0;
      rows.push({
        venue: v.name, date: v.date || "",
        start: fmt(start), end: fmt(cursor),
        item: s.type === "break" ? (s.title || "Break") : (byId[s.eventId]?.name || "—"),
        code: s.type === "event" ? (byId[s.eventId]?.code || "") : ""
      });
    }
  }
  return {
    name: "schedule",
    columns: [
      { label: "Venue", key: "venue" }, { label: "Date", key: "date" },
      { label: "Start", key: "start" }, { label: "End", key: "end" },
      { label: "Item", key: "item" }, { label: "Code", key: "code" }
    ],
    rows
  };
}

async function judgeData() {
  const [events, assignments] = await Promise.all([getAll("events"), getAll("judgeAssignments")]);
  const rows = [];
  for (const e of events) {
    const assigned = assignments.filter(a => a.eventId === e.id);
    if (!assigned.length) rows.push({ code: e.code, event: e.name, judge: "— none assigned —" });
    for (const a of assigned) rows.push({ code: e.code, event: e.name, judge: a.judgeName });
  }
  return {
    name: "judge-assignments",
    columns: [{ label: "Code", key: "code" }, { label: "Event", key: "event" }, { label: "Judge", key: "judge" }],
    rows
  };
}

async function registrationsData() {
  const regs = await getAll("registrations");
  return {
    name: "registrations",
    columns: [
      { label: "Event", key: "eventName" }, { label: "Code letter", key: "codeLetter" },
      { label: "House", key: "houseName" }, { label: "Team", key: "teamLabel" },
      { label: "Participants", value: r => r.wholeTeam ? "Whole team" : (r.participantNames || []).join(" / ") },
      { label: "Chest numbers", value: r => (r.chestNumbers || []).join(" / ") }
    ],
    rows: regs.sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)))
  };
}

async function runCompliance() {
  const [participants, limits, houses, categories, types, tiers] = await Promise.all([
    getAll("participants"), getOne("config", "participantLimits"), getAll("houses"),
    getAll("categories"), getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  // Readable names for the dynamic Type/Tier keys.
  const vocab = {
    types: Object.fromEntries(types.map(t => [t.id, t.name])),
    tiers: Object.fromEntries(tiers.map(t => [t.id, t.name]))
  };

  const rows = [];
  for (const p of participants) {
    // The participant's OWN category decides their limits — the report was
    // measuring everyone against the global set, so with per-category
    // limits on it named the wrong people.
    const theirLimits = limitsForCategory(lim, p.categoryId);
    for (const s of shortfalls(p.eventCounts, theirLimits, vocab)) {
      rows.push({
        chest: p.chestNumber, name: p.name, house: houseName[p.houseId] || "",
        category: catName[p.categoryId] || p.categoryName || "—",
        // Which cap set was applied, so a shortfall can be traced back to
        // the settings that produced it.
        limitSet: (lim.perCategory && lim.byCategory?.[p.categoryId])
          ? (catName[p.categoryId] || "category") + " limits"
          : "shared default",
        requirement: s.label, required: s.required, actual: s.actual, short: s.required - s.actual
      });
    }
  }

  const columns = [
    { label: "Category", key: "category" },
    { label: "Chest", key: "chest" }, { label: "Name", key: "name" }, { label: "House", key: "house" },
    { label: "Requirement", key: "requirement" }, { label: "Needs", key: "required" },
    { label: "Has", key: "actual" }, { label: "Short by", key: "short" },
    { label: "Limits applied", key: "limitSet" }
  ];
  // Grouped by category so a per-category rule reads as one block.
  rows.sort((a, b) => String(a.category).localeCompare(String(b.category))
    || String(a.house).localeCompare(String(b.house))
    || String(a.name).localeCompare(String(b.name)));

  modal({
    title: "Compliance report",
    body: rows.length
      ? el("div", {}, [
          notice("warn", `${rows.length} shortfall${rows.length > 1 ? "s" : ""} across ${new Set(rows.map(r => r.name)).size} participants.`),
          table(columns, rows.slice(0, 100)),
          el("div.btn-row", {}, [
            button("Download CSV", { onclick: () => downloadText("compliance.csv", toCSV(columns, rows)) }),
            button("Print / PDF", { onclick: () => printDocument({
              title: "Compliance report", subtitle: window.__FEST_NAME__ || "", bodyHTML: htmlTable(columns, rows) }) })
          ])
        ])
      : notice("ok", "Every participant meets the configured minimums."),
    actions: [{ label: "Close" }]
  });
}

function toMin(hhmm) { const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
function fmt(mins) { const h = Math.floor(mins / 60) % 24, m = mins % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }

/* ══ v8 — result reporting suite ═════════════════════════════════════
 * Nine reports over one shared filter set. Every list is built from
 * PUBLISHED results only: drawing from unpublished ones would leak
 * placements before the announcement, which is exactly what the staged
 * publish workflow exists to prevent.
 *
 * Staff reports are NOT trimmed by the public rank limit — that limit is a
 * display convention on public pages, and an organiser needs the full table.
 */
async function resultReportsCard() {
  const [results, events, categories, houses, regs, types, tiers, settings, ladders] =
    await Promise.all([
      getAll("results"), getAll("events"), getAll("categories"), getAll("houses"),
      getAll("registrations"), getAll("programTypes").catch(() => []),
      getAll("programTiers").catch(() => []), getOne("config", "festSettings"),
      getAll("pointsConfig").catch(() => [])
    ]);

  const published = results.filter(r => r.publishStatus === PUBLISH_STATUS.PUBLISHED);
  const box = el("div");

  if (!published.length) {
    return card(el("div", {}, [
      notice("info", "These become available once you publish results. Nothing is drawn from unpublished events."),
    ]), "Result reports");
  }

  const allRows = flattenResults(published, { events, categories, houses });
  // Best-to-worst, for nonRankHolders' "best grade" — the fest's real order,
  // not an assumption that every scale is A/B/C.
  const gradeOrder = [...gradeScaleFrom(settings).map(g => g.id), WITHOUT];
  const maxRank = highestRankAwarded(ladders);
  const ranks = Array.from({ length: maxRank }, (_, i) => i + 1);
  // Filter and grouping use the id (stable); everything shown to the admin
  // uses gradeLabel(id, settings) so a rename is reflected here too.
  const GRADES = [...gradeScaleFrom(settings).map(g => ({ value: g.id, label: g.label })),
    { value: WITHOUT, label: gradeLabel(WITHOUT, settings) }];

  // ── shared filters ────────────────────────────────────────────────
  const sel = { categoryIds: [], houseIds: [], classIds: [], stages: [], typeIds: [], tierIds: [] };
  const bar = filterBar({
    filters: [
      { key: "categoryIds", label: "Category", options: categories.map(c => ({ value: c.id, label: c.name })) },
      { key: "houseIds", label: "House", options: houses.map(h => ({ value: h.id, label: h.name })) },
      { key: "classIds", label: "Event class", options: EVENT_CLASSES.map(c => ({ value: c.id, label: c.label })) },
      { key: "stages", label: "Stage", options: STAGES.map(s => ({ value: s.value, label: s.label })) },
      { key: "typeIds", label: "Type", options: types.map(t => ({ value: t.id, label: t.name })) },
      { key: "tierIds", label: "Tier", options: tiers.map(t => ({ value: t.id, label: t.name })) }
    ],
    onChange: v => { Object.assign(sel, v); paint(); }
  });

  // ── rank / grade selectors ────────────────────────────────────────
  const pickedRanks = new Set();
  const pickedGrades = new Set();
  const rankRow = chipRow(ranks.map(r => ({ value: r, label: ordinal(r) })), pickedRanks, paint);
  const gradeRow = chipRow(GRADES, pickedGrades, paint);

  const oneRank = select([{ value: "", label: "Any rank" },
    ...ranks.map(r => ({ value: String(r), label: ordinal(r) }))]);
  const oneGrade = select([{ value: "", label: "Any grade" }, ...GRADES]);
  oneRank.addEventListener("change", paint);
  oneGrade.addEventListener("change", paint);

  let includeAbsent = false;

  // Points range, for the participant list below. Blank means unbounded on
  // that side, so "at least 10" needs only one box filled.
  const ptsMin = input({ type: "number", placeholder: "min", style: "max-width:110px" });
  const ptsMax = input({ type: "number", placeholder: "max", style: "max-width:110px" });
  ptsMin.addEventListener("change", paint);
  ptsMax.addEventListener("change", paint);

  const grid = el("div.grid.grid-2");
  const countLine = el("div.hint");

  function filtered() { return allRows.filter(reportFilter(sel)); }

  function paint() {
    const rows = filtered();
    countLine.textContent = `${rows.length} result rows match the filters above.`;
    grid.innerHTML = "";

    grid.append(
      reportPack("Winners", () => {
        const out = winnersList(rows, { ranks: [...pickedRanks] });
        return { name: "winners", rows: out, columns: [
          { label: "Rank", value: r => ordinal(r.rank) },
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", key: "houseName" }, { label: "Category", key: "categoryName" },
          { label: "Event", key: "eventName" }, { label: "Grade", value: r => gradeLabel(r.grade, settings) },
          { label: "Points", key: "points" }
        ]};
      }, pickedRanks.size ? `ranks ${[...pickedRanks].sort((a,b)=>a-b).join(", ")}` : "all placements"),

      reportPack("Grade-wise", () => {
        const out = gradeList(rows, { grades: [...pickedGrades] });
        return { name: "grade-list", rows: out, columns: [
          { label: "Grade", value: r => gradeLabel(r.grade, settings) }, { label: "Chest", key: "chestNumber" },
          { label: "Name", key: "name" }, { label: "House", key: "houseName" },
          { label: "Event", key: "eventName" },
          { label: "Rank", value: r => r.rank ? ordinal(r.rank) : "" },
          { label: "Points", key: "points" }
        ]};
      }, pickedGrades.size ? `grades ${[...pickedGrades].join(", ")}` : "all grades"),

      reportPack("Rank + grade combination", () => {
        const out = rankGradeList(rows, { rank: oneRank.value || null, grade: oneGrade.value || null });
        return { name: "rank-grade", rows: out, columns: [
          { label: "Rank", value: r => r.rank ? ordinal(r.rank) : "" },
          { label: "Grade", value: r => gradeLabel(r.grade, settings) }, { label: "Chest", key: "chestNumber" },
          { label: "Name", key: "name" }, { label: "House", key: "houseName" },
          { label: "Event", key: "eventName" }
        ]};
      }, (oneRank.value ? ordinal(+oneRank.value) : "any rank") + " + " + (oneGrade.value || "any grade")),

      reportPack("Non-rank holders", () => {
        const out = nonRankHolders(rows, { ranks: [...pickedRanks], includeAbsent, gradeOrder });
        return { name: "non-rank-holders", rows: out, columns: [
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", key: "houseName" }, { label: "Category", key: "categoryName" },
          { label: "Events", key: "eventCount" }, { label: "Which", key: "eventList" },
          { label: "Best grade", value: r => r.bestGrade ? gradeLabel(r.bestGrade, settings) : "" },
          { label: "Points", key: "points" }
        ]};
      }, "counts " + (pickedRanks.size ? [...pickedRanks].sort((a,b)=>a-b).map(ordinal).join(", ") : "1st, 2nd, 3rd") + " as holding a rank"),

      /* The filtered participant list — one row per person, narrowed by
       * every axis at once: the shared filters above, plus rank earned,
       * grade earned and a points range. Built from participantSummary so
       * a person appears once however many events they entered. */
      reportPack("Participant list (filtered)", () => {
        const lo = ptsMin.value === "" ? null : Number(ptsMin.value);
        const hi = ptsMax.value === "" ? null : Number(ptsMax.value);
        const wantRanks = [...pickedRanks].map(Number);
        const wantGrades = [...pickedGrades].map(String);

        // Which participants hold one of the picked ranks / grades anywhere
        // in the filtered rows. Computed from the same rows the summary is,
        // so the two can never disagree.
        const rankHolders = new Set(rows
          .filter(r => !r.isAbsent && r.rank && (!wantRanks.length || wantRanks.includes(Number(r.rank))))
          .map(r => r.participantId));
        const gradeHolders = new Set(rows
          .filter(r => r.grade && (!wantGrades.length || wantGrades.includes(String(r.grade))))
          .map(r => r.participantId));

        const out = participantSummary(rows)
          .filter(p => !wantRanks.length || rankHolders.has(p.participantId))
          .filter(p => !wantGrades.length || gradeHolders.has(p.participantId))
          .filter(p => lo === null || (p.points || 0) >= lo)
          .filter(p => hi === null || (p.points || 0) <= hi);

        return { name: "participant-list", rows: out, columns: [
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", key: "houseName" }, { label: "Category", key: "categoryName" },
          { label: "Events", key: "events" }, { label: "Placed", key: "placed" },
          { label: "1st", key: "firsts" }, { label: "2nd", key: "seconds" }, { label: "3rd", key: "thirds" },
          { label: "Grades", value: r => (r.grades || []).map(g => gradeLabel(g, settings)).join(", ") },
          { label: "Points", key: "points" }
        ]};
      }, [
        pickedRanks.size ? "ranks " + [...pickedRanks].sort((a,b)=>a-b).join(", ") : null,
        pickedGrades.size ? "grades " + [...pickedGrades].map(g => gradeLabel(g, settings)).join(", ") : null,
        (ptsMin.value !== "" || ptsMax.value !== "")
          ? `points ${ptsMin.value || "0"}–${ptsMax.value || "∞"}` : null
      ].filter(Boolean).join(" · ") || "every participant with a published result"),

      reportPack("Per-participant summary", () => {
        const out = participantSummary(rows);
        return { name: "participant-summary", rows: out, columns: [
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", key: "houseName" }, { label: "Category", key: "categoryName" },
          { label: "Events", key: "events" }, { label: "Placed", key: "placed" },
          { label: "1st", key: "firsts" }, { label: "2nd", key: "seconds" }, { label: "3rd", key: "thirds" },
          { label: "Absent", key: "absent" },
          { label: "Grades", value: r => (r.grades || []).map(g => gradeLabel(g, settings)).join(", ") },
          { label: "Points", key: "points" }
        ]};
      }, "one row per participant"),

      reportPack("House roster with points", () => {
        const out = houseRoster(rows);
        return { name: "house-roster", rows: out, columns: [
          { label: "House", key: "houseName" }, { label: "Chest", key: "chestNumber" },
          { label: "Name", key: "name" }, { label: "Category", key: "categoryName" },
          { label: "Events", key: "events" }, { label: "Points", key: "points" }
        ]};
      }, "grouped by house"),

      reportPack("Absentees", () => {
        const out = absenteeList(rows);
        return { name: "absentees", rows: out, columns: [
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", key: "houseName" }, { label: "Event", key: "eventName" }
        ]};
      }, "entries marked Absent"),

      reportPack("Events with no entries", () => {
        const out = emptyEvents(events, regs);
        return { name: "empty-events", rows: out, columns: [
          { label: "Code", key: "code" }, { label: "Name", key: "name" },
          { label: "Event class", value: r => classLabel(r.eventClass) }
        ]};
      }, "nobody registered")
    );
  }

  paint();

  return card(el("div", {}, [
    el("p.hint", { text: "Built from published results only. Filters apply to every report below. Staff reports always show every rank — the public rank limit is a display setting, not a data one." }),
    bar.node,
    el("div.grid.grid-2", {}, [
      el("div", {}, [el("h4", { text: "Ranks (for Winners and Non-rank holders)" }), rankRow]),
      el("div", {}, [el("h4", { text: "Grades (for Grade-wise)" }), gradeRow])
    ]),
    el("div.grid.grid-2", { style: "margin-top:.6rem" }, [
      field("Rank + grade: rank", oneRank), field("Rank + grade: grade", oneGrade)
    ]),
    el("div.grid.grid-2", { style: "margin-top:.6rem" }, [
      field("Points at least", ptsMin, "For the filtered participant list."),
      field("Points at most", ptsMax, "Leave either blank for no bound.")
    ]),
    checkbox("Include absentees in Non-rank holders", false, v => { includeAbsent = v; paint(); }),
    countLine,
    grid
  ]), "Result reports");
}

/** A row of multi-select chips backed by a Set. */
function chipRow(options, set, onChange) {
  const row = el("div.chip-row");
  for (const o of options) {
    const b = button(o.label, { class: "chip", onclick: () => {
      set.has(o.value) ? set.delete(o.value) : set.add(o.value);
      b.classList.toggle("on");
      onChange();
    }});
    row.appendChild(b);
  }
  return row;
}

/** One report tile: a live count plus CSV and Print buttons. */
function reportPack(title, build, subtitle) {
  const { rows, columns, name } = build();
  return el("div.card", { style: "margin:0" }, [
    el("h3", { text: title }),
    el("div.hint", { style: "margin:0 0 .5rem", text: subtitle }),
    el("div.report-count", { text: rows.length + (rows.length === 1 ? " row" : " rows") }),
    el("div.btn-row", {}, [
      button("CSV", { class: "btn-sm", disabled: !rows.length, onclick: () =>
        downloadText(name + ".csv", toCSV(columns, rows)) }),
      button("Print / PDF", { class: "btn-sm", disabled: !rows.length, onclick: () =>
        printDocument({ title, subtitle, bodyHTML: htmlTable(columns, rows) }) })
    ])
  ]);
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

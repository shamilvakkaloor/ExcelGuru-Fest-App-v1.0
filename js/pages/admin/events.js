import { el, card, field, input, select, checkbox, button, table, toast, guard,
         notice, empty, modal, confirmDialog, badge, toLocalInput, fromLocalInput,
         filterBar } from "../../lib/ui.js";
import { getAll, getOne, add, patch, remove, nextCounter, raiseCounter, batchWrite } from "../../lib/db.js";
import { EVENT_CLASSES, STAGES, classLabel, isGroupClass, isGeneralClass,
         eventCategoryLabel, maxEntriesFor, minEntriesFor, DEFAULTS,
         POINTS_FROM, RESULT_MODES, typeTierFilters, eventFilterKeys } from "../../domain/constants.js";
import { parseCSVObjects, readFile, toCSV, downloadText } from "../../lib/csv.js";

export default async function events(root) {
  root.appendChild(el("h1", { text: "Events" }));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    const [rows, categories, settings, results, regs, types, tiers] = await Promise.all([
      getAll("events"), getAll("categories"), getOne("config", "festSettings"),
      getAll("results"), getAll("registrations"),
      getAll("programTypes"), getAll("programTiers")
    ]);
    const axes = { ...DEFAULTS.festSettings.pointsAxes, ...((settings || {}).pointsAxes || {}) };
    const typeName = Object.fromEntries(types.map(t => [t.id, t.name]));
    const tierName = Object.fromEntries(tiers.map(t => [t.id, t.name]));
    const classification = { types, tiers, typeName, tierName, axes };
    const entryCount = {};
    for (const r of regs) entryCount[r.eventId] = (entryCount[r.eventId] || 0) + 1;
    const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const cfg = { ...DEFAULTS.festSettings, ...(settings || {}) };
    const useMin = !!cfg.useMinEntryCaps;
    // A published event is locked: editing its class or category after results
    // are public would silently invalidate the standings already on display.
    const publishedIds = new Set(
      results.filter(r => r.publishStatus === "Published").map(r => r.id));

    panel.appendChild(card(el("div.btn-row", {}, [
      button("Add event", { class: "btn-accent", onclick: () => eventDialog(null, categories, cfg, classification, paint) }),
      button("Import CSV", { onclick: () => importDialog(categories, cfg, classification, paint) }),
      button("Download template", { onclick: () => downloadText("events-template.csv", toCSV([
        { label: "code", key: "code" }, { label: "name", key: "name" }, { label: "eventClass", key: "eventClass" },
        { label: "category", key: "category" }, { label: "stage", key: "stage" },
        { label: "type", key: "type" }, { label: "tier", key: "tier" },
        { label: "pointsFrom", key: "pf" }, { label: "resultMode", key: "rm" },
        { label: "gradePoints", key: "gp" }, { label: "description", key: "desc" },
        { label: "maxParticipantsPerEntry", key: "a" }, { label: "maxEntriesPerHouse", key: "b" },
        { label: "minEntriesPerHouse", key: "c" }
      ], [{ code: "E01", name: "Solo Song", eventClass: "categoryIndividual", category: "Junior", stage: "onStage",
            type: "Song", tier: "", pf: "class", rm: "scored", gp: "yes", desc: "3 minutes maximum. Judged on tone, rhythm and presentation.", a: 1, b: 2, c: 1 },
          { code: "", name: "Skit", eventClass: "generalGroup", category: "", stage: "onStage",
            type: "", tier: "", pf: "class", rm: "scored", gp: "yes", desc: "", a: 6, b: 1, c: "" }])) }),
      // I13 — export the event list itself, not just a blank template. Same
      // shape as the import so it round-trips, plus entry count and state.
      button("Export CSV", { onclick: () => downloadText("events.csv", toCSV([
        { label: "code", key: "code" },
        { label: "name", key: "name" },
        { label: "eventClass", key: "eventClass" },
        { label: "category", value: r => eventCategoryLabel(r, catName) },
        { label: "stage", value: r => r.stage === "onStage" ? "onStage" : "offStage" },
        // v8 — these were missing, so exporting and re-importing silently
        // stripped every Type/Tier and points setting on every event.
        { label: "type", value: r => typeName[r.typeId] || "" },
        { label: "tier", value: r => tierName[r.tierId] || "" },
        { label: "pointsFrom", value: r => r.pointsFrom || "class" },
        { label: "resultMode", value: r => r.resultMode || "scored" },
        { label: "gradePoints", value: r => r.awardsGradePoints === false ? "no" : "yes" },
        { label: "description", value: r => r.description || "" },
        { label: "maxParticipantsPerEntry", value: r => r.maxParticipantsPerEntry || 1 },
        { label: "maxEntriesPerHouse", value: r => maxEntriesFor(r) ?? "" },
        { label: "minEntriesPerHouse", value: r => minEntriesFor(r) ?? "" },
        { label: "blindJudging", value: r => (r.blindJudging ?? cfg.blindJudgingDefault) ? "yes" : "no" },
        { label: "entries", value: r => entryCount[r.id] || 0 },
        { label: "state", value: r => publishedIds.has(r.id) ? "Published"
            : (results.find(x => x.id === r.id) ? "Finalized" : "Not finalized") }
      ], rows)) })
    ]), `${rows.length} events`));

    if (publishedIds.size) {
      panel.appendChild(notice("info",
        publishedIds.size + " published event" + (publishedIds.size > 1 ? "s are" : " is") +
        " locked. To change one, unpublish it on the Results screen first — editing a live event would invalidate standings already on display."));
    }

    if (!rows.length) { panel.appendChild(empty("No events yet", "Add them one at a time or import a CSV.")); return; }

    // I3 — the same shared filter bar every other screen uses.
    const listBox = el("div");
    const bar = filterBar({
      filters: [
        { key: "filterCategory", label: "Category",
          options: [...categories.map(c => ({ value: c.id, label: c.name })),
                    { value: "__general", label: "General" }] },
        { key: "filterClass", label: "Event class",
          options: EVENT_CLASSES.filter(c => rows.some(r => r.eventClass === c.id))
            .map(c => ({ value: c.id, label: c.label })) },
        { key: "filterStage", label: "Stage",
          options: STAGES.map(st => ({ value: st.value, label: st.label })) },
        ...typeTierFilters({ types, tiers, enabled: !!cfg.useTypeTier })
      ],
      onChange: paintList
    });
    panel.append(bar.node, listBox);
    paintList();

    function paintList() {
      const list = rows
        .map(r => ({ ...r, ...eventFilterKeys(r) }))
        .filter(bar.matches)
        .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")) || a.name.localeCompare(b.name));

      listBox.innerHTML = "";
      if (!list.length) { listBox.appendChild(empty("No events match those filters")); return; }

      listBox.appendChild(card(table([
      { key: "code", label: "Code", render: r => el("span.mono", { text: r.code || "" }) },
      { key: "name", label: "Event" },
      { key: "eventClass", label: "Event class", render: r => badge(classLabel(r.eventClass)) },
      { key: "categoryId", label: "Category", render: r => eventCategoryLabel(r, catName) },
      { key: "stage", label: "Stage", render: r => r.stage === "onStage" ? "On stage" : "Off stage" },
      // Visible at a glance, not only in the edit dialog.
      ...(cfg.useTypeTier ? [{ key: "classification", label: "Type / Tier", render: r => {
        const bits = [typeName[r.typeId], tierName[r.tierId]].filter(Boolean);
        return bits.length ? el("span", { text: bits.join(" · ") }) : el("span.hint", { text: "—" });
      }}] : []),
      // Where this event's points come from, when that can vary.
      ...((cfg.pointsAxes?.stage || cfg.pointsAxes?.type || cfg.pointsAxes?.tier)
        ? [{ key: "pointsFrom", label: "Points from", render: r => {
            const v = r.pointsFrom || "class";
            return v === "class" ? el("span.hint", { text: "Class" })
              : badge(v.charAt(0).toUpperCase() + v.slice(1));
          }}] : []),
      // I12 / I31 — both caps, on every class. v6 rendered the per-house cap
      // only for group events, because it was silently ignored elsewhere.
      { key: "cap", label: "Entries per house", render: r => {
          const max = maxEntriesFor(r), min = useMin ? minEntriesFor(r) : null;
          return el("div", {}, [
            el("div", { text: max === null ? "no maximum" : "max " + max }),
            min ? el("div.hint", { style: "margin:0", text: "min " + min }) : null,
            isGroupClass(r.eventClass)
              ? el("div.hint", { style: "margin:0", text: (r.maxParticipantsPerEntry || 1) + " per entry" })
              : null
          ]);
        }},
      { key: "blind", label: "Blind", render: r => (r.blindJudging ?? settings?.blindJudgingDefault) ? badge("Blind", "badge-live") : "—" },
      { key: "state", label: "State", render: r => publishedIds.has(r.id)
          ? badge("Published", "badge-ok") : badge("Editable") },
      { key: "act", label: "", render: r => publishedIds.has(r.id)
        ? el("span.hint", { text: "Unpublish first" })
        : el("div.btn-row", {}, [
          button("Edit", { class: "btn-sm", onclick: () => eventDialog(r, categories, cfg, classification, paint) }),
          button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Delete event", `Delete "${r.name}"? Registrations and scores for it are not removed automatically.`, "Delete")) return;
            await remove("events", r.id); toast("Deleted."); paint();
          })})
        ])}
      ], list)));
    }
  }
}

function eventDialog(existing, categories, settings, classification, refresh) {
  const name  = input({ value: existing?.name || "" });
  const code  = input({ value: existing?.code || "", placeholder: "Leave blank to auto-number" });
  const cls   = select(EVENT_CLASSES.map(c => ({ value: c.id, label: c.label })), { value: existing?.eventClass || EVENT_CLASSES[0].id });
  const cat   = select([{ value: "", label: "—" }, ...categories.map(c => ({ value: c.id, label: c.name }))], { value: existing?.categoryId || "" });
  const stage = select(STAGES, { value: existing?.stage || "onStage" });
  const perEntry = input({ type: "number", min: 1, value: existing?.maxParticipantsPerEntry || 1 });
  // I12 — ONE pair of per-house caps, applied to all four classes. v6 had two
  // separate inputs and saved only the group one, which is why the cap did
  // nothing on individual events.
  const perHouse = input({ type: "number", min: 0,
    value: maxEntriesFor(existing) ?? "", placeholder: "blank = no maximum" });
  const minHouse = input({ type: "number", min: 0,
    value: minEntriesFor(existing) ?? "", placeholder: "blank = no minimum" });
  const regStart = input({ type: "datetime-local", value: toLocalInput(existing?.registrationStart) });
  const regEnd   = input({ type: "datetime-local", value: toLocalInput(existing?.registrationEnd) });
  let blind = existing?.blindJudging ?? !!settings?.blindJudgingDefault;

  /* ── v8 — classification and the points source ────────────────────
   * Type and Tier are plain selects, shown only when the fest turned the
   * classification on. "Points from" is the one that matters: it names
   * the SINGLE ladder this event uses. No precedence chain, no adding
   * ladders together — see domain/scoring.js resolvePoints().
   */
  const { types = [], tiers = [], axes = {} } = classification || {};
  const useTypeTier = !!settings?.useTypeTier;

  const typeSel = select([{ value: "", label: "—" },
    ...types.map(t => ({ value: t.id, label: t.name }))], { value: existing?.typeId || "" });
  const tierSel = select([{ value: "", label: "—" },
    ...tiers.map(t => ({ value: t.id, label: t.name }))], { value: existing?.tierId || "" });

  // Only offer axes the fest actually switched on for points.
  const pointsOptions = POINTS_FROM.filter(o =>
    o.value === "class" ||
    (o.value === "stage" && axes.stage) ||
    (o.value === "type"  && axes.type && useTypeTier) ||
    (o.value === "tier"  && axes.tier && useTypeTier));
  const pointsFrom = select(pointsOptions, { value: existing?.pointsFrom || "class" });

  const classBox = el("fieldset", {}, [
    el("legend", { text: "Classification" }),
    el("div.hint", { text: "Filter axes. They only affect points if you also pick them below." }),
    el("div.grid.grid-2", {}, [field("Type", typeSel), field("Tier", tierSel)])
  ]);
  classBox.style.display = useTypeTier ? "" : "none";

  const pointsWarn = el("div.hint");
  const pointsBox = el("fieldset", {}, [
    el("legend", { text: "Points" }),
    field("Points from", pointsFrom,
      "Which ladder decides this event's rank AND grade points. One source only."),
    pointsWarn
  ]);
  // With no axis switched on there is nothing to choose, so the whole box
  // stays hidden and every event keeps using its class ladder.
  pointsBox.style.display = pointsOptions.length > 1 ? "" : "none";

  function syncPoints() {
    const v = pointsFrom.value;
    let msg = "";
    if (v === "stage") msg = "Uses the ladder configured for " + (stage.value === "onStage" ? "On stage" : "Off stage") + ".";
    if (v === "type")  msg = typeSel.value ? "Uses the ladder for this Type." : "No Type is set, so this event will fall back to its class ladder.";
    if (v === "tier")  msg = tierSel.value ? "Uses the ladder for this Tier." : "No Tier is set, so this event will fall back to its class ladder.";
    pointsWarn.textContent = msg;
  }
  [pointsFrom, typeSel, tierSel, stage].forEach(n => n.addEventListener("change", syncPoints));

  /* ── v8 — gradeless and direct results ────────────────────────────
   * Two independent switches, both defaulting to v7 behaviour.
   */
  // A new event follows the fest's rank-only default; an existing one keeps
  // whatever it was saved with.
  let awardsGrade = existing
    ? existing.awardsGradePoints !== false
    : !settings?.gradelessDefault;
  let excludeFromTotals = !!existing?.excludeFromTotals;
  const resultMode = select(RESULT_MODES, { value: existing?.resultMode || "scored" });
  const modeHint = el("div.hint");
  function syncMode() {
    modeHint.textContent = resultMode.value === "direct"
      ? "Judges do not score this. Admin picks each placement from a dropdown of the ladder's positions — for items settled on paper."
      : "Judges enter marks; the average decides the ranking.";
  }
  resultMode.addEventListener("change", syncMode);

  const forced = (settings?.resultPolicy || "both") !== "both";
  const resultModeField = field("Result mode", resultMode);
  if (forced) resultModeField.style.display = "none";

  const resultBox = el("fieldset", {}, [
    el("legend", { text: "How the result is decided" }),
    forced
      ? el("div.hint", { text: "This fest is set so every event is " +
          (settings.resultPolicy === "direct"
            ? "entered directly by placement. "
            : "scored by judges. ") +
          "Change that in Settings \u2192 Fest details to choose per event." })
      : null,
    resultModeField,
    modeHint,
    checkbox("This event awards grade points", awardsGrade, v => awardsGrade = v),
    el("div.hint", { text: "Turn off for a gradeless event. The grade is still worked out and shown, but contributes 0 points. Rank points are unaffected." }),
    checkbox("Leave this event out of overall totals and leaderboards", excludeFromTotals, v => excludeFromTotals = v),
    el("div.hint", { text: "The event is still judged, ranked and published as normal — its points simply do not count towards house totals or any leaderboard. For exhibition or invitational items." })
  ]);

  const description = el("textarea", { rows: 6,
    placeholder: "Rules, scoring criteria, time limits — whatever a participant or judge needs to know." });
  description.value = existing?.description || "";

  let wholeTeam = !!existing?.wholeTeam;
  const wholeTeamBox = el("fieldset", {}, [
    el("legend", { text: "Whole-team event" }),
    checkbox("The whole team contests this — no individual participants", wholeTeam,
      v => { wholeTeam = v; syncClass(); }),
    el("div.hint", { text: "For a march-past, team chant or similar. The house registers once with no roster and earns the points as a unit; nothing counts against any participant's event caps. Group events only." })
  ]);

  const catField = field("Category", cat, "Ignored for general events.");
  const perEntryBox = field("Maximum participants per entry", perEntry);
  const minBox = field("Minimum entries per house", minHouse,
    "Reporting only — it never blocks a registration. A house is below its minimum for most of the registration period, so blocking would make the last entry the only one that could succeed.");
  const capBox = el("fieldset", {}, [
    el("legend", { text: "Entries per house" }),
    perEntryBox,
    field("Maximum entries per house", perHouse,
      "How many entries one house may put into this event. Blank means no maximum."),
    minBox
  ]);

  let substitutionOpen = !!existing?.substitutionOpen;
  const subBox = el("fieldset", {}, [
    el("legend", { text: "Substitutions" }),
    checkbox("Allow House Managers to request a substitution for this event", substitutionOpen, v => substitutionOpen = v),
    el("div.hint", { text: "Off by default. Turning this on lets a House Manager ask to replace any current participant in one of their entries — Admin still approves or rejects each request. Closes automatically once code letters are assigned." })
  ]);

  function syncClass() {
    const group = isGroupClass(cls.value);
    perEntryBox.style.display = group ? "" : "none";
    catField.style.display = isGeneralClass(cls.value) ? "none" : "";
    // I31 — minimums are hidden entirely when the fest has them switched off.
    // An always-visible field that is always blank is noise.
    minBox.style.display = settings?.useMinEntryCaps ? "" : "none";
    // Whole-team only makes sense for a group event, and a per-entry
    // participant maximum is meaningless once there is no roster.
    wholeTeamBox.style.display = group ? "" : "none";
    if (!group) wholeTeam = false;
    perEntryBox.style.display = (group && !wholeTeam) ? "" : "none";
  }
  cls.addEventListener("change", syncClass);

  modal({
    title: existing ? "Edit event" : "Add event",
    body: el("div", {}, [
      field("Event name", name),
      field("Event code", code),
      field("Event class", cls),
      catField,
      field("Description", description,
        "Rules and regulations, scoring criteria. Shown to judges when they open this event to score, and on the public event list."),
      field("Stage", stage),
      classBox,
      pointsBox,
      resultBox,
      wholeTeamBox,
      capBox,
      subBox,
      el("fieldset", {}, [
        el("legend", { text: "Registration window override" }),
        el("div.hint", { text: "Leave blank to use the fest-wide window." }),
        el("div.grid.grid-2", {}, [field("Opens", regStart), field("Deadline", regEnd)])
      ]),
      checkbox("Blind judging for this event", blind, v => blind = v)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Event name is required.", true); return false; }
          const maxV = perHouse.value === "" ? null : Number(perHouse.value);
          const minV = minHouse.value === "" ? null : Number(minHouse.value);
          if (maxV !== null && minV !== null && minV > maxV) {
            toast("The minimum entries per house cannot be above the maximum.", true);
            return false;
          }
          let finalCode = code.value.trim();
          if (!finalCode) finalCode = String(await nextCounter("eventCode")).padStart(2, "0");
          const data = {
            name: name.value.trim(),
            code: finalCode,
            eventClass: cls.value,
            description: description.value.trim(),
            categoryId: isGeneralClass(cls.value) ? null : (cat.value || null),
            stage: stage.value,
            // v8 — classification and the single point source.
            typeId: useTypeTier ? (typeSel.value || null) : (existing?.typeId ?? null),
            tierId: useTypeTier ? (tierSel.value || null) : (existing?.tierId ?? null),
            pointsFrom: pointsFrom.value || "class",
            awardsGradePoints: awardsGrade,
            excludeFromTotals,
            resultMode: resultMode.value || "scored",
            wholeTeam: isGroupClass(cls.value) ? wholeTeam : false,
            maxParticipantsPerEntry: isGroupClass(cls.value) ? Math.max(1, Number(perEntry.value) || 1) : 1,
            // Blank / 0 stores null, which every consumer reads as "no cap".
            maxEntriesPerHouse: perHouse.value === "" ? null : (Number(perHouse.value) || null),
            minEntriesPerHouse: minHouse.value === "" ? null : (Number(minHouse.value) || null),
            blindJudging: blind,
            substitutionOpen,
            registrationStart: fromLocalInput(regStart.value),
            registrationEnd: fromLocalInput(regEnd.value),
            status: existing?.status || "open"
          };
          if (existing) await patch("events", existing.id, data);
          else await add("events", data);
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
  syncClass();
  syncPoints();
  syncMode();
}

function importDialog(categories, settings, classification, refresh) {
  const file = el("input", { type: "file", accept: ".csv,text/csv" });
  const out  = el("div");

  modal({
    title: "Import events from CSV",
    body: el("div", {}, [
      el("p.hint", { text: "Columns: code, name, eventClass, category, stage, maxParticipantsPerEntry, maxEntriesPerHouse. Only name and eventClass are required; a blank code is auto-numbered." }),
      field("CSV file", file),
      out
    ]),
    actions: [
      { label: "Close" },
      { label: "Import", kind: "accent", closes: false, busyLabel: "Importing…", onClick: guard(async close => {
          if (!file.files?.length) { toast("Choose a file first.", true); return false; }
          const { rows } = parseCSVObjects(await readFile(file.files[0]));
          const catByName = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c.id]));

          /* v8 — Types and Tiers are matched by NAME, case-insensitively,
           * and CREATED AUTOMATICALLY when the file names one that does not
           * exist yet. That is what makes a spreadsheet the fastest way to
           * set a fest up: you should not have to pre-declare eleven Types
           * by hand before importing the file that lists them. */
          const typeByName = Object.fromEntries((classification?.types || []).map(t => [t.name.toLowerCase(), t.id]));
          const tierByName = Object.fromEntries((classification?.tiers || []).map(t => [t.name.toLowerCase(), t.id]));
          const created = [];

          async function ensureAxis(collection, map, rawName) {
            const key = String(rawName || "").trim();
            if (!key) return null;
            const lower = key.toLowerCase();
            if (map[lower]) return map[lower];
            const id = await add(collection, { name: key, sortOrder: Object.keys(map).length + 1 });
            map[lower] = id;
            created.push(key);
            return id;
          }

          const ops = [], errors = [];
          let auto = 0;

          const usesTypeTier = !!settings?.useTypeTier;

          for (const [i, r] of rows.entries()) {
            const rowNo = i + 2;
            if (!r.name) { errors.push(`Row ${rowNo}: missing name.`); continue; }
            const clsRaw = (r.eventclass || "").replace(/\s/g, "").toLowerCase();
            const cls = EVENT_CLASSES.find(c => c.id.toLowerCase() === clsRaw)?.id;
            if (!cls) { errors.push(`Row ${rowNo}: eventClass must be one of ${EVENT_CLASSES.map(c => c.id).join(", ")}.`); continue; }
            const general = isGeneralClass(cls);
            const catId = general ? null : (catByName[(r.category || "").toLowerCase()] || null);
            if (!general && r.category && !catId) errors.push(`Row ${rowNo}: unknown category "${r.category}" — left blank.`);
            const typeId = usesTypeTier ? await ensureAxis("programTypes", typeByName, r.type) : null;
            const tierId = usesTypeTier ? await ensureAxis("programTiers", tierByName, r.tier) : null;

            // pointsFrom must name a real axis; anything unrecognised falls
            // back to the class ladder rather than silently zeroing points.
            const pfRaw = String(r.pointsfrom || "class").trim().toLowerCase();
            const pointsFrom = ["class", "stage", "type", "tier"].includes(pfRaw) ? pfRaw : "class";
            if (pfRaw && pointsFrom !== pfRaw) {
              errors.push(`Row ${rowNo}: unknown pointsFrom "${r.pointsfrom}" — using the class ladder.`);
            }
            const rmRaw = String(r.resultmode || "scored").trim().toLowerCase();
            const resultMode = rmRaw === "direct" ? "direct" : "scored";

            ops.push({
              name: r.name,
              code: r.code || null,
              eventClass: cls,
              categoryId: catId,
              stage: (r.stage || "").toLowerCase().includes("off") ? "offStage" : "onStage",
              typeId, tierId, pointsFrom, resultMode,
              description: (r.description || "").trim(),
              awardsGradePoints: !/^(no|false|0)$/i.test(String(r.gradepoints || "").trim()),
              maxParticipantsPerEntry: isGroupClass(cls) ? Math.max(1, Number(r.maxparticipantsperentry) || 1) : 1,
              // I12 — applies to every class on import too. v6 forced 1 here
              // for individual events while registration ignored it entirely.
              maxEntriesPerHouse: r.maxentriesperhouse === "" || r.maxentriesperhouse === undefined
                ? null : (Number(r.maxentriesperhouse) || null),
              minEntriesPerHouse: r.minentriesperhouse === "" || r.minentriesperhouse === undefined
                ? null : (Number(r.minentriesperhouse) || null),
              blindJudging: !!settings?.blindJudgingDefault,
              registrationStart: null, registrationEnd: null, status: "open"
            });
            if (!r.code) auto++;
          }

          out.innerHTML = "";
          if (created.length) {
            out.appendChild(notice("info",
              "Created " + [...new Set(created)].join(", ") + " automatically. Set their point ladders in Settings \u2192 Points & grades if you want them to award different points."));
          }
          if (!ops.length) {
            out.appendChild(notice("danger", el("div", {}, [
              el("strong", { text: "Nothing to import." }),
              el("ul", {}, errors.map(e => el("li", { text: e })))
            ])));
            return false;
          }

          const start = auto ? await nextCounter("eventCode", auto) : 0;
          let n = start;
          for (const o of ops) if (!o.code) o.code = String(n++).padStart(2, "0");

          // I29 — one batched commit rather than one sequential write per
          // row. batchWrite chunks at 400 internally.
          await batchWrite(ops.map(o => ({
            type: "set", path: "events", id: crypto.randomUUID(), data: o, merge: false
          })));

          // A partial import holds the dialog open, same as participants:
          // closing it would take the list of skipped rows with it.
          if (errors.length) {
            refresh();
            out.appendChild(notice("warn", el("div", {}, [
              el("strong", { text: `Imported ${ops.length}. Skipped ${errors.length}.` }),
              el("ul", {}, errors.map(e => el("li", { text: e }))),
              el("div.hint", { text: "Fix these rows in the file and import them again — the rows above were not added." })
            ])));
            toast(`Imported ${ops.length}, skipped ${errors.length}.`, true);
            return false;
          }

          toast(`Imported ${ops.length} events.`);
          close(true); refresh();
        })
      }
    ]
  });
}

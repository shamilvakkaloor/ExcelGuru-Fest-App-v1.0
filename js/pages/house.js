// House Manager panel: register the house's own participants for events,
// withdraw before code letters are assigned, and download the house's lists.
import { el, card, field, input, select, button, table, toast, guard, notice,
         empty, badge, modal, confirmDialog, loading, filterBar, uniqOptions } from "../lib/ui.js";
import { avatar } from "../lib/photo.js";
import { getAll, getOne, add, where } from "../lib/db.js";
import { appShell } from "../lib/shell.js";
import { session } from "../lib/session.js";
import { registerEntry, registerMany, withdrawEntry, windowState, canWithdraw, countByEvent }
  from "../domain/registration.js";
import { substitutionWindow, requestSubstitution, SUB_STATUS } from "../domain/substitution.js";
import { DEFAULTS, GENDERS, classLabel, isGroupClass, isGeneralClass, eventLabel,
         eventCategoryLabel, maxEntriesFor, minEntriesFor, entryCompletion,
         typeTierFilters, eventFilterKeys, entryLabel } from "../domain/constants.js";
import { compareChest, allocateChest, takenChestNumbers, readChestCounter,
         raiseChestCounter, chestSortKey } from "../domain/chest.js";
import { gradeLabel } from "../domain/scoring.js";
import { resolveCategory } from "../domain/autocategory.js";
import { shortfalls, limitsForCategory } from "../domain/limits.js";
import { toCSV, downloadText } from "../lib/csv.js";
import { printDocument, htmlTable } from "../lib/pdf.js";
import { fileAppeal, appealWindowState } from "../domain/appeals.js";
import { compressToBudget, dataUrlBytes } from "../lib/photo.js";
import { submitMaterial, materialsWindow, MATERIAL_STATUS } from "../domain/materials.js";

export default async function housePage(root) {
  const { content: wrap } = appShell(root, { title: "Register" });

  const house = await getOne("houses", session.refId);
  if (!house) { wrap.appendChild(empty("House not found", "Ask your Admin to check this account.")); return; }

  // I25 — the house code is internal. It identifies records and seeds chest
  // prefixes; it is not display material and is shown to nobody.
  wrap.appendChild(el("h1", {}, [
    house.logoData ? el("img.house-crest", { src: house.logoData, alt: "" }) : null,
    el("span", { text: house.name, style: house.color ? "color:" + house.color : null })
  ]));

  let tab = "register";
  const tabs = el("div.tabs");
  const panel = el("div");
  const TAB_LIST = [["register", "Register"], ["entries", "Our entries"], ["subs", "Substitutions"],
   ["people", "Our participants"], ["results", "Our results"], ["titles", "Titles"],
   // Off the tab strip entirely unless an Admin has turned it on — a tab
   // that always errors "not enabled" is worse than a tab that isn't there.
   ...(window.__APPEALS_ENABLED__ ? [["appeals", "Appeals"]] : []),
   ["schedule", "Schedule"]];
  TAB_LIST.forEach(([id, label]) => tabs.appendChild(button(label, {
      class: id === tab ? "active" : "", onclick: () => { tab = id; paint(); }
    })));
  wrap.append(tabs, panel);

  async function paint() {
    tabs.querySelectorAll("button").forEach((b, i) =>
      b.className = TAB_LIST[i][0] === tab ? "active" : "");
    panel.innerHTML = "";
    panel.appendChild(loading("Loading…"));
    const render = { register: registerTab, entries: entriesTab, subs: subsTab,
                     people: peopleTab, results: houseResultsTab, titles: houseTitlesTab,
                     appeals: appealsTab,
                     schedule: scheduleTab }[tab];
    panel.innerHTML = "";
    await render(panel, house, paint);
  }
  await paint();
}

async function registerTab(panel, house, refresh) {
  const [events, settings, limits, people, ourRegs, categories, types, tiers] = await Promise.all([
    getAll("events"), getOne("config", "festSettings"), getOne("config", "participantLimits"),
    getAll("participants", where("houseId", "==", house.id)),
    getAll("registrations", where("houseId", "==", house.id)),
    getAll("categories"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
  const cfg = { ...DEFAULTS.festSettings, ...(settings || {}) };
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const countBy = countByEvent(ourRegs);
  // Constraint groups and an event lookup, needed to evaluate "at most N of
  // these" at registration time.
  const constraintGroups = await getAll("constraintGroups").catch(() => []);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  if (!people.length) {
    panel.appendChild(empty("No participants yet", "An organiser adds participants to your house before registration opens."));
    return;
  }

  // Passing the house id means an extension granted to THIS house keeps the
  // event on their list after the general deadline has passed.
  const open = events.filter(e => windowState(e, cfg, Date.now(), house.id).open);
  if (!open.length) {
    panel.appendChild(empty("Registration is closed", "No event is currently open for entries."));
    return;
  }

  /* ── I24 — completed vs uncompleted ────────────────────────────────
   * "Completed" means the house has met this event's minimum entries. When
   * minimums are switched off fest-wide, or an event leaves the minimum
   * blank, one entry counts as complete (ARCHITECTURE section 11.5).
   */
  const useMin = !!cfg.useMinEntryCaps;
  const status = e => entryCompletion(e, countBy[e.id] || 0, useMin);
  const doneCount = open.filter(e => status(e).complete).length;

  const summary = el("div.completion", {}, [
    el("div.completion-bar", {}, el("i", { style: `width:${Math.round((doneCount / open.length) * 100)}%` })),
    el("div", { text: `${doneCount} of ${open.length} events complete` })
  ]);

  const listBox = el("div");

  const bar = filterBar({
    filters: [
      { key: "filterState", label: "Status", allLabel: "All events",
        options: [{ value: "todo", label: "Not complete" }, { value: "done", label: "Complete" }] },
      { key: "filterCategory", label: "Category",
        options: [...categories.map(c => ({ value: c.id, label: c.name })),
                  { value: "__general", label: "General" }] },
      { key: "filterClass", label: "Event class",
        options: [...new Map(open.map(e => [e.eventClass, { value: e.eventClass, label: classLabel(e.eventClass) }])).values()] },
      { key: "filterStage", label: "Stage",
        options: [...new Map(open.map(e => [e.stage || "onStage",
          { value: e.stage || "onStage", label: (e.stage === "offStage" ? "Off stage" : "On stage") }])).values()] },
      ...typeTierFilters({ types, tiers, enabled: !!cfg.useTypeTier })
    ],
    onChange: paintList
  });

  panel.appendChild(card(el("div", {}, [
    summary,
    el("p.hint", { text: useMin
      ? "An event counts as complete once your house meets its minimum number of entries."
      : "An event counts as complete once your house has entered at least one participant." })
  ]), "Registration progress"));

  panel.appendChild(notice("info",
    "Maximum event limits are checked as you register. If a participant is at their limit you will see which cap was hit."));

  panel.append(bar.node, listBox);
  paintList();

  function paintList() {
    const rows = open
      .map(e => ({ ...e, ...eventFilterKeys(e), filterState: status(e).complete ? "done" : "todo" }))
      .filter(bar.matches)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    listBox.innerHTML = "";
    if (!rows.length) { listBox.appendChild(empty("No events match those filters")); return; }

    listBox.appendChild(card(table([
      { key: "code", label: "Code", render: e => el("span.mono", { text: e.code || "" }) },
      { key: "name", label: "Event", render: e => el("div", {}, [
          el("div", { text: e.name }),
          // I5 / I21 — the category travels with the item.
          el("div.hint", { style: "margin:0", text:
            [eventCategoryLabel(e, catName), classLabel(e.eventClass)].filter(Boolean).join(" · ") }),
          // Collapsed by default: a House Manager scanning forty events
          // wants the list, and the rules only when they stop at one.
          e.description
            ? el("details", { style: "margin-top:.3rem" }, [
                el("summary.hint", { text: "Rules & criteria" }),
                el("div.hint", { style: "white-space:pre-wrap;margin:.3rem 0 0", text: e.description })
              ])
            : null
        ])},
      { key: "entries", label: "Ours", num: true, render: e => {
          // I12 — the per-house cap applies to every class now, so it is
          // displayed for every class too. v6 showed "—" for individual
          // events because the cap was silently ignored there.
          const max = maxEntriesFor(e);
          const min = useMin ? minEntriesFor(e) : null;
          const n = countBy[e.id] || 0;
          return el("div", {}, [
            el("div", { text: `${n}${max === null ? "" : " / " + max}` }),
            min ? el("div.hint", { style: "margin:0", text: "min " + min }) : null
          ]);
        }},
      { key: "state", label: "Status", render: e => status(e).complete
          ? badge("Complete", "badge-ok")
          : badge(useMin && minEntriesFor(e) ? `Needs ${status(e).need}` : "Not entered", "badge-warn") },
      { key: "act", label: "", render: e => {
          const max = maxEntriesFor(e);
          const full = max !== null && (countBy[e.id] || 0) >= max;
          return button(full ? "Full" : "Register", {
            class: "btn-sm " + (full ? "" : "btn-accent"),
            disabled: full,
            onclick: () => entryDialog(e, house, people, cfg, lim, catName, countBy[e.id] || 0, refresh,
                                       constraintGroups, eventById)
          });
        }}
    ], rows), "Open events"));
  }
}

function entryDialog(event, house, people, settings, limits, catName, used, refresh,
                     constraintGroups = [], eventById = {}) {
  const eligible = event.categoryId ? people.filter(p => p.categoryId === event.categoryId) : people;
  const chosen = new Set();
  const group = isGroupClass(event.eventClass);

  /* A whole-team event has no roster to pick, so the participant picker is
   * replaced by a plain confirmation. Showing an empty, unusable picker
   * would only invite the question of who to select. */
  if (event.wholeTeam && group) {
    modal({
      title: event.name,
      body: el("div", {}, [
        notice("info",
          `${house.name} enters this as a whole team — there is no participant list. ` +
          `The points go to the ${(window.__HOUSE_TERM__ || "house").toLowerCase()}, and nothing counts ` +
          `against anyone's event limits.`)
      ]),
      actions: [
        { label: "Cancel" },
        { label: "Enter " + house.name, kind: "accent", closes: false, busyLabel: "Entering…",
          onClick: guard(async close => {
            await registerEntry({
              event, house, participants: [], settings, limits,
              registeredBy: session.name || house.name
            });
            toast("Entered."); close(true); refresh();
          })
        }
      ]
    });
    return;
  }

  // I20 — for an INDIVIDUAL event, selecting five people creates five
  // separate entries in one pass. v6 allowed exactly one per attempt, so a
  // House Manager reopened this dialog once per participant.
  const perEntryMax = group ? (event.maxParticipantsPerEntry || 1) : 1;
  // How many more entries this house may still add to this event.
  const cap = maxEntriesFor(event);
  const roomLeft = cap === null ? eligible.length : Math.max(0, cap - (used || 0));
  const selectMax = group ? perEntryMax : Math.max(1, Math.min(eligible.length, roomLeft));

  const search = input({ placeholder: "Search name or chest number", autocomplete: "off" });
  const counter = el("div.pick-count");
  const list = el("div.pick-grid");

  const sorted = [...eligible].sort((a, b) => compareChest(a.chestNumber, b.chestNumber));

  function updateCounter() {
    counter.textContent = group
      ? `${chosen.size} of ${perEntryMax} selected`
      : (chosen.size
          ? `${chosen.size} selected — ${chosen.size} separate ${chosen.size === 1 ? "entry" : "entries"}`
          : "Select one or more participants");
    counter.className = "pick-count" + (chosen.size ? " has" : "");
  }

  function paintList() {
    const term = search.value.trim().toLowerCase();
    list.innerHTML = "";
    const shown = sorted.filter(p => !term
      || p.name.toLowerCase().includes(term) || String(p.chestNumber).toLowerCase().includes(term));

    if (!shown.length) {
      list.appendChild(el("div.hint", { style: "padding:1rem", text: eligible.length
        ? "Nobody matches that search." : "No participant in your house is eligible for this event." }));
      return;
    }

    for (const p of shown) {
      const selected = chosen.has(p.id);
      const cardEl = el("button.pick-card" + (selected ? ".selected" : ""), { type: "button" }, [
        avatar(p, 46),
        el("div.pick-body", {}, [
          el("div.pick-name", { text: p.name }),
          el("div.pick-meta", {}, [
            el("span.mono", { text: "#" + (p.chestNumber ?? "") }),
            p.className ? el("span", { text: " · " + p.className }) : null
          ])
        ]),
        el("span.pick-tick", { text: selected ? "✓" : "" })
      ]);
      cardEl.addEventListener("click", () => {
        if (chosen.has(p.id)) chosen.delete(p.id);
        else {
          if (group && chosen.size >= perEntryMax) { toast(`At most ${perEntryMax} per entry.`, true); return; }
          if (!group && chosen.size >= selectMax) {
            toast(`Only ${selectMax} more ${selectMax === 1 ? "entry is" : "entries are"} allowed for this event.`, true);
            return;
          }
          chosen.add(p.id);
        }
        updateCounter();
        paintList();
      });
      list.appendChild(cardEl);
    }
  }

  search.addEventListener("input", paintList);
  paintList();
  updateCounter();

  modal({
    title: "Register for " + eventLabel(event, catName),
    body: el("div", {}, [
      el("p.hint", { text: group
        ? `Tap to select up to ${perEntryMax} participants for this entry.`
        : "Tap to select as many participants as you like — each becomes its own entry." }),
      search, counter, list
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Register", kind: "accent", closes: false, busyLabel: "Registering…", onClick: guard(async close => {
          const picked = eligible.filter(p => chosen.has(p.id));
          if (!picked.length) { toast("Select at least one participant.", true); return false; }

          if (group) {
            await registerEntry({ event, house, participants: picked, settings, limits,
              registeredBy: house.name, constraintGroups, eventById });
            toast("Registered.");
            close(true); refresh();
            return;
          }

          // Partial success: one capped participant must not block the rest.
          const { done, failed } = await registerMany({
            event, house, participants: picked, settings, limits, registeredBy: house.name,
            constraintGroups, eventById
          });

          if (!failed.length) {
            toast(`Registered ${done.length} ${done.length === 1 ? "entry" : "entries"}.`);
            close(true); refresh();
            return;
          }

          close(true);
          refresh();
          modal({
            title: "Registration report",
            body: el("div", {}, [
              notice(done.length ? "warn" : "danger",
                `${done.length} registered, ${failed.length} could not be.`),
              ...failed.map(f => el("div", { style: "padding:.4rem 0;border-top:1px solid var(--line)" }, [
                el("strong", { text: f.participant.name }),
                el("div.hint", { style: "margin:0", text: f.reason })
              ]))
            ]),
            actions: [{ label: "Close" }]
          });
        })
      }
    ]
  });
}

// A group entry's primary line is now the team ("Red B"), not the roster —
// the roster still matters, so it drops to a hint line underneath rather
// than disappearing.
function entryCell(r, event) {
  if (r.wholeTeam) return el("span.hint", { text: "Whole team" });
  if (!isGroupClass(event?.eventClass || r.eventClass)) return (r.participantNames || []).join(", ");
  return el("div", {}, [
    el("div", { text: entryLabel(r, event) }),
    el("div.hint", { style: "margin:0", text: (r.participantNames || []).join(", ") })
  ]);
}

async function entriesTab(panel, house, refresh) {
  const [regs, events, settings, limits, categories, types, tiers, subs, materials] = await Promise.all([
    getAll("registrations", where("houseId", "==", house.id)),
    getAll("events"), getOne("config", "festSettings"), getOne("config", "participantLimits"),
    getAll("categories"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
    getAll("substitutions", where("houseId", "==", house.id)).catch(() => []),
    getAll("eventMaterials", where("houseId", "==", house.id)).catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const cfgS = { ...DEFAULTS.festSettings, ...(settings || {}) };
  // One pending request per entry — knowing this HERE means the button can
  // say so, instead of the dialog throwing after the form is filled in.
  const pendingByReg = Object.fromEntries(
    subs.filter(x => x.status === SUB_STATUS.PENDING).map(x => [x.registrationId, x]));
  const materialByReg = {};
  for (const m of materials) {
    const cur = materialByReg[m.registrationId];
    if (!cur || m.status !== MATERIAL_STATUS.REJECTED) materialByReg[m.registrationId] = m;
  }
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const byId = Object.fromEntries(events.map(e => [e.id, e]));

  if (!regs.length) { panel.appendChild(empty("No entries yet")); return; }

  const listBox = el("div");
  const bar = filterBar({
    filters: [
      { key: "filterCategory", label: "Category",
        options: [...categories.map(c => ({ value: c.id, label: c.name })),
                  { value: "__general", label: "General" }] },
      ...typeTierFilters({ types, tiers, enabled: !!settings?.useTypeTier })
    ],
    onChange: paintList
  });
  panel.append(bar.node, listBox);
  paintList();

  function paintList() {
    const rows = regs
      .map(r => {
        const ev = byId[r.eventId];
        return {
          ...r,
          ...(ev ? eventFilterKeys(ev) : {}),
          label: ev ? eventLabel(ev, catName) : r.eventName
        };
      })
      .filter(bar.matches)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));

    listBox.innerHTML = "";
    if (!rows.length) { listBox.appendChild(empty("No entries match those filters")); return; }

    listBox.appendChild(card(table([
      { key: "label", label: "Event" },
      { key: "entry", label: "Entry", render: r => entryCell(r, byId[r.eventId]) },
      { key: "codeLetter", label: "Code", render: r => r.codeLetter
          ? el("span.code-letter", { text: r.codeLetter }) : el("span.hint", { text: "not yet" }) },
      { key: "material", label: "Material", render: r => {
          const ev = byId[r.eventId];
          if (!ev?.materialsEnabled) return el("span.hint", { text: "—" });
          const m = materialByReg[r.id];
          if (!m) {
            const win = materialsWindow(ev);
            return win.open
              ? button("Submit " + (ev.materialLabel || "material"), { class: "btn-sm",
                  onclick: () => materialDialog(r, ev, house, refresh) })
              : el("span.hint", { text: win.reason });
          }
          if (m.status === MATERIAL_STATUS.REJECTED) {
            const win = materialsWindow(ev);
            return el("div", {}, [
              badge("Rejected", "badge-danger"),
              m.reason ? el("div.hint", { style: "margin:.2rem 0", text: m.reason }) : null,
              win.open
                ? button("Resubmit", { class: "btn-sm", onclick: () => materialDialog(r, ev, house, refresh) })
                : el("div.hint", { style: "margin:.2rem 0 0", text: win.reason })
            ]);
          }
          return el("div", {}, [
            badge(m.status === MATERIAL_STATUS.APPROVED ? "Approved" : "Pending",
                  m.status === MATERIAL_STATUS.APPROVED ? "badge-ok" : "badge-warn"),
            el("div.hint", { style: "margin:.2rem 0 0", text: m.title })
          ]);
        }},
      { key: "act", label: "", render: r => {
          const ev = byId[r.eventId];
          const check = ev ? canWithdraw(r, ev, settings) : { ok: false, reason: "Event removed." };
          const sub = ev ? substitutionWindow(r, ev, cfgS) : { open: false };
          return el("div.btn-row", {}, [
            check.ok
              ? button("Withdraw", { class: "btn-sm btn-danger", onclick: guard(async () => {
                  if (!await confirmDialog("Withdraw entry", `Withdraw from ${r.eventName}?`, "Withdraw")) return;
                  await withdrawEntry({ registration: r, event: ev, limits: lim });
                  toast("Withdrawn."); refresh();
                })})
              : el("span.hint", { text: check.reason }),
            // Once registration closes, swapping is the only way to change
            // an entry — and it needs approval.
            pendingByReg[r.id]
              ? badge("Substitution pending", "badge-warn")
              : sub.open
                ? button("Substitute", { class: "btn-sm",
                    onclick: () => subDialog(r, ev, house, cfgS, refresh) })
                : null
          ]);
        }}
    ], rows), "Our entries",
      button("Download CSV", { class: "btn-sm", onclick: () => downloadText(house.name + "-entries.csv", toCSV([
        { label: "Event", key: "label" }, { label: "Code letter", key: "codeLetter" },
        { label: "Entry", value: r => entryLabel(r, byId[r.eventId]) },
        { label: "Participants", value: r => r.wholeTeam ? "Whole team" : (r.participantNames || []).join(" / ") }
      ], rows)) })));
  }
}

async function peopleTab(panel, house, refresh) {
  const [people, limits, types, tiers, settings, categories] = await Promise.all([
    getAll("participants", where("houseId", "==", house.id)),
    getOne("config", "participantLimits"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
    getOne("config", "festSettings").catch(() => null),
    getAll("categories").catch(() => [])
  ]);

  /* Adding is Admin-opt-in and time-boxed. The same two conditions are
   * enforced in firestore.rules — this only decides whether to offer the
   * button, so a manager is never shown an action that would be refused. */
  const cfgS = { ...DEFAULTS.festSettings, ...(settings || {}) };
  const w = cfgS.houseAddWindow || {};
  const now = Date.now();
  const addOpen = !!cfgS.houseAddParticipants
    && (!w.start || now >= w.start)
    && (!w.end || now <= w.end);

  if (addOpen) {
    panel.appendChild(card(el("div", {}, [
      el("p.hint", { text: "You can add people to your own house while this window is open. Chest numbers are allocated automatically." }),
      el("div.btn-row", {}, button("Add participant", { class: "btn-accent",
        onclick: () => houseAddDialog(house, categories, cfgS, refresh) }))
    ]), "Add to " + house.name));
  }
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const vocab = {
    types: Object.fromEntries(types.map(t => [t.id, t.name])),
    tiers: Object.fromEntries(tiers.map(t => [t.id, t.name]))
  };
  if (!people.length) { panel.appendChild(empty("No participants yet")); return; }

  const rows = [...people].sort((a, b) => compareChest(a.chestNumber, b.chestNumber));
  const columns = [
    { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
    { label: "Category", key: "categoryName" }, { label: "Grade", key: "className" },
    { label: "Events", value: r => r.eventCounts?.overall || 0 }
  ];

  panel.appendChild(card(table([
    { key: "photo", label: "", render: r => avatar(r, 36) },
    { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: String(r.chestNumber ?? "") }) },
    { key: "name", label: "Name" },
    { key: "categoryName", label: "Category", render: r => badge(r.categoryName || "—") },
    { key: "className", label: "Grade" },
    { key: "count", label: "Events", num: true, render: r => String(r.eventCounts?.overall || 0) },
    { key: "short", label: "Shortfall", render: r => {
        // Each participant against their OWN category's limits.
        const s = shortfalls(r.eventCounts, limitsForCategory(lim, r.categoryId), vocab);
        return s.length ? badge(`${s.length} unmet`, "badge-warn") : badge("OK", "badge-ok");
      }}
  ], rows), "Our participants", [
    button("CSV", { class: "btn-sm", onclick: () => downloadText(house.name + "-participants.csv", toCSV(columns, rows)) }),
    button("Print / PDF", { class: "btn-sm", onclick: () => printDocument({
      title: house.name + " — participants", subtitle: window.__FEST_NAME__ || "",
      bodyHTML: htmlTable(columns, rows) }) })
  ]));
}

/**
 * A House Manager adding one of their own people.
 *
 * Chest allocation reuses domain/chest.js exactly as the Admin importer
 * does, so a manager-added participant is numbered by the same rules as
 * every other — there is no second numbering scheme to keep in step.
 */
function houseAddDialog(house, categories, cfg, refresh) {
  const name = input({ placeholder: "Full name" });
  const cat  = select(categories.map(c => ({ value: c.id, label: c.name })));
  const cls  = input({ placeholder: "Class / grade" });
  const dob  = input({ type: "date" });
  const gender = select(GENDERS);

  // Same automatic assignment the Admin form uses, so a manager-added
  // participant lands in the same category an Admin-added one would.
  const autoMode = cfg.autoCategory || "none";
  const autoNote = el("div");
  function runAuto() {
    if (autoMode === "none") return;
    const res = resolveCategory({
      cls: cls.value, dob: dob.value, categories,
      mode: autoMode, winner: cfg.autoCategoryWinner || "dob"
    });
    autoNote.innerHTML = "";
    if (!res.reason) return;
    if (res.categoryId) cat.value = res.categoryId;
    autoNote.appendChild(notice(res.clash ? "warn" : "info", res.reason));
  }
  if (autoMode !== "none") {
    cls.addEventListener("input", runAuto);
    dob.addEventListener("change", runAuto);
  }

  modal({
    title: "Add to " + house.name,
    body: el("div", {}, [
      field("Name", name),
      field("Class", cls),
      (autoMode === "dob" || autoMode === "both") ? field("Date of birth", dob) : null,
      field("Category", cat, autoMode !== "none" ? "Set automatically — you can still change it." : null),
      autoNote,
      field("Gender", gender),
      el("p.hint", { text: "The chest number is allocated automatically from your house's range or the shared sequence." })
    ].filter(Boolean)),
    actions: [
      { label: "Cancel" },
      { label: "Add", kind: "accent", closes: false, busyLabel: "Adding…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Enter a name.", true); return false; }
          if (!cat.value) { toast("Choose a category.", true); return false; }

          const [taken, counter] = await Promise.all([takenChestNumbers(), readChestCounter()]);
          const res = allocateChest({
            explicit: null, house, houses: [house], settings: cfg, taken, counter
          });

          await add("participants", {
            name: name.value.trim(),
            nameLower: name.value.trim().toLowerCase(),
            chestNumber: res.value,
            chestSort: chestSortKey(res.value),
            houseId: house.id,
            houseName: house.name,
            categoryId: cat.value,
            categoryName: categories.find(c => c.id === cat.value)?.name || "",
            className: cls.value.trim(),
            dob: dob.value || null,
            gender: gender.value || null,
            photoData: null,
            // Must be zero: the security rule refuses anything else, because
            // a non-zero start would be entries that never passed the cap
            // transaction.
            eventCounts: { overall: 0 }
          });
          if (res.counter > counter) await raiseChestCounter(res.counter);

          toast("Added " + name.value.trim() + " — chest " + res.value);
          close(true); refresh();
        })
      }
    ]
  });
}

/**
 * Our results — this house's own placements, published events only.
 *
 * Reads the public snapshot (`publicResults`), not the raw `results`
 * collection: firestore.rules keeps `results` staff-only because it holds
 * unpublished data and, for a blind event, names before they are meant to be
 * public. The snapshot is the same data a spectator can already see, merely
 * filtered down to one house — nothing here is privileged.
 */
async function houseResultsTab(panel, house) {
  const settings = await getOne("config", "festSettings").catch(() => null);
  const events = await getAll("publicResults").catch(() => []);
  const rows = [];
  for (const ev of events) {
    for (const e of ev.entries || []) {
      if (e.houseId !== house.id) continue;
      rows.push({ ...e, eventName: ev.eventName, eventCode: ev.eventCode });
    }
  }
  if (!rows.length) {
    panel.appendChild(empty("No published results yet for " + house.name));
    return;
  }
  rows.sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999) || String(a.eventName).localeCompare(String(b.eventName)));
  panel.appendChild(card(table([
    { key: "eventName", label: "Event", render: r => el("div", {}, [
        el("div", { text: r.eventName }),
        r.eventCode ? el("div.hint", { style: "margin:0", text: r.eventCode }) : null
      ])},
    { key: "names", label: "Entry", render: r => (r.names || []).join(", ") },
    { key: "rank", label: "Rank", render: r => r.isAbsent ? badge("Absent", "badge-danger")
        : (r.rank ? el("span.mono", { text: "#" + r.rank }) : el("span.hint", { text: "—" })) },
    { key: "grade", label: "Grade", render: r => r.grade ? badge(gradeLabel(r.grade, settings)) : "—" },
    { key: "totalPoints", label: "Points", num: true }
  ], rows), house.name + " — results"));
}

/** Titles awarded to a participant from this house. Public data, filtered. */
async function houseTitlesTab(panel, house) {
  const rows = (await getAll("titles", where("houseId", "==", house.id)).catch(() => []))
    .sort((a, b) => (b.awardedAt || 0) - (a.awardedAt || 0));
  if (!rows.length) { panel.appendChild(empty("No titles awarded to " + house.name + " yet")); return; }
  panel.appendChild(card(el("div", {}, rows.map(t => el("div", {
    style: "padding:.6rem 0;border-top:1px solid var(--line)"
  }, [
    el("div", { style: "display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap" }, [
      el("strong", { text: t.name }), badge(t.participantName || "")
    ]),
    t.description ? el("div.hint", { style: "margin:.2rem 0 0", text: t.description }) : null
  ]))), "Titles"));
}

const APPEAL_STATUS_KIND = { pending: "badge-warn", upheld: "badge-danger", overturned: "badge-ok" };
const APPEAL_STATUS_TEXT = { pending: "Pending", upheld: "Upheld — result stands", overturned: "Overturned" };

/** File an appeal against one of this house's own published results. */
async function appealsTab(panel, house, refresh) {
  const [settings, published, mine] = await Promise.all([
    getOne("config", "festSettings"),
    getAll("publicResults").catch(() => []),
    getAll("appeals", where("houseId", "==", house.id)).catch(() => [])
  ]);
  const cfg = { ...DEFAULTS.festSettings, ...(settings || {}) };
  const appealByEvent = {};
  for (const a of mine) (appealByEvent[a.eventId] ||= []).push(a);

  if (!cfg.appealsEnabled) {
    panel.appendChild(empty("Appeals are not enabled", "Ask an Admin to turn this on in Settings if you need to raise one."));
    return;
  }

  const rows = [];
  for (const ev of published) {
    for (const e of ev.entries || []) {
      if (e.houseId !== house.id) continue;
      rows.push({ ...e, eventId: ev.eventId, eventName: ev.eventName, eventCode: ev.eventCode,
                  result: ev, appeals: appealByEvent[ev.eventId] || [] });
    }
  }

  if (mine.length) {
    panel.appendChild(card(el("div", {}, mine
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0))
      .map(a => el("div", { style: "padding:.6rem 0;border-top:1px solid var(--line)" }, [
        el("div", { style: "display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap" }, [
          el("strong", { text: a.eventName }), badge(APPEAL_STATUS_TEXT[a.status], APPEAL_STATUS_KIND[a.status])
        ]),
        el("div.hint", { style: "margin:.2rem 0 0", text: a.reason }),
        a.decision ? el("div", { style: "margin-top:.3rem", text: "Decision: " + a.decision }) : null
      ]))), "Our appeals"));
  }

  if (!rows.length) { panel.appendChild(empty("No published results yet for " + house.name)); return; }

  panel.appendChild(card(table([
    { key: "eventName", label: "Event", render: r => el("div", {}, [
        el("div", { text: r.eventName }),
        r.eventCode ? el("div.hint", { style: "margin:0", text: r.eventCode }) : null
      ])},
    { key: "rank", label: "Rank", render: r => r.isAbsent ? badge("Absent", "badge-danger")
        : (r.rank ? el("span.mono", { text: "#" + r.rank }) : el("span.hint", { text: "—" })) },
    { key: "act", label: "", render: r => {
        const active = r.appeals.find(a => a.status === "pending" || a.status === "upheld");
        if (active) return badge(APPEAL_STATUS_TEXT[active.status], APPEAL_STATUS_KIND[active.status]);
        const state = appealWindowState(r.result, cfg);
        if (!state.open) return el("span.hint", { text: state.reason });
        return button("Appeal", { class: "btn-sm",
          onclick: () => appealDialog(r, house, cfg, refresh) });
      }}
  ], rows), house.name + " — results"));
}

function appealDialog(entry, house, settings, refresh) {
  const reason = el("textarea", { rows: 3, placeholder: "What is being appealed, and why." });
  let screenshot = null;
  const sizeNote = el("div.hint", { text: "Attach a screenshot showing the appeal fee was paid." });
  const preview = el("img", { style: "max-width:100%;max-height:160px;display:none;margin-top:.4rem" });

  const shotFile = el("input", { type: "file", accept: "image/*", style: "display:none" });
  shotFile.addEventListener("change", guard(async () => {
    const f = shotFile.files?.[0];
    if (!f) return;
    const { dataUrl, bytes } = await compressToBudget(f, { maxPx: 1200, budgetBytes: 500 * 1024, keepAlpha: false });
    screenshot = dataUrl;
    preview.src = dataUrl;
    preview.style.display = "block";
    sizeNote.textContent = `Attached — about ${Math.round(bytes / 1024)} KB.`;
  }));

  modal({
    title: "Appeal — " + entry.eventName,
    body: el("div", {}, [
      field("Reason", reason, "Required. Explain what is being disputed."),
      el("fieldset", {}, [
        el("legend", { text: "Fee proof" }),
        sizeNote,
        button("Choose screenshot", { class: "btn-sm", onclick: () => shotFile.click() }),
        preview
      ])
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Submit appeal", kind: "accent", closes: false, busyLabel: "Submitting…", onClick: guard(async close => {
          try {
            await fileAppeal({
              event: { id: entry.eventId, name: entry.eventName, code: entry.eventCode },
              result: entry.result, house, settings,
              reason: reason.value, feeScreenshot: screenshot,
              submittedBy: session.name || house.name
            });
          } catch (err) { toast(err.message, true); return false; }
          toast("Appeal submitted."); close(true); refresh();
        })
      }
    ]
  });
}

async function scheduleTab(panel, house) {
  const snap = await getOne("publicSchedule", "main").catch(() => null);
  if (!snap?.visible) { panel.appendChild(empty("Schedule not published yet")); return; }

  // Which of our participants are in each scheduled event — the column that
  // turns a generic timetable into this house's call sheet.
  const ourRegs = await getAll("registrations", where("houseId", "==", house.id));
  const ourBy = {};
  for (const r of ourRegs) (ourBy[r.eventId] ||= []).push(...(r.participantNames || []));

  const days = snap.days?.length
    ? snap.days
    : [{ id: "all", label: "Programme", date: "", venues: snap.venues || [] }];

  const rows = [];
  for (const d of days) {
    for (const v of d.venues || []) {
      for (const s of v.slots || []) {
        rows.push({
          day: d.label, date: d.date || "", venue: v.name, venueId: v.id, ...s,
          ours: (ourBy[s.eventId] || []).join(", "),
          filterDay: d.id, filterVenue: v.id, filterCategory: s.categoryName || "",
          filterType: s.typeName || "", filterTier: s.tierName || "",
          filterOurs: (ourBy[s.eventId] || []).length ? "ours" : ""
        });
      }
    }
  }

  const columns = [
    { label: "Day", key: "day" }, { label: "Venue", key: "venue" },
    { label: "Start", key: "startTime" }, { label: "End", key: "endTime" },
    { label: "Item", key: "title" }, { label: "Code", key: "code" },
    { label: "Category", key: "categoryName" },
    { label: "Our participants", key: "ours" }
  ];

  const onlyOurs = rows.filter(r => r.ours);
  panel.appendChild(notice("info",
    onlyOurs.length
      ? `Your house appears in ${onlyOurs.length} scheduled item${onlyOurs.length > 1 ? "s" : ""}. Those rows are highlighted.`
      : "None of your entries are in scheduled events yet."));

  const listBox = el("div");
  const bar = filterBar({
    filters: [
      { key: "filterOurs", label: "Show", allLabel: "Everything",
        options: [{ value: "ours", label: "Only our items" }] },
      { key: "filterDay", label: "Day", options: days.length > 1 ? days.map(d => ({ value: d.id, label: d.label })) : [] },
      { key: "filterVenue", label: "Venue",
        options: [...new Map(rows.map(r => [r.venueId, { value: r.venueId, label: r.venue }])).values()] },
      { key: "filterCategory", label: "Category",
        options: [...new Map(rows.filter(r => r.categoryName)
          .map(r => [r.categoryName, { value: r.categoryName, label: r.categoryName }])).values()] },
      { key: "filterType", label: "Type", options: uniqOptions(rows, "typeName") },
      { key: "filterTier", label: "Tier", options: uniqOptions(rows, "tierName") }
    ],
    onChange: paintList
  });
  panel.append(bar.node, listBox);
  paintList();

  function paintList() {
    const shown = rows.filter(bar.matches);
    listBox.innerHTML = "";
    if (!shown.length) { listBox.appendChild(empty("Nothing matches those filters")); return; }

    listBox.appendChild(card(table([
      { key: "day", label: "Day" },
      { key: "venue", label: "Venue" },
      { key: "time", label: "Time", render: r => el("span.mono", {
          text: (r.startTime || "") + (r.endTime ? "–" + r.endTime : "") }) },
      { key: "title", label: "Item", render: r => el("div", {}, [
          el("div", { text: r.title }),
          el("div.hint", { style: "margin:0", text:
            [r.code, r.categoryName, r.typeName, r.tierName].filter(Boolean).join(" · ") })
        ])},
      { key: "ours", label: "Our participants", render: r => r.ours
          ? el("span", { text: r.ours }) : el("span.hint", { text: "—" }) }
    ], shown, { rowClass: r => r.ours ? "row-ours" : "" }), "Fest schedule", [
      button("CSV", { class: "btn-sm", onclick: () => downloadText(house.name + "-schedule.csv", toCSV(columns, shown)) }),
      button("Print / PDF", { class: "btn-sm", onclick: () => printDocument({
        title: house.name + " — schedule", subtitle: window.__FEST_NAME__ || "", bodyHTML: htmlTable(columns, shown) }) })
    ]));
  }
}

/* ── Substitutions — House Manager side ─────────────────────────────
 * Requests only. A House Manager can ask; an Admin or Co-Admin decides.
 * The window opens when registration closes and shuts when code letters
 * are assigned.
 */
async function subsTab(panel, house) {
  const [rows, events] = await Promise.all([
    getAll("substitutions", where("houseId", "==", house.id)).catch(() => []),
    getAll("events")
  ]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  panel.appendChild(notice("info",
    "Substitutions are only open for events an Admin has switched them on for, from the Our entries tab. " +
    "An organiser approves each request. This stays possible until code letters are assigned."));

  const decided = rows.filter(r => r.status !== SUB_STATUS.PENDING);
  const rejected = decided.filter(r => r.status === SUB_STATUS.REJECTED);
  if (rejected.length) {
    panel.appendChild(notice("warn", el("div", {}, [
      el("strong", { text: `${rejected.length} request${rejected.length === 1 ? " was" : "s were"} rejected.` }),
      el("div.hint", { style: "margin:.3rem 0 0", text:
        rejected.filter(r => r.reason).map(r => `${r.outgoingName}: ${r.reason}`).join(" · ") ||
        "No reason was given — ask an organiser." })
    ])));
  }

  if (!rows.length) { panel.appendChild(empty("No substitution requests yet")); return; }

  panel.appendChild(card(table([
    { key: "eventName", label: "Event", render: r =>
        eventById[r.eventId] ? eventLabel(eventById[r.eventId], {}) : r.eventName },
    { key: "swap", label: "Swap", render: r => `${r.outgoingName} → ${r.incomingName}` },
    { key: "status", label: "Status", render: r =>
        r.status === SUB_STATUS.APPROVED ? badge("Approved", "badge-ok")
        : r.status === SUB_STATUS.REJECTED ? badge("Rejected", "badge-danger")
        : badge("Awaiting approval", "badge-warn") },
    { key: "reason", label: "Note", render: r => r.reason
        ? el("span.hint", { text: r.reason }) : el("span.hint", { text: "—" }) }
  ], rows.sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0))),
    "Our requests"));
}

function materialDialog(registration, event, house, refresh) {
  const label = event.materialLabel || "Material";
  const title = input({ placeholder: label });
  const link = input({ placeholder: "https://…", value: "" });

  modal({
    title: label + " — " + event.name,
    body: el("div", {}, [
      field(label, title, "Required."),
      field("Link", link, "Optional — a Drive or YouTube link, if there is one.")
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Submit", kind: "accent", closes: false, busyLabel: "Submitting…", onClick: guard(async close => {
          try {
            await submitMaterial({
              registration, event, house,
              title: title.value, link: link.value,
              submittedBy: session.name || house.name
            });
          } catch (err) { toast(err.message, true); return false; }
          toast("Submitted for approval."); close(true); refresh();
        })
      }
    ]
  });
}

function subDialog(registration, event, house, settings, refresh) {
  const current = (registration.participantIds || []).map((id, i) => ({
    id, name: (registration.participantNames || [])[i] || id
  }));
  const outSel = select(current.map(p => ({ value: p.id, label: p.name })));
  const inSel = select([{ value: "", label: "Loading…" }]);
  const reasonInput = el("textarea", { rows: 2 });
  const status = el("div");

  // Eligible replacements: same house, right category, not already in the
  // entry. Filtered here so a House Manager cannot request something that
  // would only be refused on approval.
  getAll("participants", where("houseId", "==", house.id)).then(people => {
    const eligible = people
      .filter(p => !(registration.participantIds || []).includes(p.id))
      .filter(p => !event.categoryId || p.categoryId === event.categoryId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    inSel.innerHTML = "";
    if (!eligible.length) {
      inSel.appendChild(el("option", { value: "", text: "Nobody eligible" }));
      status.appendChild(notice("warn", "No one else in your house is eligible for this event."));
      return;
    }
    for (const p of eligible) {
      inSel.appendChild(el("option", { value: p.id,
        text: `${p.name} — ${p.chestNumber ?? ""}` }));
    }
  }).catch(() => {});

  modal({
    title: "Request a substitution",
    body: el("div", {}, [
      el("p.hint", { text: `${event.name}. An organiser has to approve this before it takes effect.` }),
      field("Replace", outSel),
      field("With", inSel),
      field("Reason", reasonInput, "Why this substitution is needed — shown to the Admin reviewing it."),
      status
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Send request", kind: "accent", closes: false, busyLabel: "Sending…", onClick: guard(async close => {
          if (!inSel.value) { toast("Choose a replacement.", true); return false; }
          if (!reasonInput.value.trim()) { toast("Describe the reason for this substitution.", true); return false; }
          const people = await getAll("participants", where("houseId", "==", house.id));
          const outgoing = people.find(p => p.id === outSel.value);
          const incoming = people.find(p => p.id === inSel.value);
          if (!outgoing || !incoming) { toast("Could not find those participants.", true); return false; }

          await requestSubstitution({
            registration, event, outgoing, incoming, house, settings,
            requestedBy: house.name, reason: reasonInput.value
          });
          toast("Sent for approval.");
          close(true); refresh();
        })
      }
    ]
  });
}

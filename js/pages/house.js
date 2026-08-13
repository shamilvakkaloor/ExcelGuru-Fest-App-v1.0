// House Manager panel: register the house's own participants for events,
// withdraw before code letters are assigned, and download the house's lists.
import { el, card, field, input, select, button, table, toast, guard, notice,
         empty, badge, modal, confirmDialog, loading, filterBar, uniqOptions } from "../lib/ui.js";
import { avatar } from "../lib/photo.js";
import { getAll, getOne, where } from "../lib/db.js";
import { appShell } from "../lib/shell.js";
import { session } from "../lib/session.js";
import { registerEntry, registerMany, withdrawEntry, windowState, canWithdraw, countByEvent }
  from "../domain/registration.js";
import { substitutionWindow, requestSubstitution, SUB_STATUS } from "../domain/substitution.js";
import { DEFAULTS, classLabel, isGroupClass, isGeneralClass, eventLabel,
         eventCategoryLabel, maxEntriesFor, minEntriesFor, entryCompletion,
         typeTierFilters, eventFilterKeys } from "../domain/constants.js";
import { compareChest } from "../domain/chest.js";
import { shortfalls, limitsForCategory } from "../domain/limits.js";
import { toCSV, downloadText } from "../lib/csv.js";
import { printDocument, htmlTable } from "../lib/pdf.js";

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
  [["register", "Register"], ["entries", "Our entries"], ["subs", "Substitutions"],
   ["people", "Our participants"], ["schedule", "Schedule"]]
    .forEach(([id, label]) => tabs.appendChild(button(label, {
      class: id === tab ? "active" : "", onclick: () => { tab = id; paint(); }
    })));
  wrap.append(tabs, panel);

  async function paint() {
    tabs.querySelectorAll("button").forEach((b, i) =>
      b.className = ["register", "entries", "subs", "people", "schedule"][i] === tab ? "active" : "");
    panel.innerHTML = "";
    panel.appendChild(loading("Loading…"));
    const render = { register: registerTab, entries: entriesTab, subs: subsTab,
                     people: peopleTab, schedule: scheduleTab }[tab];
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

  if (!people.length) {
    panel.appendChild(empty("No participants yet", "An organiser adds participants to your house before registration opens."));
    return;
  }

  const open = events.filter(e => windowState(e, cfg).open);
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
      { key: "filterClass", label: "Class",
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
            [eventCategoryLabel(e, catName), classLabel(e.eventClass)].filter(Boolean).join(" · ") })
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
            onclick: () => entryDialog(e, house, people, cfg, lim, catName, countBy[e.id] || 0, refresh)
          });
        }}
    ], rows), "Open events"));
  }
}

function entryDialog(event, house, people, settings, limits, catName, used, refresh) {
  const eligible = event.categoryId ? people.filter(p => p.categoryId === event.categoryId) : people;
  const chosen = new Set();
  const group = isGroupClass(event.eventClass);

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
            await registerEntry({ event, house, participants: picked, settings, limits, registeredBy: house.name });
            toast("Registered.");
            close(true); refresh();
            return;
          }

          // Partial success: one capped participant must not block the rest.
          const { done, failed } = await registerMany({
            event, house, participants: picked, settings, limits, registeredBy: house.name
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

async function entriesTab(panel, house, refresh) {
  const [regs, events, settings, limits, categories, types, tiers, subs] = await Promise.all([
    getAll("registrations", where("houseId", "==", house.id)),
    getAll("events"), getOne("config", "festSettings"), getOne("config", "participantLimits"),
    getAll("categories"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
    getAll("substitutions", where("houseId", "==", house.id)).catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limits || {}) };
  const cfgS = { ...DEFAULTS.festSettings, ...(settings || {}) };
  // One pending request per entry — knowing this HERE means the button can
  // say so, instead of the dialog throwing after the form is filled in.
  const pendingByReg = Object.fromEntries(
    subs.filter(x => x.status === SUB_STATUS.PENDING).map(x => [x.registrationId, x]));
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
      { key: "participantNames", label: "Participants", render: r => (r.participantNames || []).join(", ") },
      { key: "codeLetter", label: "Code", render: r => r.codeLetter
          ? el("span.code-letter", { text: r.codeLetter }) : el("span.hint", { text: "not yet" }) },
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
        { label: "Participants", value: r => (r.participantNames || []).join(" / ") }
      ], rows)) })));
  }
}

async function peopleTab(panel, house) {
  const [people, limits, types, tiers] = await Promise.all([
    getAll("participants", where("houseId", "==", house.id)),
    getOne("config", "participantLimits"),
    getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
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
    "Once registration closes you can no longer withdraw and re-register — ask for a substitution instead, " +
    "from the Our entries tab. An organiser approves it. This stays possible until code letters are assigned."));

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

function subDialog(registration, event, house, settings, refresh) {
  const current = (registration.participantIds || []).map((id, i) => ({
    id, name: (registration.participantNames || [])[i] || id
  }));
  const outSel = select(current.map(p => ({ value: p.id, label: p.name })));
  const inSel = select([{ value: "", label: "Loading…" }]);
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
      status
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Send request", kind: "accent", closes: false, busyLabel: "Sending…", onClick: guard(async close => {
          if (!inSel.value) { toast("Choose a replacement.", true); return false; }
          const people = await getAll("participants", where("houseId", "==", house.id));
          const outgoing = people.find(p => p.id === outSel.value);
          const incoming = people.find(p => p.id === inSel.value);
          if (!outgoing || !incoming) { toast("Could not find those participants.", true); return false; }

          await requestSubstitution({
            registration, event, outgoing, incoming, house, settings,
            requestedBy: house.name
          });
          toast("Sent for approval.");
          close(true); refresh();
        })
      }
    ]
  });
}

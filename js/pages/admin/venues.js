// Schedule builder — ARCHITECTURE section 6.3.
//
// A VENUE is a stage (Stage 1, Hall A). A DAY is a date. A venue runs on one
// or more days, with its own programme and opening time on each.
//
// v6 hung the date directly off the venue, which forced "Stage 1 on Day 1"
// and "Stage 1 on Day 2" to be two venue records sharing a name, and made it
// impossible to list days in order without duplicating venues. Days are now
// their own records; slots carry a dayId.
import { el, card, field, input, select, button, table, toast, guard, notice, empty,
         modal, confirmDialog, badge, filterBar } from "../../lib/ui.js";
import { getAll, getOne, add, patch, remove, put, batchWrite } from "../../lib/db.js";
import { loadDays, venueStart } from "../../domain/publish.js";
import { queueRepublish } from "../../domain/republish.js";
import { eventLabel, eventCategoryLabel, classLabel, isGeneralClass } from "../../domain/constants.js";
import { findClashes, clashesByEvent, describeClashes } from "../../domain/clashes.js";
import { printDocument, escapeHTML } from "../../lib/pdf.js";

export default async function venues(root) {
  root.appendChild(el("h1", { text: "Schedule" }));
  const panel = el("div");
  root.appendChild(panel);

  let dayId = null, venueId = null;
  await paint();

  async function paint() {
    panel.innerHTML = "";
    const [venueRows, events, categories, settings, regs, assignments] = await Promise.all([
      getAll("venues"), getAll("events"), getAll("categories"), getOne("config", "festSettings"),
      getAll("registrations"), getAll("judgeAssignments").catch(() => [])
    ]);

    /* Who is needed at each event — participants from registrations, judges
     * from assignments. Read once here so the clash pass costs nothing per
     * slot. */
    const peopleByEvent = {};
    for (const r of regs) {
      const list = (peopleByEvent[r.eventId] ||= []);
      (r.participantIds || []).forEach((id, i) => {
        list.push({ id, name: (r.participantNames || [])[i] || id, role: "participant" });
      });
    }
    for (const a of assignments) {
      (peopleByEvent[a.eventId] ||= []).push({
        id: a.judgeUid, name: a.judgeName || "Judge", role: "judge"
      });
    }
    const days = await loadDays(venueRows);
    const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const eventById = Object.fromEntries(events.map(e => [e.id, e]));

    // Every slot in the fest, read once. Needed for I15 — an event may
    // occupy exactly one slot ANYWHERE, not one slot per venue.
    const allSlots = [];
    for (const v of venueRows) {
      for (const s of await getAll(`venues/${v.id}/slots`)) {
        allSlots.push({ ...s, venueId: v.id, venueName: v.name });
      }
    }
    const slotForEvent = {};
    for (const s of allSlots) if (s.eventId) slotForEvent[s.eventId] = s;

    /* Clashes are a WHOLE-FEST question: the point is that two venues are
     * running at once, so they cannot be found by looking at one venue. */
    const timedAll = [];
    for (const v of venueRows) {
      for (const d of days) {
        const mine = allSlots
          .filter(s => s.venueId === v.id && slotDay(s, v, days) === d.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        let cur = parseHHMM(venueStart(v, d.id)) ?? 540;
        for (const sl of mine) {
          const start = cur;
          cur += Number(sl.durationMin) || 0;
          if (sl.eventId) {
            timedAll.push({
              eventId: sl.eventId, dayId: d.id, venueId: v.id, venueName: v.name,
              title: eventById[sl.eventId]?.name || "",
              startMin: start, endMin: cur,
              startTime: fmtHHMM(start), endTime: fmtHHMM(cur)
            });
          }
        }
      }
    }
    const allClashes = findClashes(timedAll, peopleByEvent);
    const clashMap = clashesByEvent(allClashes);

    if (allClashes.length) {
      const participantClashes = allClashes.filter(c => c.role === "participant");
      const judgeClashes = allClashes.filter(c => c.role === "judge");
      panel.appendChild(notice("warn", el("div", {}, [
        el("strong", { text:
          `${allClashes.length} scheduling clash${allClashes.length === 1 ? "" : "es"} — ` +
          `${participantClashes.length} participant, ${judgeClashes.length} judge.` }),
        el("div.hint", { style: "margin:.3rem 0 0", text:
          "Someone is needed in two places at once. This is a warning, not a block — overlaps are " +
          "sometimes deliberate, and only you know whether that person is excused." }),
        el("div.btn-row", { style: "margin-top:.5rem" },
          button("Show all clashes", { class: "btn-sm",
            onclick: () => clashDialog(allClashes, days) }))
      ])));
    }

    panel.appendChild(notice("info",
      (settings?.scheduleVisible
        ? "The schedule is visible to the public. Changes appear as soon as you save."
        : "The schedule is hidden from the public. Build it here, then switch it on in Settings.")));

    /* ── Days ──────────────────────────────────────────────────────── */
    const realDays = days.filter(d => !d.legacy);
    panel.appendChild(card(el("div", {}, [
      el("p.hint", { text: "Add each day of the fest. Days are always listed in date order." }),
      el("div.btn-row", {}, [
        button("Add day", { class: "btn-accent", onclick: () => dayDialog(null, paint) }),
        days.some(d => d.legacy)
          ? button("Convert existing dates to days", { onclick: guard(() => migrateDays(venueRows, paint)) })
          : null
      ]),
      realDays.length || days.length
        ? el("div.day-chips", {}, days.map(d => {
            const chip = el("div.day-chip" + (d.id === dayId ? ".on" : ""), {}, [
              el("button", { type: "button", text: d.label + (d.date ? " · " + d.date : ""),
                onclick: () => { dayId = d.id; venueId = null; paint(); } }),
              d.legacy ? null : button("✎", { class: "btn-sm", onclick: () => dayDialog(d, paint) })
            ]);
            return chip;
          }))
        : el("div.hint", { text: "No days yet." })
    ]), "Days"));

    if (!days.length) return;
    if (!dayId || !days.some(d => d.id === dayId)) dayId = days[0].id;
    const day = days.find(d => d.id === dayId);

    /* ── Venues ────────────────────────────────────────────────────── */
    panel.appendChild(card(el("div", {}, [
      el("p.hint", { text: "A venue is a stage. The same venue can run on several days, each with its own start time." }),
      el("div.btn-row", {}, [
        button("Add venue", { class: "btn-accent", onclick: () => venueDialog(null, dayId, paint) })
      ]),
      venueRows.length
        ? el("div.tabs", {}, venueRows.map(v => button(
            v.name + " · " + venueStart(v, dayId),
            { class: v.id === venueId ? "active" : "", onclick: () => { venueId = v.id; paint(); } })))
        : el("div.hint", { text: "No venues yet." })
    ]), "Venues on " + day.label));

    if (!venueRows.length) return;
    if (!venueId || !venueRows.some(v => v.id === venueId)) venueId = venueRows[0].id;
    const venue = venueRows.find(v => v.id === venueId);

    const slots = allSlots
      .filter(s => s.venueId === venue.id && slotDay(s, venue, days) === dayId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    /* ── Slots ─────────────────────────────────────────────────────── */
    let cursor = parseHHMM(venueStart(venue, dayId)) ?? 540;
    const timed = slots.map(s => {
      const start = cursor;
      cursor += Number(s.durationMin) || 0;
      return { ...s, startTime: fmtHHMM(start), endTime: fmtHHMM(cursor) };
    });

    panel.appendChild(card(el("div", {}, [
      el("div.btn-row", {}, [
        button("Add event slot", { class: "btn-accent",
          onclick: () => slotDialog(venue, dayId, events, slotForEvent, catName, slots.length, paint) }),
        // I17 — a break can be named. v6 hard-coded the title "Break", so a
        // lunch, a prize distribution and a stage reset all read identically.
        button("Add break", { onclick: () => breakDialog(venue, dayId, null, slots.length, paint) }),
        button("Print preview", { onclick: () => printPreview(day, venue, timed, eventById, catName) }),
        button("Save & publish schedule", { onclick: guard(async () => {
          queueRepublish({ schedule: true });
          toast("Schedule updated.");
        })}),
        button("Edit venue", { class: "btn-sm", onclick: () => venueDialog(venue, dayId, paint) }),
        button("Delete venue", { class: "btn-sm btn-danger", onclick: guard(async () => {
          if (!await confirmDialog("Delete venue", `Delete ${venue.name} and every slot in it?`, "Delete")) return;
          const mine = allSlots.filter(s => s.venueId === venue.id);
          await batchWrite(mine.map(s => ({ type: "delete", path: `venues/${venue.id}/slots`, id: s.id })));
          await remove("venues", venue.id);
          venueId = null; toast("Deleted."); paint();
        })})
      ]),
      el("p.hint", { text: "Each slot follows the previous one. Change a duration and everything after it shifts." })
    ]), venue.name + " · " + day.label));

    if (!timed.length) {
      panel.appendChild(empty("Nothing scheduled here yet", "Add an event slot or a break."));
      return;
    }

    panel.appendChild(card(table([
      { key: "time", label: "Time", render: s => el("span.mono", { text: s.startTime + "–" + s.endTime }) },
      { key: "what", label: "Item", render: s => {
          if (s.type === "break") {
            return el("div", {}, [
              el("strong", { text: s.title || "Break" }), " ", badge("Break", "badge-warn")
            ]);
          }
          const ev = eventById[s.eventId];
          const mine = clashMap[s.eventId] || [];
          // I5 / I21 — the category travels with the item.
          return el("div", {}, [
            el("div", { text: ev ? eventLabel(ev, catName) : "— removed event —" }),
            mine.length
              ? el("div", { style: "margin:.2rem 0" },
                  badge(describeClashes(mine), "badge-warn"))
              : null,
            ev ? el("div.hint", { style: "margin:0", text:
              [eventCategoryLabel(ev, catName), classLabel(ev.eventClass),
               ev.stage === "onStage" ? "On stage" : "Off stage"].filter(Boolean).join(" · ") }) : null
          ]);
        }},
      { key: "durationMin", label: "Minutes", num: true },
      { key: "act", label: "", render: s => el("div.btn-row", {}, [
          button("↑", { class: "btn-sm", onclick: guard(() => move(venue, slots, s, -1, paint)) }),
          button("↓", { class: "btn-sm", onclick: guard(() => move(venue, slots, s, +1, paint)) }),
          s.type === "break"
            ? button("Edit", { class: "btn-sm", onclick: () => breakDialog(venue, dayId, s, slots.length, paint) })
            // v8 — an event slot is editable too. Previously the only way to
            // change a duration was remove-and-re-add, which lost its place
            // in the running order.
            : button("Edit", { class: "btn-sm",
                onclick: () => slotEditDialog(s, venue, dayId, events, slotForEvent, catName, venueRows, days, paint) }),
          button("Remove", { class: "btn-sm btn-danger", onclick: guard(async () => {
            await remove(`venues/${venue.id}/slots`, s.id);
            if (s.eventId) await patch("events", s.eventId, { venueId: null, scheduledAt: null });
            toast("Removed."); paint();
          })})
        ])}
    ], timed)));
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function slotDay(slot, venue, days) {
  if (slot?.dayId) return slot.dayId;
  const legacy = days.find(d => d.legacy && d.date === (venue?.date || ""));
  return legacy?.id || days[0]?.id || null;
}

async function move(venue, slots, slot, delta, refresh) {
  const ordered = [...slots].sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = ordered.findIndex(s => s.id === slot.id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  await batchWrite(ordered.map((s, n) => ({
    type: "set", path: `venues/${venue.id}/slots`, id: s.id, data: { order: n }
  })));
  refresh();
}

function dayDialog(existing, refresh) {
  const label = input({ value: existing?.label || "", placeholder: "e.g. Day 1" });
  const date  = input({ type: "date", value: existing?.date || "" });

  modal({
    title: existing ? "Edit day" : "Add day",
    body: el("div", {}, [
      field("Date", date, "Days are listed in date order, earliest first."),
      field("Label", label, "Shown to the public. Blank uses the date.")
    ]),
    actions: [
      { label: "Cancel" },
      existing ? { label: "Delete", kind: "danger", closes: false, onClick: guard(async close => {
          if (!await confirmDialog("Delete day",
            "Slots filed under this day stay in the database but stop appearing in the schedule. Delete it?", "Delete")) return false;
          await remove("festDays", existing.id);
          queueRepublish({ schedule: true });
          toast("Day removed."); close(true); refresh();
        })} : null,
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!date.value) { toast("Choose a date.", true); return false; }
          // Keep the day's existing position. Writing order: 0 unconditionally
          // meant renaming a day also silently moved it among days sharing a
          // date, which is not what "edit the label" should do.
          const data = {
            date: date.value,
            label: label.value.trim() || date.value,
            order: existing?.order ?? 0
          };
          if (existing) await patch("festDays", existing.id, data);
          else await add("festDays", data);
          queueRepublish({ schedule: true });
          toast("Saved."); close(true); refresh();
        })
      }
    ].filter(Boolean)
  });
}

/**
 * Convert a v6 schedule, where the date lived on the venue, into real day
 * records. Venues keep their name; slots are stamped with the matching day.
 */
async function migrateDays(venueRows, refresh) {
  const dates = [...new Set(venueRows.map(v => v.date || "").filter(Boolean))].sort();
  if (!dates.length) { toast("No dates found on the existing venues.", true); return; }

  const dayIdByDate = {};
  for (const [i, date] of dates.entries()) {
    dayIdByDate[date] = await add("festDays", { date, label: "Day " + (i + 1), order: i + 1 });
  }
  for (const v of venueRows) {
    const id = dayIdByDate[v.date || ""];
    if (!id) continue;
    const slots = await getAll(`venues/${v.id}/slots`);
    await batchWrite(slots.map(s => ({
      type: "set", path: `venues/${v.id}/slots`, id: s.id, data: { dayId: id }
    })));
    await patch("venues", v.id, { dayStart: { [id]: v.startTime || "09:00" } });
  }
  queueRepublish({ schedule: true });
  toast("Converted " + dates.length + " date" + (dates.length > 1 ? "s" : "") + " into days.");
  refresh();
}

function venueDialog(existing, dayId, refresh) {
  const name = input({ value: existing?.name || "", placeholder: "e.g. Stage 1" });
  const start = input({ type: "time", value: existing ? venueStart(existing, dayId) : "09:00" });

  modal({
    title: existing ? "Edit venue" : "Add venue",
    body: el("div", {}, [
      field("Venue name", name),
      field("Start time on this day", start,
        "Each day can open at a different time. Slots follow on from it.")
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Give the venue a name.", true); return false; }
          const dayStart = { ...(existing?.dayStart || {}), [dayId]: start.value || "09:00" };
          const data = { name: name.value.trim(), dayStart, startTime: start.value || "09:00" };
          if (existing) await patch("venues", existing.id, data);
          else await add("venues", data);
          queueRepublish({ schedule: true });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

function slotDialog(venue, dayId, events, slotForEvent, catName, order, refresh) {
  /* I15 — AN EVENT OCCUPIES EXACTLY ONE SLOT.
   *
   * v6 filtered this picker against the slots of the CURRENTLY OPEN venue
   * only, so the same event could be added to a second venue — producing two
   * contradictory scheduled times and two conflicting writes to the event's
   * venueId. The filter is now built from every venue's slots across every
   * day, and the save re-checks before committing.
   */
  const available = events.filter(e => !slotForEvent[e.id]);
  const taken = events.filter(e => slotForEvent[e.id]);

  if (!available.length) {
    modal({
      title: "Add event slot",
      body: el("div", {}, [
        notice("info", "Every event is already scheduled somewhere. Remove it from its current slot first."),
        taken.length ? el("div.hint", { text: taken.slice(0, 8)
          .map(e => e.name + " → " + slotForEvent[e.id].venueName).join(", ") }) : null
      ]),
      actions: [{ label: "Close" }]
    });
    return;
  }

  const picker = select(available
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map(e => ({ value: e.id, label: eventLabel(e, catName) })));
  const mins = input({ type: "number", min: 1, value: 15 });

  modal({
    title: "Add event slot",
    body: el("div", {}, [
      field("Event", picker,
        available.length + " unscheduled. An event already placed elsewhere is not listed."),
      field("Minutes", mins)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Add", kind: "accent", closes: false, busyLabel: "Adding…", onClick: guard(async close => {
          const eventId = picker.value;
          if (!eventId) { toast("Choose an event.", true); return false; }

          // Re-check against live data: another organiser may have scheduled
          // this event while the dialog was open.
          const clash = await findExistingSlot(eventId);
          if (clash) {
            toast(`That event is already scheduled in ${clash.venueName}. Remove it there first.`, true);
            return false;
          }

          await add(`venues/${venue.id}/slots`, {
            type: "event", eventId, dayId,
            durationMin: Math.max(1, Number(mins.value) || 15), order
          });
          await patch("events", eventId, { venueId: venue.id });
          queueRepublish({ schedule: true });
          toast("Slot added."); close(true); refresh();
        })
      }
    ]
  });
}

/** Live global check that an event holds no slot in any venue. */
async function findExistingSlot(eventId) {
  const venueRows = await getAll("venues");
  for (const v of venueRows) {
    const slots = await getAll(`venues/${v.id}/slots`);
    const hit = slots.find(s => s.eventId === eventId);
    if (hit) return { ...hit, venueName: v.name, venueId: v.id };
  }
  return null;
}

/** I17 — breaks are named, and can be renamed. */
function breakDialog(venue, dayId, existing, order, refresh) {
  const title = input({ value: existing?.title || "", placeholder: "e.g. Lunch" });
  const mins  = input({ type: "number", min: 1, value: existing?.durationMin || 30 });

  modal({
    title: existing ? "Edit break" : "Add break",
    body: el("div", {}, [
      field("Name", title, "Shown on the schedule and the print sheet. Blank reads simply as Break."),
      field("Minutes", mins)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const data = {
            type: "break", title: title.value.trim() || "Break", dayId,
            durationMin: Math.max(1, Number(mins.value) || 30)
          };
          if (existing) await patch(`venues/${venue.id}/slots`, existing.id, data);
          else await add(`venues/${venue.id}/slots`, { ...data, order });
          queueRepublish({ schedule: true });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

/** I17 — print preview for the venue currently open, on the day open. */
function printPreview(day, venue, timed, eventById, catName) {
  printDocument({
    title: (window.__FEST_NAME__ || "Fest") + " — " + venue.name,
    subtitle: day.label + (day.date ? " · " + day.date : ""),
    bodyHTML:
      `<table><thead><tr><th>Time</th><th>Item</th><th>Code</th><th>Minutes</th></tr></thead><tbody>` +
      timed.map(s => {
        const ev = s.eventId ? eventById[s.eventId] : null;
        const name = s.type === "break" ? (s.title || "Break") : (ev?.name || "— removed event —");
        const cat = ev ? eventCategoryLabel(ev, catName) : "";
        return `<tr><td class="mono">${escapeHTML(s.startTime)}–${escapeHTML(s.endTime)}</td>` +
          `<td>${escapeHTML(name)}${cat ? " <em>(" + escapeHTML(cat) + ")</em>" : ""}</td>` +
          `<td class="mono">${escapeHTML(ev?.code || "")}</td>` +
          `<td class="mono">${s.durationMin || 0}</td></tr>`;
      }).join("") +
      `</tbody></table>`
  });
}

function parseHHMM(v) {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmtHHMM(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/**
 * Edit an existing event slot — v8.
 *
 * Three things can change: how long it runs, WHICH event occupies it, and
 * where it sits (venue and day). The one-event-one-slot invariant is
 * re-checked globally on save, because swapping in an event that is already
 * scheduled elsewhere would produce two contradictory times for it.
 */
function slotEditDialog(slot, venue, dayId, events, slotForEvent, catName, venueRows, days, refresh) {
  const current = events.find(e => e.id === slot.eventId);
  // Offer every unscheduled event, plus the one already in this slot.
  const choices = events
    .filter(e => !slotForEvent[e.id] || e.id === slot.eventId)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));

  const eventSel = select(choices.map(e => ({ value: e.id, label: eventLabel(e, catName) })),
    { value: slot.eventId || "" });
  const mins = input({ type: "number", min: 1, value: slot.durationMin || 15 });
  const venueSel = select(venueRows.map(v => ({ value: v.id, label: v.name })), { value: venue.id });
  const daySel = select(days.map(d => ({ value: d.id, label: d.label + (d.date ? " \u00b7 " + d.date : "") })),
    { value: dayId });

  modal({
    title: "Edit slot — " + (current ? current.name : "event"),
    body: el("div", {}, [
      field("Event", eventSel,
        "Only events with no slot of their own are listed, plus the one already here."),
      field("Minutes", mins, "Everything after this slot shifts by the difference."),
      el("div.grid.grid-2", {}, [field("Venue", venueSel), field("Day", daySel)]),
      el("p.hint", { text: "Moving a slot puts it at the end of the running order at its destination." })
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const newEventId = eventSel.value;
          if (!newEventId) { toast("Choose an event.", true); return false; }

          // Global re-check: another organiser may have scheduled this event
          // while the dialog was open.
          if (newEventId !== slot.eventId) {
            const clash = await findExistingSlot(newEventId);
            if (clash) {
              toast(`That event is already scheduled in ${clash.venueName}. Remove it there first.`, true);
              return false;
            }
          }

          const movingVenue = venueSel.value !== venue.id;
          const data = {
            type: "event",
            eventId: newEventId,
            dayId: daySel.value,
            durationMin: Math.max(1, Number(mins.value) || 15)
          };

          if (movingVenue) {
            // A slot lives in its venue's subcollection, so a venue move is
            // a delete-and-create rather than an update.
            const destSlots = await getAll(`venues/${venueSel.value}/slots`);
            await add(`venues/${venueSel.value}/slots`, { ...data, order: destSlots.length });
            await remove(`venues/${venue.id}/slots`, slot.id);
          } else {
            await patch(`venues/${venue.id}/slots`, slot.id, data);
          }

          // Keep the event's own venue pointer honest.
          if (slot.eventId && slot.eventId !== newEventId) {
            await patch("events", slot.eventId, { venueId: null, scheduledAt: null });
          }
          await patch("events", newEventId, { venueId: movingVenue ? venueSel.value : venue.id });

          queueRepublish({ schedule: true });
          toast("Slot updated."); close(true); refresh();
        })
      }
    ]
  });
}

/** Every clash, in full, so an organiser can work through them. */
function clashDialog(clashes, days) {
  const dayLabel = Object.fromEntries(days.map(d => [d.id, d.label]));
  modal({
    title: `Scheduling clashes (${clashes.length})`,
    body: el("div", {}, [
      el("p.hint", { text:
        "Each row is one person needed in two places at once. Fix by moving a slot, or ignore it if " +
        "that person is not actually required at both." }),
      table([
        { key: "name", label: "Who", render: c => el("div", {}, [
            el("div", { text: c.name }),
            el("div.hint", { style: "margin:0", text: c.role === "judge" ? "Judge" : "Participant" })
          ])},
        { key: "day", label: "Day", render: c => dayLabel[c.dayId] || "" },
        { key: "a", label: "Event", render: c => el("div", {}, [
            el("div", { text: c.a.title }),
            el("div.hint", { style: "margin:0", text: `${c.a.venueName} · ${c.a.startTime}–${c.a.endTime}` })
          ])},
        { key: "b", label: "Clashes with", render: c => el("div", {}, [
            el("div", { text: c.b.title }),
            el("div.hint", { style: "margin:0", text: `${c.b.venueName} · ${c.b.startTime}–${c.b.endTime}` })
          ])}
      ], clashes)
    ]),
    actions: [{ label: "Close" }]
  });
}

// Judge assignments overview — who is judging what, and how far along.
//
// This screen exists because assignments were previously only visible by
// opening each event one at a time, which made it impossible to see at a
// glance whether every event had a judge or whether a judge had finished.
import { el, card, table, button, badge, empty, notice, guard, toast, select, field, loading } from "../../lib/ui.js";
import { getAll, getOne, where, batchWrite } from "../../lib/db.js";
import { classLabel, eventLabel, PUBLISH_STATUS } from "../../domain/constants.js";
import { toCSV, downloadText } from "../../lib/csv.js";
import { printDocument, htmlTable } from "../../lib/pdf.js";

export default async function judgesPage(root) {
  root.appendChild(el("h1", { text: "Judges" }));
  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading assignments…"));

    const [judges, events, assignments, scores, categories, venues, flags] = await Promise.all([
      getAll("judges"), getAll("events"), getAll("judgeAssignments"),
      getAll("scores"), getAll("categories"), getAll("venues"), getAll("entryFlags")
    ]);
    const registrations = await getAll("registrations");
    panel.innerHTML = "";

    const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const eventById = Object.fromEntries(events.map(e => [e.id, e]));

    // Scheduled time per event, so a judge can be handed a running order.
    const timeByEvent = {};
    for (const v of venues) {
      const slots = (await getAll(`venues/${v.id}/slots`)).sort((a, b) => (a.order || 0) - (b.order || 0));
      let cursor = toMin(v.startTime) ?? 540;
      for (const s of slots) {
        const start = cursor; cursor += Number(s.durationMin) || 0;
        if (s.type === "event" && s.eventId) {
          timeByEvent[s.eventId] = { venue: v.name, date: v.date || "", start: fmt(start), end: fmt(cursor) };
        }
      }
    }

    const regCount = {};
    for (const r of registrations) regCount[r.eventId] = (regCount[r.eventId] || 0) + 1;

    const progress = (eventId, judgeUid) => {
      const total = regCount[eventId] || 0;
      if (!total) return { done: 0, total: 0 };
      const scored = scores.filter(s => s.eventId === eventId && s.judgeUid === judgeUid).length;
      const absent = flags.filter(f => f.eventId === eventId && f.isAbsent).length;
      return { done: Math.min(total, scored + absent), total };
    };

    /* ── Coverage warnings ──────────────────────────────────────── */
    const unassigned = events.filter(e => !assignments.some(a => a.eventId === e.id));
    if (unassigned.length) {
      panel.appendChild(notice("warn",
        unassigned.length + " event" + (unassigned.length > 1 ? "s have" : " has") +
        " no judge assigned: " + unassigned.slice(0, 6).map(e => e.name).join(", ") +
        (unassigned.length > 6 ? "…" : "") +
        ". Admin can still enter scores directly for these."));
    }

    /* ── Per-judge view ─────────────────────────────────────────── */
    if (!judges.length) {
      panel.appendChild(empty("No judges yet", "Create judge accounts under Accounts."));
      return;
    }

    for (const j of judges) {
      const mine = assignments.filter(a => a.judgeUid === j.uid);
      const rows = mine.map(a => {
        const ev = eventById[a.eventId];
        const p = progress(a.eventId, a.judgeUid);
        const t = timeByEvent[a.eventId];
        return {
          event: ev ? eventLabel(ev, catName) : "(event removed)",
          cls: ev ? classLabel(ev.eventClass) : "",
          when: t ? `${t.start}–${t.end}` : "",
          venue: t ? t.venue : "",
          done: p.done, total: p.total,
          status: p.total === 0 ? "no entries"
                : p.done === 0 ? "not started"
                : p.done < p.total ? "in progress" : "complete"
        };
      }).sort((a, b) => String(a.when).localeCompare(String(b.when)));

      const complete = rows.filter(r => r.status === "complete").length;

      panel.appendChild(card(
        rows.length ? table([
          { key: "event", label: "Event" },
          { key: "cls", label: "Event class", render: r => badge(r.cls) },
          { key: "when", label: "Time", render: r => r.when
              ? el("span.mono", { text: r.when }) : el("span.hint", { text: "unscheduled" }) },
          { key: "venue", label: "Venue" },
          { key: "prog", label: "Scored", num: true, render: r => `${r.done}/${r.total}` },
          { key: "status", label: "Status", render: r => badge(r.status,
              r.status === "complete" ? "badge-ok"
              : r.status === "in progress" ? "badge-warn"
              : r.status === "no entries" ? "" : "badge-danger") }
        ], rows) : el("div.hint", { text: "No events assigned yet." }),
        `${j.name} — ${complete}/${rows.length} complete`,
        rows.length ? [
          button("CSV", { class: "btn-sm", onclick: () => downloadText(
            "judge-" + j.name.replace(/\s+/g, "-").toLowerCase() + ".csv",
            toCSV([{ label: "Time", key: "when" }, { label: "Venue", key: "venue" },
                   { label: "Event", key: "event" }, { label: "Status", key: "status" }], rows)) }),
          button("Print schedule", { class: "btn-sm", onclick: () => printDocument({
            title: j.name + " — judging schedule",
            subtitle: window.__FEST_NAME__ || "",
            bodyHTML: htmlTable([{ label: "Time", key: "when" }, { label: "Venue", key: "venue" },
                                 { label: "Event", key: "event" }, { label: "Score", value: () => "" }], rows) }) })
        ] : null));
    }

    /* ── Whole-fest coverage table ──────────────────────────────── */
    const coverage = events.map(e => {
      const mine = assignments.filter(a => a.eventId === e.id);
      return {
        event: eventLabel(e, catName),
        judges: mine.map(a => a.judgeName).join(", ") || "—",
        count: mine.length,
        when: timeByEvent[e.id] ? timeByEvent[e.id].start : ""
      };
    }).sort((a, b) => String(a.event).localeCompare(String(b.event)));

    panel.appendChild(card(table([
      { key: "event", label: "Event" },
      { key: "when", label: "Time", render: r => r.when ? el("span.mono", { text: r.when }) : "—" },
      { key: "judges", label: "Judges" },
      { key: "count", label: "#", num: true, render: r => r.count
          ? badge(String(r.count), "badge-ok") : badge("0", "badge-danger") }
    ], coverage), "Coverage by event",
      button("Export CSV", { class: "btn-sm", onclick: () => downloadText("judge-coverage.csv",
        toCSV([{ label: "Event", key: "event" }, { label: "Time", key: "when" },
               { label: "Judges", key: "judges" }], coverage)) })));
  }
}

function toMin(hhmm) { const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
function fmt(mins) { const h = Math.floor(mins / 60) % 24, m = mins % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }

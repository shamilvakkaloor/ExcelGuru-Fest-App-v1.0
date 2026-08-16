// Judge panel. A judge only ever reads judgingEntries documents, which for a
// blind event contain code letters and nothing else — the names are not
// hidden in the UI, they are simply not in the data the judge can read.
import { el, card, field, input, select, button, table, toast, guard, notice, empty, badge, hint } from "../lib/ui.js";
import { getAll, getOne, put, remove, where } from "../lib/db.js";
import { appShell } from "../lib/shell.js";
import { session } from "../lib/session.js";
import { toCSV, downloadText } from "../lib/csv.js";
import { printDocument, htmlTable } from "../lib/pdf.js";

export default async function judgePage(root) {
  const { content: wrap } = appShell(root, { title: "Score events" });

  const [assignments, settings] = await Promise.all([
    getAll("judgeAssignments", where("judgeUid", "==", session.user.uid)),
    getOne("config", "festSettings")
  ]);
  const scale = Number(settings?.scoreScale) || 100;

  wrap.appendChild(el("h1", { text: "My events" }));

  if (!assignments.length) {
    wrap.appendChild(empty("No events assigned yet", "An organiser will assign your events before judging starts."));
    return;
  }

  /* v8 — a judge needs to know WHEN and WHERE their events run, not only
   * that they exist. Built from the public schedule snapshot filtered to
   * their own assignments, so it costs one read and stays consistent with
   * what everyone else sees. Blind judging is unaffected: this shows
   * events and times, never entries. */
  let tab = "score";
  const tabs = el("div.tabs");
  const tabBody = el("div");
  // Off the tab strip entirely unless an Admin has turned appeals on — see
  // house.js, which hides its own Appeals tab the same way.
  const TAB_LIST = [["score", "Score events"], ["schedule", "My schedule"],
    ...(window.__APPEALS_ENABLED__ ? [["appeals", "Appeals"]] : [])];
  TAB_LIST.forEach(([id, label]) =>
    tabs.appendChild(button(label, { class: id === tab ? "active" : "",
      onclick: () => { tab = id; paintTab(); } })));
  wrap.append(tabs, tabBody);

  const scoreBox = el("div");
  const schedBox = el("div");
  const appealsBox = el("div");
  const boxByTab = { score: scoreBox, schedule: schedBox, appeals: appealsBox };

  function paintTab() {
    tabs.querySelectorAll("button").forEach((b, i) => b.className = TAB_LIST[i][0] === tab ? "active" : "");
    tabBody.innerHTML = "";
    tabBody.appendChild(boxByTab[tab]);
    if (tab === "schedule") paintSchedule();
    if (tab === "appeals") paintAppeals();
  }

  let scheduleLoaded = false;
  async function paintSchedule() {
    if (scheduleLoaded) return;
    scheduleLoaded = true;
    schedBox.innerHTML = "";
    schedBox.appendChild(hint("Loading\u2026"));

    const [snap, results] = await Promise.all([
      getOne("publicSchedule", "main").catch(() => null),
      getAll("results").catch(() => [])
    ]);
    const mine = new Set(assignments.map(a => a.eventId));
    const stateBy = Object.fromEntries(results.map(r => [r.id, r.publishStatus]));

    const days = snap?.days?.length
      ? snap.days
      : [{ id: "all", label: "Programme", date: "", venues: snap?.venues || [] }];

    const rows = [];
    for (const d of days) {
      for (const v of d.venues || []) {
        for (const sl of v.slots || []) {
          if (!sl.eventId || !mine.has(sl.eventId)) continue;
          rows.push({
            day: d.label, date: d.date || "", venue: v.name,
            startTime: sl.startTime, endTime: sl.endTime,
            title: sl.title, code: sl.code, categoryName: sl.categoryName,
            state: stateBy[sl.eventId] === "Published" ? "Published"
                 : stateBy[sl.eventId] === "Finalized" ? "Finalized"
                 : "Not started"
          });
        }
      }
    }

    schedBox.innerHTML = "";
    if (!snap?.visible) {
      schedBox.appendChild(notice("info", "The schedule has not been published yet. Your assigned events are listed on the Score events tab."));
      return;
    }
    if (!rows.length) {
      schedBox.appendChild(empty("None of your events are scheduled yet",
        "They will appear here once an organiser adds them to the programme."));
      return;
    }
    schedBox.appendChild(card(table([
      { key: "day", label: "Day" },
      { key: "time", label: "Time", render: r => el("span.mono", {
          text: (r.startTime || "") + (r.endTime ? "\u2013" + r.endTime : "") }) },
      { key: "venue", label: "Venue" },
      { key: "title", label: "Event", render: r => el("div", {}, [
          el("div", { text: r.title }),
          el("div.hint", { style: "margin:0", text: [r.code, r.categoryName].filter(Boolean).join(" \u00b7 ") })
        ])},
      { key: "state", label: "Scoring", render: r =>
          badge(r.state, r.state === "Published" ? "badge-ok"
                       : r.state === "Finalized" ? "badge-live" : "badge-warn") }
    ], rows), "My schedule"));
  }

  let appealsLoaded = false;
  async function paintAppeals() {
    if (appealsLoaded) return;
    appealsLoaded = true;
    appealsBox.innerHTML = "";
    appealsBox.appendChild(hint("Loading…"));

    // array-contains on a denormalised judgeUids field, not a list query
    // gated by a get() per document — see domain/appeals.js for why.
    const mine = await getAll("appeals", where("judgeUids", "array-contains", session.user.uid)).catch(() => []);

    appealsBox.innerHTML = "";
    appealsBox.appendChild(notice("info",
      "Read-only. An appeal against one of your events, for your information — you take no action here."));
    if (!mine.length) { appealsBox.appendChild(empty("No appeals against your events")); return; }

    appealsBox.appendChild(card(table([
      { key: "eventName", label: "Event", render: r => el("div", {}, [
          el("div", { text: r.eventName }), el("div.hint", { style: "margin:0", text: r.houseName })
        ])},
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", render: r =>
          badge(r.status === "pending" ? "Pending" : r.status === "upheld" ? "Upheld" : "Overturned",
                r.status === "pending" ? "badge-warn" : r.status === "overturned" ? "badge-ok" : "badge-danger") },
      { key: "decision", label: "Decision", render: r => r.decision || el("span.hint", { text: "—" }) }
    ], mine), "Appeals against your events"));
  }

  const picker = select(assignments
    .sort((a, b) => String(a.eventCode).localeCompare(String(b.eventCode)))
    // I5 — the category travels with the item here too. It is stored on the
    // assignment document, so this costs no extra reads.
    .map(a => ({
      value: a.eventId,
      label: [a.eventCode, a.eventName].filter(Boolean).join(" · ") +
             (a.categoryName ? ` (${a.categoryName})` : "")
    })));
  const panel = el("div");
  scoreBox.appendChild(card(field("Event", picker), "Pick an event"));
  scoreBox.appendChild(panel);
  picker.addEventListener("change", paint);
  await paint();
  paintTab();

  async function paint() {
    const eventId = picker.value;
    panel.innerHTML = "";
    const [entries, myScores, flags] = await Promise.all([
      getOne("judgingEntries", eventId),
      getAll("scores", where("eventId", "==", eventId), where("judgeUid", "==", session.user.uid)),
      getAll("entryFlags", where("eventId", "==", eventId))
    ]);

    /* v8 — DIRECT events are judged too, they are just judged differently:
     * the judge picks a placement from the ladder instead of typing a mark.
     * (An earlier build made these Admin-only, which was wrong.)
     *
     * judgingEntries carries the mode and the available placements, so the
     * judge panel needs no extra reads and blind judging is unaffected —
     * still code letters only. */
    const isDirect = entries?.resultMode === "direct";
    const placements = entries?.placements || [];
    const directBy = isDirect
      ? Object.fromEntries((await getAll("directResults", where("eventId", "==", eventId))
          .catch(() => [])).map(d => [d.regId, d]))
      : {};

    if (!entries || !entries.entries?.length) {
      panel.appendChild(notice("warn", "Code letters have not been assigned for this event yet. Check back shortly."));
      return;
    }

    const scoreBy = Object.fromEntries(myScores.map(s => [s.regId, s]));
    const absentBy = Object.fromEntries(flags.map(f => [f.regId, !!f.isAbsent]));
    const done = entries.entries.filter(e =>
      (isDirect ? directBy[e.regId]?.placement != null : scoreBy[e.regId]) || absentBy[e.regId]).length;

    const progressBadge = badge(`${done} of ${entries.entries.length} done`,
      done === entries.entries.length ? "badge-ok" : "badge-warn");

    panel.appendChild(card(el("div.btn-row", {}, [
      entries.blind ? badge("Blind judging", "badge-live") : badge("Names visible"),
      badge(`Score out of ${scale}`),
      progressBadge,
      button("Download my sheet", { class: "btn-sm", onclick: () => downloadText(
        "judging-" + (entries.eventCode || eventId) + ".csv",
        toCSV([{ label: "Code", key: "codeLetter" }, { label: "Entry", value: r => r.label || "" },
               { label: "My score", value: r => scoreBy[r.regId]?.score ?? "" }], entries.entries)) }),
      button("Print", { class: "btn-sm", onclick: () => printDocument({
        title: entries.eventName, subtitle: entries.blind ? "Blind judging — code letters only" : "",
        // Was hard-coded blank — a scored entry printed with an empty Score
        // column even though the CSV export two buttons over reads the
        // same scoreBy correctly. Now prints whatever is actually saved,
        // same as the CSV: blank only for an entry not yet scored.
        bodyHTML: htmlTable([{ label: "Code", key: "codeLetter" }, { label: "Entry", value: r => r.label || "" },
                             { label: "Score", value: r => scoreBy[r.regId]?.score ?? "" }], entries.entries) }) })
    ]), entries.eventName));

    panel.appendChild(card(table([
      { key: "codeLetter", label: "Code", render: r => el("span.code-letter", { text: r.codeLetter }) },
      { key: "label", label: "Entry", render: r => entries.blind
          ? el("span.hint", { text: "—" })
          : el("span", {}, [r.label || "", r.houseName ? el("div.hint", { style: "margin:0", text: r.houseName }) : null]) },
      // v9 — approved event material (a song title, and the like). Shown
      // even for a blind event: this is about the performance's content,
      // not who is performing it, so it carries no identity to hide.
      ...(entries.materialLabel ? [
        { key: "material", label: entries.materialLabel, render: r => {
            if (!r.material) return el("span.hint", { text: "—" });
            return r.materialLink
              ? el("a", { href: r.materialLink, target: "_blank", rel: "noopener", text: r.material })
              : el("span", { text: r.material });
          }}
      ] : []),
      isDirect
        ? { key: "placement", label: "Placement", render: r => placementCell(r) }
        : { key: "score", label: "Score", num: true, render: r => scoreCell(r) },
      { key: "absent", label: "", render: r => button(absentBy[r.regId] ? "Undo absent" : "Mark absent", {
          class: "btn-sm " + (absentBy[r.regId] ? "" : "btn-danger"),
          onclick: guard(async () => {
            if (absentBy[r.regId]) await remove("entryFlags", eventId + "_" + r.regId);
            else await put("entryFlags", eventId + "_" + r.regId, {
              eventId, regId: r.regId, isAbsent: true, markedBy: session.name, markedAt: Date.now()
            });
            paint();
          })
        })}
    ], entries.entries)));

    if (entries.description) {
      panel.appendChild(card(
        el("div.hint", { style: "white-space:pre-wrap;margin:0", text: entries.description }),
        "Rules & scoring criteria"));
    }

    panel.appendChild(notice("info",
      "Type a score, then press Save (or Enter). Nothing is stored until you do. Leave a score blank only if the entry is marked absent."));

    /**
     * Score input with explicit save.
     *
     * The earlier version wrote on every `change` and then repainted the
     * whole table, which stole focus mid-typing and looked like the page
     * was reloading itself. Now typing only marks the row dirty; the write
     * happens when Save is pressed (or Enter), and only that row's status
     * text updates afterwards — the table is never rebuilt.
     */
    /** Placement picker for a direct event — saves on change, no Save button
     *  needed because a dropdown has no half-typed state to protect. */
    function placementCell(r) {
      const current = directBy[r.regId]?.placement ?? "";
      const sel = select([{ value: "", label: "\u2014 no place \u2014" },
        ...placements.map(p => ({ value: String(p.rank), label: p.label }))],
        { value: String(current) });
      sel.disabled = absentBy[r.regId];
      const state = el("span.hint", { style: "margin:0;white-space:nowrap",
        text: current ? "saved" : "" });

      sel.addEventListener("change", guard(async () => {
        const val = sel.value ? Number(sel.value) : null;
        state.textContent = "saving\u2026";
        const id = `${eventId}_${r.regId}`;
        await put("directResults", id, {
          eventId, regId: r.regId, placement: val,
          grade: directBy[r.regId]?.grade ?? null,
          judgeUid: session.user.uid, judgeName: session.name, timestamp: Date.now()
        });
        directBy[r.regId] = { ...(directBy[r.regId] || {}), placement: val };
        state.textContent = val ? "saved" : "";
        toast(val ? "Placement saved." : "Placement cleared.");
        updateProgress();
      }));
      return el("div.btn-row", {}, [sel, state]);
    }

    function scoreCell(r) {
      const existing = scoreBy[r.regId];
      const box = input({
        type: "number", min: 0, max: scale, step: "0.01", inputmode: "decimal",
        value: existing?.score ?? "", style: "max-width:110px", disabled: absentBy[r.regId]
      });
      const state = el("span.hint", { style: "margin:0;white-space:nowrap",
        text: existing ? "saved" : "" });
      const saveBtn = button("Save", { class: "btn-sm btn-accent", disabled: true });

      const markDirty = () => {
        const changed = box.value.trim() !== String(existing?.score ?? "");
        saveBtn.disabled = !changed;
        state.textContent = changed ? "unsaved" : (existing ? "saved" : "");
        state.style.color = changed ? "var(--marigold-d)" : "";
      };
      box.addEventListener("input", markDirty);
      box.addEventListener("keydown", e => { if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click(); });

      saveBtn.addEventListener("click", guard(async () => {
        const raw = box.value.trim();
        const id = `${eventId}_${r.regId}_${session.user.uid}`;
        saveBtn.disabled = true;
        state.textContent = "saving…";

        if (raw === "") {
          await remove("scores", id);
          delete scoreBy[r.regId];
          state.textContent = ""; state.style.color = "";
          toast("Score cleared.");
          updateProgress();
          return;
        }
        const val = Number(raw);
        if (isNaN(val) || val < 0 || val > scale) {
          toast(`Score must be between 0 and ${scale}.`, true);
          state.textContent = "unsaved"; saveBtn.disabled = false;
          return;
        }
        await put("scores", id, {
          eventId, regId: r.regId, judgeUid: session.user.uid, judgeName: session.name,
          score: val, timestamp: Date.now(), enteredByAdminOverride: false
        });
        scoreBy[r.regId] = { score: val };
        state.textContent = "saved"; state.style.color = "var(--ok)";
        toast("Saved " + val + ".");
        updateProgress();
      }));

      return el("div", { style: "display:flex;gap:.4rem;align-items:center;justify-content:flex-end" },
        [box, saveBtn, state]);
    }

    function updateProgress() {
      const n = entries.entries.filter(e => scoreBy[e.regId] || absentBy[e.regId]).length;
      if (progressBadge) {
        progressBadge.textContent = `${n} of ${entries.entries.length} done`;
        progressBadge.className = "badge " + (n === entries.entries.length ? "badge-ok" : "badge-warn");
      }
    }
  }
}

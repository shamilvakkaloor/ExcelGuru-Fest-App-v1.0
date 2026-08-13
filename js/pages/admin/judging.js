import { el, card, field, input, select, button, table, toast, guard, notice, empty,
         badge, confirmDialog, filterBar, modal } from "../../lib/ui.js";
import { getAll, getOne, put, remove, where } from "../../lib/db.js";
import { finalizeEvent, computeEventResult } from "../../domain/publish.js";
import { averageOf, gradeFor, resolvePoints, gradeScaleFrom, gradeLabel } from "../../domain/scoring.js";
import { PUBLISH_STATUS, DEFAULTS, classLabel, eventLabel, EVENT_CLASSES,
         isGeneralClass, typeTierFilters, eventFilterKeys, effectiveResultMode } from "../../domain/constants.js";
import { session } from "../../lib/session.js";

export default async function judging(root) {
  root.appendChild(el("h1", { text: "Judging" }));

  const [events, settings] = await Promise.all([getAll("events"), getOne("config", "festSettings")]);
  if (!events.length) { root.appendChild(empty("No events yet")); return; }
  const scale = Number(settings?.scoreScale) || 100;
  const thresholds = gradeScaleFrom(settings || DEFAULTS.festSettings);

  const [categories, types, tiers] = await Promise.all([
    getAll("categories"), getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
  ]);
  const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const picker = select([]);
  const panel = el("div");

  // I3 — filter the picker, so a fest with 120 events does not present one
  // flat dropdown of 120 items.
  const bar = filterBar({
    filters: [
      { key: "filterCategory", label: "Category",
        options: [...categories.map(c => ({ value: c.id, label: c.name })),
                  { value: "__general", label: "General" }] },
      { key: "filterClass", label: "Event class",
        options: EVENT_CLASSES.filter(c => events.some(e => e.eventClass === c.id))
          .map(c => ({ value: c.id, label: c.label })) }
    ],
    onChange: fillPicker
  });

  root.appendChild(card(el("div", {}, [bar.node, field("Event", picker)]), "Pick an event"));
  root.appendChild(panel);
  picker.addEventListener("change", paint);

  function fillPicker() {
    const keep = picker.value;
    const list = events
      .map(e => ({ e, ...eventFilterKeys(e) }))
      .filter(bar.matches)
      .map(x => x.e)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    picker.innerHTML = "";
    for (const e of list) {
      picker.appendChild(el("option", { value: e.id, text: eventLabel(e, catName) }));
    }
    if (list.some(e => e.id === keep)) picker.value = keep;
    paint();
  }

  fillPicker();

  async function paint() {
    const event = events.find(e => e.id === picker.value);
    panel.innerHTML = "";
    if (!event) return;

    const [regs, judgeAssignments, scores, flags, result, directRows, ladderDoc, overrideRows] = await Promise.all([
      getAll("registrations", where("eventId", "==", event.id)),
      getAll("judgeAssignments", where("eventId", "==", event.id)),
      getAll("scores", where("eventId", "==", event.id)),
      getAll("entryFlags", where("eventId", "==", event.id)),
      getOne("results", event.id),
      getAll("directResults", where("eventId", "==", event.id)).catch(() => []),
      // Every ladder, so resolvePoints answers exactly as finalize will.
      getAll("pointsConfig").catch(() => []),
      getAll("scoreOverrides", where("eventId", "==", event.id)).catch(() => [])
    ]);
    const overrideBy = Object.fromEntries(overrideRows.map(o => [o.regId, o]));

    // v8 — a "direct" event is not scored by judges. Admin picks each
    // placement from the ladder's positions.
    const isDirect = effectiveResultMode(event, settings) === "direct";
    const directBy = Object.fromEntries(directRows.map(d => [d.regId, d]));
    /* The dropdown must offer the SAME positions finalize will award. It
     * previously resolved the ladder on its own and quietly fell back to the
     * class ladder when the named one was missing — while finalize refuses
     * outright. The two disagreed. Both now go through resolvePoints. */
    const ladderMap = Object.fromEntries((ladderDoc || []).map(d => [d.id, d]));
    const resolved = resolvePoints(event, ladderMap, null);
    const ladderRanks = Object.keys(resolved.rankPoints || {})
      .map(Number).filter(n => n > 0).sort((a, b) => a - b);

    // A fallback is never silent: it changes what this event is worth.
    if (resolved.fellBack) {
      panel.appendChild(notice("warn",
        `This event is set to take its points from ${event.pointsFrom}, but no ladder is configured ` +
        `for that. It will use the ${classLabel(event.eventClass)} ladder instead. ` +
        `Set one in Settings \u2192 Points & grades if that is not what you want.`));
    }

    // With no judge assigned, Admin fills a single column directly. Same
    // mechanism as filling in for an absent judge — no special-case logic.
    const columns = judgeAssignments.length
      ? judgeAssignments.map(j => ({ uid: j.judgeUid, name: j.judgeName }))
      : [{ uid: "admin", name: "Admin score" }];

    const lettered = regs.filter(r => r.codeLetter);
    if (!lettered.length) {
      panel.appendChild(notice("warn", "Assign code letters on the Registrations screen before scoring."));
      return;
    }

    const scoreBy = {};
    for (const s of scores) scoreBy[s.regId + "|" + s.judgeUid] = s;
    const absentBy = Object.fromEntries(flags.map(f => [f.regId, !!f.isAbsent]));

    const statusBadge = !result ? badge("Not finalized", "badge-warn")
      : result.publishStatus === PUBLISH_STATUS.PUBLISHED ? badge("Published", "badge-ok")
      : badge("Finalized", "badge-live");

    /* ── I14 — PUBLISHED MEANS FROZEN ──────────────────────────────
     * v6 rendered an editable score box regardless of publish state, and
     * the rules permitted an Admin score write at any time. An Admin could
     * therefore change a mark the public had already seen; the snapshot
     * rebuilt and a house total moved with no trace.
     *
     * The UI lock below is advisory. The enforcement that matters is in
     * firestore.rules, which denies writes to scores and entryFlags while
     * the event's result is Published.
     */
    const locked = result?.publishStatus === PUBLISH_STATUS.PUBLISHED;

    panel.appendChild(card(el("div", {}, [
      el("div.btn-row", {}, [badge(classLabel(event.eventClass)), statusBadge,
        badge(`Score out of ${scale}`), badge(`${lettered.length} entries`)]),
      event.description
        ? el("details", { style: "margin-top:.7rem" }, [
            el("summary", { text: "Rules & scoring criteria" }),
            el("div.hint", { style: "white-space:pre-wrap;margin-top:.4rem", text: event.description })
          ])
        : null,
      el("p.hint", { style: "margin-top:.7rem" , text:
        "Admin can fill a missing judge's score or correct one already submitted. A blank score is never read as zero — mark the entry Absent instead." })
    ]), event.name));

    if (locked) {
      panel.appendChild(notice("warn",
        "This event is published, so its scores and absences are read-only. " +
        "To correct one, unpublish it on the Results screen first — then finalize and publish again."));
    }

    const rows = lettered.sort((a, b) => a.codeLetter.localeCompare(b.codeLetter));

    const cols = [
      { key: "codeLetter", label: "Code", render: r => el("span.code-letter", { text: r.codeLetter }) },
      { key: "who", label: "Entry", render: r => event.blindJudging
          ? el("span.hint", { text: "hidden while blind" })
          : (r.wholeTeam ? "Whole team" : (r.participantNames || []).join(", ")) + " · " + r.houseName }
    ];

    if (isDirect) {
      // Placement, and a grade only when the event awards grade points —
      // with them off, the result is a placement alone.
      cols.push({ key: "placement", label: "Placement", render: r => placementInput(r) });
      if (event.awardsGradePoints !== false) {
        cols.push({ key: "grade", label: "Grade", render: r => directGradeInput(r) });
      }
    } else {
      for (const c of columns) {
        cols.push({ key: c.uid, label: c.name, num: true, render: r => scoreInput(r, c) });
      }
    }

    if (!isDirect) cols.push({ key: "avg", label: "Average", num: true, render: r => {
      const vals = columns.map(c => scoreBy[r.id + "|" + c.uid]?.score).filter(v => typeof v === "number");
      const avg = averageOf(vals);
      if (absentBy[r.id]) return badge("Absent", "badge-danger");
      if (avg === null) return el("span.hint", { text: "—" });
      const pct = (avg / scale) * 100;
      return el("span", {}, [
        el("span.mono", { text: avg.toFixed(2) }), " ",
        badge(gradeLabel(gradeFor(pct, thresholds), settings))
      ]);
    }});

    /* An override replaces the average this entry is ranked on. The judges'
     * marks stay underneath untouched, so removing the override restores
     * the true average — which is what makes this safe to use during a
     * dispute and reverse afterwards. */
    if (!isDirect) cols.push({ key: "override", label: "Override", render: r => {
      const ov = overrideBy[r.id];
      return el("div.btn-row", {}, [
        ov ? badge(String(ov.value), "badge-warn") : null,
        button(ov ? "Change" : "Override", {
          class: "btn-sm", disabled: locked,
          onclick: () => overrideDialog(event, r, ov, scale, paint)
        }),
        ov ? button("Clear", { class: "btn-sm btn-danger", disabled: locked,
          onclick: guard(async () => {
            await remove("scoreOverrides", event.id + "_" + r.id);
            toast("Override removed — the judges' average applies again.");
            paint();
          })}) : null
      ]);
    }});

    cols.push({ key: "absent", label: "", render: r => button(absentBy[r.id] ? "Undo absent" : "Mark absent", {
      class: "btn-sm " + (absentBy[r.id] ? "" : "btn-danger"),
      // An absence flag moves points exactly as much as a score does, so it
      // is locked on the same condition.
      disabled: locked,
      onclick: guard(async () => {
        if (absentBy[r.id]) await remove("entryFlags", event.id + "_" + r.id);
        else await put("entryFlags", event.id + "_" + r.id, {
          eventId: event.id, regId: r.id, isAbsent: true, markedBy: session.name, markedAt: Date.now()
        });
        toast(absentBy[r.id] ? "Absence removed." : "Marked absent.");
        paint();
      })
    })});

    panel.appendChild(card(table(cols, rows)));

    panel.appendChild(el("div.btn-row", {}, [
      button("Finalize event", { class: "btn-accent", disabled: locked, onclick: guard(async () => {
        await finalizeEvent(event.id);
        toast("Finalized. Publish it from the Results screen.");
        paint();
      })}),
      /* The computed table used to appear only once an event was finalized,
       * which is the one moment it is least useful — the question an Admin
       * actually has is "what will finalizing do?". It now previews from the
       * scores on screen, through the same code finalize runs, so the two
       * cannot disagree. */
      button(result ? "View computed table" : "Preview computed table", {
        onclick: guard(async e => {
          const btn = e.target;
          if (panel.querySelector(".computed-table")) { showComputed(panel, null, btn); return; }
          const preview = await computeEventResult(event.id);
          showComputed(panel, preview, btn, !result, settings);
        })
      })
    ]));

    /** Placement dropdown for a direct event — ladder positions, plus none. */
    function placementInput(reg) {
      const current = directBy[reg.id]?.placement ?? "";
      const sel = select([{ value: "", label: "— no place —" },
        ...ladderRanks.map(r => ({ value: String(r), label: ordinalLabel(r) }))],
        { value: String(current) });
      sel.disabled = absentBy[reg.id] || locked;
      sel.addEventListener("change", guard(async () => {
        if (locked) return;
        const val = sel.value ? Number(sel.value) : null;
        const id = event.id + "_" + reg.id;
        await put("directResults", id, {
          eventId: event.id, regId: reg.id, placement: val,
          grade: directBy[reg.id]?.grade ?? null
        });
        directBy[reg.id] = { ...(directBy[reg.id] || {}), placement: val };
        toast("Placement saved.");
      }));
      return sel;
    }

    /** Grade is PICKED for a direct event — there is no percentage to
     *  derive it from, and defaulting to zero would quietly make a direct
     *  event worth less than a scored one. */
    function directGradeInput(reg) {
      const current = directBy[reg.id]?.grade ?? "";
      // The fest's own scale, not a hard-coded A/B/C — a custom grade must
      // be pickable here or a direct event simply cannot use it.
      const sel = select([{ value: "", label: "—" },
        ...thresholds.map(g => ({ value: g.id, label: g.label })),
        { value: "Without", label: gradeLabel("Without", settings) }],
        { value: current });
      sel.disabled = absentBy[reg.id] || locked;
      sel.addEventListener("change", guard(async () => {
        if (locked) return;
        const id = event.id + "_" + reg.id;
        await put("directResults", id, {
          eventId: event.id, regId: reg.id,
          placement: directBy[reg.id]?.placement ?? null,
          grade: sel.value || null
        });
        directBy[reg.id] = { ...(directBy[reg.id] || {}), grade: sel.value || null };
        toast("Grade saved.");
      }));
      return sel;
    }

    function scoreInput(reg, col) {
      const existing = scoreBy[reg.id + "|" + col.uid];
      const box = input({
        type: "number", min: 0, max: scale, step: "0.01",
        value: existing?.score ?? "",
        style: "max-width:110px",
        disabled: absentBy[reg.id] || locked
      });
      box.addEventListener("change", guard(async () => {
        if (locked) { box.value = existing?.score ?? ""; return; }
        const raw = box.value.trim();
        const id = `${event.id}_${reg.id}_${col.uid}`;
        if (raw === "") { await remove("scores", id); toast("Score cleared."); paint(); return; }
        const val = Number(raw);
        if (isNaN(val) || val < 0 || val > scale) { toast(`Score must be between 0 and ${scale}.`, true); box.value = existing?.score ?? ""; return; }
        await put("scores", id, {
          eventId: event.id, regId: reg.id, judgeUid: col.uid, judgeName: col.name,
          score: val, timestamp: Date.now(),
          enteredByAdminOverride: true,
          ...(existing && existing.score !== val ? { correctedFromScore: existing.score } : {})
        });
        toast(existing ? "Score corrected." : "Score saved.");
        paint();
      }));
      return box;
    }
  }
}

/**
 * I30 — this used to append unconditionally. Pressing "View computed table"
 * three times produced three identical tables stacked down the page. It is
 * now a toggle that owns exactly one node.
 */
/**
 * Show the computed table, from a stored result or a live preview.
 *
 * `data` is either a stored result document (`.entries`) or the return of
 * computeEventResult (`.rows` plus `.blockers`). Passing null just closes it.
 */
function showComputed(panel, data, trigger, isPreview = false, settings = null) {
  const existing = panel.querySelector(".computed-table");
  if (existing) {
    existing.remove();
    if (trigger) trigger.textContent = isPreview || !data ? "Preview computed table" : "View computed table";
    return;
  }
  if (!data) return;

  const rows = data.entries || data.rows || [];
  const blockers = data.blockers || [];

  const box = card(el("div", {}, [
    // An unscored entry is not a zero, so a preview that silently ranked
    // around it would be misleading. Say what is still missing.
    blockers.length
      ? notice("warn", `Not ready to finalize — still missing a score or an Absent mark for: ${blockers.join(", ")}. ` +
          `Those entries are left out of the ranking below.`)
      : null,
    isPreview && !blockers.length
      ? notice("info", "This is what finalizing will store. Nothing has been saved yet.")
      : null,
    table([
      { key: "rank", label: "Rank", render: r => r.isAbsent ? badge("Absent", "badge-danger") : el("span.rank-medal", { text: "#" + r.rank }) },
      { key: "codeLetter", label: "Code", render: r => el("span.mono", { text: r.codeLetter }) },
      { key: "names", label: "Entry", render: r => (r.participantNames || []).length
          ? (r.participantNames || []).join(", ")
          : el("span.hint", { text: r.houseName || "Whole team" }) },
      { key: "houseName", label: "House" },
      { key: "averageScore", label: "Average", num: true, render: r =>
          r.averageScore === null || r.averageScore === undefined
            ? el("span.hint", { text: "—" })
            : el("span", {}, [
                el("span.mono", { text: Number(r.averageScore).toFixed(2) }),
                // An override that does not announce itself on the result
                // table is the thing that looks like tampering later.
                r.overridden ? el("div.hint", { style: "margin:0",
                  title: r.overrideReason || "", text: "overridden" }) : null
              ]) },
      { key: "percent", label: "%", num: true, render: r => r.percent === null ? "—" : r.percent.toFixed(1) },
      { key: "grade", label: "Grade", render: r => badge(gradeLabel(r.grade, settings)) },
      { key: "rankPoints", label: "Rank pts", num: true },
      { key: "gradePoints", label: "Grade pts", num: true },
      { key: "totalPoints", label: "Total", num: true }
    ], rows)
  ]), isPreview ? "Computed result — preview" : "Computed result");
  box.classList.add("computed-table");
  panel.appendChild(box);
  if (trigger) trigger.textContent = isPreview ? "Hide preview" : "Hide computed table";
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Set the average this entry is ranked on, in place of the judges'.
 *
 * Requires a reason, and the reason is stored on the result — an override
 * that cannot be explained afterwards is indistinguishable from tampering,
 * and this is the one screen where that distinction matters most.
 */
function overrideDialog(event, reg, existing, scale, refresh) {
  const value = input({ type: "number", min: 0, max: scale, value: existing?.value ?? "" });
  const reason = el("textarea", { rows: 3, placeholder: "Why this entry is not being ranked on the judges' average." });
  reason.value = existing?.reason || "";

  modal({
    title: "Override score — " + (reg.codeLetter || ""),
    body: el("div", {}, [
      notice("warn",
        "This replaces the average this entry is ranked on. The judges' own marks are kept and are not " +
        "changed — clearing the override restores them. The percentage, grade, rank and points are all " +
        "recalculated from the value below exactly as they would be from a real average."),
      field(`Score out of ${scale}`, value),
      field("Reason", reason, "Required. Stored on the result and shown alongside it.")
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save override", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const v = Number(value.value);
          if (value.value === "" || isNaN(v) || v < 0 || v > scale) {
            toast(`Enter a score between 0 and ${scale}.`, true); return false;
          }
          if (!reason.value.trim()) { toast("Give a reason for the override.", true); return false; }
          await put("scoreOverrides", event.id + "_" + reg.id, {
            eventId: event.id, regId: reg.id, value: v,
            reason: reason.value.trim(),
            setBy: session.name || "", setAt: Date.now()
          });
          toast("Override saved. Finalize again to apply it.");
          close(true); refresh();
        })
      }
    ]
  });
}

function ordinalLabel(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " place";
}

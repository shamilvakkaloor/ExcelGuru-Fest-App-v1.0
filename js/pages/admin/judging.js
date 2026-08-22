import { el, card, field, input, select, button, table, toast, guard, notice, empty,
         badge, confirmDialog, filterBar, modal } from "../../lib/ui.js";
import { getAll, getOne, put, remove, where, batchWrite } from "../../lib/db.js";
import { finalizeEvent, computeEventResult, unfinalizeEvent } from "../../domain/publish.js";
import { averageOf, gradeFor, resolvePoints, gradeScaleFrom, gradeLabel } from "../../domain/scoring.js";
import { PUBLISH_STATUS, DEFAULTS, classLabel, eventLabel, EVENT_CLASSES,
         isGeneralClass, typeTierFilters, eventFilterKeys, effectiveResultMode,
         entryLabel, isGroupClass as isGroupCls } from "../../domain/constants.js";
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

  // Typed-but-unsaved score values, keyed the same way scoreBy is
  // (regId|judgeUid), surviving across a repaint of the SAME event.
  //
  // Saving one entry's score calls paint(), which rebuilds the whole panel
  // from a fresh Firestore read — that is what makes the Average column and
  // every other row's saved state trustworthy after any single save. But it
  // also wiped out anything typed into every OTHER row that had not been
  // saved yet: type two scores, Save the first, and the second vanished —
  // reported directly, and reproducible from the code (the box for an
  // unsaved row is rebuilt from `existing?.score` alone, which has nothing
  // to say about a value that was only ever in that now-destroyed DOM node).
  //
  // Cleared on an actual event change, not on every paint(), so a value
  // survives exactly as long as it should: through a same-event repaint,
  // gone the moment scoring context changes to something the value was
  // never meant for.
  const pendingScores = new Map();
  let paintedEventId = null;

  // I3 — filter the picker, so a fest with 120 events does not present one
  // flat dropdown of 120 items.
  const bar = filterBar({
    remember: "admin-judging",
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
    if (!event) { panel.innerHTML = ""; return; }
    if (event.id !== paintedEventId) { pendingScores.clear(); paintedEventId = event.id; }

    /* Read FIRST, clear second.
     *
     * The panel used to be emptied here, before ten Firestore reads — so
     * for the whole round trip the screen was blank, and every action that
     * repaints (marking absent, saving a score, freezing a mark) flashed
     * the page away and back. Building against live data and swapping at
     * the end means the old table stays up until the new one is ready.
     *
     * Scroll position is restored for the same reason: a repaint that
     * jumps a long entry list back to the top loses the row the organiser
     * was working on. */
    const scrollY = window.scrollY;

    const [regs, judgeAssignments, scores, flags, result, directRows, ladderDoc, overrideRows, materialRows, notes] =
      await Promise.all([
        getAll("registrations", where("eventId", "==", event.id)),
        getAll("judgeAssignments", where("eventId", "==", event.id)),
        getAll("scores", where("eventId", "==", event.id)),
        getAll("entryFlags", where("eventId", "==", event.id)),
        getOne("results", event.id),
        getAll("directResults", where("eventId", "==", event.id)).catch(() => []),
        // Every ladder, so resolvePoints answers exactly as finalize will.
        getAll("pointsConfig").catch(() => []),
        getAll("scoreOverrides", where("eventId", "==", event.id)).catch(() => []),
        event.materialsEnabled
          ? getAll("eventMaterials", where("eventId", "==", event.id)).catch(() => [])
          : Promise.resolve([]),
        // I20 — a judge's one-per-event remark. Admin/Co-Admin only; never
        // reaches a public or House-facing screen.
        getAll("judgeEventNotes", where("eventId", "==", event.id)).catch(() => [])
      ]);
    // Everything below appends to `panel`, so it is emptied only now that
    // the data it will be rebuilt from has actually arrived.
    panel.innerHTML = "";
    // Put the view back where it was, once the new rows are laid out.
    requestAnimationFrame(() => window.scrollTo({ top: scrollY }));

    const overrideBy = Object.fromEntries(overrideRows.map(o => [o.regId, o]));
    const materialByReg = Object.fromEntries(
      materialRows.filter(m => m.status === "approved").map(m => [m.registrationId, m]));

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

    /* ── I14 / I22 — FINALIZED MEANS FROZEN ────────────────────────
     * v6 rendered an editable score box regardless of publish state, and
     * the rules permitted an Admin score write at any time. An Admin could
     * therefore change a mark the public had already seen; the snapshot
     * rebuilt and a house total moved with no trace.
     *
     * v9.2 widened the freeze: it used to lift the moment an event was
     * merely finalized-not-published, on the theory that re-finalizing was
     * itself "the correction". That let a judge or Admin silently edit a
     * mark whose rank/points had already been computed and shown on the
     * Judging screen, with nothing to say it had changed. Now ANY existing
     * result — Finalized or Published — locks editing; a correction goes
     * through Unfinalize first, which is itself an explicit, visible act.
     *
     * The UI lock below is advisory. The enforcement that matters is in
     * firestore.rules, which denies writes to scores, entryFlags,
     * directResults and scoreOverrides once a results doc exists at all.
     */
    const locked = !!result;
    const published = result?.publishStatus === PUBLISH_STATUS.PUBLISHED;

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
        "Admin can fill a judge's missing score. Once a judge has submitted their own mark it can no longer be " +
        "typed over directly — use \"Add a mark\" to adjust it, or Freeze to exclude it from the average. A " +
        "blank score is never read as zero — mark the entry Absent instead." })
    ]), event.name));

    if (notes.length) {
      panel.appendChild(card(el("div", {}, notes.map(n => el("div", {
        style: "padding:.5rem 0;border-top:1px solid var(--line)"
      }, [
        el("strong", { text: n.judgeName || "Judge" }),
        el("div.hint", { style: "white-space:pre-wrap;margin:.2rem 0 0", text: n.remark })
      ]))), "Judges' overall remarks"));
    }

    if (published) {
      panel.appendChild(notice("warn",
        "This event is published, so its scores and absences are read-only. " +
        "To correct one, unpublish it on the Results screen first, then Unfinalize below."));
    } else if (locked) {
      panel.appendChild(notice("warn",
        "This event is finalized, so its scores and absences are read-only. " +
        "Unfinalize it below to make a correction — that reopens editing without touching what's already been recorded."));
    }

    const rows = lettered.sort((a, b) => a.codeLetter.localeCompare(b.codeLetter));

    const cols = [
      { key: "codeLetter", label: "Code", render: r => el("span.code-letter", { text: r.codeLetter }) },
      { key: "who", label: "Entry", render: r => event.blindJudging
          ? el("span.hint", { text: "hidden while blind" })
          : isGroupCls(event.eventClass)
            ? el("div", {}, [
                el("div", { text: entryLabel(r, event) }),
                r.wholeTeam ? null
                  : el("div.hint", { style: "margin:0", text: (r.participantNames || []).join(", ") })
              ])
            : (r.participantNames || []).join(", ") + " · " + r.houseName }
    ];

    if (event.materialsEnabled) {
      cols.push({ key: "material", label: event.materialLabel || "Material",
        render: r => {
          const m = materialByReg[r.id];
          if (!m) return el("span.hint", { text: "—" });
          return m.link
            ? el("a", { href: m.link, target: "_blank", rel: "noopener", text: m.title })
            : el("span", { text: m.title });
        }});
    }

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
      // Mirrors loadEventEntries() exactly — frozen marks dropped, an
      // added mark (override) joined in — so this live preview never
      // disagrees with what Finalize is about to compute.
      const vals = columns.map(c => scoreBy[r.id + "|" + c.uid])
        .filter(s => s && typeof s.score === "number" && !s.excluded)
        .map(s => s.score);
      const ov = overrideBy[r.id];
      const allVals = (ov && ov.value !== null && ov.value !== undefined)
        ? [...vals, Number(ov.value)] : vals;
      const avg = averageOf(allVals);
      if (absentBy[r.id]) return badge("Absent", "badge-danger");
      if (avg === null) return el("span.hint", { text: "—" });
      const pct = (avg / scale) * 100;
      return el("span", {}, [
        el("span.mono", { text: avg.toFixed(2) }), " ",
        badge(gradeLabel(gradeFor(pct, thresholds), settings))
      ]);
    }});

    /* An override joins the judges' marks as one more value in the same
     * average, rather than replacing it — see publish.js loadEventEntries.
     * Their marks stay underneath untouched either way, so removing the
     * override restores the average to exactly what the judges gave. */
    if (!isDirect) cols.push({ key: "override", label: "Add a mark", render: r => {
      const ov = overrideBy[r.id];
      return el("div.btn-row", {}, [
        ov ? badge(String(ov.value), "badge-warn") : null,
        button(ov ? "Change" : "Add", {
          class: "btn-sm", disabled: locked,
          onclick: () => overrideDialog(event, r, ov, scale, paint)
        }),
        ov ? button("Remove", { class: "btn-sm btn-danger", disabled: locked,
          onclick: guard(async () => {
            await remove("scoreOverrides", event.id + "_" + r.id);
            toast("Removed — the judges' own average applies again.");
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
      // Visible once a result exists and is not yet public — the one state
      // a correction actually needs to move out of. Once published, this
      // button would only confuse: Unpublish is the first step there, on
      // the Results screen, not here.
      locked && !published
        ? button("Unfinalize", { class: "btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Unfinalize event",
              "Scores and absences reopen for editing. Nothing already entered is changed or lost — " +
              "this only removes the computed result so it can be redone.", "Unfinalize")) return;
            await unfinalizeEvent(event.id);
            toast("Unfinalized — scores are editable again.");
            paint();
          })})
        : null,
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
          showComputed(panel, preview, btn, !result, settings, event);
        })
      })
    ]));

    /** Placement dropdown for a direct event — ladder positions, plus none. */
    function placementInput(reg) {
      /* Three states, not two. The blank option used to be LABELLED "no
       * place" while Finalize treated it as "not judged yet" and refused to
       * run — so an event where six of nine entries simply did not place
       * could not be finalized at all unless those six were marked Absent,
       * which is a different and untrue thing to publish about them.
       * "No place" is now its own answer, stored as 0. */
      const raw = directBy[reg.id]?.placement;
      const current = raw == null ? "" : String(raw);
      const sel = select([
        { value: "", label: "— not judged yet —" },
        { value: "0", label: "Took part — no place" },
        ...ladderRanks.map(r => ({ value: String(r), label: ordinalLabel(r) }))],
        { value: current });
      sel.disabled = absentBy[reg.id] || locked;
      sel.addEventListener("change", guard(async () => {
        if (locked) return;
        const val = sel.value ? Number(sel.value) : null;
        const id = event.id + "_" + reg.id;
        await batchWrite([
          { type: "set", path: "directResults", id, data: {
              eventId: event.id, regId: reg.id, placement: val,
              grade: directBy[reg.id]?.grade ?? null
            } },
          { type: "set", path: "judgingEntries", id: event.id, data: { scoringStarted: true } }
        ]);
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
      const key = reg.id + "|" + col.uid;
      const existing = scoreBy[key];
      // enteredByAdminOverride is set true on every write admin.js makes and
      // false on every write judge.js makes — see the firestore.rules scores
      // rule this mirrors — so it always says who actually put the current
      // number there, not just who touched the doc first. A mark a judge
      // submitted themselves cannot be typed over from here any more; the
      // rules would refuse the write anyway, so the box is locked before the
      // admin gets to that surprise, with "Add a mark" / Freeze pointed to
      // instead.
      const judgeSubmitted = !!existing && existing.enteredByAdminOverride !== true;
      // A pending value from BEFORE this repaint wins over what is on
      // record — it is what the admin typed and has not saved yet, which
      // is exactly the thing this repaint would otherwise have erased.
      const pending = pendingScores.get(key);
      const box = input({
        type: "number", min: 0, max: scale, step: "0.01",
        value: pending !== undefined ? pending : (existing?.score ?? ""),
        style: "max-width:110px",
        disabled: absentBy[reg.id] || locked || judgeSubmitted,
        title: judgeSubmitted
          ? "This judge already submitted this mark — use \"Add a mark\" to adjust it, or Freeze to exclude it."
          : null
      });

      // Explicit Save, matching the judge's own page (js/pages/judge.js) —
      // this used to commit on the input's native `change` event, which
      // fires on blur. That is easy to trigger by accident (tab to the next
      // cell, click elsewhere to check something) with no on-screen sign a
      // correction had already gone in, which read as "there's no save
      // option here". Nothing is written until Save is pressed, same rule
      // as the judge's screen.
      const state = el("span.hint", { style: "margin:0;white-space:nowrap",
        text: judgeSubmitted ? "judge's mark" : (existing ? "saved" : "") });
      const saveBtn = button("Save", { class: "btn-sm btn-accent", disabled: true });

      const markDirty = () => {
        if (judgeSubmitted) return;
        const changed = box.value.trim() !== String(existing?.score ?? "");
        saveBtn.disabled = !changed || locked;
        state.textContent = changed ? "unsaved" : (existing ? "saved" : "");
        state.style.color = changed ? "var(--marigold-d)" : "";
        // Recorded on every keystroke, not only at save time — a repaint can
        // land in between (another row's Save), and by then it is too late
        // to ask the box what it used to hold.
        if (changed) pendingScores.set(key, box.value); else pendingScores.delete(key);
      };
      box.addEventListener("input", markDirty);
      box.addEventListener("keydown", e => { if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click(); });
      // A value restored from a previous repaint IS a change from `existing`
      // by definition, so this shows "unsaved" and an enabled Save
      // immediately rather than waiting for the next keystroke to notice.
      if (pending !== undefined) markDirty();

      saveBtn.addEventListener("click", guard(async () => {
        if (locked) { box.value = existing?.score ?? ""; markDirty(); return; }
        const raw = box.value.trim();
        const id = `${event.id}_${reg.id}_${col.uid}`;
        saveBtn.disabled = true;
        state.textContent = "saving…"; state.style.color = "";

        if (raw === "") {
          await remove("scores", id);
          pendingScores.delete(key);
          toast("Score cleared.");
          paint();
          return;
        }
        const val = Number(raw);
        if (isNaN(val) || val < 0 || val > scale) {
          toast(`Score must be between 0 and ${scale}.`, true);
          state.textContent = "unsaved"; state.style.color = "var(--marigold-d)"; saveBtn.disabled = false;
          return;
        }
        await batchWrite([
          { type: "set", path: "scores", id, data: {
              eventId: event.id, regId: reg.id, judgeUid: col.uid, judgeName: col.name,
              score: val, timestamp: Date.now(),
              enteredByAdminOverride: true,
              excluded: !!existing?.excluded,
              ...(existing && existing.score !== val ? { correctedFromScore: existing.score } : {})
            } },
          { type: "set", path: "judgingEntries", id: event.id, data: { scoringStarted: true } }
        ]);
        pendingScores.delete(key);
        toast(existing ? "Score corrected." : "Score saved.");
        paint();
      }));

      // I20 — the judge's own remark against this entry, if they left one.
      // Admin/Co-Admin only, same as everywhere else it surfaces.
      const remarkHint = existing?.remark
        ? el("span.hint", { style: "margin:0", title: existing.remark, text: "remark" })
        : null;

      const row = el("div", { style: "display:flex;flex-direction:column;gap:.3rem;align-items:flex-start" }, [
        el("div", { style: "display:flex;gap:.4rem;align-items:center" }, [box, saveBtn, state])
      ]);
      if (remarkHint) row.appendChild(remarkHint);

      // v9.2 — freeze ONE judge's mark on ONE entry out of the average,
      // as a correction, without touching that judge's marks anywhere
      // else. The mark itself is kept, not deleted — un-freezing restores
      // it exactly, the same reversibility an override already has.
      if (!existing) return row;
      const excludeBtn = button(existing.excluded ? "Frozen" : "Freeze", {
        class: "btn-sm" + (existing.excluded ? " btn-danger" : ""),
        disabled: locked,
        title: existing.excluded
          ? "This mark is excluded from the average. Click to include it again."
          : "Exclude this one mark from the average, as a correction — the judge's other marks are unaffected.",
        onclick: guard(async () => {
          await put("scores", `${event.id}_${reg.id}_${col.uid}`, {
            ...existing, excluded: !existing.excluded
          });
          toast(existing.excluded ? "Mark restored to the average." : "Mark frozen out of the average.");
          paint();
        })
      });
      row.appendChild(excludeBtn);
      return row;
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
function showComputed(panel, data, trigger, isPreview = false, settings = null, event = null) {
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
      { key: "names", label: "Entry", render: r => (event ? entryLabel({ ...r, eventClass: event.eventClass }, event) : null)
          || el("span.hint", { text: r.houseName || "Whole team" }) },
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
 * Add one more mark to this entry's average, alongside the judges' real
 * scores — not in place of them.
 *
 * Requires a reason, and the reason is stored on the result — a mark added
 * by hand that cannot be explained afterwards is indistinguishable from
 * tampering, and this is the one screen where that distinction matters most.
 */
function overrideDialog(event, reg, existing, scale, refresh) {
  const value = input({ type: "number", min: 0, max: scale, value: existing?.value ?? "" });
  const reason = el("textarea", { rows: 3, placeholder: "Why this entry needs an extra mark." });
  reason.value = existing?.reason || "";

  modal({
    title: "Add a mark — " + (reg.codeLetter || ""),
    body: el("div", {}, [
      notice("warn",
        "This joins the judges' real marks as one more value in the SAME average — a 3-judge entry with " +
        "this added becomes a 4-way average. The judges' own marks are kept and are not changed — removing " +
        "this restores their average exactly. The percentage, grade, rank and points all follow from that " +
        "average, same as for any other entry."),
      field(`Score out of ${scale}`, value),
      field("Reason", reason, "Required. Stored on the result and shown alongside it.")
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const v = Number(value.value);
          if (value.value === "" || isNaN(v) || v < 0 || v > scale) {
            toast(`Enter a score between 0 and ${scale}.`, true); return false;
          }
          if (!reason.value.trim()) { toast("Give a reason for this mark.", true); return false; }
          await put("scoreOverrides", event.id + "_" + reg.id, {
            eventId: event.id, regId: reg.id, value: v,
            reason: reason.value.trim(),
            setBy: session.name || "", setAt: Date.now()
          });
          toast("Saved. Finalize again to apply it.");
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

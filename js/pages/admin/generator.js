// Certificate & poster studio — a canvas editor with layers and properties.
//
// A design is data (see domain/templates.js), so the editor only ever
// mutates plain numbers and strings. Saved designs live in
// designs/{id} and are reused at generation time, which is why what you
// arrange on screen is exactly what prints.
import { el, card, field, input, select, button, toast, guard, notice, empty, badge, modal, confirmDialog, loading, checkbox, hint } from "../../lib/ui.js";
import { getAll, getOne, put, patch, remove, where } from "../../lib/db.js";
import { printDocument } from "../../lib/pdf.js";
import { loadTemplate, TEMPLATE_LIST, TEMPLATE_KIND_LABEL, PLACEHOLDERS, fillTokens } from "../../domain/templates.js";
import { renderCanvas, renderPageHTML, previewData } from "../../lib/designRender.js";
import { compressImage, resolvePrintPhotos, resolvePrintPhoto } from "../../lib/photo.js";
import { PUBLISH_STATUS, classLabel, EVENT_CLASSES } from "../../domain/constants.js";
import { highestRankAwarded, gradeLabel } from "../../domain/scoring.js";

export default async function generator(root) {
  const wrapper = el("div");
  root.appendChild(wrapper);
  let view = "list";
  let design = null, designId = null;

  await paintList();

  /* ══ Design list ═══════════════════════════════════════════════ */
  async function paintList() {
    view = "list";
    wrapper.innerHTML = "";
    wrapper.appendChild(el("h1", { text: "Certificates & posters" }));
    wrapper.appendChild(loading("Loading designs…"));

    const [saved, results, types, tiers] = await Promise.all([
      getAll("designs").catch(() => []),
      getAll("results").catch(() => []),
      getAll("programTypes").catch(() => []),
      getAll("programTiers").catch(() => [])
    ]);
    const typeName = Object.fromEntries(types.map(t => [t.id, t.name]));
    const tierName = Object.fromEntries(tiers.map(t => [t.id, t.name]));
    wrapper.innerHTML = "";
    wrapper.appendChild(el("h1", { text: "Certificates & posters" }));

    const published = results.filter(r => r.publishStatus === PUBLISH_STATUS.PUBLISHED);

    // How many places this fest awards, from the widest rank ladder in use.
    // Every ladder, not just the four class ones — a Type or Tier ladder
    // may award more places than any class does.
    const ladders = await getAll("pointsConfig").catch(() => []);
    const maxRank = highestRankAwarded(ladders);
    if (!published.length) {
      wrapper.appendChild(notice("warn",
        "No results are published yet. You can design freely now, but generating uses published results only."));
    }

    const kindOrder = ["certificate", "poster", "idcard"];
    const kindGroups = kindOrder
      .map(kind => ({ kind, items: TEMPLATE_LIST.filter(t => t.kind === kind) }))
      .filter(g => g.items.length);

    wrapper.appendChild(card(el("div", {}, [
      el("p.hint", { text: "Start from a template, arrange it on the canvas, then generate for everyone at once." }),
      ...kindGroups.map(g => el("div", { style: "margin-bottom:.9rem" }, [
        el("div.hint", { style: "margin:0 0 .3rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em",
          text: TEMPLATE_KIND_LABEL[g.kind] || g.kind }),
        el("div.chip-row", {}, g.items.map(t =>
          el("button.chip", { type: "button", text: t.label, onclick: () => openEditor(loadTemplate(t.id), null) })))
      ]))
    ]), "New design"));

    wrapper.appendChild(card(
      saved.length
        ? el("div", {}, saved.map(d => el("div", {
            style: "display:flex;gap:.7rem;align-items:center;padding:.55rem 0;border-bottom:1px solid var(--line)"
          }, [
            el("div", { style: "flex:1;min-width:0" }, [
              el("strong", { text: d.name || "Untitled" }),
              el("div.hint", { style: "margin:0", text:
                `${d.page?.w}×${d.page?.h}mm · ${(d.elements || []).length} elements` })
            ]),
            d.isPublic ? badge("Public", "badge-ok") : null,
            // v8 — sharing is per design, deliberately. There is no
            // "publish all": each one is a decision.
            button(d.isPublic ? "Unshare" : "Share publicly", { class: "btn-sm", onclick: guard(async () => {
              await patch("designs", d.id, { isPublic: !d.isPublic });
              toast(d.isPublic ? "No longer public." : "Now on the public templates page.");
              paintList();
            })}),
            // One certificate on demand, found by chest number — for the
            // person standing at the desk saying theirs did not print.
            button("Print one", { class: "btn-sm",
              onclick: () => singleDialog(normalise(d), published, typeName, tierName) }),
            button("Edit", { class: "btn-sm", onclick: () => openEditor(normalise(d), d.id) }),
            button("Generate", { class: "btn-sm btn-accent", onclick: () => generateDialog(normalise(d)) }),
            button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
              if (!await confirmDialog("Delete design", `Delete "${d.name}"?`, "Delete")) return;
              await remove("designs", d.id); toast("Deleted."); paintList();
            })})
          ])))
        : empty("No saved designs yet", "Pick a template above to start."),
      "Saved designs"));
  }

  function normalise(d) {
    return {
      name: d.name, page: d.page, background: d.background,
      backgroundImage: d.backgroundImage || null,
      elements: (d.elements || []).map(e => ({ ...e }))
    };
  }

  /* ══ Editor ════════════════════════════════════════════════════ */
  function openEditor(d, id) {
    view = "editor";
    design = d;
    designId = id;
    let selectedId = null;
    let zoom = 0.42;

    wrapper.innerHTML = "";

    const nameInput = input({ value: design.name || "Untitled", style: "max-width:220px;min-height:36px" });
    const header = el("div.card-head", {}, [
      button("← Back", { class: "btn-sm", onclick: guard(async () => {
        if (await confirmDialog("Leave editor", "Unsaved changes will be lost. Save first?", "Leave without saving")) paintList();
      })}),
      nameInput,
      el("div.spacer"),
      button("−", { class: "btn-sm", onclick: () => { zoom = Math.max(0.2, zoom - 0.06); paintStage(); } }),
      el("span.hint", { style: "margin:0;min-width:44px;text-align:center", text: Math.round(zoom * 100) + "%" }),
      button("+", { class: "btn-sm", onclick: () => { zoom = Math.min(1.1, zoom + 0.06); paintStage(); } }),
      button("Save design", { class: "btn-sm btn-primary", onclick: guard(saveDesign) }),
      button("Generate", { class: "btn-sm btn-accent", onclick: () => generateDialog(design) })
    ]);

    const left = el("div.studio-pane.left");
    const stage = el("div.studio-stage");
    const right = el("div.studio-pane.right");
    const studio = el("div.studio", {}, [left, stage, right]);

    wrapper.append(el("h1", { text: "Design editor" }), header, studio);

    /* ── Left pane: canvas settings + layers ────────────────────── */
    function paintLeft() {
      left.innerHTML = "";

      left.appendChild(el("div.studio-title", { text: "Add element" }));
      left.appendChild(el("div.btn-row", { style: "margin-bottom:.9rem" }, [
        button("Text", { class: "btn-sm", onclick: () => addElement("text") }),
        button("Box", { class: "btn-sm", onclick: () => addElement("box") }),
        button("Image", { class: "btn-sm", onclick: () => addElement("image") })
      ]));

      left.appendChild(el("div.studio-title", { text: "Canvas" }));
      const bgColor = el("input", { type: "color", value: design.background || "#ffffff",
        style: "height:34px;padding:2px" });
      bgColor.addEventListener("input", () => { design.background = bgColor.value; paintStage(); });
      left.appendChild(field("Background colour", bgColor));

      const bgFile = el("input", { type: "file", accept: "image/*", style: "display:none" });
      bgFile.addEventListener("change", guard(async () => {
        const f = bgFile.files?.[0];
        if (!f) return;
        design.backgroundImage = await compressImage(f, 1400, 0.8);
        paintStage(); paintLeft();
      }));
      left.appendChild(el("div.btn-row", { style: "margin-bottom:.9rem" }, [
        button("Upload background", { class: "btn-sm", onclick: () => bgFile.click() }),
        design.backgroundImage ? button("Clear", { class: "btn-sm", onclick: () => {
          design.backgroundImage = null; paintStage(); paintLeft();
        }}) : null,
        bgFile
      ]));

      const orient = select([
        { value: "landscape", label: "Landscape" },
        { value: "portrait", label: "Portrait" }
      ], { value: design.page.w > design.page.h ? "landscape" : "portrait" });
      orient.addEventListener("change", () => {
        // Swap the design's OWN w/h rather than resetting to a hard-coded
        // A4 size — a non-A4 design (the ID card is 85.6×54mm) would
        // otherwise lose its real dimensions the moment anyone touched
        // this control, even by re-selecting the orientation it was
        // already in.
        const wantLandscape = orient.value === "landscape";
        if (wantLandscape !== (design.page.w > design.page.h)) {
          design.page = { w: design.page.h, h: design.page.w };
        }
        paintStage();
      });
      left.appendChild(field("Orientation", orient));

      left.appendChild(el("div.studio-title", { text: "Layers" }));
      const list = el("div");
      // Reversed so the topmost visual layer sits at the top of the list.
      [...design.elements].reverse().forEach(e => {
        const row = el("div.layer-row" + (e.id === selectedId ? ".active" : ""), {}, [
          el("span.ltype", { text: e.type[0].toUpperCase() }),
          el("span.lname", { text: e.id }),
          button("↑", { class: "btn-sm", onclick: ev => { ev.stopPropagation(); moveLayer(e, +1); } }),
          button("↓", { class: "btn-sm", onclick: ev => { ev.stopPropagation(); moveLayer(e, -1); } })
        ]);
        row.addEventListener("click", () => { selectedId = e.id; paintAll(); });
        list.appendChild(row);
      });
      left.appendChild(list);
    }

    function moveLayer(e, dir) {
      const i = design.elements.indexOf(e);
      const j = i + dir;
      if (j < 0 || j >= design.elements.length) return;
      design.elements.splice(i, 1);
      design.elements.splice(j, 0, e);
      paintAll();
    }

    function addElement(type) {
      const id = type + "_" + (design.elements.filter(x => x.type === type).length + 1);
      const common = { id, type, x: 30, y: 30, w: type === "text" ? 120 : 40 };
      const e = type === "text"
        ? { ...common, text: "New text", size: 12, font: "sans", color: "#14232E", align: "left", weight: 400, lineHeight: 1.3 }
        : type === "box"
          ? { ...common, h: 20, fill: "#6C4BD6", stroke: "none", strokeWidth: 0, radius: 0 }
          : { ...common, h: 40, src: "{photo}", radius: 0 };
      design.elements.push(e);
      selectedId = id;
      paintAll();
    }

    /* ── Stage ──────────────────────────────────────────────────── */
    function paintStage() {
      stage.innerHTML = "";
      stage.appendChild(renderCanvas(design, {
        scale: zoom * 3.78,
        selectedId,
        onSelect: id => { selectedId = id; paintAll(); },
        onChange: () => paintRight()
      }));
      const zoomLabel = header.querySelector(".hint");
      if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + "%";
    }

    /* ── Right pane: properties ─────────────────────────────────── */
    function paintRight() {
      right.innerHTML = "";
      right.appendChild(el("div.studio-title", { text: "Properties" }));

      const e = design.elements.find(x => x.id === selectedId);
      if (!e) {
        right.appendChild(hint("Select an element on the canvas or in the layers list."));
        return;
      }

      const num = (label, key, step = 1) => {
        const i = input({ type: "number", step, value: e[key] ?? 0 });
        i.addEventListener("input", () => { e[key] = Number(i.value) || 0; paintStage(); });
        return field(label, i);
      };

      right.appendChild(el("div.btn-row", { style: "margin-bottom:.6rem" }, [
        badge(e.type), el("span.spacer", { style: "flex:1" }),
        button("Delete", { class: "btn-sm btn-danger", onclick: () => {
          design.elements = design.elements.filter(x => x.id !== e.id);
          selectedId = null; paintAll();
        }})
      ]));

      right.appendChild(el("div.grid.grid-2", {}, [num("X (mm)", "x", 0.5), num("Y (mm)", "y", 0.5)]));
      right.appendChild(el("div.grid.grid-2", {}, [
        num("Width (mm)", "w", 0.5),
        e.type !== "text" ? num("Height (mm)", "h", 0.5) : null
      ]));

      if (e.type === "text") {
        const ta = el("textarea", { rows: 3, value: e.text || "" });
        ta.addEventListener("input", () => { e.text = ta.value; paintStage(); });
        right.appendChild(field("Text", ta));

        right.appendChild(el("div.studio-title", { text: "Insert placeholder" }));
        right.appendChild(el("div.chip-row", {}, PLACEHOLDERS
          .filter(p => p.token !== "{photo}")
          .map(p => el("button.chip", { type: "button", text: p.token, title: p.label, onclick: () => {
            e.text = (e.text || "") + p.token; ta.value = e.text; paintStage();
          }}))));

        right.appendChild(num("Size (pt)", "size", 0.5));

        const font = select([
          { value: "sans", label: "Sans" }, { value: "serif", label: "Serif" },
          { value: "display", label: "Display" }, { value: "mono", label: "Mono" }
        ], { value: e.font || "sans" });
        font.addEventListener("change", () => { e.font = font.value; paintStage(); });
        right.appendChild(field("Font", font));

        const weight = select([
          { value: "400", label: "Regular" }, { value: "600", label: "Semibold" }, { value: "700", label: "Bold" }
        ], { value: String(e.weight || 400) });
        weight.addEventListener("change", () => { e.weight = Number(weight.value); paintStage(); });
        right.appendChild(field("Weight", weight));

        const align = select([
          { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }
        ], { value: e.align || "left" });
        align.addEventListener("change", () => { e.align = align.value; paintStage(); });
        right.appendChild(field("Align", align));

        const color = el("input", { type: "color", value: e.color || "#14232E", style: "height:34px;padding:2px" });
        color.addEventListener("input", () => { e.color = color.value; paintStage(); });
        right.appendChild(field("Colour", color));

        right.appendChild(num("Line height", "lineHeight", 0.05));
        right.appendChild(num("Letter spacing", "spacing", 0.5));
      }

      if (e.type === "box") {
        const fill = el("input", { type: "color", value: e.fill === "none" ? "#ffffff" : (e.fill || "#6C4BD6"),
          style: "height:34px;padding:2px" });
        fill.addEventListener("input", () => { e.fill = fill.value; paintStage(); });
        right.appendChild(field("Fill", fill));
        right.appendChild(checkbox("No fill (outline only)", e.fill === "none", v => {
          e.fill = v ? "none" : fill.value; paintStage();
        }));

        const stroke = el("input", { type: "color", value: e.stroke === "none" ? "#14232E" : (e.stroke || "#14232E"),
          style: "height:34px;padding:2px" });
        stroke.addEventListener("input", () => { e.stroke = stroke.value; paintStage(); });
        right.appendChild(field("Border colour", stroke));
        right.appendChild(checkbox("No border", e.stroke === "none", v => {
          e.stroke = v ? "none" : stroke.value; paintStage();
        }));
        right.appendChild(num("Border width (mm)", "strokeWidth", 0.1));
        right.appendChild(num("Corner radius (mm)", "radius", 0.5));
        right.appendChild(num("Opacity (0–1)", "opacity", 0.05));
      }

      if (e.type === "image") {
        const src = select([
          { value: "{photo}", label: "Participant photo" },
          { value: "custom", label: "Uploaded image" }
        ], { value: e.src === "{photo}" ? "{photo}" : "custom" });
        src.addEventListener("change", () => {
          if (src.value === "{photo}") { e.src = "{photo}"; paintStage(); paintRight(); }
        });
        right.appendChild(field("Source", src));

        const f = el("input", { type: "file", accept: "image/*" });
        f.addEventListener("change", guard(async () => {
          const file = f.files?.[0];
          if (!file) return;
          e.src = await compressImage(file, 800, 0.82);
          paintStage(); paintRight();
        }));
        right.appendChild(field("Upload image", f));
        right.appendChild(num("Corner radius (mm)", "radius", 0.5));
      }
    }

    function paintAll() { paintLeft(); paintStage(); paintRight(); }

    async function saveDesign() {
      design.name = nameInput.value.trim() || "Untitled";
      const id = designId || ("design_" + Date.now().toString(36));
      await put("designs", id, {
        name: design.name, page: design.page,
        background: design.background, backgroundImage: design.backgroundImage || null,
        elements: design.elements, updatedAt: Date.now()
      }, false);
      designId = id;
      toast("Design saved.");
    }

    paintAll();
  }

  /* ══ Generation ════════════════════════════════════════════════ */
  async function generateDialog(d) {
    const [participants, houses, results, settings, categories, types, tiers] = await Promise.all([
      getAll("participants"), getAll("houses"), getAll("results"),
      getOne("config", "festSettings"), getAll("categories"),
      getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => [])
    ]);
    // B5 — Generate crashed for any fest with a published result: this
    // dialog builds `typeName`/`tierName` lookups per event below, but the
    // maps themselves were never fetched here (only paintList() had them).
    const typeName = Object.fromEntries(types.map(t => [t.id, t.name]));
    const tierName = Object.fromEntries(tiers.map(t => [t.id, t.name]));
    const published = results.filter(r => r.publishStatus === PUBLISH_STATUS.PUBLISHED);

    /* B4 — THE CERTIFICATE POPULATION BUG.
     *
     * v7 built its list from PUBLISHED RESULTS ONLY:
     *     participants.filter(p => byParticipant[p.id]?.length)
     * Before a single event is published that set is empty, every
     * participant is filtered out, and the run reports "No participants
     * match" — which reads as the feature being broken. Participation
     * certificates are exactly the thing you want to print BEFORE results.
     *
     * Generation now covers three populations, chosen at run time.
     */
    const mode = select([
      { value: "registered",  label: "Every registered participant (participation certificates)" },
      { value: "participants", label: "Participants in published events" },
      { value: "winners",      label: "Winners only (posters)" },
      { value: "eventranks",   label: "One event — every rank on one page" }
    ]);
    const houseSel = select([{ value: "", label: "All houses" },
      ...houses.map(h => ({ value: h.id, label: h.name }))]);
    const catSel = select([{ value: "", label: "All categories" },
      ...categories.map(c => ({ value: c.id, label: c.name }))]);
    const eventSel = select(
      published.map(r => ({ value: r.id, label: r.eventName })),
      {}
    );
    const eventField = field("Event", eventSel, "Only finalized, published events have results to show.");
    eventField.style.display = "none";
    if (!published.length) eventSel.disabled = true;

    // Ranks come from the ladder, not a hard-coded 1..3 — a fest awarding a
    // fourth place was silently cut off.
    const rankBox = el("div.chip-row");
    const picked = new Set();
    for (let r = 1; r <= maxRank; r++) {
      const b = el("button.chip", { type: "button", text: placeLabel(r), onclick: () => {
        picked.has(r) ? picked.delete(r) : picked.add(r);
        b.classList.toggle("on");
      }});
      rankBox.appendChild(b);
    }
    const rankField = field("Ranks to include", rankBox, "None selected means every placement.");
    const batchSize = input({ type: "number", min: 1, value: 100 });
    const houseField = field("House", houseSel);
    const catField = field("Category", catSel);
    const batchField = field("Pages per print window", batchSize,
      "Large runs are split so the browser is never holding hundreds of pages at once.");

    function syncMode() {
      const isEventRanks = mode.value === "eventranks";
      rankField.style.display = (mode.value === "registered" || isEventRanks) ? "none" : "";
      houseField.style.display = isEventRanks ? "none" : "";
      catField.style.display = isEventRanks ? "none" : "";
      batchField.style.display = isEventRanks ? "none" : "";
      eventField.style.display = isEventRanks ? "" : "none";
    }
    mode.addEventListener("change", syncMode);

    modal({
      title: "Generate — " + (d.name || "design"),
      body: el("div", {}, [
        field("Who to produce for", mode),
        houseField,
        catField,
        rankField,
        eventField,
        batchField,
        el("p.hint", { text: "Opens your browser's print window. Choose \"Save as PDF\" as the destination." })
      ]),
      actions: [
        { label: "Cancel" },
        { label: "Generate", kind: "accent", closes: false, busyLabel: "Building…", onClick: guard(async close => {
            if (mode.value === "eventranks") {
              const res = published.find(r => r.id === eventSel.value);
              if (!res) { toast("Pick an event with published results.", true); return false; }
              const entries = (res.entries || []).filter(e => !e.isAbsent && e.rank);
              if (!entries.length) { toast("No ranked placements for that event.", true); return false; }
              const lines = entries
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map(e => {
                  const who = (e.participantNames && e.participantNames.length > 1)
                    ? (e.houseName || "")
                    : [e.participantNames?.[0], e.houseName].filter(Boolean).join(" — ");
                  const gradeSuffix = e.grade ? ` (${gradeLabel(e.grade, settings)})` : "";
                  return `${placeLabel(e.rank)} — ${who}${gradeSuffix}`;
                });
              const html = renderPageHTML(d, {
                fest: settings?.festName || "", school: settings?.schoolName || "",
                date: new Date().toLocaleDateString(),
                event: res.eventName, category: res.categoryName || "",
                eventResults: lines.join("\n")
              });
              printDocument({
                title: (d.name || "Event results") + " — " + res.eventName, bare: true,
                landscape: d.page.w > d.page.h,
                bodyHTML: `<style>.design-page{position:relative;overflow:hidden;}
                  @page{size:${d.page.w}mm ${d.page.h}mm;margin:0;}
                  body{margin:0;}</style>` + html
              });
              close(true);
              return;
            }
            const byParticipant = {};
            for (const res of published) {
              for (const e of res.entries || []) {
                (e.participantIds || []).forEach(pid => {
                  (byParticipant[pid] ||= []).push({
                    eventName: res.eventName, eventClass: res.eventClass,
                    categoryName: categories.find(c => c.id === res.categoryId)?.name || "",
                    typeName: typeName[res.typeId] || "", tierName: tierName[res.tierId] || "",
                    rank: e.rank, grade: e.grade ? gradeLabel(e.grade, settings) : e.grade, isAbsent: e.isAbsent
                  });
                });
              }
            }

            const base = {
              fest: settings?.festName || "", school: settings?.schoolName || "",
              date: new Date().toLocaleDateString()
            };
            const pages = [];

            const wantRank = r => !picked.size || picked.has(r);
            const photoMapAll = await resolvePrintPhotos(participants);

            if (mode.value === "registered" || mode.value === "participants") {
              // "registered" does NOT require a published result — that was
              // the whole defect.
              let list = mode.value === "registered"
                ? participants.slice()
                : participants.filter(p => byParticipant[p.id]?.length);
              if (houseSel.value) list = list.filter(p => p.houseId === houseSel.value);
              if (catSel.value) list = list.filter(p => p.categoryId === catSel.value);
              if (mode.value === "participants" && picked.size) {
                list = list.filter(p => (byParticipant[p.id] || []).some(e => e.rank && wantRank(e.rank)));
              }
              if (!list.length) {
                toast(mode.value === "registered"
                  ? "No participants match those filters."
                  : "No published results yet for anyone matching those filters. Try \u201cEvery registered participant\u201d.", true);
                return false;
              }

              for (const p of list) {
                const entries = byParticipant[p.id] || [];
                pages.push(renderPageHTML(d, {
                  ...base,
                  name: p.name, chest: p.chestNumber ?? "",
                  house: houses.find(h => h.id === p.houseId)?.name || "",
                  category: p.categoryName || "", class: p.className || "",
                  // A Drive-linked photo is fetched and inlined as a data
                  // URL up front — see resolvePrintPhotos() — so it prints
                  // instead of falling back to the placeholder silhouette.
                  photo: photoMapAll.get(p.id) || "",
                  /* No single event is in scope for a participation
                   * certificate. If every one of their results shares a
                   * Type, that is unambiguous and worth printing; a mix
                   * would be misleading, so it stays blank. */
                  type: soleValue(entries.map(e => e.typeName)),
                  tier: soleValue(entries.map(e => e.tierName)),
                  results: entries.map(e =>
                    `${e.eventName} — ${e.isAbsent ? "Absent" : (e.rank ? placeLabel(e.rank) : "Participated")}` +
                    (e.grade && !e.isAbsent ? ` (${e.grade})` : "")).join("\n"),
                  event: entries[0]?.eventName || "", rank: "", grade: ""
                }));
              }
            } else {
              const byId = Object.fromEntries(participants.map(p => [p.id, p]));
              for (const res of published) {
                for (const e of (res.entries || []).filter(x => !x.isAbsent && x.rank && wantRank(x.rank))) {
                  for (const pid of e.participantIds || []) {
                    const p = byId[pid];
                    if (!p) continue;
                    if (houseSel.value && p.houseId !== houseSel.value) continue;
                    if (catSel.value && p.categoryId !== catSel.value) continue;
                    pages.push(renderPageHTML(d, {
                      ...base,
                      name: p.name, chest: p.chestNumber ?? "",
                      house: e.houseName || "", category: p.categoryName || "", class: p.className || "",
                      photo: photoMapAll.get(p.id) || "",
                      type: typeName[res.typeId] || "", tier: tierName[res.tierId] || "",
                      event: res.eventName, rank: placeLabel(e.rank), grade: e.grade ? gradeLabel(e.grade, settings) : "",
                      results: `${res.eventName} — ${placeLabel(e.rank)}`
                    }));
                  }
                }
              }
              if (!pages.length) { toast("No winners match.", true); return false; }
            }

            /* BATCHING — a 600-page run with embedded photos joined into a
             * single print document will stall or crash a modest laptop.
             * Above the threshold it is split, and each batch opens as its
             * own print window so the browser only ever holds one. */
            const perBatch = Math.max(1, Number(batchSize.value) || 100);
            const batches = [];
            for (let i = 0; i < pages.length; i += perBatch) batches.push(pages.slice(i, i + perBatch));

            const style = `<style>.design-page{position:relative;overflow:hidden;}
                @page{size:${d.page.w}mm ${d.page.h}mm;margin:0;}
                body{margin:0;}</style>`;

            if (batches.length > 1) {
              const ok = await confirmDialog("Print in batches",
                `${pages.length} pages will be split into ${batches.length} print windows of up to ${perBatch}. ` +
                `Save each one before moving to the next — your browser may block later windows otherwise.`,
                "Start");
              if (!ok) return false;
            }

            for (const [i, batch] of batches.entries()) {
              printDocument({
                title: (d.name || "Certificates") + (batches.length > 1 ? ` (${i + 1} of ${batches.length})` : ""),
                subtitle: `${batch.length} pages`,
                bodyHTML: style + batch.join(""),
                landscape: d.page.w > d.page.h,
                bare: true
              });
              // A beat between windows; browsers throttle rapid popups.
              if (i < batches.length - 1) await new Promise(r => setTimeout(r, 700));
            }
            close(true);
          })
        }
      ]
    });
  }
}

function placeLabel(rank) {
  return { 1: "First", 2: "Second", 3: "Third" }[rank] || (rank + "th");
}

/**
 * Print one participant's certificate, found by chest number or name.
 *
 * The batch run is for producing everything at once; this is for the single
 * person who turns up afterwards. It prints their REAL results, unlike the
 * public template gallery, because staff are asking on their behalf.
 */
function singleDialog(design, published, typeName, tierName) {
  const search = input({ placeholder: "Chest number or name", autocomplete: "off" });
  const out = el("div");
  let found = null;

  const doSearch = guard(async () => {
    out.innerHTML = "";
    const term = search.value.trim().toLowerCase();
    if (!term) return;
    const [people, settings, houses, categories] = await Promise.all([
      getAll("participants"), getOne("config", "festSettings"),
      getAll("houses"), getAll("categories")
    ]);
    const matches = people.filter(p =>
      String(p.chestNumber ?? "").toLowerCase() === term ||
      String(p.name || "").toLowerCase().includes(term)).slice(0, 8);

    if (!matches.length) { out.appendChild(notice("warn", "Nobody matches that.")); return; }

    for (const p of matches) {
      const entries = [];
      for (const res of published) {
        for (const e of res.entries || []) {
          if ((e.participantIds || []).includes(p.id)) {
            entries.push({ res, e });
          }
        }
      }
      out.appendChild(el("div", { style: "display:flex;gap:.6rem;align-items:center;padding:.45rem 0;border-top:1px solid var(--line)" }, [
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", {}, [el("strong", { text: p.name }), " ",
            el("span.mono", { text: String(p.chestNumber ?? "") })]),
          el("div.hint", { style: "margin:0", text:
            `${p.houseName || ""} · ${p.categoryName || ""} · ${entries.length} published result${entries.length === 1 ? "" : "s"}` })
        ]),
        button("Print", { class: "btn-sm btn-accent", onclick: guard(async () => {
          const base = {
            fest: settings?.festName || "", school: settings?.schoolName || "",
            date: new Date().toLocaleDateString()
          };
          const first = entries[0];
          const html = renderPageHTML(design, {
            ...base,
            name: p.name, chest: p.chestNumber ?? "",
            house: houses.find(h => h.id === p.houseId)?.name || p.houseName || "",
            category: p.categoryName || "", class: p.className || "",
            photo: await resolvePrintPhoto(p),
            type: first ? (typeName[first.res.typeId] || "") : "",
            tier: first ? (tierName[first.res.tierId] || "") : "",
            event: first?.res.eventName || "",
            rank: first?.e.rank ? placeLabel(first.e.rank) : "",
            grade: first?.e.grade ? gradeLabel(first.e.grade, settings) : "",
            results: entries.map(({ res, e }) =>
              `${res.eventName} — ${e.isAbsent ? "Absent" : (e.rank ? placeLabel(e.rank) : "Participated")}` +
              (e.grade && !e.isAbsent ? ` (${gradeLabel(e.grade, settings)})` : "")).join("\n")
          });
          printDocument({
            title: p.name, bare: true, landscape: design.page.w > design.page.h,
            bodyHTML: `<style>.design-page{position:relative;overflow:hidden;}
              @page{size:${design.page.w}mm ${design.page.h}mm;margin:0;}
              body{margin:0;}</style>` + html
          });
        })})
      ]));
    }
  });

  search.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  modal({
    title: "Print one — " + (design.name || "design"),
    body: el("div", {}, [
      el("p.hint", { text: "Find a participant and print their certificate on its own. Uses their real published results." }),
      field("Search", search),
      el("div.btn-row", {}, button("Search", { onclick: doSearch })),
      out
    ]),
    actions: [{ label: "Close" }]
  });
}

/** The one distinct non-empty value, or "" when there is more than one. */
function soleValue(list) {
  const set = new Set((list || []).filter(Boolean));
  return set.size === 1 ? [...set][0] : "";
}

import { el, card, field, input, select, checkbox, button, table, toast, guard,
         notice, empty, toLocalInput, fromLocalInput, confirmDialog, modal, badge } from "../../lib/ui.js";
import { getOne, getAll, put, add, patch, remove, where } from "../../lib/db.js";
import { DEFAULTS, EVENT_CLASSES, POOL_LABEL, CHEST_FORMATS, CHEST_ALLOCATIONS,
         rankCountFromLadder, RESULT_POLICIES } from "../../domain/constants.js";
import { availableTieBreakers } from "../../domain/scoring.js";
import { queueRepublish } from "../../domain/republish.js";
import { detectZone, zoneList, describeZone, isValidZone } from "../../lib/timezone.js";
import { changeOwnPassword, validatePassword, deleteOwnAccount, session } from "../../lib/session.js";
import { wipeEverything } from "../../domain/reset.js";
import { compressImage, compressToBudget } from "../../lib/photo.js";
import { applyFestName, applyLogoScale } from "../../lib/shell.js";

const TABS = [
  ["basic",          "Fest details"],
  ["categories",     "Categories"],
  ["classification", "Type & Tier"],
  ["public",         "Public display"],
  ["points",         "Points & grades"],
  ["limits",         "Participant limits"],
  ["leaderboard",    "Leaderboard"],
  ["password",       "My password"],
  ["danger",         "Danger zone"]
];

export default async function settings(root, query = {}) {
  // The nav panel deep-links to a tab — /admin/settings?tab=categories.
  let tab = TABS.some(t => t[0] === query.tab) ? query.tab : "basic";
  root.appendChild(el("h1", { text: "Settings" }));
  // B3 — no in-page tab strip. The nav panel carries these tabs, and two
  // sets of identical tabs on one screen is the regression from 7.2.
  const tabs = el("div.tabs.nav-owned");
  const panel = el("div");
  TABS.forEach(([id, label]) => tabs.appendChild(button(label, {
    class: id === tab ? "active" : "", onclick: () => { tab = id; paint(); }
  })));
  root.append(tabs, panel);

  async function paint() {
    tabs.querySelectorAll("button").forEach((b, i) => b.className = TABS[i][0] === tab ? "active" : "");
    panel.innerHTML = "";
    const render = { basic: basicTab, categories: categoriesTab, classification: classificationTab,
                     public: publicTab, points: pointsTab,
                     limits: limitsTab, leaderboard: leaderboardTab, password: passwordTab,
                     danger: dangerTab }[tab];
    await render(panel);
  }
  await paint();
}

/* ── Fest details ──────────────────────────────────────────────────── */
async function basicTab(panel) {
  const s = { ...DEFAULTS.festSettings, ...(await getOne("config", "festSettings") || {}) };

  const festName  = input({ value: s.festName });
  const subtitle  = input({ value: s.subtitle || "" });
  const school    = input({ value: s.schoolName || "" });
  const scale     = input({ type: "number", min: 1, value: s.scoreScale });
  const aMin      = input({ type: "number", min: 0, max: 100, value: s.gradeThresholds.aMin });
  const bMin      = input({ type: "number", min: 0, max: 100, value: s.gradeThresholds.bMin });
  const cMin      = input({ type: "number", min: 0, max: 100, value: s.gradeThresholds.cMin });
  const regStart  = input({ type: "datetime-local", value: toLocalInput(s.registrationWindow?.start) });
  const regEnd    = input({ type: "datetime-local", value: toLocalInput(s.registrationWindow?.end) });

  let blind = !!s.blindJudgingDefault;
  let gradeless = !!s.gradelessDefault;
  let schedVisible = !!s.scheduleVisible;
  // I31 — the master switch for minimum entries per house. Most fests never
  // set minimums, and a field that is always blank is noise on the Events
  // screen, so the whole feature is opt-in.
  let useMinCaps = !!s.useMinEntryCaps;
  const resultPolicy = select(RESULT_POLICIES, { value: s.resultPolicy || "both" });
  let useLogo = !!s.useLogo;
  let logoData = s.logoData || null;

  let logoScale = Number(s.logoScale) || 100;

  /* The logo is shown against the dark top bar AND the light page, so the
   * preview shows both. A lockup with dark lettering vanishes on the top bar,
   * and there is no way to discover that from a single-background preview. */
  const previewImg = tone => el("img", {
    src: logoData || "", alt: "",
    style: `height:${Math.round(30 * logoScale / 100)}px;max-width:100%;object-fit:contain`
  });
  const darkImg = previewImg();
  const lightImg = previewImg();
  const heroImg = el("img", {
    src: logoData || "", alt: "",
    style: `height:${Math.round(92 * logoScale / 100)}px;max-width:100%;object-fit:contain`
  });

  const sizeNote = el("div.hint");
  const logoPreview = el("div", {
    style: "display:" + (logoData ? "block" : "none")
  }, [
    el("div.grid.grid-2", { style: "gap:.6rem" }, [
      el("div", {}, [
        el("div.hint", { text: "On the top bar" }),
        el("div", { style: "background:#14232E;padding:.5rem .7rem;border-radius:6px" }, darkImg)
      ]),
      el("div", {}, [
        el("div.hint", { text: "On a light page" }),
        el("div", { style: "background:#FFFFFF;border:1px solid var(--line);padding:.5rem .7rem;border-radius:6px" }, lightImg)
      ])
    ]),
    el("div", { style: "margin-top:.6rem" }, [
      el("div.hint", { text: "On the home page" }),
      el("div", { style: "background:var(--grad-hero,#14232E);padding:.7rem;border-radius:6px" }, heroImg)
    ]),
    sizeNote
  ]);

  const logoSize = select(
    [{ value: "75", label: "Small" }, { value: "100", label: "Medium (default)" },
     { value: "125", label: "Large" }, { value: "150", label: "Extra large" }],
    { value: String(logoScale) });
  logoSize.addEventListener("change", () => {
    logoScale = Number(logoSize.value) || 100;
    darkImg.style.height = lightImg.style.height = Math.round(30 * logoScale / 100) + "px";
    heroImg.style.height = Math.round(92 * logoScale / 100) + "px";
  });

  function showLogo() {
    for (const img of [darkImg, lightImg, heroImg]) img.src = logoData || "";
    logoPreview.style.display = logoData ? "block" : "none";
  }

  const logoFile = el("input", { type: "file", accept: "image/png,image/svg+xml,image/*", style: "display:none" });
  logoFile.addEventListener("change", guard(async () => {
    const f = logoFile.files?.[0];
    if (!f) return;
    /* I1 — a fest lockup is normally 3:1 or 5:1, not square, so it is
     * resampled on the long edge with transparency preserved.
     *
     * It is also held to a byte budget. logoData sits on config/festSettings
     * and Firestore rejects any document over 1 MiB; a full-width PNG lockup
     * exceeds that alone, and the save failed with nothing on screen saying
     * so — which is what "the logo upload does not work" was. */
    const { dataUrl, bytes, widthPx } = await compressToBudget(f, {
      maxPx: 900, budgetBytes: 400 * 1024, keepAlpha: true
    });
    logoData = dataUrl;
    showLogo();
    sizeNote.textContent = `Stored at ${widthPx}px wide, about ${Math.round(bytes / 1024)} KB.`;
    toast("Logo ready. Save settings to apply.");
  }));

  panel.appendChild(card(el("div", {}, [
    field("Fest name", festName),
    field("Subtitle", subtitle),
    field("School / college", school),
    field("Maximum score a judge can give", scale, "Percentages are calculated against this. 100 is typical."),
    el("fieldset", {}, [
      el("legend", { text: "Fest logo" }),
      el("div.hint", { text: "Upload a PNG of your fest typography to show instead of the plain text name, on the home page and top bar. A transparent PNG works best — it sits on both a dark bar and a light page." }),
      logoPreview,
      el("div.btn-row", { style: "margin:.6rem 0" }, [
        button("Upload logo", { class: "btn-sm", onclick: () => logoFile.click() }),
        button("Remove", { class: "btn-sm", onclick: () => {
          logoData = null; useLogo = false; showLogo(); sizeNote.textContent = "";
          toast("Logo removed. Save to apply.");
        }}),
        logoFile
      ]),
      field("Logo size", logoSize, "Scales it on the top bar and the home page."),
      checkbox("Show the logo instead of the fest name", useLogo, v => useLogo = v)
    ])
  ]), "Identity"));

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text: "One set of thresholds shared by all four event classes. A score above zero but below the C threshold is graded Without." }),
    el("div.grid.grid-3", {}, [
      field("A — at least (%)", aMin),
      field("B — at least (%)", bMin),
      field("C — at least (%)", cMin)
    ])
  ]), "Grade thresholds"));

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text: "The default window for every event. An individual event can override it." }),
    el("div.grid.grid-2", {}, [
      field("Registration opens", regStart),
      field("Registration deadline", regEnd)
    ])
  ]), "Registration window"));

  panel.appendChild(card(el("div", {}, [
    checkbox("Blind judging on by default (judges see code letters only)", blind, v => blind = v),
    checkbox("Schedule visible to the public", schedVisible, v => schedVisible = v),
    el("div.hint", { text: "While the schedule is hidden you can build and edit it privately." })
  ]), "Visibility"));

  panel.appendChild(card(el("div", {}, [
    field("How results are decided", resultPolicy,
      "Forcing a mode hides the per-event choice — there is no point offering one that is overridden."),
    checkbox("Rank only by default — new events award no grade points", gradeless, v => gradeless = v),
    el("div.hint", { text:
      "The grade is still worked out and shown; it is simply worth 0 points, so an event is decided by " +
      "rank alone. This sets what a NEW event starts as. Events that already exist keep their own setting, " +
      "because changing this must never quietly restate what an event was worth." }),
    checkbox("Use minimum entries per house", useMinCaps, v => useMinCaps = v),
    el("div.hint", { text:
      "Adds a minimum alongside the maximum on each event. Minimums never block a registration — " +
      "a house is below its minimum for most of the registration period. They decide when an event counts " +
      "as complete in the House Manager panel, and they appear in the compliance report. " +
      "With this off, an event counts as complete once a house has entered at least one participant." })
  ]), "Entry requirements"));

  panel.appendChild(el("div.btn-row", {}, button("Save settings", { class: "btn-accent", onclick: guard(async () => {
    const a = Number(aMin.value), b = Number(bMin.value), c = Number(cMin.value);
    if (!(a > b && b > c)) { toast("Thresholds must descend: A above B above C.", true); return; }
    await put("config", "festSettings", {
      festName: festName.value.trim() || "Our Fest",
      subtitle: subtitle.value.trim(),
      schoolName: school.value.trim(),
      scoreScale: Number(scale.value) || 100,
      gradeThresholds: { aMin: a, bMin: b, cMin: c },
      registrationWindow: { start: fromLocalInput(regStart.value), end: fromLocalInput(regEnd.value) },
      blindJudgingDefault: blind,
      gradelessDefault: gradeless,
      scheduleVisible: schedVisible,
      useMinEntryCaps: useMinCaps,
      resultPolicy: resultPolicy.value,
      logoData, useLogo: useLogo && !!logoData, logoScale
    });
    window.__FEST_LOGO__ = (useLogo && logoData) ? logoData : null;
    applyLogoScale(logoScale);
    applyFestName(festName.value.trim());
    queueRepublish({ schedule: true });
    toast("Settings saved.");
  })})));
}

/* ── Categories ────────────────────────────────────────────────────── */
async function categoriesTab(panel) {
  const rows = (await getAll("categories")).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const name = input({ placeholder: "e.g. Sub-Junior" });
  const order = input({ type: "number", value: rows.length + 1, style: "max-width:110px" });

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text: "Age or grade groupings. Category events belong to exactly one; general events are open to all." }),
    el("div.grid.grid-2", {}, [field("Category name", name), field("Sort order", order)]),
    el("div.btn-row", {}, button("Add category", { class: "btn-primary", onclick: guard(async () => {
      if (!name.value.trim()) return;
      await add("categories", { name: name.value.trim(), sortOrder: Number(order.value) || rows.length + 1 });
      toast("Category added."); categoriesTab(clearPanel(panel));
    })}))
  ]), "Add a category"));

  panel.appendChild(card(rows.length ? table([
    { key: "name", label: "Category" },
    { key: "sortOrder", label: "Order", num: true },
    { key: "act", label: "", render: r => el("div.btn-row", {}, [
        // I10 — a typo in a category name used to mean delete and recreate,
        // which orphaned every event and participant pointing at it.
        button("Edit", { class: "btn-sm", onclick: () => categoryDialog(r, panel) }),
        button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
          if (!await confirmDialog("Delete category", `Delete "${r.name}"? Events using it keep the reference and will show as blank.`, "Delete")) return;
          await remove("categories", r.id); toast("Deleted."); categoriesTab(clearPanel(panel));
        })})
      ])}
  ], rows) : empty("No categories yet"), "Categories"));
}

function categoryDialog(existing, panel) {
  const name  = input({ value: existing.name });
  const order = input({ type: "number", value: existing.sortOrder || 0, style: "max-width:110px" });

  modal({
    title: "Edit category",
    body: el("div", {}, [
      el("p.hint", { text: "Renaming is safe — events and participants keep pointing at this record, so nothing is orphaned." }),
      field("Category name", name),
      field("Sort order", order)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Name is required.", true); return false; }
          await patch("categories", existing.id, {
            name: name.value.trim(),
            sortOrder: Number(order.value) || 0
          });
          // The name is denormalised onto participants and result rows, so
          // the snapshots have to be rebuilt for the change to reach the
          // public pages.
          queueRepublish({ results: true });
          /* A policy change must reach events whose code letters are already out.
     * The mode is baked into judgingEntries when lettering happens, so
     * without this a judge keeps seeing score boxes on an event finalize
     * now treats as direct — they enter marks that are never read. */
    if (resultPolicy.value !== (s.resultPolicy || "both")) {
      const lettered = await getAll("judgingEntries").catch(() => []);
      if (lettered.length) {
        const { writeJudgingEntries } = await import("./registrations.js");
        const allEvents = await getAll("events");
        const byId = Object.fromEntries(allEvents.map(e => [e.id, e]));
        const fresh = { ...DEFAULTS.festSettings, ...(await getOne("config", "festSettings") || {}) };
        let touched = 0;
        for (const je of lettered) {
          const ev = byId[je.eventId];
          if (!ev) continue;
          const regs = await getAll("registrations", where("eventId", "==", je.eventId));
          const withLetters = regs.filter(r => r.codeLetter);
          if (!withLetters.length) continue;
          await writeJudgingEntries(ev, withLetters, fresh);
          touched++;
        }
        if (touched) toast(`Updated ${touched} event${touched === 1 ? "" : "s"} already given code letters.`);
      }
    }

    toast("Saved."); close(true); categoriesTab(clearPanel(panel));
        })
      }
    ]
  });
}

/* ── Type & Tier — v8 ───────────────────────────────────────────────
 * Two optional axes alongside Stage (which stays where it always was —
 * on the event form — because it drives the split-by-stage caps and is
 * load-bearing). Type and Tier are purely additive: filters everywhere,
 * plus an optional points source an event can name on the Events screen.
 */
async function classificationTab(panel) {
  const s = { ...DEFAULTS.festSettings, ...(await getOne("config", "festSettings") || {}) };
  let useTypeTier = !!s.useTypeTier;

  panel.appendChild(card(el("div", {}, [
    checkbox("Use Type and Tier classification", useTypeTier, guard(async v => {
      useTypeTier = v;
      await patch("config", "festSettings", { useTypeTier: v });
      toast(v ? "Type and Tier are now available on events." : "Type and Tier are hidden.");
    })),
    el("p.hint", { text:
      "Stage (on-stage / off-stage) is always available and lives on the event " +
      "form as before. Type (Speech, Song, Essay…) and Tier (Grade 1, Grade 2…) are " +
      "extra, optional axes — turn them on here, then list the values below. " +
      "They never affect points on their own; a fest that also wants to award " +
      "different points per axis does that in Points & grades, and each event then " +
      "picks its one point source." }
    )
  ]), "Classification axes"));

  if (!useTypeTier) return;

  typeTierList(panel, "programTypes", "Types",
    "e.g. Speech, Song, Essay, Language",
    "What kind of programme this is.");
  typeTierList(panel, "programTiers", "Tiers",
    "e.g. Grade 1, Grade 2",
    "Which bracket a programme sits in.");
}

function typeTierList(panel, collection, heading, placeholder, hint) {
  const box = el("div");
  panel.appendChild(box);
  paint();

  async function paint() {
    box.innerHTML = "";
    const rows = (await getAll(collection)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const name = input({ placeholder });
    const order = input({ type: "number", value: rows.length + 1, style: "max-width:110px" });

    box.appendChild(card(el("div", {}, [
      el("p.hint", { text: hint }),
      el("div.grid.grid-2", {}, [field("Name", name), field("Sort order", order)]),
      el("div.btn-row", {}, button("Add", { class: "btn-primary", onclick: guard(async () => {
        if (!name.value.trim()) return;
        await add(collection, { name: name.value.trim(), sortOrder: Number(order.value) || rows.length + 1 });
        toast("Added."); paint();
      })}))
    ]), "Add a " + heading.slice(0, -1).toLowerCase()));

    box.appendChild(card(rows.length ? table([
      { key: "name", label: heading.slice(0, -1) },
      { key: "sortOrder", label: "Order", num: true },
      { key: "act", label: "", render: r => el("div.btn-row", {}, [
          button("Edit", { class: "btn-sm", onclick: () => editDialog(r) }),
          button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Delete " + r.name,
              `Events using it keep the reference and will show as blank. Any ladder configured for it in Points & grades stops applying — those events fall back to their class ladder.`, "Delete")) return;
            await remove(collection, r.id); toast("Deleted."); paint();
          })})
        ])}
    ], rows) : empty("None yet"), heading));

    function editDialog(existing) {
      const nm = input({ value: existing.name });
      const ord = input({ type: "number", value: existing.sortOrder || 0, style: "max-width:110px" });
      modal({
        title: "Edit " + existing.name,
        body: el("div", {}, [field("Name", nm), field("Sort order", ord)]),
        actions: [
          { label: "Cancel" },
          { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
              if (!nm.value.trim()) { toast("Name is required.", true); return false; }
              await patch(collection, existing.id, { name: nm.value.trim(), sortOrder: Number(ord.value) || 0 });
              queueRepublish({ results: true });
              toast("Saved."); close(true); paint();
            })
          }
        ]
      });
    }
  }
}

/* ── Public display ────────────────────────────────────────────────── */
async function publicTab(panel) {
  const [settingsDoc, ...ladders] = await Promise.all([
    getOne("config", "festSettings"),
    ...EVENT_CLASSES.map(c => getOne("pointsConfig", c.id).catch(() => null))
  ]);
  const s = { ...DEFAULTS.festSettings, ...(settingsDoc || {}) };
  const derived = Math.max(0, ...ladders.filter(Boolean).map(l => rankCountFromLadder(l?.rankPoints)));

  const rankLimit = input({ type: "number", min: 0,
    value: s.publicRankLimit ?? "", placeholder: "follow the rank ladder" });
  const talentLimit = input({ type: "number", min: 0, value: s.talentBoardLimit ?? 10 });
  let showGrades = !!s.showGradesForUnranked;
  let freeText = !!s.publicTemplatesFreeText;

  const chestFormat = select(CHEST_FORMATS, { value: s.chestFormat || "digits" });
  const chestAlloc  = select(CHEST_ALLOCATIONS, { value: s.chestAllocation || "houseRange" });
  const allocBox = field("How digit numbers are handed out", chestAlloc);
  const formatWarn = el("div.hint", { style: "margin:.4rem 0 0" });

  function syncChest() {
    // Allocation modes only mean anything for digit-only numbers; the other
    // two formats are seeded per house from a typed example.
    allocBox.style.display = chestFormat.value === "digits" ? "" : "none";
    formatWarn.textContent = chestFormat.value === (s.chestFormat || "digits")
      ? ""
      : "Changing the format does NOT reissue chest numbers already given out — those are printed on bibs and written on judge sheets. The new format applies to participants added from now on.";
  }
  chestFormat.addEventListener("change", syncChest);

  // I4 / I2 — display limits.
  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text:
      "How many placements the public sees on the results page, the home feed, the big screen and the slideshow. " +
      "CSV and print exports always carry the full table, and staff screens always show everything." }),
    field("Ranks shown to the public", rankLimit,
      derived
        ? `Blank follows the rank ladder, which currently awards ${derived} place${derived === 1 ? "" : "s"}. Add a fourth rank with points and the public sees four automatically. 0 shows every placement.`
        : "Blank follows the rank ladder. 0 shows every placement."),
    field("Rows on the Student Talent board", talentLimit, "0 shows everyone."),
    checkbox("Let a participant see their grade even when they did not place", showGrades, v => showGrades = v),
    el("div.hint", { text:
      "With this off, a participant outside the ranked places sees only that they took part. " +
      "Their rank is never written to the public record either way, so it cannot be read out of the page." }),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:1rem 0" }),
    checkbox("Allow free text on public templates", !!s.publicTemplatesFreeText, v => freeText = v),
    el("div.hint", { text:
      "Public templates always let a visitor type a name. With this OFF (recommended), rank, grade and " +
      "event fields stay blank, so nobody can print a certificate claiming a placement they did not win. " +
      "Turning it on lets a visitor fill those in themselves." }),
  ]), "Results on public screens"));

  // I23 — chest number format.
  const tzSel = el("select", { class: "input" });
  for (const z of zoneList()) tzSel.appendChild(el("option", { value: z, text: z }));
  if (isValidZone(s.festTimeZone)) tzSel.value = s.festTimeZone;
  else if (detectZone()) tzSel.value = detectZone();

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text:
      "Schedule times are wall-clock times where the fest is held. Used to decide whether an event is " +
      "upcoming, ongoing or finished. Daylight saving is worked out per date, so a fest spanning a " +
      "clock change stays correct." }),
    el("p", { text: "Currently: " + describeZone(s.festTimeZone) }),
    field("Fest timezone", tzSel),
    el("div.btn-row", {}, button("Save timezone", { onclick: guard(async () => {
      await patch("config", "festSettings", { festTimeZone: tzSel.value || null });
      queueRepublish({ results: true });
      toast("Fest timezone set to " + tzSel.value + ".");
    })}))
  ]), "Fest timezone"));

  panel.appendChild(card(el("div", {}, [
    field("Chest number format", chestFormat),
    allocBox,
    formatWarn,
    el("div.hint", { text:
      "Digits only: numbers are assigned automatically, either from each house's range or from one shared sequence. " +
      "Alphanumerical and Alphabets only: add a house's first participant with the chest number typed in — for example RED-A01 — and every later one follows that pattern." })
  ]), "Chest numbers"));

  panel.appendChild(el("div.btn-row", {}, button("Save", { class: "btn-accent", onclick: guard(async () => {
    const rl = rankLimit.value.trim();
    await put("config", "festSettings", {
      publicRankLimit: rl === "" ? null : Math.max(0, Number(rl) || 0),
      talentBoardLimit: Math.max(0, Number(talentLimit.value) || 0),
      showGradesForUnranked: showGrades,
      publicTemplatesFreeText: freeText,
      chestFormat: chestFormat.value,
      chestAllocation: chestAlloc.value
    });
    // These feed the snapshots, so they only reach the public on a rebuild.
    queueRepublish({ results: true });
    toast("Saved. Public pages are updating.");
  })})));

  syncChest();
}

/* ── Points & grades ───────────────────────────────────────────────── */
async function pointsTab(panel) {
  const [gradePoints, settings, types, tiers] = await Promise.all([
    getOne("config", "gradePoints"), getOne("config", "festSettings"),
    getAll("programTypes"), getAll("programTiers")
  ]);
  const s = { ...DEFAULTS.festSettings, ...(settings || {}) };
  const gp = { ...DEFAULTS.gradePoints, ...(gradePoints || {}) };
  const th = s.gradeThresholds || DEFAULTS.festSettings.gradeThresholds;
  let axes = { ...DEFAULTS.festSettings.pointsAxes, ...(s.pointsAxes || {}) };

  const gpA = input({ type: "number", value: gp.A });
  const gpB = input({ type: "number", value: gp.B });
  const gpC = input({ type: "number", value: gp.C });

  panel.appendChild(card(el("div", {}, [
    checkbox("Award points by Event class", true, () => {}, { disabled: true }),
    el("p.hint", { text: "Always on — this is the ladder every event uses unless it names a different source below." }),
    checkbox("Award points by Stage (on-stage / off-stage)", axes.stage, v => { axes.stage = v; paintAxisTabs(); }),
    checkbox("Award points by Type", axes.type, v => { axes.type = v; paintAxisTabs(); },
      { disabled: !s.useTypeTier }),
    !s.useTypeTier ? el("p.hint", { text: "Turn on Type & Tier classification first, on the Type & Tier tab." }) : null,
    checkbox("Award points by Tier", axes.tier, v => { axes.tier = v; paintAxisTabs(); },
      { disabled: !s.useTypeTier }),
    notice("info",
      "These switches decide which axes CAN carry points. Nothing changes for an existing " +
      "event until you also set its \u201CPoints from\u201D on the Events screen — at a time, " +
      "one source only, no adding ladders together.")
  ]), "Award points by axis"));

  // One ladder per event class — unchanged from v7, always present, always
  // the fallback when a named axis has no ladder of its own.
  let cls = EVENT_CLASSES[0].id;
  const classLadders = {};
  for (const c of EVENT_CLASSES) {
    const doc = await getOne("pointsConfig", c.id);
    classLadders[c.id] = { rankPoints: { ...(doc?.rankPoints || DEFAULTS.rankPoints) } };
  }
  const classTabs = el("div.tabs");
  const classLadderBox = el("div");
  EVENT_CLASSES.forEach(c => classTabs.appendChild(button(c.label, {
    class: c.id === cls ? "active" : "", onclick: () => { cls = c.id; paintClassLadder(); }
  })));
  const preview = el("div.notice.notice-info");

  function paintClassLadder() {
    classTabs.querySelectorAll("button").forEach((b, i) =>
      b.className = EVENT_CLASSES[i].id === cls ? "active" : "");
    renderLadderEditor(classLadderBox, classLadders[cls], { allowOwnGrades: false }, updatePreview);
    updatePreview();
  }
  function updatePreview() {
    const first = classLadders[cls].rankPoints[1] ?? 0;
    preview.textContent =
      `Preview — ${EVENT_CLASSES.find(c => c.id === cls).label}, 1st place, grade A: ` +
      `${first} rank + ${Number(gpA.value) || 0} grade = ${first + (Number(gpA.value) || 0)} points`;
  }
  gpA.addEventListener("input", updatePreview);

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text: "Every event class has its own rank ladder. This is the fallback used whenever an event's named point source has no ladder of its own." }),
    classTabs, classLadderBox
  ]), "Rank points — by class"));

  // Stage / Type / Tier ladders — only shown for axes that are switched on.
  // Each may optionally define its own grade points; left off, it uses the
  // shared A/B/C table below (resolvePoints() in scoring.js is what reads
  // this exact fallback at finalize time).
  const axisBox = el("div");
  panel.appendChild(axisBox);

  const stageLadders = {
    onStage:  { rankPoints: { ...((await getOne("pointsConfig", "stage_onStage"))?.rankPoints || DEFAULTS.rankPoints) },
                gradePoints: (await getOne("pointsConfig", "stage_onStage"))?.gradePoints || null },
    offStage: { rankPoints: { ...((await getOne("pointsConfig", "stage_offStage"))?.rankPoints || DEFAULTS.rankPoints) },
                gradePoints: (await getOne("pointsConfig", "stage_offStage"))?.gradePoints || null }
  };
  const typeLadders = {};
  for (const t of types) {
    const doc = await getOne("pointsConfig", "type_" + t.id);
    typeLadders[t.id] = { rankPoints: { ...(doc?.rankPoints || DEFAULTS.rankPoints) }, gradePoints: doc?.gradePoints || null };
  }
  const tierLadders = {};
  for (const t of tiers) {
    const doc = await getOne("pointsConfig", "tier_" + t.id);
    tierLadders[t.id] = { rankPoints: { ...(doc?.rankPoints || DEFAULTS.rankPoints) }, gradePoints: doc?.gradePoints || null };
  }

  function paintAxisTabs() {
    axisBox.innerHTML = "";
    if (axes.stage) {
      axisBox.appendChild(axisLadderCard("Rank points — by Stage",
        [{ id: "onStage", label: "On stage" }, { id: "offStage", label: "Off stage" }], stageLadders, gp, th));
    }
    if (axes.type && s.useTypeTier) {
      if (!types.length) {
        axisBox.appendChild(notice("warn", "No Types have been added yet — add them on the Type & Tier tab."));
      } else {
        axisBox.appendChild(axisLadderCard("Rank points — by Type",
          types.map(t => ({ id: t.id, label: t.name })), typeLadders, gp, th));
      }
    }
    if (axes.tier && s.useTypeTier) {
      if (!tiers.length) {
        axisBox.appendChild(notice("warn", "No Tiers have been added yet — add them on the Type & Tier tab."));
      } else {
        axisBox.appendChild(axisLadderCard("Rank points — by Tier",
          tiers.map(t => ({ id: t.id, label: t.name })), tierLadders, gp, th));
      }
    }
  }

  panel.appendChild(card(el("div", {}, [
    el("div.grid.grid-3", {}, [
      field(`A (at least ${th.aMin}%)`, gpA),
      field(`B (at least ${th.bMin}%)`, gpB),
      field(`C (at least ${th.cMin}%)`, gpC)
    ]),
    notice("info", "Without is fixed at 0 grade points. An entry graded Without still keeps any rank points it earned. This table is the default for every ladder that does not define its own."),
    preview
  ]), "Grade points — shared default"));

  panel.appendChild(el("div.btn-row", {}, button("Save points", { class: "btn-accent", onclick: guard(async () => {
    for (const c of EVENT_CLASSES) await put("pointsConfig", c.id, { rankPoints: classLadders[c.id].rankPoints });
    if (axes.stage) {
      for (const [id, l] of Object.entries(stageLadders)) {
        await put("pointsConfig", "stage_" + id, ladderPayload(l));
      }
    }
    if (axes.type) for (const [id, l] of Object.entries(typeLadders)) await put("pointsConfig", "type_" + id, ladderPayload(l));
    if (axes.tier) for (const [id, l] of Object.entries(tierLadders)) await put("pointsConfig", "tier_" + id, ladderPayload(l));

    await put("config", "gradePoints", {
      A: Number(gpA.value) || 0, B: Number(gpB.value) || 0, C: Number(gpC.value) || 0, Without: 0
    });
    await patch("config", "festSettings", { pointsAxes: axes });
    queueRepublish({ results: true });
    toast("Points saved and standings rebuilt.");
  })})));

  paintClassLadder();
  paintAxisTabs();
}

function ladderPayload(l) {
  const out = { rankPoints: l.rankPoints };
  if (l.gradePoints) out.gradePoints = l.gradePoints;
  return out;
}

/** One ladder editor: ranks with point values, add/remove rank. Shared by
 * the class tabs and every stage/type/tier tab below. */
function renderLadderEditor(box, ladderState, opts, onChange) {
  box.innerHTML = "";
  const ranks = Object.keys(ladderState.rankPoints).map(Number).sort((a, b) => a - b);
  const grid = el("div.grid.grid-3");
  for (const r of ranks) {
    const inp = input({ type: "number", value: ladderState.rankPoints[r],
      oninput: e => { ladderState.rankPoints[r] = Number(e.target.value) || 0; onChange?.(); } });
    grid.appendChild(el("div", {}, [
      field(ordinal(r) + " place", inp),
      button("Remove", { class: "btn-sm", onclick: () => {
        delete ladderState.rankPoints[r]; renderLadderEditor(box, ladderState, opts, onChange); onChange?.();
      }})
    ]));
  }
  box.append(grid, el("div.btn-row", { style: "margin-top:.6rem" }, [
    button("+ Add rank", { onclick: () => {
      ladderState.rankPoints[(ranks.at(-1) || 0) + 1] = 0;
      renderLadderEditor(box, ladderState, opts, onChange); onChange?.();
    }})
  ]));
}

/** A tab strip across the values of one axis (Stage, or every configured
 * Type, or every configured Tier), each with its own ladder editor and an
 * optional own-grade-points override. */
function axisLadderCard(heading, values, laddersByValue, sharedGrade, thresholds) {
  let active = values[0]?.id;
  const tabs = el("div.tabs");
  const body = el("div");
  values.forEach(v => tabs.appendChild(button(v.label, {
    class: v.id === active ? "active" : "", onclick: () => { active = v.id; paint(); }
  })));

  function paint() {
    tabs.querySelectorAll("button").forEach((b, i) => b.className = values[i].id === active ? "active" : "");
    body.innerHTML = "";
    const state = laddersByValue[active];
    const ladderBox = el("div");
    body.appendChild(ladderBox);
    renderLadderEditor(ladderBox, state, {}, null);

    let ownGrades = !!state.gradePoints;
    const gA = input({ type: "number", value: state.gradePoints?.A ?? sharedGrade.A });
    const gB = input({ type: "number", value: state.gradePoints?.B ?? sharedGrade.B });
    const gC = input({ type: "number", value: state.gradePoints?.C ?? sharedGrade.C });
    const gradeGrid = el("div.grid.grid-3", { style: ownGrades ? "" : "display:none" }, [
      field(`A (${thresholds.aMin}%+)`, gA), field(`B (${thresholds.bMin}%+)`, gB), field(`C (${thresholds.cMin}%+)`, gC)
    ]);
    const toggle = checkbox(values.find(v => v.id === active).label + " uses its own grade points", ownGrades, v => {
      ownGrades = v;
      gradeGrid.style.display = v ? "" : "none";
      state.gradePoints = v ? { A: Number(gA.value) || 0, B: Number(gB.value) || 0, C: Number(gC.value) || 0, Without: 0 } : null;
    });
    [gA, gB, gC].forEach(i => i.addEventListener("input", () => {
      if (ownGrades) state.gradePoints = { A: Number(gA.value) || 0, B: Number(gB.value) || 0, C: Number(gC.value) || 0, Without: 0 };
    }));
    body.append(el("p.hint", { text: "Leave grade points off to use the shared A/B/C table below." }),
      toggle, gradeGrid);
  }
  paint();
  return card(el("div", {}, [tabs, body]), heading);
}

/* ── Participant limits ────────────────────────────────────────────── */
async function limitsTab(panel) {
  const [limDoc, categories, types, tiers, regs] = await Promise.all([
    getOne("config", "participantLimits"),
    getAll("categories"),
    getAll("programTypes").catch(() => []),
    getAll("programTiers").catch(() => []),
    getAll("registrations").catch(() => [])
  ]);
  const lim = { ...DEFAULTS.participantLimits, ...(limDoc || {}) };
  const settings = { ...DEFAULTS.festSettings, ...(await getOne("config", "festSettings") || {}) };
  const hasRegistrations = regs.length > 0;

  let perCategory = !!lim.perCategory;
  // Which cap set is being edited: "" = the shared default, or a category id.
  let editing = "";

  panel.appendChild(notice("info",
    "Leave a box blank for no limit. Maximums block a registration outright. Minimums never block — " +
    "they show up in the compliance report instead."));

  /* ── The two scopes, explained where they are configured ──────────
   * Class caps ask "how many Category Individual events?" and General
   * events sit outside that question entirely. Type/Tier caps ask "how
   * many Speech programmes, full stop?" and count everything the
   * participant enters, General included. Both are read from the
   * PARTICIPANT's own category. */
  panel.appendChild(card(el("div", {}, [
    checkbox("Different limits for each category", perCategory, v => {
      perCategory = v; paintScope(); paintEditor();
    }),
    el("div.hint", { text:
      "With this off, every participant shares one set of limits. With it on, a participant is measured " +
      "against their OWN category's limits — including in General events, which count towards the overall " +
      "limit but never towards a category's class limits." }),
    hasRegistrations
      ? notice("warn",
          "Registrations already exist. Changing limits that alter HOW entries are counted — turning " +
          "per-category on or off, changing \u201Csplit by stage\u201D, or switching Type/Tier limits on — " +
          "leaves existing counts filed under keys nothing reads any more. Save is blocked for those " +
          "changes until you run Recount, on the Participants screen.")
      : null
  ]), "Scope"));

  const scopeBar = el("div");
  const editorBox = el("div");
  panel.append(scopeBar, editorBox);

  function paintScope() {
    scopeBar.innerHTML = "";
    if (!perCategory) return;
    const tabs = el("div.tabs");
    const opts = [["", "Shared default"], ...categories.map(c => [c.id, c.name])];
    for (const [id, label] of opts) {
      tabs.appendChild(button(label + (id && lim.byCategory?.[id] ? " ✓" : ""), {
        class: id === editing ? "active" : "",
        onclick: () => { editing = id; paintScope(); paintEditor(); }
      }));
    }
    scopeBar.append(tabs, el("div.hint", { text: editing
      ? "Editing " + (categories.find(c => c.id === editing)?.name || "") +
        ". A category with its own limits uses them completely, not merged with the default."
      : "The default applies to any category with no limits of its own." }));
  }

  /** The cap set currently being edited. */
  function currentSet() {
    if (!perCategory || !editing) return lim;
    return lim.byCategory?.[editing] || {};
  }

  function paintEditor() {
    editorBox.innerHTML = "";
    const cur = currentSet();
    const refs = {};
    const num = (path, value) => {
      const i = input({ type: "number", min: 0, placeholder: "—", value: value ?? "" });
      refs[path] = i;
      return i;
    };

    editorBox.appendChild(card(el("div.grid.grid-2", {}, [
      field("Maximum events overall", num("overallMax", cur.overallMax)),
      field("Minimum events overall", num("overallMin", cur.overallMin))
    ]), "Overall total — counts every event, General included"));

    for (const cls of EVENT_CLASSES) {
      // General classes have no per-category cap: a General event only ever
      // touches the overall total.
      if (cls.general) continue;
      const cfg = cur[cls.id] || {};
      const splittable = cls.id === "categoryIndividual";
      const box = el("div");
      let split = !!cfg.splitByStage;

      const flat = el("div.grid.grid-2", {}, [
        field("Maximum", num(cls.id + ".max", cfg.max)),
        field("Minimum", num(cls.id + ".min", cfg.min))
      ]);
      const bystage = el("div.grid.grid-2", {}, [
        field("On-stage maximum",  num(cls.id + ".onStageMax",  cfg.onStageMax)),
        field("On-stage minimum",  num(cls.id + ".onStageMin",  cfg.onStageMin)),
        field("Off-stage maximum", num(cls.id + ".offStageMax", cfg.offStageMax)),
        field("Off-stage minimum", num(cls.id + ".offStageMin", cfg.offStageMin))
      ]);

      function paintCls() {
        box.innerHTML = "";
        if (splittable) box.appendChild(checkbox("Split by stage", split, v => { split = v; paintCls(); }));
        box.appendChild(split && splittable ? bystage : flat);
      }
      refs[cls.id + ".splitByStage"] = { get value() { return split; } };
      paintCls();
      editorBox.appendChild(card(box, cls.label));
    }

    editorBox.appendChild(el("p.hint", {
      text: "General Individual and General Group have no limits of their own — a General event counts only towards the overall total." }));

    // ── Type / Tier caps ─────────────────────────────────────────
    let useType = !!cur.useTypeCaps, useTier = !!cur.useTierCaps;
    const typeBox = el("div"), tierBox = el("div");

    const axisCaps = (box, list, caps, prefix) => {
      box.innerHTML = "";
      if (!list.length) {
        box.appendChild(el("div.hint", { text: "None defined yet — add them on the Type & Tier tab." }));
        return;
      }
      for (const t of list) {
        const c = caps?.[t.id] || {};
        box.appendChild(el("div.grid.grid-2", {}, [
          field(t.name + " maximum", num(prefix + t.id + ".max", c.max)),
          field(t.name + " minimum", num(prefix + t.id + ".min", c.min))
        ]));
      }
    };

    if (settings.useTypeTier) {
      editorBox.appendChild(card(el("div", {}, [
        checkbox("Limit how many of each Type a participant may enter", useType, v => {
          useType = v; typeBox.style.display = v ? "" : "none";
        }),
        el("div.hint", { text:
          "Counts EVERY programme of that Type the participant enters — including General ones. The limit " +
          "value comes from their own category, so Junior and Senior can allow different numbers." }),
        typeBox
      ]), "Type limits"));
      axisCaps(typeBox, types, cur.typeCaps, "typeCaps.");
      typeBox.style.display = useType ? "" : "none";

      editorBox.appendChild(card(el("div", {}, [
        checkbox("Limit how many of each Tier a participant may enter", useTier, v => {
          useTier = v; tierBox.style.display = v ? "" : "none";
        }),
        tierBox
      ]), "Tier limits"));
      axisCaps(tierBox, tiers, cur.tierCaps, "tierCaps.");
      tierBox.style.display = useTier ? "" : "none";
    }

    editorBox.appendChild(el("div.btn-row", {}, [
      button("Save limits", { class: "btn-accent", onclick: guard(async () => {
        const val = k => {
          const raw = refs[k]?.value;
          if (raw === "" || raw === undefined || raw === null) return null;
          const n = Number(raw);
          return isNaN(n) ? null : n;
        };

        const set = {
          overallMax: val("overallMax"), overallMin: val("overallMin"),
          useTypeCaps: useType, useTierCaps: useTier,
          typeCaps: {}, tierCaps: {}
        };
        for (const cls of EVENT_CLASSES) {
          if (cls.general) { set[cls.id] = {}; continue; }
          set[cls.id] = {
            splitByStage: !!refs[cls.id + ".splitByStage"]?.value,
            max: val(cls.id + ".max"), min: val(cls.id + ".min"),
            onStageMax: val(cls.id + ".onStageMax"), onStageMin: val(cls.id + ".onStageMin"),
            offStageMax: val(cls.id + ".offStageMax"), offStageMin: val(cls.id + ".offStageMin")
          };
        }
        for (const t of types) {
          const mx = val("typeCaps." + t.id + ".max"), mn = val("typeCaps." + t.id + ".min");
          if (mx !== null || mn !== null) set.typeCaps[t.id] = { max: mx, min: mn };
        }
        for (const t of tiers) {
          const mx = val("tierCaps." + t.id + ".max"), mn = val("tierCaps." + t.id + ".min");
          if (mx !== null || mn !== null) set.tierCaps[t.id] = { max: mx, min: mn };
        }

        /* COUNTING-SHAPE CHANGES ARE BLOCKED once registrations exist.
         * These alter which counter KEYS a registration writes to, so
         * existing counts would be filed under keys nothing reads any
         * more — a participant could then exceed a cap without the app
         * noticing. Recount rebuilds them; until then, refuse. */
        const before = currentSet();
        const shapeChanged =
          perCategory !== !!lim.perCategory ||
          !!before.useTypeCaps !== useType ||
          !!before.useTierCaps !== useTier ||
          EVENT_CLASSES.some(c => !c.general &&
            !!(before[c.id] || {}).splitByStage !== !!set[c.id].splitByStage);

        if (hasRegistrations && shapeChanged) {
          // A dead-end message is no help — link to the fix.
          editorBox.querySelector(".recount-block")?.remove();
          const block = notice("danger", el("div", { class: "recount-block" }, [
            el("strong", { text: "Not saved — this changes how entries are counted." }),
            el("div.hint", { style: "margin:.3rem 0", text:
              "Existing counts were recorded under the old scheme, so they would become unreadable and a " +
              "participant could exceed a cap without the app noticing. Recount rebuilds them from the " +
              "actual registrations, then this will save." }),
            el("div.btn-row", {},
              el("a.btn.btn-sm.btn-accent", { href: "#/admin/participants", text: "Go to Recount" }))
          ]));
          block.classList.add("recount-block");
          editorBox.appendChild(block);
          block.scrollIntoView({ behavior: "smooth", block: "nearest" });
          toast("Run Recount first — see the note below.", true);
          return;
        }

        const next = { ...lim, perCategory };
        if (perCategory && editing) {
          next.byCategory = { ...(lim.byCategory || {}), [editing]: set };
        } else {
          Object.assign(next, set);
          next.byCategory = lim.byCategory || {};
        }
        await put("config", "participantLimits", next, false);
        Object.assign(lim, next);
        toast("Limits saved.");
        paintScope();
      })}),
      (perCategory && editing && lim.byCategory?.[editing])
        ? button("Remove this category's limits", { class: "btn-danger", onclick: guard(async () => {
            if (!await confirmDialog("Remove limits",
              "This category will fall back to the shared default.", "Remove")) return;
            const next = { ...lim, byCategory: { ...(lim.byCategory || {}) } };
            delete next.byCategory[editing];
            await put("config", "participantLimits", next, false);
            Object.assign(lim, next);
            toast("Removed."); paintScope(); paintEditor();
          })})
        : null
    ]));
  }

  paintScope();
  paintEditor();
}

async function leaderboardTab(panel) {
  const cfg = { ...DEFAULTS.leaderboard, ...(await getOne("config", "leaderboard") || {}) };
  const state = { ...cfg };
  const tieBox = el("div");

  function paintTies() {
    tieBox.innerHTML = "";
    const options = availableTieBreakers(state);
    const order = (state.tieBreakOrder || []).filter(k => options.includes(k));
    for (const k of options) if (!order.includes(k)) order.push(k);
    state.tieBreakOrder = order;

    if (!order.length) {
      tieBox.appendChild(el("div.hint", { text: "All pools are counted in the score, so none are available as tiebreakers." }));
      return;
    }
    order.forEach((k, i) => {
      tieBox.appendChild(el("div.slot-row", {}, [
        el("span.mono", { text: String(i + 1) }),
        el("div.body", { text: POOL_LABEL[k] }),
        button("↑", { class: "btn-sm", disabled: i === 0, onclick: () => { swap(order, i, i - 1); paintTies(); } }),
        button("↓", { class: "btn-sm", disabled: i === order.length - 1, onclick: () => { swap(order, i, i + 1); paintTies(); } })
      ]));
    });
  }

  panel.appendChild(card(el("div", {}, [
    el("p.hint", { text: "The Student Talent leaderboard always counts Category Individual points. Add other pools here." }),
    checkbox("Also count Category Group points",     state.includeCategoryGroupPoints,     v => { state.includeCategoryGroupPoints = v; paintTies(); }),
    checkbox("Also count General Individual points", state.includeGeneralIndividualPoints, v => { state.includeGeneralIndividualPoints = v; paintTies(); }),
    checkbox("Also count General Group points",      state.includeGeneralGroupPoints,      v => { state.includeGeneralGroupPoints = v; paintTies(); }),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:1rem 0" }),
    checkbox("Show one ranking per category", state.splitByCategory, v => state.splitByCategory = v)
  ]), "What counts"));

  // v8 — the tiebreaker system is optional. Off, ties simply share the same
  // rank on the leaderboard, exactly like dense ranking anywhere else in the
  // app.
  let useTiebreakers = state.useTiebreakers !== false;
  const tieCard = card(el("div", {}, [
    el("p.hint", { text: "When two participants tie, these pools are compared in order until the tie breaks. Only pools left out of the score above can serve as tiebreakers." }),
    tieBox
  ]), "Tiebreakers");
  tieCard.style.display = useTiebreakers ? "" : "none";

  panel.appendChild(checkbox("Use tiebreakers", useTiebreakers, v => {
    useTiebreakers = v; state.useTiebreakers = v; tieCard.style.display = v ? "" : "none";
  }));
  panel.appendChild(tieCard);

  panel.appendChild(notice("warn", "House totals always count all four pools plus manual adjustments, regardless of these toggles."));

  panel.appendChild(el("div.btn-row", {}, button("Save and rebuild", { class: "btn-accent", onclick: guard(async () => {
    await put("config", "leaderboard", state, false);
    queueRepublish({ results: true });
    toast("Leaderboard rebuilt.");
  })})));

  paintTies();

  // v8 — additional named boards, each a filter over points already awarded.
  await customBoardsCard(panel);
}

/* ── Custom leaderboards — v8 ───────────────────────────────────────
 * Each board is a FILTER AND SORT over points already awarded. It never
 * recalculates, so a board can never disagree with the standings it is
 * drawn from. Boards rank participants; each row carries their house.
 */
async function customBoardsCard(panel) {
  const box = el("div");
  panel.appendChild(box);
  await paint();

  async function paint() {
    box.innerHTML = "";
    const [boards, types, tiers, categories] = await Promise.all([
      getAll("leaderboards").catch(() => []),
      getAll("programTypes").catch(() => []), getAll("programTiers").catch(() => []),
      getAll("categories")
    ]);

    box.appendChild(card(el("div", {}, [
      el("p.hint", { text:
        "Extra named boards — \u201cBest in Speech\u201d, \u201cGrade 1 champions\u201d. Each one re-tallies points " +
        "already awarded, so it always reconciles with the main standings. Mark a board public and it appears " +
        "as its own tab on the results page." }),
      el("div.btn-row", {}, button("Add leaderboard", { class: "btn-accent",
        onclick: () => boardDialog(null, { types, tiers, categories }, paint) })),
      boards.length ? table([
        { key: "name", label: "Name" },
        { key: "scope", label: "Counts", render: b => el("div.hint", { style: "margin:0", text: describeBoard(b, { types, tiers, categories }) }) },
        { key: "isPublic", label: "Public", render: b => b.isPublic ? badge("Public", "badge-ok") : badge("Staff only", "badge-warn") },
        { key: "act", label: "", render: b => el("div.btn-row", {}, [
            button("Edit", { class: "btn-sm", onclick: () => boardDialog(b, { types, tiers, categories }, paint) }),
            button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
              if (!await confirmDialog("Delete board", `Delete "${b.name}"?`, "Delete")) return;
              await remove("leaderboards", b.id);
              queueRepublish({ results: true });
              toast("Deleted."); paint();
            })})
          ])}
      ], boards.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)))
        : empty("No extra boards yet")
    ]), "Custom leaderboards"));
  }
}

function describeBoard(b, vocab) {
  const names = (ids, list) => (ids || []).map(id => list.find(x => x.id === id)?.name).filter(Boolean);
  const bits = [];
  if (b.stages?.length) bits.push(b.stages.map(s => s === "onStage" ? "On stage" : "Off stage").join(" / "));
  const t = names(b.typeIds, vocab.types); if (t.length) bits.push("Type: " + t.join(", "));
  const ti = names(b.tierIds, vocab.tiers); if (ti.length) bits.push("Tier: " + ti.join(", "));
  const c = names(b.categoryIds, vocab.categories); if (c.length) bits.push("Category: " + c.join(", "));
  return bits.length ? bits.join(" \u00b7 ") : "Every event";
}

function boardDialog(existing, vocab, refresh) {
  const name = input({ value: existing?.name || "", placeholder: "e.g. Best in Speech" });
  const order = input({ type: "number", value: existing?.sortOrder ?? 1, style: "max-width:110px" });
  let isPublic = !!existing?.isPublic;
  let limit = existing?.rowLimit ?? "";

  const pick = (label, options, selected) => {
    const chosen = new Set((selected || []).map(String));
    const row = el("div.chip-row");
    for (const o of options) {
      const b = button(o.label, { class: "chip" + (chosen.has(String(o.value)) ? " on" : ""), onclick: () => {
        chosen.has(String(o.value)) ? chosen.delete(String(o.value)) : chosen.add(String(o.value));
        b.classList.toggle("on");
      }});
      row.appendChild(b);
    }
    return { node: options.length ? el("div", {}, [el("h4", { text: label }), row]) : el("span"), get: () => [...chosen] };
  };

  const stages = pick("Stage", [{ value: "onStage", label: "On stage" }, { value: "offStage", label: "Off stage" }], existing?.stages);
  const types  = pick("Type", vocab.types.map(t => ({ value: t.id, label: t.name })), existing?.typeIds);
  const tiers  = pick("Tier", vocab.tiers.map(t => ({ value: t.id, label: t.name })), existing?.tierIds);
  const cats   = pick("Category", vocab.categories.map(c => ({ value: c.id, label: c.name })), existing?.categoryIds);
  const rowLimit = input({ type: "number", min: 0, value: limit, placeholder: "blank = use the main setting" });

  // Ticking events by hand overrides the axes entirely — see
  // boardMatchesEvent(). Loaded lazily so the dialog opens instantly.
  const eventBox = el("div.chip-row");
  const chosenEvents = new Set((existing?.eventIds || []).map(String));
  getAll("events").then(evs => {
    eventBox.innerHTML = "";
    for (const e of evs.sort((a, b) => String(a.code).localeCompare(String(b.code)))) {
      const b = button([e.code, e.name].filter(Boolean).join(" "), {
        class: "chip" + (chosenEvents.has(String(e.id)) ? " on" : ""),
        onclick: () => {
          chosenEvents.has(String(e.id)) ? chosenEvents.delete(String(e.id)) : chosenEvents.add(String(e.id));
          b.classList.toggle("on");
          axisNote.style.display = chosenEvents.size ? "" : "none";
        }
      });
      eventBox.appendChild(b);
    }
  }).catch(() => {});
  const axisNote = el("div.notice.notice-warn", {
    text: "Specific events are ticked, so the axis filters above are ignored — the board counts exactly those events.",
    style: chosenEvents.size ? "" : "display:none"
  });

  modal({
    title: existing ? "Edit leaderboard" : "Add leaderboard",
    body: el("div", {}, [
      field("Board name", name, "Shown as the tab title."),
      el("p.hint", { text: "Select nothing on an axis to include everything on it. Selections across axes combine — Type: Speech AND Tier: Grade 1 means events that are both." }),
      stages.node, types.node, tiers.node, cats.node,
      el("details", {}, [
        el("summary", { text: "Or pick individual events" }),
        el("div.hint", { text: "Ticking any event here replaces the axis filters above." }),
        eventBox, axisNote
      ]),
      el("div.grid.grid-2", {}, [field("Sort order", order), field("Rows to show", rowLimit)]),
      checkbox("Show this board on the public results page", isPublic, v => isPublic = v)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Give the board a name.", true); return false; }
          const data = {
            name: name.value.trim(),
            stages: stages.get(), typeIds: types.get(), tierIds: tiers.get(),
            categoryIds: cats.get(), classIds: [],
            eventIds: [...chosenEvents],
            isPublic, sortOrder: Number(order.value) || 0,
            rowLimit: rowLimit.value === "" ? null : (Number(rowLimit.value) || 0)
          };
          if (existing) await patch("leaderboards", existing.id, data);
          else await add("leaderboards", data);
          queueRepublish({ results: true });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

/* ── Danger zone ───────────────────────────────────────────────────── */
async function dangerTab(panel) {
  const settings = await getOne("config", "festSettings");
  const festName = settings?.festName || "this fest";
  const guardDoc = await getOne("guard", "deleteGuard");

  // Fests created before v8 have no guard set. Offer to add one rather
  // than silently skip the check — but don't force it: a fest already
  // mid-run should not be blocked from resetting because of a feature
  // that postdates it.
  if (!guardDoc) {
    panel.appendChild(card(el("div", {}, [
      el("p", { text: "This fest has no delete-everything password yet. Set one now, or skip and use just your Admin password as before." }),
      guardSetupBox(panel)
    ]), "Delete-everything password"));
  }

  panel.appendChild(notice("danger",
    `This permanently deletes every event, participant, registration, score and result. There is no undo and no backup — this is not a "hide" or "archive", the data is gone.`));

  panel.appendChild(card(el("div", {}, [
    el("p", { text: "What this does, exactly:" }),
    el("ul", {}, [
      "Deletes all events, participants, registrations, scores, results and published pages",
      "Deletes the schedule and every venue",
      "Revokes every House, Judge and Co-Admin account — they can no longer log in",
      "Deletes your own Admin login too, and signs you out",
      "Sends you back to the first-run Set up your fest screen"
    ].map(t => el("li", { text: t }))),
    el("p.hint", {
      text: "One limitation worth knowing: revoked House, Judge and Co-Admin logins are disabled immediately, but the underlying account entries still show up under Firebase console → Authentication until you delete them there by hand. They cannot sign in to anything once this finishes — they are just not swept away automatically. The browser is only ever allowed to delete the account currently signed in, which is why your own Admin login can be removed completely but theirs cannot."
    })
  ]), "What resetting does"));

  const nameCheck = input({ placeholder: festName });
  const pw = input({ type: "password", autocomplete: "current-password" });
  const guardPw = input({ type: "password", autocomplete: "off" });
  const status = el("div");
  const goBtn = button("Delete everything and start over", { class: "btn-danger", disabled: true });

  const checkReady = () => {
    goBtn.disabled = nameCheck.value.trim() !== festName || !pw.value || (!!guardDoc && !guardPw.value);
  };
  nameCheck.addEventListener("input", checkReady);
  pw.addEventListener("input", checkReady);
  guardPw.addEventListener("input", checkReady);

  goBtn.addEventListener("click", guard(async () => {
    // v8 — the delete guard. Checked client-side, which is honestly stated
    // in the setup screen as a safety catch rather than real protection
    // against someone already signed in as Admin and willing to bypass a
    // browser-side check.
    if (guardDoc) {
      const { verifyGuardPassword } = await import("../../lib/crypto.js");
      const ok = await verifyGuardPassword(guardPw.value, guardDoc);
      if (!ok) { status.innerHTML = ""; status.appendChild(notice("danger", "That delete-everything password is not correct.")); return; }
    }

    const ok2 = await confirmDialog(
      "This cannot be undone",
      `You are about to permanently delete everything in "${festName}", including your own Admin login. Type-to-confirm has already matched. This is the last check before it happens.`,
      "Yes, delete everything"
    );
    if (!ok2) return;

    goBtn.disabled = true;
    status.innerHTML = "";
    const progress = el("div.hint", { text: "Starting…" });
    status.appendChild(progress);

    try {
      await wipeEverything({
        currentUid: session.user.uid,
        currentSlug: "admin",   // the only account that can ever hold the "admin" role
        onProgress: msg => { progress.textContent = msg; }
      });
      // The guard doc is Admin-only to read or write, so it must go BEFORE
      // deleteOwnAccount signs the Admin out — after that, this write would
      // fail against the rules.
      await remove("guard", "deleteGuard").catch(() => {});
      progress.textContent = "Removing your login…";
      await deleteOwnAccount(pw.value);
      toast("Everything has been deleted.");
      location.reload();   // re-run boot() so it re-detects that no fest exists
    } catch (err) {
      goBtn.disabled = false;
      status.innerHTML = "";
      throw err;
    }
  }));

  panel.appendChild(card(el("div", {}, [
    field(`Type the fest name to confirm — "${festName}"`, nameCheck),
    field("Your current password", pw, "Needed to remove your own login."),
    guardDoc ? field("Delete-everything password", guardPw, "The separate password set for this action.") : null,
    status,
    el("div.btn-row", {}, goBtn)
  ]), "Confirm"));

  if (guardDoc) {
    panel.appendChild(card(el("div", {}, [
      el("p.hint", { text: "Changing this needs the current delete-everything password." }),
      guardChangeBox(guardDoc)
    ]), "Change the delete-everything password"));
  }
}

function guardSetupBox(panel) {
  const p1 = input({ type: "password", autocomplete: "new-password" });
  const p2 = input({ type: "password", autocomplete: "new-password" });
  return el("div", {}, [
    field("New delete-everything password", p1),
    field("Confirm", p2),
    el("div.btn-row", {}, button("Set password", { class: "btn-accent", onclick: guard(async () => {
      const err = validatePassword(p1.value, p2.value);
      if (err) { toast(err, true); return; }
      const { hashGuardPassword } = await import("../../lib/crypto.js");
      const doc = await hashGuardPassword(p1.value);
      await put("guard", "deleteGuard", doc);
      await patch("config", "festSettings", { hasDeleteGuard: true });
      toast("Delete-everything password set.");
      dangerTab(clearPanel(panel));
    })}))
  ]);
}

function guardChangeBox(guardDoc) {
  const current = input({ type: "password", autocomplete: "off" });
  const p1 = input({ type: "password", autocomplete: "new-password" });
  const p2 = input({ type: "password", autocomplete: "new-password" });
  return el("div", {}, [
    field("Current delete-everything password", current),
    field("New password", p1),
    field("Confirm new password", p2),
    el("div.btn-row", {}, button("Change password", { class: "btn-accent", onclick: guard(async () => {
      const { verifyGuardPassword, hashGuardPassword } = await import("../../lib/crypto.js");
      const ok = await verifyGuardPassword(current.value, guardDoc);
      if (!ok) { toast("Current password is not correct.", true); return; }
      const err = validatePassword(p1.value, p2.value);
      if (err) { toast(err, true); return; }
      const doc = await hashGuardPassword(p1.value);
      await put("guard", "deleteGuard", doc);
      toast("Changed.");
    })}))
  ]);
}


async function passwordTab(panel) {
  const cur = input({ type: "password", autocomplete: "current-password" });
  const nw  = input({ type: "password", autocomplete: "new-password" });
  const nw2 = input({ type: "password", autocomplete: "new-password" });

  panel.appendChild(card(el("div", {}, [
    field("Current password", cur),
    field("New password", nw, "Between 3 and 8 characters."),
    field("Confirm new password", nw2),
    el("div.btn-row", {}, button("Change password", { class: "btn-accent", onclick: guard(async () => {
      const err = validatePassword(nw.value, nw2.value);
      if (err) { toast(err, true); return; }
      await changeOwnPassword(cur.value, nw.value);
      cur.value = nw.value = nw2.value = "";
      toast("Password changed.");
    })}))
  ]), "Change my password"));

  panel.appendChild(notice("warn",
    "There is no email recovery. If the Admin password is lost, reset it from Firebase console → Authentication → the admin user → Reset password."));
}

function swap(arr, i, j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function clearPanel(p) { p.innerHTML = ""; return p; }

import { el, card, field, input, select, button, table, toast, guard, notice, empty,
         modal, confirmDialog, badge, debounce, photoPicker, loading, checkbox } from "../../lib/ui.js";
import { getAll, getOne, add, patch, remove, put, where, batchWrite } from "../../lib/db.js";
import { parseCSVObjects, readFile, toCSV, downloadText } from "../../lib/csv.js";
import { resolvePhotoLink, PHOTO_HELP, avatar } from "../../lib/photo.js";
import { allocateChest, allocateChestNumber, takenChestNumbers, readChestCounter,
         raiseChestCounter, chestSortKey, normalizeChest, compareChest,
         seedFromValue, hasRange } from "../../domain/chest.js";
import { GENDERS, LEGACY_GENDERS, DEFAULTS } from "../../domain/constants.js";
import { chestCardHTML, CARDS_PER_SHEET } from "../../domain/chestcards.js";
import { recountParticipant } from "../../domain/limits.js";
import { printDocument } from "../../lib/pdf.js";

export default async function participants(root) {
  root.appendChild(el("h1", { text: "Participants" }));
  const panel = el("div");
  root.appendChild(panel);

  let filterHouse = "", search = "";
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading participants…"));
    const [rows, houses, categories, settingsDoc] = await Promise.all([
      getAll("participants"), getAll("houses"), getAll("categories"),
      getOne("config", "festSettings")
    ]);
    const cfg = { ...DEFAULTS.festSettings, ...(settingsDoc || {}) };
    panel.innerHTML = "";

    const houseName = Object.fromEntries(houses.map(h => [h.id, h.name]));
    const catName   = Object.fromEntries(categories.map(c => [c.id, c.name]));

    if (!categories.length) {
      panel.appendChild(notice("warn",
        "Add at least one category under Settings → Categories first. Every participant must belong to one."));
    }
    if (!houses.length) {
      panel.appendChild(notice("warn", "Create houses under Accounts before adding participants."));
      return;
    }

    // I27 — gender is binary from v7. Records holding the old value are
    // listed rather than rewritten: quietly changing someone's recorded
    // gender is not a migration this app should perform on its own.
    const legacyGender = rows.filter(r => LEGACY_GENDERS.includes(r.gender));
    if (legacyGender.length) {
      panel.appendChild(notice("warn",
        legacyGender.length + " participant" + (legacyGender.length > 1 ? "s have" : " has") +
        " a gender value that is no longer offered: " +
        legacyGender.slice(0, 5).map(r => r.name).join(", ") +
        (legacyGender.length > 5 ? "…" : "") + ". Edit them to set it, or leave it blank."));
    }

    const houseFilter = select([{ value: "", label: "All houses" },
      ...houses.map(h => ({ value: h.id, label: h.name }))], { value: filterHouse });
    houseFilter.addEventListener("change", () => { filterHouse = houseFilter.value; paint(); });

    const searchBox = input({ placeholder: "Search name or chest number", value: search });
    searchBox.addEventListener("input", debounce(() => { search = searchBox.value; paintTable(); }, 250));

    panel.appendChild(card(el("div", {}, [
      el("div.btn-row", { style: "margin-bottom:.8rem" }, [
        button("Add participant", { class: "btn-accent",
          disabled: !categories.length,
          onclick: () => participantDialog(null, houses, categories, cfg, paint) }),
        button("Import CSV", { disabled: !categories.length,
          onclick: () => importDialog(houses, categories, cfg, paint) }),
        // v8 — printable chest number cards, several per sheet.
        button("Chest number cards", { disabled: !rows.length,
          onclick: () => chestCardDialog(rows, houses, cfg) }),
        // The repair behind every counting-shape change.
        // Never disabled: Settings sends people here when a save is blocked,
        // and arriving at a greyed-out button explains nothing.
        button("Recount limits", { onclick: () => recountDialog(rows, paint) }),
        button("Download template", { onclick: () => downloadText("participants-template.csv", toCSV([
          { label: "chestNumber", key: "chest" }, { label: "name", key: "name" }, { label: "house", key: "house" },
          { label: "category", key: "category" }, { label: "class", key: "cls" },
          { label: "gender", key: "gender" }, { label: "photoUrl", key: "photo" }
        ], [{ chest: "", name: "Ann Mary", house: "Falcons", category: "Junior", cls: "8A", gender: "female", photo: "" },
            { chest: "250", name: "Rahul K", house: "Eagles", category: "Senior", cls: "11B", gender: "male", photo: "" }])) }),
        button("Export CSV", { onclick: () => downloadText("participants.csv", toCSV([
          { label: "Chest", key: "chestNumber" }, { label: "Name", key: "name" },
          { label: "House", value: r => houseName[r.houseId] || "" },
          { label: "Category", value: r => catName[r.categoryId] || "" },
          { label: "Class", key: "className" }, { label: "Gender", key: "gender" }
        ], rows)) })
      ]),
      el("div.grid.grid-2", {}, [field("House", houseFilter), field("Search", searchBox)])
    ]), rows.length + " participants"));

    const tableBox = el("div");
    panel.appendChild(tableBox);
    paintTable();

    function paintTable() {
      const term = search.trim().toLowerCase();
      const list = rows
        .filter(r => !filterHouse || r.houseId === filterHouse)
        .filter(r => !term || String(r.name).toLowerCase().includes(term)
          || String(r.chestNumber ?? "").toLowerCase().includes(term))
        .sort((a, b) => compareChest(a.chestNumber, b.chestNumber));

      tableBox.innerHTML = "";
      if (!list.length) { tableBox.appendChild(empty("No participants match")); return; }
      tableBox.appendChild(card(table([
        { key: "photo", label: "", render: r => avatar(r, 38) },
        { key: "chestNumber", label: "Chest", render: r => el("span.mono", { text: String(r.chestNumber ?? "") }) },
        { key: "name", label: "Name" },
        { key: "houseId", label: "House", render: r => houseName[r.houseId] || "—" },
        { key: "categoryId", label: "Category", render: r => catName[r.categoryId] || "—" },
        { key: "className", label: "Class" },
        { key: "gender", label: "Gender", render: r => r.gender
            ? (GENDERS.find(g => g.value === r.gender)?.label || r.gender) : "—" },
        { key: "act", label: "", render: r => el("div.btn-row", {}, [
            button("Edit", { class: "btn-sm", onclick: () => participantDialog(r, houses, categories, cfg, paint) }),
            button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
              if (!await confirmDialog("Delete participant", "Delete " + r.name + "? Their registrations are not removed automatically.", "Delete")) return;
              await remove("participants", r.id); toast("Deleted."); paint();
            })})
          ])}
      ], list)));
    }
  }
}

function participantDialog(existing, houses, categories, cfg, refresh) {
  const seeded = cfg.chestFormat !== "digits";
  const name  = input({ value: existing?.name || "" });
  const chest = input({
    // Chest numbers are strings in every format now (ARCHITECTURE 5.7), so
    // this is a text field even when the fest is digits-only.
    value: existing?.chestNumber ?? "",
    placeholder: seeded ? "e.g. RED-A01" : "Leave blank to auto-assign"
  });
  const house = select(houses.map(h => ({ value: h.id, label: h.name })), { value: existing?.houseId || houses[0]?.id });
  const cat   = select([{ value: "", label: "— choose —" },
    ...categories.map(c => ({ value: c.id, label: c.name }))], { value: existing?.categoryId || "" });
  const cls   = input({ value: existing?.className || "", placeholder: "e.g. 9B" });
  const gender = select(GENDERS, { value: GENDERS.some(g => g.value === existing?.gender) ? existing.gender : "" });
  const picker = photoPicker(existing || {});
  const rangeHint = el("div.hint", { style: "margin:0" });

  function showRange() {
    const h = houses.find(x => x.id === house.value);
    if (seeded) {
      rangeHint.textContent = h?.chestSeed
        ? `${h.name} uses the pattern ${h.chestSeed}. Leave the box blank to take the next one.`
        : `${h?.name || "This house"} has no pattern yet — type this participant's chest number and every later one follows it.`;
    } else if (cfg.chestAllocation !== "houseRange") {
      rangeHint.textContent = "This fest uses one shared chest number sequence.";
    } else if (hasRange(h)) {
      rangeHint.textContent = `${h.name} owns chest numbers ${h.chestRangeStart}–${h.chestRangeEnd}.`;
    } else {
      rangeHint.textContent = "This house has no chest range, so the shared sequence is used.";
    }
  }
  house.addEventListener("change", showRange);
  showRange();

  modal({
    title: existing ? "Edit participant" : "Add participant",
    body: el("div", {}, [
      field("Name", name),
      field("House", house),
      rangeHint,
      field("Chest number", chest, seeded
        ? "Blank takes the next number in this house's pattern."
        : "Blank means the next free number is assigned automatically."),
      field("Category", cat, "Required — category events are restricted by it."),
      el("div.grid.grid-2", {}, [field("Class / grade", cls), field("Gender (optional)", gender)]),
      el("label.field", {}, [el("span", { text: "Photo" }), picker.node,
        el("div.hint", { text: PHOTO_HELP })])
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Name is required.", true); return false; }
          if (!house.value) { toast("Choose a house.", true); return false; }
          if (!cat.value) { toast("Category is required.", true); return false; }

          const theHouse = houses.find(h => h.id === house.value);
          const taken = await takenChestNumbers();
          if (existing) taken.delete(normalizeChest(existing.chestNumber));

          let chestNumber;
          try {
            // I28 — allocateChest refuses an explicit number that belongs to
            // another house's range or pattern, not just one already taken.
            chestNumber = await allocateChestNumber({
              explicit: chest.value.trim() === "" ? null : chest.value.trim(),
              house: theHouse, houses, settings: cfg, taken
            });
          } catch (err) { toast(err.message, true); return false; }

          // "Add one participant manually then the app can auto-assign in
          // its pattern" — this is where the pattern gets learned.
          const seed = seedFromValue(theHouse, chestNumber, cfg);
          if (seed) await patch("houses", theHouse.id, { chestSeed: seed });

          const data = {
            name: name.value.trim(),
            nameLower: name.value.trim().toLowerCase(),
            chestNumber,
            chestSort: chestSortKey(chestNumber),
            houseId: house.value,
            houseName: theHouse?.name || "",
            categoryId: cat.value,
            categoryName: categories.find(c => c.id === cat.value)?.name || "",
            className: cls.value.trim(),
            gender: gender.value || null,
            ...picker.getValue()
          };
          if (existing) await patch("participants", existing.id, data);
          else await add("participants", { ...data, eventCounts: { overall: 0 } });
          toast("Saved."); close(true); refresh();
        })
      }
    ]
  });
}

function importDialog(houses, categories, cfg, refresh) {
  const file = el("input", { type: "file", accept: ".csv,text/csv" });
  const out  = el("div");
  const progress = el("div.hint", { style: "margin:.4rem 0 0" });

  modal({
    title: "Import participants from CSV",
    body: el("div", {}, [
      el("p.hint", { text: "Columns: chestNumber, name, house, category, class, gender, photoUrl. Name, house and category are required. Blank chest numbers follow the house's range or pattern, otherwise the shared sequence." }),
      field("CSV file", file),
      progress,
      out
    ]),
    actions: [
      { label: "Close" },
      { label: "Import", kind: "accent", closes: false, busyLabel: "Importing…", onClick: guard(async close => {
          if (!file.files?.length) { toast("Choose a file first.", true); return false; }
          const { rows } = parseCSVObjects(await readFile(file.files[0]));
          const houseByName = Object.fromEntries(houses.map(h => [h.name.toLowerCase(), h]));
          const houseByCode = Object.fromEntries(houses.filter(h => h.code).map(h => [h.code.toLowerCase(), h]));
          const catByName   = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c]));

          /* ── I29 — THE IMPORT PERFORMANCE FIX ──────────────────────
           * v6 ran one Firestore transaction per row while staging (each
           * allocateChestNumber call hit nextCounter/raiseCounter) and then
           * one sequential write per row to commit. A 300-row import was
           * about 600 round trips — minutes on school wifi.
           *
           * Now: read the counter ONCE, allocate every number in memory,
           * commit through batchWrite (chunks of 400), and raise the stored
           * counter ONCE at the end. 300 rows becomes two round trips.
           */
          progress.textContent = "Reading existing chest numbers…";
          const [taken, startCounter] = await Promise.all([
            takenChestNumbers(), readChestCounter()
          ]);

          let counter = startCounter;
          const seeds = {};                 // houseId → newly learned pattern
          const localHouses = houses.map(h => ({ ...h }));
          const staged = [], errors = [];

          for (const [i, r] of rows.entries()) {
            const rowNo = i + 2;
            if (!r.name) { errors.push("Row " + rowNo + ": missing name."); continue; }
            const key = (r.house || "").toLowerCase();
            const h = houseByName[key] || houseByCode[key];
            if (!h) { errors.push("Row " + rowNo + ': unknown house "' + r.house + '".'); continue; }
            const c = catByName[(r.category || "").toLowerCase()];
            if (!c) { errors.push("Row " + rowNo + ': category is required and "' + (r.category || "") + '" was not found.'); continue; }

            const liveHouse = localHouses.find(x => x.id === h.id);
            let chestNumber;
            try {
              const res = allocateChest({
                explicit: (r.chestnumber || "").trim() || null,
                house: liveHouse, houses: localHouses, settings: cfg, taken, counter
              });
              chestNumber = res.value;
              counter = res.counter;
            } catch (err) { errors.push("Row " + rowNo + ": " + err.message); continue; }

            taken.add(normalizeChest(chestNumber));

            // A pattern learned mid-import applies to the rest of the file.
            const seed = seedFromValue(liveHouse, chestNumber, cfg);
            if (seed) { liveHouse.chestSeed = seed; seeds[liveHouse.id] = seed; }

            const photo = resolvePhotoLink(r.photourl);
            const g = (r.gender || "").toLowerCase();
            staged.push({
              chestNumber,
              chestSort: chestSortKey(chestNumber),
              name: r.name, nameLower: r.name.toLowerCase(),
              houseId: h.id, houseName: h.name,
              categoryId: c.id, categoryName: c.name,
              className: r.class || "",
              // I27 — binary only.
              gender: ["male", "female"].includes(g) ? g : null,
              photoData: null,
              photoURL: photo.photoURL, photoSource: photo.photoSource,
              photoOriginalLink: photo.photoOriginalLink, photoLinkUnverified: !!photo.photoLinkUnverified,
              eventCounts: { overall: 0 }
            });
          }

          out.innerHTML = "";
          if (!staged.length) {
            out.appendChild(notice("danger", el("div", {}, [
              el("strong", { text: "Nothing to import." }),
              el("ul", {}, errors.map(e => el("li", { text: e })))
            ])));
            return false;
          }

          progress.textContent = `Writing ${staged.length} participants…`;
          await batchWrite(staged.map(p => ({
            type: "set", path: "participants", id: crypto.randomUUID(), data: p, merge: false
          })));

          if (counter > startCounter) await raiseChestCounter(counter);
          for (const [houseId, seed] of Object.entries(seeds)) {
            await patch("houses", houseId, { chestSeed: seed });
          }

          progress.textContent = "";

          /* A partly-successful import must not close.
           *
           * Skipped rows were being listed in this dialog and then closed
           * half a second later by close(true), while the toast reported
           * only the rows that worked. From the Admin's side a row had
           * simply vanished with no reason given. A partial import now
           * holds the dialog open until the skipped rows have been read. */
          if (errors.length) {
            refresh();
            out.appendChild(notice("warn", el("div", {}, [
              el("strong", { text: `Imported ${staged.length}. Skipped ${errors.length}.` }),
              el("ul", {}, errors.map(e => el("li", { text: e }))),
              el("div.hint", { text: "Fix these rows in the file and import them again — the rows above were not added." })
            ])));
            toast(`Imported ${staged.length}, skipped ${errors.length}.`, true);
            return false;
          }

          toast("Imported " + staged.length + " participants.");
          close(true); refresh();
        })
      }
    ]
  });
}

/**
 * Chest number / ID cards — v8.
 *
 * Several per sheet, because one per page is 600 sheets for a fest this
 * size. Available as soon as participants exist; it does not wait for
 * results, and it deliberately does NOT print code letters — those are the
 * blind-judging secret.
 */
function chestCardDialog(allParticipants, houses, cfg) {
  const houseById = Object.fromEntries(houses.map(h => [h.id, h]));
  const perSheet = select(CARDS_PER_SHEET.map(n => ({ value: String(n), label: n + " per sheet" })),
    { value: "8" });
  const houseSel = select([{ value: "", label: "All houses" },
    ...houses.map(h => ({ value: h.id, label: h.name }))]);
  const catSel = select([{ value: "", label: "All categories" },
    ...[...new Map(allParticipants.filter(p => p.categoryId)
      .map(p => [p.categoryId, { value: p.categoryId, label: p.categoryName || "" }])).values()]]);
  let withPhotos = true;
  const count = el("div.report-count");

  function matching() {
    return allParticipants
      .filter(p => !houseSel.value || p.houseId === houseSel.value)
      .filter(p => !catSel.value || p.categoryId === catSel.value)
      .sort((a, b) => compareChest(a.chestNumber, b.chestNumber));
  }
  function refreshCount() {
    const n = matching().length;
    const per = Number(perSheet.value) || 8;
    count.textContent = `${n} card${n === 1 ? "" : "s"} — ${Math.ceil(n / per)} sheet${Math.ceil(n / per) === 1 ? "" : "s"}`;
  }
  [houseSel, catSel, perSheet].forEach(n => n.addEventListener("change", refreshCount));
  refreshCount();

  modal({
    title: "Print chest number cards",
    body: el("div", {}, [
      el("p.hint", { text: "Cards are printed with cut guides. Code letters are deliberately left off — they are the blind-judging secret." }),
      notice("info", "Only uploaded photos print. Participants whose photo is a Google Drive link get a silhouette, because an external image cannot be relied on to load in a print window."),
      field("Cards per sheet", perSheet),
      el("div.grid.grid-2", {}, [field("House", houseSel), field("Category", catSel)]),
      checkbox("Include photos", true, v => withPhotos = v),
      count
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Print", kind: "accent", closes: false, busyLabel: "Building…", onClick: guard(async close => {
          const people = matching();
          if (!people.length) { toast("Nobody matches those filters.", true); return false; }

          // One read of registrations gives every participant's event list.
          const regs = await getAll("registrations");
          const eventsByParticipant = {};
          for (const r of regs) {
            for (const pid of r.participantIds || []) {
              (eventsByParticipant[pid] ||= []).push(r.eventName || "");
            }
          }

          const cards = people.map(p => {
            const h = houseById[p.houseId] || {};
            return {
              chestNumber: p.chestNumber,
              name: p.name,
              houseName: p.houseName || h.name || "",
              houseColor: h.color || null,
              categoryName: p.categoryName || "",
              className: p.className || "",
              // Base64 only. An external Drive URL often renders blank in a
              // print window and cannot be awaited, so a silhouette is
              // honest where a broken icon is not.
              photo: withPhotos ? (p.photoData || null) : null,
              events: [...new Set(eventsByParticipant[p.id] || [])].sort()
            };
          });

          printDocument({
            title: "Chest number cards",
            bare: true,           // no report chrome — these are cut up
            bodyHTML: chestCardHTML(cards, {
              perSheet: Number(perSheet.value) || 8,
              festName: cfg.festName || "",
              logo: cfg.useLogo ? cfg.logoData : null
            })
          });
          close(true);
        })
      }
    ]
  });
}

/**
 * Rebuild every participant's counters from their actual registrations.
 *
 * WHY THIS EXISTS: counter KEYS depend on settings — per-category limits,
 * split-by-stage, Type/Tier limits. Change any of those and historic counts
 * sit under keys nothing reads any more, so a participant can quietly
 * exceed a cap the app believes they are nowhere near. Recomputing from the
 * registrations themselves is the only reliable repair, and it is
 * idempotent, so running it twice is harmless.
 */
function recountDialog(participants, refresh) {
  const out = el("div");
  const progress = el("div.hint");

  modal({
    title: "Recount participant limits",
    body: el("div", {}, [
      el("p", { text: "Rebuilds every participant's event counts from their registrations, using each participant's own category limits." }),
      notice("warn",
        "Run this after changing anything that alters HOW entries are counted: turning per-category limits " +
        "on or off, changing \u201Csplit by stage\u201D, or switching Type or Tier limits on. Until you do, " +
        "those settings refuse to save."),
      el("p.hint", { text: "Safe to run at any time, including mid-fest — it only rewrites counters to match reality. It never changes a registration." }),
      progress, out
    ]),
    actions: [
      { label: "Close" },
      { label: "Recount", kind: "accent", closes: false, busyLabel: "Recounting…", onClick: guard(async close => {
          progress.textContent = "Reading registrations…";
          const [regs, events, limDoc] = await Promise.all([
            getAll("registrations"), getAll("events"), getOne("config", "participantLimits")
          ]);
          const lim = { ...DEFAULTS.participantLimits, ...(limDoc || {}) };
          const eventById = Object.fromEntries(events.map(e => [e.id, e]));

          const ops = [];
          let changed = 0;
          for (const p of participants) {
            const counts = recountParticipant(p, regs, eventById, lim);
            if (JSON.stringify(counts) !== JSON.stringify(p.eventCounts || {})) changed++;
            ops.push({ type: "set", path: "participants", id: p.id, data: { eventCounts: counts }, merge: true });
          }

          progress.textContent = `Writing ${ops.length} participants…`;
          await batchWrite(ops);

          progress.textContent = "";
          out.innerHTML = "";
          out.appendChild(notice("ok",
            `Recounted ${ops.length} participants. ${changed} had counts that did not match their registrations.`));
          toast("Recount complete.");
          refresh();
          return false;
        })
      }
    ]
  });
}

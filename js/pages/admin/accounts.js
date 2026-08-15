import { el, card, field, input, button, table, toast, guard, notice, empty, modal, confirmDialog, badge, checkbox, hint } from "../../lib/ui.js";
import { getAll, getOne, put, add, patch, remove, batchWrite } from "../../lib/db.js";
import { createAccount, revokeAccount, reissueLogin, slugify, validatePassword, loginNames } from "../../lib/session.js";
import { queueRepublish } from "../../domain/republish.js";
import { overlappingRanges, rangeClash, derivePattern } from "../../domain/chest.js";
import { compressImage } from "../../lib/photo.js";
import { rebuildContactSnapshot } from "../../domain/publish.js";
import { DEFAULTS, housePluralTerm } from "../../domain/constants.js";

const TABS = [
  { id: "house",   label: "Houses",    collection: "houses"   },
  { id: "judge",   label: "Judges",    collection: "judges"   },
  { id: "coAdmin", label: "Co-Admins", collection: "coAdmins" },
  // v9 — the stage crew. Nothing role-specific to collect beyond a name and
  // a password, so this rides the generic add/edit/password path unchanged.
  { id: "stage",   label: "Stage Managers", collection: "stageManagers" }
];

// Resolved at render time from the boot-time global applyHouseTerm() sets —
// the same mechanism the nav panel uses. TABS itself stays static data.
const tabLabel = t => t.id === "house" ? (window.__HOUSE_TERM_PLURAL__ || "Houses") : t.label;

export default async function accounts(root, query = {}) {
  let tab = TABS.some(t => t.id === query.tab) ? query.tab : "house";
  root.appendChild(el("h1", { text: "Accounts" }));
  root.appendChild(notice("info",
    "Each person logs in by picking their name from a dropdown and typing a password. Nobody needs an email address."));

  // B3 — the nav panel carries Houses / Judges / Co-Admins.
  const tabs = el("div.tabs.nav-owned");
  const panel = el("div");
  TABS.forEach(t => tabs.appendChild(button(tabLabel(t), {
    class: t.id === tab ? "active" : "", onclick: () => { tab = t.id; paint(); }
  })));
  root.append(tabs, panel);

  async function paint() {
    tabs.querySelectorAll("button").forEach((b, i) => b.className = TABS[i].id === tab ? "active" : "");
    panel.innerHTML = "";
    await renderTab(panel, TABS.find(t => t.id === tab), paint);
  }
  await paint();
}

async function renderTab(panel, spec, refresh) {
  const [records, directory, settings, allHouses] = await Promise.all([
    getAll(spec.collection), loginNames(spec.id),
    getOne("config", "festSettings"), getAll("houses")
  ]);
  const cfg = { ...DEFAULTS.festSettings, ...(settings || {}) };
  const dirBySlug = Object.fromEntries(directory.map(d => [d.slug, d]));
  const isHouse = spec.id === "house";
  const label = isHouse ? housePluralTerm(cfg) : spec.label;
  const seeded = cfg.chestFormat !== "digits";
  const usesRanges = cfg.chestFormat === "digits" && cfg.chestAllocation === "houseRange";

  panel.appendChild(card(el("div.btn-row", {}, [
    button("Add " + label.replace(/s$/, ""), { class: "btn-accent",
      onclick: () => addDialog(spec, records, allHouses, cfg, refresh) }),
    // I19 — the repair described in ARCHITECTURE section 4.5.
    button("Repair logins", {
      onclick: () => repairDialog(spec, records, dirBySlug, refresh) })
  ]), label));

  // I19 — a role record without a uid cannot be assigned to anything, because
  // judgeAssignments are keyed by the Auth uid and every rule checks
  // request.auth.uid against it.
  const missingUid = records.filter(r => !r.uid && dirBySlug[r.slug || slugify(r.name)]);
  if (missingUid.length) {
    panel.appendChild(notice("warn",
      missingUid.length + " " + label.toLowerCase() + " " +
      (missingUid.length > 1 ? "records are" : "record is") +
      " missing their login id. " +
      (spec.id === "judge"
        ? "Judges in this state see no assigned events. "
        : "") +
      "Press Repair logins to fix it — it is safe to run more than once."));
  }

  if (!records.length) { panel.appendChild(empty("No " + label.toLowerCase() + " yet")); return; }

  if (isHouse && usesRanges) {
    const clashes = overlappingRanges(records);
    if (clashes.length) {
      panel.appendChild(notice("warn",
        "Overlapping chest ranges: " + clashes.join("; ") +
        ". New ranges are blocked from overlapping; these predate that rule and should be corrected."));
    }
  }

  const columns = [
    { key: "name", label: "Name", render: r => el("span.house-tag", {}, [
        r.logoData ? el("img.house-crest-sm", { src: r.logoData, alt: "" })
          : r.color ? el("i.house-dot", { style: "background:" + r.color }) : null,
        el("span", { text: r.name })
      ])},
    { key: "slug", label: "Login name", render: r => el("span.mono", { text: r.slug || slugify(r.name) }) }
  ];
  if (isHouse) {
    // I25 — the house code is internal. It seeds ids and chest prefixes; it
    // is not display material, so it no longer has a column here or anywhere
    // else. It remains editable in the dialog and usable in CSV import.
    if (seeded) {
      columns.push({ key: "chestSeed", label: "Chest pattern", render: r => r.chestSeed
        ? el("span.mono", { text: r.chestSeed })
        : el("span.hint", { text: "not set yet" }) });
    } else if (usesRanges) {
      columns.push({ key: "range", label: "Chest range", render: r =>
        r.chestRangeStart && r.chestRangeEnd
          ? el("span.mono", { text: r.chestRangeStart + "–" + r.chestRangeEnd })
          : el("span.hint", { text: "shared" }) });
    }
    columns.push({ key: "adjustmentPoints", label: "Adjustment", num: true, render: r => String(r.adjustmentPoints || 0) });
  }
  columns.push({ key: "status", label: "Access", render: r =>
    dirBySlug[r.slug || slugify(r.name)]
      ? (r.uid ? badge("Active", "badge-ok") : badge("Needs repair", "badge-warn"))
      : badge("No login", "badge-warn") });
  columns.push({ key: "act", label: "", render: r => el("div.btn-row", {}, [
    button("Edit", { class: "btn-sm", onclick: () => editDialog(spec, r, allHouses, cfg, refresh) }),
    button("Password", { class: "btn-sm", onclick: () => passwordDialog(spec, r, dirBySlug, refresh) }),
    button("Delete", { class: "btn-sm btn-danger", onclick: guard(async () => {
      if (!await confirmDialog("Delete " + r.name,
        "This removes the record and revokes the login. Any data already recorded against it stays.", "Delete")) return;
      const slug = r.slug || slugify(r.name);
      const entry = dirBySlug[slug];
      if (entry) await revokeAccount({ slug, uid: entry.uid });
      await remove(spec.collection, r.id);
      toast("Deleted."); refresh();
    })})
  ])});

  panel.appendChild(card(table(columns, [...records].sort((a, b) => a.name.localeCompare(b.name)))));
}

/* ── House identity fields, shared by add and edit ───────────────────── */
function houseFields(existing, cfg) {
  const seeded = cfg.chestFormat !== "digits";
  const usesRanges = cfg.chestFormat === "digits" && cfg.chestAllocation === "houseRange";

  const code = input({ value: existing?.code || "", placeholder: "Short code, e.g. FAL", maxlength: 6 });
  const rangeFrom = input({ type: "number", min: 1, value: existing?.chestRangeStart ?? "", placeholder: "e.g. 100" });
  const rangeTo   = input({ type: "number", min: 1, value: existing?.chestRangeEnd ?? "", placeholder: "e.g. 199" });
  const seed = input({ value: existing?.chestSeed || "", placeholder: "e.g. RED-A01" });
  const adj  = input({ type: "number", value: existing?.adjustmentPoints || 0 });

  // Contacts. Each number carries its own "show publicly" tick, so the fest
  // decides per person rather than all-or-nothing — a student leader's
  // number and an organiser's are not the same kind of thing.
  const mgrName  = input({ value: existing?.managerName || "", placeholder: "Name" });
  const mgrPhone = input({ value: existing?.managerPhone || "", placeholder: "Mobile number", type: "tel" });
  let mgrPublic  = !!existing?.managerPhonePublic;

  const leaderName  = input({ value: existing?.leaderName || "", placeholder: "Name" });
  const leaderPhone = input({ value: existing?.leaderPhone || "", placeholder: "Mobile number", type: "tel" });
  let leaderPublic  = !!existing?.leaderPhonePublic;

  const asstName  = input({ value: existing?.assistantLeaderName || "", placeholder: "Name" });
  const asstPhone = input({ value: existing?.assistantLeaderPhone || "", placeholder: "Mobile number", type: "tel" });
  let asstPublic  = !!existing?.assistantLeaderPhonePublic;

  // I11 — optional house colour and crest. Both default to nothing and every
  // surface must render correctly without them.
  let color = existing?.color || "";
  let logoData = existing?.logoData || null;

  const colorInput = el("input", { type: "color", value: color || "#4C7A5A" });
  let useColor = !!color;
  const colorToggle = checkbox("Give this house a colour", useColor, v => {
    useColor = v; colorInput.style.display = v ? "" : "none";
  });
  colorInput.style.display = useColor ? "" : "none";

  const logoPreview = el("img", {
    src: logoData || "", alt: "",
    style: "max-height:64px;max-width:120px;display:" + (logoData ? "block" : "none") +
           ";background:#EEF2F8;padding:.3rem;border-radius:6px"
  });
  const logoFile = el("input", { type: "file", accept: "image/*", style: "display:none" });
  logoFile.addEventListener("change", guard(async () => {
    const f = logoFile.files?.[0];
    if (!f) return;
    // keepAlpha: a crest on a coloured bar needs its transparency.
    logoData = await compressImage(f, 240, 0.9, true);
    logoPreview.src = logoData;
    logoPreview.style.display = "block";
    toast("Crest ready. Save to apply.");
  }));

  const node = el("div", {}, [
    field("House code", code, "Internal only — used for imports and chest prefixes. Not shown to anyone."),
    seeded
      ? field("Chest number pattern", seed,
          "Type this house's first chest number, e.g. RED-A01. Every later participant follows the pattern automatically. Leave blank to set it by adding the first participant by hand.")
      : usesRanges
        ? el("fieldset", {}, [
            el("legend", { text: "Chest number range" }),
            hint("Participants added to this house take numbers from this range, so a chest number reads as a house on the day. Ranges may not overlap."),
            el("div.grid.grid-2", {}, [field("From", rangeFrom), field("To", rangeTo)])
          ])
        : hint("This fest uses one shared chest number sequence, so houses have no range of their own."),
    field("Adjustment points", adj, "Added to this house's total. Use negatives to deduct."),
    el("fieldset", {}, [
      el("legend", { text: "People and contacts (optional)" }),
      hint("Each number is private unless you tick it. Many of these are students, so nothing is published by default — tick only the numbers that should appear on the public Contact page."),
      el("div.grid.grid-2", {}, [field("Manager name", mgrName), field("Manager mobile", mgrPhone)]),
      checkbox("Show the manager's number publicly", mgrPublic, v => mgrPublic = v),
      el("div.grid.grid-2", { style: "margin-top:.6rem" }, [field("Leader name", leaderName), field("Leader mobile", leaderPhone)]),
      checkbox("Show the leader's number publicly", leaderPublic, v => leaderPublic = v),
      el("div.grid.grid-2", { style: "margin-top:.6rem" }, [field("Assistant leader name", asstName), field("Assistant leader mobile", asstPhone)]),
      checkbox("Show the assistant leader's number publicly", asstPublic, v => asstPublic = v)
    ]),
    el("fieldset", {}, [
      el("legend", { text: "Identity (optional)" }),
      colorToggle, colorInput,
      el("div", { style: "margin-top:.6rem" }, [
        logoPreview,
        el("div.btn-row", { style: "margin-top:.4rem" }, [
          button("Upload crest", { class: "btn-sm", onclick: () => logoFile.click() }),
          logoData ? button("Remove", { class: "btn-sm", onclick: () => {
            logoData = null; logoPreview.style.display = "none";
          }}) : null,
          logoFile
        ])
      ])
    ])
  ]);

  return {
    node,
    /** The staff-only contact record — phone numbers and their public flags. */
    contacts() {
      return {
        managerName: mgrName.value.trim(),
        managerPhone: mgrPhone.value.trim(),
        managerPhonePublic: mgrPublic,
        leaderName: leaderName.value.trim(),
        leaderPhone: leaderPhone.value.trim(),
        leaderPhonePublic: leaderPublic,
        assistantLeaderName: asstName.value.trim(),
        assistantLeaderPhone: asstPhone.value.trim(),
        assistantLeaderPhonePublic: asstPublic
      };
    },
    /** Returns the fields, or throws with a message the dialog can show. */
    collect(houseId, houses) {
      const data = {
        code: code.value.trim().toUpperCase(),
        adjustmentPoints: Number(adj.value) || 0,
        color: useColor ? colorInput.value : null,
        logoData,
        /* Names only. NO PHONE NUMBERS ON THIS DOCUMENT.
         *
         * firestore.rules gives `houses` `allow read: if true`, and
         * Firestore rules are document-level — there is no way to hide one
         * field from a public read. A number stored here would be readable
         * by anyone with the project id, whatever the UI showed. Numbers
         * live in houseContacts/{id}, which is staff-only, and reach the
         * public only via the ticked-public snapshot. */
        managerName: mgrName.value.trim(),
        leaderName: leaderName.value.trim(),
        assistantLeaderName: asstName.value.trim()
      };

      if (seeded) {
        const v = seed.value.trim().toUpperCase();
        if (v && !derivePattern(v)) {
          throw new Error("That pattern has no number or letter to advance — try something like RED-A01.");
        }
        data.chestSeed = v || null;
        data.chestRangeStart = null;
        data.chestRangeEnd = null;
      } else if (usesRanges) {
        const from = rangeFrom.value ? Number(rangeFrom.value) : null;
        const to   = rangeTo.value ? Number(rangeTo.value) : null;
        if ((from && !to) || (to && !from)) throw new Error("Give both ends of the range, or neither.");
        // I26 — overlapping ranges are BLOCKED at save time. v6 computed the
        // clash and rendered it as a notice afterwards, which is a warning
        // nobody acts on.
        const clash = rangeClash({ houseId, start: from, end: to, houses });
        if (clash) throw new Error(clash);
        data.chestRangeStart = from;
        data.chestRangeEnd = to;
        data.chestSeed = null;
      }
      return data;
    }
  };
}

function addDialog(spec, existing, houses, cfg, refresh) {
  const name = input({ placeholder: spec.id === "house" ? "e.g. Falcons" : "Full name" });
  const pw   = input({ type: "password", autocomplete: "new-password" });
  const pw2  = input({ type: "password", autocomplete: "new-password" });
  const houseBits = spec.id === "house" ? houseFields(null, cfg) : null;
  const label = spec.id === "house" ? housePluralTerm(cfg) : spec.label;

  modal({
    title: "Add " + label.replace(/s$/, ""),
    body: el("div", {}, [
      field("Name", name),
      houseBits ? houseBits.node : null,
      field("Password", pw, "3 to 8 characters. Share it with them directly."),
      field("Confirm password", pw2)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Create", kind: "accent", closes: false, busyLabel: "Creating…", onClick: guard(async close => {
          if (!name.value.trim()) { toast("Name is required.", true); return false; }
          const err = validatePassword(pw.value, pw2.value);
          if (err) { toast(err, true); return false; }

          let extra = {};
          if (houseBits) {
            try { extra = houseBits.collect(null, houses); }
            catch (e) { toast(e.message, true); return false; }
          }

          let slug = slugify(name.value);
          const taken = new Set(existing.map(r => r.slug || slugify(r.name)));
          let n = 2;
          while (taken.has(slug)) slug = slugify(name.value) + "-" + n++;

          const record = { name: name.value.trim(), slug, status: "active", ...extra };
          const id = await add(spec.collection, record);

          // I19 — THE FIX. createAccount() returns the Auth uid and v6 threw
          // it away, so the role record had no uid, judgeAssignments were
          // keyed by the Firestore document id instead, and the judge panel
          // (which queries by request.auth.uid) matched nothing.
          const uid = await createAccount({ slug, password: pw.value, role: spec.id, name: record.name, refId: id });
          await patch(spec.collection, id, { uid });

          // Phone numbers go to the staff-only contact document, never the
          // publicly-readable house record.
          if (houseBits) await put("houseContacts", id, houseBits.contacts());

          toast(record.name + " created.");
          close(true);
          refresh();
        })
      }
    ]
  });
}

function passwordDialog(spec, record, dirBySlug, refresh) {
  const slug = record.slug || slugify(record.name);
  const entry = dirBySlug[slug];
  const pw  = input({ type: "password", autocomplete: "new-password" });
  const pw2 = input({ type: "password", autocomplete: "new-password" });

  modal({
    title: "New password — " + record.name,
    body: el("div", {}, [
      entry
        ? el("p.hint", { text: `${record.name} keeps their name and all their data. Only the password changes. Tell them the new one directly — nothing is emailed.` })
        : notice("warn", "This person has no login yet. Setting a password here creates one."),
      field("New password", pw, "Between 3 and 8 characters."),
      field("Confirm password", pw2)
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Set password", kind: "accent", closes: false, busyLabel: "Updating…",
        onClick: guard(async close => {
          const err = validatePassword(pw.value, pw2.value);
          if (err) { toast(err, true); return false; }

          const oldUid = entry?.uid || record.uid || null;
          const { slug: newSlug, uid } = await reissueLogin({
            oldSlug: entry ? slug : null,
            oldUid,
            role: spec.id,
            name: record.name,
            refId: record.id,
            password: pw.value
          });

          // The uid CHANGES on a reissue, so the record must be re-pointed
          // and any judge assignments moved with it — otherwise resetting a
          // judge's password silently unassigns them from every event
          // (ARCHITECTURE section 4.6).
          await patch(spec.collection, record.id, { slug: newSlug, uid });
          if (spec.id === "judge" && oldUid && oldUid !== uid) {
            await migrateAssignments(oldUid, uid, record.name);
          }

          toast("Password updated for " + record.name + ".");
          close(true);
          refresh();
        })
      }
    ]
  });
}

/** Move judgeAssignments from one Auth uid to another. Idempotent. */
async function migrateAssignments(oldUid, newUid, judgeName) {
  const all = await getAll("judgeAssignments");
  const mine = all.filter(a => a.judgeUid === oldUid || a.id.endsWith("_" + oldUid));
  if (!mine.length) return 0;
  const ops = [];
  for (const a of mine) {
    // Firestore rejects undefined values, so the synthetic id is stripped
    // rather than overwritten.
    const { id, ...rest } = a;
    const newId = `${a.eventId}_${newUid}`;
    ops.push({
      type: "set", path: "judgeAssignments", id: newId,
      data: { ...rest, judgeUid: newUid, judgeName: judgeName || a.judgeName }
    });
    if (id !== newId) ops.push({ type: "delete", path: "judgeAssignments", id });
  }
  await batchWrite(ops);
  return mine.length;
}

/**
 * I19 repair — write the Auth uid onto role records created before v7, and
 * re-point any judge assignments that were keyed by the document id.
 *
 * Safe to run repeatedly: every write is idempotent.
 */
function repairDialog(spec, records, dirBySlug, refresh) {
  const out = el("div");
  modal({
    title: "Repair logins",
    body: el("div", {}, [
      el("p", { text: "Records created before this version did not store their login id. Judges in that state see no assigned events, because assignments are matched on the login id." }),
      el("p.hint", { text: "This reads the login directory, writes the missing ids, and moves any assignments that were filed under the old key. It changes nobody's password and is safe to run more than once." }),
      out
    ]),
    actions: [
      { label: "Close" },
      { label: "Repair", kind: "accent", closes: false, busyLabel: "Repairing…", onClick: guard(async close => {
          let fixed = 0, moved = 0;
          for (const r of records) {
            const slug = r.slug || slugify(r.name);
            const entry = dirBySlug[slug];
            if (!entry?.uid) continue;
            if (r.uid === entry.uid) continue;
            await patch(spec.collection, r.id, { uid: entry.uid });
            fixed++;
            if (spec.id === "judge") moved += await migrateAssignments(r.id, entry.uid, r.name);
          }
          out.innerHTML = "";
          out.appendChild(notice(fixed || moved ? "ok" : "info",
            fixed || moved
              ? `Repaired ${fixed} record${fixed === 1 ? "" : "s"}` +
                (moved ? ` and moved ${moved} judge assignment${moved === 1 ? "" : "s"}.` : ".")
              : "Nothing needed repairing."));
          if (fixed || moved) { toast("Repaired."); refresh(); }
          return false;
        })
      }
    ]
  });
}

async function editDialog(spec, record, houses, cfg, refresh) {
  const name = input({ value: record.name });
  // Contacts live in their own staff-only document, so they are fetched
  // here rather than being part of the house record.
  const contactDoc = spec.id === "house"
    ? await getOne("houseContacts", record.id).catch(() => null)
    : null;
  const houseBits = spec.id === "house"
    ? houseFields({ ...record, ...(contactDoc || {}) }, cfg)
    : null;

  modal({
    title: "Edit " + record.name,
    body: el("div", {}, [
      field("Name", name, "The login dropdown keeps the original entry, so this is a display name change."),
      houseBits ? houseBits.node : null
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          const data = { name: name.value.trim() };
          if (houseBits) {
            try { Object.assign(data, houseBits.collect(record.id, houses)); }
            catch (e) { toast(e.message, true); return false; }
          }
          await patch(spec.collection, record.id, data);
          if (houseBits) {
            await put("houseContacts", record.id, houseBits.contacts());
            // Rebuild the public list so a newly-ticked number appears — and,
            // more importantly, an untickeded one disappears — immediately.
            await rebuildContactSnapshot().catch(() => {});
          }
          if (spec.id === "house") queueRepublish({ results: true });
          toast("Saved.");
          close(true);
          refresh();
        })
      }
    ]
  });
}

// Participant lookup. Costs 1–2 reads per search: participants are queried
// by chest number or name, and the result card comes from one pre-built
// participantPublic document.
import { el, card, input, field, empty, badge, debounce, notice } from "../lib/ui.js";
import { getAll, getOne, where, limit, orderBy } from "../lib/db.js";
import { topbar } from "../app.js";
import { queryParams } from "../lib/router.js";
import { chestSortKey, normalizeChest } from "../domain/chest.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { gradeLabel } from "../domain/scoring.js";

export default async function lookupPage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap.wrap-narrow");
  root.appendChild(wrap);

  // Fetched once for the page, not per search result: config/festSettings is
  // cached by lib/db.js, but that cache is per page-load — one read here
  // beats one per card.
  const settings = await getOne("config", "festSettings").catch(() => null);

  const box = input({ placeholder: "Chest number or name", autocomplete: "off" });
  const out = el("div");
  wrap.appendChild(card(el("div", {}, [
    field("Search", box, "Type at least two characters."), out
  ]), "Find a participant"));

  const run = debounce(async () => {
    const term = box.value.trim();
    out.innerHTML = "";
    if (term.length < 2) return;
    out.appendChild(el("div.hint", { text: "Searching…" }));

    let matches = [];
    try {
      const asChest = normalizeChest(term);
      if (/^[A-Z0-9][A-Z0-9\-_/]*$/.test(asChest) && /\d/.test(asChest)) {
        // Chest numbers are strings in all three formats (ARCHITECTURE 5.7),
        // so this matches on the padded sort key and falls back to the raw
        // value for records written before the format change.
        matches = await getAll("participants", where("chestSort", "==", chestSortKey(asChest)), limit(5));
        if (!matches.length) matches = await getAll("participants", where("chestNumber", "==", asChest), limit(5));
        if (!matches.length && /^\d+$/.test(term)) {
          matches = await getAll("participants", where("chestNumber", "==", Number(term)), limit(5));
        }
      }
      if (!matches.length) {
        const start = term.toLowerCase();
        matches = await getAll("participants",
          orderBy("nameLower"), where("nameLower", ">=", start), where("nameLower", "<=", start + "\uf8ff"), limit(8));
      }
    } catch (err) {
      out.innerHTML = "";
      out.appendChild(notice("danger", "Search failed. " + (err.message || "")));
      return;
    }

    out.innerHTML = "";
    if (!matches.length) { out.appendChild(empty("No match", "Check the spelling or the chest number.")); return; }
    for (const p of matches) out.appendChild(await renderCard(p, settings));
  }, 350);

  box.addEventListener("input", run);

  const q = queryParams();
  if (q.chest) { box.value = q.chest; run(); }
  box.focus();
}

async function renderCard(p, settings) {
  const pub = await getOne("participantPublic", p.id).catch(() => null);
  const events = Object.entries(pub?.events || {}).map(([id, e]) => ({ id, ...e }));

  const head = el("div", { style: "display:flex;gap:.9rem;align-items:center;margin-bottom:.8rem" }, [
    p.photoURL ? el("img", {
      src: p.photoURL, alt: "",
      style: "width:58px;height:58px;border-radius:8px;object-fit:cover;border:1px solid var(--line)",
      onerror: e => e.target.remove()
    }) : null,
    el("div", {}, [
      el("h3", { text: p.name, style: "margin:0" }),
      el("div.hint", { style: "margin:0" }, [
        el("span.mono", { text: "#" + (p.chestNumber ?? "—") }),
        " · ", p.houseName || "", " · ", p.categoryName || ""
      ])
    ])
  ]);

  const rankArt = pub?.rankArt || {};

  const statusBadge = st => badge(st || "Not scheduled",
    st === "Ongoing" ? "badge-live"
      : st === "Upcoming" ? "badge-warn"
      : st === "Finished" ? "badge-ok" : "");

  /**
   * ARCHITECTURE section 6.2 — real placements only.
   *
   * A finish outside the ranked positions carries no rank at all. The
   * snapshot simply never wrote one, so there is nothing here to reveal.
   * The grade still shows when the fest allows it, because for an unranked
   * entry that is the meaningful feedback.
   */
  const resultCell = e => {
    if (e.isAbsent) return badge("Absent", "badge-danger");
    const bits = [];
    if (e.ranked && e.rank) {
      bits.push(hasMedal(e.rank)
        ? rankNode(e.rank, { size: 30, rankArt })
        : el("span.rank-medal", { text: "#" + e.rank }));
    }
    if (e.grade) bits.push(badge(gradeLabel(e.grade, settings)));
    if (!bits.length) bits.push(el("span.hint", { style: "margin:0", text: "Participated" }));
    return el("div.btn-row", {}, bits);
  };

  const list = events.length
    ? el("div", {}, events.map(e => el("div", {
        style: "display:flex;gap:.6rem;align-items:center;padding:.4rem 0;border-top:1px solid var(--line)"
      }, [
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", { text: e.name }),
          e.code ? el("div.hint", { text: e.code, style: "margin:0" }) : null
        ]),
        e.published ? resultCell(e) : badge("Not published", "badge-warn")
      ])))
    : el("div.hint", { text: "Not registered for any event yet." });

  // I22 — the number a spectator searching a chest number actually wants.
  const totals = pub?.totalPoints !== undefined && pub?.totalPoints !== null
    ? el("div.lookup-total", {}, [
        el("div", {}, [
          el("div.lookup-total-n", { text: String(pub.totalPoints) }),
          el("div.hint", { style: "margin:0", text: "total points" })
        ]),
        pub.talentRank
          ? el("div", {}, [
              el("div.lookup-total-n", { text: "#" + pub.talentRank }),
              el("div.hint", { style: "margin:0", text: "talent board" })
            ])
          : null
      ])
    : null;

  return card(el("div", {}, [head, totals, list]));
}

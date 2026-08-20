// Auto-rotating display board for a projector. Reads the same snapshots as
// /results, refreshed every two minutes rather than held on a live listener.
import { el, backButton } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { rankIsPublic, isGroupClass } from "../domain/constants.js";

export default async function slideshowPage(root) {
  const stage = el("div.slideshow");
  root.appendChild(stage);
  // This screen hides the app shell, so it needs its own way out.
  root.appendChild(backButton());

  let slides = [], index = 0, rankArt = {};
  // Read once at load() and used when the timer starts below; clamped so a
  // mistyped 0 cannot spin the projector at full speed.
  let slideMs = 8000;

  async function load() {
    const [board, events] = await Promise.all([
      getOne("publicLeaderboard", "main").catch(() => null),
      getAll("publicResults").catch(() => [])
    ]);

    // I2 / I4 — the projector obeys the same public limits as /results.
    const rankLimit = board?.rankLimit ?? 3;
    const talentLimit = Number(board?.talentBoardLimit) || 10;
    // I9 — was hard-coded to the last 12 events with no setting to change
    // it; 0 means every published event, matching every other "0 = show
    // all" limit in this app.
    const recentLimit = board?.slideshowRecentLimit ?? 12;
    rankArt = board?.rankArt || {};
    const houseStyle = board?.houseStyle || {};
    slideMs = Math.max(3, Number(board?.slideshowSeconds) || 8) * 1000;

    // Which slides to build. Each defaults ON where it always showed, so a
    // fest that never opens the new settings sees the slideshow it had.
    const showHouses  = board?.slideshowShowHouses  ?? true;
    const showTalent  = board?.slideshowShowTalent  ?? true;
    const showResults = board?.slideshowShowResults ?? true;
    const showCatBoards = !!board?.slideshowCategoryBoards;
    const boardIds = Array.isArray(board?.slideshowBoardIds) ? board.slideshowBoardIds : [];

    slides = [];
    if (showHouses && board?.houses?.length) {
      slides.push({
        title: "House Rankings",
        items: board.houses.slice(0, 10).map(h => ({
          rank: h.rank, main: h.name, value: h.total + " pts",
          crest: houseStyle[h.id]?.logoData || null,
          color: houseStyle[h.id]?.color || null
        }))
      });
    }
    if (showTalent && board?.students?.length) {
      // The combined board always shows — the per-category breakdown is
      // additional, not a replacement for it.
      slides.push({
        title: "Student Talent",
        items: board.students.slice(0, talentLimit || 10).map(s => ({
          rank: s.rank, main: s.name, sub: s.houseName, value: s.total + " pts"
        }))
      });
      // I9 — one slide per category as well, when the Admin has switched
      // it on. Dense re-ranking within each category mirrors /results'
      // own reRank(), so a slide never shows a rank that skips a place.
      if (board.slideshowTalentByCategory) {
        const byCat = new Map();
        for (const s of board.students) {
          const key = s.categoryName || "All categories";
          if (!byCat.has(key)) byCat.set(key, []);
          byCat.get(key).push(s);
        }
        for (const [catName, list] of byCat) {
          const ranked = reRank(list).slice(0, talentLimit || 10);
          slides.push({
            title: "Student Talent — " + catName,
            items: ranked.map(s => ({ rank: s.rank, main: s.name, sub: s.houseName, value: s.total + " pts" }))
          });
        }
      }
    }
    /* House points per category — one slide each. The same
     * categoryBreakdown the public results page and the big screen already
     * read, so a projector can never disagree with either. */
    if (showCatBoards) {
      const cb = board?.categoryBreakdown;
      for (const col of (cb?.columns || [])) {
        const rows = (cb.rows || [])
          .map(r => ({ id: r.id, name: r.name, total: r.byCategory?.[col.id] || 0 }))
          .filter(r => r.total > 0);
        if (!rows.length) continue;
        slides.push({
          title: col.name,
          sub: (board?.housePluralTerm || "Houses") + " · points in this category",
          items: reRank(rows).map(r => ({
            rank: r.rank, main: r.name, value: r.total + " pts",
            crest: houseStyle[r.id]?.logoData || null,
            color: houseStyle[r.id]?.color || null
          }))
        });
      }
    }

    /* Custom leaderboards, whichever ones the Admin picked. Only boards
     * already marked public reach the snapshot at all, so a staff-only
     * board cannot be put on a projector by choosing it here. */
    if (boardIds.length) {
      for (const b of (board?.boards || [])) {
        if (!boardIds.includes(b.id)) continue;
        const rows = (b.rows || []).slice(0, b.rowLimit || 10);
        if (!rows.length) continue;
        slides.push({
          title: b.name,
          items: rows.map(r => ({
            rank: r.rank, main: r.name, sub: r.houseName || "",
            value: (r.total ?? 0) + " pts",
            crest: houseStyle[r.id]?.logoData || null,
            color: houseStyle[r.id]?.color || null
          }))
        });
      }
    }

    const recent = showResults ? (recentLimit ? events.slice(-recentLimit) : events) : [];
    for (const ev of recent) {
      const top = (ev.entries || []).filter(e => !e.isAbsent && rankIsPublic(e.rank, rankLimit));
      if (!top.length) continue;
      slides.push({
        title: ev.eventName,
        sub: [ev.categoryName, ev.eventCode].filter(Boolean).join(" · "),
        items: top.map(e => {
          const est = houseStyle[e.houseId] || {};
          return {
            rank: e.rank,
            // teamLabel is set to the house name even for an INDIVIDUAL
            // event (domain/constants.js teamName()), so this must check
            // isGroupClass before trusting it, or an individual winner's
            // own name never shows.
            main: (isGroupClass(ev.eventClass) && e.teamLabel) ? e.teamLabel : (e.names || []).join(", "),
            sub: e.houseName,
            crest: est.logoData || null,
            color: est.useAsNameColor ? est.color : null
          };
        })
      });
    }
    if (!slides.length) slides = [{ title: "No results published yet", items: [] }];
    if (index >= slides.length) index = 0;
  }

  function paint() {
    const s = slides[index % slides.length];
    stage.innerHTML = "";
    stage.append(
      el("h1", { text: s.title }),
      s.sub ? el("div.slide-sub", { text: s.sub }) : null,
      el("div", { style: "height:4px;width:80px;background:var(--marigold);margin:1rem 0 2rem" }),
      ...s.items.map(it => el("div.item", {}, [
        // I7 — medal artwork rather than "#1". On a hall projector a numeral
        // reads as data; a medal reads as a result.
        hasMedal(it.rank)
          ? rankNode(it.rank, { size: 64, rankArt })
          : el("span.item-rank", { text: "#" + it.rank }),
        it.crest ? el("img.house-crest", { src: it.crest, alt: "" }) : null,
        el("span.item-main", { text: it.main, style: it.color ? "color:" + it.color : null }),
        it.sub ? el("span.item-sub", { text: it.sub }) : null,
        it.value ? el("span.item-value", { text: it.value }) : null
      ]))
    );
    index++;
  }

  await load();
  paint();
  // Slide duration is a setting: a board of ten houses needs longer on
  // screen than a single winner does, and only the fest knows which.
  const tick = setInterval(paint, slideMs);
  const refresh = setInterval(() => load().catch(() => {}), 120000);
  return () => { clearInterval(tick); clearInterval(refresh); };
}

// Dense ranking within one category — mirrors /results' own reRank(), so a
// per-category slide never shows a rank that skips a place.
function reRank(list) {
  let rank = 0, prev = null;
  return [...list].sort((a, b) => b.total - a.total).map(r => {
    if (prev === null || r.total !== prev) { rank++; prev = r.total; }
    return { ...r, rank };
  });
}

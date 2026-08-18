// Auto-rotating display board for a projector. Reads the same snapshots as
// /results, refreshed every two minutes rather than held on a live listener.
import { el } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { rankIsPublic, isGroupClass } from "../domain/constants.js";

export default async function slideshowPage(root) {
  const stage = el("div.slideshow");
  root.appendChild(stage);

  let slides = [], index = 0, rankArt = {};

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

    slides = [];
    if (board?.houses?.length) {
      slides.push({
        title: "House Rankings",
        items: board.houses.slice(0, 10).map(h => ({
          rank: h.rank, main: h.name, value: h.total + " pts",
          crest: houseStyle[h.id]?.logoData || null,
          color: houseStyle[h.id]?.color || null
        }))
      });
    }
    if (board?.students?.length) {
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
    const recent = recentLimit ? events.slice(-recentLimit) : events;
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
  const tick = setInterval(paint, 8000);
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

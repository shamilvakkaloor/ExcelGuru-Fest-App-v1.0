// Auto-rotating display board for a projector. Reads the same snapshots as
// /results, refreshed every two minutes rather than held on a live listener.
import { el } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { rankIsPublic } from "../domain/constants.js";

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
      slides.push({
        title: "Student Talent",
        items: board.students.slice(0, talentLimit || 10).map(s => ({
          rank: s.rank, main: s.name, sub: s.houseName, value: s.total + " pts"
        }))
      });
    }
    for (const ev of events.slice(-12)) {
      const top = (ev.entries || []).filter(e => !e.isAbsent && rankIsPublic(e.rank, rankLimit));
      if (!top.length) continue;
      slides.push({
        title: ev.eventName,
        sub: [ev.categoryName, ev.eventCode].filter(Boolean).join(" · "),
        items: top.map(e => ({
          rank: e.rank, main: (e.names || []).join(", "), sub: e.houseName,
          crest: houseStyle[e.houseId]?.logoData || null
        }))
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

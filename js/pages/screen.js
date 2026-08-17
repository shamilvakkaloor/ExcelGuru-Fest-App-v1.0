// Big-screen mode: full-bleed rotating display for a projector or hall TV.
//
// Deliberately not a live listener — it refreshes on a timer, because a
// screen left running all day on a live subscription is the one thing most
// likely to eat the daily read allowance.
import { el } from "../lib/ui.js";
import { getOne, getAll } from "../lib/db.js";
import { classLabel, rankIsPublic, isGroupClass } from "../domain/constants.js";
import { gradeLabel } from "../domain/scoring.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { currentlyRunning } from "./home.js";
import { darkenColor, lightenColor, nameColorStyle } from "../domain/houseColor.js";

const SLIDE_MS = 9000;
const REFRESH_MS = 120000;

export default async function screenPage(root) {
  const stage = el("div.screen");
  root.appendChild(stage);

  let slides = [], index = 0, timer = null, refresh = null;
  let rankLimit = 3, talentLimit = 8, rankArt = {}, houseStyle = {};

  async function load() {
    const [settings, board, schedule, results] = await Promise.all([
      getOne("config", "festSettings").catch(() => null),
      getOne("publicLeaderboard", "main").catch(() => null),
      getOne("publicSchedule", "main").catch(() => null),
      getAll("publicResults").catch(() => [])
    ]);

    const built = [];
    const festName = settings?.festName || "Fest";

    // I2 / I4 — the big screen obeys the same public limits as /results.
    rankLimit = board?.rankLimit ?? 3;
    talentLimit = Number(board?.talentBoardLimit) || 8;
    rankArt = board?.rankArt || {};
    houseStyle = board?.houseStyle || {};

    const running = currentlyRunning(settings, schedule);
    if (running.length) {
      built.push({
        kind: "now", title: "Now on",
        rows: running.map(r => ({
          main: r.title,
          sub: [r.category, r.stage, r.venue].filter(Boolean).join(" · ")
        }))
      });
    }

    if (board?.houses?.length) {
      const max = Math.max(1, ...board.houses.map(h => h.total || 0));
      built.push({
        kind: "houses", title: "House standings",
        rows: board.houses.slice(0, 8).map(h => ({
          rank: h.rank, main: h.name, value: (h.total ?? 0) + " pts",
          pct: Math.round((h.total / max) * 100),
          crest: houseStyle[h.id]?.logoData || null,
          bg: houseStyle[h.id]?.color ? darkenColor(houseStyle[h.id].color) : null,
          fg: houseStyle[h.id]?.color ? lightenColor(houseStyle[h.id].color) : null
        }))
      });
    }

    // I9 — houses as rows, categories as columns, points in each cell plus
    // a Total column. Same categoryBreakdown the public results page's
    // "Points by category" table already reads, so the two can never
    // disagree — only the layout differs (that one lists categories as
    // rows; a big screen reads better the other way round).
    const cb = board?.categoryBreakdown;
    if (cb?.rows?.length && cb.columns?.length) {
      const cols = cb.columns.filter(c => cb.rows.some(r => (r.byCategory?.[c.id] || 0) > 0));
      if (cols.length) {
        built.push({
          kind: "table", title: "Points by category",
          columns: cols,
          rows: cb.rows.map(r => ({
            name: r.name,
            cells: cols.map(c => ({
              value: r.byCategory?.[c.id] || 0,
              isLeader: cb.leaders?.[c.id]?.houseId === r.id && (r.byCategory?.[c.id] || 0) > 0
            })),
            total: r.total
          }))
        });
      }
    }

    if (board?.students?.length) {
      built.push({
        kind: "list", title: "Student talent",
        rows: board.students.slice(0, talentLimit || 8).map(s => ({
          rank: s.rank, main: s.name, sub: s.houseName, value: (s.total ?? 0) + " pts"
        }))
      });
    }

    const latest = [...results]
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, 8);
    for (const ev of latest) {
      const top = (ev.entries || []).filter(e => !e.isAbsent && rankIsPublic(e.rank, rankLimit));
      if (!top.length) continue;
      built.push({
        kind: "list",
        title: ev.eventName,
        sub: [ev.categoryName, classLabel(ev.eventClass)].filter(Boolean).join(" · "),
        // I9 (bug) — teamLabel is set to the house name even for an
        // INDIVIDUAL event (see domain/constants.js teamName()), so
        // `e.teamLabel || …` picked the house every time and the winner's
        // own name never showed. isGroupClass decides which one actually
        // means "team" here, the same check results.js's entryDisplay uses.
        rows: top.map(e => ({
          rank: e.rank,
          main: (isGroupClass(ev.eventClass) && e.teamLabel) ? e.teamLabel : (e.names || []).join(", "),
          sub: e.houseName,
          value: e.grade ? gradeLabel(e.grade, settings) : "",
          nameColor: nameColorStyle(houseStyle, e.houseId)
        }))
      });
    }

    slides = built.length ? built : [{ kind: "list", title: festName, sub: "No results published yet", rows: [] }];
    if (index >= slides.length) index = 0;
  }

  function paint() {
    const s = slides[index % slides.length];
    index++;

    stage.innerHTML = "";
    const head = el("div.screen-head", {}, [
      el("div", {}, [
        el("h1", { text: s.title }),
        s.sub ? el("div.screen-sub", { text: s.sub }) : null
      ]),
      el("div.screen-dots", {}, slides.map((_, i) =>
        el("i" + (i === (index - 1) % slides.length ? ".on" : ""))))
    ]);

    const body = el("div.screen-body");
    if (s.kind === "houses") {
      for (const r of s.rows) {
        const bar = el("i", { style: "width:0%" });
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = r.pct + "%"; }));
        if (r.fg) bar.style.background = r.fg;
        body.appendChild(el("div.screen-house", {
          style: r.bg ? `background:${r.bg};border-radius:12px;padding:1.1vh 1.2vw` : null
        }, [
          hasMedal(r.rank) ? rankNode(r.rank, { size: 54, rankArt })
                           : el("span.screen-rank", { text: "#" + r.rank, style: r.fg ? "color:" + r.fg : null }),
          r.crest ? el("img.house-crest", { src: r.crest, alt: "" }) : null,
          el("span.screen-main", { text: r.main, style: r.fg ? "color:" + r.fg : null }),
          el("span.screen-value", { text: r.value, style: r.fg ? "color:" + r.fg : null }),
          el("div.screen-bar", {}, bar)
        ]));
      }
    } else if (s.kind === "table") {
      body.appendChild(el("table.screen-table", {}, [
        el("thead", {}, el("tr", {}, [
          el("th", { text: "" }),
          ...s.columns.map(c => el("th", { text: c.name })),
          el("th", { text: "Total" })
        ])),
        el("tbody", {}, s.rows.map(r => el("tr", {}, [
          el("th", { text: r.name }),
          ...r.cells.map(c => el("td", {
            text: String(c.value), class: c.isLeader ? "leader" : ""
          })),
          el("td.total", { text: String(r.total) })
        ])))
      ]));
    } else if (s.kind === "now") {
      for (const r of s.rows) {
        body.appendChild(el("div.screen-now", {}, [
          el("div.screen-now-title", { text: r.main }),
          el("div.screen-now-sub", { text: r.sub })
        ]));
      }
    } else {
      for (const r of s.rows) {
        body.appendChild(el("div.screen-row", {}, [
          r.rank
            ? (hasMedal(r.rank) ? rankNode(r.rank, { size: 54, rankArt })
                                : el("span.screen-rank", { text: "#" + r.rank }))
            : null,
          el("div", { style: "flex:1;min-width:0" }, [
            el("div.screen-main", { text: r.main, style: r.nameColor || null }),
            r.sub ? el("div.screen-rowsub", { text: r.sub }) : null
          ]),
          r.value ? el("span.screen-value", { text: r.value }) : null
        ]));
      }
      if (!s.rows.length) body.appendChild(el("div.screen-rowsub", { text: "Nothing to show yet." }));
    }

    stage.append(head, body, el("div.screen-foot", {
      text: (window.__FEST_NAME__ || "") + "  ·  updates automatically"
    }));
  }

  await load();
  paint();
  timer = setInterval(paint, SLIDE_MS);
  refresh = setInterval(() => load().catch(() => {}), REFRESH_MS);

  // Route teardown — without this the timers keep firing after navigation.
  return () => { clearInterval(timer); clearInterval(refresh); };
}

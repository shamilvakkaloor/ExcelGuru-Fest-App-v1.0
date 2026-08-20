// Public home page: what's on now, who's leading, what just came in.
//
// Reads only snapshot documents (leaderboard, schedule, and the most recent
// published events), so a spectator refresh stays in single-digit reads.
import { el, card, badge, button, empty, loading } from "../lib/ui.js";
import { getOne, getAll, where } from "../lib/db.js";
import { topbar, homeForRole } from "../app.js";
import { session } from "../lib/session.js";
import { classLabel, rankIsPublic, houseTerm, housePluralTerm } from "../domain/constants.js";
import { gradeLabel } from "../domain/scoring.js";
import { rankNode, hasMedal } from "../lib/ranks.js";
import { darkenColor, lightenColor, nameColorStyle } from "../domain/houseColor.js";

export default async function homePage(root) {
  root.appendChild(topbar());

  const [settings, board, schedule] = await Promise.all([
    getOne("config", "festSettings").catch(() => null),
    getOne("publicLeaderboard", "main").catch(() => null),
    getOne("publicSchedule", "main").catch(() => null)
  ]);

  /* ── Now-on strip ─────────────────────────────────────────────── */
  const running = currentlyRunning(settings, schedule);
  if (running.length) {
    root.appendChild(el("div.now-strip", {}, [
      el("span.pulse"),
      el("span", { text: "NOW ON", style: "letter-spacing:.1em;font-size:.75rem;flex:0 0 auto" }),
      el("div.marquee", {}, el("span", { text: running.map(r =>
        `${r.title}${r.category ? " · " + r.category : ""}${r.venue ? " · " + r.venue : ""}${r.stage ? " · " + r.stage : ""}`
      ).join("     ◆     ") }))
    ]));
  }

  /* ── Hero ─────────────────────────────────────────────────────── */
  const heroInner = [];
  if (settings?.useLogo && settings?.logoData) {
    heroInner.push(el("img.logo-img", { src: settings.logoData, alt: settings.festName || "Fest" }));
  } else {
    heroInner.push(el("h1", { text: settings?.festName || "Fest Tabulation" }));
  }
  heroInner.push(el("div.rule"));
  heroInner.push(el("div.sub", {
    text: settings?.subtitle || settings?.schoolName || "Live results, schedule and participant lookup."
  }));
  // Settings → Public display decides this; "dark" is the default and what
  // every existing fest already shows.
  root.appendChild(el("div.hero" + (settings?.heroTheme === "light" ? ".hero-light" : ""),
    {}, el("div.wrap", {}, heroInner)));

  const wrap = el("div.wrap");
  root.appendChild(wrap);

  /* ── House standings, front and centre ────────────────────────── */
  // Championship-by-percentage, when it's the fest's chosen metric, ranks
  // and labels the podium too — the front page should not show a #1 that
  // disagrees with the one /results leads with.
  const usingChampionship = board?.championshipMode === "percentage" && board?.championship?.length;
  const houses = usingChampionship ? board.championship : (board?.houses || []);
  if (houses.length) {
    // Was hard-coded to 4, which simply hid houses 5 and up on a fest that
    // has more. 0 means show every house — so this cannot use `|| 4`, which
    // would turn that 0 straight back into 4.
    const raw = board?.homeHouseCards;
    const cardCount = (raw === undefined || raw === null || raw === "") ? 4 : Number(raw);
    const top = Number.isFinite(cardCount) && cardCount > 0 ? houses.slice(0, cardCount) : houses;
    const valueOf = h => usingChampionship ? h.percent : h.total;
    const labelOf = h => usingChampionship ? h.percent.toFixed(1) + "%" : (h.total ?? 0) + " pts";
    const max = Math.max(1, ...houses.map(h => valueOf(h) || 0));
    wrap.appendChild(card(
      el("div.podium", {}, top.map(h => {
        const cls = h.rank <= 3 ? "p" + h.rank : "pn";
        const bar = el("i", { style: "width:0%" });
        // Animate on the next frame so the transition actually runs.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => { bar.style.width = Math.round((valueOf(h) / max) * 100) + "%"; }));
        const style = board?.houseStyle?.[h.id] || {};
        // The score-card box takes a darker shade of the house's own color as
        // its background and a lighter shade as its text, so one color pick
        // yields a readable pair automatically instead of asking the admin
        // to choose two colors that must be kept in sync by hand.
        const bg = style.color ? darkenColor(style.color) : null;
        const fg = style.color ? lightenColor(style.color) : null;
        if (fg) bar.style.background = fg;
        const card = el("div.podium-card." + cls, {
          style: bg ? "background:" + bg : null
        }, [
          el("div.pos", { text: "#" + h.rank, style: fg ? "color:" + fg : null }),
          style.logoData
            ? el("img.house-crest", { src: style.logoData, alt: "" })
            : null,
          el("div.hname", { text: h.name, style: fg ? "color:" + fg : null }),
          el("div.hpts", { text: labelOf(h), style: fg ? "color:" + fg : null }),
          el("div.hbar", {}, bar)
        ]);
        return card;
      })),
      usingChampionship ? "Championship standings" : housePluralTerm(settings) + " standings",
      el("a.btn.btn-sm", { href: "#/results", text: "Full table" })));
  }

  /* ── Latest published results ─────────────────────────────────── */
  const feedBox = el("div.result-feed", {}, loading("Loading latest results…"));
  wrap.appendChild(card(feedBox, "Just published",
    el("a.btn.btn-sm", { href: "#/results", text: "All results" })));

  const rankLimit = board?.rankLimit ?? 3;
  const rankArt = board?.rankArt || {};
  const recent = await getAll("publicResults").catch(() => []);
  feedBox.innerHTML = "";
  if (!recent.length) {
    feedBox.appendChild(empty("Nothing published yet", "Results appear here the moment organisers release them."));
  } else {
    const latest = [...recent]
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, 4);
    for (const ev of latest) {
      const winners = (ev.entries || [])
        .filter(e => !e.isAbsent && rankIsPublic(e.rank, rankLimit));
      feedBox.appendChild(el("div", { style: "padding:.5rem 0 .2rem" }, [
        el("div", { style: "display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.3rem" }, [
          el("strong", { text: ev.eventName }),
          ev.categoryName ? badge(ev.categoryName, "badge-cat") : null,
          ev.eventClass ? badge(classLabel(ev.eventClass)) : null
        ]),
        ...winners.map(w => el("div.feed-item", {}, [
          hasMedal(w.rank)
            ? rankNode(w.rank, { size: 34, rankArt })
            : el("div.feed-rank.r" + w.rank, { text: String(w.rank) }),
          el("div", { style: "flex:1;min-width:0" }, [
            el("div", { text: (w.names || []).join(", "), style: nameColorStyle(board?.houseStyle, w.houseId) }),
            el("div.hint", { style: "margin:0", text: w.houseName || "" })
          ]),
          badge(w.grade ? gradeLabel(w.grade, settings) : "")
        ]))
      ]));
    }
  }

  /* ── Fest manual ──────────────────────────────────────────────── */
  // Hidden entirely when no link is set, rather than showing a dead button.
  // rel=noopener because this is an external destination the fest controls,
  // not a page of ours.
  if (settings?.manualUrl) {
    wrap.appendChild(card(el("div.btn-row", {}, [
      el("a.btn.btn-accent", {
        href: settings.manualUrl, target: "_blank", rel: "noopener noreferrer",
        text: "Download " + (settings.manualLabel || "the fest manual")
      })
    ]), settings.manualLabel || "Fest manual"));
  }

  /* ── Navigation tiles ─────────────────────────────────────────── */
  wrap.appendChild(el("h2", { text: "Explore", style: "margin-top:1.4rem" }));
  wrap.appendChild(el("div.home-tiles", {}, [
    tile("#/results", "Results & leaderboards", houseTerm(settings) + " totals, student talent board and every event table."),
    tile("#/lookup", "Find a participant", "Search by chest number or name to see events and results."),
    tile("#/schedule", "Schedule", "The full programme by venue and time."),
    tile("#/screen", "Big screen mode", "Rotating display for a projector or hall screen.")
  ]));

  /* ── Quick stats ──────────────────────────────────────────────── */
  wrap.appendChild(el("div.grid.grid-3", { style: "margin-top:1.2rem" }, [
    stat(board?.eventCount ?? 0, "Events published"),
    stat(houses.length, housePluralTerm(settings) + " competing"),
    stat(board?.students?.length ?? 0, "Participants scoring")
  ]));

  // I8 — there is deliberately NO "Open my panel" card down here.
  // The top bar carries it, top right, where it was asked for. v6 appended a
  // second copy at the bottom of this page, which is the one that kept being
  // seen "down" after logging in.

  function tile(href, title, desc) {
    return el("a.tile", { href }, [el("h3", { text: title }), el("p", { text: desc })]);
  }
  function stat(n, label) {
    return el("div.stat", {}, [el("div.n", { text: String(n) }), el("div.l", { text: label })]);
  }
}

/**
 * What is on right now.
 *
 * Derived from the published schedule by comparing the wall clock against
 * each slot's computed window, unless an Admin has pinned a specific event
 * — a manual override matters because real fests drift from the timetable.
 */
export function currentlyRunning(settings, schedule) {
  const allVenues = schedule?.days?.length
    ? schedule.days.flatMap(d => (d.venues || []).map(v => ({ ...v, date: d.date })))
    : (schedule?.venues || []);
  if (!schedule?.visible || !allVenues.length) return [];

  if (!settings?.runningEventAuto && settings?.runningEventId) {
    for (const v of allVenues) {
      for (const s of v.slots || []) {
        if (s.eventId === settings.runningEventId) {
          return [{ title: s.title, venue: v.name, category: s.categoryName || "", stage: s.stage || "" }];
        }
      }
    }
    return [];
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const mins = now.getHours() * 60 + now.getMinutes();
  const out = [];

  for (const v of allVenues) {
    if (v.date && v.date !== today) continue;      // a dated venue only counts on its day
    for (const s of v.slots || []) {
      const start = toMin(s.startTime), end = toMin(s.endTime);
      if (start === null || end === null) continue;
      if (mins >= start && mins < end && s.type === "event") {
        out.push({ title: s.title, venue: v.name, category: s.categoryName || "", stage: s.stage || "" });
      }
    }
  }
  return out;
}

function toMin(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

// Certificate and poster templates.
//
// A design is a plain array of positioned elements measured in millimetres
// against an A4 page, which keeps it resolution-independent: the same
// numbers drive the on-screen editor and the print output.
//
// Text elements may contain {placeholders}, substituted per participant or
// per event when generating.

export const A4 = { w: 297, h: 210 };           // landscape, millimetres
export const A4_PORTRAIT = { w: 210, h: 297 };
// A 16:9 "slide" is not a paper size — the mm units are just a coordinate
// system here, same as every other design. Sized to print/export cleanly
// at a normal screen resolution (1920×1080px @ ~144dpi).
export const SLIDE_16_9 = { w: 338.67, h: 190.5 };

export const PLACEHOLDERS = [
  { token: "{name}",      label: "Participant name" },
  { token: "{chest}",     label: "Chest number" },
  { token: "{house}",     label: "House" },
  // A colour, not text — usable only as a box `fill`/`stroke` or a text
  // `color`, resolved by elementStyle() the same way an image src resolves
  // {photo}. Lets one design carry every house's own identity (an accent
  // bar, say) without a copy per house — every template below uses it for
  // exactly that.
  { token: "{houseColor}", label: "House colour (box fill/stroke or text color)" },
  { token: "{category}",  label: "Category" },
  { token: "{class}",     label: "Class / grade" },
  { token: "{type}",      label: "Programme type" },
  { token: "{tier}",      label: "Programme tier" },
  { token: "{results}",   label: "All events & results" },
  { token: "{event}",     label: "Event name" },
  { token: "{rank}",      label: "Placement" },
  { token: "{grade}",     label: "Grade" },
  { token: "{eventResults}", label: "Every placement in one event, one per line" },
  /* Indexed per-placement tokens, for a results poster that lays each winner
   * out properly instead of listing them as lines of text. {eventResults} is
   * one text block, so it can never carry a photo; these can, because an
   * image element resolves a {token} src the same way a text element
   * resolves its own. n is the placement, so {rank1name} is the winner. */
  { token: "{rank1name}",  label: "1st place — name" },
  { token: "{rank1house}", label: "1st place — house" },
  { token: "{rank1houseColor}", label: "1st place — house colour" },
  { token: "{rank1photo}", label: "1st place — photo (image element)" },
  { token: "{rank2name}",  label: "2nd place — name" },
  { token: "{rank2house}", label: "2nd place — house" },
  { token: "{rank2houseColor}", label: "2nd place — house colour" },
  { token: "{rank2photo}", label: "2nd place — photo (image element)" },
  { token: "{rank3name}",  label: "3rd place — name" },
  { token: "{rank3house}", label: "3rd place — house" },
  { token: "{rank3houseColor}", label: "3rd place — house colour" },
  { token: "{rank3photo}", label: "3rd place — photo (image element)" },
  { token: "{fest}",      label: "Fest name" },
  { token: "{school}",    label: "School name" },
  { token: "{date}",      label: "Today's date" },
  { token: "{photo}",     label: "Participant photo (image element)" }
];

const el = (id, type, props) => ({ id, type, ...props });

/* Shared palette — the app's own vermilion-on-warm-black identity, restated
 * as literal hexes here because a design is standalone data with no access
 * to css/styles.css custom properties. Keep this in step with :root there if
 * the app's palette ever moves. */
const INK       = "#1A1818";
const INK_2     = "#6E6865";
const PAPER     = "#F6F5F2";
const ACCENT    = "#EC3013";
const WARM_GRAD = "linear-gradient(175deg, #FF7A18 0%, #EC3013 62%, #C42509 100%)";

/* Rank colours come in two registers, because the same gold/silver/bronze
 * cue has to work on both grounds this kit uses. The dark set is bright
 * enough to read on near-black; used at those same values on white it is
 * too light to pass 4.5:1 against paper, so the light set is a separately
 * darkened take on the same three metals, not a re-use of one palette. */
const RANK_DARK  = { 1: "#F5A524", 2: "#C7CDD4", 3: "#C98A4B" };
// Darkened from the metal's natural tone until each cleared 4.5:1 against
// PAPER (measured, not eyeballed) — the metal cue is set at 9pt on the
// results poster, well under WCAG's large-text threshold, so it needs the
// same contrast a body sentence would.
const RANK_LIGHT = { 1: "#94650D", 2: "#696E75", 3: "#966733" };
const PLACE_WORD = { 1: "FIRST", 2: "SECOND", 3: "THIRD", 4: "FOURTH", 5: "FIFTH" };

/**
 * Classic Gold — formal, bordered, serif. The one genuinely traditional
 * option in the kit: warm paper, a double rule, Georgia throughout. A
 * house-colour hairline sits between the name and the meta line — the one
 * touch of house identity a formal certificate gets, kept thin enough not
 * to compete with the gold border.
 */
function classicGold() {
  return {
    name: "Classic Gold",
    page: A4,
    background: "#FFFDF5",
    backgroundImage: null,
    elements: [
      el("border_outer", "box", { x: 8, y: 8, w: 281, h: 194, fill: "none", stroke: "#C79A2E", strokeWidth: 1.4, radius: 0 }),
      el("border_inner", "box", { x: 12, y: 12, w: 273, h: 186, fill: "none", stroke: "#E0C061", strokeWidth: 0.5, radius: 0 }),
      el("school", "text", { x: 30, y: 24, w: 237, text: "{school}", size: 10, font: "serif", color: "#8A6A1F", align: "center", weight: 400, spacing: 3 }),
      el("header", "text", { x: 30, y: 34, w: 237, text: "CERTIFICATE OF MERIT", size: 26, font: "serif", color: "#8A6A1F", align: "center", weight: 700, spacing: 2 }),
      el("subheader", "text", { x: 30, y: 58, w: 237, text: "Awarded to", size: 11, font: "serif", color: "#5B4A22", align: "center", weight: 400 }),
      el("name", "text", { x: 30, y: 68, w: 237, text: "{name}", size: 30, font: "serif", color: "#3A2E10", align: "center", weight: 700 }),
      // The house's own colour, standing in for the gold rule a purely
      // formal certificate would otherwise use twice.
      el("house_rule", "box", { x: 118.5, y: 90, w: 60, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 30, y: 94, w: 237, text: "{house} · Chest {chest} · {category}", size: 9, font: "sans", color: "#6E6865", align: "center", weight: 400, spacing: 1 }),
      el("results", "text", { x: 40, y: 105, w: 217, text: "{results}", size: 10, font: "sans", color: "#4A3D1C", align: "center", weight: 400, lineHeight: 1.6 }),
      el("date_lbl", "text", { x: 26, y: 178, w: 90, text: "Date: {date}", size: 9, font: "sans", color: "#5B4A22", align: "left", weight: 400 }),
      el("sig_line_l", "box", { x: 32, y: 176, w: 70, h: 0.4, fill: "#8A6A1F", stroke: "none", strokeWidth: 0 }),
      el("sig_text_l", "text", { x: 32, y: 178, w: 70, text: "FEST CONVENOR", size: 7.5, font: "sans", color: "#5B4A22", align: "left", weight: 400, spacing: 1.8 }),
      el("sig_line_r", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: "#8A6A1F", stroke: "none", strokeWidth: 0 }),
      el("sig_text_r", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "sans", color: "#5B4A22", align: "left", weight: 400, spacing: 1.8 })
    ]
  };
}

/**
 * Modern Indigo — rebuilt around a full-bleed colour rail rather than a
 * top band. The rail carries the fest identity (name, tagline, date); the
 * white column holds the participant's own record, headed by Space
 * Grotesk and a house-coloured underline in place of a fixed accent —
 * the certificate is now visibly THAT house's, not just the fest's.
 */
function modernIndigo() {
  const railW = 62, contentX = 78, page = A4;
  return {
    name: "Modern Indigo",
    page,
    background: "#FFFFFF",
    backgroundImage: null,
    elements: [
      el("rail", "box", { x: 0, y: 0, w: railW, h: page.h, fill: WARM_GRAD, stroke: "none", strokeWidth: 0, radius: 0 }),
      el("rail_fest", "text", { x: 14, y: 32, w: railW - 24, text: "{fest}", size: 15, font: "display", color: "#FFFFFF", align: "left", weight: 600 }),
      el("rail_sub", "text", { x: 14, y: 50, w: railW - 24, text: "{school}", size: 7, font: "mono", color: "rgba(255,255,255,.82)", align: "left", weight: 400, spacing: 1, lineHeight: 1.5 }),
      el("rail_rule", "box", { x: 14, y: 176, w: railW - 24, h: 0.5, fill: "rgba(255,255,255,.5)", stroke: "none", strokeWidth: 0 }),
      el("rail_date", "text", { x: 14, y: 180, w: railW - 24, text: "{date}", size: 7.5, font: "mono", color: "#FFFFFF", align: "left", weight: 400, spacing: 1 }),

      el("header", "text", { x: contentX, y: 22, w: 100, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1.5 }),
      el("school_r", "text", { x: contentX, y: 22, w: 201, text: "{school}", size: 8, font: "mono", color: "#1A1818", align: "right", weight: 400, spacing: 1 }),
      el("name", "text", { x: contentX, y: 52, w: 195, text: "{name}", size: 32, font: "display", color: "#1A1818", align: "left", weight: 600 }),
      el("house_rule", "box", { x: contentX, y: 90, w: 44, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: contentX, y: 95, w: 201, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 0.5 }),
      el("results_rule", "box", { x: contentX, y: 110, w: 201, h: 0.7, fill: "#1A1818", stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: contentX, y: 118, w: 175, text: "{results}", size: 11, font: "sans", color: "#3A3634", align: "left", weight: 400, lineHeight: 1.7 }),

      el("sig_line", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: "#1A1818", stroke: "none", strokeWidth: 0 }),
      el("sig_text", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1.8 })
    ]
  };
}

/**
 * With Photo — the same rail layout as Modern Indigo, but the rail is
 * dropped for a two-column header (school left, fest + date right) so the
 * portrait has room to sit at proper size beside the name, the pairing
 * the brief calls out as the point of this variant.
 */
function withPhoto() {
  const page = A4;
  return {
    name: "With Photo",
    page,
    background: "#FFFFFF",
    backgroundImage: null,
    elements: [
      el("school", "text", { x: 31, y: 20, w: 120, text: "{school}", size: 8, font: "mono", color: "#1A1818", align: "left", weight: 400, spacing: 1 }),
      el("fest_r", "text", { x: 157, y: 20, w: 120, text: "{fest} · {date}", size: 8, font: "mono", color: "#6E6865", align: "right", weight: 400, spacing: 0.5 }),
      el("header_rule", "box", { x: 20, y: 32, w: 257, h: 0.7, fill: "#1A1818", stroke: "none", strokeWidth: 0 }),

      el("photo", "image", { x: 24, y: 54, w: 40, h: 40, src: "{photo}", radius: 20, fit: "cover", stroke: "{houseColor}", strokeWidth: 1 }),

      el("header", "text", { x: 76, y: 54, w: 190, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1.5 }),
      el("name", "text", { x: 76, y: 62, w: 190, text: "{name}", size: 30, font: "display", color: "#1A1818", align: "left", weight: 600 }),
      el("house_rule", "box", { x: 76, y: 94, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 76, y: 99, w: 190, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 0.5 }),
      el("results", "text", { x: 76, y: 120, w: 190, text: "{results}", size: 11, font: "sans", color: "#3A3634", align: "left", weight: 400, lineHeight: 1.7 }),

      el("sig_line", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: "#1A1818", stroke: "none", strokeWidth: 0 }),
      el("sig_text", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1.8 }),
      el("fest_l", "text", { x: 20, y: 178, w: 70, text: "{fest}", size: 7.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1 })
    ]
  };
}

/**
 * Winner Poster — one page per rank-holder. The placement word is now the
 * single biggest mark on the page (64pt) rather than the name, on the
 * theory that "FIRST" is what a corridor reads first; the event name
 * takes the accent colour instead of white, so it stays legible at a
 * glance without competing with the placement. The house-colour hairline
 * above the meta line is this design's one identity cue, same idea as the
 * certificates.
 */
function winnerPoster() {
  const page = A4_PORTRAIT;
  return {
    name: "Winner Poster",
    page,
    background: "#14232E",
    backgroundImage: null,
    elements: [
      el("glow", "box", { x: -40, y: -40, w: 180, h: 180, fill: "#6C4BD6", stroke: "none", strokeWidth: 0, radius: 90, opacity: 0.3 }),
      el("mark", "box", { x: 16, y: 16, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0, radius: 1 }),
      el("eyebrow", "text", { x: 16, y: 30, w: 178, text: "{fest} · {school}", size: 9, font: "mono", color: "rgba(255,255,255,.62)", align: "center", weight: 400, spacing: 1.5 }),
      el("event", "text", { x: 15, y: 42, w: 180, text: "{event}", size: 22, font: "display", color: ACCENT, align: "center", weight: 600 }),
      el("event_rule", "box", { x: 75, y: 68, w: 60, h: 0.7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),

      el("photo", "image", { x: 70, y: 82, w: 70, h: 70, src: "{photo}", radius: 35, fit: "cover", stroke: "rgba(255,255,255,.14)", strokeWidth: 1.2 }),

      el("place", "text", { x: 15, y: 155, w: 180, text: "{rank}", size: 60, font: "display", color: "#FFFFFF", align: "center", weight: 700 }),
      el("name", "text", { x: 15, y: 196, w: 180, text: "{name}", size: 22, font: "sans", color: "#FFFFFF", align: "center", weight: 700 }),
      el("house_rule", "box", { x: 85, y: 232, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 15, y: 237, w: 180, text: "{house} · Chest {chest} · {category}", size: 9, font: "mono", color: "rgba(255,255,255,.7)", align: "center", weight: 400, spacing: 0.5 }),

      el("footer_rule", "box", { x: 16, y: 272, w: 178, h: 0.4, fill: "rgba(255,255,255,.28)", stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 276, w: 178, text: "{fest}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "left", weight: 400, spacing: 1 }),
      el("footer_r", "text", { x: 16, y: 276, w: 178, text: "{date}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "right", weight: 400, spacing: 1 })
    ]
  };
}

/**
 * Event Results — Poster. Redrawn on a light, warm ground rather than the
 * old dark navy: the brief flags ink cost as real, and this is the design
 * most likely to be printed in volume, one per event. Each row keeps its
 * own metal cue (gold/silver/bronze) AND its winner's house colour, in
 * the paper-safe register — see RANK_LIGHT above.
 */
function eventRanksPoster() {
  const row = (n, y) => {
    const accent = RANK_LIGHT[n] || INK_2;
    return [
      el(`r${n}photo`, "image", { x: 22, y, w: 34, h: 34, src: `{rank${n}photo}`, radius: 17,
                                  fit: "cover", stroke: `{rank${n}houseColor}`, strokeWidth: 1 }),
      el(`r${n}place`, "text", { x: 64, y: y + 2, w: 126, text: PLACE_WORD[n] || `PLACE ${n}`, size: 9, font: "mono",
                                 color: accent, align: "left", weight: 700, spacing: 1.5 }),
      el(`r${n}name`, "text", { x: 64, y: y + 10, w: 126, text: `{rank${n}name}`, size: 18, font: "sans",
                                color: INK, align: "left", weight: 700 }),
      el(`r${n}houserule`, "box", { x: 64, y: y + 24, w: 16, h: 1.2, fill: `{rank${n}houseColor}`, stroke: "none", strokeWidth: 0 }),
      el(`r${n}house`, "text", { x: 64, y: y + 27, w: 126, text: `{rank${n}house}`, size: 9, font: "mono",
                                 color: INK_2, align: "left", weight: 400, spacing: 0.5 })
    ];
  };
  return {
    name: "Event Results — Poster",
    page: A4_PORTRAIT,
    background: PAPER,
    backgroundImage: null,
    elements: [
      el("glow", "box", { x: -30, y: -30, w: 270, h: 90, fill: ACCENT, stroke: "none", strokeWidth: 0, radius: 0, opacity: 0.1 }),
      el("mark", "box", { x: 20, y: 16, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0, radius: 1 }),
      el("eyebrow", "text", { x: 30, y: 18, w: 160, text: "{fest} · {school}", size: 8, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 1 }),
      el("event", "text", { x: 20, y: 34, w: 170, text: "{event}", size: 26, font: "display", color: INK, align: "left", weight: 600 }),
      el("category", "text", { x: 20, y: 56, w: 170, text: "{category} · FINAL RESULT", size: 9.5, font: "mono", color: ACCENT, align: "left", weight: 400, spacing: 1 }),
      el("header_rule", "box", { x: 20, y: 68, w: 170, h: 0.7, fill: INK, stroke: "none", strokeWidth: 0 }),

      ...row(1, 92),
      ...row(2, 142),
      ...row(3, 192),

      el("footer_rule", "box", { x: 20, y: 272, w: 170, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 20, y: 276, w: 170, text: "{school}", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 0.5 }),
      el("footer_r", "text", { x: 20, y: 276, w: 170, text: "{date}", size: 7.5, font: "mono", color: INK_2, align: "right", weight: 400, spacing: 0.5 })
    ]
  };
}

/**
 * Event Results — Screen (16:9). Stays dark, unlike the poster above — a
 * projector benefits from a dark ground the same way the poster benefits
 * from saving ink, so the two deliberately diverge here. Podium layout:
 * winner centred, higher and larger, each with a small "medal plate"
 * numeral beneath their name.
 */
function eventRanksScreen() {
  const { w, h } = SLIDE_16_9;
  const medal = (n, cx, y, accent) => [
    el(`r${n}medal`, "box", { x: cx - 30, y, w: 60, h: 26, fill: "#262322", stroke: "none", strokeWidth: 0, radius: 3 }),
    el(`r${n}medaltop`, "box", { x: cx - 30, y, w: 60, h: 0.8, fill: accent, stroke: "none", strokeWidth: 0 }),
    el(`r${n}medalnum`, "text", { x: cx - 30, y: y + 6, w: 60, text: String(n), size: 14, font: "mono",
                                  color: accent, align: "center", weight: 700 })
  ];
  const col = (n, cx, top, photo) => {
    const accent = RANK_DARK[n] || "#FFFFFF";
    return [
      el(`r${n}place`, "text", { x: cx - 50, y: top, w: 100, text: PLACE_WORD[n] || `PLACE ${n}`, size: 12, font: "mono",
                                 color: accent, align: "center", weight: 400, spacing: 2 }),
      el(`r${n}photo`, "image", { x: cx - photo / 2, y: top + 12, w: photo, h: photo, src: `{rank${n}photo}`,
                                  radius: photo / 2, fit: "cover", stroke: `{rank${n}houseColor}`, strokeWidth: 1 }),
      el(`r${n}name`, "text", { x: cx - 50, y: top + 12 + photo + 6, w: 100, text: `{rank${n}name}`, size: n === 1 ? 20 : 17,
                                font: "sans", color: "#FFFFFF", align: "center", weight: 700 }),
      el(`r${n}house`, "text", { x: cx - 50, y: top + 12 + photo + 20, w: 100, text: `{rank${n}house}`, size: 11,
                                 font: "mono", color: "rgba(255,255,255,.68)", align: "center", weight: 400, spacing: 0.5 }),
      ...medal(n, cx, top + 12 + photo + 32, accent)
    ];
  };
  return {
    name: "Event Results — Screen (16:9)",
    page: SLIDE_16_9,
    background: "#14232E",
    backgroundImage: null,
    elements: [
      el("glow", "box", { x: -50, y: -50, w: 220, h: 220, fill: "#6C4BD6", stroke: "none", strokeWidth: 0, radius: 110, opacity: 0.3 }),
      el("mark", "box", { x: 16, y: 12, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0, radius: 1 }),
      el("eyebrow", "text", { x: 27, y: 13.5, w: 200, text: "{fest}", size: 10, font: "mono", color: "rgba(255,255,255,.6)", align: "left", weight: 400, spacing: 1.5 }),
      el("event", "text", { x: 16, y: 24, w: w - 32, text: "{event}", size: 30, font: "display", color: "#FFFFFF", align: "left", weight: 600 }),
      el("category", "text", { x: 16, y: 40, w: w - 32, text: "{category}", size: 12, font: "mono", color: ACCENT, align: "center", weight: 400, spacing: 2 }),
      el("header_rule", "box", { x: 16, y: 44, w: w - 32, h: 0.6, fill: "rgba(255,255,255,.25)", stroke: "none", strokeWidth: 0 }),

      ...col(2, w / 2 - 105, 66, 38),
      ...col(1, w / 2,       52, 48),
      ...col(3, w / 2 + 105, 66, 38),

      el("footer_l", "text", { x: 16, y: h - 12.5, w: w - 32, text: "{school}", size: 10, font: "mono", color: "rgba(255,255,255,.5)", align: "left", weight: 400, spacing: 0.5 }),
      el("footer_r", "text", { x: 16, y: h - 12.5, w: w - 32, text: "{date}", size: 10, font: "mono", color: "rgba(255,255,255,.5)", align: "right", weight: 400, spacing: 0.5 })
    ]
  };
}

/**
 * Participant ID card — CR80, the standard badge/credit-card size
 * (85.6 × 54mm), not A4. `design.page` is a plain {w,h} with no built-in
 * assumption of A4 anywhere in designRender.js or the print pipeline, so a
 * template just states the size it actually needs.
 *
 * Uses only participant-level tokens (name, chest, house, category, class,
 * photo, fest, school) — no {event}/{rank}/{results}, so it renders from
 * "Every registered participant" with no published result required, same
 * as a participation certificate.
 *
 * Chest number is now the dominant mark (18pt mono), bigger than the name
 * above it — a marshal reads the number at arm's length, not the name, so
 * the hierarchy is inverted from a certificate's.
 */
function idCard() {
  const w = 85.6, h = 54, bandH = 16;
  return {
    name: "Participant ID Card — Landscape",
    page: { w, h },
    background: "#FFFFFF",
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: bandH, fill: WARM_GRAD, stroke: "none", strokeWidth: 0, radius: 0 }),
      el("mark", "box", { x: 4, y: 4.5, w: 5, h: 5, fill: "#FFFFFF", stroke: "none", strokeWidth: 0, radius: 1 }),
      el("fest", "text", { x: 11, y: 4, w: 50, text: "{fest}", size: 8, font: "display", color: "#FFFFFF", align: "left", weight: 600 }),
      el("school", "text", { x: 11, y: 9, w: 60, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.85)", align: "left", weight: 400, spacing: 0.5, lineHeight: 1.3 }),

      el("photo", "image", { x: 4, y: 18, w: 20, h: 20, src: "{photo}", radius: 10, fit: "cover" }),

      el("name", "text", { x: 27, y: 18, w: w - 31, text: "{name}", size: 9, font: "sans", color: "#1A1818", align: "left", weight: 700, lineHeight: 1.15 }),
      el("chest_lbl", "text", { x: 27, y: 27.5, w: w - 31, text: "CHEST NO.", size: 5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 1 }),
      el("chest", "text", { x: 27, y: 30, w: w - 31, text: "{chest}", size: 18, font: "mono", color: "#1A1818", align: "left", weight: 700 }),
      el("house_rule", "box", { x: 27, y: 41, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 27, y: 43.5, w: 56, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: "#6E6865", align: "left", weight: 400, spacing: 0.3 }),

      el("footer", "text", { x: 4, y: 50, w: 77.6, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: "#8C8681", align: "left", weight: 400, spacing: 0.5 }),
      el("border", "box", { x: 1, y: 1, w: w - 2, h: h - 2, fill: "none", stroke: "#E4E1DC", strokeWidth: 0.3, radius: 2 })
    ]
  };
}

/**
 * The same card turned upright (54 × 85.6mm) — the shape a lanyard holder
 * actually is, so a fest handing out hanging badges does not have to
 * rebuild the landscape one by hand. A small pale notch at the top stands
 * in for the lanyard punch hole. Photo sits above the name rather than
 * beside it, which is the whole reason to turn it, and everything below
 * centres to match.
 */
function idCardPortrait() {
  const w = 54, h = 85.6, bandH = 18;
  return {
    name: "Participant ID Card — Portrait",
    page: { w, h },
    background: "#FFFFFF",
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: bandH, fill: WARM_GRAD, stroke: "none", strokeWidth: 0, radius: 0 }),
      el("punch", "box", { x: (w - 10) / 2, y: 2.4, w: 10, h: 1.6, fill: "rgba(255,255,255,.55)", stroke: "none", strokeWidth: 0, radius: 3 }),
      el("fest", "text", { x: 3, y: 6.6, w: w - 6, text: "{fest}", size: 8, font: "display", color: "#FFFFFF", align: "center", weight: 600 }),
      el("school", "text", { x: 3, y: 11.4, w: w - 6, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.85)", align: "center", weight: 400, spacing: 0.5 }),

      el("photo", "image", { x: (w - 26) / 2, y: bandH + 6, w: 26, h: 26, src: "{photo}", radius: 13, fit: "cover" }),

      el("name", "text", { x: 3, y: bandH + 34, w: w - 6, text: "{name}", size: 9, font: "sans", color: "#1A1818", align: "center", weight: 700, lineHeight: 1.15 }),
      el("chest_lbl", "text", { x: 3, y: bandH + 42.5, w: w - 6, text: "CHEST NO.", size: 5, font: "mono", color: "#6E6865", align: "center", weight: 400, spacing: 1 }),
      el("chest", "text", { x: 3, y: bandH + 45, w: w - 6, text: "{chest}", size: 18, font: "mono", color: "#1A1818", align: "center", weight: 700 }),
      el("house_rule", "box", { x: (w - 16) / 2, y: bandH + 55, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 3, y: bandH + 57.5, w: w - 6, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: "#6E6865", align: "center", weight: 400, spacing: 0.3 }),

      el("footer_mark", "box", { x: 17, y: h - 4.2, w: 2.6, h: 2.6, fill: ACCENT, stroke: "none", strokeWidth: 0, radius: 1 }),
      el("footer", "text", { x: 21, y: h - 4, w: 30, text: "{fest}", size: 4.5, font: "mono", color: "#8C8681", align: "left", weight: 400, spacing: 0.3 }),
      el("border", "box", { x: 1, y: 1, w: w - 2, h: h - 2, fill: "none", stroke: "#E4E1DC", strokeWidth: 0.3, radius: 2 })
    ]
  };
}

export const TEMPLATES = {
  classicGold, modernIndigo, withPhoto, winnerPoster, idCard, idCardPortrait,
  eventRanksPoster, eventRanksScreen
};

export const TEMPLATE_LIST = [
  { id: "classicGold",  label: "Classic Gold",  kind: "certificate" },
  { id: "modernIndigo", label: "Modern Indigo", kind: "certificate" },
  { id: "withPhoto",    label: "With Photo",    kind: "certificate" },
  { id: "winnerPoster", label: "Winner Poster", kind: "poster" },
  { id: "eventRanksPoster", label: "Event Results (all ranks)",         kind: "poster" },
  { id: "eventRanksScreen", label: "Event Results (all ranks) — 16:9", kind: "poster" },
  { id: "idCard",       label: "Participant ID Card — Landscape", kind: "idcard" },
  { id: "idCardPortrait", label: "Participant ID Card — Portrait", kind: "idcard" }
];

export const TEMPLATE_KIND_LABEL = {
  certificate: "Certificates",
  poster: "Posters",
  idcard: "ID cards"
};

export function loadTemplate(id) {
  const fn = TEMPLATES[id] || TEMPLATES.classicGold;
  return fn();
}

/** Substitute {tokens} in a string from a data object. */
export function fillTokens(text, data) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : "");
}

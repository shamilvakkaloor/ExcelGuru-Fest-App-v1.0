// Certificate and poster templates.
//
// A design is a plain array of positioned elements measured in millimetres
// against an A4 page, which keeps it resolution-independent: the same
// numbers drive the on-screen editor and the print output.
//
// Text elements may contain {placeholders}, substituted per participant or
// per event when generating.
//
// The eight designs below are the commissioned kit (see
// Fest-App-Design-Brief.md), transcribed from the design canvas at true
// millimetre scale — positions, sizes, colours and letter-spacing are the
// design's own values, not approximations.

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

/* ── Palette ───────────────────────────────────────────────────────
 * The app's own vermilion-on-warm-black identity, restated as literal
 * values here because a design is standalone data with no access to
 * css/styles.css custom properties. Keep in step with :root there.       */
const INK     = "#1A1818";   // warm near-black
const INK_2   = "#6E6865";   // secondary
const INK_3   = "#3A3634";   // body copy
const INK_4   = "#8C8681";   // faint captions
const HAIRLINE = "#C4BFB8";
const ACCENT  = "#EC3013";

/* Grounds are gradients, not flat fills — that is the point of the kit, and
 * what makes a poster on the wall and the screen behind it read as one
 * product. Stored as ordinary CSS background shorthand: renderPageHTML puts
 * design.background straight into `background:`, and a box's `fill` the
 * same way, so a multi-stop gradient needs no new element type. The dark
 * grounds are WARM (a near-black that carries red), not the blue-navy the
 * previous templates used — that navy was the "does not match the app"
 * flaw the design brief was commissioned to fix. */
const GROUND_FORMAL = "radial-gradient(120% 90% at 100% 0%, #FFF6EE 0%, rgba(255,246,238,0) 55%), " +
                      "radial-gradient(110% 80% at 0% 100%, #F6E9E4 0%, rgba(246,233,228,0) 60%), " +
                      "linear-gradient(165deg, #FFFFFF 0%, #F6F5F2 55%, #EFEBE6 100%)";
const GROUND_MODERN = "linear-gradient(200deg, #FFFFFF 0%, #F6F5F2 50%, #F3EAE6 100%)";
const GROUND_PHOTO  = "radial-gradient(80% 70% at 6% 26%, rgba(236,48,19,.16) 0%, rgba(236,48,19,0) 62%), " +
                      "radial-gradient(90% 70% at 100% 100%, #FFEFE2 0%, rgba(255,239,226,0) 65%), " +
                      "linear-gradient(150deg, #FFFFFF 0%, #F6F5F2 60%, #EFEAE4 100%)";
const GROUND_WINNER = "radial-gradient(70% 42% at 50% 30%, rgba(236,48,19,.42) 0%, rgba(236,48,19,0) 68%), " +
                      "radial-gradient(90% 45% at 50% 100%, rgba(255,122,24,.20) 0%, rgba(255,122,24,0) 70%), " +
                      "linear-gradient(185deg, #3A1008 0%, #241512 34%, #1A1818 70%, #120F0E 100%)";
const GROUND_RESULTS = "radial-gradient(90% 26% at 50% 0%, rgba(245,165,36,.22) 0%, rgba(245,165,36,0) 70%), " +
                       "radial-gradient(80% 30% at 0% 4%, rgba(236,48,19,.14) 0%, rgba(236,48,19,0) 68%), " +
                       "linear-gradient(180deg, #FFFAF3 0%, #F6F5F2 42%, #EFEBE6 100%)";
const GROUND_SCREEN = "radial-gradient(42% 68% at 50% 62%, rgba(245,165,36,.20) 0%, rgba(245,165,36,0) 70%), " +
                      "radial-gradient(75% 90% at 0% 0%, rgba(236,48,19,.34) 0%, rgba(236,48,19,0) 62%), " +
                      "radial-gradient(70% 90% at 100% 100%, rgba(255,122,24,.16) 0%, rgba(255,122,24,0) 66%), " +
                      "linear-gradient(155deg, #2E120A 0%, #1F1614 40%, #1A1818 72%, #100E0D 100%)";
const GROUND_CARD_L = "radial-gradient(90% 70% at 100% 100%, #FFEFE4 0%, rgba(255,239,228,0) 68%), " +
                      "linear-gradient(160deg, #FFFFFF 0%, #F6F5F2 70%, #EFEAE4 100%)";
const GROUND_CARD_P = "radial-gradient(80% 50% at 50% 100%, #FFEFE4 0%, rgba(255,239,228,0) 70%), " +
                      "linear-gradient(170deg, #FFFFFF 0%, #F6F5F2 66%, #EFEAE4 100%)";

/* The vermilion rail/band, in the three angles the kit uses. */
const RAIL_CERT  = "linear-gradient(175deg, #FF7A18 0%, #EC3013 42%, #C42509 78%, #9E1B06 100%)";
const BAND_CARD_L = "linear-gradient(100deg, #FF7A18 0%, #EC3013 46%, #C42509 100%)";
const BAND_CARD_P = "linear-gradient(165deg, #FF7A18 0%, #EC3013 48%, #C42509 100%)";
const MARK_GRAD   = "linear-gradient(150deg,#FF7A18,#EC3013 60%,#C42509)";

/* Rank colours come in two registers, because the same gold/silver/bronze
 * cue has to work on both grounds this kit uses. */
const RANK_DARK  = { 1: "#F5A524", 2: "#C7CDD4", 3: "#C98A4B" };
/* The design's own light-ground metals were #B57B10 / #8A919A / #A06E36.
 * Measured against the paper ground they come out at 3.32 / 2.92 / 4.03:1
 * — and these labels are set at 9pt, well under the large-text threshold,
 * so all three miss 4.5:1 and silver badly. Darkened just far enough to
 * clear it (4.67 / 4.71 / 4.50) while keeping each metal recognisable. */
const RANK_LIGHT = { 1: "#94650D", 2: "#696E75", 3: "#966733" };
const PLACE_WORD = { 1: "FIRST", 2: "SECOND", 3: "THIRD", 4: "FOURTH", 5: "FIFTH" };

/**
 * 01 · Formal — Georgia, ruled frame, symmetric.
 *
 * The one genuinely traditional option: a double frame, small-caps
 * lettering and everything centred on the page's axis. The house-colour bar
 * under the name is the single identity cue a formal certificate gets.
 */
function classicGold() {
  return {
    name: "Classic Gold",
    page: A4,
    background: GROUND_FORMAL,
    backgroundImage: null,
    elements: [
      el("frame_outer", "box", { x: 10, y: 10, w: 277, h: 190, fill: "none", stroke: INK, strokeWidth: 0.7, radius: 0 }),
      el("frame_inner", "box", { x: 13, y: 13, w: 271, h: 184, fill: "none", stroke: HAIRLINE, strokeWidth: 0.25, radius: 0 }),
      el("mark", "box", { x: 144.5, y: 22, w: 8, h: 8, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 10, y: 32, w: 277, text: "{school}", size: 8.5, font: "mono", color: INK_2, align: "center", weight: 400, spacing: 7.2, uppercase: true }),
      el("header", "text", { x: 10, y: 42, w: 277, text: "CERTIFICATE OF MERIT", size: 15, font: "serif", color: INK, align: "center", weight: 400, spacing: 15.9 }),
      el("header_rule", "box", { x: 133, y: 54, w: 31, h: 0.7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("awarded", "text", { x: 10, y: 60, w: 277, text: "AWARDED TO", size: 7.5, font: "mono", color: INK_2, align: "center", weight: 400, spacing: 6.9 }),
      el("name", "text", { x: 38.5, y: 68, w: 220, text: "{name}", size: 30, font: "serif", color: INK, align: "center", weight: 400, lineHeight: 1.15 }),
      el("house_rule", "box", { x: 118.5, y: 90, w: 60, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 10, y: 94, w: 277, text: "{house} · Chest {chest} · {category}", size: 8, font: "mono", color: INK_2, align: "center", weight: 400, spacing: 4.5, uppercase: true }),
      el("results", "text", { x: 48.5, y: 105, w: 200, text: "{results}", size: 11, font: "sans", color: INK_3, align: "center", weight: 400, lineHeight: 1.75 }),
      el("sig_rule_l", "box", { x: 32, y: 176, w: 70, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("sig_l", "text", { x: 32, y: 178, w: 70, text: "FEST CONVENOR", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8 }),
      el("sig_rule_r", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("sig_r", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8 }),
      el("footer", "text", { x: 10, y: 178, w: 277, text: "{fest} · {date}", size: 8, font: "mono", color: INK, align: "center", weight: 400, spacing: 4 })
    ]
  };
}

/**
 * 02 · Modern — flat vermilion rail, flush left.
 *
 * The rail carries the fest's identity down the left edge; the wide column
 * holds the participant's own record. Nothing is centred, which is what
 * separates it from the formal sheet above rather than a change of typeface
 * alone.
 */
function modernIndigo() {
  const railW = 62, cx = 78;
  return {
    name: "Modern Indigo",
    page: A4,
    background: GROUND_MODERN,
    backgroundImage: null,
    elements: [
      el("rail", "box", { x: 0, y: 0, w: railW, h: 210, fill: RAIL_CERT, stroke: "none", strokeWidth: 0 }),
      el("rail_mark", "box", { x: 14, y: 18, w: 8, h: 8, fill: "#FFFFFF", stroke: "none", strokeWidth: 0 }),
      el("rail_fest", "text", { x: 14, y: 32, w: 40, text: "{fest}", size: 15, font: "display", color: "#FFFFFF", align: "left", weight: 600, lineHeight: 1.1 }),
      el("rail_sub", "text", { x: 14, y: 50, w: 40, text: "{school}", size: 7, font: "mono", color: "rgba(255,255,255,.82)", align: "left", weight: 400, spacing: 4.4, lineHeight: 1.7, uppercase: true }),
      el("rail_rule", "box", { x: 14, y: 176, w: 40, h: 0.5, fill: "rgba(255,255,255,.5)", stroke: "none", strokeWidth: 0 }),
      el("rail_date", "text", { x: 14, y: 180, w: 40, text: "{date}", size: 7.5, font: "mono", color: "#FFFFFF", align: "left", weight: 400, spacing: 3.7 }),

      el("header", "text", { x: cx, y: 22, w: 201, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 6.8 }),
      el("school", "text", { x: cx, y: 22, w: 201, text: "{school}", size: 8, font: "mono", color: INK, align: "right", weight: 400, spacing: 4, uppercase: true }),
      el("name", "text", { x: cx, y: 52, w: 195, text: "{name}", size: 32, font: "display", color: INK, align: "left", weight: 600, lineHeight: 1.08 }),
      el("house_rule", "box", { x: cx, y: 90, w: 44, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: cx, y: 95, w: 201, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8, uppercase: true }),
      el("results_rule", "box", { x: cx, y: 110, w: 201, h: 0.7, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: cx, y: 118, w: 175, text: "{results}", size: 11, font: "sans", color: INK_3, align: "left", weight: 400, lineHeight: 1.75 }),

      el("sig_rule", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8 })
    ]
  };
}

/**
 * 03 · With photo — 40mm circle left of the name.
 *
 * A rule across the head rather than a rail, so the portrait has the whole
 * left column to itself. 40mm is the largest photo box in the kit that the
 * 240px source still carries acceptably.
 */
function withPhoto() {
  return {
    name: "With Photo",
    page: A4,
    background: GROUND_PHOTO,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 20, y: 18, w: 8, h: 8, fill: MARK_GRAD, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 31, y: 20, w: 120, text: "{school}", size: 8, font: "mono", color: INK, align: "left", weight: 400, spacing: 5.6, uppercase: true }),
      el("festdate", "text", { x: 157, y: 20, w: 120, text: "{fest} · {date}", size: 8, font: "mono", color: INK_2, align: "right", weight: 400, spacing: 4 }),
      el("head_rule", "box", { x: 20, y: 32, w: 257, h: 0.7, fill: INK, stroke: "none", strokeWidth: 0 }),

      el("photo", "image", { x: 24, y: 54, w: 40, h: 40, src: "{photo}", radius: 20, fit: "cover" }),

      el("header", "text", { x: 76, y: 54, w: 190, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 6.8 }),
      el("name", "text", { x: 76, y: 62, w: 190, text: "{name}", size: 30, font: "display", color: INK, align: "left", weight: 600, lineHeight: 1.1 }),
      el("house_rule", "box", { x: 76, y: 94, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 76, y: 99, w: 190, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8, uppercase: true }),
      el("hairline", "box", { x: 20, y: 112, w: 257, h: 0.25, fill: HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: 76, y: 120, w: 190, text: "{results}", size: 11, font: "sans", color: INK_3, align: "left", weight: 400, lineHeight: 1.75 }),

      el("sig_rule", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8 }),
      el("footer", "text", { x: 20, y: 178, w: 70, text: "{fest}", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.8 })
    ]
  };
}

/**
 * 04 · Winner poster — full-bleed warm dark, one page per rank-holder.
 *
 * The placement is the biggest mark on the sheet at 64pt, because that is
 * what a corridor reads first; the event name takes the accent colour
 * rather than white so it stays legible without competing. The ring around
 * the portrait is a separate box, not the image's own border — it sits 4mm
 * clear of the photo, which disguises the softness of a 240px source
 * blown up to 70mm.
 */
function winnerPoster() {
  return {
    name: "Winner Poster",
    page: A4_PORTRAIT,
    background: GROUND_WINNER,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 16, y: 16, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 16, y: 30, w: 178, text: "{fest} · {school}", size: 9, font: "mono", color: "rgba(255,255,255,.62)", align: "center", weight: 400, spacing: 8.9, uppercase: true }),
      el("event", "text", { x: 16, y: 42, w: 178, text: "{event}", size: 15, font: "display", color: ACCENT, align: "center", weight: 600, spacing: 7.4, uppercase: true }),
      el("event_rule", "box", { x: 75, y: 68, w: 60, h: 0.7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),

      el("photo_ring", "box", { x: 66, y: 78, w: 78, h: 78, fill: "none", stroke: ACCENT, strokeWidth: 0.8, radius: 39 }),
      el("photo", "image", { x: 70, y: 82, w: 70, h: 70, src: "{photo}", radius: 35, fit: "cover" }),

      el("place", "text", { x: 15, y: 158, w: 180, text: "{rank}", size: 64, font: "display", color: "#FFFFFF", align: "center", weight: 700, lineHeight: 0.95, uppercase: true }),
      el("name", "text", { x: 15, y: 196, w: 180, text: "{name}", size: 22, font: "sans", color: "#FFFFFF", align: "center", weight: 700, lineHeight: 1.16 }),
      el("house_rule", "box", { x: 85, y: 232, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 15, y: 237, w: 180, text: "{house} · Chest {chest} · {category}", size: 9, font: "mono", color: "rgba(255,255,255,.7)", align: "center", weight: 400, spacing: 6.4, uppercase: true }),

      el("footer_rule", "box", { x: 16, y: 272, w: 178, h: 0.4, fill: "rgba(255,255,255,.28)", stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 276, w: 178, text: "{fest}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "left", weight: 400, spacing: 4.2, uppercase: true }),
      el("footer_r", "text", { x: 16, y: 276, w: 178, text: "{date}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "right", weight: 400, spacing: 4.2 })
    ]
  };
}

/**
 * 05 · Event results poster — light ground, one row per placement.
 *
 * Light deliberately: this is the design most likely to be printed in
 * volume, one sheet per event, and the brief flags ink cost as real. Each
 * row is self-contained — photo ring, metal label, name, house bar — so a
 * placement nobody holds leaves a gap rather than collapsing the layout.
 */
function eventRanksPoster() {
  const row = (n, y) => {
    const metal = RANK_LIGHT[n] || INK_2;
    return [
      el(`r${n}photo`, "image", { x: 22, y, w: 34, h: 34, src: `{rank${n}photo}`, radius: 17,
                                  fit: "cover", stroke: RANK_DARK[n] || HAIRLINE, strokeWidth: 0.8 }),
      el(`r${n}place`, "text", { x: 64, y: y + 2, w: 126, text: PLACE_WORD[n] || `PLACE ${n}`, size: 9, font: "mono",
                                 color: metal, align: "left", weight: 400, spacing: 7 }),
      el(`r${n}name`, "text", { x: 64, y: y + 10, w: 126, text: `{rank${n}name}`, size: 18, font: "sans",
                                color: INK, align: "left", weight: 700, lineHeight: 1.15 }),
      el(`r${n}bar`, "box", { x: 64, y: y + 24, w: 16, h: 1.2, fill: `{rank${n}houseColor}`, stroke: "none", strokeWidth: 0 }),
      el(`r${n}house`, "text", { x: 64, y: y + 27, w: 126, text: `{rank${n}house}`, size: 9, font: "mono",
                                 color: INK_2, align: "left", weight: 400, spacing: 4.4, uppercase: true }),
      el(`r${n}div`, "box", { x: 20, y: y + 40, w: 170, h: 0.25, fill: HAIRLINE, stroke: "none", strokeWidth: 0 })
    ];
  };
  return {
    name: "Event Results — Poster",
    page: A4_PORTRAIT,
    background: GROUND_RESULTS,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 20, y: 16, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 30, y: 18, w: 160, text: "{fest} · {school}", size: 8, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 5.6, uppercase: true }),
      el("event", "text", { x: 20, y: 34, w: 170, text: "{event}", size: 26, font: "display", color: INK, align: "left", weight: 600, lineHeight: 1.06 }),
      el("category", "text", { x: 20, y: 56, w: 170, text: "{category} · FINAL RESULT", size: 9.5, font: "mono", color: ACCENT, align: "left", weight: 400, spacing: 6.7, uppercase: true }),
      el("head_rule", "box", { x: 20, y: 68, w: 170, h: 0.7, fill: INK, stroke: "none", strokeWidth: 0 }),

      ...row(1, 92),
      ...row(2, 142),
      ...row(3, 192),

      el("footer_rule", "box", { x: 20, y: 272, w: 170, h: 0.4, fill: INK, stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 20, y: 276, w: 170, text: "{school}", size: 7.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 4.2, uppercase: true }),
      el("footer_r", "text", { x: 20, y: 276, w: 170, text: "{date}", size: 7.5, font: "mono", color: INK_2, align: "right", weight: 400, spacing: 4.2 })
    ]
  };
}

/**
 * 06 · Event results, hall screen — 16:9, warm dark.
 *
 * Dark where the poster above is light: a projector has no ink cost, and a
 * dimmed hall wants a dark ground. Laid out as a podium — winner centred,
 * higher, larger, on a taller plinth — so the standing reads from the back
 * of the room before any of the type does.
 */
function eventRanksScreen() {
  const { w, h } = SLIDE_16_9;
  /* One column. `top` is the placement label's y; everything else hangs off
   * it, and the plinth height is what actually encodes the podium. */
  const col = (n, labelX, labelW, photoX, photoY, photoSize, nameX, nameW, nameY, nameSize,
               plinthX, plinthW, plinthY, plinthH, numY, numSize, labelSize, labelSpacing) => {
    const metal = RANK_DARK[n] || "#FFFFFF";
    return [
      el(`r${n}place`, "text", { x: labelX, y: photoY - 12, w: labelW, text: PLACE_WORD[n] || `PLACE ${n}`,
                                 size: labelSize, font: "mono", color: metal, align: "center", weight: 400, spacing: labelSpacing }),
      el(`r${n}photo`, "image", { x: photoX, y: photoY, w: photoSize, h: photoSize, src: `{rank${n}photo}`,
                                  radius: photoSize / 2, fit: "cover", stroke: metal, strokeWidth: 1 }),
      el(`r${n}name`, "text", { x: nameX, y: nameY, w: nameW, text: `{rank${n}name}`, size: nameSize,
                                font: "sans", color: "#FFFFFF", align: "center", weight: 700, lineHeight: 1.15 }),
      el(`r${n}house`, "text", { x: nameX, y: nameY + 13, w: nameW, text: `{rank${n}house}`, size: 11,
                                 font: "mono", color: "rgba(255,255,255,.68)", align: "center", weight: 400, spacing: 6.2, uppercase: true }),
      el(`r${n}plinth`, "box", { x: plinthX, y: plinthY, w: plinthW, h: plinthH, fill: "#262322", stroke: "none", strokeWidth: 0 }),
      el(`r${n}plinthtop`, "box", { x: plinthX, y: plinthY, w: plinthW, h: 0.8, fill: metal, stroke: "none", strokeWidth: 0 }),
      el(`r${n}num`, "text", { x: plinthX, y: numY, w: plinthW, text: String(n), size: numSize, font: "mono",
                               color: metal, align: "center", weight: 400, spacing: 4.9 })
    ];
  };
  return {
    name: "Event Results — Screen (16:9)",
    page: SLIDE_16_9,
    background: GROUND_SCREEN,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 16, y: 12, w: 7, h: 7, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 27, y: 13.5, w: 200, text: "{fest}", size: 10, font: "mono", color: "rgba(255,255,255,.6)", align: "left", weight: 400, spacing: 7.8, uppercase: true }),
      el("event", "text", { x: 16, y: 24, w: 306, text: "{event}", size: 30, font: "display", color: "#FFFFFF", align: "left", weight: 600, lineHeight: 1.05 }),
      el("category", "text", { x: 16, y: 24, w: 306, text: "{category}", size: 12, font: "mono", color: ACCENT, align: "right", weight: 400, spacing: 8.5, uppercase: true }),
      el("head_rule", "box", { x: 16, y: 44, w: 306, h: 0.6, fill: "rgba(255,255,255,.25)", stroke: "none", strokeWidth: 0 }),

      // Winner: centred, bigger photo, taller plinth, 20pt name.
      ...col(1, 119.3, 100, 145.3, 64, 48, 119.3, 100, 118, 20, 139.3, 60, 146, 26, 152, 14, 12, 11),
      ...col(2, 34.3,   60,  45.3, 78, 38,  24.3,  80, 122, 17,  37.3, 54, 154, 18, 159, 13, 11, 10.1),
      ...col(3, 244.3,  60, 255.3, 78, 38, 234.3,  80, 122, 17, 247.3, 54, 154, 18, 159, 13, 11, 10.1),

      el("footer_l", "text", { x: 16, y: 178, w: 306, text: "{school}", size: 10, font: "mono", color: "rgba(255,255,255,.5)", align: "left", weight: 400, spacing: 5.6, uppercase: true }),
      el("footer_r", "text", { x: 16, y: 178, w: 306, text: "{date}", size: 10, font: "mono", color: "rgba(255,255,255,.5)", align: "right", weight: 400, spacing: 5.6 })
    ]
  };
}

/**
 * 07 · Participant ID card — CR80 landscape (85.6 × 54mm).
 *
 * `design.page` is a plain {w,h} with no built-in assumption of A4
 * anywhere in the render or print pipeline, so a template just states the
 * size it needs.
 *
 * Uses only participant-level tokens — no {event}/{rank}/{results} — so it
 * generates from "Every registered participant" with no published result
 * required. The chest number is the dominant mark at 18pt, larger than the
 * name above it: a marshal reads the number at arm's length, not the name.
 */
function idCard() {
  const w = 85.6, h = 54;
  return {
    name: "Participant ID Card — Landscape",
    page: { w, h },
    background: GROUND_CARD_L,
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: 14, fill: BAND_CARD_L, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 4, y: 4.5, w: 5, h: 5, fill: "#FFFFFF", stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 11, y: 4, w: 50, text: "{fest}", size: 8, font: "display", color: "#FFFFFF", align: "left", weight: 600, spacing: 1.1 }),
      el("school", "text", { x: 11, y: 9, w: 60, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.85)", align: "left", weight: 400, spacing: 2.8, uppercase: true }),

      el("photo", "image", { x: 4, y: 18, w: 20, h: 20, src: "{photo}", radius: 10, fit: "cover" }),

      el("name", "text", { x: 27, y: 18, w: 54, text: "{name}", size: 9, font: "sans", color: INK, align: "left", weight: 700, lineHeight: 1.16 }),
      el("chest_lbl", "text", { x: 27, y: 27.5, w: 54, text: "CHEST NO.", size: 5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 3.5 }),
      el("chest", "text", { x: 27, y: 30, w: 54, text: "{chest}", size: 18, font: "mono", color: INK, align: "left", weight: 700, lineHeight: 1, spacing: 1.3 }),
      el("house_rule", "box", { x: 27, y: 41, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 27, y: 43.5, w: 56, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: INK_2, align: "left", weight: 400, spacing: 2.3, uppercase: true }),

      el("hairline", "box", { x: 4, y: 49, w: 77.6, h: 0.25, fill: HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("footer", "text", { x: 4, y: 50, w: 77.6, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: INK_4, align: "left", weight: 400, spacing: 2.2 })
    ]
  };
}

/**
 * 08 · Participant ID card — CR80 portrait (54 × 85.6mm), lanyard punch.
 *
 * The shape a hanging badge actually is. The photo sits above the name
 * rather than beside it — the whole reason to turn the card — and
 * everything below centres to match. The top 6mm carries only the punch
 * slot, so nothing vital is lost to the hole.
 */
function idCardPortrait() {
  const w = 54, h = 85.6;
  return {
    name: "Participant ID Card — Portrait",
    page: { w, h },
    background: GROUND_CARD_P,
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: 16, fill: BAND_CARD_P, stroke: "none", strokeWidth: 0 }),
      el("punch", "box", { x: 22, y: 2.4, w: 10, h: 1.6, fill: "rgba(255,255,255,.55)", stroke: "none", strokeWidth: 0, radius: 0.8 }),
      el("fest", "text", { x: 3, y: 6.6, w: 48, text: "{fest}", size: 8, font: "display", color: "#FFFFFF", align: "center", weight: 600 }),
      el("school", "text", { x: 3, y: 11.4, w: 48, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.85)", align: "center", weight: 400, spacing: 2.8, uppercase: true }),

      el("photo", "image", { x: 14, y: 22, w: 26, h: 26, src: "{photo}", radius: 13, fit: "cover" }),

      el("name", "text", { x: 3, y: 52, w: 48, text: "{name}", size: 9, font: "sans", color: INK, align: "center", weight: 700, lineHeight: 1.16 }),
      el("chest_lbl", "text", { x: 3, y: 60.5, w: 48, text: "CHEST NO.", size: 5, font: "mono", color: INK_2, align: "center", weight: 400, spacing: 3.5 }),
      el("chest", "text", { x: 3, y: 63, w: 48, text: "{chest}", size: 18, font: "mono", color: INK, align: "center", weight: 700, lineHeight: 1 }),
      el("house_rule", "box", { x: 19, y: 73, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 3, y: 75.5, w: 48, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: INK_2, align: "center", weight: 400, spacing: 2.3, uppercase: true }),

      el("hairline", "box", { x: 3, y: 80, w: 48, h: 0.25, fill: HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("footer_mark", "box", { x: 17, y: 81.4, w: 2.6, h: 2.6, fill: ACCENT, stroke: "none", strokeWidth: 0 }),
      el("footer", "text", { x: 21, y: 81.6, w: 30, text: "{fest}", size: 4.5, font: "mono", color: INK_4, align: "left", weight: 400, spacing: 2.2, uppercase: true })
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

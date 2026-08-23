// Certificate and poster templates.
//
// A design is a plain array of positioned elements measured in millimetres
// against an A4 page, which keeps it resolution-independent: the same
// numbers drive the on-screen editor and the print output.
//
// Text elements may contain {placeholders}, substituted per participant or
// per event when generating.
//
// The 24 designs below are three commissioned kits of eight — Modern,
// Classic and Bold Grid — transcribed from the design canvas at true
// millimetre scale. Positions, sizes, colours and letter-spacing are the
// design's own values, not approximations: `sp(em, sizePt)` converts a
// design's CSS `letter-spacing: Xem` (relative to that element's own
// font-size) into this engine's absolute tenths-of-a-millimetre `spacing`
// field, so the number in the source is the design's actual em value, not
// a pre-computed one nobody can check.
//
// Two adaptations were necessary because the app's real data has no
// equivalent: Bold Grid's results table originally showed a race time,
// which this fest never tracks — points stand in, since that is the
// nearest thing every event actually has. And its "every finisher" table
// is a single flowing {results}/{eventResults} text block rather than a
// literally ruled two-column table, because a design is a fixed layout of
// positioned elements and the number of finishers is not known until
// generation time — the same constraint every other template's results
// list already lives with.

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
  { token: "{rank1points}", label: "1st place — points earned" },
  { token: "{rank2points}", label: "2nd place — points earned" },
  { token: "{rank3points}", label: "3rd place — points earned" },
  { token: "{rank1chest}", label: "1st place — chest number (blank for a team)" },
  { token: "{rank2chest}", label: "2nd place — chest number (blank for a team)" },
  { token: "{rank3chest}", label: "3rd place — chest number (blank for a team)" },
  // Same idea as rankN, but per HOUSE rather than per placement — sorted by
  // how many points that house took from THIS event, 1 = the most. Feeds
  // Bold Grid's "house points from this event" strip.
  { token: "{house1name}",  label: "Top house (this event) — name" },
  { token: "{house1points}", label: "Top house (this event) — points" },
  { token: "{house1color}", label: "Top house (this event) — colour" },
  { token: "{house2name}",  label: "2nd house (this event) — name" },
  { token: "{house2points}", label: "2nd house (this event) — points" },
  { token: "{house2color}", label: "2nd house (this event) — colour" },
  { token: "{house3name}",  label: "3rd house (this event) — name" },
  { token: "{house3points}", label: "3rd house (this event) — points" },
  { token: "{house3color}", label: "3rd house (this event) — colour" },
  { token: "{house4name}",  label: "4th house (this event) — name" },
  { token: "{house4points}", label: "4th house (this event) — points" },
  { token: "{house4color}", label: "4th house (this event) — colour" },
  // The single best placement a participant holds across everything they
  // entered — blank if they never placed. Distinct from {rank}, which is
  // only set on a single-event winner poster.
  { token: "{bestRank}",  label: "Participant's best placement, as a digit" },
  // Also distinct from {rank}: the bare digit rather than the word
  // ("1" rather than "First"), for a design that sets it as one huge
  // numeral rather than running text.
  { token: "{rankNum}",   label: "Placement as a digit, not a word" },
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
 * CSS `letter-spacing: Xem` → this engine's `spacing` field.
 *
 * `spacing` is stored as tenths of a millimetre and applied literally
 * (`letter-spacing:${spacing*0.1}mm`) — it has no idea what font-size the
 * element is using. The design canvas's own values are all `em`, which
 * means "a fraction of THIS element's font-size" — so the same 0.2em reads
 * very differently on an 8pt caption and a 30pt headline. Converting at
 * the source, from the design's actual em value, keeps that relationship
 * intact instead of guessing a flat number per element by eye.
 * 1pt = 25.4/72 mm, hence the 3.52778.
 */
const sp = (em, sizePt) => Math.round(em * sizePt * 3.52778 * 10) / 10;

/* ── Classic theme — crimson, gilt and deep teal ─────────────────────
 * Ceremonial rather than flat: double rules, small-caps labels, Georgia
 * carrying every headline, medal rings around every photo. Grounds and
 * accents below are the design's own gradient values verbatim. */
const CL_CRIMSON      = "#C81A40";
const CL_CRIMSON_DARK = "#8E0F2E";
const CL_GOLD         = "#E9B949";
const CL_GOLD_DARK    = "#B8860B";
const CL_GOLD_LIGHT   = "#F6D888";
const CL_INK          = "#1E1614";
const CL_BODY         = "#3A322C";
const CL_CAPTION      = "#8A6A22";   // gold-brown mono caption
const CL_CAPTION_2    = "#5E5348";   // grey-brown mono caption
const CL_HAIRLINE     = "#D9C79A";

const CL_GROUND_FORMAL = "radial-gradient(70% 55% at 50% 0%, #FFFDF6 0%, rgba(255,253,246,0) 60%), " +
                         "radial-gradient(90% 70% at 100% 100%, #F3E3C4 0%, rgba(243,227,196,0) 62%), " +
                         "linear-gradient(168deg, #FBF6EA 0%, #F6EEDC 55%, #EFE2C7 100%)";
const CL_GROUND_BAND   = "linear-gradient(200deg, #FFFDF7 0%, #F8F1E2 52%, #F0E4CB 100%)";
const CL_GROUND_PHOTO  = "radial-gradient(60% 60% at 12% 30%, rgba(200,26,64,.10) 0%, rgba(200,26,64,0) 62%), " +
                         "radial-gradient(80% 70% at 100% 100%, #F3E4C6 0%, rgba(243,228,198,0) 64%), " +
                         "linear-gradient(152deg, #FFFDF7 0%, #F7F0E0 58%, #EFE3C9 100%)";
const CL_GROUND_WINNER = "radial-gradient(66% 40% at 50% 32%, rgba(226,62,92,.55) 0%, rgba(226,62,92,0) 68%), " +
                         "radial-gradient(80% 40% at 50% 100%, rgba(21,101,120,.55) 0%, rgba(21,101,120,0) 72%), " +
                         "linear-gradient(182deg, #8E0F2E 0%, #6A0A22 30%, #2B1220 58%, #0E3A46 100%)";
const CL_GROUND_RESULTS = "radial-gradient(90% 24% at 50% 0%, rgba(233,185,73,.30) 0%, rgba(233,185,73,0) 70%), " +
                          "radial-gradient(80% 26% at 0% 100%, rgba(21,101,120,.12) 0%, rgba(21,101,120,0) 66%), " +
                          "linear-gradient(180deg, #FFFDF7 0%, #F7F0E0 44%, #EFE3C9 100%)";
const CL_GROUND_SCREEN = "radial-gradient(40% 70% at 50% 58%, rgba(233,185,73,.24) 0%, rgba(233,185,73,0) 70%), " +
                         "radial-gradient(70% 90% at 0% 0%, rgba(200,26,64,.48) 0%, rgba(200,26,64,0) 62%), " +
                         "radial-gradient(70% 90% at 100% 100%, rgba(21,101,120,.55) 0%, rgba(21,101,120,0) 66%), " +
                         "linear-gradient(155deg, #6A0A22 0%, #35131F 40%, #1A1418 66%, #0E3A46 100%)";
const CL_GROUND_CARD_L = "radial-gradient(90% 70% at 100% 100%, #F4E6C8 0%, rgba(244,230,200,0) 68%), " +
                         "linear-gradient(160deg, #FFFDF7 0%, #F7F0E0 70%, #EFE3C9 100%)";
const CL_GROUND_CARD_P = "radial-gradient(80% 50% at 50% 100%, #F4E6C8 0%, rgba(244,230,200,0) 70%), " +
                         "linear-gradient(170deg, #FFFDF7 0%, #F7F0E0 66%, #EFE3C9 100%)";

const CL_BAND_CERT    = "linear-gradient(172deg, #E23E5C 0%, #C81A40 40%, #8E0F2E 82%, #6A0A22 100%)";
const CL_BAND_CARD_L  = "linear-gradient(100deg, #8E0F2E 0%, #C81A40 55%, #E23E5C 100%)";
const CL_BAND_CARD_P  = "linear-gradient(168deg, #8E0F2E 0%, #C81A40 58%, #E23E5C 100%)";
const CL_MARK_GRAD    = "linear-gradient(140deg,#E23E5C,#C81A40 60%,#8E0F2E)";
const CL_GILT_RULE    = "linear-gradient(90deg,#F6D888,#B8860B)";
const CL_RING_GOLD    = "linear-gradient(140deg,#F6D888,#B8860B)";
const CL_RING_SILVER  = "linear-gradient(140deg,#DDE3E8,#9AA3AC)";
const CL_RING_BRONZE  = "linear-gradient(140deg,#DFA86A,#A0632C)";
/* Rings on a dark ground read as their true metal colour; on the cream
 * ground the same reasoning that produced RANK_LIGHT above applies, so
 * Classic's cream-ground metal labels reuse RANK_LIGHT rather than a new,
 * unverified pair. */
const CL_RING = { 1: CL_RING_GOLD, 2: CL_RING_SILVER, 3: CL_RING_BRONZE };
const CL_METAL_DARK = { 1: CL_GOLD_LIGHT, 2: "#DDE3E8", 3: "#DFA86A" };
const CL_ROMAN = { 1: "I", 2: "II", 3: "III" };

/* ── Bold Grid theme — split fields, oversized numerals, square crops ──
 * A structural redraw, not a recolour: unequal colour fields instead of a
 * frame, the rank or chest number as a numeral cropped by the canvas edge,
 * square bled photos, and a results poster built as rows of real data
 * (points, house totals) rather than a three-portrait podium. Every fill
 * below is flat — this is the one theme in the kit with no gradients. */
const BG_BLUE    = "#1B34C4";
const BG_MAGENTA = "#E8177E";
const BG_YELLOW  = "#F2E63D";
const BG_INK     = "#141414";
const BG_BODY    = "#3E3C37";
const BG_CAPTION = "#5C5A54";
const BG_LINE    = "#CFCBC0";
const BG_PANEL   = "#EDEBE4";
const BG_PAPER   = "#FCFBF7";
/* Magenta twice, deliberately. #E8177E is the design's own accent and is
 * used for every pure-GRAPHIC fill — the 3mm strips, the small squares —
 * where nothing has to be read against it. It measures 4.33:1 against
 * white and 4.18:1 as text on the paper ground, so anywhere it actually
 * carries or backs type (the screen's footer band, the certificate
 * table's place labels at 11pt bold) it would miss 4.5:1 — the source
 * design's one contrast slip. The deeper tone clears it at 5.27 / 5.09:1
 * and reads as the same colour at a glance. */
const BG_MAGENTA_DEEP = "#D0116E";

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
    name: "Vermilion Rail",
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

/* ══════════════════════════ CLASSIC THEME ══════════════════════════ */

/** Classic 01 · Formal — double gold frame, fully symmetric. */
function classicFormal() {
  return {
    name: "Formal",
    page: A4,
    background: CL_GROUND_FORMAL,
    backgroundImage: null,
    elements: [
      el("frame_outer", "box", { x: 8, y: 8, w: 281, h: 194, fill: "none", stroke: CL_CRIMSON_DARK, strokeWidth: 1.2, radius: 0 }),
      el("frame_inner", "box", { x: 12, y: 12, w: 273, h: 186, fill: "none", stroke: CL_GOLD_DARK, strokeWidth: 0.35, radius: 0 }),
      el("frame_hair", "box", { x: 14.5, y: 14.5, w: 268, h: 181, fill: "none", stroke: CL_HAIRLINE, strokeWidth: 0.2, radius: 0 }),
      el("corner_tl", "box", { x: 14, y: 14, w: 9, h: 9, fill: CL_GOLD, stroke: "none", strokeWidth: 0 }),
      el("corner_tr", "box", { x: 274, y: 14, w: 9, h: 9, fill: CL_GOLD, stroke: "none", strokeWidth: 0 }),
      el("corner_bl", "box", { x: 14, y: 187, w: 9, h: 9, fill: CL_GOLD, stroke: "none", strokeWidth: 0 }),
      el("corner_br", "box", { x: 274, y: 187, w: 9, h: 9, fill: CL_GOLD, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 144.5, y: 24, w: 8, h: 8, fill: CL_MARK_GRAD, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 10, y: 36, w: 277, text: "{school}", size: 8.5, font: "mono", color: CL_CAPTION, align: "center", weight: 400, spacing: sp(.26, 8.5), uppercase: true }),
      el("header", "text", { x: 10, y: 45, w: 277, text: "CERTIFICATE OF MERIT", size: 17, font: "serif", color: CL_CRIMSON_DARK, align: "center", weight: 400, spacing: sp(.32, 17) }),
      el("header_rule", "box", { x: 118, y: 57, w: 61, h: 0.3, fill: CL_GOLD_DARK, stroke: "none", strokeWidth: 0 }),
      el("header_mark", "box", { x: 145.5, y: 55.6, w: 6, h: 3.2, fill: CL_CRIMSON, stroke: "none", strokeWidth: 0 }),
      el("awarded", "text", { x: 10, y: 64, w: 277, text: "AWARDED TO", size: 7.5, font: "mono", color: CL_CAPTION, align: "center", weight: 400, spacing: sp(.28, 7.5) }),
      el("name", "text", { x: 38.5, y: 71, w: 220, text: "{name}", size: 32, font: "serif", color: CL_INK, align: "center", weight: 400, lineHeight: 1.14 }),
      el("house_rule", "box", { x: 118.5, y: 94, w: 60, h: 1.4, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 10, y: 98, w: 277, text: "{house} · Chest {chest} · {category}", size: 8, font: "mono", color: CL_CAPTION_2, align: "center", weight: 400, spacing: sp(.18, 8), uppercase: true }),
      el("results", "text", { x: 48.5, y: 110, w: 200, text: "{results}", size: 12, font: "serif", color: CL_BODY, align: "center", weight: 400, lineHeight: 1.8 }),
      el("sig_rule_l", "box", { x: 32, y: 176, w: 70, h: 0.4, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("sig_l", "text", { x: 32, y: 178, w: 70, text: "FEST CONVENOR", size: 7.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("sig_rule_r", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("sig_r", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("fest_line", "text", { x: 10, y: 177, w: 277, text: "{fest}", size: 10, font: "serif", color: CL_CRIMSON_DARK, align: "center", weight: 400, spacing: sp(.2, 10) }),
      el("date_line", "text", { x: 10, y: 183, w: 277, text: "{date}", size: 7.5, font: "mono", color: CL_CAPTION, align: "center", weight: 400, spacing: sp(.16, 7.5) })
    ]
  };
}

/** Classic 02 · Crimson Band — gilt rule, flush-left plate. */
function classicBand() {
  return {
    name: "Crimson Band",
    page: A4,
    background: CL_GROUND_BAND,
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w: 66, h: 210, fill: CL_BAND_CERT, stroke: "none", strokeWidth: 0 }),
      el("gilt_rule", "box", { x: 66, y: 0, w: 1.2, h: 210, fill: CL_GILT_RULE, stroke: "none", strokeWidth: 0 }),
      el("band_mark", "box", { x: 14, y: 18, w: 8, h: 8, fill: CL_GOLD_LIGHT, stroke: "none", strokeWidth: 0 }),
      el("band_fest", "text", { x: 14, y: 32, w: 42, text: "{fest}", size: 17, font: "serif", color: "#FFFFFF", align: "left", weight: 400, lineHeight: 1.12 }),
      el("band_rule", "box", { x: 14, y: 52, w: 42, h: 0.4, fill: "rgba(246,216,136,.7)", stroke: "none", strokeWidth: 0 }),
      el("band_sub", "text", { x: 14, y: 56, w: 44, text: "{school}", size: 7, font: "mono", color: "rgba(255,255,255,.86)", align: "left", weight: 400, spacing: sp(.18, 7), lineHeight: 1.7, uppercase: true }),
      el("band_date", "text", { x: 14, y: 178, w: 42, text: "{date}", size: 7.5, font: "mono", color: CL_GOLD_LIGHT, align: "left", weight: 400, spacing: sp(.14, 7.5) }),

      el("header", "text", { x: 80, y: 22, w: 200, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.26, 8) }),
      el("school", "text", { x: 80, y: 22, w: 200, text: "{school}", size: 8, font: "mono", color: CL_CRIMSON_DARK, align: "right", weight: 400, spacing: sp(.14, 8), uppercase: true }),
      el("header_rule", "box", { x: 80, y: 32, w: 200, h: 0.3, fill: CL_HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("name", "text", { x: 80, y: 54, w: 196, text: "{name}", size: 34, font: "serif", color: CL_INK, align: "left", weight: 400, lineHeight: 1.08 }),
      el("house_rule", "box", { x: 80, y: 92, w: 44, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 80, y: 97, w: 200, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.18, 8.5), uppercase: true }),
      el("results_rule1", "box", { x: 80, y: 110, w: 200, h: 0.8, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("results_rule2", "box", { x: 80, y: 112.5, w: 200, h: 0.25, fill: CL_GOLD_DARK, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: 80, y: 120, w: 176, text: "{results}", size: 12, font: "serif", color: CL_BODY, align: "left", weight: 400, lineHeight: 1.8 }),

      el("sig_rule_r", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("sig_r", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.2, 7.5) })
    ]
  };
}

/** Classic 03 · With Photo — 40mm medallion in a gold ring. */
function classicWithPhoto() {
  return {
    name: "With Photo",
    page: A4,
    background: CL_GROUND_PHOTO,
    backgroundImage: null,
    elements: [
      el("frame", "box", { x: 10, y: 10, w: 277, h: 190, fill: "none", stroke: CL_HAIRLINE, strokeWidth: 0.3, radius: 0 }),
      el("mark", "box", { x: 20, y: 18, w: 8, h: 8, fill: CL_MARK_GRAD, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 31, y: 20, w: 120, text: "{school}", size: 8, font: "mono", color: CL_CRIMSON_DARK, align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("festdate", "text", { x: 157, y: 20, w: 120, text: "{fest} · {date}", size: 8, font: "mono", color: CL_CAPTION, align: "right", weight: 400, spacing: sp(.14, 8) }),
      el("rule1", "box", { x: 20, y: 32, w: 257, h: 0.8, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("rule2", "box", { x: 20, y: 34.2, w: 257, h: 0.25, fill: CL_GOLD_DARK, stroke: "none", strokeWidth: 0 }),

      el("ring", "box", { x: 22, y: 52, w: 44, h: 44, radius: 22, fill: CL_RING_GOLD, stroke: "none", strokeWidth: 0 }),
      el("photo", "image", { x: 24, y: 54, w: 40, h: 40, src: "{photo}", radius: 20, fit: "cover" }),

      el("header", "text", { x: 76, y: 54, w: 190, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.26, 8) }),
      el("name", "text", { x: 76, y: 62, w: 190, text: "{name}", size: 31, font: "serif", color: CL_INK, align: "left", weight: 400, lineHeight: 1.1 }),
      el("house_rule", "box", { x: 76, y: 94, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 76, y: 99, w: 190, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.18, 8.5), uppercase: true }),
      el("hairline", "box", { x: 20, y: 112, w: 257, h: 0.25, fill: CL_HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: 76, y: 120, w: 190, text: "{results}", size: 12, font: "serif", color: CL_BODY, align: "left", weight: 400, lineHeight: 1.8 }),

      el("sig_rule", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 195, y: 178, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("footer", "text", { x: 20, y: 177, w: 70, text: "{fest}", size: 10, font: "serif", color: CL_CRIMSON_DARK, align: "left", weight: 400, spacing: sp(.16, 10) })
    ]
  };
}

/** Classic 04 · Winner Poster — crimson-to-teal field, gold medallion. */
function classicWinnerPoster() {
  return {
    name: "Winner Poster",
    page: A4_PORTRAIT,
    background: CL_GROUND_WINNER,
    backgroundImage: null,
    elements: [
      el("frame", "box", { x: 12, y: 12, w: 186, h: 273, fill: "none", stroke: "rgba(246,216,136,.55)", strokeWidth: 0.35, radius: 0 }),
      el("mark", "box", { x: 101.5, y: 18, w: 7, h: 7, fill: "#FFFFFF", stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 16, y: 32, w: 178, text: "{fest} · {school}", size: 9, font: "mono", color: "rgba(246,241,231,.72)", align: "center", weight: 400, spacing: sp(.28, 9), uppercase: true }),
      el("event", "text", { x: 16, y: 43, w: 178, text: "{event}", size: 16, font: "serif", color: CL_GOLD_LIGHT, align: "center", weight: 400, spacing: sp(.14, 16), uppercase: true }),
      el("event_rule", "box", { x: 70, y: 60, w: 70, h: 0.3, fill: "rgba(246,216,136,.8)", stroke: "none", strokeWidth: 0 }),
      el("event_mark", "box", { x: 101.5, y: 58.6, w: 7, h: 3.2, fill: CL_GOLD_LIGHT, stroke: "none", strokeWidth: 0 }),

      el("photo_ring", "box", { x: 63, y: 74, w: 84, h: 84, fill: CL_RING_GOLD, stroke: "none", strokeWidth: 0, radius: 42 }),
      el("photo", "image", { x: 70, y: 81, w: 70, h: 70, src: "{photo}", radius: 35, fit: "cover" }),

      el("place", "text", { x: 15, y: 166, w: 180, text: "{rank}", size: 62, font: "serif", color: "#FFFFFF", align: "center", weight: 400, lineHeight: 0.98, uppercase: true }),
      el("name", "text", { x: 15, y: 196, w: 180, text: "{name}", size: 22, font: "sans", color: "#FFFFFF", align: "center", weight: 700, lineHeight: 1.16 }),
      el("house_rule", "box", { x: 85, y: 232, w: 40, h: 1.6, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 15, y: 237, w: 180, text: "{house} · Chest {chest} · {category}", size: 9, font: "mono", color: "rgba(246,241,231,.78)", align: "center", weight: 400, spacing: sp(.2, 9), uppercase: true }),

      el("footer_rule", "box", { x: 16, y: 272, w: 178, h: 0.4, fill: "rgba(246,216,136,.4)", stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 276, w: 178, text: "{fest}", size: 7.5, font: "mono", color: "rgba(246,241,231,.6)", align: "left", weight: 400, spacing: sp(.16, 7.5), uppercase: true }),
      el("footer_r", "text", { x: 16, y: 276, w: 178, text: "{date}", size: 7.5, font: "mono", color: "rgba(246,241,231,.6)", align: "right", weight: 400, spacing: sp(.16, 7.5) })
    ]
  };
}

/** Classic 05 · Event Results Poster — gilded cream, medal-ring rows. */
function classicEventRanksPoster() {
  const row = (n, y) => {
    const metal = RANK_LIGHT[n] || CL_CAPTION_2;
    return [
      el(`r${n}ring`, "box", { x: 20, y, w: 38, h: 38, fill: CL_RING[n] || CL_RING_GOLD, stroke: "none", strokeWidth: 0, radius: 19 }),
      el(`r${n}photo`, "image", { x: 22, y: y + 2, w: 34, h: 34, src: `{rank${n}photo}`, radius: 17, fit: "cover" }),
      el(`r${n}place`, "text", { x: 64, y: y + 4, w: 126, text: PLACE_WORD[n] || `PLACE ${n}`, size: 9, font: "mono", color: metal, align: "left", weight: 400, spacing: sp(.24, 9) }),
      el(`r${n}name`, "text", { x: 64, y: y + 12, w: 126, text: `{rank${n}name}`, size: 19, font: "serif", color: CL_INK, align: "left", weight: 400, lineHeight: 1.14 }),
      el(`r${n}bar`, "box", { x: 64, y: y + 27, w: 16, h: 1.2, fill: `{rank${n}houseColor}`, stroke: "none", strokeWidth: 0 }),
      el(`r${n}house`, "text", { x: 64, y: y + 30, w: 126, text: `{rank${n}house}`, size: 9, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.16, 9), uppercase: true }),
      el(`r${n}div`, "box", { x: 20, y: y + 43, w: 170, h: 0.25, fill: CL_HAIRLINE, stroke: "none", strokeWidth: 0 })
    ];
  };
  return {
    name: "Event Results — Poster",
    page: A4_PORTRAIT,
    background: CL_GROUND_RESULTS,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 20, y: 18, w: 7, h: 7, fill: CL_MARK_GRAD, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 30, y: 20, w: 160, text: "{fest} · {school}", size: 8, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("event", "text", { x: 20, y: 34, w: 170, text: "{event}", size: 28, font: "serif", color: CL_INK, align: "left", weight: 400, lineHeight: 1.06 }),
      el("category", "text", { x: 20, y: 58, w: 170, text: "{category} · FINAL RESULT", size: 9.5, font: "mono", color: CL_CRIMSON, align: "left", weight: 400, spacing: sp(.22, 9.5), uppercase: true }),
      el("head_rule1", "box", { x: 20, y: 69, w: 170, h: 0.8, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("head_rule2", "box", { x: 20, y: 71.2, w: 170, h: 0.25, fill: CL_GOLD_DARK, stroke: "none", strokeWidth: 0 }),

      ...row(1, 90),
      ...row(2, 140),
      ...row(3, 190),

      el("footer_rule", "box", { x: 20, y: 272, w: 170, h: 0.4, fill: CL_CRIMSON_DARK, stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 20, y: 276, w: 170, text: "{school}", size: 7.5, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.16, 7.5), uppercase: true }),
      el("footer_r", "text", { x: 20, y: 276, w: 170, text: "{date}", size: 7.5, font: "mono", color: CL_CAPTION, align: "right", weight: 400, spacing: sp(.16, 7.5) })
    ]
  };
}

/** Classic 06 · Event Results, hall screen — roman numerals on the plinths. */
function classicEventRanksScreen() {
  const col = (n, labelX, labelW, photoX, photoY, photoSize, nameX, nameW, nameY, nameSize,
               plinthX, plinthW, plinthY, plinthH, numY, numSize, labelSize, labelSpacing) => {
    const metal = CL_METAL_DARK[n] || "#FFFFFF";
    return [
      el(`r${n}place`, "text", { x: labelX, y: photoY - 12, w: labelW, text: PLACE_WORD[n] || `PLACE ${n}`,
                                 size: labelSize, font: "mono", color: metal, align: "center", weight: 400, spacing: labelSpacing }),
      el(`r${n}ring`, "box", { x: photoX - 2, y: photoY - 2, w: photoSize + 4, h: photoSize + 4, fill: CL_RING[n] || CL_RING_GOLD, stroke: "none", strokeWidth: 0, radius: (photoSize + 4) / 2 }),
      el(`r${n}photo`, "image", { x: photoX, y: photoY, w: photoSize, h: photoSize, src: `{rank${n}photo}`, radius: photoSize / 2, fit: "cover" }),
      el(`r${n}name`, "text", { x: nameX, y: nameY, w: nameW, text: `{rank${n}name}`, size: nameSize,
                                font: "serif", color: "#FFFFFF", align: "center", weight: 400, lineHeight: 1.14 }),
      el(`r${n}house`, "text", { x: nameX, y: nameY + 13, w: nameW, text: `{rank${n}house}`, size: 11,
                                 font: "mono", color: "rgba(246,241,231,.72)", align: "center", weight: 400, spacing: sp(.16, 11), uppercase: true }),
      el(`r${n}plinth`, "box", { x: plinthX, y: plinthY, w: plinthW, h: plinthH, fill: "rgba(255,255,255,.06)", stroke: "none", strokeWidth: 0 }),
      el(`r${n}plinthtop`, "box", { x: plinthX, y: plinthY, w: plinthW, h: 0.8, fill: metal, stroke: "none", strokeWidth: 0 }),
      el(`r${n}numeral`, "text", { x: plinthX, y: numY, w: plinthW, text: CL_ROMAN[n] || String(n), size: numSize, font: "serif",
                                   color: metal, align: "center", weight: 400 })
    ];
  };
  return {
    name: "Event Results — Screen (16:9)",
    page: SLIDE_16_9,
    background: CL_GROUND_SCREEN,
    backgroundImage: null,
    elements: [
      el("mark", "box", { x: 16, y: 12, w: 7, h: 7, fill: CL_GOLD_LIGHT, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 27, y: 13.5, w: 200, text: "{fest}", size: 10, font: "mono", color: "rgba(246,241,231,.7)", align: "left", weight: 400, spacing: sp(.22, 10), uppercase: true }),
      el("event", "text", { x: 16, y: 24, w: 306, text: "{event}", size: 32, font: "serif", color: "#FFFFFF", align: "left", weight: 400, lineHeight: 1.05 }),
      el("category", "text", { x: 16, y: 26, w: 306, text: "{category}", size: 12, font: "mono", color: CL_GOLD_LIGHT, align: "right", weight: 400, spacing: sp(.2, 12), uppercase: true }),
      el("head_rule", "box", { x: 16, y: 44, w: 306, h: 0.6, fill: "rgba(246,216,136,.5)", stroke: "none", strokeWidth: 0 }),

      ...col(1, 119.3, 100, 145.3, 62, 48, 119.3, 100, 122, 21, 139.3, 60, 148, 26, 154, 15, 12, 11.9),
      ...col(2, 34.3,   60,  43.3, 76, 42,  24.3,  80, 124, 18,  37.3, 54, 156, 18, 161, 14, 11, 10.9),
      ...col(3, 244.3,  60, 253.3, 76, 42, 234.3,  80, 124, 18, 247.3, 54, 156, 18, 161, 14, 11, 10.9),

      el("footer_l", "text", { x: 16, y: 178, w: 306, text: "{school}", size: 10, font: "mono", color: "rgba(246,241,231,.5)", align: "left", weight: 400, spacing: sp(.16, 10), uppercase: true }),
      el("footer_r", "text", { x: 16, y: 178, w: 306, text: "{date}", size: 10, font: "mono", color: "rgba(246,241,231,.5)", align: "right", weight: 400, spacing: sp(.16, 10) })
    ]
  };
}

/** Classic 07 · Participant ID Card — CR80 landscape. */
function classicIdCard() {
  const w = 85.6, h = 54;
  return {
    name: "Participant ID Card — Landscape",
    page: { w, h },
    background: CL_GROUND_CARD_L,
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: 15, fill: CL_BAND_CARD_L, stroke: "none", strokeWidth: 0 }),
      el("gilt_rule", "box", { x: 0, y: 15, w, h: 0.8, fill: CL_GILT_RULE, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 4, y: 5, w: 5, h: 5, fill: CL_GOLD_LIGHT, stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 11, y: 4, w: 52, text: "{fest}", size: 9, font: "serif", color: "#FFFFFF", align: "left", weight: 400 }),
      el("school", "text", { x: 11, y: 9.6, w: 60, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.86)", align: "left", weight: 400, spacing: sp(.16, 5), uppercase: true }),

      el("ring", "box", { x: 4, y: 19, w: 22, h: 22, fill: CL_RING_GOLD, stroke: "none", strokeWidth: 0, radius: 11 }),
      el("photo", "image", { x: 5, y: 20, w: 20, h: 20, src: "{photo}", radius: 10, fit: "cover" }),

      el("name", "text", { x: 29, y: 19, w: 53, text: "{name}", size: 10, font: "serif", color: CL_INK, align: "left", weight: 400, lineHeight: 1.14 }),
      el("chest_lbl", "text", { x: 29, y: 28, w: 53, text: "CHEST NO.", size: 5, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.2, 5) }),
      el("chest", "text", { x: 29, y: 30.6, w: 53, text: "{chest}", size: 18, font: "mono", color: CL_CRIMSON_DARK, align: "left", weight: 700, lineHeight: 1 }),
      el("house_rule", "box", { x: 29, y: 41, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 29, y: 43.5, w: 54, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: CL_CAPTION_2, align: "left", weight: 400, spacing: sp(.12, 5.5), uppercase: true }),

      el("hairline", "box", { x: 4, y: 49, w: 77.6, h: 0.25, fill: CL_HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("footer", "text", { x: 4, y: 50, w: 77.6, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: CL_CAPTION, align: "left", weight: 400, spacing: sp(.14, 4.5) })
    ]
  };
}

/** Classic 08 · Participant ID Card — CR80 portrait, lanyard punch. */
function classicIdCardPortrait() {
  const w = 54, h = 85.6;
  return {
    name: "Participant ID Card — Portrait",
    page: { w, h },
    background: CL_GROUND_CARD_P,
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w, h: 17, fill: CL_BAND_CARD_P, stroke: "none", strokeWidth: 0 }),
      el("gilt_rule", "box", { x: 0, y: 17, w, h: 0.8, fill: CL_GILT_RULE, stroke: "none", strokeWidth: 0 }),
      el("punch", "box", { x: 22, y: 2.4, w: 10, h: 1.6, fill: "rgba(255,255,255,.6)", stroke: "none", strokeWidth: 0, radius: 0.8 }),
      el("fest", "text", { x: 3, y: 6.6, w: 48, text: "{fest}", size: 9.5, font: "serif", color: "#FFFFFF", align: "center", weight: 400 }),
      el("school", "text", { x: 3, y: 12.4, w: 48, text: "{school}", size: 5, font: "mono", color: "rgba(255,255,255,.86)", align: "center", weight: 400, spacing: sp(.16, 5), uppercase: true }),

      el("ring", "box", { x: 12, y: 23, w: 30, h: 30, fill: CL_RING_GOLD, stroke: "none", strokeWidth: 0, radius: 15 }),
      el("photo", "image", { x: 14, y: 25, w: 26, h: 26, src: "{photo}", radius: 13, fit: "cover" }),

      el("name", "text", { x: 3, y: 56, w: 48, text: "{name}", size: 10, font: "serif", color: CL_INK, align: "center", weight: 400, lineHeight: 1.14 }),
      el("chest_lbl", "text", { x: 3, y: 63, w: 48, text: "CHEST NO.", size: 5, font: "mono", color: CL_CAPTION, align: "center", weight: 400, spacing: sp(.2, 5) }),
      el("chest", "text", { x: 3, y: 65.6, w: 48, text: "{chest}", size: 18, font: "mono", color: CL_CRIMSON_DARK, align: "center", weight: 700, lineHeight: 1 }),
      el("house_rule", "box", { x: 19, y: 75, w: 16, h: 1.2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 3, y: 77.4, w: 48, text: "{house} · {category} · {class}", size: 5.5, font: "mono", color: CL_CAPTION_2, align: "center", weight: 400, spacing: sp(.12, 5.5), uppercase: true }),

      el("hairline", "box", { x: 3, y: 81.4, w: 48, h: 0.25, fill: CL_HAIRLINE, stroke: "none", strokeWidth: 0 }),
      el("footer", "text", { x: 3, y: 82.4, w: 48, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: CL_CAPTION, align: "center", weight: 400, spacing: sp(.14, 4.5) })
    ]
  };
}

/* ═════════════════════════ BOLD GRID THEME ═════════════════════════ */

/**
 * Bold Grid 01 · Split Field — name reversed out of ultramarine.
 *
 * No frame at all: the page is two unequal fields, and the name sits in
 * the larger one in white. The magenta panel on the right carries the
 * participant's best placement as a single digit, cropped by nothing —
 * it is the one element that changes size with the data.
 */
function boldSplitField() {
  return {
    name: "Split Field",
    page: A4,
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("field", "box", { x: 0, y: 0, w: 297, h: 96, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("field_edge", "box", { x: 0, y: 96, w: 297, h: 3, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("rank_panel", "box", { x: 249, y: 0, w: 48, h: 96, fill: BG_MAGENTA_DEEP, stroke: "none", strokeWidth: 0 }),
      el("rank_digit", "text", { x: 249, y: 18, w: 48, text: "{bestRank}", size: 104, font: "display", color: "rgba(255,255,255,.92)", align: "center", weight: 700, lineHeight: 1 }),
      el("mark", "box", { x: 18, y: 16, w: 9, h: 9, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 31, y: 18, w: 120, text: "{school}", size: 8, font: "mono", color: "rgba(255,255,255,.86)", align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("header", "text", { x: 18, y: 34, w: 220, text: "CERTIFICATE OF MERIT", size: 8, font: "mono", color: BG_YELLOW, align: "left", weight: 400, spacing: sp(.28, 8) }),
      el("name", "text", { x: 18, y: 44, w: 224, text: "{name}", size: 44, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.0, spacing: sp(-.025, 44) }),
      el("house_rule", "box", { x: 18, y: 78, w: 44, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 18, y: 83, w: 224, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: "rgba(255,255,255,.82)", align: "left", weight: 400, spacing: sp(.2, 8.5), uppercase: true }),

      el("th_event", "text", { x: 18, y: 112, w: 120, text: "EVENT", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.22, 7.5) }),
      el("th_place", "text", { x: 198, y: 112, w: 81, text: "PLACE", size: 7.5, font: "mono", color: BG_CAPTION, align: "right", weight: 400, spacing: sp(.22, 7.5) }),
      el("th_rule", "box", { x: 18, y: 118, w: 261, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      /* The design draws four literal table rows. A design is a fixed
       * layout and the number of results is not known until generation,
       * so this is the same flowing {results} block every other template
       * uses — set in the design's own row rhythm (1.72 line-height at
       * 12pt) so it reads as the ruled table it was drawn as. */
      el("results", "text", { x: 18, y: 124, w: 261, text: "{results}", size: 12, font: "sans", color: BG_INK, align: "left", weight: 600, lineHeight: 1.72 }),
      el("table_rule", "box", { x: 18, y: 175, w: 261, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),

      el("fest", "text", { x: 18, y: 186, w: 100, text: "{fest}", size: 11, font: "display", color: BG_BLUE, align: "left", weight: 700, spacing: sp(.04, 11), uppercase: true }),
      el("date", "text", { x: 18, y: 193, w: 100, text: "{date}", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.16, 7.5) }),
      el("sig_rule", "box", { x: 209, y: 190, w: 70, h: 0.4, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 209, y: 192, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) })
    ]
  };
}

/**
 * Bold Grid 02 · Chest Numeral — cropped by the canvas edge.
 *
 * The chest number is set at 300pt and runs off the right edge on
 * purpose. Its box is deliberately far wider than the number needs
 * (220mm from x=150, so it extends past the 297mm page): the page's own
 * overflow does the cropping, and because the text never exceeds its own
 * box the editor's shrink-to-fit never fires — so the editor shows the
 * same crop the print produces, rather than politely resizing a numeral
 * that is meant to bleed.
 */
function boldChestNumeral() {
  return {
    name: "Chest Numeral",
    page: A4,
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("edge", "box", { x: 0, y: 0, w: 16, h: 210, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("numeral", "text", { x: 150, y: -24, w: 220, text: "{chest}", size: 300, font: "display", color: BG_YELLOW, align: "left", weight: 700, lineHeight: 1, spacing: sp(-.04, 300) }),
      el("mark", "box", { x: 32, y: 18, w: 9, h: 9, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 45, y: 20, w: 140, text: "{school}", size: 8, font: "mono", color: BG_INK, align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("header", "text", { x: 32, y: 60, w: 180, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: BG_BLUE, align: "left", weight: 400, spacing: sp(.28, 8) }),
      el("name", "text", { x: 32, y: 69, w: 150, text: "{name}", size: 40, font: "display", color: BG_INK, align: "left", weight: 700, lineHeight: 1.02, spacing: sp(-.025, 40) }),
      el("house_rule", "box", { x: 32, y: 100, w: 44, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 32, y: 105, w: 180, text: "{house} · {category} · {class}", size: 8.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 8.5), uppercase: true }),
      el("rule", "box", { x: 32, y: 126, w: 247, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: 32, y: 133, w: 160, text: "{results}", size: 12, font: "sans", color: BG_BODY, align: "left", weight: 400, lineHeight: 1.72 }),
      el("footer_rule", "box", { x: 32, y: 180, w: 247, h: 0.25, fill: BG_LINE, stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 32, y: 186, w: 140, text: "{fest} · {date}", size: 11, font: "display", color: BG_BLUE, align: "left", weight: 700, spacing: sp(.04, 11), uppercase: true }),
      el("sig_rule", "box", { x: 209, y: 190, w: 70, h: 0.4, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 209, y: 192, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) })
    ]
  };
}

/**
 * Bold Grid 03 · Square Photo — 76mm square, bled to two edges.
 *
 * No circular mask anywhere in this theme: a square crop bled into the
 * corner shows more of a 240px source at the same footprint, and reads
 * sharper for it.
 */
function boldSquarePhoto() {
  return {
    name: "Square Photo",
    page: A4,
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("photo", "image", { x: 0, y: 0, w: 76, h: 76, src: "{photo}", radius: 0, fit: "cover" }),
      el("photo_edge", "box", { x: 0, y: 76, w: 76, h: 3, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),
      el("field", "box", { x: 76, y: 0, w: 221, h: 76, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 88, y: 18, w: 9, h: 9, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 101, y: 20, w: 180, text: "{school}", size: 8, font: "mono", color: "rgba(255,255,255,.86)", align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("name", "text", { x: 88, y: 38, w: 196, text: "{name}", size: 40, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.02, spacing: sp(-.025, 40) }),
      el("header", "text", { x: 88, y: 64, w: 196, text: "CERTIFICATE OF PARTICIPATION", size: 8, font: "mono", color: BG_YELLOW, align: "left", weight: 400, spacing: sp(.26, 8) }),

      el("chest", "text", { x: 0, y: 88, w: 76, text: "Chest {chest}", size: 7.5, font: "mono", color: BG_CAPTION, align: "center", weight: 400, spacing: sp(.2, 7.5), uppercase: true }),
      el("house_rule", "box", { x: 22, y: 96, w: 32, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("house", "text", { x: 0, y: 101, w: 76, text: "{house}", size: 7.5, font: "mono", color: BG_CAPTION, align: "center", weight: 400, spacing: sp(.16, 7.5), uppercase: true }),

      el("rule", "box", { x: 88, y: 96, w: 191, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("results", "text", { x: 88, y: 104, w: 191, text: "{results}", size: 12, font: "sans", color: BG_BODY, align: "left", weight: 400, lineHeight: 1.72 }),
      el("footer_rule", "box", { x: 88, y: 180, w: 191, h: 0.25, fill: BG_LINE, stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 88, y: 186, w: 140, text: "{fest} · {date}", size: 11, font: "display", color: BG_BLUE, align: "left", weight: 700, spacing: sp(.04, 11), uppercase: true }),
      el("sig_rule", "box", { x: 209, y: 190, w: 70, h: 0.4, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("sig", "text", { x: 209, y: 192, w: 70, text: "PRINCIPAL", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) })
    ]
  };
}

/**
 * Bold Grid 04 · Winner Poster — the numeral IS the poster.
 *
 * One digit at 560pt on ultramarine, a square portrait bled into the top
 * corner, and a black plate across the bottom third carrying every word.
 * {rankNum} rather than {rank}: at this size the placement has to be a
 * digit, not the word "First".
 */
function boldWinnerPoster() {
  return {
    name: "Winner Poster",
    page: A4_PORTRAIT,
    background: BG_BLUE,
    backgroundImage: null,
    elements: [
      el("numeral", "text", { x: -18, y: 22, w: 246, text: "{rankNum}", size: 560, font: "display", color: BG_YELLOW, align: "center", weight: 700, lineHeight: 0.78, spacing: sp(-.06, 560) }),
      el("photo", "image", { x: 134, y: 0, w: 76, h: 76, src: "{photo}", radius: 0, fit: "cover" }),
      el("photo_edge", "box", { x: 134, y: 76, w: 76, h: 3, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 16, y: 16, w: 8, h: 8, fill: "#FFFFFF", stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 16, y: 28, w: 110, text: "{fest}", size: 8.5, font: "mono", color: "rgba(255,255,255,.9)", align: "left", weight: 400, spacing: sp(.24, 8.5), uppercase: true }),

      el("plate", "box", { x: 0, y: 186, w: 210, h: 111, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("plate_edge", "box", { x: 0, y: 186, w: 210, h: 3, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),
      el("place", "text", { x: 16, y: 198, w: 178, text: "{rank} PLACE", size: 10, font: "mono", color: BG_YELLOW, align: "left", weight: 400, spacing: sp(.24, 10), uppercase: true }),
      el("name", "text", { x: 16, y: 208, w: 178, text: "{name}", size: 36, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.02, spacing: sp(-.025, 36) }),
      el("house_rule", "box", { x: 16, y: 250, w: 44, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("event", "text", { x: 16, y: 256, w: 178, text: "{event}", size: 13, font: "sans", color: "rgba(255,255,255,.92)", align: "left", weight: 600 }),
      el("meta", "text", { x: 16, y: 265, w: 178, text: "{house} · Chest {chest} · {category}", size: 8.5, font: "mono", color: "rgba(255,255,255,.6)", align: "left", weight: 400, spacing: sp(.18, 8.5), uppercase: true }),
      el("footer_rule", "box", { x: 16, y: 280, w: 178, h: 0.4, fill: "rgba(255,255,255,.3)", stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 284, w: 178, text: "{school}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "left", weight: 400, spacing: sp(.16, 7.5), uppercase: true }),
      el("footer_r", "text", { x: 16, y: 284, w: 178, text: "{date}", size: 7.5, font: "mono", color: "rgba(255,255,255,.55)", align: "right", weight: 400, spacing: sp(.16, 7.5) })
    ]
  };
}

/**
 * Bold Grid 05 · Event Results — a data sheet, not a podium.
 *
 * The one results design in the kit with no portraits at all: ruled rows
 * carrying name, house and points, then the full finisher list, then a
 * strip of what each house took from THIS event. The source design shows
 * a race time in the last column — this fest has no timing, so points
 * stand in as the nearest thing every event actually records.
 */
function boldEventRanksPoster() {
  const row = (n, y, big) => [
    el(`r${n}num`, "text", { x: 16, y: y + 1, w: 18, text: String(n), size: big ? 26 : 22, font: "display", color: BG_INK, align: "left", weight: 700, lineHeight: 1 }),
    el(`r${n}name`, "text", { x: 36, y: y + 2, w: 80, text: `{rank${n}name}`, size: big ? 15 : 14, font: "sans", color: BG_INK, align: "left", weight: big ? 700 : 600 }),
    el(`r${n}bar`, "box", { x: 118, y: y + 3, w: 16, h: 2, fill: `{rank${n}houseColor}`, stroke: "none", strokeWidth: 0 }),
    el(`r${n}house`, "text", { x: 118, y: y + 7, w: 44, text: `{rank${n}house}`, size: 8.5, font: "mono", color: big ? BG_INK : BG_CAPTION, align: "left", weight: 400, spacing: sp(.12, 8.5), uppercase: true }),
    el(`r${n}points`, "text", { x: 150, y: y + 3, w: 44, text: `{rank${n}points}`, size: big ? 14 : 13, font: "mono", color: BG_INK, align: "right", weight: 700 })
  ];
  return {
    name: "Event Results — Poster",
    page: A4_PORTRAIT,
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("header", "box", { x: 0, y: 0, w: 210, h: 62, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("header_edge", "box", { x: 0, y: 62, w: 210, h: 3, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 16, y: 14, w: 8, h: 8, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 28, y: 16, w: 160, text: "{fest} · {school}", size: 8, font: "mono", color: "rgba(255,255,255,.72)", align: "left", weight: 400, spacing: sp(.22, 8), uppercase: true }),
      el("event", "text", { x: 16, y: 28, w: 178, text: "{event}", size: 30, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.04, spacing: sp(-.02, 30) }),
      el("category", "text", { x: 16, y: 50, w: 178, text: "{category} · FINAL RESULT", size: 9, font: "mono", color: BG_YELLOW, align: "left", weight: 400, spacing: sp(.22, 9), uppercase: true }),

      el("th_pl", "text", { x: 16, y: 74, w: 18, text: "PL", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("th_who", "text", { x: 36, y: 74, w: 80, text: "PARTICIPANT", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("th_house", "text", { x: 118, y: 74, w: 44, text: "HOUSE", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("th_pts", "text", { x: 150, y: 74, w: 44, text: "POINTS", size: 7.5, font: "mono", color: BG_CAPTION, align: "right", weight: 400, spacing: sp(.2, 7.5) }),
      el("th_rule", "box", { x: 16, y: 80, w: 178, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),

      el("winner_plate", "box", { x: 0, y: 85, w: 210, h: 22, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      ...row(1, 88, true),
      el("r1div", "box", { x: 16, y: 110, w: 178, h: 0.25, fill: BG_LINE, stroke: "none", strokeWidth: 0 }),
      ...row(2, 114, false),
      el("r2div", "box", { x: 16, y: 132, w: 178, h: 0.25, fill: BG_LINE, stroke: "none", strokeWidth: 0 }),
      ...row(3, 136, false),
      el("r3rule", "box", { x: 16, y: 154, w: 178, h: 1, fill: BG_INK, stroke: "none", strokeWidth: 0 }),

      el("all_lbl", "text", { x: 16, y: 160, w: 178, text: "EVERY PLACEMENT", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("all", "text", { x: 16, y: 167, w: 178, text: "{eventResults}", size: 10, font: "sans", color: BG_BODY, align: "left", weight: 400, lineHeight: 1.7 }),

      el("hp_lbl", "text", { x: 16, y: 206, w: 178, text: "HOUSE POINTS FROM THIS EVENT", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 7.5) }),
      el("hp_rule", "box", { x: 16, y: 214, w: 178, h: 0.25, fill: BG_LINE, stroke: "none", strokeWidth: 0 }),
      /* The leading house takes the flat ultramarine plate — a fixed
       * colour, so white on it is always legible — and every box carries
       * a thin bar in the house's own colour for identity instead. */
      el("hp1", "box", { x: 16, y: 220, w: 40, h: 26, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("hp1bar", "box", { x: 16, y: 220, w: 40, h: 2, fill: "{house1color}", stroke: "none", strokeWidth: 0 }),
      el("hp1pts", "text", { x: 16, y: 225, w: 40, text: "{house1points}", size: 20, font: "display", color: "#FFFFFF", align: "center", weight: 700 }),
      el("hp1name", "text", { x: 16, y: 238, w: 40, text: "{house1name}", size: 7, font: "mono", color: "rgba(255,255,255,.85)", align: "center", weight: 400, spacing: sp(.14, 7), uppercase: true }),
      el("hp2", "box", { x: 62, y: 220, w: 40, h: 26, fill: BG_PANEL, stroke: "none", strokeWidth: 0 }),
      el("hp2bar", "box", { x: 62, y: 220, w: 40, h: 2, fill: "{house2color}", stroke: "none", strokeWidth: 0 }),
      el("hp2pts", "text", { x: 62, y: 225, w: 40, text: "{house2points}", size: 20, font: "display", color: BG_INK, align: "center", weight: 700 }),
      el("hp2name", "text", { x: 62, y: 238, w: 40, text: "{house2name}", size: 7, font: "mono", color: BG_CAPTION, align: "center", weight: 400, spacing: sp(.14, 7), uppercase: true }),
      el("hp3", "box", { x: 108, y: 220, w: 40, h: 26, fill: BG_PANEL, stroke: "none", strokeWidth: 0 }),
      el("hp3bar", "box", { x: 108, y: 220, w: 40, h: 2, fill: "{house3color}", stroke: "none", strokeWidth: 0 }),
      el("hp3pts", "text", { x: 108, y: 225, w: 40, text: "{house3points}", size: 20, font: "display", color: BG_INK, align: "center", weight: 700 }),
      el("hp3name", "text", { x: 108, y: 238, w: 40, text: "{house3name}", size: 7, font: "mono", color: BG_CAPTION, align: "center", weight: 400, spacing: sp(.14, 7), uppercase: true }),
      el("hp4", "box", { x: 154, y: 220, w: 40, h: 26, fill: BG_PANEL, stroke: "none", strokeWidth: 0 }),
      el("hp4bar", "box", { x: 154, y: 220, w: 40, h: 2, fill: "{house4color}", stroke: "none", strokeWidth: 0 }),
      el("hp4pts", "text", { x: 154, y: 225, w: 40, text: "{house4points}", size: 20, font: "display", color: BG_INK, align: "center", weight: 700 }),
      el("hp4name", "text", { x: 154, y: 238, w: 40, text: "{house4name}", size: 7, font: "mono", color: BG_CAPTION, align: "center", weight: 400, spacing: sp(.14, 7), uppercase: true }),

      el("footer_rule", "box", { x: 16, y: 278, w: 178, h: 0.4, fill: BG_INK, stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 282, w: 178, text: "{school}", size: 7.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.16, 7.5), uppercase: true }),
      el("footer_r", "text", { x: 16, y: 282, w: 178, text: "{date}", size: 7.5, font: "mono", color: BG_CAPTION, align: "right", weight: 400, spacing: sp(.16, 7.5) })
    ]
  };
}

/**
 * Bold Grid 06 · Hall screen — full-width rows, not a podium.
 *
 * A leaderboard reads faster from the back of a hall than three podium
 * columns do: the eye runs down one edge instead of hopping between
 * groups. The winner's row sits on the yellow plate; the rest are white
 * on black and step down in size.
 */
function boldEventRanksScreen() {
  return {
    name: "Event Results — Screen (16:9)",
    page: SLIDE_16_9,
    background: BG_INK,
    backgroundImage: null,
    elements: [
      el("header", "box", { x: 0, y: 0, w: 338.67, h: 40, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 16, y: 11, w: 8, h: 8, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("eyebrow", "text", { x: 28, y: 12, w: 180, text: "{fest} · FINAL RESULT", size: 10, font: "mono", color: "rgba(255,255,255,.78)", align: "left", weight: 400, spacing: sp(.22, 10), uppercase: true }),
      el("event", "text", { x: 16, y: 22, w: 240, text: "{event}", size: 26, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.04, spacing: sp(-.02, 26) }),
      el("category", "text", { x: 240, y: 24, w: 82, text: "{category}", size: 13, font: "mono", color: BG_YELLOW, align: "right", weight: 400, spacing: sp(.18, 13), uppercase: true }),

      el("r1plate", "box", { x: 0, y: 48, w: 338.67, h: 30, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("r1num", "text", { x: 16, y: 52, w: 26, text: "1", size: 34, font: "display", color: BG_INK, align: "left", weight: 700, lineHeight: 1 }),
      el("r1photo", "image", { x: 52, y: 52, w: 52, h: 22, src: "{rank1photo}", radius: 0, fit: "cover" }),
      el("r1name", "text", { x: 112, y: 54, w: 130, text: "{rank1name}", size: 22, font: "sans", color: BG_INK, align: "left", weight: 700, lineHeight: 1.05 }),
      el("r1house", "text", { x: 112, y: 67, w: 130, text: "{rank1house} · CHEST {rank1chest}", size: 10, font: "mono", color: BG_BODY, align: "left", weight: 400, spacing: sp(.14, 10), uppercase: true }),
      el("r1pts", "text", { x: 250, y: 56, w: 72, text: "{rank1points}", size: 26, font: "mono", color: BG_INK, align: "right", weight: 700 }),

      el("r2num", "text", { x: 16, y: 88, w: 26, text: "2", size: 26, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1 }),
      el("r2photo", "image", { x: 52, y: 87, w: 40, h: 18, src: "{rank2photo}", radius: 0, fit: "cover" }),
      el("r2name", "text", { x: 112, y: 88, w: 130, text: "{rank2name}", size: 19, font: "sans", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.05 }),
      el("r2house", "text", { x: 112, y: 98, w: 130, text: "{rank2house}", size: 10, font: "mono", color: "rgba(255,255,255,.6)", align: "left", weight: 400, spacing: sp(.14, 10), uppercase: true }),
      el("r2pts", "text", { x: 250, y: 89, w: 72, text: "{rank2points}", size: 22, font: "mono", color: "#FFFFFF", align: "right", weight: 400 }),
      el("r2div", "box", { x: 16, y: 110, w: 306, h: 0.4, fill: "rgba(255,255,255,.22)", stroke: "none", strokeWidth: 0 }),

      el("r3num", "text", { x: 16, y: 118, w: 26, text: "3", size: 26, font: "display", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1 }),
      el("r3photo", "image", { x: 52, y: 117, w: 40, h: 18, src: "{rank3photo}", radius: 0, fit: "cover" }),
      el("r3name", "text", { x: 112, y: 118, w: 130, text: "{rank3name}", size: 19, font: "sans", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.05 }),
      el("r3house", "text", { x: 112, y: 128, w: 130, text: "{rank3house}", size: 10, font: "mono", color: "rgba(255,255,255,.6)", align: "left", weight: 400, spacing: sp(.14, 10), uppercase: true }),
      el("r3pts", "text", { x: 250, y: 119, w: 72, text: "{rank3points}", size: 22, font: "mono", color: "#FFFFFF", align: "right", weight: 400 }),
      el("r3div", "box", { x: 16, y: 140, w: 306, h: 0.4, fill: "rgba(255,255,255,.22)", stroke: "none", strokeWidth: 0 }),

      el("rest", "text", { x: 16, y: 148, w: 306, text: "{eventResults}", size: 12, font: "sans", color: "rgba(255,255,255,.72)", align: "left", weight: 400, lineHeight: 1.5 }),

      el("footer", "box", { x: 0, y: 170, w: 338.67, h: 20.5, fill: BG_MAGENTA_DEEP, stroke: "none", strokeWidth: 0 }),
      el("footer_l", "text", { x: 16, y: 177, w: 306, text: "{school}", size: 10, font: "mono", color: "#FFFFFF", align: "left", weight: 400, spacing: sp(.18, 10), uppercase: true }),
      el("footer_r", "text", { x: 16, y: 177, w: 306, text: "{date}", size: 10, font: "mono", color: "#FFFFFF", align: "right", weight: 400, spacing: sp(.18, 10) })
    ]
  };
}

/** Bold Grid 07 · Participant ID Card — CR80 landscape, chest number dominant. */
function boldIdCard() {
  const w = 85.6, h = 54;
  return {
    name: "Participant ID Card — Landscape",
    page: { w, h },
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("photo", "image", { x: 0, y: 0, w: 32, h: 32, src: "{photo}", radius: 0, fit: "cover" }),
      el("field", "box", { x: 32, y: 0, w: 53.6, h: 32, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("mark", "box", { x: 36, y: 4, w: 5, h: 5, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 43, y: 4, w: 40, text: "{fest}", size: 8, font: "display", color: "#FFFFFF", align: "left", weight: 700, uppercase: true }),
      el("name", "text", { x: 36, y: 14, w: 48, text: "{name}", size: 9.5, font: "sans", color: "#FFFFFF", align: "left", weight: 700, lineHeight: 1.1 }),
      el("meta", "text", { x: 36, y: 25, w: 48, text: "{house} · {category} · {class}", size: 5, font: "mono", color: "rgba(255,255,255,.8)", align: "left", weight: 400, spacing: sp(.16, 5), uppercase: true }),
      el("edge", "box", { x: 0, y: 32, w, h: 1.6, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),

      el("chest_lbl", "text", { x: 4, y: 36, w: 30, text: "CHEST NO.", size: 5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.2, 5) }),
      el("chest", "text", { x: 3, y: 37.6, w: 50, text: "{chest}", size: 30, font: "display", color: BG_INK, align: "left", weight: 700, lineHeight: 1, spacing: sp(-.02, 30) }),
      el("house_rule", "box", { x: 56, y: 37, w: 16, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("school", "text", { x: 56, y: 41, w: 28, text: "{school}", size: 5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.14, 5), lineHeight: 1.5, uppercase: true }),
      el("footer", "text", { x: 3, y: 47.6, w: 80, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: "#7E7A70", align: "left", weight: 400, spacing: sp(.14, 4.5) })
    ]
  };
}

/** Bold Grid 08 · Participant ID Card — CR80 portrait, full-width photo band. */
function boldIdCardPortrait() {
  const w = 54, h = 85.6;
  return {
    name: "Participant ID Card — Portrait",
    page: { w, h },
    background: BG_PAPER,
    backgroundImage: null,
    elements: [
      el("header", "box", { x: 0, y: 0, w, h: 12, fill: BG_BLUE, stroke: "none", strokeWidth: 0 }),
      el("punch", "box", { x: 22, y: 2.4, w: 10, h: 1.6, fill: "rgba(255,255,255,.6)", stroke: "none", strokeWidth: 0, radius: 0.8 }),
      el("mark", "box", { x: 4, y: 6.4, w: 5, h: 4, fill: BG_YELLOW, stroke: "none", strokeWidth: 0 }),
      el("fest", "text", { x: 11, y: 6.4, w: 40, text: "{fest}", size: 7.5, font: "display", color: "#FFFFFF", align: "left", weight: 700, uppercase: true }),
      /* Full-width band rather than a circular mask: a 240px source
       * spread across 54mm reads better than the same pixels squeezed
       * into a 26mm circle. */
      el("photo", "image", { x: 0, y: 12, w, h: 38, src: "{photo}", radius: 0, fit: "cover" }),
      el("edge", "box", { x: 0, y: 50, w, h: 1.6, fill: BG_MAGENTA, stroke: "none", strokeWidth: 0 }),

      el("name", "text", { x: 4, y: 54, w: 46, text: "{name}", size: 10, font: "sans", color: BG_INK, align: "left", weight: 700, lineHeight: 1.1 }),
      el("chest_lbl", "text", { x: 4, y: 63, w: 46, text: "CHEST NO.", size: 5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.18, 5) }),
      el("chest", "text", { x: 3, y: 65, w: 50, text: "{chest}", size: 30, font: "display", color: BG_BLUE, align: "left", weight: 700, lineHeight: 1, spacing: sp(-.02, 30) }),
      el("house_rule", "box", { x: 4, y: 74.6, w: 16, h: 2, fill: "{houseColor}", stroke: "none", strokeWidth: 0 }),
      el("meta", "text", { x: 4, y: 77.6, w: 46, text: "{house} · {category}", size: 5.5, font: "mono", color: BG_CAPTION, align: "left", weight: 400, spacing: sp(.12, 5.5), uppercase: true }),
      el("footer", "text", { x: 4, y: 80.6, w: 46, text: "PARTICIPANT · {date}", size: 4.5, font: "mono", color: "#7E7A70", align: "left", weight: 400, spacing: sp(.14, 4.5) })
    ]
  };
}

export const TEMPLATES = {
  // Modern — the original kit. Ids are unchanged from when these were the
  // only eight: a saved design stores its own elements, but `designs`
  // documents predate this and nothing should break for a fest mid-run.
  classicGold, modernIndigo, withPhoto, winnerPoster, idCard, idCardPortrait,
  eventRanksPoster, eventRanksScreen,
  // Classic — crimson, gilt and deep teal.
  classicFormal, classicBand, classicWithPhoto, classicWinnerPoster,
  classicEventRanksPoster, classicEventRanksScreen, classicIdCard, classicIdCardPortrait,
  // Bold Grid — split fields, oversized numerals, square crops.
  boldSplitField, boldChestNumeral, boldSquarePhoto, boldWinnerPoster,
  boldEventRanksPoster, boldEventRanksScreen, boldIdCard, boldIdCardPortrait
};

/* Every design belongs to a theme and a kind. `label` is the design's own
 * name within its theme — the theme supplies the rest of the identity, so
 * three "With Photo" entries under three headings read better than three
 * differently-worded near-synonyms. loadTemplate() prefixes the theme when
 * it builds the design's stored `name`, so a saved design is still
 * self-describing once it is out of this list. */
export const THEMES = [
  { id: "modern",  label: "Modern",
    blurb: "Vermilion on warm gradients — the app's own identity." },
  { id: "classic", label: "Classic",
    blurb: "Crimson, gilt and deep teal. Georgia, double rules, medal rings." },
  { id: "bold",    label: "Bold Grid",
    blurb: "Split colour fields, oversized numerals, square photos, real tables." }
];

export const TEMPLATE_LIST = [
  // ── Modern ──
  { id: "classicGold",      label: "Formal",          theme: "modern", kind: "certificate" },
  { id: "modernIndigo",     label: "Vermilion Rail",  theme: "modern", kind: "certificate" },
  { id: "withPhoto",        label: "With Photo",      theme: "modern", kind: "certificate" },
  { id: "winnerPoster",     label: "Winner Poster",   theme: "modern", kind: "poster" },
  { id: "eventRanksPoster", label: "Event Results (all ranks)",        theme: "modern", kind: "poster" },
  { id: "eventRanksScreen", label: "Event Results (all ranks) — 16:9", theme: "modern", kind: "poster" },
  { id: "idCard",           label: "ID Card — Landscape", theme: "modern", kind: "idcard" },
  { id: "idCardPortrait",   label: "ID Card — Portrait",  theme: "modern", kind: "idcard" },
  // ── Classic ──
  { id: "classicFormal",           label: "Formal",         theme: "classic", kind: "certificate" },
  { id: "classicBand",             label: "Crimson Band",   theme: "classic", kind: "certificate" },
  { id: "classicWithPhoto",        label: "With Photo",     theme: "classic", kind: "certificate" },
  { id: "classicWinnerPoster",     label: "Winner Poster",  theme: "classic", kind: "poster" },
  { id: "classicEventRanksPoster", label: "Event Results (all ranks)",        theme: "classic", kind: "poster" },
  { id: "classicEventRanksScreen", label: "Event Results (all ranks) — 16:9", theme: "classic", kind: "poster" },
  { id: "classicIdCard",           label: "ID Card — Landscape", theme: "classic", kind: "idcard" },
  { id: "classicIdCardPortrait",   label: "ID Card — Portrait",  theme: "classic", kind: "idcard" },
  // ── Bold Grid ──
  { id: "boldSplitField",       label: "Split Field",    theme: "bold", kind: "certificate" },
  { id: "boldChestNumeral",     label: "Chest Numeral",  theme: "bold", kind: "certificate" },
  { id: "boldSquarePhoto",      label: "Square Photo",   theme: "bold", kind: "certificate" },
  { id: "boldWinnerPoster",     label: "Winner Poster",  theme: "bold", kind: "poster" },
  { id: "boldEventRanksPoster", label: "Event Results (all ranks)",        theme: "bold", kind: "poster" },
  { id: "boldEventRanksScreen", label: "Event Results (all ranks) — 16:9", theme: "bold", kind: "poster" },
  { id: "boldIdCard",           label: "ID Card — Landscape", theme: "bold", kind: "idcard" },
  { id: "boldIdCardPortrait",   label: "ID Card — Portrait",  theme: "bold", kind: "idcard" }
];

export const TEMPLATE_KIND_LABEL = {
  certificate: "Certificates",
  poster: "Posters",
  idcard: "ID cards"
};

export const THEME_LABEL = Object.fromEntries(THEMES.map(t => [t.id, t.label]));

export function loadTemplate(id) {
  const fn = TEMPLATES[id] || TEMPLATES.classicGold;
  const design = fn();
  /* Qualify the name with its theme on the way out. Inside TEMPLATE_LIST
   * the theme is the heading above the button, so "With Photo" is
   * unambiguous there — but the moment this becomes a saved design in a
   * flat list of "Saved designs", three identically-named entries are
   * indistinguishable. */
  const theme = TEMPLATE_LIST.find(t => t.id === id)?.theme;
  const label = theme && THEME_LABEL[theme];
  return label ? { ...design, name: `${label} — ${design.name}` } : design;
}

/** Substitute {tokens} in a string from a data object. */
export function fillTokens(text, data) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : "");
}

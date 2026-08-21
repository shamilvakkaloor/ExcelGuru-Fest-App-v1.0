// Chest number / ID cards — ARCHITECTURE section 7.
//
// A printable card per participant carrying their chest number, name, house,
// category, photo and every event they are entered in.
//
// SEVERAL PER SHEET, deliberately. A 600-participant fest is 600 sheets at
// one per page and about 75 at eight per page.
//
// This is a FIXED LAYOUT, not a design-editor template. The editor places
// elements in absolute millimetres against a single page; repeating that
// across a grid would mean a second coordinate system nested inside the
// first. The card picks up the fest name, logo and house colour and is
// otherwise laid out here.
import { escapeHTML } from "../lib/pdf.js";

/** Grid geometry per sheet count, on A4 portrait. */
const LAYOUTS = {
  2: { cols: 1, rows: 2 },
  4: { cols: 2, rows: 2 },
  6: { cols: 2, rows: 3 },
  8: { cols: 2, rows: 4 },
  9: { cols: 3, rows: 3 }
};

export const CARDS_PER_SHEET = Object.keys(LAYOUTS).map(Number);

/** Card background choices offered in the print dialog. */
export const CARD_BACKGROUNDS = [
  { value: "white", label: "White (uses least ink)" },
  { value: "theme", label: "App theme — dark red and black" },
  { value: "house", label: "House colours — one shade per house" }
];

/* The app's own hero gradient, restated in print-safe terms. The screen
 * version layers a translucent red over near-black, which a print engine
 * flattens unpredictably; an opaque two-stop gradient between the same two
 * colours prints the same everywhere. */
const THEME_DARK = "#111010";
const THEME_RED  = "#5A1206";

/**
 * Scale a colour toward black PROPORTIONALLY (each channel × factor).
 *
 * Deliberately not houseColor.js's darkenColor(), which subtracts a flat
 * amount per channel: that cannot guarantee a dark result for a LIGHT input.
 * A white house colour subtracted by the same amount lands on mid-grey —
 * measured at 3.45:1 against white text, below the 4.5:1 needed to read —
 * so a house that picked a pale colour would print unreadable cards.
 * Multiplying is proportional, so every input lands dark enough whatever it
 * started as, and hue survives better than clamping channels at zero does.
 */
function scaleToDark(hex, factor) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return null;
  const ch = i => Math.max(0, Math.min(255, Math.round(((num >> i) & 0xff) * factor)));
  return "#" + [ch(16), ch(8), ch(0)].map(v => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Background and matching ink for one card.
 *
 * "house" falls back to the app theme rather than to white when a house has
 * no colour set: a sheet where three houses print dark and the fourth prints
 * white looks like a fault, not a choice.
 */
function cardSkin(background, houseColor) {
  if (background === "theme") return themeSkin();
  if (background === "house") {
    const deep = scaleToDark(houseColor, 0.34);
    const deeper = scaleToDark(houseColor, 0.16);
    // An unset or unparseable colour falls back to the app theme rather than
    // to white: a sheet where three houses print dark and the fourth prints
    // white reads as a fault, not a choice.
    if (!deep || !deeper) return themeSkin();
    return {
      dark: true,
      background: `linear-gradient(140deg, ${deep} 0%, ${deeper} 100%)`,
      // The house's own colour at full strength is the accent ON the card —
      // it has to stand off a background derived from that same colour.
      chip: houseColor
    };
  }
  return { dark: false, background: "#fff", chip: null };
}

function themeSkin() {
  return {
    dark: true,
    background: `linear-gradient(140deg, ${THEME_RED} 0%, ${THEME_DARK} 62%)`,
    chip: "#EC3013"
  };
}

/**
 * Build the print HTML for a set of cards.
 *
 * `cards` is [{ chestNumber, name, houseName, houseColor, categoryName,
 *               className, photo, events: [string] }]
 */
export function chestCardHTML(cards, { perSheet = 8, festName = "", logo = null, background = "white" } = {}) {
  const layout = LAYOUTS[perSheet] || LAYOUTS[8];
  const { cols, rows } = layout;
  const perPage = cols * rows;
  const tinted = background === "theme" || background === "house";

  // Cut guides matter more than decoration here — these get scissored apart.
  const css = `
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      /* A tinted card is only a tinted card if the browser actually prints
         backgrounds. Chrome and Firefox both honour this; without it the
         whole feature silently degrades to white paper with white text. */
      ${tinted ? `* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` : ""}
      .cc-sheet {
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        grid-template-rows: repeat(${rows}, 1fr);
        gap: 0;
        height: 281mm;
        page-break-after: always;
      }
      .cc-sheet:last-child { page-break-after: auto; }
      .cc-card {
        border: 1px dashed ${tinted ? "#6D7076" : "#9aa5ad"};
        padding: 4mm 4.5mm;
        display: flex; flex-direction: column; gap: 1.5mm;
        overflow: hidden;
        font-family: Inter, Helvetica, Arial, sans-serif;
        color: #14232E;
      }
      /* Light ink for a dark card. Set on the card itself so an empty
         padding slot on the last sheet stays plain paper. */
      .cc-card.cc-dark { color: #F6F5F2; }
      .cc-card.cc-dark .cc-fest { color: rgba(246,245,242,.62); }
      .cc-card.cc-dark .cc-meta { color: rgba(246,245,242,.78); }
      .cc-card.cc-dark .cc-events { border-top-color: rgba(246,245,242,.22); }
      .cc-card.cc-dark .cc-events-h { color: rgba(246,245,242,.55); }
      .cc-card.cc-dark .cc-none { color: rgba(246,245,242,.5); }
      .cc-card.cc-dark .cc-photo { background: rgba(255,255,255,.1); }
      .cc-card.cc-dark .cc-photo-blank {
        background: rgba(255,255,255,.1) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFFFFF' fill-opacity='0.45'%3E%3Ccircle cx='12' cy='9' r='4'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0z'/%3E%3C/svg%3E") center/58% no-repeat;
      }
      .cc-top { display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
      .cc-fest { font-size: 7pt; letter-spacing: .06em; text-transform: uppercase; color: #6B7A87; }
      /* The logo is a SIBLING of .cc-fest inside .cc-top, not a child of it —
         a ".cc-fest img" rule here matched nothing, so the logo printed at
         its natural pixel size and swallowed the card. Scoped to .cc-top. */
      .cc-top img { max-height: 7mm; max-width: 32mm; object-fit: contain; display: block; flex: none; }
      .cc-body { display: flex; gap: 3.5mm; align-items: flex-start; }
      .cc-photo {
        width: 20mm; height: 24mm; object-fit: cover; flex: none;
        border-radius: 1.5mm; background: #EEF2F6;
      }
      /* A participant with no usable photo gets a neutral panel, never a
         broken-image icon. */
      .cc-photo-blank {
        background: #EEF2F6 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23C2CCD4'%3E%3Ccircle cx='12' cy='9' r='4'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0z'/%3E%3C/svg%3E") center/58% no-repeat;
      }
      .cc-chest {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 26pt; font-weight: 700; line-height: 1; letter-spacing: -.01em;
      }
      .cc-name { font-size: 11pt; font-weight: 600; line-height: 1.15; margin-top: 1mm; }
      .cc-meta { font-size: 7.5pt; color: #55636E; line-height: 1.35; margin-top: .8mm; }
      .cc-house {
        display: inline-block; padding: .4mm 1.6mm; border-radius: 1mm;
        font-size: 7pt; font-weight: 600; color: #fff; background: #14232E;
      }
      .cc-events { margin-top: auto; border-top: .3mm solid #DFE5EA; padding-top: 1.4mm; }
      .cc-events-h { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .06em; color: #8A97A2; }
      .cc-events-l { font-size: 7.5pt; line-height: 1.3; }
      .cc-none { font-size: 7.5pt; color: #8A97A2; font-style: italic; }
    </style>`;

  const pages = [];
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage));

  const body = pages.map(page => {
    // Pad the last sheet so the grid keeps its shape rather than stretching
    // two cards to fill eight slots.
    const filled = [...page, ...Array(perPage - page.length).fill(null)];
    return `<div class="cc-sheet">` + filled.map(c => c ? cardHTML(c, festName, logo, background) : `<div class="cc-card"></div>`).join("") + `</div>`;
  }).join("");

  return css + body;
}

function cardHTML(c, festName, logo, background = "white") {
  const events = (c.events || []).filter(Boolean);
  const skin = cardSkin(background, c.houseColor);
  // The house chip's own colour: its normal job is to identify the house,
  // but on a card already tinted with that house's colour it would vanish,
  // so a tinted card gives it the skin's contrasting chip colour instead.
  const chipColor = skin.chip || c.houseColor || null;
  return `
    <div class="cc-card${skin.dark ? " cc-dark" : ""}"${skin.dark ? ` style="background:${skin.background}"` : ""}>
      <div class="cc-top">
        <span class="cc-fest">${escapeHTML(festName)}</span>
        ${logo ? `<img src="${logo}" alt="">` : ""}
      </div>
      <div class="cc-body">
        ${c.photo
          ? `<img class="cc-photo" src="${c.photo}" alt="">`
          : `<div class="cc-photo cc-photo-blank"></div>`}
        <div style="min-width:0;flex:1">
          <div class="cc-chest">${escapeHTML(String(c.chestNumber ?? ""))}</div>
          <div class="cc-name">${escapeHTML(c.name || "")}</div>
          <div class="cc-meta">
            <span class="cc-house"${chipColor ? ` style="background:${escapeHTML(chipColor)}"` : ""}>${escapeHTML(c.houseName || "")}</span>
            ${c.categoryName ? " " + escapeHTML(c.categoryName) : ""}
            ${c.className ? " &middot; " + escapeHTML(c.className) : ""}
          </div>
        </div>
      </div>
      <div class="cc-events">
        <div class="cc-events-h">Events (${events.length})</div>
        ${events.length
          ? `<div class="cc-events-l">${escapeHTML(events.join(", "))}</div>`
          : `<div class="cc-none">Not registered for any event yet</div>`}
      </div>
    </div>`;
}

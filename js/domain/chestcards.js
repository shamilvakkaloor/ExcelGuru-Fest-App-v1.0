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

/**
 * Build the print HTML for a set of cards.
 *
 * `cards` is [{ chestNumber, name, houseName, houseColor, categoryName,
 *               className, photo, events: [string] }]
 */
export function chestCardHTML(cards, { perSheet = 8, festName = "", logo = null } = {}) {
  const layout = LAYOUTS[perSheet] || LAYOUTS[8];
  const { cols, rows } = layout;
  const perPage = cols * rows;

  // Cut guides matter more than decoration here — these get scissored apart.
  const css = `
    <style>
      @page { size: A4 portrait; margin: 8mm; }
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
        border: 1px dashed #9aa5ad;
        padding: 4mm 4.5mm;
        display: flex; flex-direction: column; gap: 1.5mm;
        overflow: hidden;
        font-family: Inter, Helvetica, Arial, sans-serif;
        color: #14232E;
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
    return `<div class="cc-sheet">` + filled.map(c => c ? cardHTML(c, festName, logo) : `<div class="cc-card"></div>`).join("") + `</div>`;
  }).join("");

  return css + body;
}

function cardHTML(c, festName, logo) {
  const events = (c.events || []).filter(Boolean);
  return `
    <div class="cc-card">
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
            <span class="cc-house"${c.houseColor ? ` style="background:${escapeHTML(c.houseColor)}"` : ""}>${escapeHTML(c.houseName || "")}</span>
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

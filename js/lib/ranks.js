// Rank artwork — ARCHITECTURE §10.3.
//
// v6 rendered placements as the string "#1". On a hall projector that reads
// as data, not as a result. These are medals.
//
// They are inline SVG rather than image files for two reasons: there is no
// build step to copy assets, and there is no paid Storage bucket to hold
// uploads. Inline SVG costs zero network requests and stays crisp at
// projector resolution, which a 64px PNG scaled to fill a 4K screen does not.
//
// An Admin may override any rank with an uploaded PNG (settings.rankArt),
// for a fest that has its own medal graphics.
import { escapeHTML } from "./pdf.js";

const MEDALS = {
  1: { ring: "#B8860B", face: "#F5C542", edge: "#8A6A1F", label: "1" },
  2: { ring: "#8C9BA5", face: "#D7DEE3", edge: "#66737C", label: "2" },
  3: { ring: "#A0622D", face: "#D9925A", edge: "#7A4620", label: "3" }
};

/** Raw SVG markup for a medal, sized to `px`. */
export function medalSVG(rank, px = 64) {
  const m = MEDALS[rank];
  if (!m) return null;
  const id = "g" + rank + "_" + Math.random().toString(36).slice(2, 7);
  return `
<svg viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="Rank ${rank}"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${m.face}"/>
      <stop offset="1" stop-color="${m.ring}"/>
    </linearGradient>
  </defs>
  <path d="M18 4 L26 4 L34 24 L24 30 Z" fill="${m.edge}" opacity=".85"/>
  <path d="M46 4 L38 4 L30 24 L40 30 Z" fill="${m.edge}" opacity=".85"/>
  <circle cx="32" cy="40" r="20" fill="url(#${id})" stroke="${m.edge}" stroke-width="2"/>
  <circle cx="32" cy="40" r="14.5" fill="none" stroke="${m.edge}" stroke-width="1" opacity=".55"/>
  <text x="32" y="47" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="19" font-weight="700"
        fill="${m.edge}">${m.label}</text>
</svg>`.trim();
}

/**
 * A rank badge as a DOM node.
 *
 * Ranks with artwork get the medal; anything past it falls back to the
 * numeral, so a fest that awards six places still displays 4th to 6th
 * sensibly rather than showing nothing.
 */
export function rankNode(rank, { size = 56, rankArt = null } = {}) {
  const wrap = document.createElement("span");
  wrap.className = "rank-art rank-art-" + rank;

  const override = rankArt?.[String(rank)];
  if (override) {
    const img = document.createElement("img");
    img.src = override;
    img.alt = "Rank " + rank;
    img.width = size; img.height = size;
    img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;display:block`;
    wrap.appendChild(img);
    return wrap;
  }

  const svg = medalSVG(rank, size);
  if (svg) { wrap.innerHTML = svg; return wrap; }

  wrap.className = "rank-art rank-art-plain";
  wrap.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  wrap.textContent = String(rank);
  return wrap;
}

/** Print/HTML variant, for the poster templates and PDF sheets. */
export function rankHTML(rank, { size = 56, rankArt = null } = {}) {
  const override = rankArt?.[String(rank)];
  if (override) {
    // Escaped: this is an Admin-uploaded value going into a double-quoted
    // attribute. Unescaped, a quote in it would close the attribute early and
    // silently drop everything after — the same fault that cost the
    // certificate print its entire text styling.
    return `<img src="${escapeHTML(override)}" alt="Rank ${rank}" style="width:${size}px;height:${size}px;object-fit:contain">`;
  }
  return medalSVG(rank, size) || `<span class="rank-plain">${rank}</span>`;
}

export const hasMedal = rank => !!MEDALS[rank];

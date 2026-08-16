// Pure hex-color shading. No DOM, no Firestore — see CLAUDE.md conventions
// for js/domain/. Used to derive a score-card background/foreground pair
// from a single house color the admin picks, rather than asking them to
// choose two colors that stay in sync by hand.

/** Mixes a #rrggbb (or #rgb) color toward black (negative amt) or white
 *  (positive amt). amt is a percent, -100..100. */
export function shadeColor(hex, amt) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const delta = Math.round(2.55 * amt);
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp(((num >> 16) & 0xff) + delta);
  const g = clamp(((num >> 8) & 0xff) + delta);
  const b = clamp((num & 0xff) + delta);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

/** Darker version of a house color, for a score-card background. */
export function darkenColor(hex, amt = 32) { return shadeColor(hex, -Math.abs(amt)); }

/** Lighter version of a house color, for text over that darker background. */
export function lightenColor(hex, amt = 46) { return shadeColor(hex, Math.abs(amt)); }

/**
 * A CSS `style` attribute value tinting a participant's name with their
 * house's own color, or null when that house has no color or has not
 * opted in. `styleMap` is a `publicLeaderboard.houseStyle`-shaped object
 * (or the `houses` collection itself — both carry `color`/`useAsNameColor`).
 */
export function nameColorStyle(styleMap, houseId) {
  const st = (styleMap && styleMap[houseId]) || {};
  return st.useAsNameColor && st.color ? "color:" + st.color : null;
}

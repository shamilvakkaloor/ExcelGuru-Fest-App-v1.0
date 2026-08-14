// Inline SVG icons.
//
// No icon font and no sprite file: there is no build step, and a webfont
// would be a blocking network request on venue wifi for the sake of twenty
// glyphs. These are stroked paths on a 24-grid, so they inherit currentColor
// and stay sharp at any size.

const P = {
  home:      '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/>',
  trophy:    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3"/><path d="M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 14v3"/><path d="M8.5 21h7l-.8-4h-5.4z"/>',
  users:     '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M18 14.6A6.2 6.2 0 0 1 21.2 20"/>',
  broadcast: '<circle cx="12" cy="12" r="2.4"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4"/><path d="M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M5 5a10 10 0 0 0 0 14"/><path d="M19 19a10 10 0 0 0 0-14"/>',
  monitor:   '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7"/><path d="M12 17v4"/>',
  // A hex-nut with a bolt hole, not a starburst — the old path was a
  // circle with eight straight spokes, indistinguishable from the sun
  // icon at a glance (reported as "the settings icon looks like
  // brightness"). Same closed-polygon-plus-inner-mark language as
  // `shield` above, rather than another ring of thin radiating lines.
  gear:      '<path d="M12 3.2 19.2 7.4v8.4L12 20l-7.2-4.2V7.4z"/><circle cx="12" cy="12" r="3"/>',
  grid:      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  list:      '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.1"/><circle cx="3.6" cy="12" r="1.1"/><circle cx="3.6" cy="18" r="1.1"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1H9z"/><path d="M9 11h6M9 15h4"/>',
  gavel:     '<path d="M13.5 3.5 20 10l-2.5 2.5L11 6z"/><path d="m9 8 7 7-3 3-7-7z"/><path d="M4 20h9"/>',
  star:      '<path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  award:     '<circle cx="12" cy="9" r="5.2"/><path d="m8.6 13.6-1.4 7 4.8-2.5 4.8 2.5-1.4-7"/>',
  download:  '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/>',
  search:    '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.3 4.3"/>',
  logout:    '<path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M9.5 8 5.5 12l4 4"/><path d="M5.5 12H15"/>',
  chevron:   '<path d="m9 5 7 7-7 7"/>',
  menu:      '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  close:     '<path d="m6 6 12 12M18 6 6 18"/>',
  panel:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16"/>',
  eye:       '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  sliders:   '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.1"/><circle cx="10" cy="17" r="2.1"/>',
  shield:    '<path d="M12 3 5 6v5.6c0 4.3 2.9 7.7 7 9.4 4.1-1.7 7-5.1 7-9.4V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
  alert:     '<path d="M12 4.2 21 19H3z"/><path d="M12 10v4M12 16.6v.3"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
  moon:      '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  key:       '<circle cx="8.2" cy="12" r="3.7"/><path d="M11.9 12H21"/><path d="M17.6 12v3.2M20.2 12v2.2"/>',
  mail:      '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>'
};

/** icon("gear", 18) → an <svg> node that inherits colour and size. */
export function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  svg.innerHTML = P[name] || P.grid;
  return svg;
}

export const hasIcon = name => !!P[name];

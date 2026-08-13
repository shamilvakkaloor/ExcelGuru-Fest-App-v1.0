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

export const PLACEHOLDERS = [
  { token: "{name}",      label: "Participant name" },
  { token: "{chest}",     label: "Chest number" },
  { token: "{house}",     label: "House" },
  { token: "{category}",  label: "Category" },
  { token: "{class}",     label: "Class / grade" },
  { token: "{type}",      label: "Programme type" },
  { token: "{tier}",      label: "Programme tier" },
  { token: "{results}",   label: "All events & results" },
  { token: "{event}",     label: "Event name" },
  { token: "{rank}",      label: "Placement" },
  { token: "{grade}",     label: "Grade" },
  { token: "{fest}",      label: "Fest name" },
  { token: "{school}",    label: "School name" },
  { token: "{date}",      label: "Today's date" },
  { token: "{photo}",     label: "Participant photo (image element)" }
];

const el = (id, type, props) => ({ id, type, ...props });

/** Classic gold certificate — bordered, serif, formal. */
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
      el("header", "text", { x: 30, y: 34, w: 237, text: "Certificate of Excellence", size: 26, font: "serif", color: "#8A6A1F", align: "center", weight: 700 }),
      el("subheader", "text", { x: 30, y: 56, w: 237, text: "Presented to", size: 11, font: "serif", color: "#5B4A22", align: "center", weight: 400 }),
      el("name", "text", { x: 30, y: 66, w: 237, text: "{name}", size: 30, font: "serif", color: "#3A2E10", align: "center", weight: 700 }),
      el("body", "text", { x: 40, y: 92, w: 217, text: "For outstanding achievement in {fest}.", size: 11, font: "serif", color: "#5B4A22", align: "center", weight: 400 }),
      el("results", "text", { x: 40, y: 105, w: 217, text: "{results}", size: 9.5, font: "sans", color: "#4A3D1C", align: "center", weight: 400, lineHeight: 1.5 }),
      el("date_lbl", "text", { x: 26, y: 178, w: 90, text: "Date: {date}", size: 9, font: "sans", color: "#5B4A22", align: "left", weight: 400 }),
      el("sig_line", "box", { x: 195, y: 176, w: 70, h: 0.4, fill: "#8A6A1F", stroke: "none", strokeWidth: 0 }),
      el("sig_text", "text", { x: 195, y: 179, w: 70, text: "Authorised Signature", size: 8.5, font: "sans", color: "#5B4A22", align: "center", weight: 400 })
    ]
  };
}

/** Modern indigo — flat colour band, sans-serif, contemporary. */
function modernIndigo() {
  return {
    name: "Modern Indigo",
    page: A4,
    background: "#FFFFFF",
    backgroundImage: null,
    elements: [
      el("band", "box", { x: 0, y: 0, w: 297, h: 46, fill: "#241B4E", stroke: "none", strokeWidth: 0, radius: 0 }),
      el("accent", "box", { x: 0, y: 46, w: 297, h: 3, fill: "#F5A524", stroke: "none", strokeWidth: 0, radius: 0 }),
      el("fest", "text", { x: 20, y: 16, w: 257, text: "{fest}", size: 20, font: "sans", color: "#FFFFFF", align: "left", weight: 700 }),
      el("school", "text", { x: 20, y: 31, w: 257, text: "{school}", size: 9, font: "sans", color: "#A9BBD0", align: "left", weight: 400, spacing: 2 }),
      el("header", "text", { x: 20, y: 64, w: 257, text: "CERTIFICATE OF PARTICIPATION", size: 11, font: "sans", color: "#6C4BD6", align: "left", weight: 700, spacing: 4 }),
      el("name", "text", { x: 20, y: 76, w: 257, text: "{name}", size: 32, font: "sans", color: "#14232E", align: "left", weight: 700 }),
      el("meta", "text", { x: 20, y: 98, w: 257, text: "Chest {chest} · {house} · {category}", size: 10, font: "sans", color: "#7B8DA0", align: "left", weight: 400 }),
      el("results", "text", { x: 20, y: 112, w: 257, text: "{results}", size: 9.5, font: "sans", color: "#405265", align: "left", weight: 400, lineHeight: 1.6 }),
      el("sig_line", "box", { x: 200, y: 180, w: 70, h: 0.4, fill: "#14232E", stroke: "none", strokeWidth: 0 }),
      el("sig_text", "text", { x: 200, y: 183, w: 70, text: "Authorised Signature", size: 8.5, font: "sans", color: "#7B8DA0", align: "center", weight: 400 })
    ]
  };
}

/** Photo certificate — includes a participant portrait. */
function withPhoto() {
  const base = modernIndigo();
  base.name = "With Photo";
  base.elements = base.elements.filter(e => !["name", "meta", "results"].includes(e.id));
  base.elements.push(
    el("photo", "image", { x: 22, y: 64, w: 40, h: 40, src: "{photo}", radius: 20 }),
    el("name", "text", { x: 70, y: 68, w: 205, text: "{name}", size: 28, font: "sans", color: "#14232E", align: "left", weight: 700 }),
    el("meta", "text", { x: 70, y: 90, w: 205, text: "Chest {chest} · {house} · {category}", size: 10, font: "sans", color: "#7B8DA0", align: "left", weight: 400 }),
    el("results", "text", { x: 22, y: 115, w: 253, text: "{results}", size: 9.5, font: "sans", color: "#405265", align: "left", weight: 400, lineHeight: 1.6 })
  );
  return base;
}

/** Winner poster — portrait, big placement, one event. */
function winnerPoster() {
  return {
    name: "Winner Poster",
    page: A4_PORTRAIT,
    background: "#14232E",
    backgroundImage: null,
    elements: [
      el("glow", "box", { x: -40, y: -40, w: 180, h: 180, fill: "#6C4BD6", stroke: "none", strokeWidth: 0, radius: 90, opacity: 0.35 }),
      el("fest", "text", { x: 20, y: 24, w: 170, text: "{fest}", size: 12, font: "sans", color: "#F5A524", align: "center", weight: 700, spacing: 3 }),
      el("event", "text", { x: 15, y: 44, w: 180, text: "{event}", size: 24, font: "sans", color: "#FFFFFF", align: "center", weight: 700 }),
      el("category", "text", { x: 15, y: 64, w: 180, text: "{category}", size: 11, font: "sans", color: "#A9BBD0", align: "center", weight: 400 }),
      el("photo", "image", { x: 70, y: 82, w: 70, h: 70, src: "{photo}", radius: 35 }),
      el("rank", "text", { x: 15, y: 162, w: 180, text: "{rank}", size: 34, font: "sans", color: "#F5A524", align: "center", weight: 700 }),
      el("name", "text", { x: 15, y: 202, w: 180, text: "{name}", size: 22, font: "sans", color: "#FFFFFF", align: "center", weight: 700 }),
      el("house", "text", { x: 15, y: 224, w: 180, text: "{house}", size: 13, font: "sans", color: "#A9BBD0", align: "center", weight: 400 })
    ]
  };
}

export const TEMPLATES = {
  classicGold, modernIndigo, withPhoto, winnerPoster
};

export const TEMPLATE_LIST = [
  { id: "classicGold",  label: "Design 1 — Classic Gold" },
  { id: "modernIndigo", label: "Design 2 — Modern Indigo" },
  { id: "withPhoto",    label: "Design 3 — With Photo" },
  { id: "winnerPoster", label: "Design 4 — Winner Poster" }
];

export function loadTemplate(id) {
  const fn = TEMPLATES[id] || TEMPLATES.classicGold;
  return fn();
}

/** Substitute {tokens} in a string from a data object. */
export function fillTokens(text, data) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : "");
}

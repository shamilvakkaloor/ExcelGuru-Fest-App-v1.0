// Rendering a design (see domain/templates.js) to two targets:
//   · an interactive DOM canvas for the editor
//   · static print HTML for the PDF window
//
// Both take the same millimetre coordinates, so what the editor shows is
// what prints. The editor simply scales mm to pixels by a zoom factor.
import { fillTokens } from "../domain/templates.js";
import { escapeHTML } from "./pdf.js";
import { PLACEHOLDER_AVATAR } from "./photo.js";

/** Pixels per millimetre at 96dpi — the browser's own CSS unit ratio. */
export const MM_PER_PX_AT_96DPI = 3.7795275591;

// SINGLE quotes inside these values, deliberately. renderPageHTML() puts the
// whole style string into a double-quoted HTML attribute; a double quote here
// closed that attribute at the first font name, so everything declared after
// font-family — size, weight, colour, alignment — was dropped on the floor and
// the print came out as unstyled left-aligned text. The editor was never
// affected because it assigns the same string via setAttribute, which does no
// HTML parsing. Single quotes are equally valid CSS in both paths.
/* These names must match what the PRINT window loads (see pdf.js, which
 * pulls Inter, Space Grotesk and JetBrains Mono from Google Fonts) — the
 * print output is the thing being designed, so it is the authority.
 *
 * The app shell itself loads neither Inter nor Space Grotesk, so the EDITOR
 * canvas used to fall back to whatever `system-ui` meant on that machine
 * while the print came out in Inter: the editor was lying about the one
 * thing it exists to preview. ensureDesignFonts() below loads them for the
 * editor too, rather than changing these names — a design already saved must
 * keep printing in the typeface it was drawn for. */
export const FONTS = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "'Inter', system-ui, sans-serif",
  display: "'Space Grotesk', sans-serif",
  mono: "'JetBrains Mono', monospace"
};

/**
 * Pull the design typefaces into the MAIN document, so the editor canvas
 * renders in the same fonts the print window will use.
 *
 * Injected on demand rather than added to index.html: these are needed only
 * by the design editor, and every other page — including the public ones a
 * spectator loads — would otherwise pay for a font request it never uses.
 * Idempotent, so opening the editor repeatedly adds one link, not twenty.
 */
export function ensureDesignFonts() {
  const ID = "design-fonts";
  if (typeof document === "undefined" || document.getElementById(ID)) return;
  const link = document.createElement("link");
  link.id = ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700" +
              "&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap";
  document.head.appendChild(link);
}

/** Common CSS for one element, in whichever unit the target needs. */
function elementStyle(e, unit, scale = 1) {
  const u = v => (unit === "px" ? v * scale + "px" : v + "mm");
  const base = `left:${u(e.x)};top:${u(e.y)};width:${u(e.w)};`;

  if (e.type === "box") {
    return base +
      `height:${u(e.h)};` +
      `background:${e.fill && e.fill !== "none" ? e.fill : "transparent"};` +
      (e.stroke && e.stroke !== "none"
        ? `border:${unit === "px" ? Math.max(1, (e.strokeWidth || 0) * scale) + "px" : (e.strokeWidth || 0) + "mm"} solid ${e.stroke};` : "") +
      `border-radius:${u(e.radius || 0)};` +
      (e.opacity !== undefined ? `opacity:${e.opacity};` : "");
  }

  if (e.type === "image") {
    /* box-sizing matters here: a border on an <img> would otherwise be added
     * OUTSIDE the width/height the design specifies, so a photo with a frame
     * would print larger than the box the editor drew and shift everything
     * placed against it. */
    return base +
      `height:${u(e.h)};` +
      `border-radius:${u(e.radius || 0)};` +
      // "cover" fills the frame and crops; "contain" shows the whole photo
      // and leaves gaps. Cover stays the default — a portrait cropped to a
      // circle is the usual want, and it is what every existing design has.
      `object-fit:${e.fit === "contain" ? "contain" : "cover"};overflow:hidden;box-sizing:border-box;` +
      (e.stroke && e.stroke !== "none"
        ? `border:${unit === "px" ? Math.max(1, (e.strokeWidth || 0) * scale) + "px" : (e.strokeWidth || 0) + "mm"} solid ${e.stroke};` : "") +
      (e.opacity !== undefined ? `opacity:${e.opacity};` : "");
  }

  // text
  //
  // I18 — THE FONT SCALE BUG.
  //
  // `size` is POINTS. Print uses it directly. The editor used to compute
  // `e.size * scale * 3.78`, where `scale` is ALREADY `zoom * 3.78`
  // px-per-mm — so the mm→px factor was applied twice, and on top of that
  // the value was read as millimetres rather than points. At the default
  // 0.42 zoom a 30pt name rendered near 180px instead of 17px: about 10.7x
  // too large. Print (mm mode) was always correct, which is why the two
  // never agreed.
  //
  // Correct conversion: pt → px = size * 96/72, scaled by the zoom factor
  // (scale / 3.78 recovers the zoom from the px-per-mm value).
  const sizePx = unit === "px"
    ? (e.size * (scale / MM_PER_PX_AT_96DPI) * (96 / 72)) + "px"
    : e.size + "pt";
  return base +
    `font-family:${FONTS[e.font] || FONTS.sans};` +
    `font-size:${sizePx};` +
    `font-weight:${e.weight || 400};` +
    `color:${e.color || "#000"};` +
    `text-align:${e.align || "left"};` +
    `line-height:${e.lineHeight || 1.25};` +
    (e.spacing ? `letter-spacing:${e.spacing * 0.1}${unit === "px" ? "px" : "mm"};` : "") +
    `white-space:pre-wrap;`;
}

/**
 * What an image element actually points at.
 *
 * `src` is either a data URL / uploaded image, or a single {token}. Any
 * token resolves against the same data object the text elements use, so a
 * results poster can place {rank1photo}, {rank2photo}, … exactly the way it
 * places {rank1name} — one mechanism, not a special case per template.
 * A token with no value falls back to the silhouette rather than a broken
 * image: a poster for an event whose winner has no photo on file should
 * still print.
 */
export function resolveImageSrc(src, data) {
  const token = /^\{(\w+)\}$/.exec(String(src || ""));
  if (token) return data[token[1]] || PLACEHOLDER_AVATAR;
  return src || PLACEHOLDER_AVATAR;
}

/** Print-ready HTML for one filled page. */
export function renderPageHTML(design, data) {
  const inner = design.elements.map(e => {
    // Escaped for attribute context: a colour or font the user typed into the
    // editor must never be able to terminate the attribute the way the quoted
    // font stack above silently did.
    const style = escapeHTML(elementStyle(e, "mm"));
    if (e.type === "box") return `<div style="position:absolute;${style}"></div>`;
    if (e.type === "image") {
      return `<img src="${escapeHTML(resolveImageSrc(e.src, data))}" style="position:absolute;${style}" alt="">`;
    }
    return `<div style="position:absolute;${style}">${escapeHTML(fillTokens(e.text, data))}</div>`;
  }).join("");

  const bg = design.backgroundImage
    ? `background-image:url('${escapeHTML(design.backgroundImage)}');background-size:cover;background-position:center;`
    : `background:${design.background || "#fff"};`;

  return `<div class="design-page" style="position:relative;width:${design.page.w}mm;height:${design.page.h}mm;${bg}overflow:hidden;page-break-after:always;">${inner}</div>`;
}

/**
 * Interactive DOM canvas for the editor. `scale` converts mm to px.
 * onSelect fires with an element id; drag and resize mutate the design in
 * place and call onChange so the caller can re-render the properties pane.
 */
export function renderCanvas(design, { scale, selectedId, onSelect, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "canvas-wrap";
  wrap.style.width = design.page.w * scale + "px";
  wrap.style.height = design.page.h * scale + "px";
  if (design.backgroundImage) {
    wrap.style.backgroundImage = `url('${design.backgroundImage}')`;
    wrap.style.backgroundSize = "cover";
    wrap.style.backgroundPosition = "center";
  } else {
    wrap.style.background = design.background || "#fff";
  }

  wrap.addEventListener("mousedown", ev => { if (ev.target === wrap) onSelect(null); });

  for (const e of design.elements) {
    const node = document.createElement(e.type === "image" ? "img" : "div");
    node.className = "cv-el" + (e.id === selectedId ? " selected" : "");
    node.dataset.id = e.id;
    node.setAttribute("style", "position:absolute;" + elementStyle(e, "px", scale));

    if (e.type === "image") {
      // Same resolution the print path uses, against the editor's sample
      // data — so a {rank2photo} box previews as a portrait rather than as
      // a broken image the designer has to imagine around.
      node.src = resolveImageSrc(e.src, previewData());
      node.alt = "";
      node.draggable = false;
    } else if (e.type === "text") {
      node.textContent = fillTokens(e.text, previewData());
      shrinkToFit(node, e, scale);
    }

    node.addEventListener("mousedown", startDrag(e, node));
    if (e.id === selectedId) {
      const handle = document.createElement("div");
      handle.className = "handle";
      handle.addEventListener("mousedown", startResize(e, node));
      node.appendChild(handle);
    }
    wrap.appendChild(node);
  }

  function startDrag(e, node) {
    return ev => {
      if (ev.target.classList.contains("handle")) return;
      ev.preventDefault();
      // Selecting repaints the whole canvas, which DESTROYS `node` — every
      // element is rebuilt from scratch. The drag then moved a detached node
      // while the real one sat still, so dragging looked like it did nothing
      // until some later repaint jumped the element to its new position.
      // Resolve the live node on each move instead of trusting the captured
      // one; it survives any number of repaints mid-drag.
      onSelect(e.id);
      // Query the DOCUMENT, not `wrap`: after a repaint the old wrap is
      // detached but still holds its children, so asking it would keep
      // handing back the very node that is no longer on screen.
      const liveNode = () => document.querySelector(`.cv-el[data-id="${e.id}"]`) || node;
      const sx = ev.clientX, sy = ev.clientY, ox = e.x, oy = e.y;
      const move = m => {
        e.x = Math.round((ox + (m.clientX - sx) / scale) * 10) / 10;
        e.y = Math.round((oy + (m.clientY - sy) / scale) * 10) / 10;
        const n = liveNode();
        n.style.left = e.x * scale + "px";
        n.style.top = e.y * scale + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        onChange();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
  }

  function startResize(e, node) {
    return ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const sx = ev.clientX, sy = ev.clientY, ow = e.w, oh = e.h || 0;
      // Same live lookup as the drag above, for the same reason.
      // Query the DOCUMENT, not `wrap`: after a repaint the old wrap is
      // detached but still holds its children, so asking it would keep
      // handing back the very node that is no longer on screen.
      const liveNode = () => document.querySelector(`.cv-el[data-id="${e.id}"]`) || node;
      const move = m => {
        const n = liveNode();
        e.w = Math.max(5, Math.round((ow + (m.clientX - sx) / scale) * 10) / 10);
        n.style.width = e.w * scale + "px";
        if (e.type !== "text") {
          e.h = Math.max(3, Math.round((oh + (m.clientY - sy) / scale) * 10) / 10);
          n.style.height = e.h * scale + "px";
        }
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        onChange();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
  }

  return wrap;
}

/**
 * Shrink a single-line text element until it fits its box.
 *
 * Now that the editor renders at true size, a long participant name in a
 * 30pt field genuinely overflows — it was previously masked by everything
 * being wrong by the same factor. Multi-line elements (results lists) wrap
 * instead and are left alone.
 */
export function shrinkToFit(node, e, scale) {
  if (!node.textContent || String(e.text || "").includes("\n")) return;
  const boxPx = e.w * scale;
  if (!boxPx) return;
  let pt = e.size;
  // Measured after mount; harmless before, since scrollWidth is then 0.
  requestAnimationFrame(() => {
    /* The selected element carries its resize handle as a CHILD, and the
     * handle sits at right:-5px — deliberately outside the box, so it can be
     * grabbed on the corner. scrollWidth counts that overflow, so a selected
     * element always measured about 5px wider than its box however small the
     * text was. The loop below would then shrink the text trying to fix an
     * overflow that has nothing to do with the text, running all the way to
     * its guard: clicking a text element made its text tiny. Measure with
     * the handle hidden, then put it back. */
    const handle = node.querySelector(".handle");
    const handleDisplay = handle ? handle.style.display : null;
    if (handle) handle.style.display = "none";

    let guard = 0;
    while (node.scrollWidth > boxPx + 1 && pt > 4 && guard++ < 40) {
      pt -= Math.max(0.5, pt * 0.06);
      node.style.fontSize = (pt * (scale / MM_PER_PX_AT_96DPI) * (96 / 72)) + "px";
    }

    if (handle) handle.style.display = handleDisplay;
  });
}

/** Sample values so the editor shows something realistic, never raw tokens. */
export function previewData() {
  return {
    name: "Ann Mary Thomas",
    chest: "128",
    house: "Falcons",
    category: "Junior",
    class: "9B",
    results: "Solo Song — First (A)\nGroup Dance — Second (A)\nStory Writing — Participated (B)",
    event: "Solo Song",
    rank: "First Place",
    grade: "A",
    fest: window.__FEST_NAME__ || "Our Fest",
    school: "Excelguru",
    date: new Date().toLocaleDateString(),
    photo: PLACEHOLDER_AVATAR
  };
}

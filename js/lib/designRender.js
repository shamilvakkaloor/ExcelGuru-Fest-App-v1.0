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

/**
 * A colour that may be written as a {token}.
 *
 * Only `{houseColor}` is meaningful today: it lets one design carry every
 * house's own identity — a Red winner's poster and a Blue winner's differ by
 * the accent bar, from a single template — which a fixed hex cannot do.
 * Falls back to the app accent when the house has no colour set, so the bar
 * is never invisible.
 */
function resolveColor(value, data, fallback = "#EC3013") {
  const token = /^\{(\w+)\}$/.exec(String(value || ""));
  if (!token) return value;
  return (data && data[token[1]]) || fallback;
}

/** Common CSS for one element, in whichever unit the target needs. */
function elementStyle(e, unit, scale = 1, data = null) {
  const u = v => (unit === "px" ? v * scale + "px" : v + "mm");
  const base = `left:${u(e.x)};top:${u(e.y)};width:${u(e.w)};`;

  if (e.type === "box") {
    const fill = resolveColor(e.fill, data);
    const stroke = resolveColor(e.stroke, data);
    return base +
      `height:${u(e.h)};` +
      `background:${fill && fill !== "none" ? fill : "transparent"};` +
      (stroke && stroke !== "none"
        ? `border:${unit === "px" ? Math.max(1, (e.strokeWidth || 0) * scale) + "px" : (e.strokeWidth || 0) + "mm"} solid ${stroke};` : "") +
      `border-radius:${u(e.radius || 0)};` +
      (e.opacity !== undefined ? `opacity:${e.opacity};` : "");
  }

  if (e.type === "image") {
    /* box-sizing matters here: a border on an <img> would otherwise be added
     * OUTSIDE the width/height the design specifies, so a photo with a frame
     * would print larger than the box the editor drew and shift everything
     * placed against it. */
    const stroke = resolveColor(e.stroke, data);
    return base +
      `height:${u(e.h)};` +
      `border-radius:${u(e.radius || 0)};` +
      // "cover" fills the frame and crops; "contain" shows the whole photo
      // and leaves gaps. Cover stays the default — a portrait cropped to a
      // circle is the usual want, and it is what every existing design has.
      `object-fit:${e.fit === "contain" ? "contain" : "cover"};overflow:hidden;box-sizing:border-box;` +
      (stroke && stroke !== "none"
        ? `border:${unit === "px" ? Math.max(1, (e.strokeWidth || 0) * scale) + "px" : (e.strokeWidth || 0) + "mm"} solid ${stroke};` : "") +
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
    `color:${resolveColor(e.color, data) || "#000"};` +
    `text-align:${e.align || "left"};` +
    `line-height:${e.lineHeight || 1.25};` +
    (e.spacing ? `letter-spacing:${e.spacing * 0.1}${unit === "px" ? "px" : "mm"};` : "") +
    // A CSS transform, not a stored uppercase copy of the text: a {rank} or
    // {house} token resolves to whatever case the source data actually has
    // ("Blue", "First"), and an eyebrow label wants it shouted regardless —
    // transforming at render time means the same design keeps working if
    // the underlying value's case ever changes.
    (e.uppercase ? "text-transform:uppercase;" : "") +
    /* Gradient-filled type: the glyphs become a window onto a background
     * gradient. `color` above stays a real solid colour and is the
     * fallback — only -webkit-text-fill-color hides it, and that property
     * is only ever honoured by an engine that also honours
     * background-clip:text, so a browser that cannot do this shows solid
     * type rather than nothing. */
    (e.gradient
      ? `background:${e.gradient};-webkit-background-clip:text;background-clip:text;` +
        `-webkit-text-fill-color:transparent;`
      : "") +
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
    const style = escapeHTML(elementStyle(e, "mm", 1, data));
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
    // Same sample data the image path below already uses, so a {houseColor}
    // fill previews as an actual colour rather than as a broken CSS value.
    node.setAttribute("style", "position:absolute;" + elementStyle(e, "px", scale, previewData()));

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

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  // String.fromCharCode(...bytes) blows the call stack on a large font
  // file — chunked to stay well under any engine's argument-count limit.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

let embeddedFontsCSSPromise = null;
/**
 * The design typefaces as a self-contained @font-face stylesheet, font
 * files inlined as base64 data URIs — fetched and cached once per page
 * load, since every export reuses the exact same three families.
 *
 * A plain `@import url('https://fonts.googleapis...')`, or even a `<link>`,
 * was tried first and does load — but Chrome then treats the canvas the
 * SVG gets drawn onto as tainted (a cross-origin sub-resource was pulled in
 * to render it, the same rule that blocks reading pixels off a photo
 * pasted in as a bare cross-origin link) and toBlob() throws for every
 * design, not just ones with a photo. Google's font CSS and files both
 * already send permissive CORS headers — that's what makes fetching and
 * inlining them here possible at all — so pre-fetching and embedding them
 * as data: URIs (same-origin by definition) is what avoids the taint
 * rather than the cache alone.
 */
async function embeddedFontsCSS() {
  if (embeddedFontsCSSPromise) return embeddedFontsCSSPromise;
  embeddedFontsCSSPromise = (async () => {
    try {
      const cssUrl = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700" +
        "&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap";
      let cssText = await (await fetch(cssUrl)).text();
      const urls = [...new Set([...cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
      for (const url of urls) {
        const buf = await (await fetch(url)).arrayBuffer();
        cssText = cssText.split(url).join(`data:font/woff2;base64,${arrayBufferToBase64(buf)}`);
      }
      return cssText;
    } catch {
      // Offline, or Google Fonts unreachable — the export still works, it
      // just falls back to whichever system font each element's stack
      // names next (see FONTS above), same as any other missing web font.
      return "";
    }
  })();
  return embeddedFontsCSSPromise;
}

/**
 * Rasterise one filled page to a PNG Blob — "save as image" alongside the
 * existing PDF/print path.
 *
 * Reuses renderPageHTML() verbatim (same markup that already matches print,
 * one source of truth) and rasterises it via the standard SVG
 * foreignObject → canvas trick, so no third-party screenshot library is
 * needed. One real difference from the print path: this SVG is parsed as
 * strict XML, not HTML, and HTML tolerates an unclosed `<img>` (it's a void
 * element) where XML does not — so the `<img>` tags renderPageHTML emits
 * are self-closed here before embedding.
 *
 * `scale` is a supersampling factor: the SVG is given its true 96dpi size as
 * its viewBox but a `scale`× larger pixel size, so the browser rasterises
 * the foreignObject content at that higher resolution instead of a blurry
 * 1:1 copy.
 *
 * A participant photo pasted in as an external link (not uploaded — see the
 * B10 comment in pdf.js) taints the canvas and makes toBlob() throw; the
 * print path never hits this because printing a page is not the same as
 * reading its pixels back. Left to the caller to catch and explain, since
 * this module has no toast/UI dependency.
 */
export async function designPageToImageBlob(design, data, { scale = 3 } = {}) {
  const fontCSS = await embeddedFontsCSS();

  const pageHTML = renderPageHTML(design, data).replace(/<img\b([^>]*)>/g, "<img$1/>");
  const wPx = Math.round(design.page.w * MM_PER_PX_AT_96DPI);
  const hPx = Math.round(design.page.h * MM_PER_PX_AT_96DPI);
  const outW = Math.max(1, Math.round(wPx * scale));
  const outH = Math.max(1, Math.round(hPx * scale));

  // This SVG is parsed as strict XML (see the img self-close above), and a
  // <style> element is ordinary parsed content there, not CDATA — a raw "&"
  // anywhere in the font CSS (a query string, a comment) reads as the start
  // of an entity reference and fails the whole parse. CDATA is the standard
  // XML escape hatch for exactly this.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${wPx} ${hPx}">` +
    `<foreignObject width="${wPx}" height="${hPx}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${fontCSS}]]></style>${pageHTML}</div>` +
    `</foreignObject></svg>`;

  // A blob: URL here taints the canvas the moment a foreignObject-bearing
  // SVG is drawn from it — Chrome does this unconditionally, independent of
  // anything the SVG actually contains (confirmed against a plain "Hello"
  // div with no external resources at all). A data: URI does not trip the
  // same rule, so that's the source this Image loads from, not a Blob.
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not rasterise this design."));
    im.src = svgUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not rasterise this design.");
  return blob;
}

/** Sample values so the editor shows something realistic, never raw tokens. */
export function previewData() {
  return {
    name: "Ann Mary Thomas",
    chest: "128",
    house: "Falcons",
    houseColor: "#1E5FA8",
    category: "Junior",
    class: "9B",
    results: "Solo Song — First (A)\nGroup Dance — Second (A)\nStory Writing — Participated (B)",
    event: "Solo Song",
    rank: "First Place",
    grade: "A",
    fest: window.__FEST_NAME__ || "Our Fest",
    school: "Excelguru",
    date: new Date().toLocaleDateString(),
    photo: PLACEHOLDER_AVATAR,
    eventResults: "1st — Ann Mary Thomas (Falcons)\n2nd — Kabir Rathore (Ospreys)\n3rd — Devansh Iyer (Herons)",
    rank1name: "Ann Mary Thomas", rank1house: "Falcons", rank1houseColor: "#1E5FA8", rank1photo: PLACEHOLDER_AVATAR,
    rank2name: "Kabir Rathore",   rank2house: "Ospreys",  rank2houseColor: "#2F7A4E", rank2photo: PLACEHOLDER_AVATAR,
    rank3name: "Devansh Iyer",    rank3house: "Herons",   rank3houseColor: "#B8860B", rank3photo: PLACEHOLDER_AVATAR
  };
}

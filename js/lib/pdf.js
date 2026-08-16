// PDF output without a server and without a 200 KB library.
//
// A styled document is opened in a hidden window and handed to the browser's
// own print engine, where "Save as PDF" is the default destination on every
// modern OS. Zero dependencies, correct pagination, and the user gets page
// setup controls for free.

/**
 * Wait for the print window's webfonts to actually finish loading before
 * calling print() — a fixed delay is a guess, and on slow venue wifi a
 * short guess loses: the fonts have not arrived yet, so the page prints
 * in the browser's fallback face instead of Space Grotesk/Inter/JetBrains
 * Mono. document.fonts.ready is exact when it is available; the timeout
 * is only a safety net in case a font request hangs or the API is
 * missing in an older browser.
 */
function waitForFonts(win, maxMs) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (win.document.fonts?.ready) win.document.fonts.ready.then(finish).catch(finish);
    else finish();
    setTimeout(finish, maxMs);
  });
}

/**
 * Wait for every &lt;img&gt; already in the print document to finish loading
 * (or fail) before calling print().
 *
 * B10 — a participant photo set by pasting a Drive link (as opposed to an
 * uploaded, base64 one) used to print as the placeholder silhouette even
 * though it displays fine on the live participant list. A prior fix tried
 * fetching the link and inlining it as a data URL before printing, on the
 * theory that the print window's synchronous print() couldn't await a live
 * image load — but that fetch needs the image host to send CORS headers
 * for a cross-origin *read*, and Google's photo-serving CDN only sends
 * them for &lt;img&gt;-tag *display*, not for fetch(); the "fix" silently failed
 * every time and was never the right shape of fix. The actual problem was
 * always just the print race, so this uses a plain &lt;img src="photoURL"&gt;
 * (exactly what the participant list already does successfully) and gives
 * every image up to `maxMs` to finish loading before print() fires.
 */
function waitForImages(win, maxMs) {
  const imgs = [...win.document.images];
  if (!imgs.length) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    let remaining = imgs.length;
    const settle = () => { if (--remaining <= 0) finish(); };
    for (const img of imgs) {
      if (img.complete) settle();
      else { img.addEventListener("load", settle, { once: true }); img.addEventListener("error", settle, { once: true }); }
    }
    setTimeout(finish, maxMs);
  });
}

export function printDocument({ title, subtitle, bodyHTML, landscape = false, bare = false }) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }
  // Bare mode drops the report chrome entirely — certificates and posters
  // set their own page size and bleed to the edges.
  // Browsers omit background colours and background images from a print
  // job by default — the checkbox is called "Background graphics" and
  // almost nobody enables it. Every design here is built from filled
  // boxes and coloured text, so without forcing it explicitly a
  // certificate, poster or ID card prints as text on a blank white page:
  // the header band, the accent rule, the fill colours all silently
  // vanish, which is what "the font color and everything is missing on
  // generate" actually was — the editor renders fine because it is a
  // normal DOM view, not a print job, so this only ever showed up on the
  // printed/PDF output.
  const forceColor = `*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}`;

  if (bare) {
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;} .design-page{page-break-after:always;} .design-page:last-child{page-break-after:auto;} ${forceColor}</style>
</head><body>${bodyHTML}</body></html>`);
    win.document.close();
    win.focus();
    Promise.all([waitForFonts(win, 2500), waitForImages(win, 4000)]).then(() => win.print());
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  ${forceColor}
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm; }
  body { font-family: "Inter", system-ui, sans-serif; color: #10231C; font-size: 11pt; margin: 0; }
  h1 { font-family: "Space Grotesk", sans-serif; font-size: 20pt; margin: 0 0 2mm; }
  h2 { font-family: "Space Grotesk", sans-serif; font-size: 13pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  .sub { color: #5A6F66; margin-bottom: 4mm; font-size: 10pt; }
  .rule { height: 2.5pt; width: 22mm; background: #E4A11B; margin: 3mm 0 5mm; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 5mm; }
  th { text-align: left; border-bottom: 1pt solid #10231C; padding: 1.6mm 1.5mm; font-size: 8pt;
       text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 1.4mm 1.5mm; border-bottom: .4pt solid #D9E0D7; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .mono { font-family: "JetBrains Mono", monospace; }
  .num { text-align: right; font-family: "JetBrains Mono", monospace; }
  .foot { margin-top: 8mm; font-size: 8pt; color: #7A9086; border-top: .4pt solid #D9E0D7; padding-top: 2mm; }

  /* Certificates, posters, rosters — one per page */
  .cert, .poster, .roster { page-break-after: always; padding-top: 8mm; text-align: center; }
  .cert:last-child, .poster:last-child, .roster:last-child { page-break-after: auto; }
  .cert-school { font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; color: #5A6F66; }
  .cert-fest { font-family: "Space Grotesk", sans-serif; font-size: 26pt; font-weight: 700; margin-top: 1mm; }
  .cert-rule { height: 3pt; width: 26mm; background: #E4A11B; margin: 4mm auto 6mm; }
  .cert-label { font-size: 12pt; letter-spacing: .18em; text-transform: uppercase; color: #5A6F66; }
  .cert-name { font-family: "Space Grotesk", sans-serif; font-size: 30pt; font-weight: 700; margin: 4mm 0 2mm; }
  .cert-meta { font-size: 10pt; color: #5A6F66; margin-bottom: 8mm; }
  .cert-table { width: 84%; margin: 0 auto 14mm; text-align: left; }
  .cert-sign { display: flex; justify-content: space-around; margin-top: 16mm; font-size: 9pt; }
  .cert-line { width: 46mm; border-top: .6pt solid #10231C; margin-bottom: 1.5mm; }

  .poster-event { font-family: "Space Grotesk", sans-serif; font-size: 24pt; font-weight: 700; margin-top: 6mm; }
  .poster-class { font-size: 10pt; color: #5A6F66; margin-bottom: 10mm; }
  .poster-row { display: flex; align-items: center; gap: 8mm; width: 76%; margin: 0 auto 6mm;
                text-align: left; border-bottom: .4pt solid #D9E0D7; padding-bottom: 4mm; }
  .poster-rank { font-family: "Space Grotesk", sans-serif; font-size: 15pt; font-weight: 700; width: 30mm; }
  .poster-rank.rank-1 { color: #B87D06; }
  .poster-rank.rank-2 { color: #6E7C77; }
  .poster-rank.rank-3 { color: #A0764A; }
  .poster-name { font-size: 15pt; font-weight: 600; }
  .poster-house { font-size: 9.5pt; color: #5A6F66; }
  .poster-empty { color: #7A9086; font-size: 10pt; }

  /* ID cards — 2 across, 4 down on A4 */
  .cards { display: flex; flex-wrap: wrap; gap: 0; }
  .idcard { width: 50%; height: 63mm; box-sizing: border-box; border: .4pt dashed #A9B8B1;
            padding: 8mm 6mm; text-align: center; page-break-inside: avoid; }
  .idcard-fest { font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #5A6F66; }
  .idcard-chest { font-family: "JetBrains Mono", monospace; font-size: 30pt; font-weight: 700;
                  color: #10231C; margin: 3mm 0 2mm; }
  .idcard-name { font-family: "Space Grotesk", sans-serif; font-size: 14pt; font-weight: 600; }
  .idcard-meta { font-size: 9pt; color: #5A6F66; margin-top: 1.5mm; }
</style></head><body>
<h1>${escapeHTML(title)}</h1>
${subtitle ? `<div class="sub">${escapeHTML(subtitle)}</div>` : ""}
<div class="rule"></div>
${bodyHTML}
<div class="foot">Generated ${new Date().toLocaleString()}</div>
</body></html>`);
  win.document.close();
  win.focus();
  waitForFonts(win, 2000).then(() => win.print());
}

/** Build a print-ready table from the same column shape the UI uses. */
export function htmlTable(columns, rows) {
  const head = columns.map(c => `<th${c.num ? ' class="num"' : ""}>${escapeHTML(c.label)}</th>`).join("");
  const body = rows.map(r =>
    "<tr>" + columns.map(c => {
      const v = c.value ? c.value(r) : r[c.key];
      return `<td${c.num ? ' class="num"' : ""}>${escapeHTML(v === null || v === undefined ? "" : v)}</td>`;
    }).join("") + "</tr>"
  ).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

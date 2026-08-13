// PDF output without a server and without a 200 KB library.
//
// A styled document is opened in a hidden window and handed to the browser's
// own print engine, where "Save as PDF" is the default destination on every
// modern OS. Zero dependencies, correct pagination, and the user gets page
// setup controls for free.

export function printDocument({ title, subtitle, bodyHTML, landscape = false, bare = false }) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }
  // Bare mode drops the report chrome entirely — certificates and posters
  // set their own page size and bleed to the edges.
  if (bare) {
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;} .design-page{page-break-after:always;} .design-page:last-child{page-break-after:auto;}</style>
</head><body>${bodyHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 900);
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
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
  // Give webfonts a moment, otherwise the first page prints in a fallback face.
  setTimeout(() => { win.print(); }, 600);
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

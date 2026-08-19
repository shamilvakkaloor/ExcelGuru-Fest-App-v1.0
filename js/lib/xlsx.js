// Minimal .xlsx writer — a real Excel workbook, no library.
//
// WHY NOT CSV: a CSV is one flat table. The registration sheet this exists
// for is a stack of small tables — an event banner, its entries, a gap, the
// next event — and a CSV cannot mark which row is a heading, so the whole
// thing arrives as undifferentiated text that has to be formatted by hand
// before anyone can read it.
//
// WHY NOT A LIBRARY: no build step and no npm (see CLAUDE.md), and pulling
// SheetJS off a CDN would put a fest-day download behind someone else's
// uptime. An .xlsx is a ZIP of XML parts, and writing the handful of parts
// Excel actually requires is less code than the loader would be.
//
// The ZIP entries are STORED, not deflated — the browser has no synchronous
// deflate, and these sheets are small text. The file is a few hundred KB
// where a compressed one would be a few tens; for a download that opens and
// is thrown away, that trade is worth not shipping an inflate implementation.

/* ── ZIP ──────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a ZIP from [{ name, data:Uint8Array }] using stored entries.
 *
 * Sizes are known up front because nothing is compressed, so every header
 * can be written in one pass with no data descriptors.
 */
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    // bit 11 marks the filename as UTF-8; ours are ASCII but it costs nothing
    const local = [
      ...u32(0x04034B50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),                       // no meaningful mod time
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0)
    ];
    parts.push(new Uint8Array(local), nameBytes, f.data);

    central.push([
      ...u32(0x02014B50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset)
    ]);
    central.push(nameBytes);

    offset += local.length + nameBytes.length + size;
  }

  const cdParts = [];
  let cdSize = 0;
  for (const c of central) {
    const arr = c instanceof Uint8Array ? c : new Uint8Array(c);
    cdParts.push(arr);
    cdSize += arr.length;
  }
  const count = files.length;
  const end = new Uint8Array([
    ...u32(0x06054B50), ...u16(0), ...u16(0),
    ...u16(count), ...u16(count),
    ...u32(cdSize), ...u32(offset), ...u16(0)
  ]);

  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of [...parts, ...cdParts, end]) { out.set(a, p); p += a.length; }
  return out;
}

/* ── Sheet XML ────────────────────────────────────────────────────────── */

const esc = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  // Excel rejects most control characters outright rather than ignoring them
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

/** 0 -> A, 25 -> Z, 26 -> AA */
export function colName(i) {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

/**
 * Style ids available to a cell, matching the cellXfs order in STYLES below.
 * TITLE is the event banner, HEAD a column heading, PLAIN ordinary text.
 */
export const S = { PLAIN: 0, HEAD: 1, TITLE: 2, MUTED: 3 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF808080"/><i/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B2A24"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDF1EE"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

/**
 * rows: array of either
 *   null            — a blank row (the gap between events)
 *   [cell, cell…]   — where a cell is a string/number, or { v, s } to style it
 *
 * Blank rows are emitted as real empty <row> elements rather than skipped,
 * so the sheet has no gaps in its row numbering — some readers (LibreOffice
 * among them) render a sparse sheet differently from a dense one.
 */
function sheetXML(rows, colWidths) {
  const cols = colWidths?.length
    ? `<cols>${colWidths.map((w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const body = rows.map((row, r) => {
    const n = r + 1;
    if (!row || !row.length) return `<row r="${n}"/>`;
    const cells = row.map((cell, c) => {
      const obj = (cell && typeof cell === "object") ? cell : { v: cell };
      const v = obj.v;
      if (v === null || v === undefined || v === "") {
        // still emit the cell when it carries a style, so a banner row is
        // filled across its whole width rather than only under its text
        return obj.s ? `<c r="${colName(c)}${n}" s="${obj.s}"/>` : "";
      }
      const ref = `${colName(c)}${n}`;
      const s = obj.s ? ` s="${obj.s}"` : "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${n}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/* ── Workbook ─────────────────────────────────────────────────────────── */

/** Excel forbids : \ / ? * [ ] in a sheet name and caps it at 31 characters. */
function safeSheetName(name) {
  const s = String(name || "Sheet1").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return s || "Sheet1";
}

/** Build the .xlsx bytes for a single-sheet workbook. */
export function buildXLSX({ sheetName = "Sheet1", rows = [], colWidths = [] }) {
  const enc = new TextEncoder();
  const name = safeSheetName(sheetName);

  const files = [
    { name: "[Content_Types].xml", data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`) },
    { name: "_rels/.rels", data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`) },
    { name: "xl/workbook.xml", data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`) },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXML(rows, colWidths)) }
  ];

  return zipStore(files);
}

/** Build and hand the workbook to the browser as a download. */
export function downloadXLSX(filename, opts) {
  const bytes = buildXLSX(opts);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

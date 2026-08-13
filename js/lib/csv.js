// CSV in and out. Handles quoted fields, embedded commas and newlines —
// the three things that break naive split(",") importers on real
// spreadsheet exports.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, "");   // strip Excel's BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

/** Parse into objects keyed by header. Headers are lowercased, spaces removed. */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const keys = headers.map(h => h.toLowerCase().replace(/[\s_-]/g, ""));
  const out = rows.slice(1).map(r => {
    const o = {};
    keys.forEach((k, i) => { o[k] = (r[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows: out };
}

export function toCSV(columns, rows) {
  const esc = v => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(c => esc(c.label)).join(",")];
  for (const r of rows) {
    lines.push(columns.map(c => esc(c.value ? c.value(r) : r[c.key])).join(","));
  }
  return "\uFEFF" + lines.join("\n");    // BOM keeps Excel happy with accents
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Could not read that file."));
    fr.readAsText(file);
  });
}

// DOM construction helpers. Small surface, used by every page.
import { compressImage, dataUrlBytes, resolvePhotoLink, PLACEHOLDER_AVATAR } from "./photo.js";
import { tr } from "./i18n.js";

/**
 * el("div.card", { onclick }, [children])
 * Tag string supports #id and .class shorthand.
 */
export function el(tag, attrs = {}, children = []) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const node = document.createElement(name || "div");
  for (const token of rest) {
    // classList.add() throws InvalidCharacterError on a token containing a
    // space, so "div.a b" — a dot missed when concatenating a conditional
    // class — used to take down the whole call synchronously. Splitting
    // here treats it as the two classes it was obviously meant to be.
    if (token[0] === ".") for (const c of token.slice(1).split(/\s+/)) { if (c) node.classList.add(c); }
    else if (token[0] === "#") node.id = token.slice(1);
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className += " " + v;
    else if (k === "html") node.innerHTML = v;
    // Explanation text is translated wherever it is built, not only when it
    // goes through hint(). Most of it is written as el("div.hint", {text})
    // directly — 216 places against 56 hint() calls — and every one of those
    // skipped tr() entirely, which is why a settings page showed one line in
    // Malayalam and the next two in English. Keyed on the .hint class, so
    // this covers div/p/span alike and any hint added later.
    // ".tr" is an opt-in marker for prose that is not a .hint — a bullet in
    // an explanation, the label above one. It carries no styling, so adding
    // it changes nothing except that the text now reaches the dictionary.
    // Deliberately opt-in rather than translating every <p> and <li>: plenty
    // of them carry a house name or an event title, which must not be looked
    // up at all.
    else if (k === "text") {
      node.textContent = (node.classList.contains("hint") || node.classList.contains("tr")) ? tr(v) : v;
    }
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") node[k] = !!v;
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list.flat()) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" || typeof c === "number"
      ? document.createTextNode(String(c)) : c);
  }
  return parent;
}

export function clear(node) { node.innerHTML = ""; return node; }

export function field(labelText, input, hintText) {
  return el("label.field", {}, [el("span", { text: labelText }), input, hintText ? hint(hintText) : null]);
}

/** A ".hint" explanation line — the one piece of UI text the admin
 * En/Malayalam toggle translates. Labels and headings stay English; only
 * this, the sentence explaining what an option does, is looked up. */
export function hint(text, attrs = {}) {
  // el() translates any .hint text, so this no longer calls tr() itself —
  // one place does it, for hint() and hand-built hints alike.
  return el("div.hint", { ...attrs, text });
}

export function input(attrs = {}) { return el("input", { type: "text", ...attrs }); }

export function select(options, attrs = {}) {
  const s = el("select", attrs);
  for (const o of options) {
    const opt = el("option", { value: o.value, text: o.label });
    if (o.value === attrs.value) opt.selected = true;
    s.appendChild(opt);
  }
  if (attrs.value !== undefined) s.value = attrs.value;
  return s;
}

export function checkbox(labelText, checked, onchange, opts = {}) {
  const box = el("input", {
    type: "checkbox", checked, disabled: !!opts.disabled,
    onchange: e => onchange(e.target.checked)
  });
  const label = el("label.inline", { style: "margin-bottom:.6rem" }, [box, el("span", { text: labelText })]);
  if (opts.disabled) label.classList.add("inline-disabled");
  return label;
}

export function button(text, attrs = {}) { return el("button", { type: "button", text, ...attrs }); }

/**
 * table([{key,label,render?,num?}], rows)
 * Adds data-label attributes so the CSS can restack it as cards on mobile.
 */
export function table(columns, rows, opts = {}) {
  const thead = el("thead", {}, el("tr", {}, columns.map(c =>
    el(c.num ? "th.num" : "th", { text: c.label }))));
  const tbody = el("tbody", {}, rows.map(r =>
    el("tr", { class: opts.rowClass ? opts.rowClass(r) : "" }, columns.map(c => {
      const cell = el(c.num ? "td.num" : "td", { "data-label": c.label });
      const v = c.render ? c.render(r) : r[c.key];
      append(cell, v === null || v === undefined ? "" : v);
      return cell;
    }))));
  return el("div.table-wrap", {}, el("table.responsive", {}, [thead, tbody]));
}

export function empty(title, detail) {
  // "No events yet" is a message to the reader, not a heading in the nav —
  // the same kind of text as a notice, so it translates too.
  return el("div.empty", {}, [
    el("strong", { text: tr(title) }),
    detail ? el("div", { text: tr(detail) }) : null
  ]);
}

/** Inline loading row — shown while a page fetches, so nothing looks frozen. */
export function loading(text = "Loading…") {
  return el("div.loading", {}, [el("span.spinner"), el("span", { text })]);
}

/**
 * Run an async task with the page visibly busy and pointer events blocked,
 * so a slow save cannot be clicked twice and never looks like a freeze.
 */
export async function withBusy(node, text, fn) {
  const overlay = el("div.busy-overlay", {}, loading(text));
  node.appendChild(overlay);
  node.classList.add("is-busy");
  try { return await fn(); }
  finally { overlay.remove(); node.classList.remove("is-busy"); }
}

/** A notice accepts plain text or a built node — several callers need to
 *  put a button or a list inside one. */
export function notice(kind, content) {
  const box = el(`div.notice.notice-${kind}`);
  // Translated like a hint: a notice is the same explanatory prose, just
  // boxed. It sets textContent directly rather than going through el()'s
  // text attribute, which is why the .hint rule there never reached it.
  if (content instanceof Node) box.appendChild(content);
  else box.textContent = tr(content ?? "");
  return box;
}

export function badge(text, kind = "") { return el("span.badge" + (kind ? "." + kind : ""), { text }); }

export function card(children, headTitle, headActions) {
  const parts = [];
  if (headTitle) {
    parts.push(el("div.card-head", {}, [
      el("h3", { text: headTitle }), el("div.spacer"),
      ...(headActions ? [headActions].flat() : [])
    ]));
  }
  return el("div.card", {}, [...parts, children]);
}

export function toast(message, isError = false) {
  const root = document.getElementById("toast-root");
  const t = el("div.toast" + (isError ? ".err" : ""), { text: message });
  root.appendChild(t);
  setTimeout(() => t.remove(), isError ? 5200 : 2800);
}

/** Modal returning a promise that resolves with whatever close() is given. */
export function modal({ title, body, actions, onClose }) {
  const root = document.getElementById("modal-root");
  let resolveFn;
  const promise = new Promise(res => { resolveFn = res; });

  let closed = false;
  const close = value => {
    if (closed) return;          // idempotent: a handler may call close() itself
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    onClose?.(value);
    resolveFn(value);
  };
  const onKey = e => { if (e.key === "Escape" && !busy) close(undefined); };

  let busy = false;
  const buttons = [];
  const setBusy = (on, activeBtn, label) => {
    busy = on;
    buttons.forEach(b => { b.disabled = on; });
    if (activeBtn) activeBtn.textContent = on ? (label || "Working…") : activeBtn.dataset.label;
  };

  const actionButtons = (actions || []).map(a => {
    const btn = button(a.label, { class: a.kind ? "btn-" + a.kind : "" });
    btn.dataset.label = a.label;
    btn.addEventListener("click", async () => {
      // Guard against a second click while the first is still saving. This is
      // what stops an impatient double-click creating two records.
      if (busy) return;

      // No handler means it is a plain dismiss button (Cancel / Close).
      if (!a.onClick) { close(undefined); return; }

      setBusy(true, btn, a.busyLabel);
      try {
        const v = await a.onClick(close);
        // A handler returns false to signal "validation failed, stay open".
        // closes:false means the handler closes itself when it is ready.
        if (v === false || a.closes === false) return;
        close(v);
      } finally {
        setBusy(false, btn);
      }
    });
    buttons.push(btn);
    return btn;
  });

  // The body is wrapped rather than styled directly: on a phone the dialog is
  // capped at 92dvh and this wrapper is the part that scrolls. Without it a
  // tall form overflows the box and paints over the backdrop with no surface
  // behind it, which reads as the dialog having lost its background.
  const box = el("div.modal", { role: "dialog", "aria-modal": "true" }, [
    el("h3", { text: title }),
    el("div.modal-body", {}, body),
    el("div.modal-actions", {}, actionButtons)
  ]);
  const backdrop = el("div.modal-backdrop", {
    onclick: e => { if (e.target === backdrop && !busy) close(undefined); }
  }, box);

  root.appendChild(backdrop);
  document.addEventListener("keydown", onKey);
  box.querySelector("input, select, textarea, button")?.focus();
  return { promise, close };
}

export function confirmDialog(title, message, confirmLabel = "Confirm") {
  return modal({
    title,
    body: el("p", { text: message }),
    actions: [
      { label: "Cancel" },
      { label: confirmLabel, kind: "danger", onClick: () => true }
    ]
  }).promise.then(v => v === true);
}

/** Wrap an async handler so failures surface as a toast, never a silent stall. */
export function guard(fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (err) {
      console.error(err);
      toast(friendlyError(err), true);
    }
  };
}

export function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Wrong password, or that account no longer exists.",
    "auth/wrong-password":     "Wrong password.",
    "auth/user-not-found":     "That account no longer exists.",
    "auth/too-many-requests":  "Too many attempts. Wait a minute and try again.",
    "auth/weak-password":      "That password is too short.",
    "auth/email-already-in-use": "An account with that name already exists.",
    "permission-denied":       "You do not have permission to do that.",
    "failed-precondition":     "The database needs an index for this query. See SETUP.md, step 7."
  };
  return map[code] || err?.message || "Something went wrong.";
}

export function fmtDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "2026-08-02T14:30" for <input type="datetime-local"> */
export function toLocalInput(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v) { return v ? new Date(v).getTime() : null; }

/**
 * Photo picker: upload (compressed in-browser) or paste a link, with a live
 * preview that falls back to the placeholder silhouette.
 * Returns { node, getValue } where getValue() -> { photoData, photoURL, ... }
 */
export function photoPicker(existing = {}) {
  let photoData = existing.photoData || null;
  let linkResult = existing.photoURL && !existing.photoData
    ? { photoURL: existing.photoURL, photoOriginalLink: existing.photoOriginalLink }
    : {};

  const preview = el("img", {
    src: photoData || existing.photoURL || PLACEHOLDER_AVATAR, alt: "",
    style: "width:76px;height:76px;border-radius:12px;object-fit:cover;border:1px solid var(--line);background:#E7ECE5"
  });
  preview.addEventListener("error", () => { preview.src = PLACEHOLDER_AVATAR; });

  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
  const linkInput = el("input", {
    type: "text", placeholder: "…or paste a Google Drive link",
    value: existing.photoOriginalLink || ""
  });
  const info = el("div.hint", { style: "margin:0" });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      info.textContent = "Resizing…";
      photoData = await compressImage(f);
      linkInput.value = "";
      linkResult = {};
      preview.src = photoData;
      info.textContent = "Ready — about " + Math.round(dataUrlBytes(photoData) / 1024) + " KB.";
    } catch (err) {
      info.textContent = err.message;
    }
  });

  linkInput.addEventListener("input", () => {
    if (!linkInput.value.trim()) { linkResult = {}; if (!photoData) preview.src = PLACEHOLDER_AVATAR; return; }
    photoData = null;
    linkResult = resolvePhotoLink(linkInput.value);
    preview.src = linkResult.photoURL || PLACEHOLDER_AVATAR;
    info.textContent = linkResult.warning || "";
  });

  const node = el("div", { style: "display:flex;gap:.9rem;align-items:flex-start" }, [
    preview,
    el("div", { style: "flex:1;min-width:0" }, [
      el("div.btn-row", { style: "margin-bottom:.4rem" }, [
        button("Upload photo", { class: "btn-sm", onclick: () => fileInput.click() }),
        button("Remove", { class: "btn-sm", onclick: () => {
          photoData = null; linkResult = {}; linkInput.value = ""; info.textContent = "";
          preview.src = PLACEHOLDER_AVATAR;
        }})
      ]),
      fileInput, linkInput, info
    ])
  ]);

  return {
    node,
    getValue() {
      if (photoData) {
        return { photoData, photoURL: null, photoSource: "upload", photoOriginalLink: null, photoLinkUnverified: false };
      }
      if (linkResult.photoURL) {
        return {
          photoData: null, photoURL: linkResult.photoURL, photoSource: "externalLink",
          photoOriginalLink: linkResult.photoOriginalLink || null,
          photoLinkUnverified: !!linkResult.photoLinkUnverified
        };
      }
      return { photoData: null, photoURL: null, photoSource: null, photoOriginalLink: null, photoLinkUnverified: false };
    }
  };
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── Filter bar ──────────────────────────────────────────────────────
 * ARCHITECTURE §11.2. One component behind every "filter by…" on every
 * screen — building it per screen would guarantee four slightly different
 * behaviours.
 *
 * v8: each filter is a CHECKBOX DROPDOWN, not a row of single-choice
 * chips. A fest with fourteen categories made the old chip row wrap over
 * three lines and still only allowed one at a time; "show me Junior AND
 * Senior" was impossible.
 *
 * filterBar({ filters: [{ key, label, options:[{value,label}] }], onChange })
 *   → { node, values, matches(row), reset() }
 *
 * `values[key]` is an ARRAY. Empty means "no filter on this axis" — so a
 * row passes when every axis is either unfiltered or contains that row's
 * value.
 */
/* Filter selections, remembered per screen for as long as you stay on it.
 *
 * Saving anything on an admin screen repaints the whole list, which rebuilt
 * the filter bar from scratch and dropped whatever was selected — so a run of
 * edits inside one filtered view meant re-picking the filter after every
 * single save. Screens that pass `remember` now read their last selection
 * back on rebuild. The router clears this on an actual route change, so the
 * filter lives exactly as long as the screen does and never leaks into the
 * next one. */
const FILTER_MEMORY = new Map();
export function forgetFilters() { FILTER_MEMORY.clear(); }

// Cleared here rather than from the router, which is deliberately a leaf
// module with no imports. Only the PATH is compared, so a screen that
// deep-links its own tabs through the query string (?tab=…) keeps its
// filters; leaving the screen entirely drops them.
let lastFilterPath = location.hash.split("?")[0];
// Counts in-app route changes, which is what tells backButton() whether
// there is anywhere in this app to go back TO.
let routeChanges = 0;
window.addEventListener("hashchange", () => {
  routeChanges++;
  const p = location.hash.split("?")[0];
  if (p !== lastFilterPath) { lastFilterPath = p; FILTER_MEMORY.clear(); }
});

/**
 * A small "‹" for screens that fill the display and carry no navigation —
 * the projector slideshow and the big screen. Both hide the whole app shell
 * on purpose, which also removed every way out of them short of editing the
 * URL or hitting the browser's own Back.
 *
 * history.back() ONLY when this session has actually navigated within the
 * app. A projector is usually opened straight at #/slideshow as its first
 * page, and going "back" from there leaves the app entirely — a blank tab
 * on a screen in front of an audience. With no in-app history it goes to
 * `fallback` instead, which is somewhere rather than nowhere.
 */
export function backButton(fallback = "/") {
  const b = button("‹", {
    class: "back-fab", title: "Back", "aria-label": "Back"
  });
  b.addEventListener("click", () => {
    if (routeChanges > 0) history.back();
    else location.hash = "#" + fallback;
  });
  return b;
}

export function filterBar({ filters, onChange, compact = false, remember = null }) {
  const values = {};
  const saved = remember ? FILTER_MEMORY.get(remember) : null;
  const save = () => { if (remember) FILTER_MEMORY.set(remember, JSON.parse(JSON.stringify(values))); };
  const node = el("div.filter-bar" + (compact ? ".compact" : ""));
  const groups = [];

  for (const f of filters || []) {
    if (!f || !f.options?.length) continue;
    // A remembered selection wins over the caller's initial value: it is the
    // more recent intent, and only options that still exist are restored, so
    // a filter on something since deleted cannot hide every row.
    const valid = new Set(f.options.map(o => String(o.value)));
    values[f.key] = Array.isArray(saved?.[f.key])
      ? saved[f.key].filter(v => valid.has(String(v)))
      : Array.isArray(f.value) ? [...f.value] : (f.value ? [f.value] : []);

    const summary = el("span.filter-summary");
    const caret = el("span.filter-caret", { text: "\u25BE" });
    const trigger = el("button.filter-trigger", { type: "button" }, [
      el("span.filter-label", { text: f.label }), summary, caret
    ]);
    const menu = el("div.filter-menu", { hidden: true });
    const wrap = el("div.filter-drop", {}, [trigger, menu]);

    const paintSummary = () => {
      const n = values[f.key].length;
      const all = f.allLabel || "All";
      if (!n) summary.textContent = all;
      else if (n === 1) {
        summary.textContent = f.options.find(o => String(o.value) === String(values[f.key][0]))?.label || "1";
      } else summary.textContent = n + " selected";
      trigger.classList.toggle("on", n > 0);
    };

    // "All" clears the axis rather than selecting everything — the two are
    // equivalent for filtering, and an empty array is cheaper to reason about.
    const allRow = el("label.filter-opt.filter-all", {}, [
      el("input", { type: "checkbox", checked: true, onchange: () => {
        values[f.key] = [];
        paintOptions(); paintSummary(); save(); onChange?.(values);
      }}),
      el("span", { text: f.allLabel || ("All " + f.label.toLowerCase()) })
    ]);

    const optRows = f.options.map(o => {
      const box = el("input", { type: "checkbox", onchange: () => {
        const set = new Set(values[f.key].map(String));
        box.checked ? set.add(String(o.value)) : set.delete(String(o.value));
        values[f.key] = [...set];
        paintOptions(); paintSummary(); save(); onChange?.(values);
      }});
      return { o, box, row: el("label.filter-opt", {}, [box, el("span", { text: o.label })]) };
    });

    function paintOptions() {
      const set = new Set(values[f.key].map(String));
      allRow.querySelector("input").checked = set.size === 0;
      for (const r of optRows) r.box.checked = set.has(String(r.o.value));
    }

    menu.append(allRow, el("div.filter-sep"), ...optRows.map(r => r.row));

    trigger.addEventListener("click", e => {
      e.stopPropagation();
      const open = !menu.hidden;
      closeAllMenus();
      menu.hidden = open;
      wrap.classList.toggle("open", !menu.hidden);
    });
    menu.addEventListener("click", e => e.stopPropagation());

    node.appendChild(wrap);
    groups.push({ f, paintOptions, paintSummary, menu, wrap });
    paintOptions(); paintSummary();
  }

  function closeAllMenus() {
    for (const g of groups) { g.menu.hidden = true; g.wrap.classList.remove("open"); }
  }
  // One document listener for the whole bar, removed with the page.
  document.addEventListener("click", closeAllMenus);

  const clearBtn = button("Clear", { class: "filter-clear btn-sm", onclick: () => reset() });
  if (groups.length) node.appendChild(clearBtn);

  /** A row passes when every axis is either unfiltered or holds its value. */
  function matches(row) {
    for (const [key, sel] of Object.entries(values)) {
      if (!sel.length) continue;
      const actual = typeof row?.[key] === "function" ? row[key]() : row?.[key];
      // A row may expose an array (an event in several axes at once).
      const mine = Array.isArray(actual) ? actual.map(String) : [String(actual ?? "")];
      if (!mine.some(v => sel.map(String).includes(v))) return false;
    }
    return true;
  }

  function reset() {
    for (const k of Object.keys(values)) values[k] = [];
    groups.forEach(g => { g.paintOptions(); g.paintSummary(); });
    save();
    onChange?.(values);
  }

  return {
    node: groups.length ? node : el("span"),
    values, matches, reset,
    destroy: () => document.removeEventListener("click", closeAllMenus)
  };
}

/** Standard category filter spec, so every screen offers the same one. */
export function categoryFilterSpec(categories, { includeGeneral = true } = {}) {
  const options = (categories || []).map(c => ({ value: c.id, label: c.name }));
  if (includeGeneral) options.push({ value: "__general", label: "General" });
  return { key: "filterCategory", label: "Category", options };
}

/** Distinct non-empty values of a field, as filter options. */
export function uniqOptions(rows, field) {
  return [...new Map((rows || []).filter(r => r?.[field])
    .map(r => [r[field], { value: r[field], label: r[field] }])).values()];
}

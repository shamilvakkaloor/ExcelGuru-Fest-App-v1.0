// Hash-based routing. No server rewrite rules needed, which is what lets
// the same folder work on Netlify, GitHub Pages, or a local file server.
const routes = [];
let notFound = null;
let cleanup = null;

// I30 — RENDER TOKEN.
//
// render() is async: it clears #app, then awaits the page handler. Two
// overlapping calls therefore both clear and both append, and the page
// appears twice. That happened reliably at boot, because boot() called
// navigate() (which fires hashchange → render) and then startRouter()
// called render() again. It also happened whenever someone tapped two nav
// links quickly.
//
// Every render takes a token. A handler that finishes after a newer render
// has started throws its output away instead of appending it.
let renderToken = 0;
let rendering = false;

export function route(pattern, handler) { routes.push({ pattern, handler }); }
export function setNotFound(fn) { notFound = fn; }

export function navigate(path) {
  if (location.hash === "#" + path) render();
  else location.hash = path;
}

export function currentPath() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.split("?")[0];
}

export function queryParams() {
  const raw = location.hash.replace(/^#/, "");
  const q = raw.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

function match(pattern, path) {
  const p = pattern.split("/").filter(Boolean);
  const c = path.split("/").filter(Boolean);
  if (p.length !== c.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(c[i]);
    else if (p[i] !== c[i]) return null;
  }
  return params;
}

export async function render() {
  const token = ++renderToken;
  rendering = true;

  // Every page returns an optional teardown function. Calling it before the
  // next render is what stops Firestore listeners leaking between pages —
  // which on the free tier is a cost bug, not just a memory one.
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }

  const path = currentPath();
  const root = document.getElementById("app");

  try {
    for (const r of routes) {
      const params = match(r.pattern, path);
      if (!params) continue;

      // Render into a detached node. If a newer render started while this
      // handler was awaiting Firestore, the work is simply dropped — nothing
      // half-built ever reaches the page.
      const frame = document.createElement("div");
      frame.className = "route-frame";
      const teardown = (await r.handler(frame, params, queryParams())) || null;

      if (token !== renderToken) { try { teardown?.(); } catch (e) {} return; }

      root.innerHTML = "";
      while (frame.firstChild) root.appendChild(frame.firstChild);
      cleanup = teardown;
      window.scrollTo(0, 0);
      return;
    }

    if (notFound) {
      const frame = document.createElement("div");
      await notFound(frame);
      if (token !== renderToken) return;
      root.innerHTML = "";
      while (frame.firstChild) root.appendChild(frame.firstChild);
    }
  } catch (err) {
    /* A PAGE ERROR MUST NEVER BE SILENT.
     *
     * Because a render now builds into a detached frame and only swaps it in
     * on success, a throwing page used to leave whatever was already on
     * screen — at first load, the boot screen — with nothing to indicate
     * anything had gone wrong. The app just appeared to load forever.
     */
    console.error("Page failed to render:", err);
    if (token !== renderToken) return;
    root.innerHTML = "";
    const box = document.createElement("div");
    box.className = "wrap wrap-narrow";
    box.innerHTML =
      '<div class="notice notice-danger"><strong>This page could not open.</strong><br>' +
      escapeText(err?.message || String(err)) +
      '</div><p class="hint">The full details are in the browser console (F12). ' +
      'Other pages may still work — try the menu, or reload.</p>' +
      '<div class="btn-row"><a class="btn" href="#/">Go to home</a></div>';
    root.appendChild(box);
  } finally {
    if (token === renderToken) rendering = false;
  }
}

function escapeText(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function startRouter() {
  window.addEventListener("hashchange", () => { render(); });
  // Skip the initial paint if a hashchange render is already in flight —
  // the other half of the double-render bug.
  if (!rendering) render();
}

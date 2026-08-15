// Light / dark theme.
//
// LIGHT IS THE DEFAULT BY DECISION, not by following the operating system.
// A fest is usually configured on a shared school machine whose OS
// preference says nothing about what the organiser wants, and a hall
// projector in daylight needs the light theme. Someone who wants dark can
// say so; the choice then persists for that browser.
//
// PRINT IS ALWAYS LIGHT. Certificates, posters, chest cards and reports go
// on paper, and pdf.js never reads the theme variables — the print rules in
// the stylesheet force light regardless of what is on screen.

const KEY = "fest.theme";
export const THEMES = ["light", "dark"];

const listeners = new Set();
export function onTheme(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** The stored choice, or light. localStorage can throw in private mode. */
export function currentTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : "light";
  } catch { return "light"; }
}

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : "light";
  document.documentElement.setAttribute("data-theme", t);
  // Keeps the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#0A140F" : "#0F241C");
  try { localStorage.setItem(KEY, t); } catch { /* private mode — session only */ }
  listeners.forEach(fn => { try { fn(t); } catch (e) {} });
  return t;
}

export function toggleTheme() {
  return applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

/** Called once at boot, before first paint, to avoid a flash of light. */
export function initTheme() { return applyTheme(currentTheme()); }

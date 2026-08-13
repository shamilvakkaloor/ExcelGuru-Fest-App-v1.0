import { route, setNotFound, startRouter, navigate, currentPath } from "./lib/router.js";
import { startSessionWatch, session, is, logout } from "./lib/session.js";
import { el, empty, button, toast } from "./lib/ui.js";
import { icon } from "./lib/icons.js";
import { initTheme, toggleTheme, currentTheme } from "./lib/theme.js";
import { APP_VERSION, roleLabel, applyFestName, applyLogoScale, applyHouseTerm } from "./lib/shell.js";
import { getOne } from "./lib/db.js";

import homePage      from "./pages/home.js";
import loginPage     from "./pages/login.js";
import setupPage     from "./pages/setup.js";
import resultsPage   from "./pages/results.js";
import lookupPage    from "./pages/lookup.js";
import schedulePage  from "./pages/schedule.js";
import slideshowPage from "./pages/slideshow.js";
import screenPage    from "./pages/screen.js";
import judgePage     from "./pages/judge.js";
import housePage     from "./pages/house.js";
import adminPage     from "./pages/admin/index.js";

/**
 * Top bar for the PUBLIC pages.
 *
 * Signed-in staff, judges and House Managers get the shell in lib/shell.js
 * instead; this is the spectator-facing header, so it carries the public
 * destinations rather than a navigation tree.
 */
export function topbar(extra) {
  const brand = window.__FEST_LOGO__
    ? el("a.brand.brand-logo", { href: "#/" },
        el("img", { src: window.__FEST_LOGO__, alt: window.__FEST_NAME__ || "Fest" }))
    : el("a.brand", { href: "#/", text: window.__FEST_NAME__ || "Fest Tabulation" });

  const here = currentPath();
  const links = el("nav.publicnav", { "aria-label": "Public pages" },
    [["/results", "Results", "trophy"],
     ["/schedule", "Schedule", "calendar"],
     ["/lookup", "Lookup", "search"]]
      .map(([to, label, ic]) => el("a" + (here === to ? ".on" : ""), { href: "#" + to },
        [icon(ic, 16), el("span", { text: label })])));

  const bar = el("header.topbar", {}, [brand, links, el("div.spacer"), themeButton()]);

  // A signed-in account whose role document could not be read still gets in,
  // but nothing role-specific will work — say so rather than letting them
  // wonder why their panel is missing.
  if (session.user && session.error) {
    bar.classList.add("topbar-degraded");
  }
  if (extra) bar.appendChild(extra);

  if (session.user) {
    bar.appendChild(el("span.who", {
      text: `${session.name} · ${session.role ? roleLabel(session.role) : "role unavailable"}`
    }));
    // I8 — this is the ONLY "Open my panel". It sits exactly where "Log in"
    // sits when signed out, so the primary action never moves between the
    // two states, and no page appends a second copy further down.
    bar.appendChild(el("a.btn.btn-sm.btn-accent", { href: "#" + homeForRole(), text: "Open my panel" }));
    bar.appendChild(el("button.btn.btn-sm.btn-ghost.btn-signout", {
      type: "button",
      onclick: async () => { await logout(); navigate("/"); }
    }, [icon("logout", 15), el("span", { text: "Sign out" })]));
  } else {
    bar.appendChild(el("a.btn.btn-sm.btn-accent", { href: "#/login", text: "Log in" }));
  }
  return bar;
}

/** Guard a page behind one or more roles. */
export function requireRole(roles, render) {
  return async (root, params, query) => {
    if (!session.user) { navigate("/login"); return; }
    if (!roles.includes(session.role)) {
      root.appendChild(topbar());
      root.appendChild(el("div.wrap", {}, empty(
        "Not available for your account",
        "This area is for " + roles.map(roleLabel).join(" or ") + "."
      )));
      return;
    }
    return render(root, params, query);
  };
}

/** Send a signed-in user to their own home area. */
export function homeForRole() {
  if (is.staff()) return "/admin/dashboard";
  if (is.judge()) return "/judge";
  if (is.house()) return "/house";
  return "/";
}

async function boot() {
  initTheme();
  await startSessionWatch();

  // If the fest has never been configured, everything redirects to first-run
  // setup. That is also the only moment the rules allow an Admin to be made.
  const settings = await getOne("config", "festSettings").catch(() => null);
  applyFestName(settings?.festName);
  applyLogoScale(settings?.logoScale);
  applyHouseTerm(settings?.houseTermSingular, settings?.houseTermPlural);
  window.__FEST_LOGO__ = settings?.useLogo && settings?.logoData ? settings.logoData : null;
  window.__NEEDS_SETUP__ = !settings;
  window.__APP_VERSION__ = APP_VERSION;

  route("/",          homePage);
  route("/login",     loginPage);
  route("/setup",     setupPage);
  route("/results",   resultsPage);
  route("/templates", (root) => import("./pages/templates.js").then(m => m.default(root)));
  route("/lookup",    lookupPage);
  route("/schedule",  schedulePage);
  route("/slideshow", slideshowPage);
  route("/screen",    screenPage);
  route("/judge",     requireRole(["judge"], judgePage));
  route("/house",     requireRole(["house"], housePage));
  route("/admin/:section", requireRole(["admin", "coAdmin"], adminPage));
  route("/admin",     requireRole(["admin", "coAdmin"], (r, p, q) => adminPage(r, { section: "dashboard" }, q)));

  setNotFound(root => {
    root.appendChild(topbar());
    root.appendChild(el("div.wrap", {}, [
      empty("Page not found", "That address does not exist."),
      el("div.btn-row", { style: "justify-content:center" }, el("a.btn", { href: "#/", text: "Go to home" }))
    ]));
  });

  if (window.__NEEDS_SETUP__ && currentPath() !== "/setup") navigate("/setup");
  startRouter();
  // Tells the watchdog in index.html that boot got this far, so it stops
  // waiting. Anything that fails after this point is a page error, and the
  // router shows those itself.
  window.__APP_STARTED__ = true;
}

boot().catch(err => {
  console.error(err);
  window.__APP_STARTED__ = true;
  document.getElementById("app").innerHTML =
    `<div class="wrap wrap-narrow"><div class="notice notice-danger">
       <strong>Could not start.</strong><br>${err.message}
       <br><br>The usual cause is config.js still holding placeholder values,
       or Firestore not being enabled yet. See SETUP.md.
     </div>
     <p class="hint" style="text-align:center">ExcelGuru · v${"7.2.1"} · excelguru.co.in</p></div>`;
});

/** Theme toggle. Present on every page, public and projector included. */
export function themeButton() {
  const b = el("button.theme-toggle", {
    type: "button",
    title: "Switch theme",
    "aria-label": "Switch between light and dark"
  }, icon(currentTheme() === "dark" ? "sun" : "moon", 17));
  b.addEventListener("click", () => {
    const next = toggleTheme();
    b.innerHTML = "";
    b.appendChild(icon(next === "dark" ? "sun" : "moon", 17));
  });
  return b;
}

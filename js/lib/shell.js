// The application shell — ARCHITECTURE section 11.8.
//
// Layout, left to right:
//
//   ┌────┬──────────────┬──────────────────────────────┐
//   │rail│ nav panel    │ content                      │
//   │icon│ search       │ breadcrumb + page            │
//   │s   │ grouped items│                              │
//   └────┴──────────────┴──────────────────────────────┘
//
// The rail carries top-level areas; the panel carries that area's sections,
// with nested children where a section has internal tabs. Below 960px the
// two collapse into one off-canvas drawer opened from a hamburger, because
// a fest is run from a phone at the venue as often as from a desk.
//
// Nothing here is a framework. It is DOM built by hand, same as every other
// screen, so it keeps working with no build step.
import { el, input } from "./ui.js";
import { icon } from "./icons.js";
import { session, is, logout } from "./session.js";
import { themeButton } from "../app.js";
import { onRepublish, republishNow, isRepublishing } from "../domain/republish.js";
import { getOne, getAll, where } from "./db.js";
import { navigate, currentPath, queryParams } from "./router.js";

export const APP_VERSION = "8.7";

/** The product name that follows the fest's own name in the browser tab. */
export const APP_NAME = "ExcelGuru Fest App";

/**
 * Set the browser tab title from the fest's name.
 *
 * Three moments change it — first-run setup, an Admin renaming the fest in
 * Settings, and boot — so it lives here rather than being spelled out at
 * each one, where the three would drift apart.
 */
/**
 * Scale the fest logo wherever it appears. The CSS heights are expressed
 * against --logo-scale, so one variable moves the top bar, the rail and the
 * home hero together.
 */
export function applyLogoScale(scale) {
  const pct = Number(scale) || 100;
  document.documentElement.style.setProperty("--logo-scale", String(pct / 100));
}

/**
 * Set the House term globally, the same boot-time-global pattern as
 * applyFestName. The nav is built synchronously with no settings read of
 * its own, so a window global is what lets it show a rename without
 * becoming async.
 */
export function applyHouseTerm(singular, plural) {
  window.__HOUSE_TERM__ = (singular || "").trim() || "House";
  window.__HOUSE_TERM_PLURAL__ = (plural || "").trim() || "Houses";
}

/** Swap the two nav labels that literally say "House"/"Houses". Scoped to
 *  exactly those two strings — no general templating, so nothing else in
 *  the nav can be accidentally rewritten by a coincidental match. */
function navLabel(label) {
  if (label === "Houses") return window.__HOUSE_TERM_PLURAL__ || "Houses";
  if (label === "House") return window.__HOUSE_TERM__ || "House";
  return label;
}

export function applyFestName(festName) {
  const name = (festName || "").trim();
  window.__FEST_NAME__ = name || "Fest Tabulation";
  document.title = name ? `${name} - ${APP_NAME}` : APP_NAME;
}

/* ── Navigation model ────────────────────────────────────────────────
 * `to` is a hash path. `children` render as an indented sub-list and stay
 * expanded while their parent is the active section, which is how Festie
 * exposes Teams/Sections/Analytics under Candidate.
 */
const AREAS = [
  {
    id: "fest", label: "Fest", icon: "trophy", roles: ["admin", "coAdmin"],
    groups: [{
      label: "Run the fest",
      items: [
        { label: "Dashboard",     icon: "grid",      to: "/admin/dashboard" },
        { label: "Events",        icon: "star",      to: "/admin/events" },
        { label: "Registrations", icon: "clipboard", to: "/admin/registrations" },
        { label: "Substitutions", icon: "users",     to: "/admin/substitutions" },
        { label: "Schedule",      icon: "calendar",  to: "/admin/venues" }
      ]
    }, {
      label: "Scoring",
      items: [
        { label: "Judging",      icon: "gavel", to: "/admin/judging", adminOnly: true },
        { label: "Judge status", icon: "eye",   to: "/admin/judges" },
        { label: "Results",      icon: "award", to: "/admin/publish" },
        { label: "Titles",       icon: "star",  to: "/admin/titles" },
        { label: "Adjustments",  icon: "sliders", to: "/admin/adjustments", adminOnly: true }
      ]
    }]
  },
  {
    id: "people", label: "People", icon: "users", roles: ["admin", "coAdmin"],
    groups: [{
      label: "Directory",
      items: [
        { label: "Participants", icon: "users", to: "/admin/participants" },
        {
          label: "Accounts", icon: "key", to: "/admin/accounts", adminOnly: true,
          children: [
            { label: "Houses",    to: "/admin/accounts?tab=house" },
            { label: "Judges",    to: "/admin/accounts?tab=judge" },
            { label: "Co-Admins", to: "/admin/accounts?tab=coAdmin" }
          ]
        }
      ]
    }]
  },
  {
    id: "output", label: "Output", icon: "broadcast", roles: ["admin", "coAdmin"],
    groups: [{
      label: "Produce",
      items: [
        { label: "Certificates", icon: "award",    to: "/admin/generator" },
        { label: "Downloads",    icon: "download", to: "/admin/downloads" }
      ]
    }, {
      label: "Public screens",
      items: [
        { label: "Public home", icon: "home",     to: "/" },
        { label: "Results",     icon: "trophy",   to: "/results" },
        { label: "Schedule",    icon: "calendar", to: "/schedule" },
        { label: "Lookup",      icon: "search",   to: "/lookup" },
        { label: "Templates",   icon: "award",    to: "/templates" },
        { label: "Big screen",  icon: "monitor",  to: "/screen" },
        { label: "Slideshow",   icon: "monitor",  to: "/slideshow" }
      ]
    }]
  },
  {
    id: "settings", label: "Settings", icon: "gear", roles: ["admin"],
    groups: [{
      label: "Configuration",
      items: [
        { label: "Fest details",       icon: "sliders", to: "/admin/settings?tab=basic" },
        { label: "Categories",         icon: "list",    to: "/admin/settings?tab=categories" },
        { label: "Public display",     icon: "eye",     to: "/admin/settings?tab=public" },
        { label: "Points & grades",    icon: "star",    to: "/admin/settings?tab=points" },
        { label: "Participant limits", icon: "shield",  to: "/admin/settings?tab=limits" },
        { label: "Leaderboard",        icon: "trophy",  to: "/admin/settings?tab=leaderboard" },
        { label: "My password",        icon: "key",     to: "/admin/settings?tab=password" },
        { label: "Danger zone",        icon: "alert",   to: "/admin/settings?tab=danger" }
      ]
    }]
  },
  {
    id: "judge", label: "Judging", icon: "gavel", roles: ["judge"],
    groups: [{ label: "My work", items: [{ label: "Score events", icon: "gavel", to: "/judge" }] }]
  },
  {
    id: "house", label: "My house", icon: "users", roles: ["house"],
    groups: [{
      label: "My house",
      items: [
        { label: "Register",     icon: "clipboard", to: "/house" },
        { label: "Schedule",     icon: "calendar",  to: "/schedule" },
        { label: "Public results", icon: "trophy",  to: "/results" }
      ]
    }]
  }
];

const visibleAreas = () =>
  AREAS.filter(a => a.roles.includes(session.role));

/** Which area owns the path currently open. */
function activeArea(path, query) {
  const areas = visibleAreas();
  const full = path + (query?.tab ? "?tab=" + query.tab : "");
  for (const a of areas) {
    for (const g of a.groups) {
      for (const it of g.items) {
        if (it.to.split("?")[0] === path) return a;
        if ((it.children || []).some(c => c.to === full)) return a;
      }
    }
  }
  return areas[0] || null;
}

/**
 * Build the shell around a page.
 *
 * Returns { content } — pages append into `content` and never touch the
 * chrome, so a new screen inherits the navigation for free.
 */
export function appShell(root, { title, breadcrumb } = {}) {
  const path = currentPath();
  const query = queryParams();
  const areas = visibleAreas();
  const current = activeArea(path, query);

  const frame = el("div.shell");
  const scrim = el("div.shell-scrim", { onclick: () => frame.classList.remove("nav-open") });

  /* ── Rail ────────────────────────────────────────────────────── */
  const rail = el("nav.rail", { "aria-label": "Areas" });
  rail.appendChild(el("a.rail-mark", { href: "#/", title: window.__FEST_NAME__ || "Fest" },
    window.__FEST_LOGO__
      ? el("img", { src: window.__FEST_LOGO__, alt: "" })
      : el("span", { text: initials(window.__FEST_NAME__ || "Fest") })));

  for (const a of areas) {
    const link = el("a.rail-item" + (a === current ? ".on" : ""), {
      href: "#" + firstPathOf(a),
      "aria-current": a === current ? "page" : null
    }, [icon(a.icon, 21), el("span", { text: a.label })]);
    rail.appendChild(link);
  }

  rail.appendChild(el("div.spacer"));
  rail.appendChild(themeButton());
  rail.appendChild(el("button.rail-item", {
    type: "button", title: "Sign out",
    onclick: async () => { await logout(); navigate("/"); }
  }, [icon("logout", 20), el("span", { text: "Sign out" })]));

  /* ── Panel ───────────────────────────────────────────────────── */
  const panel = el("div.navpanel", { "aria-label": "Sections" });
  panel.appendChild(el("div.navpanel-head", {}, [
    el("div.navpanel-title", { text: current?.label || "Menu" }),
    el("button.navpanel-collapse", {
      type: "button", title: "Hide menu", "aria-label": "Hide menu",
      onclick: () => document.body.classList.toggle("nav-collapsed")
    }, icon("panel", 17))
  ]));

  const search = input({ placeholder: "Search navigation…", "aria-label": "Search navigation" });
  const searchWrap = el("div.navsearch", {}, [icon("search", 15), search]);
  panel.appendChild(searchWrap);

  const listBox = el("div.navlist");
  panel.appendChild(listBox);

  /* A substitution request that nobody sees is a request that never gets
   * decided. The count is fetched once per shell render and painted onto
   * the nav item, so staff have a reason to open the queue. */
  if (is.staff()) {
    getAll("substitutions", where("status", "==", "pending"))
      .then(rows => {
        if (!rows.length) return;
        const link = listBox.querySelector('a[href="#/admin/substitutions"]');
        if (link) link.appendChild(el("span.nav-count", { text: String(rows.length) }));
      })
      .catch(() => {});
  }

  panel.appendChild(el("div.navpanel-foot", {}, [
    el("div.navwho", {}, [
      el("span.navwho-dot"),
      el("div", {}, [
        el("div.navwho-name", { text: session.name || "" }),
        el("div.navwho-role", { text: roleLabel(session.role) })
      ])
    ]),
    el("div.navversion", { text: "ExcelGuru · v" + APP_VERSION })
  ]));

  function paintNav() {
    const term = search.value.trim().toLowerCase();
    listBox.innerHTML = "";
    if (!current) return;

    let shown = 0;
    for (const g of current.groups) {
      const items = g.items.filter(it => {
        if (it.adminOnly && !is.admin()) return false;
        if (!term) return true;
        return it.label.toLowerCase().includes(term)
          || (it.children || []).some(c => c.label.toLowerCase().includes(term));
      });
      if (!items.length) continue;

      listBox.appendChild(el("div.navgroup-label", { text: g.label }));
      for (const it of items) {
        const [base, qs] = it.to.split("?");
        const itemTab = new URLSearchParams(qs || "").get("tab");

        /* An item is active when its PATH matches and, where the item names
         * a tab, that tab is the one open.
         *
         * Without the tab half, every one of the eight Settings items — all
         * of which point at /admin/settings — lit up at once. When the URL
         * carries no tab, the first tabbed item for that path is the one
         * showing, so it takes the highlight.
         */
        const isActive = base === path && (
          !itemTab
            ? true
            : (query.tab ? query.tab === itemTab : itemTab === defaultTabFor(base))
        );
        shown++;

        listBox.appendChild(el("a.navitem" + (isActive ? ".on" : ""), {
          href: "#" + it.to,
          "aria-current": isActive ? "page" : null,
          onclick: () => frame.classList.remove("nav-open")
        }, [icon(it.icon || "list", 17), el("span", { text: navLabel(it.label) })]));

        // Children stay expanded while their parent section is open, which
        // is what makes a section's internal tabs addressable from the nav.
        if (it.children && (base === path || term)) {
          const sub = el("div.navsub");
          for (const c of it.children) {
            if (term && !c.label.toLowerCase().includes(term) && !it.label.toLowerCase().includes(term)) continue;
            const cTab = new URLSearchParams(c.to.split("?")[1] || "").get("tab");
            const on = c.to.split("?")[0] === path
              && (query.tab ? query.tab === cTab : cTab === defaultTabFor(base));
            sub.appendChild(el("a.navsubitem" + (on ? ".on" : ""), {
              href: "#" + c.to, text: navLabel(c.label),
              onclick: () => frame.classList.remove("nav-open")
            }));
          }
          if (sub.children.length) listBox.appendChild(sub);
        }
      }
    }
    if (!shown) listBox.appendChild(el("div.navempty", { text: "Nothing matches that." }));
  }
  search.addEventListener("input", paintNav);
  paintNav();

  /* ── Content ─────────────────────────────────────────────────── */
  const topbar = el("header.shell-top", {}, [
    el("button.shell-burger", {
      type: "button", title: "Menu", "aria-label": "Menu",
      onclick: () => frame.classList.toggle("nav-open")
    }, icon("menu", 20)),
    el("div.crumbs", {}, [
      el("a", { href: "#/", text: window.__FEST_NAME__ || "Fest" }),
      icon("chevron", 13),
      el("span", { text: breadcrumb || current?.label || "" }),
      title ? icon("chevron", 13) : null,
      title ? el("strong", { text: title }) : null
    ]),
    el("div.spacer"),
    el("a.btn.btn-sm.btn-ghost", { href: "#/", text: "View public site" })
  ]);

  const content = el("main.shell-content");

  /* ARCHITECTURE section 12 — the visible half of the performance change.
   *
   * Rebuilds now run behind the save, so there is a window where the private
   * data is ahead of the public pages. That window is announced rather than
   * hidden: silent staleness would be worse than the wait it replaced. */
  if (is.staff()) content.appendChild(republishBar());

  if (session.error) {
    content.appendChild(el("div.notice.notice-warn", {},
      el("span", { text: session.error + " Some sections may not load. Try signing out and back in; if it persists, check the Firestore rules are published." })));
  }
  const scroller = el("div.shell-scroll", {}, content);

  frame.append(scrim, rail, panel, el("div.shell-main", {}, [topbar, scroller]));
  root.appendChild(frame);
  return { content, frame };
}

/**
 * The tab a section opens on when the URL does not name one. Mirrors the
 * default inside each section module, so the nav highlight agrees with what
 * is actually on screen.
 */
const DEFAULT_TAB = {
  "/admin/settings": "basic",
  "/admin/accounts": "house"
};
function defaultTabFor(path) { return DEFAULT_TAB[path] || null; }

function republishBar() {
  const bar = el("div.republish-bar", { hidden: true });
  const label = el("span");
  const action = el("button.btn.btn-sm", { type: "button", text: "Publish now",
    onclick: async () => {
      action.disabled = true; action.textContent = "Publishing…";
      try { await republishNow(); } finally { action.disabled = false; action.textContent = "Publish now"; }
    }});
  bar.append(el("span.republish-dot"), label, el("span.spacer"), action);

  const show = (text, kind, showAction) => {
    bar.hidden = false;
    bar.className = "republish-bar " + kind;
    label.textContent = text;
    action.hidden = !showAction;
  };

  onRepublish(s => {
    if (s.state === "pending")  show("Changes saved. Public pages will update in a moment.", "pending", false);
    if (s.state === "running")  show("Updating the public pages…", "running", false);
    if (s.state === "done")     { bar.hidden = true; }
    if (s.state === "failed")   show("The public pages could not be updated: " + (s.error || ""), "failed", true);
  });

  // A flag written before the tab was closed survives the reload, so an
  // interrupted rebuild is still offered rather than quietly forgotten.
  getOne("config", "festSettings").then(cfg => {
    if (cfg?.snapshotDirty && !isRepublishing()) {
      show("The public pages are behind the latest changes.", "failed", true);
    }
  }).catch(() => {});

  return bar;
}

function firstPathOf(area) {
  for (const g of area.groups) {
    for (const it of g.items) {
      if (it.adminOnly && !is.admin()) continue;
      return it.to;
    }
  }
  return "/";
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase() || "F";
}

export function roleLabel(r) {
  return { admin: "Admin", coAdmin: "Co-Admin", judge: "Judge",
    house: (window.__HOUSE_TERM__ || "House") + " Manager" }[r] || "";
}

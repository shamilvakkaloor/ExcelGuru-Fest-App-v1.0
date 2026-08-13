import { el, empty, loading } from "../../lib/ui.js";
import { appShell } from "../../lib/shell.js";
import { is } from "../../lib/session.js";

// Section modules are loaded on demand — the browser fetches only the screen
// actually being opened, which keeps first paint fast on a phone at a venue.
const SECTIONS = [
  { id: "dashboard",     label: "Dashboard",     load: () => import("./dashboard.js") },
  { id: "settings",      label: "Settings",      load: () => import("./settings.js"),      adminOnly: true },
  { id: "accounts",      label: "Accounts",      load: () => import("./accounts.js"),      adminOnly: true },
  { id: "events",        label: "Events",        load: () => import("./events.js") },
  { id: "participants",  label: "Participants",  load: () => import("./participants.js") },
  { id: "registrations", label: "Registrations", load: () => import("./registrations.js") },
  { id: "judging",       label: "Judging",       load: () => import("./judging.js"),       adminOnly: true },
  { id: "judges",        label: "Judge status",  load: () => import("./judges.js") },
  { id: "substitutions", label: "Substitutions",  load: () => import("./substitutions.js") },
  { id: "publish",       label: "Results",       load: () => import("./publish.js") },
  { id: "titles",        label: "Titles",        load: () => import("./titles.js") },
  { id: "venues",        label: "Schedule",      load: () => import("./venues.js") },
  { id: "generator",     label: "Certificates",  load: () => import("./generator.js") },
  { id: "downloads",     label: "Downloads",     load: () => import("./downloads.js") }
];

export default async function adminPage(root, params, query) {
  const wanted = params.section || "dashboard";
  const section = SECTIONS.find(s => s.id === wanted);

  // The shell owns the chrome; a section only ever fills `content`.
  const { content } = appShell(root, { title: section?.label });

  if (!section || (section.adminOnly && !is.admin())) {
    content.appendChild(empty("Not available", "This section is Admin-only."));
    return;
  }

  content.appendChild(loading("Loading " + section.label.toLowerCase() + "…"));
  const mod = await section.load();
  content.innerHTML = "";
  // `query` is passed through so a nav sub-item can open a section on a
  // specific tab — /admin/settings?tab=categories.
  return mod.default(content, query || {});
}

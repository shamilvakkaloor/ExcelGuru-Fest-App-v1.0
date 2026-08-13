// Public contact list.
//
// Reads ONLY publicContacts/main, which is built by rebuildContactSnapshot()
// and contains solely the numbers an Admin ticked as public. The raw
// houseContacts collection is staff-only, so a number left unticked is not
// merely hidden here — it is unreachable without a staff login. That
// distinction matters because most of these numbers belong to students.
import { el, card, table, empty, badge, notice } from "../lib/ui.js";
import { getOne } from "../lib/db.js";
import { topbar } from "../app.js";

export default async function contactsPage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap");
  root.appendChild(wrap);

  const snap = await getOne("publicContacts", "main").catch(() => null);

  if (!snap?.visible) {
    wrap.appendChild(empty("Contacts are not published",
      "The organisers have not made a contact list public for this fest."));
    return;
  }

  const houses = snap.houses || [];
  const organisers = snap.organisers || [];

  if (!houses.length && !organisers.length) {
    wrap.appendChild(empty("No contacts listed yet"));
    return;
  }

  if (organisers.length) {
    wrap.appendChild(card(table([
      { key: "name", label: "Name" },
      { key: "role", label: "Role", render: r => r.role ? badge(r.role) : "—" },
      { key: "phone", label: "Phone", render: r => phoneCell(r.phone) }
    ], organisers), "Organisers"));
  }

  for (const h of houses) {
    wrap.appendChild(card(table([
      { key: "role", label: "Role", render: r => badge(r.role) },
      { key: "name", label: "Name", render: r => r.name || "—" },
      { key: "phone", label: "Phone", render: r => phoneCell(r.phone) }
    ], h.people), h.houseName));
  }

  wrap.appendChild(el("p.hint", { text:
    "Only numbers the organisers chose to publish appear here." }));
}

/** A tappable number on a phone; a plain dash when none is published. */
function phoneCell(phone) {
  if (!phone) return el("span.hint", { text: "not published" });
  return el("a", { href: "tel:" + phone.replace(/\s+/g, ""), text: phone });
}

// I9 — who logged in and what the most consequential admin actions were.
// Staff-only, per firestore.rules. Reads the most recent 100 entries — an
// unbounded read here is exactly the "listener on a large collection"
// mistake CLAUDE.md warns against, so this is a one-shot query with a
// limit, not a live subscription, and there is a Load more for anything
// older.
import { el, card, table, button, badge, empty, filterBar, fmtDateTime } from "../../lib/ui.js";
import { getAll, orderBy, limit, startAfter } from "../../lib/db.js";

const PAGE = 100;

const ACTION_LABEL = {
  "login": "Logged in",
  "settings-saved": "Settings saved",
  "wipe-everything": "Full reset",
  "wipe-group": "Group delete",
  "account-created": "Account created",
  "account-edited": "Account edited",
  "account-deleted": "Account deleted",
  "password-changed": "Password changed"
};
const ACTION_KIND = {
  "wipe-everything": "badge-danger", "wipe-group": "badge-danger",
  "account-deleted": "badge-danger",
  "account-created": "badge-ok"
};

export default async function auditLogPage(root) {
  root.appendChild(el("h1", { text: "Activity log" }));
  const panel = el("div");
  root.appendChild(panel);

  let rows = [];
  let exhausted = false;

  await loadMore();
  paint();

  async function loadMore() {
    const cursor = rows.length ? [startAfter(rows[rows.length - 1].at)] : [];
    const page = await getAll("auditLog", orderBy("at", "desc"), ...cursor, limit(PAGE));
    if (page.length < PAGE) exhausted = true;
    rows = rows.concat(page);
  }

  function paint() {
    panel.innerHTML = "";
    if (!rows.length) { panel.appendChild(empty("Nothing logged yet")); return; }

    const bar = filterBar({
      filters: [
        { key: "role", label: "Role",
          options: [...new Map(rows.map(r => [r.role, { value: r.role, label: r.role || "—" }])).values()] },
        { key: "action", label: "Action",
          options: [...new Map(rows.map(r => [r.action, { value: r.action, label: ACTION_LABEL[r.action] || r.action }])).values()] }
      ],
      onChange: paintList
    });
    const listBox = el("div");
    panel.append(bar.node, listBox);
    paintList();

    function paintList() {
      const shown = rows.filter(bar.matches);
      listBox.innerHTML = "";
      listBox.appendChild(card(table([
        { key: "at", label: "When", render: r => el("span.mono", { text: fmtDateTime(r.at) }) },
        { key: "name", label: "Who", render: r => el("div", {}, [
            el("div", { text: r.name || "—" }),
            el("div.hint", { style: "margin:0", text: r.role || "" })
          ])},
        { key: "action", label: "Action", render: r => badge(ACTION_LABEL[r.action] || r.action, ACTION_KIND[r.action] || "") },
        { key: "details", label: "Details", render: r => r.details
            ? el("span.hint", { text: r.details }) : el("span.hint", { text: "—" }) }
      ], shown), "Activity", exhausted ? null : button("Load more", { class: "btn-sm", onclick: async () => {
        await loadMore(); paint();
      }})));
    }
  }
}

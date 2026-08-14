// Appeal review. Every appeal is decided by hand — Upheld (the result
// stands) or Overturned (it was wrong), with a written reason the house
// that filed it can see. Deciding an appeal does not itself change a
// score: correct it afterwards with a Score Override or an Adjustment, so
// this collection can never contradict the scoring model it is judging.
import { el, card, table, button, badge, toast, guard, notice, empty,
         modal, loading, friendlyError } from "../../lib/ui.js";
import { getAll, getOne } from "../../lib/db.js";
import { decideAppeal, APPEAL_STATUS } from "../../domain/appeals.js";
import { compressToBudget } from "../../lib/photo.js";
import { session } from "../../lib/session.js";

const STATUS_KIND = { pending: "badge-warn", upheld: "badge-danger", overturned: "badge-ok" };
const STATUS_TEXT = { pending: "Pending", upheld: "Upheld — result stands", overturned: "Overturned" };

export default async function appealsPage(root) {
  root.appendChild(el("h1", { text: "Appeals" }));
  root.appendChild(notice("info",
    "A House Manager appeals a published result within a fixed window, with a screenshot as proof the " +
    "appeal fee was paid. Decide Upheld or Overturned with a reason the house can see — an Overturned " +
    "result needs a separate Score Override or Adjustment to actually correct it."));

  const panel = el("div");
  root.appendChild(panel);
  await paint();

  async function paint() {
    panel.innerHTML = "";
    panel.appendChild(loading("Loading appeals…"));
    let rows, settings;
    try {
      [rows, settings] = await Promise.all([getAll("appeals"), getOne("config", "festSettings")]);
    } catch (err) {
      panel.innerHTML = "";
      panel.appendChild(notice("danger", friendlyError(err)));
      return;
    }
    panel.innerHTML = "";

    if (!settings?.appealsEnabled) {
      panel.appendChild(notice("warn",
        "Appeals are turned off. Existing appeals are still listed below, but no House Manager can file a " +
        "new one until this is enabled in Settings → Appeals."));
    }

    if (!rows.length) { panel.appendChild(empty("No appeals filed")); return; }

    rows.sort((a, b) => statusRank(a.status) - statusRank(b.status)
      || (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));

    panel.appendChild(card(table([
      { key: "eventName", label: "Event", render: r => el("div", {}, [
          el("div", { text: r.eventName }), el("div.hint", { style: "margin:0", text: r.eventCode || "" })
        ])},
      { key: "houseName", label: "House" },
      { key: "reason", label: "Reason", render: r => el("div", { style: "max-width:260px", text: r.reason }) },
      { key: "fee", label: "Fee proof", render: r => r.feeScreenshot
          ? button("View", { class: "btn-sm", onclick: () => imageDialog("Fee proof — " + r.eventName, r.feeScreenshot) })
          : el("span.hint", { text: "—" }) },
      { key: "status", label: "Status", render: r => badge(STATUS_TEXT[r.status], STATUS_KIND[r.status]) },
      { key: "act", label: "", render: r => r.status === APPEAL_STATUS.PENDING
          ? button("Decide", { class: "btn-sm btn-accent", onclick: () => decideDialog(r, paint) })
          : el("div.hint", { text: r.decision || "" }) }
    ], rows), "All appeals"));
  }
}

function statusRank(s) { return s === APPEAL_STATUS.PENDING ? 0 : 1; }

function imageDialog(title, src) {
  modal({
    title,
    body: el("img", { src, style: "max-width:100%;display:block" }),
    actions: [{ label: "Close" }]
  });
}

function decideDialog(appeal, refresh) {
  const decision = el("textarea", { rows: 3, placeholder: "Why this decision — shown to the house." });
  let refundShot = null;
  const refundNote = el("div.hint", { text: "Optional — attach if a refund was sent." });
  const refundPreview = el("img", { style: "max-width:100%;max-height:140px;display:none;margin-top:.4rem" });
  const refundFile = el("input", { type: "file", accept: "image/*", style: "display:none" });
  refundFile.addEventListener("change", guard(async () => {
    const f = refundFile.files?.[0];
    if (!f) return;
    const { dataUrl, bytes } = await compressToBudget(f, { maxPx: 1200, budgetBytes: 500 * 1024, keepAlpha: false });
    refundShot = dataUrl;
    refundPreview.src = dataUrl;
    refundPreview.style.display = "block";
    refundNote.textContent = `Attached — about ${Math.round(bytes / 1024)} KB.`;
  }));

  modal({
    title: "Decide — " + appeal.eventName + " · " + appeal.houseName,
    body: el("div", {}, [
      el("p", { text: appeal.reason }),
      el("fieldset", {}, [
        el("legend", { text: "Decision" }),
        decision
      ]),
      el("fieldset", {}, [
        el("legend", { text: "Refund proof, if overturned" }),
        refundNote,
        button("Choose screenshot", { class: "btn-sm", onclick: () => refundFile.click() }),
        refundPreview
      ])
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Upheld — result stands", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          try {
            await decideAppeal({ appeal, status: APPEAL_STATUS.UPHELD, decision: decision.value, decidedBy: session.name });
          } catch (err) { toast(err.message, true); return false; }
          toast("Appeal upheld."); close(true); refresh();
        })
      },
      { label: "Overturned", kind: "accent", closes: false, busyLabel: "Saving…", onClick: guard(async close => {
          try {
            await decideAppeal({
              appeal, status: APPEAL_STATUS.OVERTURNED, decision: decision.value,
              decidedBy: session.name, refundScreenshot: refundShot
            });
          } catch (err) { toast(err.message, true); return false; }
          toast("Appeal overturned — correct the result with a Score Override or Adjustment.");
          close(true); refresh();
        })
      }
    ]
  });
}

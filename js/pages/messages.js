// Messaging — cross-role, admin-toggleable, off by default. An Admin or
// Co-Admin starts a conversation, personal or group, picking anyone
// across every role; everyone already in it can reply. No push
// notification exists on the free tier — a message is a document, read
// live through Firestore's own listener, which is the only real-time
// primitive available at all here.
import { el, card, field, input, select, button, toast, guard, empty, badge, modal, debounce, hint } from "../lib/ui.js";
import { where, watch } from "../lib/db.js";
import { navigate } from "../lib/router.js";
import { appShell } from "../lib/shell.js";
import { session, is } from "../lib/session.js";
import { startConversation, sendMessage, conversationTitle, sortByRecent, directory } from "../domain/messaging.js";

export default async function messagesPage(root) {
  // Checked BEFORE appShell(), same ordering requireRole() uses in app.js —
  // appShell() builds the role-based nav rail and assumes a real session.
  if (!is.signedIn()) { navigate("/login"); return; }

  const { content: wrap } = appShell(root, { title: "Messages" });
  wrap.appendChild(el("h1", { text: "Messages" }));

  if (!window.__MESSAGING_ENABLED__) {
    wrap.appendChild(empty("Messaging is not enabled", "Ask an Admin to turn this on in Settings if you need it."));
    return;
  }

  const listBox = el("div");
  const threadBox = el("div");
  wrap.appendChild(card(el("div", {}, [
    is.staff()
      ? el("div.btn-row", { style: "margin-bottom:.6rem" },
          button("New conversation", { class: "btn-accent", onclick: () => newConversationDialog(open) }))
      : null,
    listBox
  ]), "Conversations"));
  wrap.appendChild(threadBox);

  let unwatchThread = null;
  let activeId = null;
  let conversations = [];

  function paintList() {
    listBox.innerHTML = "";
    if (!conversations.length) { listBox.appendChild(empty("No conversations yet")); return; }
    for (const c of sortByRecent(conversations)) {
      const row = el("button.pick-card" + (c.id === activeId ? ".selected" : ""), {
        type: "button", style: "width:100%;text-align:left;display:block;margin-bottom:.4rem"
      }, [
        el("div", { style: "display:flex;justify-content:space-between;gap:.5rem" }, [
          el("strong", { text: conversationTitle(c, session.user.uid) }),
          c.type === "group" ? badge("Group") : null
        ]),
        el("div.hint", { style: "margin:.2rem 0 0", text:
          (c.lastMessageBy ? c.lastMessageBy + ": " : "") + (c.lastMessageText || "") })
      ]);
      row.addEventListener("click", () => open(c.id));
      listBox.appendChild(row);
    }
  }

  function open(id) {
    activeId = id;
    paintList();
    if (unwatchThread) { unwatchThread(); unwatchThread = null; }
    const conv = conversations.find(c => c.id === id);
    threadBox.innerHTML = "";
    if (!conv) return;

    const messagesEl = el("div", { style: "max-height:360px;overflow-y:auto;margin-bottom:.7rem" });
    const textInput = input({ placeholder: "Type a message…" });
    const sendBtn = button("Send", { class: "btn-accent" });

    const send = guard(async () => {
      if (!textInput.value.trim()) return;
      const val = textInput.value;
      textInput.value = "";
      try {
        await sendMessage({ conversation: conv, text: val, senderUid: session.user.uid, senderName: session.name });
      } catch (err) { textInput.value = val; toast(err.message, true); }
    });
    sendBtn.addEventListener("click", send);
    textInput.addEventListener("keydown", e => { if (e.key === "Enter") send(); });

    threadBox.appendChild(card(el("div", {}, [
      messagesEl,
      el("div.btn-row", {}, [textInput, sendBtn])
    ]), conversationTitle(conv, session.user.uid)));

    unwatchThread = watch(`conversations/${id}/messages`, msgs => {
      messagesEl.innerHTML = "";
      const sorted = [...msgs].sort((a, b) => (a.sentAt?.seconds || 0) - (b.sentAt?.seconds || 0));
      if (!sorted.length) { messagesEl.appendChild(hint("No messages yet — say hello.")); return; }
      for (const m of sorted) {
        const mine = m.senderUid === session.user.uid;
        messagesEl.appendChild(el("div", {
          style: `margin:.3rem 0;display:flex;flex-direction:column;align-items:${mine ? "flex-end" : "flex-start"}`
        }, [
          el("div", {
            style: `max-width:75%;padding:.4rem .7rem;border-radius:var(--r-sm);` +
                   `background:${mine ? "var(--paper)" : "var(--surface)"};border:1px solid var(--line)`
          }, [
            !mine ? el("div.hint", { style: "margin:0 0 .15rem;font-weight:600", text: m.senderName }) : null,
            el("div", { text: m.text })
          ])
        ]));
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  const unwatchList = watch(
    "conversations", rows => {
      conversations = rows;
      paintList();
      if (activeId && !rows.some(c => c.id === activeId)) { activeId = null; threadBox.innerHTML = ""; }
    },
    ...(is.staff() ? [] : [where("participantUids", "array-contains", session.user.uid)]));

  return () => { unwatchList(); if (unwatchThread) unwatchThread(); };
}

function newConversationDialog(onCreated) {
  let type = "personal";
  const typeSel = select([{ value: "personal", label: "Personal" }, { value: "group", label: "Group" }]);
  const name = input({ placeholder: "Group name" });
  const nameField = field("Group name", name);
  nameField.style.display = "none";
  typeSel.addEventListener("change", () => {
    type = typeSel.value;
    nameField.style.display = type === "group" ? "" : "none";
    if (type === "personal" && chosen.size > 1) {
      const [first] = chosen.values();
      chosen.clear(); chosen.set(first.uid, first);
      paintChosen(); paintResults();
    }
  });

  const search = input({ placeholder: "Search by name", autocomplete: "off" });
  const results = el("div.pick-grid");
  const chosen = new Map();
  const chosenBox = el("div.chip-row");

  let people = [];
  directory().then(list => { people = list; paintResults(); }).catch(() => {});

  function paintChosen() {
    chosenBox.innerHTML = "";
    for (const p of chosen.values()) {
      chosenBox.appendChild(button(p.name + " ✕", { class: "chip on", onclick: () => {
        chosen.delete(p.uid); paintChosen(); paintResults();
      }}));
    }
  }

  function paintResults() {
    const term = search.value.trim().toLowerCase();
    results.innerHTML = "";
    const shown = people.filter(p => !chosen.has(p.uid) && (!term || p.name.toLowerCase().includes(term)));
    if (!shown.length) { results.appendChild(el("div.hint", { style: "padding:.5rem", text: "No match." })); return; }
    for (const p of shown.slice(0, 20)) {
      const row = el("button.pick-card", { type: "button" }, [
        el("div.pick-body", {}, [
          el("div.pick-name", { text: p.name }),
          el("div.pick-meta", { text: directoryRoleLabel(p.role) })
        ])
      ]);
      row.addEventListener("click", () => {
        if (type === "personal" && chosen.size >= 1) chosen.clear();
        chosen.set(p.uid, p);
        paintChosen(); paintResults();
      });
      results.appendChild(row);
    }
  }
  search.addEventListener("input", debounce(paintResults, 150));

  modal({
    title: "New conversation",
    body: el("div", {}, [
      field("Type", typeSel), nameField,
      chosenBox,
      field("Add people", search),
      results
    ]),
    actions: [
      { label: "Cancel" },
      { label: "Start", kind: "accent", closes: false, busyLabel: "Starting…", onClick: guard(async close => {
          try {
            const id = await startConversation({
              type, name: name.value,
              participants: [...chosen.values()],
              createdBy: session.name, createdByUid: session.user.uid
            });
            close(true);
            onCreated(id);
          } catch (err) { toast(err.message, true); return false; }
        })
      }
    ]
  });
}

function directoryRoleLabel(r) {
  return { house: "House", judge: "Judge", coAdmin: "Co-Admin", stage: "Stage Manager" }[r] || r;
}

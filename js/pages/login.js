import { el, field, input, select, card, notice, button, guard, toast } from "../lib/ui.js";
import { login, loginNames, session } from "../lib/session.js";
import { homeForRole } from "../app.js";
import { navigate } from "../lib/router.js";

const ROLE_CHIPS = [
  { value: "admin",   label: "Admin"         },
  { value: "coAdmin", label: "Co-Admin"      },
  { value: "judge",   label: "Judge"         },
  { value: "house",   label: "House Manager" },
  { value: "stage",   label: "Stage Manager" }
];

export default async function loginPage(root) {
  if (session.user) { navigate(homeForRole()); return; }

  let role = "admin";
  // Centred card on the fest gradient — no top bar, because there is
  // nowhere else to go from here.
  const wrap = el("div.auth-card");
  root.appendChild(el("div.auth-screen", {}, wrap));
  wrap.appendChild(el("div.auth-brand", {}, [
    window.__FEST_LOGO__
      ? el("img", { src: window.__FEST_LOGO__, alt: "", style: "max-height:38px;max-width:180px;object-fit:contain" })
      : el("div.mark", { text: (window.__FEST_NAME__ || "F").trim().split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase() }),
    el("div.who", { text: window.__FEST_NAME__ || "Fest Tabulation" })
  ]));

  const chips = el("div.btn-row", { style: "margin-bottom:1rem" });
  const formBox = el("div");
  const status = el("div");

  ROLE_CHIPS.forEach(r => {
    const b = button(r.label, {
      class: r.value === role ? "btn-primary" : "",
      onclick: () => { role = r.value; paintChips(); renderForm(); }
    });
    b.dataset.role = r.value;
    chips.appendChild(b);
  });
  function paintChips() {
    chips.querySelectorAll("button").forEach(b =>
      b.className = b.dataset.role === role ? "btn-primary" : "");
  }

  wrap.appendChild(el("div", {}, [
    el("h2", { text: "Log in", style: "margin-bottom:.3rem" }),
    el("p.hint", { text: "Pick who you are, then enter your password. There are no usernames." }),
    chips, status, formBox
  ]));
  wrap.appendChild(el("div.auth-foot", {}, [
    el("span", { text: "ExcelGuru · v" + (window.__APP_VERSION__ || "7.2") + " · " }),
    el("a", { href: "https://excelguru.co.in", target: "_blank", rel: "noopener", text: "excelguru.co.in" })
  ]));

  async function renderForm() {
    status.innerHTML = "";
    formBox.innerHTML = "";
    const pw = input({ type: "password", autocomplete: "current-password" });

    let slugOf = () => "admin";
    if (role !== "admin") {
      const names = await loginNames(role).catch(() => []);
      if (!names.length) {
        formBox.appendChild(notice("warn", "No accounts of this type exist yet. Ask your Admin to create one."));
        return;
      }
      const picker = select(names.map(n => ({ value: n.slug, label: n.name })));
      slugOf = () => picker.value;
      formBox.appendChild(field("Your name", picker));
    }

    formBox.appendChild(field("Password", pw));
    const go = button("Log in", { class: "btn-accent", onclick: guard(async () => {
      status.innerHTML = "";
      go.disabled = true; go.textContent = "Checking…";
      try {
        // Resolves only once the role has arrived, so homeForRole() cannot
        // run against a half-populated session (B1).
        await login(slugOf(), pw.value);
        if (!session.role) {
          status.innerHTML = "";
          status.appendChild(notice("warn",
            session.error ||
            "Signed in, but your account has no role assigned. Ask an Admin to open Accounts and press Repair logins."));
          return;
        }
        toast("Welcome back.");
        navigate(homeForRole());
      } finally { go.disabled = false; go.textContent = "Log in"; }
    })});
    pw.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
    formBox.appendChild(el("div.btn-row", {}, go));
    pw.focus();
  }

  renderForm();
}
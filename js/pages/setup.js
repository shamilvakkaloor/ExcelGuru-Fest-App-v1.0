// First-run wizard. Creates the Admin account and the config documents.
//
// Security Rules allow self-service Admin creation only while
// config/festSettings does not exist. Writing it at the end of this flow is
// what closes that door permanently.
import { el, field, input, card, notice, button, toast, guard } from "../lib/ui.js";
import { getOne, put } from "../lib/db.js";
import { bootstrapAdmin, validatePassword, session } from "../lib/session.js";
import { DEFAULTS, EVENT_CLASSES } from "../domain/constants.js";
import { navigate } from "../lib/router.js";
import { hashGuardPassword } from "../lib/crypto.js";
import { detectZone, zoneList, describeZone, isValidZone } from "../lib/timezone.js";

export default async function setupPage(root) {
  const existing = await getOne("config", "festSettings").catch(() => null);
  if (existing) {
    root.appendChild(el("div.wrap.wrap-narrow.pull-up", {}, card(el("div", {}, [
      notice("info", "This fest is already set up."),
      el("a.btn.btn-primary", { href: "#/login", text: "Go to login" })
    ]), "Setup complete")));
    return;
  }

  const festName = input({ placeholder: "e.g. Sargam 2026", required: true });
  const school   = input({ placeholder: "School or college name" });
  const pw       = input({ type: "password", autocomplete: "new-password" });
  const pw2      = input({ type: "password", autocomplete: "new-password" });
  // v8 — the delete guard. A SEPARATE password from the Admin login,
  // required before "Delete everything" runs, set once here and changeable
  // later only with the current guard password or a re-authenticated Admin
  // login — see Settings → Danger zone.
  const guardPw  = input({ type: "password", autocomplete: "new-password" });
  const guardPw2 = input({ type: "password", autocomplete: "new-password" });

  /* The fest's timezone. The device's zone is offered as a SUGGESTION, not
   * taken silently — an organiser may well be setting this up from a
   * different country to the one the fest runs in. */
  const detected = detectZone();
  const tz = el("select", { class: "input" });
  for (const z of zoneList()) {
    tz.appendChild(el("option", { value: z, text: z, selected: z === detected }));
  }
  if (detected && isValidZone(detected)) tz.value = detected;
  const status   = el("div");

  const submit = button("Create fest", { class: "btn-accent", onclick: guard(async () => {
    status.innerHTML = "";
    if (!festName.value.trim()) { status.appendChild(notice("danger", "Give the fest a name.")); return; }
    const pwErr = validatePassword(pw.value, pw2.value);
    if (pwErr) { status.appendChild(notice("danger", pwErr)); return; }
    const guardErr = validatePassword(guardPw.value, guardPw2.value);
    if (guardErr) { status.appendChild(notice("danger", "Delete-everything password: " + guardErr)); return; }
    if (guardPw.value === pw.value) {
      status.appendChild(notice("danger", "Use a different password for delete-everything than your Admin login — otherwise it protects nothing extra."));
      return;
    }

    submit.disabled = true;
    submit.textContent = "Creating…";
    try {
      // Signing in happens INSIDE bootstrapAdmin, before the Admin's own
      // role document is written — Security Rules require that order.
      await bootstrapAdmin({ password: pw.value, name: "Admin" });

      // Seed the config documents. Order matters: festSettings goes last
      // because writing it is what locks out further Admin self-creation.
      await put("config", "gradePoints", DEFAULTS.gradePoints);
      await put("config", "participantLimits", DEFAULTS.participantLimits);
      await put("config", "leaderboard", DEFAULTS.leaderboard);
      await put("config", "counters", { chestNumber: 0, eventCode: 0 });
      for (const c of EVENT_CLASSES) {
        await put("pointsConfig", c.id, { rankPoints: { ...DEFAULTS.rankPoints } });
      }

      // Salted hash only — never the plaintext, and never in `config`,
      // which is publicly readable.
      const guardDoc = await hashGuardPassword(guardPw.value);
      await put("guard", "deleteGuard", guardDoc);

      await put("config", "festSettings", {
        ...DEFAULTS.festSettings,
        festName: festName.value.trim(),
        schoolName: school.value.trim(),
        hasDeleteGuard: true,
        // Schedule times are wall-clock in the fest's own zone. Captured
        // here from the Admin's browser so a spectator in another country
        // still sees "Ongoing" at the right moment.
        festTimeZone: tz.value || null
      });

      toast("Fest created. You are signed in as Admin.");
      window.__NEEDS_SETUP__ = false;
      window.__FEST_NAME__ = festName.value.trim();
      navigate("/admin/dashboard");
    } catch (err) {
      submit.disabled = false;
      submit.textContent = "Create fest";
      throw err;
    }
  })});

  root.appendChild(el("div.setup-hero", {}, el("div.wrap.wrap-narrow", {}, [
    el("h1", { text: "Set up your fest" }),
    el("div.rule"),
    el("div.sub", { text: "This runs once. It creates the Admin account and the starting configuration." })
  ])));

  root.appendChild(el("div.wrap.wrap-narrow", {}, card(el("div", {}, [
    status,
    field("Fest name", festName),
    field("School / college", school),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:1.2rem 0" }),
    el("h3", { text: "Admin password" }),
    el("p.hint", { text: "You log in as Admin with this password alone — there is no username. Write it down; there is no email reset." }),
    field("Password", pw, "Between 3 and 8 characters."),
    field("Confirm password", pw2),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:1.2rem 0" }),
    el("h3", { text: "Where the fest happens" }),
    el("p.hint", { text:
      "Schedule times are wall-clock times where the fest is held. This is used to decide whether an " +
      "event is upcoming, ongoing or finished, so a spectator in another country still sees the right " +
      "thing. Daylight saving is handled automatically." }),
    field("Fest timezone", tz, detected ? "Detected from this device — change it if the fest is elsewhere." : "Choose the timezone the fest runs in."),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:1.2rem 0" }),
    el("h3", { text: "Delete-everything password" }),
    el("p.hint", {
      text: "A SEPARATE password, required before the Danger Zone will wipe the fest. " +
        "Worth knowing what this does and does not do: it stops an unattended machine and a " +
        "misclick. It does not stop someone already signed in as Admin who is determined to " +
        "bypass it in the browser — there is no server here to enforce that. Use it as a " +
        "safety catch, not a lock."
    }),
    field("Delete-everything password", guardPw, "Different from your Admin password."),
    field("Confirm password", guardPw2),
    el("div.btn-row", {}, submit)
  ]), "Fest details")));
}

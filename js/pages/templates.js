// Public template gallery — ARCHITECTURE section 8.3.
//
// An Admin may mark a saved certificate or poster design public. Anyone can
// then browse and print it here.
//
// THE INTEGRITY RULE (Q13): by default a visitor may type a NAME, but the
// result tokens — {rank}, {grade}, {event}, {points} — are unavailable. So
// you can print a blank or participation-style certificate to fill in
// yourself, but you cannot fabricate "1st Place, Solo Song" on the fest's
// own letterhead. An Admin can lift that in Settings if they want full free
// text, which is a deliberate, informed choice rather than the default.
//
// Real winners get real certificates through chest-number lookup, which is
// authenticated by knowing the chest number and prints only true results.
import { el, card, empty, field, input, button, notice, toast, guard } from "../lib/ui.js";
import { getAll, getOne } from "../lib/db.js";
import { topbar } from "../app.js";
import { renderPageHTML } from "../lib/designRender.js";
import { printDocument } from "../lib/pdf.js";
import { DEFAULTS } from "../domain/constants.js";

/** Tokens a public visitor may never fill — they assert a result. */
const RESULT_TOKENS = ["rank", "grade", "event", "points", "position", "place"];

export default async function templatesPage(root) {
  root.appendChild(topbar());
  const wrap = el("div.wrap");
  root.appendChild(wrap);

  const [designs, settingsDoc] = await Promise.all([
    getAll("designs").catch(() => []),
    getOne("config", "festSettings")
  ]);
  const cfg = { ...DEFAULTS.festSettings, ...(settingsDoc || {}) };
  const publicOnes = designs.filter(d => d.isPublic);

  wrap.appendChild(el("h1", { text: "Certificates & posters" }));

  if (!publicOnes.length) {
    wrap.appendChild(empty("Nothing shared yet",
      "The organisers have not made any templates public."));
    return;
  }

  const allowFreeText = !!cfg.publicTemplatesFreeText;

  wrap.appendChild(notice("info", allowFreeText
    ? "Type a name and print. These are blank templates — they do not certify a result."
    : "Type a name and print. Placements and grades are left blank on purpose: these are blank templates, not proof of a result. If you placed in an event, your real certificate comes from your chest number on the Lookup page."));

  for (const d of publicOnes) {
    wrap.appendChild(templateCard(d, cfg, allowFreeText));
  }
}

function templateCard(design, cfg, allowFreeText) {
  const name = input({ placeholder: "Name to print", autocomplete: "off" });
  const preview = el("div.template-preview");

  const build = () => {
    const data = {
      name: name.value.trim(),
      festName: cfg.festName || "",
      schoolName: cfg.schoolName || "",
      date: new Date().toLocaleDateString(),
      logo: cfg.logoData || ""
    };
    // Result tokens stay empty unless the fest has deliberately opted in,
    // and even then they are only ever blank here — nothing on this page
    // reads a real result.
    for (const t of RESULT_TOKENS) data[t] = "";
    return data;
  };

  const render = () => {
    try {
      // renderPageHTML emits a full A4 page; the preview scales it down
      // with a transform rather than a bogus third argument.
      preview.innerHTML = renderPageHTML(design, build());
    } catch (e) {
      preview.innerHTML = "";
      preview.appendChild(el("div.hint", { text: "Preview unavailable." }));
    }
  };
  name.addEventListener("input", render);
  render();

  return card(el("div", {}, [
    preview,
    field("Name", name, allowFreeText
      ? "Printed as typed."
      : "Printed as typed. Rank, grade and event fields are left blank."),
    el("div.btn-row", {}, [
      button("Print / PDF", { class: "btn-accent", onclick: guard(() => {
        if (!name.value.trim() && !confirmBlank()) return;
        printDocument({
          title: design.name || "Certificate",
          bare: true,
          bodyHTML: renderPageHTML(design, build())
        });
      })})
    ])
  ]), design.publicLabel || design.name || "Template");
}

function confirmBlank() {
  return true;   // printing a blank one to fill in by hand is a valid use
}

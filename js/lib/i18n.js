// Admin-only English/Malayalam toggle for explanatory hint text.
//
// Scope is deliberately narrow: only the small ".hint" text under a field
// or checkbox — the sentence that explains what an option does — is
// translated. Labels, headings, button text and everything a participant
// or the public ever sees stay English. There is no translation API on
// this stack (Firebase free tier, no server), so ML is a hand-maintained
// dictionary keyed by the exact English string; anything not yet in it
// simply falls back to English rather than showing blank or broken text.

import { is } from "./session.js";

const KEY = "fest.lang";
export const LANGS = ["en", "ml"];

export function getLang() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.includes(v) ? v : "en";
  } catch { return "en"; }
}

export function setLang(lang) {
  const l = LANGS.includes(lang) ? lang : "en";
  try { localStorage.setItem(KEY, l); } catch { /* private mode — session only */ }
  return l;
}

/** Translate one hint string. Falls back to the English original when the
 * dictionary has no entry, when displaying "en", or for anyone signed in
 * as anything other than Admin — this is an admin convenience, not a
 * public-facing feature, so no other role or device ever sees Malayalam
 * even if "ml" is still saved from a shared browser. */
export function tr(text, vars) {
  if (!text) return text;
  const src = (getLang() !== "ml" || !is.admin()) ? text : (ML[text] || text);
  return vars ? fill(src, vars) : src;
}

/**
 * Fill {placeholders}.
 *
 * Some sentences carry a value that is not translatable — the fest's own
 * word for a house, a renamed grade — spliced into the middle of them.
 * Written as a template literal those become a different string every fest
 * and can never be dictionary-keyed, which is why several of the longest
 * explanations stayed English. Keyed with a {placeholder} instead, the
 * sentence is one stable key and the value drops in afterwards — and it
 * drops into the MALAYALAM sentence at whatever position that language
 * puts it, which a concatenated prefix could never do.
 *
 * An unknown placeholder is left visible rather than blanked: a stray
 * {house} in the UI is a bug someone reports, an empty gap is one nobody
 * notices.
 */
function fill(s, vars) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m);
}

/**
 * Malayalam translations of hint/explanation text, keyed by the exact
 * English string as it appears in the source. Keep keys copy-pasted
 * exactly — a mismatched key silently falls back to English rather than
 * erroring, which is safe but easy to miss, so check a page after adding
 * or editing a hint elsewhere.
 */
export const ML = {
  "Which ladder decides this event's rank AND grade points. One source only.":
    "ഈ ഇവന്റിന്റെ റാങ്കും ഗ്രേഡ് പോയിന്റും തീരുമാനിക്കുന്നത് ഏത് ലാഡറാണ് എന്ന്. ഒരു ഉറവിടം മാത്രം.",
  "This event's own rank ladder, worth more or less than its class/stage/type/tier default. Grade points, if this event awards them, still come from the shared grade table.":
    "ഈ ഇവന്റിന്റെ സ്വന്തം റാങ്ക് ലാഡർ, ക്ലാസ്/സ്റ്റേജ്/ടൈപ്പ്/ടയർ ഡിഫോൾട്ടിനെക്കാൾ കൂടുതലോ കുറവോ ആകാം. ഗ്രേഡ് പോയിന്റുകൾ, ഈ ഇവന്റ് അവ നൽകുന്നെങ്കിൽ, പൊതു ഗ്രേഡ് ടേബിളിൽ നിന്ന് തന്നെ വരും.",
  "Turn off for a gradeless event. The grade is still worked out and shown, but contributes 0 points. Rank points are unaffected.":
    "ഗ്രേഡ് ഇല്ലാത്ത ഇവന്റിന് ഇത് ഓഫ് ചെയ്യുക. ഗ്രേഡ് കണക്കാക്കി കാണിക്കും, പക്ഷേ 0 പോയിന്റ് മാത്രമേ നൽകൂ. റാങ്ക് പോയിന്റുകളെ ഇത് ബാധിക്കില്ല.",
  "Filter axes. They only affect points if you also pick them below.":
    "ഫിൽട്ടർ അക്‌സുകൾ. താഴെ തിരഞ്ഞെടുത്താൽ മാത്രമേ ഇവ പോയിന്റിനെ ബാധിക്കൂ.",
  "Negative to deduct, positive to award.":
    "കുറയ്ക്കാൻ നെഗറ്റീവ്, നൽകാൻ പോസിറ്റീവ്.",
  "Required. Shown alongside the adjustment wherever it is listed.":
    "നിർബന്ധം. ഈ അഡ്ജസ്റ്റ്മെന്റ് കാണിക്കുന്നിടത്തെല്ലാം ഒപ്പം കാണിക്കും.",
  "Optional — attach if a refund was sent.":
    "ഐച്ഛികം — റീഫണ്ട് അയച്ചെങ്കിൽ ഘടിപ്പിക്കുക.",
  "For the filtered participant list.":
    "ഫിൽട്ടർ ചെയ്ത പങ്കാളി പട്ടികയ്ക്ക്.",
  "Leave either blank for no bound.":
    "പരിധി വേണ്ടെങ്കിൽ ഇവ രണ്ടും ശൂന്യമായി വിടുക.",
  "Internal only — used for imports and chest prefixes. Not shown to anyone.":
    "ആന്തരികം മാത്രം — ഇംപോർട്ടുകൾക്കും ചെസ്റ്റ് പ്രിഫിക്സിനും ഉപയോഗിക്കുന്നു. ആരും കാണില്ല.",
  "Type this house's first chest number, e.g. RED-A01. Every later participant follows the pattern automatically. Leave blank to set it by adding the first participant by hand.":
    "ഈ ഹൗസിന്റെ ആദ്യ ചെസ്റ്റ് നമ്പർ ടൈപ്പ് ചെയ്യുക, ഉദാ. RED-A01. പിന്നീടുള്ള എല്ലാ പങ്കാളികളും ഈ പാറ്റേൺ സ്വയമേവ പിന്തുടരും. ആദ്യ പങ്കാളിയെ നേരിട്ട് ചേർത്ത് സെറ്റ് ചെയ്യാൻ ശൂന്യമായി വിടുക.",
  "Added to this house's total. Use negatives to deduct.":
    "ഈ ഹൗസിന്റെ ആകെ ടോട്ടലിലേക്ക് കൂട്ടിച്ചേർക്കും. കുറയ്ക്കാൻ നെഗറ്റീവ് ഉപയോഗിക്കുക.",
  "3 to 8 characters. Share it with them directly.":
    "3 മുതൽ 8 വരെ അക്ഷരങ്ങൾ. ഇത് അവരോട് നേരിട്ട് പങ്കുവയ്ക്കുക.",
  "Between 3 and 8 characters.":
    "3 നും 8 നും ഇടയിൽ അക്ഷരങ്ങൾ.",
  "The login dropdown keeps the original entry, so this is a display name change.":
    "ലോഗിൻ ഡ്രോപ്ഡൗണിൽ യഥാർത്ഥ എൻട്രി അതേപടി നിലനിൽക്കും, ഇത് കാണിക്കുന്ന പേരിലെ മാറ്റം മാത്രമാണ്.",
  "Participants added to this house take numbers from this range, so a chest number reads as a house on the day. Ranges may not overlap.":
    "ഈ ഹൗസിലേക്ക് ചേർക്കുന്ന പങ്കാളികൾ ഈ പരിധിയിൽ നിന്നുള്ള നമ്പറുകൾ എടുക്കും, അതിനാൽ ചെസ്റ്റ് നമ്പർ കണ്ടാൽ ഏത് ഹൗസെന്ന് അറിയാം. പരിധികൾ പരസ്പരം ഓവർലാപ്പ് ചെയ്യരുത്.",
  "This fest uses one shared chest number sequence, so houses have no range of their own.":
    "ഈ ഫെസ്റ്റ് ഒരൊറ്റ പൊതു ചെസ്റ്റ് നമ്പർ സീക്വൻസ് ഉപയോഗിക്കുന്നു, അതിനാൽ ഹൗസുകൾക്ക് സ്വന്തമായി പരിധിയില്ല.",
  "Each number is private unless you tick it. Many of these are students, so nothing is published by default — tick only the numbers that should appear on the public Contact page.":
    "ടിക് ചെയ്യാത്ത ഓരോ നമ്പറും സ്വകാര്യമാണ്. ഇവയിൽ പലതും വിദ്യാർത്ഥികളുടേതായതിനാൽ, ഡിഫോൾട്ടായി ഒന്നും പ്രസിദ്ധീകരിക്കില്ല — പൊതു കോൺടാക്റ്റ് പേജിൽ കാണിക്കേണ്ട നമ്പറുകൾ മാത്രം ടിക് ചെയ്യുക.",
  "Turn this on to manage the list of Types and Tiers here — the Add/Edit controls for both only appear once it's switched on.":
    "ടൈപ്പുകളും ടയറുകളും ഇവിടെ കൈകാര്യം ചെയ്യാൻ ഇത് ഓണാക്കുക — ഇത് ഓണാക്കിയാൽ മാത്രമേ രണ്ടിന്റെയും ചേർക്കൽ/എഡിറ്റ് നിയന്ത്രണങ്ങൾ കാണൂ.",
  "Stage (on-stage / off-stage) is always available and lives on the event form as before. Type (Speech, Song, Essay…) and Tier (Grade 1, Grade 2…) are extra, optional axes — turn them on here, then list the values below. They never affect points on their own; a fest that also wants to award different points per axis does that in Points & grades, and each event then picks its one point source.":
    "സ്റ്റേജ് (ഓൺ-സ്റ്റേജ് / ഓഫ്-സ്റ്റേജ്) എപ്പോഴും ലഭ്യമാണ്, മുമ്പത്തെപ്പോലെ ഇവന്റ് ഫോമിൽ തന്നെ. ടൈപ്പ് (സ്പീച്ച്, സോംഗ്, ഉപന്യാസം…), ടയർ (ഗ്രേഡ് 1, ഗ്രേഡ് 2…) എന്നിവ അധിക, ഐച്ഛിക അക്‌സുകളാണ് — ഇവിടെ ഓണാക്കി താഴെ വാല്യൂകൾ ചേർക്കുക. ഇവ സ്വയമേവ പോയിന്റിനെ ബാധിക്കില്ല; ഓരോ അക്‌സിനും വ്യത്യസ്ത പോയിന്റ് വേണമെങ്കിൽ അത് പോയിന്റ്സ് & ഗ്രേഡ്സിൽ ചെയ്യാം, ഓരോ ഇവന്റും അതിന്റെ ഒരു പോയിന്റ് ഉറവിടം തിരഞ്ഞെടുക്കും.",
  "Only finalized, published events have results to show.":
    "പ്രസിദ്ധീകരിച്ച, അന്തിമമാക്കിയ ഇവന്റുകൾക്ക് മാത്രമേ കാണിക്കാൻ റിസൾട്ട് ഉണ്ടാകൂ.",
  "None selected means every placement.":
    "ഒന്നും തിരഞ്ഞെടുത്തില്ലെങ്കിൽ എല്ലാ സ്ഥാനങ്ങളും ഉൾപ്പെടും.",
  "Large runs are split so the browser is never holding hundreds of pages at once.":
    "വലിയ റണ്ണുകൾ ബ്രൗസർ ഒരേസമയം നൂറുകണക്കിന് പേജുകൾ കൈകാര്യം ചെയ്യാതിരിക്കാൻ ഭാഗങ്ങളായി തിരിക്കും.",
  "Percentages are calculated against this. 100 is typical.":
    "ഇതിനെ അടിസ്ഥാനമാക്കിയാണ് ശതമാനം കണക്കാക്കുന്നത്. 100 ആണ് സാധാരണം.",

  /* ── Added in the full-coverage pass ─────────────────────────────── */
  "This reads the login directory, writes the missing ids, and moves any assignments that were filed under the old key. It changes nobody's password and is safe to run more than once.":
    "ഇത് ലോഗിൻ ഡയറക്ടറി വായിച്ച്, ഇല്ലാത്ത ഐഡികൾ എഴുതി, പഴയ കീയിൽ ഫയൽ ചെയ്ത അസൈൻമെന്റുകൾ മാറ്റുന്നു. ഇത് ആരുടെയും പാസ്‌വേഡ് മാറ്റില്ല, ഒന്നിലധികം തവണ പ്രവർത്തിപ്പിക്കുന്നതും സുരക്ഷിതമാണ്.",
  "The window closes once code letters are assigned for that event.":
    "ആ ഇവന്റിന് കോഡ് ലെറ്ററുകൾ നൽകിയാൽ ഈ വിൻഡോ അടയും.",
  "CSV opens in Excel or Sheets. Print / PDF opens your browser's print dialog — choose \"Save as PDF\" as the destination.":
    "CSV എക്സലിലോ ഷീറ്റ്സിലോ തുറക്കും. പ്രിന്റ് / PDF നിങ്ങളുടെ ബ്രൗസറിന്റെ പ്രിന്റ് ഡയലോഗ് തുറക്കും — ലക്ഷ്യസ്ഥാനമായി \"Save as PDF\" തിരഞ്ഞെടുക്കുക.",
  "Every participant currently below a configured minimum. Minimums never block a registration — this is how you catch shortfalls.":
    "നിശ്ചയിച്ച കുറഞ്ഞ പരിധിക്ക് താഴെയുള്ള എല്ലാ പങ്കാളികളും. കുറഞ്ഞ പരിധികൾ ഒരിക്കലും രജിസ്ട്രേഷൻ തടയില്ല — കുറവുകൾ കണ്ടെത്താനുള്ള വഴിയാണിത്.",
  "Built from published results only. Filters apply to every report below. Staff reports always show every rank — the public rank limit is a display setting, not a data one.":
    "പ്രസിദ്ധീകരിച്ച ഫലങ്ങളിൽ നിന്ന് മാത്രം തയ്യാറാക്കിയത്. ഫിൽട്ടറുകൾ താഴെയുള്ള എല്ലാ റിപ്പോർട്ടുകൾക്കും ബാധകമാണ്. സ്റ്റാഫ് റിപ്പോർട്ടുകൾ എപ്പോഴും എല്ലാ റാങ്കുകളും കാണിക്കും — പൊതു റാങ്ക് പരിധി ഒരു ഡിസ്‌പ്ലേ ക്രമീകരണമാണ്, ഡാറ്റ ക്രമീകരണമല്ല.",
  "The event is still judged, ranked and published as normal — its points simply do not count towards house totals or any leaderboard. For exhibition or invitational items.":
    "ഇവന്റ് പതിവുപോലെ വിലയിരുത്തുകയും റാങ്ക് ചെയ്യുകയും പ്രസിദ്ധീകരിക്കുകയും ചെയ്യും — അതിന്റെ പോയിന്റുകൾ ഹൗസ് ടോട്ടലിലേക്കോ ഏതെങ്കിലും ലീഡർബോർഡിലേക്കോ കണക്കാക്കില്ല എന്ന് മാത്രം. പ്രദർശന അല്ലെങ്കിൽ ക്ഷണിക്കപ്പെട്ട ഇനങ്ങൾക്ക്.",
  "Hold back places for particular categories, so one or two cannot fill the event. An entry is refused only when taking the place would make a reservation impossible to honour — never before that. Leave blank for no reservation.":
    "ചില വിഭാഗങ്ങൾക്കായി സ്ഥാനങ്ങൾ മാറ്റിവയ്ക്കുക, അങ്ങനെ ഒന്നോ രണ്ടോ വിഭാഗങ്ങൾക്ക് ഇവന്റ് മുഴുവൻ നിറയ്ക്കാൻ കഴിയില്ല. ഒരു സ്ഥാനം എടുക്കുന്നത് ഒരു റിസർവേഷൻ പാലിക്കാൻ കഴിയാത്ത അവസ്ഥയുണ്ടാക്കുമ്പോൾ മാത്രമേ എൻട്രി നിരസിക്കൂ — അതിനുമുമ്പ് ഒരിക്കലുമില്ല. റിസർവേഷൻ വേണ്ടെങ്കിൽ ശൂന്യമായി വിടുക.",
  "For a march-past, team chant or similar. The house registers once with no roster and earns the points as a unit; nothing counts against any participant's event caps. Group events only.":
    "മാർച്ച്-പാസ്റ്റ്, ടീം ചാന്റ് തുടങ്ങിയവയ്ക്ക്. ഹൗസ് റോസ്റ്റർ ഇല്ലാതെ ഒരിക്കൽ രജിസ്റ്റർ ചെയ്യുകയും ഒരു യൂണിറ്റായി പോയിന്റ് നേടുകയും ചെയ്യും; ഒരു പങ്കാളിയുടെയും ഇവന്റ് പരിധിയിലേക്ക് ഇത് കണക്കാക്കില്ല. ഗ്രൂപ്പ് ഇവന്റുകൾക്ക് മാത്രം.",
  "Off by default. Turning this on lets a House Manager submit one item per entry after registering — Admin still approves or rejects each submission, oldest first. Once approved, it is shown to a judge beside the code letter, the same way the event description is.":
    "സ്ഥിരസ്ഥിതിയായി ഓഫ്. ഇത് ഓണാക്കിയാൽ രജിസ്റ്റർ ചെയ്ത ശേഷം ഓരോ എൻട്രിക്കും ഒരു ഇനം സമർപ്പിക്കാൻ ഹൗസ് മാനേജർക്ക് കഴിയും — ഓരോ സമർപ്പണവും അഡ്മിൻ തന്നെ അംഗീകരിക്കുകയോ നിരസിക്കുകയോ ചെയ്യും, പഴയത് ആദ്യം. അംഗീകരിച്ചാൽ, ഇവന്റ് വിവരണം പോലെ തന്നെ കോഡ് ലെറ്ററിനൊപ്പം ജഡ്ജിക്ക് കാണിക്കും.",
  "Leave both blank to accept submissions for as long as this is switched on. Set either to close the window at a specific time — useful for song titles that need to reach the sound crew before the event runs.":
    "ഇത് ഓണായിരിക്കുന്നിടത്തോളം സമർപ്പണങ്ങൾ സ്വീകരിക്കാൻ രണ്ടും ശൂന്യമായി വിടുക. ഒരു നിശ്ചിത സമയത്ത് വിൻഡോ അടയ്ക്കാൻ ഏതെങ്കിലും ഒന്ന് സെറ്റ് ചെയ്യുക — ഇവന്റിന് മുമ്പ് സൗണ്ട് ക്രൂവിന് എത്തേണ്ട ഗാന ശീർഷകങ്ങൾക്ക് ഇത് ഉപകാരപ്രദമാണ്.",
  "Leave blank to use the fest-wide window.":
    "ഫെസ്റ്റ് വ്യാപകമായ വിൻഡോ ഉപയോഗിക്കാൻ ശൂന്യമായി വിടുക.",
  "Fix these rows in the file and import them again — the rows above were not added.":
    "ഫയലിലെ ഈ വരികൾ ശരിയാക്കി വീണ്ടും ഇംപോർട്ട് ചെയ്യുക — മുകളിലെ വരികൾ ചേർത്തിട്ടില്ല.",
  "Pick every category that may enter. They compete together in one ranking — there is no separate 1st place per category. Each participant still counts against their own category's entry limits.":
    "പ്രവേശിക്കാവുന്ന എല്ലാ വിഭാഗങ്ങളും തിരഞ്ഞെടുക്കുക. അവർ ഒരൊറ്റ റാങ്കിംഗിൽ ഒരുമിച്ച് മത്സരിക്കും — ഓരോ വിഭാഗത്തിനും പ്രത്യേകം ഒന്നാം സ്ഥാനമില്ല. ഓരോ പങ്കാളിയും അവരവരുടെ വിഭാഗത്തിന്റെ എൻട്രി പരിധിയിലേക്കാണ് കണക്കാക്കുക.",
  "Ignored for general events.":
    "ജനറൽ ഇവന്റുകൾക്ക് ഇത് ബാധകമല്ല.",
  "Reporting only — it never blocks a registration. A house is below its minimum for most of the registration period, so blocking would make the last entry the only one that could succeed.":
    "റിപ്പോർട്ടിംഗിന് മാത്രം — ഇത് ഒരിക്കലും രജിസ്ട്രേഷൻ തടയില്ല. രജിസ്ട്രേഷൻ കാലയളവിന്റെ ഭൂരിഭാഗവും ഒരു ഹൗസ് അതിന്റെ കുറഞ്ഞ പരിധിക്ക് താഴെയായിരിക്കും, അതിനാൽ തടയുന്നത് അവസാന എൻട്രി മാത്രം വിജയിക്കുന്ന അവസ്ഥയുണ്ടാക്കും.",
  "How many entries one house may put into this event. Blank means no maximum.":
    "ഒരു ഹൗസിന് ഈ ഇവന്റിൽ എത്ര എൻട്രികൾ നൽകാം എന്നത്. ശൂന്യമെങ്കിൽ പരിധിയില്ല.",
  "Rules and regulations, scoring criteria. Shown to judges when they open this event to score, and on the public event list.":
    "നിയമങ്ങളും ചട്ടങ്ങളും, സ്കോറിംഗ് മാനദണ്ഡങ്ങൾ. സ്കോർ ചെയ്യാൻ ഈ ഇവന്റ് തുറക്കുമ്പോൾ ജഡ്ജിമാർക്കും പൊതു ഇവന്റ് പട്ടികയിലും കാണിക്കും.",
  "Columns: code, name, eventClass, category, stage, maxParticipantsPerEntry, maxEntriesPerHouse. Only name and eventClass are required; a blank code is auto-numbered.":
    "കോളങ്ങൾ: code, name, eventClass, category, stage, maxParticipantsPerEntry, maxEntriesPerHouse. name, eventClass എന്നിവ മാത്രമേ നിർബന്ധമുള്ളൂ; കോഡ് ശൂന്യമെങ്കിൽ സ്വയമേവ നമ്പർ നൽകും.",
  "Select an element on the canvas or in the layers list.":
    "ക്യാൻവാസിലോ ലെയർ പട്ടികയിലോ ഒരു എലമെന്റ് തിരഞ്ഞെടുക്കുക.",
  "Start from a template, arrange it on the canvas, then generate for everyone at once.":
    "ഒരു ടെംപ്ലേറ്റിൽ നിന്ന് തുടങ്ങുക, ക്യാൻവാസിൽ ക്രമീകരിക്കുക, എന്നിട്ട് എല്ലാവർക്കുമായി ഒരുമിച്ച് ജനറേറ്റ് ചെയ്യുക.",
  "Opens your browser's print window. Choose \"Save as PDF\" as the destination.":
    "നിങ്ങളുടെ ബ്രൗസറിന്റെ പ്രിന്റ് വിൻഡോ തുറക്കും. ലക്ഷ്യസ്ഥാനമായി \"Save as PDF\" തിരഞ്ഞെടുക്കുക.",
  "Find a participant and print their certificate on its own. Uses their real published results.":
    "ഒരു പങ്കാളിയെ കണ്ടെത്തി അവരുടെ സർട്ടിഫിക്കറ്റ് മാത്രമായി പ്രിന്റ് ചെയ്യുക. അവരുടെ യഥാർത്ഥ പ്രസിദ്ധീകരിച്ച ഫലങ്ങൾ ഉപയോഗിക്കുന്നു.",
  "No events assigned yet.":
    "ഇതുവരെ ഇവന്റുകളൊന്നും നൽകിയിട്ടില്ല.",
  "Required. Stored on the result and shown alongside it.":
    "നിർബന്ധം. ഫലത്തിൽ സൂക്ഷിക്കുകയും അതിനൊപ്പം കാണിക്കുകയും ചെയ്യും.",
  "Admin can fill a missing judge's score or correct one already submitted. A blank score is never read as zero — mark the entry Absent instead.":
    "ഇല്ലാത്ത ജഡ്ജിയുടെ സ്കോർ പൂരിപ്പിക്കാനോ സമർപ്പിച്ച ഒന്ന് തിരുത്താനോ അഡ്മിന് കഴിയും. ശൂന്യമായ സ്കോർ ഒരിക്കലും പൂജ്യമായി കണക്കാക്കില്ല — പകരം എൻട്രി ആബ്സന്റ് ആയി അടയാളപ്പെടുത്തുക.",
  "Columns: chestNumber, name, house, category, class, dob, gender, photoUrl. Name and house are required; category too unless automatic assignment can derive it from class or dob. Blank chest numbers follow the house's range or pattern, otherwise the shared sequence.":
    "കോളങ്ങൾ: chestNumber, name, house, category, class, dob, gender, photoUrl. name, house എന്നിവ നിർബന്ധമാണ്; ക്ലാസിൽ നിന്നോ ജനനത്തീയതിയിൽ നിന്നോ സ്വയമേവ കണ്ടെത്താൻ കഴിയുന്നില്ലെങ്കിൽ category യും വേണം. ചെസ്റ്റ് നമ്പർ ശൂന്യമെങ്കിൽ ഹൗസിന്റെ പരിധിയോ പാറ്റേണോ പിന്തുടരും, അല്ലെങ്കിൽ പൊതു ക്രമം.",
  "Cards are printed with cut guides. Code letters are deliberately left off — they are the blind-judging secret.":
    "കട്ട് ഗൈഡുകളോടെയാണ് കാർഡുകൾ പ്രിന്റ് ചെയ്യുന്നത്. കോഡ് ലെറ്ററുകൾ മനഃപൂർവ്വം ഒഴിവാക്കിയിരിക്കുന്നു — അവയാണ് ബ്ലൈൻഡ് ജഡ്ജിംഗിന്റെ രഹസ്യം.",
  "Safe to run at any time, including mid-fest — it only rewrites counters to match reality. It never changes a registration.":
    "ഫെസ്റ്റിനിടയിൽ ഉൾപ്പെടെ എപ്പോൾ വേണമെങ്കിലും പ്രവർത്തിപ്പിക്കാൻ സുരക്ഷിതം — ഇത് കൗണ്ടറുകളെ യാഥാർത്ഥ്യവുമായി പൊരുത്തപ്പെടുത്തി എഴുതുക മാത്രമേ ചെയ്യൂ. ഒരു രജിസ്ട്രേഷനും ഇത് മാറ്റില്ല.",
  "Standings if everything currently checked were published. Nothing has been saved.":
    "ഇപ്പോൾ ടിക് ചെയ്തതെല്ലാം പ്രസിദ്ധീകരിച്ചാൽ ഉണ്ടാകുന്ന നില. ഒന്നും സേവ് ചെയ്തിട്ടില്ല.",
  "No extensions in force.":
    "നിലവിൽ എക്സ്റ്റൻഷനുകളൊന്നുമില്ല.",
  "Substitutions are closed for every house on this event.":
    "ഈ ഇവന്റിൽ എല്ലാ ഹൗസുകൾക്കും സബ്സ്റ്റിറ്റ്യൂഷൻ അടച്ചിരിക്കുന്നു.",
  "Reopens this event past its deadline, for one house or for all of them. An extension can only move the deadline later — it never opens registration early, which would be an advantage rather than a remedy. Withdrawing stays possible for as long as the extension runs.":
    "ഈ ഇവന്റ് അതിന്റെ അവസാന തീയതിക്ക് ശേഷം ഒരു ഹൗസിനോ എല്ലാ ഹൗസുകൾക്കുമോ വീണ്ടും തുറക്കുന്നു. ഒരു എക്സ്റ്റൻഷന് അവസാന തീയതി പിന്നത്തേക്ക് മാത്രമേ മാറ്റാൻ കഴിയൂ — അത് ഒരിക്കലും രജിസ്ട്രേഷൻ നേരത്തെ തുറക്കില്ല, അത് ഒരു പരിഹാരത്തിനുപകരം ഒരു മുൻതൂക്കമാകും. എക്സ്റ്റൻഷൻ നിലനിൽക്കുന്നിടത്തോളം പിൻവലിക്കൽ സാധ്യമാണ്.",
  "Lets the house you pick ask to replace any current participant in one of their entries for this event — you still approve or reject each request on the Substitutions screen. Closes automatically once code letters are assigned, regardless of what is granted here.":
    "നിങ്ങൾ തിരഞ്ഞെടുക്കുന്ന ഹൗസിന് ഈ ഇവന്റിലെ അവരുടെ ഏതെങ്കിലും എൻട്രിയിലെ പങ്കാളിയെ മാറ്റാൻ അഭ്യർത്ഥിക്കാൻ അനുവദിക്കുന്നു — ഓരോ അഭ്യർത്ഥനയും സബ്സ്റ്റിറ്റ്യൂഷൻ സ്ക്രീനിൽ നിങ്ങൾ തന്നെ അംഗീകരിക്കുകയോ നിരസിക്കുകയോ വേണം. ഇവിടെ എന്ത് അനുവദിച്ചാലും, കോഡ് ലെറ്ററുകൾ നൽകിയാൽ ഇത് സ്വയമേവ അടയും.",
  "Assigned judges see this event in their panel. An event can also run with no judges — Admin can fill every score directly.":
    "നിയോഗിച്ച ജഡ്ജിമാർക്ക് ഈ ഇവന്റ് അവരുടെ പാനലിൽ കാണാം. ജഡ്ജിമാരില്ലാതെയും ഒരു ഇവന്റ് നടത്താം — അഡ്മിന് എല്ലാ സ്കോറുകളും നേരിട്ട് നൽകാൻ കഴിയും.",
  "Leave the link blank to hide the button entirely.":
    "ബട്ടൺ പൂർണ്ണമായും മറയ്ക്കാൻ ലിങ്ക് ശൂന്യമായി വിടുക.",
  "Rename “House” across the admin panel, public pages and certificates — e.g. “Team” or “Zone”. Internal labels and code (houseId, the house role) never change, only what's shown.":
    "അഡ്മിൻ പാനൽ, പൊതു പേജുകൾ, സർട്ടിഫിക്കറ്റുകൾ എന്നിവയിലുടനീളം \"House\" എന്നത് പുനർനാമകരണം ചെയ്യുക — ഉദാ. \"Team\" അല്ലെങ്കിൽ \"Zone\". ആന്തരിക ലേബലുകളും കോഡും (houseId, house റോൾ) ഒരിക്കലും മാറില്ല, കാണിക്കുന്നത് മാത്രം.",
  "Upload a PNG of your fest typography to show instead of the plain text name, on the home page and top bar. A transparent PNG works best — it sits on both a dark bar and a light page.":
    "പ്ലെയിൻ ടെക്സ്റ്റ് പേരിനുപകരം കാണിക്കാൻ നിങ്ങളുടെ ഫെസ്റ്റ് ടൈപ്പോഗ്രഫിയുടെ ഒരു PNG അപ്‌ലോഡ് ചെയ്യുക — ഹോം പേജിലും ടോപ്പ് ബാറിലും. സുതാര്യമായ PNG ആണ് ഏറ്റവും നല്ലത് — അത് ഇരുണ്ട ബാറിലും ഇളം പേജിലും ഒരുപോലെ ഇണങ്ങും.",
  "While the schedule is hidden you can build and edit it privately.":
    "ഷെഡ്യൂൾ മറച്ചിരിക്കുമ്പോൾ നിങ്ങൾക്ക് അത് സ്വകാര്യമായി തയ്യാറാക്കാനും തിരുത്താനും കഴിയും.",
  "Used only when Fest details has automatic category assignment switched on. Both ranges are inclusive.":
    "ഫെസ്റ്റ് വിശദാംശങ്ങളിൽ സ്വയമേവയുള്ള വിഭാഗ നിർണ്ണയം ഓണാക്കിയാൽ മാത്രം ഉപയോഗിക്കുന്നു. രണ്ട് പരിധികളും ഉൾപ്പെടുന്നതാണ്.",
  "Add specific events on top of any Types above.":
    "മുകളിലെ ഏതെങ്കിലും ടൈപ്പുകൾക്ക് പുറമേ പ്രത്യേക ഇവന്റുകൾ ചേർക്കുക.",
  "The combined pair caps both stages together — leave blank for no overall limit on this class.":
    "സംയോജിത ജോഡി രണ്ട് സ്റ്റേജുകളെയും ഒരുമിച്ച് പരിമിതപ്പെടുത്തുന്നു — ഈ ക്ലാസിൽ മൊത്തത്തിലുള്ള പരിധി വേണ്ടെങ്കിൽ ശൂന്യമായി വിടുക.",
  "None defined yet — add them on the Type & Tier tab.":
    "ഇതുവരെ ഒന്നും നിർവചിച്ചിട്ടില്ല — ടൈപ്പ് & ടയർ ടാബിൽ അവ ചേർക്കുക.",
  "All pools are counted in the score, so none are available as tiebreakers.":
    "എല്ലാ പൂളുകളും സ്കോറിൽ കണക്കാക്കുന്നു, അതിനാൽ ടൈബ്രേക്കറായി ഒന്നും ലഭ്യമല്ല.",
  "Publish some results first — ties are read from the published standings.":
    "ആദ്യം ചില ഫലങ്ങൾ പ്രസിദ്ധീകരിക്കുക — പ്രസിദ്ധീകരിച്ച നിലയിൽ നിന്നാണ് ടൈകൾ വായിക്കുന്നത്.",
  "No ties in the current standings.":
    "നിലവിലെ സ്റ്റാൻഡിംഗിൽ ടൈകളൊന്നുമില്ല.",
  "Restricts who APPEARS on this board — a qualifying participant's total is still every point the filters above matched, not only the qualifying entries.":
    "ഈ ബോർഡിൽ ആരൊക്കെ പ്രത്യക്ഷപ്പെടും എന്നത് പരിമിതപ്പെടുത്തുന്നു — യോഗ്യതയുള്ള ഒരു പങ്കാളിയുടെ ആകെത്തുക, യോഗ്യതാ എൻട്രികൾ മാത്രമല്ല, മുകളിലെ ഫിൽട്ടറുകൾ പൊരുത്തപ്പെട്ട എല്ലാ പോയിന്റുകളുമാണ്.",
  "Ticking any event here replaces the axis filters above.":
    "ഇവിടെ ഏതെങ്കിലും ഇവന്റ് ടിക് ചെയ്താൽ അത് മുകളിലെ അക്‌സ് ഫിൽട്ടറുകൾക്ക് പകരമാകും.",
  "A repeated year or a late admission genuinely puts someone in two categories at once. This decides which answer is used — the other is still shown, so the override is never silent.":
    "ആവർത്തിച്ച വർഷമോ വൈകിയുള്ള പ്രവേശനമോ ഒരാളെ ശരിക്കും ഒരേസമയം രണ്ട് വിഭാഗങ്ങളിൽ എത്തിക്കും. ഏത് ഉത്തരമാണ് ഉപയോഗിക്കുന്നതെന്ന് ഇത് തീരുമാനിക്കുന്നു — മറ്റേത് ഇപ്പോഴും കാണിക്കും, അതിനാൽ ഈ ഓവർറൈഡ് ഒരിക്കലും നിശ്ശബ്ദമല്ല.",
  "Scales it on the top bar and the home page.":
    "ടോപ്പ് ബാറിലും ഹോം പേജിലും ഇതിന്റെ വലുപ്പം ക്രമീകരിക്കുന്നു.",
  "Renaming this is safe — stored results keep their meaning.":
    "ഇത് പുനർനാമകരണം ചെയ്യുന്നത് സുരക്ഷിതമാണ് — സൂക്ഷിച്ച ഫലങ്ങൾ അവയുടെ അർത്ഥം നിലനിർത്തും.",
  "Derives a participant's category as they are added. Set each category's class and date-of-birth ranges on the Categories tab.":
    "പങ്കാളികളെ ചേർക്കുമ്പോൾ തന്നെ അവരുടെ വിഭാഗം കണ്ടെത്തുന്നു. ഓരോ വിഭാഗത്തിന്റെയും ക്ലാസ്, ജനനത്തീയതി പരിധികൾ വിഭാഗങ്ങൾ ടാബിൽ സെറ്റ് ചെയ്യുക.",
  "Forcing a mode hides the per-event choice — there is no point offering one that is overridden.":
    "ഒരു മോഡ് നിർബന്ധമാക്കുന്നത് ഓരോ ഇവന്റിനുമുള്ള തിരഞ്ഞെടുപ്പ് മറയ്ക്കും — അസാധുവാക്കപ്പെടുന്ന ഒന്ന് വാഗ്ദാനം ചെയ്യുന്നതിൽ അർത്ഥമില്ല.",
  "0 shows everyone.":
    "0 എന്നാൽ എല്ലാവരെയും കാണിക്കും.",
  "Shown to a House Manager when the group refuses an entry.":
    "ഗ്രൂപ്പ് ഒരു എൻട്രി നിരസിക്കുമ്പോൾ ഹൗസ് മാനേജർക്ക് കാണിക്കുന്നത്.",
  "The window opens automatically the moment a result is published, and closes itself — there is no separate switch to remember.":
    "ഒരു ഫലം പ്രസിദ്ധീകരിക്കുന്ന നിമിഷം വിൻഡോ സ്വയമേവ തുറക്കുകയും സ്വയം അടയുകയും ചെയ്യും — ഓർത്തിരിക്കേണ്ട പ്രത്യേക സ്വിച്ചൊന്നുമില്ല.",
  "How many appeals a house may have pending or upheld at once. An appeal that is Overturned stops counting, so a house that is right is never blocked from raising the next one.":
    "ഒരു ഹൗസിന് ഒരേസമയം എത്ര അപ്പീലുകൾ തീർപ്പാക്കാതെയോ അംഗീകരിച്ചോ വയ്ക്കാം എന്നത്. അസാധുവാക്കിയ അപ്പീൽ കണക്കാക്കുന്നത് നിർത്തും, അതിനാൽ ശരിയായ ഹൗസിന് അടുത്തത് ഉന്നയിക്കാൻ ഒരിക്കലും തടസ്സമുണ്ടാകില്ല.",
  "Rank 1 counts as the top 1, and so on.":
    "റാങ്ക് 1 എന്നത് ഏറ്റവും മുകളിലെ 1 ആയി കണക്കാക്കുന്നു, അങ്ങനെ തുടരും.",
  "How many qualifying entries a participant needs before they appear on this board at all.":
    "ഈ ബോർഡിൽ പ്രത്യക്ഷപ്പെടാൻ ഒരു പങ്കാളിക്ക് എത്ര യോഗ്യതാ എൻട്രികൾ വേണം എന്നത്.",
  "That participant is left off this board entirely, so the next scorer takes the top spot here. Only a board earlier in Sort order can be referenced.":
    "ആ പങ്കാളിയെ ഈ ബോർഡിൽ നിന്ന് പൂർണ്ണമായും ഒഴിവാക്കും, അതിനാൽ അടുത്ത സ്കോറർ ഇവിടെ ഒന്നാം സ്ഥാനത്തെത്തും. സോർട്ട് ക്രമത്തിൽ മുമ്പുള്ള ഒരു ബോർഡിനെ മാത്രമേ പരാമർശിക്കാൻ കഴിയൂ.",
  "Shown as the tab title.":
    "ടാബ് ശീർഷകമായി കാണിക്കുന്നു.",
  "Needed to remove your own login.":
    "നിങ്ങളുടെ സ്വന്തം ലോഗിൻ നീക്കം ചെയ്യാൻ ആവശ്യമാണ്.",
  "The separate password set for this action.":
    "ഈ പ്രവർത്തനത്തിനായി സെറ്റ് ചെയ്ത പ്രത്യേക പാസ്‌വേഡ്.",
  "The same separate password that guards a full reset.":
    "പൂർണ്ണമായ റീസെറ്റിനെ സംരക്ഷിക്കുന്ന അതേ പ്രത്യേക പാസ്‌വേഡ്.",
  "A link to the rules and regulations, shown as a download button on the public home page. Upload the PDF to Google Drive and paste the share link here — the file itself is not stored in the app, because Firestore caps a document at 1 MB and the free plan has no file storage. IMPORTANT: in Drive, set the file's sharing to “Anyone with the link”, or visitors will hit a request-access screen instead of the manual.":
    "നിയമങ്ങളിലേക്കും ചട്ടങ്ങളിലേക്കുമുള്ള ഒരു ലിങ്ക്, പൊതു ഹോം പേജിൽ ഡൗൺലോഡ് ബട്ടണായി കാണിക്കും. PDF ഗൂഗിൾ ഡ്രൈവിലേക്ക് അപ്‌ലോഡ് ചെയ്ത് ഷെയർ ലിങ്ക് ഇവിടെ ഒട്ടിക്കുക — ഫയൽ ആപ്പിൽ സൂക്ഷിക്കുന്നില്ല, കാരണം Firestore ഒരു ഡോക്യുമെന്റ് 1 MB ആയി പരിമിതപ്പെടുത്തുന്നു, സൗജന്യ പ്ലാനിൽ ഫയൽ സ്റ്റോറേജുമില്ല. പ്രധാനം: ഡ്രൈവിൽ ഫയലിന്റെ ഷെയറിംഗ് \"Anyone with the link\" ആയി സെറ്റ് ചെയ്യുക, അല്ലെങ്കിൽ സന്ദർശകർക്ക് മാനുവലിനുപകരം ആക്സസ് അഭ്യർത്ഥനാ സ്ക്രീൻ കാണും.",
  "One scale shared by all four event classes, highest first. A score that reaches no threshold takes the bottom grade below — including a genuine 0%, which is graded, not absent.":
    "നാല് ഇവന്റ് ക്ലാസുകളും പങ്കിടുന്ന ഒരൊറ്റ സ്കെയിൽ, ഏറ്റവും ഉയർന്നത് ആദ്യം. ഒരു പരിധിയിലും എത്താത്ത സ്കോർ താഴെയുള്ള ഏറ്റവും കുറഞ്ഞ ഗ്രേഡ് എടുക്കും — യഥാർത്ഥ 0% ഉൾപ്പെടെ, അത് ഗ്രേഡ് ചെയ്യപ്പെടുന്നു, ആബ്സന്റ് അല്ല.",
  "Points for each grade are set in Points & grades. Renaming a grade never changes what past results are worth; removing one that results already use is refused.":
    "ഓരോ ഗ്രേഡിനുമുള്ള പോയിന്റുകൾ പോയിന്റ്സ് & ഗ്രേഡ്സിൽ സെറ്റ് ചെയ്യുന്നു. ഒരു ഗ്രേഡ് പുനർനാമകരണം ചെയ്യുന്നത് പഴയ ഫലങ്ങളുടെ മൂല്യം മാറ്റില്ല; ഫലങ്ങൾ ഇതിനകം ഉപയോഗിക്കുന്ന ഒന്ന് നീക്കം ചെയ്യുന്നത് നിരസിക്കും.",
  "The default window for every event. An individual event can override it.":
    "എല്ലാ ഇവന്റിനുമുള്ള സ്ഥിരസ്ഥിതി വിൻഡോ. ഓരോ ഇവന്റിനും ഇത് മറികടക്കാം.",
  "Lets a House Manager add people to their own house only, during the window below. This is a separate window from event registration, because “who is in my house” and “which events they enter” usually close at different moments. Enforced in the security rules, not just hidden.":
    "താഴെയുള്ള വിൻഡോയിൽ ഹൗസ് മാനേജർക്ക് അവരുടെ സ്വന്തം ഹൗസിലേക്ക് മാത്രം ആളുകളെ ചേർക്കാൻ അനുവദിക്കുന്നു. ഇത് ഇവന്റ് രജിസ്ട്രേഷനിൽ നിന്ന് വ്യത്യസ്തമായ വിൻഡോയാണ്, കാരണം \"എന്റെ ഹൗസിൽ ആരൊക്കെ\" എന്നതും \"അവർ ഏത് ഇവന്റുകളിൽ പ്രവേശിക്കുന്നു\" എന്നതും സാധാരണയായി വ്യത്യസ്ത സമയങ്ങളിലാണ് അടയ്ക്കുന്നത്. ഇത് സെക്യൂരിറ്റി റൂളുകളിൽ നടപ്പാക്കുന്നു, വെറുതെ മറയ്ക്കുക മാത്രമല്ല.",
  "Adds a Contact tab to the public site. Only numbers ticked as public on each house (Accounts → edit a house) ever appear there — everything else stays staff-only, so an unticked number is not merely hidden but unreadable without a login.":
    "പൊതു സൈറ്റിലേക്ക് ഒരു കോൺടാക്റ്റ് ടാബ് ചേർക്കുന്നു. ഓരോ ഹൗസിലും (അക്കൗണ്ട്സ് → ഹൗസ് എഡിറ്റ് ചെയ്യുക) പൊതുവായി ടിക് ചെയ്ത നമ്പറുകൾ മാത്രമേ അവിടെ കാണൂ — മറ്റെല്ലാം സ്റ്റാഫിന് മാത്രമായി തുടരും, അതിനാൽ ടിക് ചെയ്യാത്ത നമ്പർ വെറുതെ മറച്ചതല്ല, ലോഗിൻ ഇല്ലാതെ വായിക്കാൻ കഴിയാത്തതാണ്.",
  "Adds a Messages area to every role's nav once turned on. An Admin or Co-Admin starts a personal or group conversation across any role; everyone already in one can reply. Nobody sees a conversation they were not added to.":
    "ഓണാക്കിയാൽ എല്ലാ റോളിന്റെയും നാവിഗേഷനിൽ ഒരു സന്ദേശ വിഭാഗം ചേർക്കുന്നു. ഒരു അഡ്മിനോ കോ-അഡ്മിനോ ഏത് റോളിലുമുള്ളവരുമായി വ്യക്തിഗതമോ ഗ്രൂപ്പോ സംഭാഷണം ആരംഭിക്കുന്നു; അതിലുള്ള എല്ലാവർക്കും മറുപടി നൽകാം. ചേർക്കാത്ത ഒരു സംഭാഷണം ആരും കാണില്ല.",
  "The grade is still worked out and shown; it is simply worth 0 points, so an event is decided by rank alone. This sets what a NEW event starts as. Events that already exist keep their own setting, because changing this must never quietly restate what an event was worth.":
    "ഗ്രേഡ് ഇപ്പോഴും കണക്കാക്കി കാണിക്കും; അതിന് 0 പോയിന്റ് മാത്രമേ വിലയുള്ളൂ, അതിനാൽ ഇവന്റ് റാങ്ക് കൊണ്ട് മാത്രം തീരുമാനിക്കപ്പെടും. ഒരു പുതിയ ഇവന്റ് എങ്ങനെ ആരംഭിക്കുന്നു എന്നതാണ് ഇത് നിശ്ചയിക്കുന്നത്. നിലവിലുള്ള ഇവന്റുകൾ അവയുടെ സ്വന്തം ക്രമീകരണം നിലനിർത്തും, കാരണം ഇത് മാറ്റുന്നത് ഒരു ഇവന്റിന്റെ മൂല്യം നിശ്ശബ്ദമായി മാറ്റാൻ പാടില്ല.",
  "Adds a minimum alongside the maximum on each event. Minimums never block a registration — a house is below its minimum for most of the registration period. They decide when an event counts as complete in the House Manager panel, and they appear in the compliance report. With this off, an event counts as complete once a house has entered at least one participant.":
    "ഓരോ ഇവന്റിലും പരമാവധിക്കൊപ്പം ഒരു കുറഞ്ഞ പരിധി ചേർക്കുന്നു. കുറഞ്ഞ പരിധികൾ ഒരിക്കലും രജിസ്ട്രേഷൻ തടയില്ല — രജിസ്ട്രേഷൻ കാലയളവിന്റെ ഭൂരിഭാഗവും ഒരു ഹൗസ് അതിന്റെ കുറഞ്ഞ പരിധിക്ക് താഴെയായിരിക്കും. ഹൗസ് മാനേജർ പാനലിൽ ഒരു ഇവന്റ് എപ്പോൾ പൂർത്തിയായി കണക്കാക്കും എന്ന് അവ തീരുമാനിക്കുന്നു, കംപ്ലയൻസ് റിപ്പോർട്ടിലും അവ കാണും. ഇത് ഓഫാണെങ്കിൽ, ഒരു ഹൗസ് ഒരു പങ്കാളിയെയെങ്കിലും ചേർത്താൽ ഇവന്റ് പൂർത്തിയായതായി കണക്കാക്കും.",
  "Age or grade groupings. Category events belong to exactly one; general events are open to all.":
    "പ്രായമോ ഗ്രേഡോ അനുസരിച്ചുള്ള ഗ്രൂപ്പിംഗുകൾ. വിഭാഗ ഇവന്റുകൾ കൃത്യമായി ഒന്നിൽ പെടുന്നു; ജനറൽ ഇവന്റുകൾ എല്ലാവർക്കുമായി തുറന്നിരിക്കുന്നു.",
  "Renaming is safe — events and participants keep pointing at this record, so nothing is orphaned.":
    "പുനർനാമകരണം സുരക്ഷിതമാണ് — ഇവന്റുകളും പങ്കാളികളും ഈ റെക്കോർഡിലേക്ക് തന്നെ ചൂണ്ടിക്കൊണ്ടിരിക്കും, അതിനാൽ ഒന്നും അനാഥമാകില്ല.",
  "How many placements the public sees on the results page, the home feed, the big screen and the slideshow. CSV and print exports always carry the full table, and staff screens always show everything.":
    "ഫലങ്ങളുടെ പേജ്, ഹോം ഫീഡ്, ബിഗ് സ്ക്രീൻ, സ്ലൈഡ്ഷോ എന്നിവയിൽ പൊതുജനങ്ങൾ എത്ര സ്ഥാനങ്ങൾ കാണും എന്നത്. CSV, പ്രിന്റ് എക്സ്പോർട്ടുകൾ എപ്പോഴും മുഴുവൻ പട്ടികയും വഹിക്കും, സ്റ്റാഫ് സ്ക്രീനുകൾ എപ്പോഴും എല്ലാം കാണിക്കും.",
  "With this off, a participant outside the ranked places sees only that they took part. Their rank is never written to the public record either way, so it cannot be read out of the page.":
    "ഇത് ഓഫാണെങ്കിൽ, റാങ്ക് ചെയ്ത സ്ഥാനങ്ങൾക്ക് പുറത്തുള്ള ഒരു പങ്കാളി അവർ പങ്കെടുത്തു എന്ന് മാത്രമേ കാണൂ. ഏത് സാഹചര്യത്തിലും അവരുടെ റാങ്ക് പൊതു രേഖയിൽ എഴുതുന്നില്ല, അതിനാൽ പേജിൽ നിന്ന് അത് വായിച്ചെടുക്കാൻ കഴിയില്ല.",
  "Public templates always let a visitor type a name. With this OFF (recommended), rank, grade and event fields stay blank, so nobody can print a certificate claiming a placement they did not win. Turning it on lets a visitor fill those in themselves.":
    "പൊതു ടെംപ്ലേറ്റുകൾ എപ്പോഴും ഒരു സന്ദർശകനെ പേര് ടൈപ്പ് ചെയ്യാൻ അനുവദിക്കുന്നു. ഇത് ഓഫാണെങ്കിൽ (ശുപാർശ ചെയ്യുന്നു), റാങ്ക്, ഗ്രേഡ്, ഇവന്റ് ഫീൽഡുകൾ ശൂന്യമായി തുടരും, അതിനാൽ നേടാത്ത ഒരു സ്ഥാനം അവകാശപ്പെട്ട് ആർക്കും സർട്ടിഫിക്കറ്റ് പ്രിന്റ് ചെയ്യാൻ കഴിയില്ല. ഇത് ഓണാക്കിയാൽ സന്ദർശകർക്ക് അവ സ്വയം പൂരിപ്പിക്കാം.",
  "Schedule times are wall-clock times where the fest is held. Used to decide whether an event is upcoming, ongoing or finished. Daylight saving is worked out per date, so a fest spanning a clock change stays correct.":
    "ഫെസ്റ്റ് നടക്കുന്ന സ്ഥലത്തെ ക്ലോക്ക് സമയമാണ് ഷെഡ്യൂൾ സമയങ്ങൾ. ഒരു ഇവന്റ് വരാനിരിക്കുന്നതോ നടക്കുന്നതോ കഴിഞ്ഞതോ എന്ന് തീരുമാനിക്കാൻ ഉപയോഗിക്കുന്നു. ഡേലൈറ്റ് സേവിംഗ് ഓരോ തീയതിക്കും കണക്കാക്കുന്നു, അതിനാൽ ക്ലോക്ക് മാറ്റം കടന്നുപോകുന്ന ഫെസ്റ്റും ശരിയായി തുടരും.",
  "Digits only: numbers are assigned automatically, either from each house's range or from one shared sequence. Alphanumerical and Alphabets only: add a house's first participant with the chest number typed in — for example RED-A01 — and every later one follows that pattern.":
    "അക്കങ്ങൾ മാത്രം: ഓരോ ഹൗസിന്റെയും പരിധിയിൽ നിന്നോ ഒരു പൊതു ക്രമത്തിൽ നിന്നോ നമ്പറുകൾ സ്വയമേവ നൽകുന്നു. ആൽഫാന്യൂമെറിക്കൽ, അക്ഷരങ്ങൾ മാത്രം: ഒരു ഹൗസിന്റെ ആദ്യ പങ്കാളിയെ ചെസ്റ്റ് നമ്പർ ടൈപ്പ് ചെയ്ത് ചേർക്കുക — ഉദാഹരണത്തിന് RED-A01 — പിന്നീടുള്ള എല്ലാവരും ആ പാറ്റേൺ പിന്തുടരും.",
  "Always on — this is the ladder every event uses unless it names a different source below.":
    "എപ്പോഴും ഓൺ — താഴെ മറ്റൊരു ഉറവിടം പറയാത്തിടത്തോളം എല്ലാ ഇവന്റും ഉപയോഗിക്കുന്ന ലാഡർ ഇതാണ്.",
  "Turn on Type & Tier classification first, on the Type & Tier tab.":
    "ആദ്യം ടൈപ്പ് & ടയർ ടാബിൽ ടൈപ്പ് & ടയർ ക്ലാസിഫിക്കേഷൻ ഓണാക്കുക.",
  "Every event class has its own rank ladder. This is the fallback used whenever an event's named point source has no ladder of its own.":
    "ഓരോ ഇവന്റ് ക്ലാസിനും അതിന്റേതായ റാങ്ക് ലാഡറുണ്ട്. ഒരു ഇവന്റിന്റെ നിർദ്ദിഷ്ട പോയിന്റ് ഉറവിടത്തിന് സ്വന്തമായി ലാഡർ ഇല്ലെങ്കിൽ ഉപയോഗിക്കുന്ന ബദലാണ് ഇത്.",
  "Leave grade points off to use the shared table below.":
    "താഴെയുള്ള പൊതു ടേബിൾ ഉപയോഗിക്കാൻ ഗ്രേഡ് പോയിന്റുകൾ ഓഫാക്കി വിടുക.",
  "With this off, every participant shares one set of limits. With it on, a participant is measured against their OWN category's limits — including in General events, which count towards the overall limit but never towards a category's class limits.":
    "ഇത് ഓഫാണെങ്കിൽ, എല്ലാ പങ്കാളികളും ഒരേ പരിധികൾ പങ്കിടും. ഓണാണെങ്കിൽ, ഒരു പങ്കാളിയെ അവരുടെ സ്വന്തം വിഭാഗത്തിന്റെ പരിധികളുമായി താരതമ്യം ചെയ്യും — ജനറൽ ഇവന്റുകളിലും, അവ മൊത്തത്തിലുള്ള പരിധിയിലേക്ക് കണക്കാക്കുമെങ്കിലും ഒരു വിഭാഗത്തിന്റെ ക്ലാസ് പരിധിയിലേക്ക് ഒരിക്കലും കണക്കാക്കില്ല.",
  "Caps that span two classes at once. Every cap in the hierarchy is checked, so the tightest one that applies is what blocks a registration — a combined cap can refuse an entry the individual class cap would have allowed, and the other way round.":
    "ഒരേസമയം രണ്ട് ക്ലാസുകളിൽ വ്യാപിക്കുന്ന പരിധികൾ. ശ്രേണിയിലെ എല്ലാ പരിധിയും പരിശോധിക്കുന്നു, അതിനാൽ ബാധകമായതിൽ ഏറ്റവും കർശനമായതാണ് ഒരു രജിസ്ട്രേഷൻ തടയുന്നത് — വ്യക്തിഗത ക്ലാസ് പരിധി അനുവദിക്കുമായിരുന്ന ഒരു എൻട്രി ഒരു സംയോജിത പരിധിക്ക് നിരസിക്കാൻ കഴിയും, മറിച്ചും.",
  "Counts EVERY programme of that Type the participant enters — including General ones. The limit value comes from their own category, so Junior and Senior can allow different numbers.":
    "ആ ടൈപ്പിലുള്ള എല്ലാ പ്രോഗ്രാമും പങ്കാളി പ്രവേശിക്കുന്നത് കണക്കാക്കുന്നു — ജനറൽ ഉൾപ്പെടെ. പരിധി മൂല്യം അവരുടെ സ്വന്തം വിഭാഗത്തിൽ നിന്നാണ് വരുന്നത്, അതിനാൽ ജൂനിയറിനും സീനിയറിനും വ്യത്യസ്ത എണ്ണം അനുവദിക്കാം.",
  "Existing counts were recorded under the old scheme, so they would become unreadable and a participant could exceed a cap without the app noticing. Recount rebuilds them from the actual registrations, then this will save.":
    "നിലവിലുള്ള എണ്ണങ്ങൾ പഴയ രീതിയിലാണ് രേഖപ്പെടുത്തിയത്, അതിനാൽ അവ വായിക്കാൻ കഴിയാതാകും, ആപ്പ് ശ്രദ്ധിക്കാതെ ഒരു പങ്കാളിക്ക് പരിധി കവിയാനും കഴിയും. റീകൗണ്ട് യഥാർത്ഥ രജിസ്ട്രേഷനുകളിൽ നിന്ന് അവ പുനർനിർമ്മിക്കും, അതിനുശേഷം ഇത് സേവ് ആകും.",
  "The Student Talent leaderboard always counts Category Individual points. Add other pools here.":
    "സ്റ്റുഡന്റ് ടാലന്റ് ലീഡർബോർഡ് എപ്പോഴും കാറ്റഗറി ഇൻഡിവിജ്വൽ പോയിന്റുകൾ കണക്കാക്കുന്നു. മറ്റ് പൂളുകൾ ഇവിടെ ചേർക്കുക.",
  "When two participants tie, these pools are compared in order until the tie breaks. Only pools left out of the score above can serve as tiebreakers.":
    "രണ്ട് പങ്കാളികൾ ടൈ ആകുമ്പോൾ, ടൈ തീരുന്നതുവരെ ഈ പൂളുകൾ ക്രമത്തിൽ താരതമ്യം ചെയ്യുന്നു. മുകളിലെ സ്കോറിൽ നിന്ന് ഒഴിവാക്കിയ പൂളുകൾക്ക് മാത്രമേ ടൈബ്രേക്കറായി പ്രവർത്തിക്കാൻ കഴിയൂ.",
  "Rename the two built-in boards. Leave blank to keep the default name shown in each box.":
    "അന്തർനിർമ്മിത രണ്ട് ബോർഡുകൾ പുനർനാമകരണം ചെയ്യുക. ഓരോ ബോക്സിലും കാണിക്കുന്ന സ്ഥിരസ്ഥിതി പേര് നിലനിർത്താൻ ശൂന്യമായി വിടുക.",
  "“Maximum earnable” is the best possible score across every General event plus every Category event in a category the house actually has a participant in — not every event in the fest. A house fielding only Seniors and Juniors is judged only against what it could plausibly enter. Costs an extra read of the whole participant list on every republish, so it stays off (points-only) unless you turn it on.":
    "\"പരമാവധി നേടാവുന്നത്\" എന്നത് എല്ലാ ജനറൽ ഇവന്റുകളിലും ഹൗസിന് യഥാർത്ഥത്തിൽ പങ്കാളിയുള്ള വിഭാഗങ്ങളിലെ എല്ലാ കാറ്റഗറി ഇവന്റുകളിലും ഉള്ള ഏറ്റവും മികച്ച സാധ്യമായ സ്കോറാണ് — ഫെസ്റ്റിലെ എല്ലാ ഇവന്റുകളുമല്ല. സീനിയേഴ്സിനെയും ജൂനിയേഴ്സിനെയും മാത്രം ഇറക്കുന്ന ഒരു ഹൗസിനെ അതിന് പ്രവേശിക്കാൻ കഴിയുന്നതുമായി മാത്രമേ താരതമ്യം ചെയ്യൂ. ഓരോ റീപബ്ലിഷിലും മുഴുവൻ പങ്കാളി പട്ടികയുടെയും ഒരു അധിക റീഡ് ചെലവാകും, അതിനാൽ നിങ്ങൾ ഓണാക്കാത്തിടത്തോളം ഇത് ഓഫായി (പോയിന്റ് മാത്രം) തുടരും.",
  "Extra named boards — “Best in Speech”, “Grade 1 champions”. Each one re-tallies points already awarded, so it always reconciles with the main standings. Mark a board public and it appears as its own tab on the results page.":
    "അധിക പേരുള്ള ബോർഡുകൾ — \"ബെസ്റ്റ് ഇൻ സ്പീച്ച്\", \"ഗ്രേഡ് 1 ചാമ്പ്യൻസ്\". ഓരോന്നും ഇതിനകം നൽകിയ പോയിന്റുകൾ വീണ്ടും കണക്കാക്കുന്നു, അതിനാൽ അത് എപ്പോഴും പ്രധാന സ്റ്റാൻഡിംഗുമായി യോജിക്കും. ഒരു ബോർഡ് പൊതുവായി അടയാളപ്പെടുത്തിയാൽ അത് ഫലങ്ങളുടെ പേജിൽ അതിന്റേതായ ടാബായി പ്രത്യക്ഷപ്പെടും.",
  "Select nothing on an axis to include everything on it. Selections across axes combine — Type: Speech AND Tier: Grade 1 means events that are both.":
    "ഒരു അക്‌സിലെ എല്ലാം ഉൾപ്പെടുത്താൻ അതിൽ ഒന്നും തിരഞ്ഞെടുക്കാതിരിക്കുക. അക്‌സുകളിലുടനീളമുള്ള തിരഞ്ഞെടുപ്പുകൾ കൂടിച്ചേരും — ടൈപ്പ്: സ്പീച്ച് ഒപ്പം ടയർ: ഗ്രേഡ് 1 എന്നാൽ രണ്ടും ആയ ഇവന്റുകൾ.",
  "Clear one part of the fest and keep the rest. The fest itself, every account and your own login all stay — only the data named is removed. Each of these still needs your delete-everything password.":
    "ഫെസ്റ്റിന്റെ ഒരു ഭാഗം മാത്രം മായ്ച്ച് ബാക്കി നിലനിർത്തുക. ഫെസ്റ്റും എല്ലാ അക്കൗണ്ടുകളും നിങ്ങളുടെ സ്വന്തം ലോഗിനും അതേപടി തുടരും — പറഞ്ഞിരിക്കുന്ന ഡാറ്റ മാത്രമേ നീക്കം ചെയ്യൂ. ഇവയ്‌ക്കോരോന്നിനും നിങ്ങളുടെ ഡിലീറ്റ്-എവരിതിംഗ് പാസ്‌വേഡ് വേണം.",
  "One limitation worth knowing: revoked House, Judge and Co-Admin logins are disabled immediately, but the underlying account entries still show up under Firebase console → Authentication until you delete them there by hand. They cannot sign in to anything once this finishes — they are just not swept away automatically. The browser is only ever allowed to delete the account currently signed in, which is why your own Admin login can be removed completely but theirs cannot.":
    "അറിഞ്ഞിരിക്കേണ്ട ഒരു പരിമിതി: റദ്ദാക്കിയ ഹൗസ്, ജഡ്ജ്, കോ-അഡ്മിൻ ലോഗിനുകൾ ഉടനടി പ്രവർത്തനരഹിതമാകും, പക്ഷേ അടിസ്ഥാന അക്കൗണ്ട് എൻട്രികൾ നിങ്ങൾ കൈകൊണ്ട് ഇല്ലാതാക്കുന്നതുവരെ Firebase കൺസോൾ → Authentication-ൽ കാണും. ഇത് പൂർത്തിയായാൽ അവർക്ക് ഒന്നിലും സൈൻ ഇൻ ചെയ്യാൻ കഴിയില്ല — അവ സ്വയമേവ നീക്കം ചെയ്യപ്പെടുന്നില്ല എന്ന് മാത്രം. നിലവിൽ സൈൻ ഇൻ ചെയ്ത അക്കൗണ്ട് ഇല്ലാതാക്കാൻ മാത്രമേ ബ്രൗസറിന് അനുവാദമുള്ളൂ, അതുകൊണ്ടാണ് നിങ്ങളുടെ അഡ്മിൻ ലോഗിൻ പൂർണ്ണമായും നീക്കം ചെയ്യാൻ കഴിയുന്നത്, അവരുടേത് കഴിയാത്തതും.",
  "Changing this needs the current delete-everything password.":
    "ഇത് മാറ്റാൻ നിലവിലെ ഡിലീറ്റ്-എവരിതിംഗ് പാസ്‌വേഡ് വേണം.",
  "No winner chosen yet — save the title as-is and assign one later by editing it.":
    "ഇതുവരെ വിജയിയെ തിരഞ്ഞെടുത്തിട്ടില്ല — ടൈറ്റിൽ ഇപ്പോഴത്തെ നിലയിൽ സേവ് ചെയ്ത് പിന്നീട് എഡിറ്റ് ചെയ്ത് ഒരാളെ നിയോഗിക്കുക.",
  "Why this title, and how it was decided. Shown wherever the title appears.":
    "എന്തുകൊണ്ട് ഈ ടൈറ്റിൽ, എങ്ങനെ തീരുമാനിച്ചു എന്നത്. ടൈറ്റിൽ കാണിക്കുന്നിടത്തെല്ലാം ഇത് കാണിക്കും.",
  "No days yet.":
    "ഇതുവരെ ദിവസങ്ങളൊന്നുമില്ല.",
  "No venues yet.":
    "ഇതുവരെ വേദികളൊന്നുമില്ല.",
  "Days are listed in date order, earliest first.":
    "ദിവസങ്ങൾ തീയതി ക്രമത്തിൽ, ആദ്യത്തേത് മുന്നിൽ, പട്ടികപ്പെടുത്തുന്നു.",
  "Shown to the public. Blank uses the date.":
    "പൊതുജനങ്ങൾക്ക് കാണിക്കുന്നു. ശൂന്യമെങ്കിൽ തീയതി ഉപയോഗിക്കും.",
  "Each day can open at a different time. Slots follow on from it.":
    "ഓരോ ദിവസവും വ്യത്യസ്ത സമയത്ത് ആരംഭിക്കാം. സ്ലോട്ടുകൾ അതിൽ നിന്ന് തുടരും.",
  "Shown on the schedule and the print sheet. Blank reads simply as Break.":
    "ഷെഡ്യൂളിലും പ്രിന്റ് ഷീറ്റിലും കാണിക്കുന്നു. ശൂന്യമെങ്കിൽ വെറും ബ്രേക്ക് എന്ന് വായിക്കും.",
  "Only events with no slot of their own are listed, plus the one already here.":
    "സ്വന്തമായി സ്ലോട്ട് ഇല്ലാത്ത ഇവന്റുകൾ മാത്രമേ പട്ടികപ്പെടുത്തൂ, ഇതിനകം ഇവിടെയുള്ളതും.",
  "Everything after this slot shifts by the difference.":
    "ഈ സ്ലോട്ടിന് ശേഷമുള്ളതെല്ലാം വ്യത്യാസത്തിനനുസരിച്ച് മാറും.",
  "Someone is needed in two places at once. This is a warning, not a block — overlaps are sometimes deliberate, and only you know whether that person is excused.":
    "ഒരാളെ ഒരേസമയം രണ്ടിടത്ത് ആവശ്യമുണ്ട്. ഇതൊരു മുന്നറിയിപ്പാണ്, തടസ്സമല്ല — ഓവർലാപ്പുകൾ ചിലപ്പോൾ മനഃപൂർവ്വമാണ്, ആ വ്യക്തിക്ക് ഇളവുണ്ടോ എന്ന് നിങ്ങൾക്ക് മാത്രമേ അറിയൂ.",
  "Add each day of the fest. Days are always listed in date order.":
    "ഫെസ്റ്റിന്റെ ഓരോ ദിവസവും ചേർക്കുക. ദിവസങ്ങൾ എപ്പോഴും തീയതി ക്രമത്തിൽ പട്ടികപ്പെടുത്തും.",
  "A venue is a stage. The same venue can run on several days, each with its own start time.":
    "ഒരു വേദി എന്നത് ഒരു സ്റ്റേജാണ്. ഒരേ വേദി പല ദിവസങ്ങളിൽ പ്രവർത്തിക്കാം, ഓരോന്നിനും അതിന്റേതായ ആരംഭ സമയത്തോടെ.",
  "Each slot follows the previous one. Change a duration and everything after it shifts.":
    "ഓരോ സ്ലോട്ടും മുമ്പത്തേതിന് ശേഷം വരും. ഒരു ദൈർഘ്യം മാറ്റിയാൽ അതിനുശേഷമുള്ളതെല്ലാം മാറും.",
  "Moving a slot puts it at the end of the running order at its destination.":
    "ഒരു സ്ലോട്ട് നീക്കുന്നത് അതിനെ ലക്ഷ്യസ്ഥാനത്തെ റണ്ണിംഗ് ഓർഡറിന്റെ അവസാനത്തിൽ എത്തിക്കും.",
  "Each row is one person needed in two places at once. Fix by moving a slot, or ignore it if that person is not actually required at both.":
    "ഓരോ വരിയും ഒരേസമയം രണ്ടിടത്ത് ആവശ്യമുള്ള ഒരാളാണ്. ഒരു സ്ലോട്ട് നീക്കി പരിഹരിക്കുക, അല്ലെങ്കിൽ ആ വ്യക്തി രണ്ടിടത്തും ശരിക്കും ആവശ്യമില്ലെങ്കിൽ അവഗണിക്കുക.",
  "Only numbers the organisers chose to publish appear here.":
    "സംഘാടകർ പ്രസിദ്ധീകരിക്കാൻ തിരഞ്ഞെടുത്ത നമ്പറുകൾ മാത്രമേ ഇവിടെ കാണൂ.",
  "Attach a screenshot showing the appeal fee was paid.":
    "അപ്പീൽ ഫീസ് അടച്ചതായി കാണിക്കുന്ന ഒരു സ്ക്രീൻഷോട്ട് അറ്റാച്ച് ചെയ്യുക.",
  "Required. Explain what is being disputed.":
    "നിർബന്ധം. എന്താണ് തർക്കവിഷയമെന്ന് വിശദീകരിക്കുക.",
  "Optional — a Drive or YouTube link, if there is one.":
    "ഐച്ഛികം — ഉണ്ടെങ്കിൽ ഒരു ഡ്രൈവ് അല്ലെങ്കിൽ യൂട്യൂബ് ലിങ്ക്.",
  "Why this substitution is needed — shown to the Admin reviewing it.":
    "ഈ സബ്സ്റ്റിറ്റ്യൂഷൻ എന്തുകൊണ്ട് ആവശ്യമാണ് — ഇത് അവലോകനം ചെയ്യുന്ന അഡ്മിന് കാണിക്കും.",
  "You can add people to your own house while this window is open. Chest numbers are allocated automatically.":
    "ഈ വിൻഡോ തുറന്നിരിക്കുമ്പോൾ നിങ്ങളുടെ സ്വന്തം ഹൗസിലേക്ക് ആളുകളെ ചേർക്കാം. ചെസ്റ്റ് നമ്പറുകൾ സ്വയമേവ അനുവദിക്കും.",
  "The chest number is allocated automatically from your house's range or the shared sequence.":
    "നിങ്ങളുടെ ഹൗസിന്റെ പരിധിയിൽ നിന്നോ പൊതു ക്രമത്തിൽ നിന്നോ ചെസ്റ്റ് നമ്പർ സ്വയമേവ അനുവദിക്കും.",
  "Pick who you are, then enter your password. There are no usernames.":
    "നിങ്ങൾ ആരാണെന്ന് തിരഞ്ഞെടുത്ത് പാസ്‌വേഡ് നൽകുക. യൂസർനെയിമുകളില്ല.",
  "Not registered for any event yet.":
    "ഇതുവരെ ഒരു ഇവന്റിലും രജിസ്റ്റർ ചെയ്തിട്ടില്ല.",
  "Type at least two characters.":
    "കുറഞ്ഞത് രണ്ട് അക്ഷരങ്ങൾ ടൈപ്പ് ചെയ്യുക.",
  "No messages yet — say hello.":
    "ഇതുവരെ സന്ദേശങ്ങളൊന്നുമില്ല — ഒരു ഹലോ പറയൂ.",
  "No placements to show.":
    "കാണിക്കാൻ സ്ഥാനങ്ങളൊന്നുമില്ല.",
  "Ranked by points earned as a share of the most that house could plausibly have earned — not by raw points.":
    "ആ ഹൗസിന് യുക്തിസഹമായി നേടാമായിരുന്ന ഏറ്റവും ഉയർന്ന തുകയുടെ അനുപാതമായി നേടിയ പോയിന്റുകൾ അനുസരിച്ച് റാങ്ക് ചെയ്തത് — അസംസ്കൃത പോയിന്റുകൾ അനുസരിച്ചല്ല.",
  "The leading total in each category is shown in bold. General events are counted in their own column, so the category columns and General add up to the total.":
    "ഓരോ വിഭാഗത്തിലെയും മുന്നിട്ടുനിൽക്കുന്ന തുക കട്ടിയുള്ള അക്ഷരത്തിൽ കാണിക്കുന്നു. ജനറൽ ഇവന്റുകൾ അവയുടേതായ കോളത്തിൽ കണക്കാക്കുന്നു, അതിനാൽ വിഭാഗ കോളങ്ങളും ജനറലും കൂടി ആകെത്തുകയാകും.",
  "Different from your Admin password.":
    "നിങ്ങളുടെ അഡ്മിൻ പാസ്‌വേഡിൽ നിന്ന് വ്യത്യസ്തം.",
  "You log in as Admin with this password alone — there is no username. Write it down; there is no email reset.":
    "ഈ പാസ്‌വേഡ് കൊണ്ട് മാത്രം നിങ്ങൾ അഡ്മിനായി ലോഗിൻ ചെയ്യും — യൂസർനെയിം ഇല്ല. ഇത് എഴുതിവയ്ക്കുക; ഇമെയിൽ റീസെറ്റ് ഇല്ല.",
  "Schedule times are wall-clock times where the fest is held. This is used to decide whether an event is upcoming, ongoing or finished, so a spectator in another country still sees the right thing. Daylight saving is handled automatically.":
    "ഫെസ്റ്റ് നടക്കുന്ന സ്ഥലത്തെ ക്ലോക്ക് സമയമാണ് ഷെഡ്യൂൾ സമയങ്ങൾ. ഒരു ഇവന്റ് വരാനിരിക്കുന്നതോ നടക്കുന്നതോ കഴിഞ്ഞതോ എന്ന് തീരുമാനിക്കാൻ ഇത് ഉപയോഗിക്കുന്നു, അതിനാൽ മറ്റൊരു രാജ്യത്തെ കാഴ്ചക്കാരനും ശരിയായത് കാണും. ഡേലൈറ്റ് സേവിംഗ് സ്വയമേവ കൈകാര്യം ചെയ്യുന്നു.",
  "A SEPARATE password, required before the Danger Zone will wipe the fest. Worth knowing what this does and does not do: it stops an unattended machine and a misclick. It does not stop someone already signed in as Admin who is determined to bypass it in the browser — there is no server here to enforce that. Use it as a safety catch, not a lock.":
    "ഡേഞ്ചർ സോൺ ഫെസ്റ്റ് മായ്ക്കുന്നതിന് മുമ്പ് ആവശ്യമായ ഒരു പ്രത്യേക പാസ്‌വേഡ്. ഇത് എന്ത് ചെയ്യുന്നു, എന്ത് ചെയ്യുന്നില്ല എന്നറിയേണ്ടതുണ്ട്: ഇത് ശ്രദ്ധിക്കാതെ വിട്ട ഒരു മെഷീനെയും ഒരു തെറ്റായ ക്ലിക്കിനെയും തടയും. ബ്രൗസറിൽ ഇത് മറികടക്കാൻ തീരുമാനിച്ച, ഇതിനകം അഡ്മിനായി സൈൻ ഇൻ ചെയ്ത ഒരാളെ ഇത് തടയില്ല — അത് നടപ്പാക്കാൻ ഇവിടെ ഒരു സെർവറില്ല. ഇതൊരു പൂട്ടായിട്ടല്ല, ഒരു സുരക്ഷാ കൊളുത്തായി ഉപയോഗിക്കുക.",
  "Ticking an entry on stage is a running-order aid only. It is not an absence — if somebody does not turn up, a judge or an Admin marks them Absent, which is what actually affects their result.":
    "സ്റ്റേജിൽ ഒരു എൻട്രി ടിക് ചെയ്യുന്നത് റണ്ണിംഗ് ഓർഡറിനുള്ള ഒരു സഹായം മാത്രമാണ്. അതൊരു ആബ്സൻസ് അല്ല — ആരെങ്കിലും വന്നില്ലെങ്കിൽ, ഒരു ജഡ്ജിയോ അഡ്മിനോ അവരെ ആബ്സന്റ് ആയി അടയാളപ്പെടുത്തും, അതാണ് അവരുടെ ഫലത്തെ യഥാർത്ഥത്തിൽ ബാധിക്കുന്നത്.",

  /* ── Added in the sweep that made el() translate every .hint ─────────
   * Until then only hint() reached tr(), so most explanation text was
   * built as el("div.hint", {text}) and never looked up at all. These are
   * the strings that had no entry yet.
   */
  "This event's own rank ladder, worth more or less than its class/stage/type/tier default.":
    "ഈ ഇവന്റിന്റെ സ്വന്തം റാങ്ക് ലാഡർ, അതിന്റെ ക്ലാസ്/സ്റ്റേജ്/ടൈപ്പ്/ടയർ ഡിഫോൾട്ടിനെക്കാൾ കൂടുതലോ കുറവോ വിലയുള്ളത്.",
  "Leave off to use the shared grade table.":
    "പൊതു ഗ്രേഡ് ടേബിൾ ഉപയോഗിക്കാൻ ഇത് ഒഴിവാക്കുക.",
  "Every event — set on the Schedule screen":
    "എല്ലാ ഇവന്റും — ഷെഡ്യൂൾ സ്ക്രീനിൽ സജ്ജമാക്കുന്നു",
  "Find an event and print its results board on its own. Uses its real published results.":
    "ഒരു ഇവന്റ് കണ്ടെത്തി അതിന്റെ റിസൾട്ട് ബോർഡ് വെവ്വേറെ പ്രിന്റ് ചെയ്യുക. അതിന്റെ യഥാർഥ പ്രസിദ്ധീകരിച്ച ഫലങ്ങളാണ് ഉപയോഗിക്കുന്നത്.",
  "Code letters are locked — a score has already been recorded, so reassigning them would detach it from the wrong entry. Unfinalize the event first if a correction is genuinely needed.":
    "കോഡ് ലെറ്ററുകൾ ലോക്ക് ചെയ്തിരിക്കുന്നു — ഒരു സ്കോർ ഇതിനകം രേഖപ്പെടുത്തിക്കഴിഞ്ഞു, അതിനാൽ അവ വീണ്ടും നൽകിയാൽ ആ സ്കോർ തെറ്റായ എൻട്രിയുമായി വേർപെടും. ശരിക്കും ഒരു തിരുത്തൽ വേണമെങ്കിൽ ആദ്യം ഇവന്റ് അൺഫൈനലൈസ് ചെയ്യുക.",
  "Judge assignment is locked while this event has a result — Unfinalize it first to add or remove one.":
    "ഈ ഇവന്റിന് ഒരു ഫലം ഉള്ളിടത്തോളം ജഡ്ജ് നിയമനം ലോക്ക് ചെയ്തിരിക്കുന്നു — ഒരാളെ ചേർക്കാനോ ഒഴിവാക്കാനോ ആദ്യം അത് അൺഫൈനലൈസ് ചെയ്യുക.",
  "Pick the house this entry is for. The same participant limits and category rules apply as when the House Manager registers directly.":
    "ഈ എൻട്രി ഏത് ഹൗസിന് വേണ്ടിയാണെന്ന് തിരഞ്ഞെടുക്കുക. ഹൗസ് മാനേജർ നേരിട്ട് രജിസ്റ്റർ ചെയ്യുമ്പോഴുള്ള അതേ പങ്കാളി പരിധികളും വിഭാഗ നിയമങ്ങളും ഇവിടെയും ബാധകമാണ്.",
  "Lets that role add entries for a house's own participants, same as the House Manager can. The House Manager's panel shows this is switched on. Turned on BEFORE registration has started — no entry exists yet and the window above has not opened — it simply works, and entries register directly like a House Manager's own. Turned on AFTER registration has started, each House Manager is asked once whether staff may register for them: one decision about the permission, not one per event. A house that agrees is then registered for directly; a house that has not answered blocks only itself, and one that declines cannot be overridden.":
    "ഹൗസ് മാനേജർക്ക് കഴിയുന്നതുപോലെ, ഒരു ഹൗസിന്റെ സ്വന്തം പങ്കാളികൾക്കായി എൻട്രികൾ ചേർക്കാൻ ആ റോളിനെ അനുവദിക്കുന്നു. ഇത് ഓണാണെന്ന് ഹൗസ് മാനേജറുടെ പാനലിൽ കാണിക്കും. രജിസ്ട്രേഷൻ തുടങ്ങുന്നതിന് മുമ്പ് ഓൺ ചെയ്താൽ — ഒരു എൻട്രിയും ഇല്ല, മുകളിലെ വിൻഡോ തുറന്നിട്ടുമില്ല — ഇത് നേരിട്ട് പ്രവർത്തിക്കും, ഹൗസ് മാനേജറുടേത് പോലെ എൻട്രികൾ നേരിട്ട് രജിസ്റ്റർ ആകും. രജിസ്ട്രേഷൻ തുടങ്ങിയ ശേഷം ഓൺ ചെയ്താൽ, സ്റ്റാഫിന് തങ്ങൾക്ക് വേണ്ടി രജിസ്റ്റർ ചെയ്യാമോ എന്ന് ഓരോ ഹൗസ് മാനേജറോടും ഒരിക്കൽ ചോദിക്കും: ഓരോ ഇവന്റിനും അല്ല, അനുമതിയെക്കുറിച്ച് ഒരൊറ്റ തീരുമാനം. സമ്മതിക്കുന്ന ഹൗസിന് വേണ്ടി പിന്നീട് നേരിട്ട് രജിസ്റ്റർ ചെയ്യാം; മറുപടി നൽകാത്ത ഹൗസ് അതിനെ മാത്രമേ തടയൂ, നിരസിക്കുന്ന ഒന്നിനെ മറികടക്കാനുമാവില്ല.",
  "A plain public list — an Admin, Co-Admin or anyone else the fest wants reachable. Everything here is published as typed; there is no separate public/private tick like a house's numbers have, because this list exists specifically to be shown. Appears on the public Contact page once that is switched on above.":
    "ഒരു ലളിതമായ പൊതു പട്ടിക — അഡ്മിൻ, കോ-അഡ്മിൻ, അല്ലെങ്കിൽ ഫെസ്റ്റിന് ബന്ധപ്പെടാൻ വേണ്ട മറ്റാരെങ്കിലും. ഇവിടെ ടൈപ്പ് ചെയ്യുന്നതെല്ലാം അതേപടി പ്രസിദ്ധീകരിക്കും; ഹൗസിന്റെ നമ്പറുകൾക്കുള്ളതുപോലെ പൊതു/സ്വകാര്യ ടിക് ഇവിടെയില്ല, കാരണം ഈ പട്ടിക കാണിക്കാൻ വേണ്ടി തന്നെയുള്ളതാണ്. മുകളിൽ അത് ഓൺ ചെയ്താൽ പൊതു കോൺടാക്റ്റ് പേജിൽ ഇത് കാണാം.",
  "No public contacts added yet.":
    "പൊതു കോൺടാക്റ്റുകളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല.",
  "The combined Student Talent slide always shows. Switching this on adds one further slide per category, matching the Student Talent tab on the public results page.":
    "സംയോജിത സ്റ്റുഡന്റ് ടാലന്റ് സ്ലൈഡ് എപ്പോഴും കാണിക്കും. ഇത് ഓൺ ചെയ്താൽ ഓരോ വിഭാഗത്തിനും ഒരു സ്ലൈഡ് കൂടി ചേരും, പൊതു ഫല പേജിലെ സ്റ്റുഡന്റ് ടാലന്റ് ടാബിന് അനുസൃതമായി.",
  "On by default. Turn off for a fest that charges no appeal fee — the House Manager can then file an appeal without attaching anything.":
    "സ്ഥിരസ്ഥിതിയായി ഓണാണ്. അപ്പീൽ ഫീസ് ഈടാക്കാത്ത ഫെസ്റ്റിന് ഇത് ഓഫ് ചെയ്യുക — അപ്പോൾ ഒന്നും ഘടിപ്പിക്കാതെ ഹൗസ് മാനേജർക്ക് അപ്പീൽ നൽകാം.",
  "Guarded by the delete-everything password too — the same one Danger Zone asks for. Anyone who could change the Admin password could otherwise lock the real Admin out.":
    "എല്ലാം മായ്ക്കാനുള്ള പാസ്‌വേഡും ഇതിന് സംരക്ഷണമാണ് — ഡേഞ്ചർ സോൺ ചോദിക്കുന്ന അതേ പാസ്‌വേഡ്. അല്ലാത്തപക്ഷം അഡ്മിൻ പാസ്‌വേഡ് മാറ്റാൻ കഴിയുന്ന ആർക്കും യഥാർഥ അഡ്മിനെ പുറത്താക്കാൻ കഴിയുമായിരുന്നു.",
  "Nobody assigned to this venue on this day yet.":
    "ഈ ദിവസം ഈ വേദിയിലേക്ക് ഇതുവരെ ആരെയും നിയമിച്ചിട്ടില്ല.",
  "Create a Stage Manager account under Accounts first.":
    "ആദ്യം അക്കൗണ്ട്സിൽ ഒരു സ്റ്റേജ് മാനേജർ അക്കൗണ്ട് ഉണ്ടാക്കുക.",
  "Checked against this person's other assignments on the same day, in any venue — they cannot be in two places at once.":
    "അതേ ദിവസം ഏത് വേദിയിലും ഈ വ്യക്തിക്കുള്ള മറ്റ് നിയമനങ്ങളുമായി ഒത്തുനോക്കുന്നു — ഒരേ സമയം രണ്ടിടത്ത് അവർക്ക് ഉണ്ടാകാനാവില്ല.",
  "No event uses a different window from the fest-wide ones above.":
    "മുകളിലുള്ള ഫെസ്റ്റ് വ്യാപക വിൻഡോയിൽ നിന്ന് വ്യത്യസ്തമായ വിൻഡോ ഒരു ഇവന്റും ഉപയോഗിക്കുന്നില്ല.",
  "The default for every event — an individual event below may override it.":
    "എല്ലാ ഇവന്റിനുമുള്ള സ്ഥിരസ്ഥിതി — താഴെയുള്ള ഒരു പ്രത്യേക ഇവന്റിന് ഇത് മറികടക്കാം.",
  "Opens your browser's print window. Choose \"Save as PDF\" as the destination.":
    "നിങ്ങളുടെ ബ്രൗസറിന്റെ പ്രിന്റ് വിൻഡോ തുറക്കുന്നു. ലക്ഷ്യസ്ഥാനമായി \"Save as PDF\" തിരഞ്ഞെടുക്കുക.",

  /* Short status words and loading lines. Small, but they sit beside the
   * sentences above and reading half a line in each language is worse than
   * reading either one. */
  "No match.": "പൊരുത്തമൊന്നുമില്ല.",
  "Preview unavailable.": "പ്രിവ്യൂ ലഭ്യമല്ല.",
  "Loading…": "ലോഡ് ചെയ്യുന്നു…",
  "Loading events…": "ഇവന്റുകൾ ലോഡ് ചെയ്യുന്നു…",
  "Searching…": "തിരയുന്നു…",
  "Starting…": "ആരംഭിക്കുന്നു…",
  "Whole team": "മുഴുവൻ ടീം",
  "Participated": "പങ്കെടുത്തു",
  "Unpublish first": "ആദ്യം അൺപബ്ലിഷ് ചെയ്യുക",
  "hidden while blind": "ബ്ലൈൻഡ് ജഡ്ജിംഗിൽ മറച്ചിരിക്കുന്നു",
  "unscheduled": "ഷെഡ്യൂൾ ചെയ്തിട്ടില്ല",
  "not published": "പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "not set yet": "ഇതുവരെ സജ്ജമാക്കിയിട്ടില്ല",
  "not yet": "ഇതുവരെ ഇല്ല",
  "overridden": "മറികടന്നു",
  "remark": "അഭിപ്രായം",
  "shared": "പൊതുവായത്",
  "total points": "ആകെ പോയിന്റ്",
  "talent board": "ടാലന്റ് ബോർഡ്",
  "This account keeps its name and all its data. Only the password changes. Tell them the new one directly — nothing is emailed.":
    "ഈ അക്കൗണ്ടിന്റെ പേരും എല്ലാ ഡാറ്റയും അതേപടി നിലനിൽക്കും. പാസ്‌വേഡ് മാത്രമേ മാറുന്നുള്ളൂ. പുതിയത് അവരോട് നേരിട്ട് പറയുക — ഒന്നും ഇമെയിൽ ചെയ്യുന്നില്ല.",
  "An organiser has to approve this before it takes effect.":
    "ഇത് പ്രാബല്യത്തിൽ വരുന്നതിന് മുമ്പ് ഒരു സംഘാടകൻ അംഗീകരിക്കണം.",
  /* ── notice() and empty() ────────────────────────────────────────────
   * Boxed alerts and empty-state messages. Same explanatory prose as a
   * hint, so they translate too — notice() sets textContent directly and
   * empty() builds its own children, which is why neither reached tr()
   * through el()'s .hint rule.
   */
  "Not available for your account": "നിങ്ങളുടെ അക്കൗണ്ടിന് ലഭ്യമല്ല",
  "Not available": "ലഭ്യമല്ല",
  "This section is Admin-only.": "ഈ ഭാഗം അഡ്മിന് മാത്രമുള്ളതാണ്.",
  "Page not found": "പേജ് കണ്ടെത്തിയില്ല",
  "That address does not exist.": "ആ വിലാസം നിലവിലില്ല.",
  "Each person logs in by picking their name from a dropdown and typing a password. Nobody needs an email address.":
    "ഓരോരുത്തരും ഡ്രോപ്പ്ഡൗണിൽ നിന്ന് തങ്ങളുടെ പേര് തിരഞ്ഞെടുത്ത് പാസ്‌വേഡ് നൽകിയാണ് ലോഗിൻ ചെയ്യുന്നത്. ആർക്കും ഇമെയിൽ വിലാസം ആവശ്യമില്ല.",
  "This person has no login yet. Setting a password here creates one.":
    "ഈ വ്യക്തിക്ക് ഇതുവരെ ലോഗിൻ ഇല്ല. ഇവിടെ പാസ്‌വേഡ് നൽകിയാൽ ഒന്ന് ഉണ്ടാക്കും.",
  "No accounts of this type exist yet. Ask your Admin to create one.":
    "ഈ തരത്തിലുള്ള അക്കൗണ്ടുകളൊന്നും ഇതുവരെ ഇല്ല. ഒന്ന് ഉണ്ടാക്കാൻ നിങ്ങളുടെ അഡ്മിനോട് ആവശ്യപ്പെടുക.",
  "No adjustments": "അഡ്ജസ്റ്റ്മെന്റുകളൊന്നുമില്ല",
  "A House Manager appeals a published result within a fixed window, with a screenshot as proof the appeal fee was paid. Decide Upheld or Overturned with a reason the house can see — an Overturned result needs a separate Score Override or Adjustment to actually correct it.":
    "പ്രസിദ്ധീകരിച്ച ഒരു ഫലത്തിനെതിരെ നിശ്ചിത സമയപരിധിക്കുള്ളിൽ ഹൗസ് മാനേജർക്ക് അപ്പീൽ നൽകാം, അപ്പീൽ ഫീസ് അടച്ചതിന്റെ തെളിവായി ഒരു സ്ക്രീൻഷോട്ട് സഹിതം. ഹൗസിന് കാണാവുന്ന ഒരു കാരണത്തോടെ അപ്‌ഹെൽഡ് അല്ലെങ്കിൽ ഓവർടേൺഡ് എന്ന് തീരുമാനിക്കുക — ഓവർടേൺഡ് ആയ ഒരു ഫലം യഥാർഥത്തിൽ തിരുത്താൻ പ്രത്യേകം സ്കോർ ഓവർറൈഡോ അഡ്ജസ്റ്റ്മെന്റോ വേണം.",
  "Appeals are turned off. Existing appeals are still listed below, but no House Manager can file a new one until this is enabled in Settings → Appeals.":
    "അപ്പീലുകൾ ഓഫ് ആണ്. നിലവിലുള്ള അപ്പീലുകൾ താഴെ കാണാം, പക്ഷേ ക്രമീകരണങ്ങൾ → അപ്പീലുകൾ എന്നതിൽ ഇത് ഓണാക്കുന്നതുവരെ ഒരു ഹൗസ് മാനേജർക്കും പുതിയത് നൽകാനാവില്ല.",
  "No appeals filed": "അപ്പീലുകളൊന്നും നൽകിയിട്ടില്ല",
  "Appeals are not enabled": "അപ്പീലുകൾ പ്രവർത്തനക്ഷമമല്ല",
  "Ask an Admin to turn this on in Settings if you need to raise one.":
    "ഒരെണ്ണം നൽകേണ്ടതുണ്ടെങ്കിൽ ക്രമീകരണങ്ങളിൽ ഇത് ഓണാക്കാൻ ഒരു അഡ്മിനോട് ആവശ്യപ്പെടുക.",
  "No appeals against your events": "നിങ്ങളുടെ ഇവന്റുകൾക്കെതിരെ അപ്പീലുകളൊന്നുമില്ല",
  "Read-only. An appeal against one of your events, for your information — you take no action here.":
    "വായിക്കാൻ മാത്രം. നിങ്ങളുടെ ഒരു ഇവന്റിനെതിരായ അപ്പീൽ, നിങ്ങളുടെ അറിവിലേക്ക് — ഇവിടെ നിങ്ങൾ ഒന്നും ചെയ്യേണ്ടതില്ല.",
  "Nothing logged yet": "ഇതുവരെ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല",
  "No registration deadline is set, so registration stays open indefinitely. Set one in Settings.":
    "രജിസ്ട്രേഷന് അവസാന തീയതി നിശ്ചയിച്ചിട്ടില്ല, അതിനാൽ രജിസ്ട്രേഷൻ എപ്പോഴും തുറന്നിരിക്കും. ക്രമീകരണങ്ങളിൽ ഒന്ന് നിശ്ചയിക്കുക.",
  "Every participant meets the configured minimums.":
    "എല്ലാ പങ്കാളികളും നിശ്ചയിച്ച കുറഞ്ഞ എണ്ണം പാലിക്കുന്നു.",
  "These become available once you publish results. Nothing is drawn from unpublished events.":
    "ഫലങ്ങൾ പ്രസിദ്ധീകരിച്ചാൽ ഇവ ലഭ്യമാകും. പ്രസിദ്ധീകരിക്കാത്ത ഇവന്റുകളിൽ നിന്ന് ഒന്നും എടുക്കുന്നില്ല.",
  "No events yet": "ഇവന്റുകളൊന്നുമില്ല",
  "Add them one at a time or import a CSV.": "ഒന്നൊന്നായി ചേർക്കുക, അല്ലെങ്കിൽ ഒരു CSV ഇംപോർട്ട് ചെയ്യുക.",
  "No events match those filters": "ആ ഫിൽട്ടറുകൾക്ക് അനുയോജ്യമായ ഇവന്റുകളില്ല",
  "Create events first.": "ആദ്യം ഇവന്റുകൾ ഉണ്ടാക്കുക.",
  "No results are published yet. You can design freely now, but generating uses published results only.":
    "ഫലങ്ങളൊന്നും ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല. ഇപ്പോൾ സ്വതന്ത്രമായി ഡിസൈൻ ചെയ്യാം, പക്ഷേ ജനറേറ്റ് ചെയ്യുമ്പോൾ പ്രസിദ്ധീകരിച്ച ഫലങ്ങൾ മാത്രമേ ഉപയോഗിക്കൂ.",
  "Nobody matches that.": "അതിനോട് ആരും യോജിക്കുന്നില്ല.",
  "No published event matches that.": "അതിനോട് യോജിക്കുന്ന പ്രസിദ്ധീകരിച്ച ഇവന്റ് ഇല്ല.",
  "No saved designs yet": "സേവ് ചെയ്ത ഡിസൈനുകളൊന്നുമില്ല",
  "Pick a template above to start.": "തുടങ്ങാൻ മുകളിൽ നിന്ന് ഒരു ടെംപ്ലേറ്റ് തിരഞ്ഞെടുക്കുക.",
  "No judges yet": "ജഡ്ജിമാരൊന്നുമില്ല",
  "Create judge accounts under Accounts.": "അക്കൗണ്ട്സിൽ ജഡ്ജ് അക്കൗണ്ടുകൾ ഉണ്ടാക്കുക.",
  "Assign code letters on the Registrations screen before scoring.":
    "സ്കോർ ചെയ്യുന്നതിന് മുമ്പ് രജിസ്ട്രേഷൻ സ്ക്രീനിൽ കോഡ് ലെറ്ററുകൾ നൽകുക.",
  "This event is published, so its scores and absences are read-only. To correct one, unpublish it on the Results screen first, then Unfinalize below.":
    "ഈ ഇവന്റ് പ്രസിദ്ധീകരിച്ചതിനാൽ അതിന്റെ സ്കോറുകളും ആബ്സൻസുകളും വായിക്കാൻ മാത്രം. ഒന്ന് തിരുത്താൻ ആദ്യം റിസൾട്ട്സ് സ്ക്രീനിൽ അൺപബ്ലിഷ് ചെയ്യുക, പിന്നെ താഴെ അൺഫൈനലൈസ് ചെയ്യുക.",
  "This event is finalized, so its scores and absences are read-only. Unfinalize it below to make a correction — that reopens editing without touching what's already been recorded.":
    "ഈ ഇവന്റ് ഫൈനലൈസ് ചെയ്തതിനാൽ അതിന്റെ സ്കോറുകളും ആബ്സൻസുകളും വായിക്കാൻ മാത്രം. തിരുത്താൻ താഴെ അൺഫൈനലൈസ് ചെയ്യുക — ഇതിനകം രേഖപ്പെടുത്തിയതിനെ തൊടാതെ അത് എഡിറ്റിംഗ് വീണ്ടും തുറക്കും.",
  "This is what finalizing will store. Nothing has been saved yet.":
    "ഫൈനലൈസ് ചെയ്യുമ്പോൾ സൂക്ഷിക്കുന്നത് ഇതാണ്. ഇതുവരെ ഒന്നും സേവ് ചെയ്തിട്ടില്ല.",
  "This joins the judges' real marks as one more value in the SAME average — a 3-judge entry with this added becomes a 4-way average. The judges' own marks are kept and are not changed — removing this restores their average exactly. The percentage, grade, rank and points all follow from that average, same as for any other entry.":
    "ഇത് ജഡ്ജിമാരുടെ യഥാർഥ മാർക്കുകൾക്കൊപ്പം അതേ ശരാശരിയിലെ ഒരു മൂല്യമായി ചേരുന്നു — 3 ജഡ്ജിമാരുള്ള ഒരു എൻട്രിയിൽ ഇത് ചേർത്താൽ അത് 4 എണ്ണത്തിന്റെ ശരാശരിയാകും. ജഡ്ജിമാരുടെ സ്വന്തം മാർക്കുകൾ അതേപടി സൂക്ഷിക്കുന്നു, മാറ്റുന്നില്ല — ഇത് നീക്കിയാൽ അവരുടെ ശരാശരി അതേപടി തിരികെ വരും. ശതമാനം, ഗ്രേഡ്, റാങ്ക്, പോയിന്റ് എല്ലാം ആ ശരാശരിയിൽ നിന്നാണ് വരുന്നത്, മറ്റേതൊരു എൻട്രിയിലേതും പോലെ.",
  "A House Manager submits one item per entry for an event that asks for it — a song title, and the like. Approve or reject each, oldest first; once approved, it is shown to a judge beside the code letter, never the house's name.":
    "ആവശ്യപ്പെടുന്ന ഒരു ഇവന്റിന് ഓരോ എൻട്രിക്കും ഒരു ഇനം ഹൗസ് മാനേജർ സമർപ്പിക്കുന്നു — ഒരു പാട്ടിന്റെ പേര് പോലുള്ളവ. പഴയത് ആദ്യം എന്ന ക്രമത്തിൽ ഓരോന്നും അംഗീകരിക്കുകയോ നിരസിക്കുകയോ ചെയ്യുക; അംഗീകരിച്ചാൽ അത് കോഡ് ലെറ്ററിനൊപ്പം ജഡ്ജിക്ക് കാണിക്കും, ഹൗസിന്റെ പേര് ഒരിക്കലും കാണിക്കില്ല.",
  "Nothing awaiting approval": "അംഗീകാരത്തിനായി ഒന്നും കാത്തിരിക്കുന്നില്ല",
  "Nothing awaiting your approval": "നിങ്ങളുടെ അംഗീകാരത്തിനായി ഒന്നും കാത്തിരിക്കുന്നില്ല",
  "Add at least one category under Settings → Categories first. Every participant must belong to one.":
    "ആദ്യം ക്രമീകരണങ്ങൾ → വിഭാഗങ്ങൾ എന്നതിൽ കുറഞ്ഞത് ഒരു വിഭാഗമെങ്കിലും ചേർക്കുക. ഓരോ പങ്കാളിയും ഒരു വിഭാഗത്തിൽ ഉൾപ്പെടണം.",
  "Create houses under Accounts before adding participants.":
    "പങ്കാളികളെ ചേർക്കുന്നതിന് മുമ്പ് അക്കൗണ്ട്സിൽ ഹൗസുകൾ ഉണ്ടാക്കുക.",
  "Run this after changing anything that alters HOW entries are counted: turning per-category limits on or off, changing “split by stage”, or switching Type or Tier limits on. Until you do, those settings refuse to save.":
    "എൻട്രികൾ എങ്ങനെ എണ്ണുന്നു എന്നത് മാറ്റുന്ന എന്തെങ്കിലും മാറ്റിയ ശേഷം ഇത് പ്രവർത്തിപ്പിക്കുക: വിഭാഗം തിരിച്ചുള്ള പരിധികൾ ഓൺ/ഓഫ് ചെയ്യുക, “സ്റ്റേജ് അനുസരിച്ച് വിഭജിക്കുക” മാറ്റുക, അല്ലെങ്കിൽ ടൈപ്പ്/ടയർ പരിധികൾ ഓണാക്കുക. അതുവരെ ആ ക്രമീകരണങ്ങൾ സേവ് ആകില്ല.",
  "Uploaded photos and Google Drive links both print — the print window waits for them to load. Anyone with no photo at all gets a silhouette.":
    "അപ്‌ലോഡ് ചെയ്ത ഫോട്ടോകളും Google Drive ലിങ്കുകളും പ്രിന്റ് ആകും — അവ ലോഡ് ആകുന്നതുവരെ പ്രിന്റ് വിൻഡോ കാത്തിരിക്കും. ഫോട്ടോ ഇല്ലാത്തവർക്ക് ഒരു നിഴൽരൂപം കാണിക്കും.",
  "No participants match": "അനുയോജ്യമായ പങ്കാളികളില്ല",
  "Entries are created by House Managers in their own panel. This screen is for code letters, judges and review.":
    "എൻട്രികൾ ഹൗസ് മാനേജർമാർ അവരുടെ സ്വന്തം പാനലിലാണ് ഉണ്ടാക്കുന്നത്. ഈ സ്ക്രീൻ കോഡ് ലെറ്ററുകൾ, ജഡ്ജിമാർ, അവലോകനം എന്നിവയ്ക്കുള്ളതാണ്.",
  "This House Manager has agreed to staff registering for them.":
    "സ്റ്റാഫ് തങ്ങൾക്ക് വേണ്ടി രജിസ്റ്റർ ചെയ്യുന്നതിന് ഈ ഹൗസ് മാനേജർ സമ്മതിച്ചിട്ടുണ്ട്.",
  "No entries yet": "എൻട്രികളൊന്നുമില്ല",
  "No entries match those filters": "ആ ഫിൽട്ടറുകൾക്ക് അനുയോജ്യമായ എൻട്രികളില്ല",
  "Nothing registered for this event": "ഈ ഇവന്റിലേക്ക് ഒന്നും രജിസ്റ്റർ ചെയ്തിട്ടില്ല",
  "Thresholds must descend, each grade above the next. Saving is blocked until they do.":
    "പരിധികൾ ഇറങ്ങിവരണം, ഓരോ ഗ്രേഡും അടുത്തതിന് മുകളിൽ. അങ്ങനെ ആകുന്നതുവരെ സേവ് ചെയ്യാനാവില്ല.",
  "These switches decide which axes CAN carry points. Nothing changes for an existing event until you also set its “Points from” on the Events screen — at a time, one source only, no adding ladders together.":
    "ഏതൊക്കെ അക്‌സുകൾക്ക് പോയിന്റ് വഹിക്കാനാകും എന്ന് ഈ സ്വിച്ചുകൾ തീരുമാനിക്കുന്നു. ഇവന്റ് സ്ക്രീനിൽ അതിന്റെ “പോയിന്റ് എവിടെ നിന്ന്” എന്നത് കൂടി നിശ്ചയിക്കുന്നതുവരെ നിലവിലുള്ള ഒരു ഇവന്റിനും മാറ്റമില്ല — ഒരു സമയത്ത് ഒരു ഉറവിടം മാത്രം, ലാഡറുകൾ കൂട്ടിച്ചേർക്കില്ല.",
  "No Types have been added yet — add them on the Type & Tier tab.":
    "ടൈപ്പുകളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല — ടൈപ്പ് & ടയർ ടാബിൽ അവ ചേർക്കുക.",
  "No Tiers have been added yet — add them on the Type & Tier tab.":
    "ടയറുകളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല — ടൈപ്പ് & ടയർ ടാബിൽ അവ ചേർക്കുക.",
  "No categories have been added yet — add them on the Categories tab.":
    "വിഭാഗങ്ങളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല — വിഭാഗങ്ങൾ ടാബിൽ അവ ചേർക്കുക.",
  "No grades are set up yet — add them on the Fest details tab first.":
    "ഗ്രേഡുകളൊന്നും ഇതുവരെ സജ്ജമാക്കിയിട്ടില്ല — ആദ്യം ഫെസ്റ്റ് വിവരങ്ങൾ ടാബിൽ അവ ചേർക്കുക.",
  "No categories yet": "വിഭാഗങ്ങളൊന്നുമില്ല",
  "None yet": "ഇതുവരെ ഒന്നുമില്ല",
  "No constraint groups": "നിയന്ത്രണ ഗ്രൂപ്പുകളൊന്നുമില്ല",
  "Registrations are limited only by the caps.": "രജിസ്ട്രേഷനുകൾ പരിധികളാൽ മാത്രമേ നിയന്ത്രിക്കപ്പെടുന്നുള്ളൂ.",
  "No extra boards yet": "അധിക ബോർഡുകളൊന്നുമില്ല",
  "Leave a box blank for no limit. Maximums block a registration outright. Minimums never block — they show up in the compliance report instead.":
    "പരിധി വേണ്ടെങ്കിൽ ബോക്സ് ഒഴിച്ചിടുക. പരമാവധി പരിധികൾ രജിസ്ട്രേഷൻ പൂർണമായി തടയും. കുറഞ്ഞ പരിധികൾ ഒരിക്കലും തടയില്ല — പകരം അവ കംപ്ലയൻസ് റിപ്പോർട്ടിൽ കാണിക്കും.",
  "House totals always count all four pools plus manual adjustments, regardless of these toggles.":
    "ഈ സ്വിച്ചുകൾ എന്തായാലും, ഹൗസ് ആകെത്തുകയിൽ നാല് പൂളുകളും കൈകൊണ്ടുള്ള അഡ്ജസ്റ്റ്മെന്റുകളും എപ്പോഴും ഉൾപ്പെടും.",
  "That delete-everything password is not correct.": "ആ എല്ലാം മായ്ക്കാനുള്ള പാസ്‌വേഡ് ശരിയല്ല.",
  "There is no email recovery. If the Admin password is lost, reset it from Firebase console → Authentication → the admin user → Reset password.":
    "ഇമെയിൽ വഴിയുള്ള വീണ്ടെടുക്കൽ ഇല്ല. അഡ്മിൻ പാസ്‌വേഡ് നഷ്ടപ്പെട്ടാൽ, Firebase കൺസോൾ → Authentication → അഡ്മിൻ യൂസർ → Reset password എന്നതിൽ നിന്ന് അത് പുനഃസജ്ജമാക്കുക.",
  "Use a different password for delete-everything than your Admin login — otherwise it protects nothing extra.":
    "എല്ലാം മായ്ക്കാനുള്ള പാസ്‌വേഡ് നിങ്ങളുടെ അഡ്മിൻ ലോഗിനിൽ നിന്ന് വ്യത്യസ്തമായിരിക്കട്ടെ — അല്ലെങ്കിൽ അത് അധികമായി ഒന്നും സംരക്ഷിക്കുന്നില്ല.",
  "House Managers can request a swap only on events you've opened for substitution (Events → edit event). It stays possible until code letters are assigned — after that the running order is fixed and a name change is a result correction in Judging.":
    "നിങ്ങൾ സബ്സ്റ്റിറ്റ്യൂഷന് തുറന്ന ഇവന്റുകളിൽ മാത്രമേ ഹൗസ് മാനേജർമാർക്ക് മാറ്റം ആവശ്യപ്പെടാനാകൂ (ഇവന്റുകൾ → ഇവന്റ് എഡിറ്റ് ചെയ്യുക). കോഡ് ലെറ്ററുകൾ നൽകുന്നതുവരെ ഇത് സാധ്യമാണ് — അതിനുശേഷം റണ്ണിംഗ് ഓർഡർ ഉറപ്പിക്കപ്പെടും, പേരുമാറ്റം ജഡ്ജിംഗിലെ ഒരു ഫലത്തിരുത്തലാകും.",
  "Substitutions are only open for events an Admin has switched them on for, from the Our entries tab. An organiser approves each request. This stays possible until code letters are assigned.":
    "ഒരു അഡ്മിൻ ഓണാക്കിയ ഇവന്റുകൾക്ക് മാത്രമേ സബ്സ്റ്റിറ്റ്യൂഷൻ തുറന്നിട്ടുള്ളൂ, ഞങ്ങളുടെ എൻട്രികൾ ടാബിൽ നിന്ന്. ഓരോ അപേക്ഷയും ഒരു സംഘാടകൻ അംഗീകരിക്കുന്നു. കോഡ് ലെറ്ററുകൾ നൽകുന്നതുവരെ ഇത് സാധ്യമാണ്.",
  "No substitution requests yet": "സബ്സ്റ്റിറ്റ്യൂഷൻ അപേക്ഷകളൊന്നുമില്ല",
  "No one else in your house is eligible for this event.":
    "നിങ്ങളുടെ ഹൗസിൽ മറ്റാരും ഈ ഇവന്റിന് യോഗ്യരല്ല.",
  "A title is awarded by hand, separate from any scored event — Best Debater, Best All-rounder, and the like. It shows on the public results page and, for the participant's own house, in the House Manager panel.":
    "സ്കോർ ചെയ്യുന്ന ഇവന്റുകളിൽ നിന്ന് വേറിട്ട്, കൈകൊണ്ടാണ് ഒരു ടൈറ്റിൽ നൽകുന്നത് — മികച്ച ഡിബേറ്റർ, മികച്ച ഓൾ-റൗണ്ടർ എന്നിങ്ങനെ. ഇത് പൊതു ഫല പേജിലും, പങ്കാളിയുടെ സ്വന്തം ഹൗസിന് ഹൗസ് മാനേജർ പാനലിലും കാണിക്കും.",
  "No titles yet": "ടൈറ്റിലുകളൊന്നുമില്ല",
  "No titles awarded yet": "ടൈറ്റിലുകളൊന്നും ഇതുവരെ നൽകിയിട്ടില്ല",
  "Award the first one above.": "മുകളിൽ ആദ്യത്തേത് നൽകുക.",
  "Every event is already scheduled somewhere. Remove it from its current slot first.":
    "എല്ലാ ഇവന്റും എവിടെയെങ്കിലും ഇതിനകം ഷെഡ്യൂൾ ചെയ്തിട്ടുണ്ട്. ആദ്യം അതിന്റെ നിലവിലെ സ്ലോട്ടിൽ നിന്ന് നീക്കുക.",
  "Nothing scheduled here yet": "ഇവിടെ ഇതുവരെ ഒന്നും ഷെഡ്യൂൾ ചെയ്തിട്ടില്ല",
  "Nothing scheduled": "ഒന്നും ഷെഡ്യൂൾ ചെയ്തിട്ടില്ല",
  "Add an event slot or a break.": "ഒരു ഇവന്റ് സ്ലോട്ടോ ഇടവേളയോ ചേർക്കുക.",
  "Schedule not published yet": "ഷെഡ്യൂൾ ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "The schedule has not been published yet. Your assigned events are listed on the Score events tab.":
    "ഷെഡ്യൂൾ ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല. നിങ്ങൾക്ക് നൽകിയ ഇവന്റുകൾ സ്കോർ ഇവന്റ്സ് ടാബിൽ കാണാം.",
  "Contacts are not published": "കോൺടാക്റ്റുകൾ പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "The organisers have not made a contact list public for this fest.":
    "ഈ ഫെസ്റ്റിനായി സംഘാടകർ ഒരു കോൺടാക്റ്റ് പട്ടിക പൊതുവായി നൽകിയിട്ടില്ല.",
  "No contacts listed yet": "കോൺടാക്റ്റുകളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല",
  "Nothing published yet": "ഇതുവരെ ഒന്നും പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "Results appear here the moment organisers release them.":
    "സംഘാടകർ ഫലങ്ങൾ പുറത്തുവിടുന്ന നിമിഷം അവ ഇവിടെ കാണാം.",
  "No results published yet": "ഫലങ്ങളൊന്നും ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "No event results published yet": "ഇവന്റ് ഫലങ്ങളൊന്നും ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല",
  "Standings appear here as soon as the organisers publish them.":
    "സംഘാടകർ പ്രസിദ്ധീകരിച്ചാലുടൻ നിലവാരപ്പട്ടിക ഇവിടെ കാണാം.",
  "It will appear here once the organisers make it visible.":
    "സംഘാടകർ ഇത് ദൃശ്യമാക്കിയാൽ ഇവിടെ കാണാം.",
  "Board not found": "ബോർഡ് കണ്ടെത്തിയില്ല",
  "Nothing on this board yet": "ഈ ബോർഡിൽ ഇതുവരെ ഒന്നുമില്ല",
  "It fills up as results in its events are published.":
    "അതിലെ ഇവന്റുകളുടെ ഫലങ്ങൾ പ്രസിദ്ധീകരിക്കുന്നതിനനുസരിച്ച് ഇത് നിറയും.",
  "Maximum event limits are checked as you register. If a participant is at their limit you will see which cap was hit.":
    "നിങ്ങൾ രജിസ്റ്റർ ചെയ്യുമ്പോൾ പരമാവധി ഇവന്റ് പരിധികൾ പരിശോധിക്കും. ഒരു പങ്കാളി പരിധിയിലെത്തിയാൽ ഏത് പരിധിയാണ് തടഞ്ഞതെന്ന് കാണാം.",
  "Entries an Admin or Co-Admin registered for your house one at a time, under the older per-event approval. Approving one creates the entry exactly as if you had registered it yourself — the same participant limits and category rules apply, and approval is refused outright if one would be broken. Rejecting one is final; it cannot be forced through.":
    "പഴയ ഇവന്റ് തിരിച്ചുള്ള അംഗീകാര രീതിയിൽ, ഒരു അഡ്മിനോ കോ-അഡ്മിനോ നിങ്ങളുടെ ഹൗസിന് വേണ്ടി ഒന്നൊന്നായി രജിസ്റ്റർ ചെയ്ത എൻട്രികൾ. ഒന്ന് അംഗീകരിച്ചാൽ നിങ്ങൾ തന്നെ രജിസ്റ്റർ ചെയ്തതുപോലെ എൻട്രി ഉണ്ടാകും — അതേ പങ്കാളി പരിധികളും വിഭാഗ നിയമങ്ങളും ബാധകമാണ്, ഒന്ന് ലംഘിക്കപ്പെടുമെങ്കിൽ അംഗീകാരം പൂർണമായി നിരസിക്കും. നിരസിക്കുന്നത് അന്തിമമാണ്; അത് മറികടക്കാനാവില്ല.",
  "House not found": "ഹൗസ് കണ്ടെത്തിയില്ല",
  "Ask your Admin to check this account.": "ഈ അക്കൗണ്ട് പരിശോധിക്കാൻ നിങ്ങളുടെ അഡ്മിനോട് ആവശ്യപ്പെടുക.",
  "No participants yet": "പങ്കാളികളൊന്നുമില്ല",
  "An organiser adds participants to your house before registration opens.":
    "രജിസ്ട്രേഷൻ തുറക്കുന്നതിന് മുമ്പ് ഒരു സംഘാടകൻ നിങ്ങളുടെ ഹൗസിലേക്ക് പങ്കാളികളെ ചേർക്കും.",
  "Registration is closed": "രജിസ്ട്രേഷൻ അടച്ചിരിക്കുന്നു",
  "No event is currently open for entries.": "നിലവിൽ ഒരു ഇവന്റും എൻട്രികൾക്ക് തുറന്നിട്ടില്ല.",
  "Nothing matches those filters": "ആ ഫിൽട്ടറുകൾക്ക് അനുയോജ്യമായി ഒന്നുമില്ല",
  "Code letters have not been assigned for this event yet. Check back shortly.":
    "ഈ ഇവന്റിന് കോഡ് ലെറ്ററുകൾ ഇതുവരെ നൽകിയിട്ടില്ല. അൽപ്പസമയത്തിനുള്ളിൽ വീണ്ടും നോക്കുക.",
  "Code letters are locked — a score has already been recorded for this event, so reassigning them would detach it from the wrong entry.":
    "കോഡ് ലെറ്ററുകൾ ലോക്ക് ചെയ്തിരിക്കുന്നു — ഈ ഇവന്റിന് ഒരു സ്കോർ ഇതിനകം രേഖപ്പെടുത്തിയിട്ടുണ്ട്, അതിനാൽ അവ വീണ്ടും നൽകിയാൽ അത് തെറ്റായ എൻട്രിയിൽ നിന്ന് വേർപെടും.",
  "Assign code letters first — they set the running order and are what a judge scores against.":
    "ആദ്യം കോഡ് ലെറ്ററുകൾ നൽകുക — അവയാണ് റണ്ണിംഗ് ഓർഡർ നിശ്ചയിക്കുന്നതും ജഡ്ജി സ്കോർ ചെയ്യുന്നതും.",
  "Type a score, then press Save (or Enter). Nothing is stored until you do. Leave a score blank only if the entry is marked absent.":
    "ഒരു സ്കോർ ടൈപ്പ് ചെയ്ത് സേവ് (അല്ലെങ്കിൽ Enter) അമർത്തുക. അങ്ങനെ ചെയ്യുന്നതുവരെ ഒന്നും സൂക്ഷിക്കില്ല. എൻട്രി ആബ്സന്റ് ആയി അടയാളപ്പെടുത്തിയിട്ടുണ്ടെങ്കിൽ മാത്രം സ്കോർ ഒഴിച്ചിടുക.",
  "No events assigned yet": "ഇവന്റുകളൊന്നും ഇതുവരെ നൽകിയിട്ടില്ല",
  "An organiser will assign your events before judging starts.":
    "ജഡ്ജിംഗ് തുടങ്ങുന്നതിന് മുമ്പ് ഒരു സംഘാടകൻ നിങ്ങളുടെ ഇവന്റുകൾ നൽകും.",
  "None of your events are scheduled yet": "നിങ്ങളുടെ ഇവന്റുകളൊന്നും ഇതുവരെ ഷെഡ്യൂൾ ചെയ്തിട്ടില്ല",
  "They will appear here once an organiser adds them to the programme.":
    "ഒരു സംഘാടകൻ അവ പ്രോഗ്രാമിൽ ചേർത്താൽ ഇവിടെ കാണാം.",
  "No match": "പൊരുത്തമില്ല",
  "Check the spelling or the chest number.": "അക്ഷരത്തെറ്റോ ചെസ്റ്റ് നമ്പറോ പരിശോധിക്കുക.",
  "Messaging is not enabled": "സന്ദേശമയയ്ക്കൽ പ്രവർത്തനക്ഷമമല്ല",
  "Ask an Admin to turn this on in Settings if you need it.":
    "ആവശ്യമുണ്ടെങ്കിൽ ക്രമീകരണങ്ങളിൽ ഇത് ഓണാക്കാൻ ഒരു അഡ്മിനോട് ആവശ്യപ്പെടുക.",
  "No conversations yet": "സംഭാഷണങ്ങളൊന്നുമില്ല",
  "This fest is already set up.": "ഈ ഫെസ്റ്റ് ഇതിനകം സജ്ജമാക്കിയിട്ടുണ്ട്.",
  "Give the fest a name.": "ഫെസ്റ്റിന് ഒരു പേര് നൽകുക.",
  "Nothing shared yet": "ഇതുവരെ ഒന്നും പങ്കുവെച്ചിട്ടില്ല",
  "The organisers have not made any templates public.":
    "സംഘാടകർ ഒരു ടെംപ്ലേറ്റും പൊതുവായി നൽകിയിട്ടില്ല.",
  "A constraint group says “at most N of these”. Pick whole Types, individual events, or both — an event counted once by either route counts once, not twice. Checked when a House Manager registers, with the group named in the refusal so they can see which rule stopped them.":
    "ഒരു നിയന്ത്രണ ഗ്രൂപ്പ് പറയുന്നത് “ഇവയിൽ പരമാവധി N എണ്ണം” എന്നാണ്. മുഴുവൻ ടൈപ്പുകളോ, വ്യക്തിഗത ഇവന്റുകളോ, രണ്ടും ചേർത്തോ തിരഞ്ഞെടുക്കുക — ഏതെങ്കിലും വഴിയിലൂടെ ഒരിക്കൽ എണ്ണിയ ഇവന്റ് ഒരിക്കൽ മാത്രമേ എണ്ണൂ, രണ്ടുതവണയല്ല. ഹൗസ് മാനേജർ രജിസ്റ്റർ ചെയ്യുമ്പോൾ ഇത് പരിശോധിക്കും, ഏത് നിയമമാണ് തടഞ്ഞതെന്ന് അവർക്ക് കാണാൻ നിരസിക്കുന്ന സന്ദേശത്തിൽ ഗ്രൂപ്പിന്റെ പേരും ഉണ്ടാകും.",
  "Off by default. When on, a House Manager may appeal a result for a fixed window after it is published, attaching a screenshot as proof the appeal fee was paid — there is no payment gateway on the free tier, so a screenshot stands in for a receipt, the same way the fest manual stands in for an upload. Decide each appeal Upheld (the result stands) or Overturned (it was wrong), with a written reason the house can see. Deciding an appeal does not itself change a score — correct it afterwards with a Score Override or an Adjustment, same as any other manual intervention.":
    "സ്ഥിരസ്ഥിതിയായി ഓഫ്. ഓണാക്കിയാൽ, ഒരു ഫലം പ്രസിദ്ധീകരിച്ച ശേഷം നിശ്ചിത സമയപരിധിക്കുള്ളിൽ ഹൗസ് മാനേജർക്ക് അതിനെതിരെ അപ്പീൽ നൽകാം, അപ്പീൽ ഫീസ് അടച്ചതിന്റെ തെളിവായി ഒരു സ്ക്രീൻഷോട്ട് ചേർത്ത് — സൗജന്യ പ്ലാനിൽ പേയ്‌മെന്റ് ഗേറ്റ്‌വേ ഇല്ല, അതിനാൽ രസീതിന് പകരം സ്ക്രീൻഷോട്ട് നിൽക്കുന്നു, ഫെസ്റ്റ് മാനുവൽ അപ്‌ലോഡിന് പകരം നിൽക്കുന്നതുപോലെ. ഹൗസിന് കാണാവുന്ന എഴുതിയ കാരണത്തോടെ ഓരോ അപ്പീലും അപ്‌ഹെൽഡ് (ഫലം നിലനിൽക്കുന്നു) അല്ലെങ്കിൽ ഓവർടേൺഡ് (അത് തെറ്റായിരുന്നു) എന്ന് തീരുമാനിക്കുക. ഒരു അപ്പീൽ തീരുമാനിക്കുന്നത് സ്വയം ഒരു സ്കോറും മാറ്റുന്നില്ല — മറ്റേതൊരു കൈകൊണ്ടുള്ള ഇടപെടലും പോലെ, പിന്നീട് സ്കോർ ഓവർറൈഡോ അഡ്ജസ്റ്റ്മെന്റോ ഉപയോഗിച്ച് അത് തിരുത്തുക.",
  "Registrations already exist. Changing limits that alter HOW entries are counted — turning per-category on or off, changing “split by stage”, or switching Type/Tier limits on — leaves existing counts filed under keys nothing reads any more. Save is blocked for those changes until you run Recount, on the Participants screen.":
    "രജിസ്ട്രേഷനുകൾ ഇതിനകം ഉണ്ട്. എൻട്രികൾ എങ്ങനെ എണ്ണുന്നു എന്നത് മാറ്റുന്ന പരിധികൾ മാറ്റുന്നത് — വിഭാഗം തിരിച്ചുള്ളത് ഓൺ/ഓഫ് ചെയ്യുക, “സ്റ്റേജ് അനുസരിച്ച് വിഭജിക്കുക” മാറ്റുക, ടൈപ്പ്/ടയർ പരിധികൾ ഓണാക്കുക — നിലവിലെ എണ്ണങ്ങൾ ഇനി ആരും വായിക്കാത്ത കീകൾക്ക് കീഴിൽ ഉപേക്ഷിക്കും. പങ്കാളികൾ സ്ക്രീനിൽ റീകൗണ്ട് പ്രവർത്തിപ്പിക്കുന്നതുവരെ ആ മാറ്റങ്ങൾ സേവ് ചെയ്യാനാവില്ല.",

  /* ── Danger zone, reset groups and the newer screens ─────────────── */
  "What this does, exactly:": "ഇത് കൃത്യമായി ചെയ്യുന്നത്:",
  "Deletes all events, participants, registrations, scores, results and published pages":
    "എല്ലാ ഇവന്റുകളും പങ്കാളികളും രജിസ്ട്രേഷനുകളും സ്കോറുകളും ഫലങ്ങളും പ്രസിദ്ധീകരിച്ച പേജുകളും ഇല്ലാതാക്കുന്നു",
  "Deletes the schedule and every venue": "ഷെഡ്യൂളും എല്ലാ വേദികളും ഇല്ലാതാക്കുന്നു",
  "Revokes every House, Judge and Co-Admin account — they can no longer log in":
    "എല്ലാ ഹൗസ്, ജഡ്ജ്, കോ-അഡ്മിൻ അക്കൗണ്ടുകളും റദ്ദാക്കുന്നു — അവർക്ക് ഇനി ലോഗിൻ ചെയ്യാനാവില്ല",
  "Deletes your own Admin login too, and signs you out":
    "നിങ്ങളുടെ സ്വന്തം അഡ്മിൻ ലോഗിനും ഇല്ലാതാക്കി സൈൻ ഔട്ട് ചെയ്യുന്നു",
  "Sends you back to the first-run Set up your fest screen":
    "ആദ്യ ഉപയോഗത്തിലെ “നിങ്ങളുടെ ഫെസ്റ്റ് സജ്ജമാക്കുക” സ്ക്രീനിലേക്ക് തിരികെ കൊണ്ടുപോകുന്നു",
  "Everything below deletes the WHOLE fest — every event, participant, registration, score and result. There is no undo and no backup — this is not a \"hide\" or \"archive\", the data is gone.":
    "താഴെയുള്ളതെല്ലാം മുഴുവൻ ഫെസ്റ്റും ഇല്ലാതാക്കും — എല്ലാ ഇവന്റും പങ്കാളിയും രജിസ്ട്രേഷനും സ്കോറും ഫലവും. തിരികെ എടുക്കാനാവില്ല, ബാക്കപ്പുമില്ല — ഇത് “മറയ്ക്കൽ” അല്ലെങ്കിൽ “ആർക്കൈവ്” അല്ല, ഡാറ്റ പോയി.",

  "All judging and results": "എല്ലാ ജഡ്ജിംഗും ഫലങ്ങളും",
  "Every score, absence flag, override, finalized result, published result page and appeal. Registrations, participants and events all stay — so the fest can simply be judged again from scratch.":
    "എല്ലാ സ്കോറും ആബ്സൻസ് അടയാളവും ഓവർറൈഡും ഫൈനലൈസ് ചെയ്ത ഫലവും പ്രസിദ്ധീകരിച്ച ഫല പേജും അപ്പീലും. രജിസ്ട്രേഷനുകളും പങ്കാളികളും ഇവന്റുകളും അതേപടി നിലനിൽക്കും — അതിനാൽ ഫെസ്റ്റ് ആദ്യം മുതൽ വീണ്ടും ജഡ്ജ് ചെയ്യാം.",
  "All registrations": "എല്ലാ രജിസ്ട്രേഷനുകളും",
  "Every entry a House Manager made, plus the substitution requests and event material attached to them. Participants and events stay. Judging and results go too, because they are scored per entry.":
    "ഹൗസ് മാനേജർ ഉണ്ടാക്കിയ എല്ലാ എൻട്രിയും, ഒപ്പം അവയോട് ചേർത്ത സബ്സ്റ്റിറ്റ്യൂഷൻ അപേക്ഷകളും ഇവന്റ് സാമഗ്രികളും. പങ്കാളികളും ഇവന്റുകളും നിലനിൽക്കും. ജഡ്ജിംഗും ഫലങ്ങളും കൂടി പോകും, കാരണം അവ ഓരോ എൻട്രിക്കും സ്കോർ ചെയ്യുന്നതാണ്.",
  "All participants": "എല്ലാ പങ്കാളികളും",
  "Every student on the roster, and any special title awarded to one. Their registrations, and everything judged from those, go with them.":
    "പട്ടികയിലുള്ള എല്ലാ വിദ്യാർഥിയും, അവർക്ക് നൽകിയ ഏതെങ്കിലും പ്രത്യേക ടൈറ്റിലും. അവരുടെ രജിസ്ട്രേഷനുകളും അവയിൽ നിന്ന് ജഡ്ജ് ചെയ്തതെല്ലാം അവരോടൊപ്പം പോകും.",
  "All events": "എല്ലാ ഇവന്റുകളും",
  "Every competition item. Registrations for them, and everything judged from those, go too. Participants stay on the roster.":
    "എല്ലാ മത്സര ഇനവും. അവയ്ക്കുള്ള രജിസ്ട്രേഷനുകളും അവയിൽ നിന്ന് ജഡ്ജ് ചെയ്തതെല്ലാം കൂടി പോകും. പങ്കാളികൾ പട്ടികയിൽ നിലനിൽക്കും.",
  "The whole schedule": "മുഴുവൻ ഷെഡ്യൂളും",
  "Every venue, fest day and time slot, and the public schedule page. Nothing else is touched — events themselves stay.":
    "എല്ലാ വേദിയും ഫെസ്റ്റ് ദിവസവും സമയ സ്ലോട്ടും, ഒപ്പം പൊതു ഷെഡ്യൂൾ പേജും. മറ്റൊന്നും തൊടില്ല — ഇവന്റുകൾ അതേപടി നിലനിൽക്കും.",

  "One sheet, every event in code order: the event as a heading, then every participant entered for it from every house, then a gap before the next one. Events nobody has entered are listed too, marked empty, so the sheet doubles as a check on what is still missing.":
    "ഒരൊറ്റ ഷീറ്റ്, എല്ലാ ഇവന്റും കോഡ് ക്രമത്തിൽ: ഇവന്റ് ഒരു തലക്കെട്ടായി, പിന്നെ എല്ലാ ഹൗസിൽ നിന്നും അതിൽ ചേർന്ന എല്ലാ പങ്കാളിയും, പിന്നെ അടുത്തതിന് മുമ്പ് ഒരു വിടവ്. ആരും ചേരാത്ത ഇവന്റുകളും ഒഴിഞ്ഞതായി അടയാളപ്പെടുത്തി പട്ടികയിലുണ്ട്, അതിനാൽ ഇനിയും എന്താണ് ബാക്കിയുള്ളതെന്ന് പരിശോധിക്കാനും ഈ ഷീറ്റ് ഉപയോഗിക്കാം.",
  "How many of the latest published events get their own slide. 0 shows every published event.":
    "ഏറ്റവും പുതുതായി പ്രസിദ്ധീകരിച്ച എത്ര ഇവന്റുകൾക്ക് സ്വന്തം സ്ലൈഡ് ലഭിക്കും. 0 എല്ലാ പ്രസിദ്ധീകരിച്ച ഇവന്റും കാണിക്കും.",
  "The banner at the top of the public home page, behind the fest name or logo. It is the one band that does not follow the visitor's light/dark setting — it carries your logo and sets the tone of the site, so you choose it once and every visitor sees the same thing, whichever mode their phone is in.":
    "പൊതു ഹോം പേജിന്റെ മുകളിലുള്ള ബാനർ, ഫെസ്റ്റിന്റെ പേരിനോ ലോഗോയ്ക്കോ പിന്നിൽ. സന്ദർശകന്റെ ലൈറ്റ്/ഡാർക്ക് ക്രമീകരണം പിന്തുടരാത്ത ഒരേയൊരു ബാൻഡ് ഇതാണ് — ഇത് നിങ്ങളുടെ ലോഗോ വഹിക്കുകയും സൈറ്റിന്റെ ഭാവം നിശ്ചയിക്കുകയും ചെയ്യുന്നു, അതിനാൽ നിങ്ങൾ ഒരിക്കൽ തിരഞ്ഞെടുക്കുന്നു, ഓരോ സന്ദർശകനും അവരുടെ ഫോൺ ഏത് മോഡിലായാലും ഒരേ കാഴ്ച കാണുന്നു.",
  "The separate password set in Danger Zone.": "ഡേഞ്ചർ സോണിൽ സജ്ജമാക്കിയ പ്രത്യേക പാസ്‌വേഡ്.",
  "Change my password": "എന്റെ പാസ്‌വേഡ് മാറ്റുക",
  "Rules & criteria": "നിയമങ്ങളും മാനദണ്ഡങ്ങളും",

  /* Placeholder-keyed. {houses} and {grade} are the fest's own vocabulary,
     which used to be interpolated and made the whole sentence unkeyable. */
  "Settle a tie the pools above cannot — after a toss, or a judges' decision. Lower number places higher. Leave blank to let the {houses} share the rank as co-toppers, which is what happens with tiebreakers switched off. A manual place is only consulted after every configured pool has been tried, so it can never override real scoring.":
    "മുകളിലെ പൂളുകൾക്ക് തീർക്കാനാവാത്ത ഒരു ടൈ തീർക്കാൻ — ടോസിന് ശേഷമോ ജഡ്ജിമാരുടെ തീരുമാനപ്രകാരമോ. ചെറിയ സംഖ്യ മുന്നിൽ വരും. {houses} എന്നിവർ ഒരുമിച്ച് ആ റാങ്ക് പങ്കിടാൻ ഇത് ഒഴിച്ചിടുക — ടൈബ്രേക്കറുകൾ ഓഫ് ആയിരിക്കുമ്പോൾ സംഭവിക്കുന്നതും അതുതന്നെ. ക്രമീകരിച്ച എല്ലാ പൂളും പരീക്ഷിച്ചതിന് ശേഷം മാത്രമേ കൈകൊണ്ട് നൽകിയ സ്ഥാനം പരിഗണിക്കൂ, അതിനാൽ അതിന് യഥാർഥ സ്കോറിംഗിനെ മറികടക്കാനാവില്ല.",
  "{grade} is fixed at 0 grade points. An entry graded that way still keeps any rank points it earned. This table is the default for every ladder that does not define its own.":
    "{grade} എന്നത് 0 ഗ്രേഡ് പോയിന്റായി ഉറപ്പിച്ചിരിക്കുന്നു. അങ്ങനെ ഗ്രേഡ് ചെയ്ത ഒരു എൻട്രിക്ക് അത് നേടിയ റാങ്ക് പോയിന്റുകൾ അതേപടി ലഭിക്കും. സ്വന്തമായി നിർവചിക്കാത്ത എല്ലാ ലാഡറിനുമുള്ള സ്ഥിരസ്ഥിതിയാണ് ഈ പട്ടിക.",

  "On the top bar": "മുകളിലെ ബാറിൽ",
  "On a light page": "ഇളം നിറമുള്ള പേജിൽ",
  "On the home page": "ഹോം പേജിൽ"
};

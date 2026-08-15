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
export function tr(text) {
  if (!text || getLang() !== "ml" || !is.admin()) return text;
  return ML[text] || text;
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
    "ഇതിനെ അടിസ്ഥാനമാക്കിയാണ് ശതമാനം കണക്കാക്കുന്നത്. 100 ആണ് സാധാരണം."
};

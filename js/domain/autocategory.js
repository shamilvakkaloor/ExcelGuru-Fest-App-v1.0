// Deriving a participant's category from their class or date of birth.
//
// Pure. No Firestore, no DOM — this decides which category a person falls
// into and, when the two rules disagree, which answer wins and why.
//
// WHY A CLASH IS SURFACED RATHER THAN SILENTLY RESOLVED
// A participant repeating a year, or admitted late, genuinely can be in
// Junior by class and Sub-Junior by age. Refusing to guess would stall data
// entry for a case that is common; guessing without saying so would put
// someone in the wrong category and nobody would notice until results were
// published. So a winner is configured in advance, the loser is recorded,
// and the caller can show both.

/** Does `cls` fall inside a category's class range? Inclusive both ends. */
function classInRange(cls, cat) {
  const from = Number(cat.classFrom), to = Number(cat.classTo);
  const n = Number(String(cls).replace(/[^0-9]/g, ""));
  if (isNaN(n) || isNaN(from) || isNaN(to)) return false;
  return n >= Math.min(from, to) && n <= Math.max(from, to);
}

/** Does `dob` fall inside a category's date-of-birth range? Inclusive. */
function dobInRange(dob, cat) {
  if (!dob || !cat.dobFrom || !cat.dobTo) return false;
  // Compared as ISO date strings (YYYY-MM-DD), which sort correctly and
  // avoid a timezone shifting somebody across a category boundary — the
  // kind of bug that would only appear for births near midnight.
  const d = String(dob).slice(0, 10);
  const lo = String(cat.dobFrom).slice(0, 10);
  const hi = String(cat.dobTo).slice(0, 10);
  const from = lo <= hi ? lo : hi;
  const to   = lo <= hi ? hi : lo;
  return d >= from && d <= to;
}

export const byClass = (cls, categories) =>
  (categories || []).find(c => classInRange(cls, c)) || null;

export const byDob = (dob, categories) =>
  (categories || []).find(c => dobInRange(dob, c)) || null;

/**
 * Work out a participant's category.
 *
 * Returns { categoryId, source, clash, fromClass, fromDob, reason }:
 *   categoryId — the answer, or null when nothing matched
 *   source     — "class" | "dob" | "manual" | null
 *   clash      — true when both rules matched and disagreed
 *   reason     — a sentence for the UI; null when there is nothing to say
 *
 * `mode` and `winner` come from festSettings. With mode "none" this returns
 * a manual result and changes nothing, which is the default.
 */
export function resolveCategory({ cls, dob, categories, mode = "none", winner = "dob" }) {
  if (mode === "none") return { categoryId: null, source: "manual", clash: false, reason: null };

  const wantClass = mode === "class" || mode === "both";
  const wantDob   = mode === "dob"   || mode === "both";

  const fromClass = wantClass ? byClass(cls, categories) : null;
  const fromDob   = wantDob   ? byDob(dob, categories)   : null;

  // Only one rule in play, or only one matched: no contest.
  if (fromClass && !fromDob) {
    return { categoryId: fromClass.id, source: "class", clash: false,
             fromClass, fromDob: null,
             reason: `Class ${cls} falls in ${fromClass.name}.` };
  }
  if (fromDob && !fromClass) {
    return { categoryId: fromDob.id, source: "dob", clash: false,
             fromClass: null, fromDob,
             reason: `Date of birth falls in ${fromDob.name}.` };
  }
  if (!fromClass && !fromDob) {
    return { categoryId: null, source: null, clash: false,
             fromClass: null, fromDob: null,
             reason: "No category matches — choose one by hand." };
  }

  // Both matched and agreed.
  if (fromClass.id === fromDob.id) {
    return { categoryId: fromClass.id, source: "both", clash: false,
             fromClass, fromDob,
             reason: `Class and date of birth both give ${fromClass.name}.` };
  }

  // Both matched and disagreed — the configured winner decides, and the
  // loser is named so the operator can see what was overridden.
  const win  = winner === "class" ? fromClass : fromDob;
  const lose = winner === "class" ? fromDob   : fromClass;
  return {
    categoryId: win.id,
    source: winner,
    clash: true,
    fromClass, fromDob,
    reason: `Class gives ${fromClass.name} but date of birth gives ${fromDob.name}. ` +
            `Using ${win.name}, because ${winner === "class" ? "class" : "date of birth"} ` +
            `is set to win a clash.`
  };
}

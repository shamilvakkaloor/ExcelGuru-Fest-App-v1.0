// Chest number allocation — ARCHITECTURE §5.7.
//
// Three formats, chosen fest-wide in Settings:
//
//   digits        101, 102 …          allocated automatically
//   alphanumeric  RED-A01, RED-A02 …  seeded: the admin types the first one
//   alphabets     AAA, AAB …          seeded: same
//
// Everything in the top half of this file is PURE — no Firestore, no DOM —
// so allocation can be unit-tested and, critically, so a CSV import can
// allocate several hundred numbers in memory instead of making one
// transaction per row (§14.1).
import { getAll, getOne, put, runTransaction, db, docRef } from "../lib/db.js";

/* ══ Values ═══════════════════════════════════════════════════════════ */

/** Chest numbers are strings in every format. Normalise for comparison. */
export function normalizeChest(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().toUpperCase();
}

/**
 * A sortable key. Digit runs are zero-padded to a fixed width so "RED-A9"
 * sorts before "RED-A10" and plain 9 before 10 — which a raw string compare
 * gets wrong, and which every table in the app depends on.
 */
export function chestSortKey(v) {
  const s = normalizeChest(v);
  if (!s) return "";
  return s.replace(/\d+/g, d => d.padStart(12, "0"));
}

export const compareChest = (a, b) =>
  chestSortKey(a).localeCompare(chestSortKey(b));

/* ══ Seeded patterns ══════════════════════════════════════════════════ */

/**
 * Split a seed into a literal prefix and the counter that follows it.
 *
 *   "RED-A01" → { prefix: "RED-", letters: "A",   digits: "01", width: 2 }
 *   "AAA"     → { prefix: "",     letters: "AAA", digits: "",   width: 0 }
 *   "101"     → { prefix: "",     letters: "",    digits: "101", width: 3 }
 *
 * Returns null when the seed has no counter to advance.
 */
export function derivePattern(seed) {
  const s = normalizeChest(seed);
  if (!s) return null;
  const m = s.match(/^(.*?)([A-Z]*)(\d*)$/);
  if (!m) return null;
  const [, prefix, letters, digits] = m;
  if (!letters && !digits) return null;
  return { prefix, letters, digits, width: digits.length };
}

/** Odometer over A–Z with A as zero, widening only when every place is Z. */
export function incrementLetters(letters) {
  if (!letters) return "";
  const chars = letters.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === "Z") { chars[i] = "A"; i--; }
    else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(""); }
  }
  return "A" + chars.join("");        // ZZ → AAA
}

/**
 * The value after this one, in the same pattern.
 *
 * Digits roll first; when they overflow their width the letters advance and
 * the digits restart at 1 — "RED-A99" → "RED-B01". A pattern with no digits
 * simply advances its letters.
 */
export function nextChestValue(value) {
  const p = derivePattern(value);
  if (!p) return null;

  if (p.width) {
    const n = Number(p.digits) + 1;
    const ceiling = Math.pow(10, p.width) - 1;
    if (n <= ceiling) {
      return p.prefix + p.letters + String(n).padStart(p.width, "0");
    }
    if (!p.letters) {
      // No letter place to carry into — widen the number instead.
      return p.prefix + String(n);
    }
    return p.prefix + incrementLetters(p.letters) + String(1).padStart(p.width, "0");
  }
  return p.prefix + incrementLetters(p.letters);
}

/** Does this value belong to the same pattern family as the seed? */
export function matchesSeed(value, seed) {
  const a = derivePattern(value), b = derivePattern(seed);
  if (!a || !b) return false;
  if (a.prefix !== b.prefix) return false;
  if (a.width !== b.width) return false;
  return a.letters.length === b.letters.length;
}

/**
 * Next free value for a seeded house: walk forward from the seed until a
 * value nobody holds turns up.
 */
export function nextSeededValue(seed, taken) {
  let v = normalizeChest(seed);
  if (!v) return null;
  for (let guard = 0; guard < 100000; guard++) {
    if (!taken.has(v)) return v;
    const next = nextChestValue(v);
    if (!next || next === v) break;
    v = next;
  }
  throw new Error("Could not find a free chest number from the pattern " + seed + ".");
}

/* ══ Ranges (digits format only) ══════════════════════════════════════ */

const rangeOf = h => {
  const start = Number(h?.chestRangeStart), end = Number(h?.chestRangeEnd);
  return (start && end && end >= start) ? { start, end } : null;
};

export const hasRange = h => !!rangeOf(h);

/** Ranges that overlap each other. Used both to block a save and to audit. */
export function overlappingRanges(houses) {
  const withRange = (houses || [])
    .map(h => ({ id: h.id, name: h.name, ...(rangeOf(h) || {}) }))
    .filter(h => h.start)
    .sort((a, b) => a.start - b.start);

  const clashes = [];
  for (let i = 1; i < withRange.length; i++) {
    const prev = withRange[i - 1], cur = withRange[i];
    if (cur.start <= prev.end) {
      clashes.push(`${prev.name} (${prev.start}-${prev.end}) overlaps ${cur.name} (${cur.start}-${cur.end})`);
    }
  }
  return clashes;
}

/**
 * Would this range clash with another house's? Returns a message or null.
 *
 * Checked in the house dialog BEFORE saving. v6 computed the clash and
 * rendered it as a notice after the fact, which is a warning nobody acts on.
 */
export function rangeClash({ houseId, start, end, houses }) {
  const s = Number(start), e = Number(end);
  if (!s || !e) return null;
  if (e < s) return "The range ends before it starts.";
  for (const h of houses || []) {
    if (h.id === houseId) continue;
    const r = rangeOf(h);
    if (!r) continue;
    if (s <= r.end && r.start <= e) {
      return `That range overlaps ${h.name} (${r.start}–${r.end}). Ranges must not share numbers.`;
    }
  }
  return null;
}

/** Which house, if any, owns this numeric value. */
export function rangeOwner(value, houses) {
  const n = Number(normalizeChest(value));
  if (isNaN(n)) return null;
  for (const h of houses || []) {
    const r = rangeOf(h);
    if (r && n >= r.start && n <= r.end) return h;
  }
  return null;
}

/**
 * Is this explicit chest number allowed for this participant's house?
 *
 * THE v6 BUG (I28): auto-allocation respected a house's range, but a typed
 * chest number was only checked for uniqueness — so a Blue participant could
 * be handed 150 out of Red's range. Ownership is now enforced on explicit
 * entry too, in both range and seeded modes.
 *
 * Returns an error message, or null when the value is fine.
 */
export function ownershipError({ value, house, houses, settings }) {
  const v = normalizeChest(value);
  if (!v) return null;
  const format = settings?.chestFormat || "digits";

  if (format === "digits") {
    if ((settings?.chestAllocation || "houseRange") !== "houseRange") return null;
    const owner = rangeOwner(v, houses);
    const own = rangeOf(house);
    if (own) {
      const n = Number(v);
      if (isNaN(n)) return "This fest uses digit-only chest numbers.";
      if (n < own.start || n > own.end) {
        return `${house.name} owns chest numbers ${own.start}–${own.end}. ` +
               (owner ? `${n} belongs to ${owner.name}.` : `${n} is outside that range.`);
      }
      return null;
    }
    // No range of its own: may use anything nobody else owns.
    if (owner && owner.id !== house?.id) {
      return `Chest number ${v} is inside ${owner.name}'s range.`;
    }
    return null;
  }

  // Seeded formats — the value must match this house's own pattern.
  if (!house?.chestSeed) return null;      // no seed yet: the admin is setting one
  if (!matchesSeed(v, house.chestSeed)) {
    return `${house.name} uses the pattern ${house.chestSeed}. "${v}" does not match it.`;
  }
  const otherSeeded = (houses || []).find(h =>
    h.id !== house.id && h.chestSeed && matchesSeed(v, h.chestSeed));
  if (otherSeeded) {
    return `Chest number ${v} matches ${otherSeeded.name}'s pattern.`;
  }
  return null;
}

/* ══ Allocation ═══════════════════════════════════════════════════════ */

/**
 * Decide one chest number. PURE — takes the counter value as an argument
 * rather than fetching it, which is what lets a 300-row import allocate
 * every number in memory and commit in two round trips instead of six
 * hundred (§14.1).
 *
 * Returns { value, counter } where `counter` is the shared counter after
 * this allocation, so the caller can thread it through a loop and raise the
 * stored counter once at the end.
 */
export function allocateChest({ explicit, house, houses, settings, taken, counter = 0 }) {
  const format = settings?.chestFormat || "digits";
  const allocation = settings?.chestAllocation || "houseRange";

  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== "") {
    const v = normalizeChest(explicit);
    if (format === "digits" && !/^\d+$/.test(v)) {
      throw new Error("This fest uses digit-only chest numbers, so " + v + " is not valid.");
    }
    if (format === "alphabets" && !/^[A-Z]+$/.test(v)) {
      throw new Error("This fest uses letter-only chest numbers, so " + v + " is not valid.");
    }
    if (taken.has(v)) throw new Error(`Chest number ${v} is already used.`);
    const owned = ownershipError({ value: v, house, houses, settings });
    if (owned) throw new Error(owned);
    const asNum = Number(v);
    return { value: v, counter: (!isNaN(asNum) && asNum > counter) ? asNum : counter };
  }

  if (format !== "digits") {
    if (!house?.chestSeed) {
      throw new Error(
        `${house?.name || "This house"} has no chest number pattern yet. ` +
        `Add the first participant with a chest number typed in — for example RED-A01 — ` +
        `and the rest will follow that pattern automatically.`);
    }
    return { value: nextSeededValue(house.chestSeed, taken), counter };
  }

  if (allocation === "houseRange") {
    const r = rangeOf(house);
    if (r) {
      for (let n = r.start; n <= r.end; n++) {
        const v = String(n);
        if (!taken.has(v)) return { value: v, counter: Math.max(counter, n) };
      }
      throw new Error(
        `${house.name}'s chest range ${r.start}-${r.end} is full. Widen it in Accounts before adding more participants.`);
    }
  }

  // Shared sequence — skipping anything another house owns by range.
  let n = Math.max(1, counter + 1);
  for (let guard = 0; guard < 200000; guard++, n++) {
    const v = String(n);
    if (taken.has(v)) continue;
    if (allocation === "houseRange") {
      const owner = rangeOwner(v, houses);
      if (owner && owner.id !== house?.id) continue;
    }
    return { value: v, counter: n };
  }
  throw new Error("Could not find a free chest number.");
}

/**
 * Derive a house's pattern seed from a manually typed value, if it does not
 * have one. This is what "add one participant manually then the web app can
 * auto assign in its pattern" means in practice.
 */
export function seedFromValue(house, value, settings) {
  const format = settings?.chestFormat || "digits";
  if (format === "digits") return null;
  if (house?.chestSeed) return null;
  const v = normalizeChest(value);
  return derivePattern(v) ? v : null;
}

/* ══ Firestore edges ══════════════════════════════════════════════════ */

/** Every chest number already in use, normalised. One read of participants. */
export async function takenChestNumbers() {
  const rows = await getAll("participants");
  return new Set(rows.map(p => normalizeChest(p.chestNumber)).filter(Boolean));
}

/** The shared counter, read once. */
export async function readChestCounter() {
  const c = await getOne("config", "counters").catch(() => null);
  const n = Number(c?.chestNumber);
  return isNaN(n) ? 0 : n;
}

/** Push the stored counter up to at least `atLeast`. Called once per bulk run. */
export async function raiseChestCounter(atLeast) {
  const target = Number(atLeast);
  if (!target || isNaN(target)) return;
  await runTransaction(db, async tx => {
    const ref = docRef("config", "counters");
    const snap = await tx.get(ref);
    const current = (snap.exists() ? snap.data().chestNumber : 0) || 0;
    if (target > current) tx.set(ref, { chestNumber: target }, { merge: true });
  });
}

/** Single-participant convenience wrapper: allocate and persist the counter. */
export async function allocateChestNumber({ explicit, house, houses, settings, taken }) {
  const counter = await readChestCounter();
  const out = allocateChest({ explicit, house, houses, settings, taken, counter });
  if (out.counter > counter) await raiseChestCounter(out.counter);
  return out.value;
}

// Fest timezone handling.
//
// Schedule times are WALL-CLOCK times where the fest happens: "10:30" means
// half past ten there, not half past ten wherever the reader is sitting.
//
// v8.5 stored a single fixed UTC offset captured at setup. That is correct
// for India, which has no daylight saving, and wrong for anywhere that
// does — a fest spanning the changeover would drift by an hour partway
// through, and even before the changeover the stored offset would be the
// one that happened to apply on the day setup was run.
//
// This module resolves the offset PER DATE using the browser's own IANA
// timezone database, via Intl. No library, no build step.

/** The zone the current device is in — a suggestion, never assumed. */
export function detectZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
  catch { return null; }
}

/** Is this a timezone name the browser actually understands? */
export function isValidZone(zone) {
  if (!zone) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; }
  catch { return false; }
}

/**
 * A usable list of zones for a picker.
 *
 * `supportedValuesOf` gives the full IANA set on modern browsers. Where it
 * is missing, a short curated list keeps the picker functional rather than
 * empty — an organiser can still type their own zone in.
 */
export function zoneList() {
  try {
    const all = Intl.supportedValuesOf?.("timeZone");
    if (all?.length) return all;
  } catch { /* fall through */ }
  return [
    "Asia/Kolkata", "Asia/Dubai", "Asia/Muscat", "Asia/Karachi", "Asia/Dhaka",
    "Asia/Colombo", "Asia/Kathmandu", "Asia/Singapore", "Asia/Kuala_Lumpur",
    "Asia/Jakarta", "Asia/Manila", "Asia/Tokyo", "Asia/Riyadh", "Asia/Qatar",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Australia/Sydney", "Australia/Perth", "Africa/Nairobi", "Africa/Lagos", "UTC"
  ];
}

/**
 * How far ahead of UTC `zone` is AT A GIVEN INSTANT, in minutes.
 *
 * Works by formatting the instant in that zone, reading the wall-clock
 * fields back, and measuring the gap. This is what makes it DST-correct:
 * ask about a July instant and you get the summer offset, ask about a
 * January one and you get the winter offset.
 */
export function offsetMinutesAt(zone, instant) {
  if (!isValidZone(zone)) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(instant)).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  // Hour 24 appears at midnight in some locales; normalise it.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return Math.round((asUTC - instant) / 60000);
}

/**
 * Turn a fest-local wall-clock reading into an instant.
 *
 * The subtlety: to know the offset we need the instant, and to know the
 * instant we need the offset. So this guesses once, then corrects — which
 * settles it for every real case including the hour either side of a DST
 * changeover.
 *
 * With no zone recorded, it falls back to the reader's own local time.
 * That is right for everyone in the fest's own timezone and no worse than
 * having no timezone support at all.
 */
export function wallClockToEpoch(date, hhmm, zone = null) {
  if (!date || !hhmm) return null;

  if (!isValidZone(zone)) {
    const local = Date.parse(`${date}T${hhmm}:00`);
    return isNaN(local) ? null : local;
  }

  const naive = Date.parse(`${date}T${hhmm}:00Z`);
  if (isNaN(naive)) return null;

  // First pass: assume the offset that applies at the naive instant.
  const guess = offsetMinutesAt(zone, naive);
  if (guess === null) return naive;
  let instant = naive - guess * 60000;

  // Second pass: the true offset at that instant may differ across a DST
  // boundary. One correction is always enough.
  const actual = offsetMinutesAt(zone, instant);
  if (actual !== null && actual !== guess) instant = naive - actual * 60000;

  return instant;
}

/** "Asia/Kolkata (UTC+5:30)" — for showing the current setting. */
export function describeZone(zone, instant = Date.now()) {
  if (!isValidZone(zone)) return "not set";
  const off = offsetMinutesAt(zone, instant);
  if (off === null) return zone;
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `${zone} (UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""})`;
}

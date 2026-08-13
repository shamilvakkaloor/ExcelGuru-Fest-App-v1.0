// Background republishing — ARCHITECTURE section 12.
//
// THE PROBLEM
// Every settings save called rebuildPublicSnapshots() and waited for it. A
// rebuild is four collection reads, then one write per published event PLUS
// one write per participant. At 600 participants that is roughly 700 writes
// before the Save button releases — the three-to-four second pause.
//
// THE FIX
// The write commits and the dialog closes at once. The rebuild runs behind a
// small indicator. Several saves in quick succession collapse into one run.
//
// THE TRADE-OFF, STATED
// Closing the tab mid-rebuild leaves the public pages behind the private
// data. A `snapshotDirty` flag on config/festSettings survives reload and
// drives a persistent banner with a one-press fix. Silent staleness would be
// worse than the wait; a visible flag is not.
import { patch, invalidateConfig } from "../lib/db.js";
import { rebuildPublicSnapshots, rebuildScheduleSnapshot } from "./publish.js";

let pending = null;      // timer for the debounce window
let running = false;
let queued = { results: false, schedule: false };
const DEBOUNCE_MS = 900;

const listeners = new Set();
export function onRepublish(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = state => listeners.forEach(fn => { try { fn(state); } catch (e) {} });

/** Has an edit landed that the public snapshots have not picked up yet? */
export async function setDirty(value) {
  try {
    await patch("config", "festSettings", { snapshotDirty: !!value });
    invalidateConfig("config", "festSettings");
  } catch (e) {
    // A failed flag write must never block the edit that triggered it.
    console.error("Could not update the republish flag", e);
  }
}

/**
 * Ask for a rebuild. Returns immediately.
 *
 * `what` names which snapshots the edit can actually affect, so renaming a
 * house does not rebuild the schedule and adding a slot does not rewrite six
 * hundred participant cards.
 */
export function queueRepublish(what = { results: true, schedule: false }) {
  queued.results  ||= !!what.results;
  queued.schedule ||= !!what.schedule;

  setDirty(true);
  emit({ state: "pending" });

  clearTimeout(pending);
  pending = setTimeout(run, DEBOUNCE_MS);
}

async function run() {
  if (running) { pending = setTimeout(run, DEBOUNCE_MS); return; }
  const job = queued;
  queued = { results: false, schedule: false };
  if (!job.results && !job.schedule) return;

  running = true;
  emit({ state: "running" });
  try {
    if (job.schedule) await rebuildScheduleSnapshot();
    if (job.results) await rebuildPublicSnapshots();
    await setDirty(false);
    emit({ state: "done" });
  } catch (err) {
    console.error("Republish failed", err);
    // Put the work back so the banner keeps offering it.
    queued.results ||= job.results;
    queued.schedule ||= job.schedule;
    emit({ state: "failed", error: err?.message || String(err) });
  } finally {
    running = false;
  }
}

/** Republish immediately and wait — for the banner's button and for publish. */
export async function republishNow(what = { results: true, schedule: true }) {
  clearTimeout(pending);
  queued.results  ||= !!what.results;
  queued.schedule ||= !!what.schedule;
  await run();
}

export const isRepublishing = () => running || !!queued.results || !!queued.schedule;

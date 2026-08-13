// Thin, opinionated wrapper over Firestore. Every page talks to the
// database through this module, so read-cost decisions live in one place.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, orderBy, limit, onSnapshot, writeBatch,
  runTransaction, serverTimestamp, increment, deleteField
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from "./firebase.js";

export { where, orderBy, limit, serverTimestamp, increment, deleteField, runTransaction, db };

/** Read one document. Returns null if it does not exist. */
/* ── Config cache — ARCHITECTURE section 12, P4 ──────────────────────
 * config/* and pointsConfig/* are read on nearly every page render — eight
 * documents per navigation — and change perhaps twice in the life of a fest.
 * They are cached for the session and dropped on any write to them.
 */
const CACHED_PATHS = new Set(["config", "pointsConfig"]);
const configCache = new Map();
const cacheKey = (path, id) => path + "/" + id;

export function invalidateConfig(path, id) {
  if (id === undefined) {
    for (const k of [...configCache.keys()]) if (k.startsWith(path + "/")) configCache.delete(k);
  } else {
    configCache.delete(cacheKey(path, id));
  }
}
export function clearConfigCache() { configCache.clear(); }

export async function getOne(path, id) {
  const _cacheable = CACHED_PATHS.has(path);
  if (_cacheable) {
    const hit = configCache.get(cacheKey(path, id));
    if (hit !== undefined) return hit;
  }
  const snap = await getDoc(doc(db, path, id));
  const out = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (_cacheable) configCache.set(cacheKey(path, id), out);
  return out;
}

/** Read a whole collection, optionally filtered. */
export async function getAll(path, ...constraints) {
  const snap = await getDocs(query(collection(db, path), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Create or overwrite a document at a known id. */
export async function put(path, id, data, merge = true) {
  if (CACHED_PATHS.has(path)) invalidateConfig(path, id);
  await setDoc(doc(db, path, id), data, { merge });
  return id;
}

/** Create a document with a generated id. */
export async function add(path, data) {
  if (CACHED_PATHS.has(path)) invalidateConfig(path, undefined);
  const ref = await addDoc(collection(db, path), data);
  return ref.id;
}

export async function patch(path, id, data) {
  if (CACHED_PATHS.has(path)) invalidateConfig(path, id);
  await updateDoc(doc(db, path, id), data);
}

export async function remove(path, id) {
  if (CACHED_PATHS.has(path)) invalidateConfig(path, id);
  await deleteDoc(doc(db, path, id));
}

/** Live subscription to a collection. Returns an unsubscribe function. */
export function watch(path, cb, ...constraints) {
  return onSnapshot(query(collection(db, path), ...constraints), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error("watch(" + path + ")", err));
}

/** Live subscription to a single document. */
export function watchDoc(path, id, cb) {
  return onSnapshot(doc(db, path, id), snap => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, err => console.error("watchDoc(" + path + "/" + id + ")", err));
}

/**
 * Apply many writes atomically, transparently splitting into chunks of 400.
 * Firestore caps a batch at 500 operations; wiping a fest or publishing a
 * large event exceeds that, so every bulk path in the app routes through here.
 *
 * ops: [{ type: 'set'|'update'|'delete', path, id, data?, merge? }]
 */
export async function batchWrite(ops) {
  for (const op of ops || []) if (CACHED_PATHS.has(op.path)) invalidateConfig(op.path, op.id);
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      const ref = doc(db, op.path, op.id);
      if (op.type === "delete") batch.delete(ref);
      else if (op.type === "update") batch.update(ref, op.data);
      else batch.set(ref, op.data, { merge: op.merge !== false });
    }
    await batch.commit();
  }
}

/** Reserve the next value of a named counter. Atomic across concurrent users. */
export async function nextCounter(name, count = 1) {
  const ref = doc(db, "config", "counters");
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const current = (snap.exists() ? snap.data()[name] : 0) || 0;
    tx.set(ref, { [name]: current + count }, { merge: true });
    return current + 1;              // first reserved value
  });
}

/** Bump a counter so it sits above a manually supplied value. */
export async function raiseCounter(name, atLeast) {
  const ref = doc(db, "config", "counters");
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const current = (snap.exists() ? snap.data()[name] : 0) || 0;
    if (atLeast > current) tx.set(ref, { [name]: atLeast }, { merge: true });
  });
}

export function docRef(path, id) { return doc(db, path, id); }
export function colRef(path) { return collection(db, path); }

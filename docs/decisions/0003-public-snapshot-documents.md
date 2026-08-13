# ADR-0003: Public pages read pre-built snapshot documents

## Status
Accepted

## Date
2026-08-02

## Context

Firestore's free tier allows 50,000 document reads per day, and Firestore
bills per document read rather than per query.

A results page that reads result rows directly is catastrophic here. A fest
with 100 events averaging 20 entries holds roughly 2,000 result documents.
Five hundred spectators loading that page consume 1,000,000 reads — twenty
times the daily allowance, exhausted within minutes of the first results
going up, which is precisely the moment the page matters most.

## Decision

The public never reads the working collections. On publish, the app writes
denormalised snapshot documents:

- `publicResults/{eventId}` — one document holding that event's entire ranked
  table as an array
- `publicLeaderboard/main` — one document with house and student standings
- `publicSchedule/main` — one document with every venue and slot
- `participantPublic/{id}` — one small card per participant for lookup

A spectator loading `/#/results` costs 2–4 reads. Five hundred spectators cost
about 2,000 reads against a 50,000 budget.

Participant names are copied into result rows at finalize time so a
leaderboard rebuild never has to read the participants collection.

## Consequences

**Good**
- Read cost is independent of participant count
- Public pages stay fast without caching infrastructure
- Snapshot rebuild is a full recompute from published results, which removes
  a whole class of drift bug where a correction leaves a stale public number

**Bad**
- Data is duplicated; the snapshots are derived state that can go stale if a
  rebuild is missed. Every mutation path that affects standings calls
  `rebuildPublicSnapshots()`.
- Firestore's 1 MiB document ceiling caps the leaderboard snapshot. At 600
  participants it is roughly 100 KB, so there is ample headroom, but beyond
  about 3,000 participants the document would need sharding.
- Publishing costs one write per published event plus one per participant
  entry, rather than a single flag flip.

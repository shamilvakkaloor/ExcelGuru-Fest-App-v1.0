# ADR-0002: Security Rules as the permission system, not Cloud Functions

## Status
Accepted

## Date
2026-08-02

## Context

The original architecture put all writes behind callable Cloud Functions,
with Firestore Security Rules as a secondary defence. Cloud Functions require
the Blaze plan, which requires a linked credit card. Cloud Storage has
required Blaze since February 2026 as well.

A card requirement is a hard adoption blocker for the target user, and it
introduces the risk of an unexpected bill on a school's account.

## Decision

Remove Cloud Functions and Cloud Storage entirely. Firestore Security Rules
become the sole and primary permission boundary. Business logic runs in the
browser; the rules decide whether the resulting writes are permitted.

Specifically:

- Auth via Firebase Auth email/password with synthetic addresses
  (`judge-3@festlogin.local`). Roles live in `/users/{uid}`, writable only by
  an Admin, and read by the rules.
- Scoring, ranking and aggregation run in the Admin's browser and write
  results. Rules reject result writes from any other role.
- Publish-is-Admin-only is enforced on the `results.publishStatus` field
  transition, which rules can inspect via `request.resource.data`.
- Registration windows are enforced by comparing `request.time` against the
  event's window inside the rules.
- Photos are external Google Drive links; no Storage bucket is used.

## Consequences

**Good**
- Runs on the free Spark plan with no billing account
- One less deployment artifact; the rules file is pasted once
- No cold starts — a real benefit during live scoring
- Security is not weakened: rules were always the enforcing layer for direct
  client access, and now everything goes through them

**Bad**
- Rules are harder to write and reason about than server code
- Some invariants cannot be expressed. Per-class participant caps are
  enforced in a client transaction with only the overall maximum re-checked
  in rules; a determined House Manager using devtools could exceed a
  per-class cap. The compliance report and admin review are the backstop.
- A Co-Admin can write to `publicResults`, which a Function could have
  prevented. Accepted: Co-Admin is already a trusted role that can finalize.
- Heavy work (bulk PDF) runs on the organiser's laptop rather than a server

## Alternatives considered

- **Blaze with a budget alert.** Rejected: still needs a card, and budget
  alerts notify rather than block.
- **Serverless functions on Vercel or Netlify free tiers** using the Firebase
  Admin SDK. Viable and genuinely free, but reintroduces a build and deploy
  pipeline, defeating ADR-0001.

# Plan Formats Reference

This document provides complete examples of both plan types and the decision log format used by the exec-plan skill.

---

## Lightweight Plan

Use a lightweight plan when the work is estimated under 2 hours, touches fewer than 5 files, and addresses a single concern. This is the default choice -- only upgrade to a full plan when the scope genuinely demands it.

### Example

```markdown
# Lightweight Plan: Add Rate Limiting to API Gateway

**Created**: 2026-02-10
**Scope**: Add per-client rate limiting to the /api/v2 endpoints
**Estimated**: 1.5 hours

## Goal
Implement token-bucket rate limiting on the API gateway to prevent abuse, returning 429 responses when clients exceed 100 requests per minute.

## Steps
- [ ] Add rate-limiter middleware to src/middleware/rate-limit.ts
- [ ] Configure per-route limits in config/api-gateway.yaml
- [ ] Add rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset) to responses
- [ ] Write integration tests for rate limiting behavior
- [ ] Update API docs with rate limit information

## Notes
Using token-bucket algorithm over sliding window because it handles bursts better and the library we already depend on (bottleneck) supports it natively.

## Outcome
{Fill in when complete}
```

---

## Full Execution Plan

Use a full execution plan for multi-day work, efforts with multiple phases, cross-cutting concerns that touch many parts of the codebase, or work that benefits from decision tracking and tech debt awareness.

### Example

```markdown
# Execution Plan: Migrate Authentication from JWT to Session-Based Auth

**Created**: 2026-02-10
**Author**: Nabil
**Status**: In Progress
**Priority**: P1
**Estimated effort**: 3 days

## Context
Our JWT implementation has grown unwieldy -- tokens carry too much payload data, refresh
token rotation is error-prone, and we cannot revoke tokens server-side without maintaining
a blocklist (which defeats the purpose). Moving to session-based auth simplifies revocation,
reduces token size, and aligns with our move toward server-side rendering.

Relates to: PROJ-442, PROJ-389

## Success Criteria
- [ ] All API endpoints authenticate via session cookies instead of JWT
- [ ] Existing user sessions are preserved during migration (no forced logouts)
- [ ] Session revocation works within 1 second
- [ ] Load test shows no regression beyond 5% on p99 latency
- [ ] Zero downtime deployment

## Phases

### Phase 1: Session Infrastructure
**Status**: Complete
- [x] Set up Redis-backed session store (src/infra/session-store.ts)
- [x] Implement session middleware with configurable TTL
- [x] Add session creation on login, destruction on logout
- [x] Write unit tests for session lifecycle

### Phase 2: Dual-Auth Migration Layer
**Status**: In Progress
- [x] Create middleware that accepts both JWT and session cookies
- [ ] Add feature flag to control rollout percentage
- [ ] Implement session creation on JWT-authenticated requests (gradual migration)
- [ ] Add monitoring dashboard for auth method distribution

### Phase 3: JWT Removal
**Status**: Not Started
- [ ] Switch default auth to session-only
- [ ] Remove JWT generation from login flow
- [ ] Clean up JWT verification code and dependencies
- [ ] Update API documentation
- [ ] Remove jsonwebtoken and related packages from dependencies

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-02-10 | Use Redis for session store | Need sub-ms lookups and built-in TTL expiry; team already operates Redis in production | PostgreSQL sessions (too slow for auth-path), DynamoDB (adds new infra dependency) |
| 2026-02-11 | Dual-auth migration instead of big-bang cutover | Allows gradual rollout and instant rollback; zero-downtime requirement rules out flag day | Big-bang migration with maintenance window, parallel-run with request duplication |
| 2026-02-11 | 24-hour session TTL with sliding window | Balances security (short-lived) with UX (no re-login during work day) | 1-hour fixed TTL (too aggressive), 7-day TTL (too permissive) |

## Tech Debt Incurred
- Dual-auth middleware adds complexity; must be removed in Phase 3, not left lingering
- Session store uses a flat key structure; should namespace by tenant before multi-tenancy work begins

## Completion Notes
{Fill in when complete: what was delivered, what was deferred, lessons learned}
```

---

## Decision Log Format

The decision log table captures choices made during execution. Not every small decision needs logging -- focus on decisions that someone revisiting this work later would want to understand.

### When to Log a Decision

**Architecture choices** -- Decisions about system structure, data flow, or component boundaries. These are hard to reverse and future developers will want to know why the system is shaped the way it is.

**Library or tool selections** -- When you chose one library over another, or decided to build vs. buy. Include what you evaluated and why you picked what you picked.

**Scope changes** -- When something gets added to or removed from the plan. Record what changed and why, so there is no ambiguity about what was intentionally deferred versus forgotten.

**Approach pivots** -- When the implementation strategy changes mid-execution. The original approach matters as context -- it explains why early commits might look different from later ones.

**Trade-offs accepted** -- When you knowingly chose a suboptimal path for pragmatic reasons. This is especially important for tech debt: record what you traded away and what you got in return.

### Decision Log Entry Format

Each entry in the table has four columns:

| Column | Purpose |
|--------|---------|
| **Date** | When the decision was made. Helps establish timeline. |
| **Decision** | What was decided, stated clearly and concisely. |
| **Rationale** | Why this choice was made. Include constraints that drove the decision. |
| **Alternatives Considered** | What else was evaluated. Helps future developers understand the decision space. |

### Tips

- Write decisions in past tense ("Chose X" or "Decided to Y") so they read as a log, not a proposal.
- Keep rationale focused on constraints and facts, not preferences.
- For alternatives, a brief note is sufficient -- you do not need full evaluations.
- If a decision reverses a previous one, reference the earlier entry.

# Zulip Meeting Scheduler – Software Engineering Practices

## Overview

This document records the engineering decisions, practices, and conventions adopted while building the Meeting Scheduler feature. It is intended for current and future contributors who need to understand not just *what* was built, but *why* specific approaches were chosen and what tradeoffs were made.

---

## Architecture Decisions

### Decision 1: Use Zulip's Submessage/Widget System for RSVP State

**Decision:** RSVP responses for fixed-time meetings are stored and propagated via Zulip's existing submessage pipeline rather than a custom REST endpoint.

**Rationale:** Zulip's submessage system already handles the core challenges of real-time interactive message widgets (the poll widget uses the same mechanism). Reusing it meant we got event propagation, client-side state sync, and persistence for free, without introducing a new data path.

**Tradeoff:** The widget system imposes constraints on data structure and is less introspectable than a dedicated table. We accepted this for RSVP because individual responses are ephemeral UI state. For the Propose flow, where responses need to be aggregated and ranked server-side, we use a dedicated `MeetingResponse` database table.

**Where to find it:** `web/src/rsvp_widget.ts`, `web/src/propose_widget.ts`, `zerver/views/meetings.py`

---

### Decision 2: Separate Database Models for Proposed Meetings

**Decision:** Proposed meetings use three dedicated Django models (`Meeting`, `MeetingSlot`, `MeetingResponse`) rather than embedding data in message content.

**Rationale:** The Propose flow requires server-side aggregation (ranking slots by availability count), deadline enforcement, and the ability to confirm a slot after the fact. None of this is practical if the source of truth lives in message text or submessage blobs.

**Tradeoff:** More schema complexity and migration overhead. We chose this because correctness and queryability outweigh convenience for this flow.

**Where to find it:** `zerver/models/meetings.py`

---

### Decision 3: Backend-Authoritative Stream Creation

**Decision:** New channel/stream creation is handled entirely in `meeting_actions.py` on the server, not by the frontend making a separate stream-creation API call.

**Rationale:** Zulip's permission model for stream creation is complex (realm-level policies, invite-only settings, etc.). Delegating this to a single backend function (`do_create_meeting`) ensures we always go through the same validation path as the rest of Zulip and cannot accidentally create unauthorized streams.

**Tradeoff:** The frontend cannot give per-step feedback about stream creation failure; errors surface as a single failure response from `POST /json/meetings`. This is acceptable — partial success (meeting created but stream failed) would be a worse UX than a clean error.

**Where to find it:** `zerver/lib/meeting_actions.py` → `do_create_meeting`

---

### Decision 4: Upsert Semantics for Availability Responses

**Decision:** `PATCH /json/meetings/<id>/responses` uses upsert logic (`update_or_create`) rather than insert-only.

**Rationale:** Users should be able to update their availability before the deadline. Upsert keeps the endpoint idempotent and the data model simple (one row per user-slot pair) via `unique_together` on `(slot, user)`.

**Where to find it:** `zerver/lib/meeting_actions.py` → `do_upsert_responses`

---

### Decision 5: Deadline Enforcement is Server-Side Only

**Decision:** The frontend disables submission UI after the deadline, but all deadline checks are re-validated on the server.

**Rationale:** Client-side enforcement is a UX affordance, not a security boundary. A malicious or stale client could bypass it. All `PATCH /responses` requests check the meeting deadline server-side before writing.

**Where to find it:** `zerver/lib/meeting_actions.py` → `do_upsert_responses` deadline check

---

## Code Organization Conventions

### Backend: Thin Views, Fat Actions

We follow Zulip's existing convention:

- **Views** (`zerver/views/meetings.py`): Parse and validate request parameters, call action functions, return responses. No business logic.
- **Actions** (`zerver/lib/meeting_actions.py`): All business logic lives here. Functions are prefixed `do_*` to match Zulip conventions (e.g., `do_create_meeting`, `do_confirm_meeting`).
- **Models** (`zerver/models/meetings.py`): Schema definition only. No logic beyond `Meta` and `__str__`.

This separation makes logic testable in isolation and keeps views reviewable at a glance.

### Frontend: Logic Separate from Rendering

- **`add_meeting_ui.ts`**: Orchestrates modals, form state, validation, and API calls. This is the main entry point.
- **`add_meeting.ts`**: Dropdown configuration only.
- **`rsvp_widget.ts` / `propose_widget.ts`**: Widget rendering and event handling. These files do not make API calls — they only update UI from submessage data.

Templates (Handlebars) handle all HTML generation; TypeScript files never construct HTML strings.

---

## API Design Decisions

### RESTful Endpoint Structure

| Endpoint | Method | Purpose |
|---|---|---|
| `/json/meetings` | POST | Create a meeting (RSVP or Propose) |
| `/json/meetings/<id>` | GET | Fetch meeting + slots |
| `/json/meetings/<id>/responses` | GET | Fetch ranked slot availability |
| `/json/meetings/<id>/responses` | PATCH | Submit or update availability |
| `/json/meetings/<id>/confirm` | POST | Confirm a final slot |

**Why POST for confirm?** Confirming a meeting is an action that changes state (`status`, `confirmed_slot`) and triggers a downstream side effect (posting a confirmation message to the channel). PUT/PATCH implies idempotent partial updates; POST better signals this is a one-way state transition.

### Single `POST /json/meetings` for Both Meeting Types

Rather than two endpoints (`/json/rsvp-meetings` and `/json/proposed-meetings`), both types are created through one endpoint with a `type` parameter (`"rsvp"` or `"proposal"`). This reflects the shared creation flow (invitees, optional channel creation, topic) and reduces the surface area for access control bugs.

---

## Testing Practices

### Backend: 100% Coverage on Core Logic

All business logic files achieved 100% statement and branch coverage:

- `zerver/lib/meeting_actions.py`
- `zerver/models/meetings.py`
- `zerver/views/meetings.py`

Run with:

```bash
./tools/test-backend --coverage zerver/tests/test_meetings.py
```

**What we test:** We test outcomes, not internals. Tests assert database state after actions, not that specific internal functions were called. For example, after `do_create_meeting` with `create_channel=True`, we assert the stream exists and the invitees are subscribed — not that `do_create_stream` was invoked.

### Frontend: Pragmatic Coverage Targets

Frontend test coverage varies by file:

- `rsvp_data.test.cjs`: 100% — pure data transformation logic, fully testable in Node.
- `rsvp_widget.test.cjs`: 79% — some rendering paths depend on DOM state that zjquery mocks minimally.
- `add_meeting_ui.test.cjs`: 56% — modal interactions and flatpickr integration are browser-dependent.

We do not chase 100% frontend coverage at the cost of brittle tests. DOM-heavy paths are verified manually in the dev server.

Run with:

```bash
./tools/test-js-with-node --coverage web/tests/<filename>
```

### No Mocked Databases in Backend Tests

Backend tests use Django's test database (SQLite in memory). We do not mock ORM calls. This caught several real bugs during development where upsert and `unique_together` constraints behaved differently under test conditions than we expected from mocking.

### Manual Testing Checklist

Before marking any feature complete, verify:

- [ ] Create RSVP meeting as organizer; confirm message appears
- [ ] RSVP as invitee (Accept / Decline / Tentative); confirm real-time update
- [ ] Create Propose meeting; confirm message and deadline appear
- [ ] Submit availability as multiple users; confirm grid updates
- [ ] View ranked availability as organizer; confirm sort order
- [ ] Confirm a slot; confirm finalization message posted to channel
- [ ] Attempt to submit after deadline; confirm rejection
- [ ] Create meeting with external invitee; confirm new channel created and invitees subscribed

---

## Security Practices

### Access Control Checks

Every mutating endpoint validates the caller's identity before acting:

- **Response submission (`PATCH /responses`):** Validates that the requesting user is in the invitee list.
- **Slot confirmation (`POST /confirm`):** Validates that the requesting user is the meeting owner.
- **Stream creation:** Delegated to Zulip's existing `do_create_stream`, which enforces realm-level policies.

These checks are in `meeting_actions.py`, not in views, so they apply regardless of how the function is called.

### No SQL String Formatting

All database queries use Django ORM. We do not use `cursor.execute()` with string formatting anywhere in the meeting feature.

### Input Validation

Request parameters are validated using Zulip's typed argument system before reaching action functions. Validation rejects:

- Past datetimes for meeting slots or deadlines
- Empty invitee lists
- Invalid user IDs (users not in the realm)
- Mismatched meeting type vs. payload (e.g., sending `times` array for an RSVP meeting)

---

## Frontend Conventions

### TypeScript-First

All new frontend files are `.ts`. We use strict typing throughout — no `any` except where wrapping Zulip's legacy untyped interfaces, always with a comment explaining why.

### Reuse Existing Zulip Components

We use Zulip's existing primitives rather than building equivalents:

- **`dropdown_widget`** for the compose-box meeting type selector
- **`user_pill`** for the invitee picker
- **`flatpickr`** for date/time inputs
- **`tippy.js`** for tooltips

This ensures visual consistency and avoids duplicating accessibility and keyboard navigation work.

### No `onclick` Attributes in HTML

Event handlers are attached via `addEventListener` or jQuery `.on()` in TypeScript. No `onclick=""` in Handlebars templates.

### DOM Guards in Node Test Environments

Any code that accesses `document` or DOM APIs checks for element existence before use. This is required because zjquery mocks the DOM minimally and accessing missing elements throws.

---

## Commit and Branching Practices

We followed Zulip's commit discipline throughout:

- Each commit is a minimal coherent idea (one logical change, with its tests)
- No commit breaks the build or leaves the codebase in a partially-working state
- Refactoring commits are separate from functional changes
- Commit messages explain *why*, not *what* — the diff already shows what changed

**Format:**

```
meetings: Short summary in 72 chars or fewer.

Body explains motivation, design decisions, and anything a reviewer
needs to know that isn't obvious from reading the diff.

Fixes #123.
```

Branch naming: `feature/meeting-scheduler-<area>` (e.g., `feature/meeting-scheduler-backend`, `feature/meeting-scheduler-rsvp-widget`).

---

## Known Limitations

These are documented constraints accepted for MVP scope, not oversights:

| Limitation | Reason deferred |
|---|---|
| No recurring meetings | High complexity; out of MVP scope |
| No per-date individual time ranges in Propose flow | UI complexity vs. value tradeoff |
| Limited timezone handling | Zulip itself has limited timezone infrastructure; we inherit its behavior |
| No calendar app integration (Google Calendar, etc.) | Out of scope; would require OAuth and external API work |
| UI may not scale well with many slots (>20) | Acceptable for a one-week availability window at 30-min granularity |

---

## Reference

| Resource | Location |
|---|---|
| User Manual | `USER_MANUAL.md` |
| Maintainer's Manual | `docs/maintainers-manual.md` |
| Backend tests | `zerver/tests/test_meetings.py` |
| Frontend tests | `web/tests/add_meeting_ui.test.cjs`, `rsvp_data.test.cjs`, `rsvp_widget.test.cjs` |
| Backend actions | `zerver/lib/meeting_actions.py` |
| Backend views | `zerver/views/meetings.py` |
| Database models | `zerver/models/meetings.py` |
| Frontend entry | `web/src/add_meeting_ui.ts` |
| Widgets | `web/src/rsvp_widget.ts`, `web/src/propose_widget.ts` |

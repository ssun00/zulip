# Zulip Meeting Scheduler – Software Engineering Practices

## Agile Workflow

The team followed an iterative, agile-inspired approach with 2-week sprints managed in Jira. Sprint planning meetings were held biweekly on Fridays at 1 PM. Each sprint produced a reviewable deliverable and ended with a client demo or code review; feedback from each demo fed directly into the next sprint's backlog.

| Dates | Milestone / Activities | Deliverables |
|---|---|---|
| Weeks 1–2 | Requirements refinement, architecture design, codebase familiarization | Finalized requirements and architecture plan |
| Weeks 3–4 | Backend data model design and API implementation for meeting requests and responses | Backend APIs and database schema changes |
| Weeks 5–6 | Frontend UI implementation for meeting creation and response handling | Frontend meeting request UI components |
| Weeks 7–8 | Integration of frontend and backend; meeting lifecycle logic; topic/channel creation | End-to-end meeting workflow prototype |
| Weeks 9–10 | Testing, refinement, and bug fixing; documentation preparation | Stabilized MVP and developer documentation |
| Final Week | Final demo preparation and report writing | Final demo and written report submission |

Key design decisions — including the When2Meet-style grid and cross-channel invite support — were confirmed with the client before backend implementation began, avoiding late-stage redesign.

---

## Architecture Decisions

**RSVP responses use the submessage/widget pipeline, not a REST endpoint.** The poll widget already solved the same problem. We get event propagation and persistence for free; the tradeoff is less introspectability, which is acceptable since RSVP state is ephemeral UI.

**Proposed meetings use dedicated DB models (`Meeting`, `MeetingSlot`, `MeetingResponse`).** The Propose flow needs server-side slot ranking (`COUNT + GROUP BY`), deadline enforcement, and post-deadline confirmation — none of which works if the source of truth is in message text or submessage blobs.

**Stream creation is handled entirely in `do_create_meeting`, not by the frontend.** Zulip's stream creation is subject to realm-level policies. Doing it server-side ensures we always go through the same permission path. The tradeoff is that stream failures surface as a single error from `POST /json/meetings` rather than a per-step message — acceptable since partial success would be worse.

**`PATCH /responses` uses upsert (`update_or_create`).** Users must be able to update availability before the deadline. `unique_together` on `(slot, user)` keeps one row per user-slot pair.

**Deadline enforcement is server-side only.** The frontend disables submission UI after the deadline as a UX affordance, but every `PATCH /responses` request re-validates the deadline on the server.

**Single `POST /json/meetings` endpoint for both meeting types** (distinguished by `type` parameter). Both flows share the same creation path — invitees, optional channel creation, topic — and a single endpoint reduces the access control surface.

---

## Testing

Backend core logic files all achieved 100% statement and branch coverage. Tests assert database state after actions — not that specific internal functions were called. We do not mock ORM calls; using Django's real test DB caught real bugs where `unique_together` constraints behaved differently than mocked equivalents.

Frontend coverage varies by file: `rsvp_data.test.cjs` (100%), `rsvp_widget.test.cjs` (79%), `add_meeting_ui.test.cjs` (56%). DOM-heavy paths that zjquery cannot mock are verified manually.

```bash
./tools/test-backend --coverage zerver/tests/test_meetings.py
./tools/test-js-with-node --coverage web/tests/<filename>
```

---

## Known Limitations

| Limitation | Reason |
|---|---|
| No recurring meetings | Out of MVP scope |
| No per-date individual time ranges | UI complexity vs. value tradeoff |
| No calendar app integration | Requires OAuth; out of scope |

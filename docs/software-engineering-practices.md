# Zulip Meeting Scheduler – Software Engineering Practices

## Agile Process

We used 2-week sprints managed in Jira, with planning meetings biweekly on Fridays at 1 PM. Each sprint ended with a client demo; feedback went straight into the next sprint's backlog. Our methodology was a hybrid waterfall/iterative method, in which we frontloaded requirements definition and architecture decisions, and then used iterative sprints. 

| Dates | Milestone / Activities | Deliverables |
|---|---|---|
| Weeks 1–2 | Requirements refinement, architecture design, codebase familiarization | Finalized requirements and architecture plan |
| Weeks 3–4 | Backend data model design and API implementation for meeting requests and responses | Backend APIs and database schema changes |
| Weeks 5–6 | Frontend UI implementation for meeting creation and response handling | Frontend meeting request UI components |
| Weeks 7–8 | Integration of frontend and backend; meeting lifecycle logic; topic/channel creation | End-to-end meeting workflow prototype |
| Weeks 9–10 | Testing, refinement, and bug fixing; documentation preparation | Stabilized MVP and developer documentation |
| Final Week | Final demo preparation and report writing | Final demo and written report submission |

Doing design and client alignment first (weeks 1–2) before writing production code meant decisions like the When2Meet-style grid and cross-channel invite support were settled before we started implementation.
---

## Version Control and Code Review

Branch names indicate purpose: `feature/` for frontend, `backend/` and `api/` for backend, `fix/` for bug fixes, `test/` for test-only changes.

Every PR is reviewed before merging, with reviewers pulling the branch and testing locally in the Zulip dev environment. Frontend and backend were developed in parallel, so we agreed on API contracts before either side started implementing — this avoided the integration bugs we saw early on when that didn't happen.

---

## Architecture Decisions

**Reuse Zulip's existing infrastructure where it solves the problem.** RSVP responses go through the submessage/widget pipeline (same as the poll widget) rather than a custom endpoint. Stream creation delegates to `do_create_stream` and `bulk_add_subscriptions`. Channel folder creation uses `check_add_channel_folder` to broadcast events to all clients — skipping this caused a crash on first folder creation.

**Use DB models when server-side logic is required.** The Propose flow needs slot ranking, deadline enforcement, and post-deadline confirmation. That's not feasible if state lives in submessage blobs, so we use three models (`Meeting`, `MeetingSlot`, `MeetingResponse`) with `unique_together` on `(slot, user)` and upsert via `update_or_create`.

**Access control lives on the server, not the client.** Deadline checks, permission enforcement, and confirmation are all re-validated server-side. Frontend UI disabling is just UX. Mutations are atomic — a half-created meeting with a failed stream is harder to recover from than a clean error.

**Agree on API shape before parallel development.** Early on we had UI state inconsistencies because frontend and backend made different assumptions about response format. Defining contracts upfront fixed this.

---

## Testing

**Branch coverage matters more than statement coverage for permission logic.** Statement coverage can pass while entire branches go untested. For access control and state transitions — the highest-risk code — we explicitly test both the allowed and denied paths. All backend core files reached 100% statement and branch coverage.

**Don't mock the database.** Using Django's real test DB caught bugs in upsert behavior under `unique_together` that mocks would have silently passed.

**Frontend coverage targets should be realistic.** Pure data logic should reach 100% and is easy to test in Node. DOM-heavy rendering is better caught through manual review in the dev server than through tests written against zjquery's minimal mocks.

**Manual testing is required before merging, not optional.** Automated tests don't catch everything — reviewers verify behavior locally before approving any PR.

**Test with external users.** UAT with 5 participants surfaced gaps (per-date time ranges, keyboard navigation) that internal testing missed, and gave us time to document them as known limitations before delivery.

---

## AI Tool Usage

We used Claude Code and Cursor throughout the project. They were useful for navigating the codebase and debugging, but suggestions were sometimes wrong or inconsistent with Zulip's patterns. We treated AI output as a starting point and reviewed everything before committing.

---

## Known Limitations

| Limitation | Note |
|---|---|
| No per-date individual time ranges | All proposed dates share the same candidate times |
| Per-invitee availability not shown in grid | Backend has `available_user_ids` per slot; frontend only shows aggregated heatmap counts |
| No keyboard navigation in availability grid | Mouse/touch only; surfaced in UAT |
| Deadline job not auto-scheduled | `check_meeting_deadlines` exists but is not wired to a task scheduler |
| No recurring meetings | Out of MVP scope |

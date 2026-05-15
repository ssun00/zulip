# Zulip Meeting Scheduler – Maintainer's Manual

## System Overview

The Meeting Scheduler feature extends Zulip's messaging system to support structured meeting workflows:

- **RSVP Meetings** (single fixed date and time)
- **Proposed Meetings** (multiple time slots + availability collection)

It consists of:

- A frontend UI layer (modals, widgets, dropdowns)
- A widget system (for rendering and updating meeting messages)
- A backend API layer (meeting creation, responses, confirmation)
- A database model for persistent meeting state

## Requirements Analysis & Specification

### Functional Requirements

- Users can create:
  - RSVP meetings (single datetime)
  - Proposed meetings (multiple slots + RSVP deadline)
- Users can:
  - Invite participants
  - Respond to meetings (RSVP or availability)
  - View responses in real-time (RSVP flow)
- Organizers can:
  - Confirm a final meeting time (Propose flow)
- System must:
  - Validate inputs (no past dates, valid users, etc.)
  - Handle stream/channel creation when needed

### Non-Functional Requirements

- **Performance:** Real-time updates via Zulip event system
- **Scalability:** Efficient aggregation (`COUNT` + `GROUP BY`) for slot ranking
- **Reliability:** Idempotent response updates (upsert)
- **Usability:** Minimal friction via inline widgets and modals

## System Architecture

### High-Level Flow

```
Frontend (UI + Widgets)
    ↓
API Requests (/json/messages, /json/meetings)
    ↓
Backend Logic (meeting_actions.py)
    ↓
Database (Meeting, MeetingSlot, MeetingResponse)
    ↓
Event System → Frontend Widget Updates
```

### Frontend Architecture

#### Core Entry Points

- `add_meeting_ui.ts` → Main UI + modal orchestration
- `add_meeting.ts` → Dropdown configuration
- `compose_actions.ts` → Initializes dropdown

#### Component Breakdown

**Dropdown Initialization**

- `setup_add_meeting_dropdown_widget_if_needed`
- Uses:
  - `dropdown_widget`
  - `tippy.js`

**RSVP Flow**

- Trigger
  - Dropdown → `OPTION_RSVP_MEETING`
- Modal
  - `add-rsvp-meeting-modal`
  - Rendered via `render_add_rsvp_meeting_modal`
- Form Inputs
  - Topic
  - Datetime (flatpickr)
  - Invitees (`user_pill`)
  - Optional stream creation
- Submit
  - `submit_rsvp_meeting_form`
  - Sends message via `/json/messages`
- Validation
  - `update_rsvp_submit_button_state`
  - Prevents:
    - Missing fields
    - No invitees
    - Invalid stream

**Propose Meeting Flow**

- Trigger
  - `launch_propose_meeting_modal()`
- Form Inputs
  - Topic
  - Multiple dates (calendar)
  - Time slots (custom grid)
  - Invitees
  - Optional stream creation
- Submit
  - `submit_propose_meeting_form`
  - Sends message via `/json/meetings`
- Validation
  - `validate_propose_form`
  - Rejects:
    - Past slots
    - Past deadlines

#### Widget System

**RSVP Widget**

- File: `rsvp_widget.ts`
- Data Model: `RsvpData`
- Handles:
  - Vote events
  - Rendering RSVP buckets

**Propose Widget**

- File: `propose_widget.ts`
- Data Model: `ProposeData`
- Handles:
  - Availability submissions
  - Submission tracking

#### State Management

- `invite_users_widget`
- `add_meeting_widget`
- `compose_add_meeting_dropdown_widget`

#### Reusable Utilities

- `ordinal(n)`
- `format_datetime`
- `render_mention`

### Backend Architecture

#### Database Models

Located in `zerver/models/meetings.py`

- **Meeting**
  - `owner`, `stream`, `topic`, `deadline`, `status`, `confirmed_slot`
- **MeetingSlot**
  - `start_time`, `end_time`
- **MeetingResponses**
  - `user` x `slot` relationship

#### Core Logic

Located in `zerver/lib/meeting_actions.py`

- `do_create_meeting`
  - Validates input
  - Creates stream if needed
  - Inserts DB records
  - Sends proposal message
- `do_upsert_responses`
  - Handles RSVP/availability updates
- `get_ranked_slots`
  - SQL aggregation for best slot
- `do_confirm_meeting`
  - Finalizes meeting
- `check_meeting_deadlines`
  - Background job for deadline expiration

#### API Endpoints

Located in `zerver/views/meetings.py`

| Endpoint | Purpose |
| --- | --- |
| `POST /json/meetings` | Create Meeting |
| `GET /json/meetings/<id>` | Fetch Meeting |
| `GET /json/meetings/<id>/responses` | Fetch Responses |
| `PATCH /json/meetings/<id>/responses` | Update Responses |
| `POST /json/meetings/<id>/confirm` | Confirm Slot |

### Data Flow Example

**Propose Meeting**

1. User submits modal → frontend builds slots
2. `POST /json/meetings`
3. Backend:
   - Creates meeting + slots
   - Sends message with widget
4. Widget renders in stream
5. Users submit availability → `PATCH` responses
6. Organizer confirms slot

## Testing

### Frontend Testing

Run `tools/test-js-with-node --coverage <filename>` for frontend coverage.

The reality of testing UI code in zjquery is that a lot of the files are browser-dependent, making it difficult to get full coverage.

- `add_meeting_ui.test.cjs` (56% covered)
- `rsvp_data.test.cjs` (100% covered)
- `rsvp_widget.test.cjs` (79% covered)

### Backend Testing

Run `tools/test-backend --coverage zerver/tests/test_meetings.py` for backend coverage.

The core meeting logic files all achieved 100% statement and branch coverage.

- `zerver/lib/meeting_actions.py` (100% covered)
- `zerver/models/meetings.py` (100% covered)
- `zerver/views/meetings.py` (100% covered)

### Manual Testing Workflow

1. Open Zulip dev environment
2. Create meeting via UI
3. Submit responses from multiple users
4. Confirm slot
5. Verify:
   - DB state
   - UI updates
   - Messages posted

## Deployment

1. Install Vagrant (latest version)
2. Install Docker Desktop (latest version)
3. Open Docker Desktop app's settings panel and uncheck "Use gRPC FUSE for file sharing" to use osxfs (legacy) file sharing instead
4. In terminal, `git clone https://github.com/ssun00/zulip.git`
5. `cd zulip`
6. `vagrant up --provider=docker`
7. `vagrant ssh`
8. Start the Zulip dev environment: `./tools/run-dev`

## Style Guide

### Frontend

- TypeScript-first
- Use existing Zulip components (`dropdown_widget`, `user_pill`)
- Keep logic separate from rendering

### Backend

- Follow Zulip patterns:
  - `do_*` for business logic
  - Thin views layer
  - Validate using schemas

## Developer Workflow

1. Update frontend UI
2. Update backend logic if needed
3. Add/update tests
4. Run:
   - `tools/test-js-with-node` for JavaScript/TypeScript tests
   - `tools/test-backend` for backend tests
5. Verify manually in dev server

## UI Design Summary

### Key Screens

> Note: Each item below corresponds to a screenshot in the design documentation. Add the relevant images alongside these captions.

- Propose meeting with no external user
- Propose meeting with external user (automatically create new channel)
- New channel created with display of proposed meeting message — requiring invited users to submit meeting availability via button
- Select Availability pop-up
- Dynamic message change after user submits availability + allowing user to edit availability before RSVP expiration date/time
- Following six invited users submitting meeting availability
- Updated meeting availability grid view following six invited users' meeting availability responses

### Design Principles

- Minimal friction
- Inline interaction
- Real-time updates

## Class Diagram

> Note: Insert the class diagram image here.

The class diagram illustrates the data model underlying the Meeting Scheduler feature. `Meeting` is the central entity, holding the topic, deadline, status, and a reference to the confirmed slot once finalized. Each `Meeting` contains one or more `MeetingSlot` instances representing candidate time ranges. User responses are captured through `MeetingResponse`, which links a `UserProfile` to a specific `MeetingSlot` with a boolean availability field; a `unique_together` constraint on `(slot, user)` ensures each user can only respond once per slot. `Meeting` also references two external Zulip entities — `UserProfile` for the organizer (`owner`) and `Stream` for the channel where the meeting is posted.

## Test Plan & Results

### Test Plan

- Unit tests:
  - Validation logic
  - Data transformations
- Integration tests:
  - API endpoints
- UI tests:
  - Modal interactions
  - Widget rendering

### Expected Results

- All tests pass
- No regression in message sending
- Widget updates correctly reflect backend state

## Known Limitations & Future Work

- No automatic calendar integration
- Inability to set individual times for each date in Propose flow
- Limited timezone handling
- No recurring meetings
- Potential UI scaling issues with many slots
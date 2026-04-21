import $ from "jquery";

import render_availability_submission_modal from "../templates/user_availability_meeting_modal.hbs";

import * as dialog_widget from "./dialog_widget.ts";
import {$t, $t_html} from "./i18n.ts";
import {
  MeetingAvailabilityData,
  type AvailabilityEvent,
} from "./meeting_availability_data.ts";
import * as modals from "./modals.ts";
import * as channel from "./channel.ts";Last login: Mon Apr 20 15:14:32 on ttys000
troywu@dhcp-vl2042-10331 zulip-fresh % cat zerver/views/meetings.py
from datetime import datetime

from django.http import HttpRequest, HttpResponse

from zerver.lib.exceptions import JsonableError
from zerver.lib.meeting_actions import (
    check_meeting_deadlines,
    do_confirm_meeting,
    do_create_meeting,
    do_upsert_responses,
    get_ranked_slots,
    get_realm_users,
    get_stream_subscribers,
)
from zerver.lib.response import json_success
from zerver.lib.typed_endpoint import PathOnly, typed_endpoint
from zerver.models import Stream, UserProfile
from zerver.models.meetings import Meeting


@typed_endpoint
def get_meeting_candidates(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    stream_name: str | None = None,
) -> HttpResponse:
    """GET /json/meetings/candidates

    Returns the invite candidate list for the proposal modal.
    If stream_name is given, returns that stream's subscribers (the common case
    when the organizer is already in a channel). Otherwise returns all realm users.
    """
    if stream_name is not None:
        users = get_stream_subscribers(user_profile, stream_name)
    else:
        users = get_realm_users(user_profile.realm)
    return json_success(request, data={"users": users})


def _get_meeting_or_error(meeting_id: int, realm_id: int) -> Meeting:
    try:
        return Meeting.objects.select_related("owner", "stream").get(
            id=meeting_id, stream__realm_id=realm_id
        )
    except Meeting.DoesNotExist:
        raise JsonableError("Meeting not found.")


@typed_endpoint
def create_meeting(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    topic: str,
    # ISO-8601 strings; the frontend sends these as strings.
    slots: list[dict[str, str]],
    deadline: str,
    invite_user_ids: list[int],
    create_channel: bool = False,
    stream_id: int | None = None,
) -> HttpResponse:
    """POST /json/meetings"""
    parsed_deadline = datetime.fromisoformat(deadline)

    parsed_slots: list[tuple[datetime, datetime | None]] = []
    for slot in slots:
        start = datetime.fromisoformat(slot["start_time"])
        end = datetime.fromisoformat(slot["end_time"]) if slot.get("end_time") else None
        parsed_slots.append((start, end))

    stream: Stream | None = None
    if not create_channel:
        if stream_id is None:
            raise JsonableError("stream_id is required when create_channel is False.")
        try:
            stream = Stream.objects.get(id=stream_id, realm=user_profile.realm)
        except Stream.DoesNotExist:
            raise JsonableError("Stream not found.")

    meeting = do_create_meeting(
        owner=user_profile,
        topic=topic,
        slots=parsed_slots,
        deadline=parsed_deadline,
        invite_user_ids=invite_user_ids,
        create_channel=create_channel,
        stream=stream,
    )

    return json_success(request, data={"meeting_id": meeting.id, "stream_id": meeting.stream_id})


@typed_endpoint
def get_meeting(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    meeting_id: PathOnly[int],
) -> HttpResponse:
    """GET /json/meetings/<meeting_id>"""
    meeting = _get_meeting_or_error(meeting_id, user_profile.realm_id)

    slots = [
        {
            "slot_id": slot.id,
            "start_time": slot.start_time.isoformat(),
            "end_time": slot.end_time.isoformat() if slot.end_time else None,
        }
        for slot in meeting.slots.all()
    ]

    return json_success(
        request,
        data={
            "meeting_id": meeting.id,
            "topic": meeting.topic,
            "owner_id": meeting.owner_id,
            "stream_id": meeting.stream_id,
            "deadline": meeting.deadline.isoformat(),
            "status": meeting.status,
            "confirmed_slot_id": meeting.confirmed_slot_id,
            "slots": slots,
        },
    )


@typed_endpoint
def upsert_meeting_responses(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    meeting_id: PathOnly[int],
    # Maps slot_id (as string key from JSON) → available bool.
    slot_responses: dict[str, bool],
) -> HttpResponse:
    """PATCH /json/meetings/<meeting_id>/responses"""
    meeting = _get_meeting_or_error(meeting_id, user_profile.realm_id)

    try:
        parsed: dict[int, bool] = {int(k): v for k, v in slot_responses.items()}
    except ValueError:
        raise JsonableError("slot_responses keys must be integer slot IDs.")

    do_upsert_responses(user_profile, meeting, parsed)
    return json_success(request)


@typed_endpoint
def get_meeting_responses(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    meeting_id: PathOnly[int],
) -> HttpResponse:
    """GET /json/meetings/<meeting_id>/responses"""
    meeting = _get_meeting_or_error(meeting_id, user_profile.realm_id)
    return json_success(request, data={"slots": get_ranked_slots(meeting)})


@typed_endpoint
def confirm_meeting(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    meeting_id: PathOnly[int],
    winning_slot_id: int,
) -> HttpResponse:
    """POST /json/meetings/<meeting_id>/confirm"""
    meeting = _get_meeting_or_error(meeting_id, user_profile.realm_id)
    do_confirm_meeting(user_profile, meeting, winning_slot_id)
    return json_success(request)
troywu@dhcp-vl2042-10331 zulip-fresh % grep -r "meetings" zproject/ --include="*.py" | head -20
zproject/urls.py:from zerver.views.meetings import (
zproject/urls.py:    rest_path("meetings", POST=create_meeting),
zproject/urls.py:    rest_path("meetings/candidates", GET=get_meeting_candidates),
zproject/urls.py:    rest_path("meetings/<int:meeting_id>", GET=get_meeting),
zproject/urls.py:    rest_path("meetings/<int:meeting_id>/responses", GET=get_meeting_responses, PATCH=upsert_meeting_responses),
zproject/urls.py:    rest_path("meetings/<int:meeting_id>/confirm", POST=confirm_meeting),
troywu@dhcp-vl2042-10331 zulip-fresh % grep -r "create_meeting\|get_meeting\|upsert_responses" zerver/ --include="*.py" | grep "path\|url" | head -10

import * as people from "./people.ts";

let current_availability_data: MeetingAvailabilityData | undefined;
let current_callback: ((slot_responses: Record<number, boolean>) => void) | undefined;
let selected_slots: Set<string> = new Set();
let is_dragging = false;
let drag_selecting = true; // true = selecting, false = deselecting

function render_grid(): void {
  if (!current_availability_data) {
    return;
  }

  const widget_data = current_availability_data.get_widget_data();
  const dates = widget_data.dates;
  const all_slots = widget_data.all_slots;
  const slot_counts = widget_data.slot_counts;
  const total_respondents = widget_data.total_respondents;
  const slots_per_date = all_slots.length / dates.length;

  //Build time labels from first date's slots
  const time_labels: string[] = [];

  for (let i = 0; i < slots_per_date; i++) {
    const slot = all_slots[i]!;
    const time_part = slot.split("T")[1]!;
    const [hh, mm] = time_part.split(":").map(Number);
    const d = new Date(2000, 0, 1, hh, mm);
    time_labels.push(
      d.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"}),
    );
  }

  //Build data headers
  const date_headers = dates
    .map((d) => {
      const dt = new Date(d + "T00:00:00");
      const label = dt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `<div class="availability-col-header">${label}</div>`;
    })
    .join("");

  //Build rows
  const rows = time_labels
    .map((time_label, row_idx) => {
      const cells = dates
        .map((_date, col_idx) => {
          const slot_key = all_slots[row_idx * dates.length + col_idx]!;
          const is_selected = selected_slots.has(slot_key);
          const count = slot_counts[slot_key] ?? 0;
          const intensity =
            total_respondents > 0
              ? Math.round((count / total_respondents) * 4)
              : 0;

          return `<div
                        class="availability-cell ${is_selected ? "availability-cell-selected" : ""} availability-intensity-${intensity}"
                        data-slot="${slot_key}"
                    ></div>`;
        })
        .join("");

      return `
            <div class="availability-row">
                <div class="availability-time-label">${time_label}</div>
                ${cells}
            </div>`;
    })
    .join("");

  const grid_html = `
        <div class="availability-grid-inner">
            <div class="availability-header-row">
                <div class="availability-time-label-empty"></div>
                ${date_headers}
            </div>
            ${rows}
        </div>`;

  $("#availability-grid").html(grid_html);
  bind_grid_events();
}

function bind_grid_events(): void {
  const $grid = $("#availability-grid");

  // Remove any existing handlers first to prevent stacking
  $grid.off("mousedown mouseenter");

  $grid.on("mousedown", ".availability-cell", function (e) {
    e.preventDefault();
    e.stopPropagation();
    is_dragging = true;
    const slot = $(this).data("slot") as string;
    // If clicking a selected cell, drag will deselect; otherwise select
    drag_selecting = !selected_slots.has(slot);
    toggle_slot(slot);
  });

  $grid.on("mouseenter", ".availability-cell", function () {
    if (!is_dragging) {
      return;
    }
    const slot = $(this).data("slot") as string;
    if (drag_selecting) {
      selected_slots.add(slot);
      $(this).addClass("availability-cell-selected");
    } else {
      selected_slots.delete(slot);
      $(this).removeClass("availability-cell-selected");
    }
  });
}

function toggle_slot(slot: string): void {
  if (selected_slots.has(slot)) {
    selected_slots.delete(slot);
  } else {
    selected_slots.add(slot);
  }
  $(`[data-slot="${slot}"]`).toggleClass(
    "availability-cell-selected",
    selected_slots.has(slot),
  );
}

function submit_availability(): void {
  if (!current_availability_data || !current_callback) {
    return;
  }

  // Build slot_id -> bool map from selected slot keys
  const slot_responses: Record<string, boolean> = {};
  for (const [slot_id, slot_key] of slot_id_map.entries()) {
    slot_responses[String(slot_id)] = selected_slots.has(slot_key);
  }

  void channel.patch({
    url: `/json/meetings/${current_meeting_id}/responses`,
    data: {slot_responses: JSON.stringify(slot_responses)},
    success() {
      modals.close_active();
      if (current_callback) {
        current_callback(
          Object.fromEntries(
            [...slot_id_map.entries()].map(([id, key]) => [
              id,
              selected_slots.has(key),
            ]),
          ),
        );
      }
    },
  });
}

let current_meeting_id: number | undefined;
// slot_id -> display label
let slot_id_map: Map<number, string> = new Map();

export function open_availability_modal(
  meeting_id: number,
  callback: (slot_responses: Record<number, boolean>) => void,
): void {
  current_meeting_id = meeting_id;
  current_callback = callback;

  //Fetch meeting data from backend first
  void channel.get({
    url: `/json/meetings/${meeting_id}`,
    success(data) {
      const meeting = data as {
        topic: string;
        slots: {slot_id: number; start_time: string; end_time: string | null}[];
      };

      // Build MeetingAvailabilityData from API slots
      slot_id_map = new Map();
      const dates = new Set<string>();
      const slot_keys: string[] = [];

      for (const slot of meeting.slots) {
        const dt = new Date(slot.start_time);
        const data_str = dt.toISOString().slice(0, 10);
        const time_str = dt.toISOString().slice(11, 16);
        const slot_key = `${date_str}T${time_str}`;
        dates.add(date_str);
        slot_id_map.set(slot.slot_id, slot_key);
        slot_keys.push(slot_key);
      }

      const sorted_dates = [...dates].sort();

      // Find time range from slots
      const times = slot_keys.map((k) => k.split("T")[1]!).sort();
      const start_time = times[0]!;
      // Add 30 mins to last slot for end_time
      const last = times[times.length - 1]!;
      const [h, m] = last.split(":").map(Number);
      const end_mins = h! * 60 + m! + 30;
      const end_time = `${String(Math.floor(end_mins / 60)).padStart(2, "0")}:${String(end_mins % 60).padStart(2, "0")}`;

      current_availability_data = new MeetingAvailabilityData({
        topic: meeting.topic,
        dates: sorted_dates,
        start_time,
        end_time,
        slot_duration_mins: 30,
        invitees: [],
        current_user_id: people.my_current_user_id(),
      });

      selected_slots = new Set();

      dialog_widget.launch({
        modal_title_html: $t_html({defaultMessage: "Select Your Availability"}),
        modal_content_html: render_availability_submission_modal({}),
        modal_submit_button_text: $t({defaultMessage: "Submit"}),
        id: "availability-submission-modal",
        form_id: "availability-submission-form",
        on_click: submit_availability,
        on_shown() {
          render_grid();
        },
        on_hide() {
          if (typeof document !== "undefined") {
            $(document).off("mouseup.availability-grid");
          }
          current_availability_data = undefined;
          current_callback = undefined;
          selected_slots = new Set();
          current_meeting_id = undefined;
        },
      });
    },
  });
}

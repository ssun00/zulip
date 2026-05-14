import $ from "jquery";

import render_availability_submission_modal from "../templates/user_availability_meeting_modal.hbs";

import * as dialog_widget from "./dialog_widget.ts";
import {$t, $t_html} from "./i18n.ts";
import {
  MeetingAvailabilityData,
  type AvailabilityEvent,
} from "./meeting_availability_data.ts";
import * as modals from "./modals.ts";
import * as channel from "./channel.ts";

let current_availability_data: MeetingAvailabilityData | undefined;
let current_callback: ((event: AvailabilityEvent) => void) | undefined;
let selected_slots: Set<string> = new Set();
let is_dragging = false;
let drag_selecting = true; // true = selecting, false = deselecting
// Maps datetime string (e.g. "2026-04-24T09:00") -> backend slot_id
let slot_id_map = new Map<string, number>();

function get_saved_selected_slots(): Set<string> {
  return current_availability_data?.get_my_selected_slots() ?? new Set();
}

function get_display_total_respondents(): number {
  if (!current_availability_data) {
    return 0;
  }

  const base_total = current_availability_data.get_total_respondents();
  const has_saved_response = current_availability_data.responses.has(
    current_availability_data.me,
  );

  if (has_saved_response) {
    return base_total;
  }

  return selected_slots.size > 0 ? base_total + 1 : base_total;
}

function get_display_slot_count(slot_key: string): number {
  if (!current_availability_data) {
    return 0;
  }

  let count = current_availability_data.get_slot_count(slot_key);
  const saved_selected_slots = get_saved_selected_slots();
  const was_selected = saved_selected_slots.has(slot_key);
  const is_selected = selected_slots.has(slot_key);

  if (is_selected && !was_selected) {
    count += 1;
  } else if (!is_selected && was_selected) {
    count -= 1;
  }

  return Math.max(count, 0);
}

function get_intensity_level(slot_key: string): number {
  const total_respondents = get_display_total_respondents();
  const count = get_display_slot_count(slot_key);

  if (total_respondents <= 0) {
    return 0;
  }

  return Math.round((count / total_respondents) * 4);
}

function update_cell_visual($cell: JQuery, slot_key: string): void {
  const count = get_display_slot_count(slot_key);
  const intensity = get_intensity_level(slot_key);
  const is_selected = selected_slots.has(slot_key);

  for (let level = 0; level <= 4; level++) {
    $cell.removeClass(`availability-intensity-${level}`);
  }

  $cell
    .toggleClass("availability-cell-selected", is_selected)
    .addClass(`availability-intensity-${intensity}`)
    .attr(
      "title",
      is_selected ? `${count} available, selected by you` : `${count} available`,
    );
}

function refresh_grid_visuals(): void {
  $("#availability-grid .availability-cell").each(function () {
    const $cell = $(this);
    const slot_key = $cell.data("slot") as string;
    update_cell_visual($cell, slot_key);
  });
}

function render_grid(): void {
  if (!current_availability_data) {
    return;
  }

  const widget_data = current_availability_data.get_widget_data();
  const dates = widget_data.dates;
  const all_slots = widget_data.all_slots;
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
          const slot_key = all_slots[col_idx * slots_per_date + row_idx]!;
          const is_selected = selected_slots.has(slot_key);
          const count = get_display_slot_count(slot_key);
          const intensity = get_intensity_level(slot_key);

          return `<div
                        class="availability-cell ${is_selected ? "availability-cell-selected" : ""} availability-intensity-${intensity}"
                        data-slot="${slot_key}"
                        title="${is_selected ? `${count} available, selected by you` : `${count} available`}"
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
    } else {
      selected_slots.delete(slot);
    }
    refresh_grid_visuals();
  });

  //stop dragging on mouseup
  $(document)
    .off("mouseup.availability-grid")
    .on("mouseup.availability-grid", () => {
      is_dragging = false;
    });
}

function toggle_slot(slot: string): void {
  if (selected_slots.has(slot)) {
    selected_slots.delete(slot);
  } else {
    selected_slots.add(slot);
  }
  refresh_grid_visuals();
}

function submit_availability(
  meeting_id: number,
  callback: (event: AvailabilityEvent) => void,
): void {
  if (!current_availability_data) {
    return;
  }

  // Build {slot_id: bool} for every slot — true if selected, false if not
  const all_slots = current_availability_data.get_all_slots();
  const slot_responses: Record<number, boolean> = {};
  for (const slot_key of all_slots) {
    const slot_id = slot_id_map.get(slot_key);
    if (slot_id !== undefined) {
      slot_responses[slot_id] = selected_slots.has(slot_key);
    }
  }
  const event = current_availability_data.availability_event([
    ...selected_slots,
  ]);

  void channel.patch({
    url: `/json/meetings/${meeting_id}/responses`,
    data: {slot_responses: JSON.stringify(slot_responses)},
    success() {
      current_availability_data!.handle_availability_event(
        current_availability_data!.me,
        event,
      );
      callback(event);
      modals.close_active();
    },
  });
}

export function open_availability_modal(
  meeting_id: number, //Add meeting_id as a parameter
  availability_data: MeetingAvailabilityData,
  callback: (event: AvailabilityEvent) => void,
): void {
  current_availability_data = availability_data;
  current_callback = callback;
  slot_id_map = new Map();
  selected_slots = new Set();

  // Fetch slots + existing responses from backend
  void channel.get({
    url: `/json/meetings/${meeting_id}/responses`,
    success(data) {
      const result = data as {
        slots: {
          slot_id: number;
          start_time: string;
          available_count: number;
          available_user_ids: number[];
        }[];
      };
      const responses = new Map<number, Set<string>>();

      // Build slot_id_map: "2026-04-24T09:00" -> slot_id
      for (const slot of result.slots) {
        // Backend stores naive local time but isoformat() adds +00:00; strip to match grid keys
        const local_key = slot.start_time.slice(0, 16).replace(" ", "T");
        slot_id_map.set(local_key, slot.slot_id);

        // Rebuild availability state from the server so editing starts from
        // the actual saved responses instead of merging with stale local data.
        for (const user_id of slot.available_user_ids) {
          const existing = responses.get(user_id) ?? new Set<string>();
          existing.add(local_key);
          responses.set(user_id, existing);
        }
      }

      availability_data.responses = responses;

      // Pre-populate current user's prior selections
      selected_slots = new Set(
        availability_data.responses?.get(availability_data.me) ?? [],
      );
      launch_modal(meeting_id, callback);
    },
    error() {
      //Open anyway so user isn't blocked
      launch_modal(meeting_id, callback);
    },
  });
}

function launch_modal(
  meeting_id: number,
  callback: (event: AvailabilityEvent) => void,
): void {
  dialog_widget.launch({
    modal_title_html: $t_html({defaultMessage: "Select Your Availability"}),
    modal_content_html: render_availability_submission_modal({}),
    modal_submit_button_text: $t({defaultMessage: "Submit"}),
    id: "availability-submission-modal",
    form_id: "availability-submission-form",
    on_click() {
      submit_availability(meeting_id, callback);
    },
    on_shown() {
      // Show timezone
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offset = new Date()
        .toLocaleTimeString("en-US", {
          timeZoneName: "short",
        })
        .split(" ")
        .pop();
      $("#availability-timezone-name").text(`${offset}, ${tz}`);
      render_grid();
    },
    on_hide() {
      $(document).off("mouseup.availability-grid");
      current_availability_data = undefined;
      current_callback = undefined;
      selected_slots = new Set();
    },
  });
}

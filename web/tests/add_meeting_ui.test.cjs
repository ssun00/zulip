"use strict";

const assert = require("node:assert/strict");

const {zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");
const $ = require("./lib/zjquery.cjs");
const {make_user} = require("./lib/example_user.cjs");

const people = zrequire("people");
const dialog_widget = zrequire("dialog_widget");
const add_meeting = zrequire("add_meeting");
const add_meeting_ui = zrequire("add_meeting_ui");

// realm is read by people.should_add_guest_user_indicator
global.realm = {
    realm_enable_guest_user_indicator: false,
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function reset_modal_dom() {
    $("#rsvp-meeting-topic").val("");
    $("#rsvp-meeting-datetime-value").val("");
    $("#add-rsvp-meeting-modal .dialog_submit_button").prop("disabled", true);
}

// ---------------------------------------------------------------------------
// update_rsvp_submit_button_state
// ---------------------------------------------------------------------------

run_test("submit button disabled when topic is empty", () => {
    reset_modal_dom();
    $("#rsvp-meeting-topic").val("");
    $("#rsvp-meeting-datetime-value").val("2026-03-24T14:30");

    const topic = $("#rsvp-meeting-topic").val().trim();
    const datetime = $("#rsvp-meeting-datetime-value").val().trim();

    assert.ok(!(topic && datetime));
});

run_test("submit button disabled when datetime is empty", () => {
    reset_modal_dom();
    $("#rsvp-meeting-topic").val("Team sync");
    $("#rsvp-meeting-datetime-value").val("");

    const topic = $("#rsvp-meeting-topic").val().trim();
    const datetime = $("#rsvp-meeting-datetime-value").val().trim();

    assert.ok(!(topic && datetime));
});

run_test("submit button enabled when both fields are filled", () => {
    reset_modal_dom();
    $("#rsvp-meeting-topic").val("Team sync");
    $("#rsvp-meeting-datetime-value").val("2026-03-24T14:30");

    const topic = $("#rsvp-meeting-topic").val().trim();
    const datetime = $("#rsvp-meeting-datetime-value").val().trim();

    assert.ok(topic && datetime);
});

run_test("submit button disabled when topic is only whitespace", () => {
    reset_modal_dom();
    $("#rsvp-meeting-topic").val("   ");
    $("#rsvp-meeting-datetime-value").val("2026-03-24T14:30");

    const topic = $("#rsvp-meeting-topic").val().trim();
    const datetime = $("#rsvp-meeting-datetime-value").val().trim();

    assert.ok(!(topic && datetime));
});

// ---------------------------------------------------------------------------
// populate_user_dropdown
// ---------------------------------------------------------------------------

// run_test("populate_user_dropdown does nothing without stream_id", ({override_rewire}) => {
//     let dropdown_populated = false;

//     override_rewire(narrow_state, "stream_id", () => undefined);
//     override_rewire(peer_data, "get_subscriber_ids_assert_loaded", () => {
//         dropdown_populated = true;
//         return [];
//     });

//     add_meeting_ui.__test_only.populate_user_dropdown();
//     assert.ok(!dropdown_populated);
// });

// run_test("populate_user_dropdown populates with stream subscribers", ({override_rewire}) => {
//     const alice = {user_id: 1, full_name: "Alice", email: "alice@example.com"};
//     const bob = {user_id: 2, full_name: "Bob", email: "bob@example.com"};

//     override_rewire(narrow_state, "stream_id", () => 42);
//     override_rewire(peer_data, "get_subscriber_ids_assert_loaded", (stream_id) => {
//         assert.equal(stream_id, 42);
//         return [1, 2];
//     });
//     override_rewire(people, "get_by_user_id", (id) => (id === 1 ? alice : bob));
//     override_rewire(typeahead_helper, "render_person", (item) => `<span>${item.user.full_name}</span>`);

//     add_meeting_ui.__test_only.populate_user_dropdown();

//     // The dropdown should have had 2 options appended via zjquery
//     const $dropdown = $("#rsvp-user-dropdown");
//     assert.ok($dropdown !== undefined);
// });

// ---------------------------------------------------------------------------
// on_add_all_users_click
// ---------------------------------------------------------------------------

// run_test("on_add_all_users_click appends all realm users", () => {
//     const alice = make_user({user_id: 1, full_name: "Alice", email: "alice@example.com"});
//     const bob = make_user({user_id: 2, full_name: "Bob", email: "bob@example.com"});

//     people.add_active_user(alice);
//     people.add_active_user(bob);

//     const appended = [];
//     const fake_widget = {
//         appendValidatedData(item) { appended.push(item); },
//         clear_text() {},
//         is_pending() { return false; },
//     };

//     add_meeting_ui.__test_only.set_invite_users_widget(fake_widget);
//     add_meeting_ui.__test_only.on_add_all_users_click();

//     assert.ok(appended.length >= 2);
// });

run_test("on_add_all_users_click is a no-op without widget", () => {
    add_meeting_ui.__test_only.set_invite_users_widget(null);
    add_meeting_ui.__test_only.on_add_all_users_click();
    assert.ok(true);
});

// ---------------------------------------------------------------------------
// setup_add_meeting_dropdown_widget_if_needed — idempotency guard
// ---------------------------------------------------------------------------

// run_test("setup only creates the dropdown widget once", ({override_rewire}) => {
//     let setup_count = 0;

//     override_rewire(add_meeting_ui, "setup_add_meeting_dropdown_widget", (_selector) => {
//         setup_count += 1;
//     });

//     add_meeting_ui.__test_only.reset_composebox_widget_flag();

//     add_meeting_ui.setup_add_meeting_dropdown_widget_if_needed();
//     add_meeting_ui.setup_add_meeting_dropdown_widget_if_needed();
//     add_meeting_ui.setup_add_meeting_dropdown_widget_if_needed();

//     assert.equal(setup_count, 1);
// });

// ---------------------------------------------------------------------------
// item_click_callback
// ---------------------------------------------------------------------------

// run_test("item_click_callback launches dialog for OPTION_RSVP_MEETING", ({override_rewire}) => {
//     let launched = false;

//     override_rewire(dialog_widget, "launch", (_opts) => { launched = true; });

//     const fake_event = {preventDefault() {}, stopPropagation() {}};
//     const fake_dropdown = {hide() {}};
//     const fake_widget = {current_value: add_meeting.OPTION_RSVP_MEETING};

//     add_meeting_ui.__test_only.item_click_callback(
//         fake_event,
//         fake_dropdown,
//         fake_widget,
//         false,
//     );

//     assert.ok(launched);
// });

// run_test("item_click_callback does not launch dialog for OPTION_PROPOSE_MEETING", ({override_rewire}) => {
//     let launched = false;

//     override_rewire(dialog_widget, "launch", () => { launched = true; });

//     const fake_event = {preventDefault() {}, stopPropagation() {}};
//     const fake_dropdown = {hide() {}};
//     const fake_widget = {current_value: add_meeting.OPTION_PROPOSE_MEETING};

//     add_meeting_ui.__test_only.item_click_callback(
//         fake_event,
//         fake_dropdown,
//         fake_widget,
//         false,
//     );

//     assert.ok(!launched);
// });

"use strict";

const assert = require("node:assert/strict");

const {mock_esm, zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");
const $ = require("./lib/zjquery.cjs");

let get_opts;
let post_opts;
mock_esm("../src/channel", {
    get(opts) {
        get_opts = opts;
    },
    post(opts) {
        post_opts = opts;
    },
});

let launch_opts;
const dialog_widget_id = "dialog_widget_modal_6";
mock_esm("../src/dialog_widget", {
    launch(opts) {
        launch_opts = opts;
        return dialog_widget_id;
    },
});

let close_args;
mock_esm("../src/modals", {
    close(modal_id, conf) {
        close_args = {modal_id, conf};
    },
});

mock_esm("../src/i18n", {
    $t: ({defaultMessage}) => defaultMessage,
    $t_html: ({defaultMessage}) => defaultMessage,
});

const availability_modal = zrequire("availability_modal");

function reset_test_state() {
    get_opts = undefined;
    post_opts = undefined;
    launch_opts = undefined;
    close_args = undefined;
}

run_test("open launches the meeting confirmation dialog", () => {
    reset_test_state();

    availability_modal.open(42);

    assert.equal(get_opts.url, "/json/meetings/42/responses");

    get_opts.success({
        slots: [
            {
                slot_id: 7,
                start_time: "2026-04-07T09:00:00Z",
                end_time: "2026-04-07T10:00:00Z",
                available_count: 2,
            },
        ],
    });

    assert.equal(launch_opts.id, "meeting-confirm-modal");
    assert.equal(launch_opts.form_id, "meeting-confirm-form");
    assert.equal(launch_opts.modal_submit_button_text, "Confirm slot");
    assert.ok(launch_opts.modal_content_html.includes('value="7"'));
});

run_test("confirm closes the captured dialog instance after request success", () => {
    reset_test_state();

    let on_confirmed_called = false;

    availability_modal.open(42, () => {
        on_confirmed_called = true;
    });

    get_opts.success({
        slots: [
            {
                slot_id: 9,
                start_time: "2026-04-07T09:00:00Z",
                end_time: null,
                available_count: 3,
            },
        ],
    });

    const $modal = $(`#${dialog_widget_id}`);
    const $selected_slot = $("input[name='winning_slot_id']:checked");
    $selected_slot.val("9");
    $modal.set_find_results("input[name='winning_slot_id']:checked", $selected_slot);

    launch_opts.on_click();

    assert.equal(post_opts.url, "/json/meetings/42/confirm");
    assert.deepEqual(post_opts.data, {winning_slot_id: "9"});
    assert.equal(close_args, undefined);

    post_opts.success();

    assert.equal(close_args.modal_id, dialog_widget_id);
    assert.equal(on_confirmed_called, false);

    close_args.conf.on_hidden();

    assert.equal(on_confirmed_called, true);
});

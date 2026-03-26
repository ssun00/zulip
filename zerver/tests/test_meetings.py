from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest import mock

import orjson

from zerver.lib.meeting_actions import send_meeting_deadline_reminders
from zerver.lib.test_classes import ZulipTestCase
from zerver.models.meetings import Meeting


class MeetingAPITests(ZulipTestCase):
    def _create_meeting(
        self,
        *,
        owner,
        invitees: list[int],
        topic: str,
        slots: list[tuple[datetime, datetime | None]],
        deadline: datetime,
    ) -> dict[str, object]:
        self.login_user(owner)

        payload = {
            "topic": topic,
            "slots": [
                {
                    "start_time": start.isoformat(),
                    "end_time": end.isoformat() if end else None,
                }
                for start, end in slots
            ],
            "deadline": deadline.isoformat(),
            "invite_user_ids": invitees,
            "create_channel": True,
        }
        body = orjson.dumps(payload).decode()
        result = self.client_post("/json/meetings", body, content_type="application/json")
        return self.assert_json_success(result)

    def test_permission_enforced_for_meeting_stream(self) -> None:
        owner = self.example_user("cordelia")
        invitee = self.example_user("hamlet")
        outsider = self.example_user("othello")

        now = datetime.now(tz=timezone.utc)
        deadline = now + timedelta(hours=2)
        slot_start = now + timedelta(hours=3)
        slots = [(slot_start, slot_start + timedelta(minutes=30))]

        create_result = self._create_meeting(
            owner=owner,
            invitees=[invitee.id],
            topic="Secret meeting",
            slots=slots,
            deadline=deadline,
        )
        meeting_id = int(create_result["meeting_id"])

        self.login_user(outsider)
        result = self.client_get(f"/json/meetings/{meeting_id}")
        self.assert_json_error(result, "Meeting not found.")

    def test_create_get_responses_confirm_happy_path(self) -> None:
        owner = self.example_user("cordelia")
        user2 = self.example_user("hamlet")

        now = datetime.now(tz=timezone.utc)
        deadline = now + timedelta(hours=2)
        slot1_start = now + timedelta(hours=3)
        slot2_start = now + timedelta(hours=4)
        slots = [
            (slot1_start, slot1_start + timedelta(minutes=30)),
            (slot2_start, slot2_start + timedelta(minutes=30)),
        ]

        create_result = self._create_meeting(
            owner=owner,
            invitees=[user2.id],
            topic="Availability poll",
            slots=slots,
            deadline=deadline,
        )
        meeting_id = int(create_result["meeting_id"])

        # Upsert responses: owner marks slot1 available=True and slot2 False.
        # user2 marks slot1 available=True too.
        self.login_user(owner)
        meeting = self.assert_json_success(self.client_get(f"/json/meetings/{meeting_id}"))
        slot_ids = [int(s["slot_id"]) for s in meeting["slots"]]
        slot1_id, slot2_id = slot_ids[0], slot_ids[1]

        resp_payload_owner = {
            "slot_responses": {
                str(slot1_id): True,
                str(slot2_id): False,
            }
        }
        result = self.client_post(
            f"/json/meetings/{meeting_id}/responses",
            orjson.dumps(resp_payload_owner).decode(),
            content_type="application/json",
        )
        self.assert_json_success(result)

        self.login_user(user2)
        resp_payload_user2 = {"slot_responses": {str(slot1_id): True}}
        result = self.client_post(
            f"/json/meetings/{meeting_id}/responses",
            orjson.dumps(resp_payload_user2).decode(),
            content_type="application/json",
        )
        self.assert_json_success(result)

        # Ranked slots: slot1 should come first since it has higher available_count.
        ranked = self.assert_json_success(
            self.client_get(f"/json/meetings/{meeting_id}/responses")
        )
        ranked_slots = ranked["slots"]
        self.assertEqual(int(ranked_slots[0]["slot_id"]), slot1_id)

        # Only owner can confirm.
        self.login_user(user2)
        confirm_result = self.client_post(
            f"/json/meetings/{meeting_id}/confirm",
            orjson.dumps({"winning_slot_id": slot1_id}).decode(),
            content_type="application/json",
        )
        self.assert_json_error(confirm_result, "Only the meeting owner can confirm a time.")

        self.login_user(owner)
        confirm_result = self.client_post(
            f"/json/meetings/{meeting_id}/confirm",
            orjson.dumps({"winning_slot_id": slot1_id}).decode(),
            content_type="application/json",
        )
        self.assert_json_success(confirm_result)

        meeting_obj = Meeting.objects.get(id=meeting_id)
        self.assertEqual(meeting_obj.status, Meeting.Status.CONFIRMED)

    def test_deadline_reminder_sends_to_non_responders(self) -> None:
        owner = self.example_user("cordelia")
        responder = self.example_user("hamlet")
        non_responder = self.example_user("othello")

        now = datetime.now(tz=timezone.utc)
        # Deadline is within the reminder window.
        deadline = now + timedelta(minutes=30)
        slot_start = now + timedelta(hours=1)
        slots = [(slot_start, slot_start + timedelta(minutes=30))]

        create_result = self._create_meeting(
            owner=owner,
            invitees=[responder.id, non_responder.id],
            topic="Reminder test",
            slots=slots,
            deadline=deadline,
        )
        meeting_id = int(create_result["meeting_id"])

        # Responder submits availability; non_responder does not.
        meeting = self.assert_json_success(self.client_get(f"/json/meetings/{meeting_id}"))
        slot_id = int(meeting["slots"][0]["slot_id"])

        self.login_user(responder)
        resp_payload = {"slot_responses": {str(slot_id): True}}
        result = self.client_post(
            f"/json/meetings/{meeting_id}/responses",
            orjson.dumps(resp_payload).decode(),
            content_type="application/json",
        )
        self.assert_json_success(result)

        with mock.patch(
            "zerver.lib.meeting_actions.internal_send_private_message"
        ) as send_pm:
            # Run reminder logic with window > 30 minutes.
            send_meeting_deadline_reminders(seconds_before_deadline=3600)

        meeting_obj = Meeting.objects.get(id=meeting_id)
        self.assertIsNotNone(meeting_obj.reminder_sent_at)

        # Should DM the non_responder only (not owner, not responder).
        called_user_ids = {call.args[1].id for call in send_pm.call_args_list}
        self.assertEqual(called_user_ids, {non_responder.id})


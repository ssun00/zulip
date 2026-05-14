from datetime import datetime, timedelta, timezone
from unittest import mock

import time_machine

from zerver.actions.create_realm import do_create_realm
from zerver.actions.create_user import do_create_user
from zerver.actions.streams import bulk_add_subscriptions
from zerver.lib.exceptions import JsonableError
from zerver.lib.meeting_actions import (
    access_meeting_for_user,
    assert_user_can_submit_meeting_responses,
    do_confirm_meeting,
    do_create_meeting,
    do_upsert_responses,
)
from zerver.lib.test_classes import ZulipTestCase
from zerver.models.channel_folders import ChannelFolder
from zerver.models.meetings import Meeting
from zerver.models.streams import get_stream


class MeetingsBackendTest(ZulipTestCase):
    def _future_deadline(self) -> datetime:
        return datetime.now(tz=timezone.utc) + timedelta(days=7)

    def _slot_pair(self) -> tuple[datetime, datetime | None]:
        start = datetime.now(tz=timezone.utc) + timedelta(days=8)
        return (start, start + timedelta(hours=1))

    def test_private_stream_meeting_invisible_to_non_subscriber(self) -> None:
        hamlet = self.example_user("hamlet")
        othello = self.example_user("othello")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_private_test"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)

        start, end = self._slot_pair()
        meeting = do_create_meeting(
            hamlet,
            "Planning sync",
            [(start, end)],
            self._future_deadline(),
            [],
            False,
            stream,
        )

        access_meeting_for_user(hamlet, meeting.id)

        with self.assertRaisesRegex(JsonableError, "Invalid channel ID"):
            access_meeting_for_user(othello, meeting.id)

    def test_invitee_subscribed_can_access_and_submit(self) -> None:
        hamlet = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_invite_test"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)
        bulk_add_subscriptions(hamlet.realm, [stream], [cordelia], acting_user=hamlet)

        start, end = self._slot_pair()
        meeting = do_create_meeting(
            hamlet,
            "Team lunch",
            [(start, end)],
            self._future_deadline(),
            [cordelia.id],
            False,
            stream,
        )

        access_meeting_for_user(cordelia, meeting.id)
        assert_user_can_submit_meeting_responses(cordelia, meeting)

        slot_id = meeting.slots.get().id
        do_upsert_responses(cordelia, meeting, {slot_id: True})

    def test_existing_channel_requires_invitees_already_subscribed(self) -> None:
        hamlet = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_existing_requires_subscribers"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)

        start, end = self._slot_pair()
        with self.assertRaisesRegex(JsonableError, "All invited users must already be subscribed"):
            do_create_meeting(
                hamlet,
                "Team lunch",
                [(start, end)],
                self._future_deadline(),
                [cordelia.id],
                False,
                stream,
            )

    def test_non_invitee_cannot_submit_responses(self) -> None:
        hamlet = self.example_user("hamlet")
        othello = self.example_user("othello")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_rsvp_gate"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)

        start, end = self._slot_pair()
        meeting = do_create_meeting(
            hamlet,
            "Standup",
            [(start, end)],
            self._future_deadline(),
            [],
            False,
            stream,
        )

        slot_id = meeting.slots.get().id
        with self.assertRaisesRegex(JsonableError, "Invalid channel ID"):
            assert_user_can_submit_meeting_responses(othello, meeting)

        with self.assertRaisesRegex(JsonableError, "Invalid channel ID"):
            do_upsert_responses(othello, meeting, {slot_id: True})

    def test_only_owner_can_confirm(self) -> None:
        hamlet = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_confirm"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)
        bulk_add_subscriptions(hamlet.realm, [stream], [cordelia], acting_user=hamlet)

        start, end = self._slot_pair()
        meeting = do_create_meeting(
            hamlet,
            "Review",
            [(start, end)],
            self._future_deadline(),
            [cordelia.id],
            False,
            stream,
        )
        slot_id = meeting.slots.get().id

        with self.assertRaisesRegex(JsonableError, "Only the meeting owner"):
            do_confirm_meeting(cordelia, meeting, slot_id)

        do_confirm_meeting(hamlet, meeting, slot_id)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.CONFIRMED)

    def test_check_meeting_deadlines_marks_overdue(self) -> None:
        from django.core.management import call_command
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        stream_name = "zulip_meetings_deadline"
        self.subscribe_via_post(hamlet, [stream_name], invite_only=True)
        stream = get_stream(stream_name, hamlet.realm)

        start, end = self._slot_pair()
        deadline = datetime.now(tz=timezone.utc) + timedelta(hours=2)
        meeting = do_create_meeting(
            hamlet,
            "Deadline test",
            [(start, end)],
            deadline,
            [],
            False,
            stream,
        )

        future = deadline + timedelta(days=1)
        with time_machine.travel(future, tick=False):
            call_command("check_meeting_deadlines")

        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.Status.DEADLINE_PASSED)


class MeetingsViewTest(ZulipTestCase):
    def test_get_meeting_candidates(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)

        # No stream name
        result = self.client_get("/json/meetings/candidates")
        self.assert_json_success(result)
        self.assertIn("users", result.json())

        # With stream name
        stream_name = "test_candidates_stream"
        self.make_stream(stream_name)
        self.subscribe(hamlet, stream_name)
        result = self.client_get("/json/meetings/candidates", {"stream_name": stream_name})
        self.assert_json_success(result)

    def test_create_meeting_view(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        future_deadline = (datetime.now(tz=timezone.utc) + timedelta(days=1)).isoformat()
        
        # Test naive datetime handling and create_channel=True (hits lib/meeting_actions.py:151-163)
        naive_start = (datetime.now() + timedelta(days=2)).replace(microsecond=0).isoformat()
        result = self.client_post("/json/meetings", {
            "topic": "View Meeting",
            "slots": '[{"start_time": "' + naive_start + '"}]',
            "deadline": future_deadline,
            "invite_user_ids": "[]",
            "create_channel": "true",
        })
        self.assert_json_success(result)
        meeting_id = result.json()["meeting_id"]

        # Test create_channel=False with stream_id
        stream = self.make_stream("existing_stream")
        self.subscribe(hamlet, stream.name)
        result = self.client_post("/json/meetings", {
            "topic": "Existing Stream Meeting",
            "slots": '[{"start_time": "' + future_deadline + '"}]',
            "deadline": future_deadline,
            "invite_user_ids": "[]",
            "create_channel": "false",
            "stream_id": stream.id,
        })
        self.assert_json_success(result)

        # Test error: stream_id missing
        result = self.client_post("/json/meetings", {
            "topic": "Missing Stream ID",
            "slots": '[{"start_time": "' + future_deadline + '"}]',
            "deadline": future_deadline,
            "invite_user_ids": "[]",
            "create_channel": "false",
        })
        self.assert_json_error(result, "stream_id is required when create_channel is False.")

    def test_get_meeting_view(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        stream = self.make_stream("get_meeting_stream")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(
            hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)],
            datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream
        )
        
        result = self.client_get(f"/json/meetings/{meeting.id}")
        self.assert_json_success(result)
        self.assertEqual(result.json()["topic"], "Topic")

    def test_upsert_meeting_responses_view(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        stream = self.make_stream("upsert_view_stream")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(
            hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)],
            datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream
        )
        slot_id = meeting.slots.get().id

        # Valid response
        result = self.client_patch(f"/json/meetings/{meeting.id}/responses", {
            "slot_responses": '{"' + str(slot_id) + '": true}',
        })
        self.assert_json_success(result)

        # Invalid slot IDs (not integers)
        result = self.client_patch(f"/json/meetings/{meeting.id}/responses", {
            "slot_responses": '{"not_an_int": true}',
        })
        self.assert_json_error(result, "slot_responses keys must be integer slot IDs.")

    def test_get_meeting_responses_view(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        stream = self.make_stream("responses_view_stream")
        self.subscribe(hamlet, stream.name)
        # One slot with end_time, one without
        meeting = do_create_meeting(
            hamlet,
            "Topic",
            [
                (
                    datetime.now(tz=timezone.utc) + timedelta(days=1),
                    datetime.now(tz=timezone.utc) + timedelta(days=1, hours=1),
                ),
                (datetime.now(tz=timezone.utc) + timedelta(days=2), None),
            ],
            datetime.now(tz=timezone.utc) + timedelta(hours=1),
            [],
            False,
            stream,
        )

        result = self.client_get(f"/json/meetings/{meeting.id}/responses")
        self.assert_json_success(result)
        self.assertIn("slots", result.json())
        self.assertIsNotNone(result.json()["slots"][0]["end_time"])
        self.assertIsNone(result.json()["slots"][1]["end_time"])

    def test_confirm_meeting_view(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login_user(hamlet)
        stream = self.make_stream("confirm_view_stream")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(
            hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)],
            datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream
        )
        slot_id = meeting.slots.get().id

        result = self.client_post(f"/json/meetings/{meeting.id}/confirm", {
            "winning_slot_id": slot_id,
        })
        self.assert_json_success(result)


class MeetingModelTest(ZulipTestCase):
    def test_meeting_clean_invalid_slot(self) -> None:
        # Hits models/meetings.py:33-37
        from django.core.exceptions import ValidationError
        from zerver.models.meetings import MeetingSlot
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("model_test_stream")
        meeting1 = Meeting.objects.create(
            owner=hamlet, topic="M1", stream=stream, deadline=datetime.now(tz=timezone.utc)
        )
        meeting2 = Meeting.objects.create(
            owner=hamlet, topic="M2", stream=stream, deadline=datetime.now(tz=timezone.utc)
        )
        slot2 = MeetingSlot.objects.create(meeting=meeting2, start_time=datetime.now(tz=timezone.utc))
        
        meeting1.confirmed_slot = slot2
        with self.assertRaisesRegex(ValidationError, "The confirmed slot must belong to this meeting."):
            meeting1.clean()

    def test_meeting_clean_valid_slot(self) -> None:
        from zerver.models.meetings import MeetingSlot
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("model_test_stream_2")
        meeting = Meeting.objects.create(
            owner=hamlet, topic="M1", stream=stream, deadline=datetime.now(tz=timezone.utc)
        )
        
        # Case 1: confirmed_slot is None (False branch 1)
        meeting.clean()  # Should not raise
        
        # Case 2: confirmed_slot belongs to this meeting (False branch 2)
        slot = MeetingSlot.objects.create(meeting=meeting, start_time=datetime.now(tz=timezone.utc))
        meeting.confirmed_slot = slot
        meeting.clean()  # Should not raise

        # Case 3: pk is None (False branch for 'self.pk is not None')
        unsaved_meeting = Meeting(
            owner=hamlet, topic="M3", stream=stream, deadline=datetime.now(tz=timezone.utc)
        )
        unsaved_meeting.clean()


class MeetingActionsCoverageTest(ZulipTestCase):
    def test_do_create_meeting_invalid_invite_user_ids(self) -> None:
        # Hits lib/meeting_actions.py:118
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_1")
        self.subscribe(hamlet, stream.name)
        deadline = datetime.now(tz=timezone.utc) + timedelta(days=1)
        with self.assertRaisesRegex(JsonableError, "Invalid invite_user_ids: \[999999\]"):
            do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc), None)], deadline, [999999], False, stream)

    def test_do_create_meeting_past_deadline(self) -> None:
        # Hits lib/meeting_actions.py:145
        hamlet = self.example_user("hamlet")
        past_deadline = datetime.now(tz=timezone.utc) - timedelta(days=1)
        with self.assertRaisesRegex(JsonableError, "Deadline must be in the future."):
            do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc), None)], past_deadline, [], True)

    def test_do_create_meeting_no_slots(self) -> None:
        # Hits lib/meeting_actions.py:147
        hamlet = self.example_user("hamlet")
        deadline = datetime.now(tz=timezone.utc) + timedelta(days=1)
        with self.assertRaisesRegex(JsonableError, "At least one time slot is required."):
            do_create_meeting(hamlet, "Topic", [], deadline, [], True)

    def test_do_create_meeting_no_stream_no_create(self) -> None:
        # Hits lib/meeting_actions.py:165
        hamlet = self.example_user("hamlet")
        deadline = datetime.now(tz=timezone.utc) + timedelta(days=1)
        with self.assertRaisesRegex(JsonableError, "Either create_channel must be True or a stream must be provided."):
            do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc), None)], deadline, [], False, None)

    def test_do_upsert_responses_confirmed_meeting(self) -> None:
        # Hits lib/meeting_actions.py:207
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_2")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream)
        slot_id = meeting.slots.get().id
        do_confirm_meeting(hamlet, meeting, slot_id)
        with self.assertRaisesRegex(JsonableError, "This meeting has already been confirmed."):
            do_upsert_responses(hamlet, meeting, {slot_id: True})

    def test_do_upsert_responses_past_deadline(self) -> None:
        # Hits lib/meeting_actions.py:209
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_3")
        self.subscribe(hamlet, stream.name)
        deadline = datetime.now(tz=timezone.utc) + timedelta(minutes=1)
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], deadline, [], False, stream)
        slot_id = meeting.slots.get().id
        with time_machine.travel(deadline + timedelta(minutes=1), tick=False):
            with self.assertRaisesRegex(JsonableError, "The RSVP deadline has passed."):
                do_upsert_responses(hamlet, meeting, {slot_id: True})

    def test_do_upsert_responses_unknown_slot_id(self) -> None:
        # Hits lib/meeting_actions.py:215
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_4")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream)
        with self.assertRaisesRegex(JsonableError, "Unknown slot IDs: \[999999\]"):
            do_upsert_responses(hamlet, meeting, {999999: True})

    def test_do_confirm_meeting_already_confirmed(self) -> None:
        # Hits lib/meeting_actions.py:245
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_5")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream)
        slot_id = meeting.slots.get().id
        do_confirm_meeting(hamlet, meeting, slot_id)
        with self.assertRaisesRegex(JsonableError, "Meeting is already confirmed."):
            do_confirm_meeting(hamlet, meeting, slot_id)

    def test_access_meeting_for_user_invalid_id(self) -> None:
        # Hits lib/meeting_actions.py:73-74
        hamlet = self.example_user("hamlet")
        with self.assertRaisesRegex(JsonableError, "Meeting not found."):
            access_meeting_for_user(hamlet, 999999)

    def test_assert_user_can_submit_meeting_responses_not_subscribed(self) -> None:
        # Hits lib/meeting_actions.py:85-87
        hamlet = self.example_user("hamlet")
        othello = self.example_user("othello")
        stream = self.make_stream("public_stream", invite_only=False)
        self.subscribe(hamlet, stream.name)
        # othello is NOT subscribed, but can access the stream because it's public.
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream)
        
        with self.assertRaisesRegex(JsonableError, "You must be subscribed to this meeting's channel to submit availability."):
            assert_user_can_submit_meeting_responses(othello, meeting)

    def test_do_confirm_meeting_invalid_slot_id(self) -> None:
        # Hits lib/meeting_actions.py:249-250
        hamlet = self.example_user("hamlet")
        stream = self.make_stream("existing_stream_6")
        self.subscribe(hamlet, stream.name)
        meeting = do_create_meeting(hamlet, "Topic", [(datetime.now(tz=timezone.utc) + timedelta(days=1), None)], datetime.now(tz=timezone.utc) + timedelta(hours=1), [], False, stream)
        
        with self.assertRaisesRegex(JsonableError, "Invalid slot ID."):
            do_confirm_meeting(hamlet, meeting, 999999)

    def test_do_create_meeting_folder_creation(self) -> None:
        # Hits the create_channel path where the shared folder is auto-created.
        realm = do_create_realm(string_id="new_realm", name="new_realm")
        new_user = do_create_user(
            "new_user@new_realm.com",
            "password",
            realm,
            "New User",
            acting_user=None,
        )

        deadline = datetime.now(tz=timezone.utc) + timedelta(days=1)
        with mock.patch("zerver.lib.meeting_actions.send_channel_folder_creation_event") as send_event:
            meeting = do_create_meeting(
                new_user,
                "Folder Test",
                [(datetime.now(tz=timezone.utc) + timedelta(days=2), None)],
                deadline,
                [],
                True,
            )

        self.assertEqual(meeting.stream.name, "meeting: Folder Test")
        folder = ChannelFolder.objects.get(realm=realm, name="meetings")
        self.assertEqual(meeting.stream.folder_id, folder.id)
        self.assertEqual(folder.order, folder.id)
        self.assertEqual(folder.creator_id, new_user.id)
        send_event.assert_called_once_with(folder)

    def test_do_create_meeting_existing_folder_skips_creation_event(self) -> None:
        # Hits the False branch of "if created:" for an existing shared folder.
        realm = do_create_realm(
            string_id="existing_meeting_folder_realm",
            name="existing_meeting_folder_realm",
        )
        new_user = do_create_user(
            "existing_folder_user@meetingrealm.com",
            "password",
            realm,
            "Existing Folder User",
            acting_user=None,
        )
        existing_folder = ChannelFolder.objects.create(
            realm=realm,
            name="meetings",
            order=17,
            creator=new_user,
        )

        deadline = datetime.now(tz=timezone.utc) + timedelta(days=1)
        with mock.patch("zerver.lib.meeting_actions.send_channel_folder_creation_event") as send_event:
            meeting = do_create_meeting(
                new_user,
                "Existing Folder Test",
                [(datetime.now(tz=timezone.utc) + timedelta(days=2), None)],
                deadline,
                [],
                True,
            )

        existing_folder.refresh_from_db()
        self.assertEqual(meeting.stream.folder_id, existing_folder.id)
        self.assertEqual(existing_folder.order, 17)
        self.assertEqual(existing_folder.creator_id, new_user.id)
        send_event.assert_not_called()

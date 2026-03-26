from typing import Any

from django.core.management.base import CommandParser

from zerver.lib.management import ZulipBaseCommand
from zerver.lib.meeting_actions import send_meeting_deadline_reminders


class Command(ZulipBaseCommand):
    help = "Sends private deadline reminders to non-responders for meeting polls."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--seconds-before-deadline",
            type=int,
            default=3600,
            help="Send reminders this many seconds before the meeting deadline.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        send_meeting_deadline_reminders(
            seconds_before_deadline=options["seconds_before_deadline"],
        )


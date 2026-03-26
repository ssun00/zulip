from typing import Any

from zerver.lib.management import ZulipBaseCommand
from zerver.lib.meeting_actions import check_meeting_deadlines


class Command(ZulipBaseCommand):
    help = "Transitions overdue proposed meetings to DEADLINE_PASSED."

    def handle(self, *args: Any, **options: Any) -> None:
        check_meeting_deadlines()


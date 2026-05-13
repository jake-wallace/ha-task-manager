"""Domain-specific exceptions for HA Task Manager."""


class TaskManagerError(Exception):
    """Base domain error."""


class AssignmentViolationError(TaskManagerError):
    """Raised when a non-assigned user attempts completion."""

    task_id: str
    actor_id: str
    assigned_id: str

    def __init__(self, task_id: str, actor_id: str, assigned_id: str) -> None:
        self.task_id = task_id
        self.actor_id = actor_id
        self.assigned_id = assigned_id
        super().__init__(
            f"User {actor_id!r} is not assigned to task {task_id!r}. "
            f"Assigned: {assigned_id!r}"
        )


class InvalidCompletionTargetError(TaskManagerError):
    """Raised when a completion points at the wrong or skipped due instance."""

    task_id: str
    due_instance_id: str
    reason: str

    def __init__(self, task_id: str, due_instance_id: str, reason: str) -> None:
        self.task_id = task_id
        self.due_instance_id = due_instance_id
        self.reason = reason
        super().__init__(
            f"Invalid completion target for task {task_id!r} and due instance "
            f"{due_instance_id!r}: {reason}"
        )


class UnknownNfcTagError(TaskManagerError):
    """Raised when a scanned tag has no task mapping."""

    tag_id: str

    def __init__(self, tag_id: str) -> None:
        self.tag_id = tag_id
        super().__init__(f"No task mapping found for NFC tag {tag_id!r}")


class InvalidRecurrenceError(TaskManagerError):
    """Raised when a recurrence rule or skip window combination is invalid."""


class UnmappedUserError(TaskManagerError):
    """Raised when a HA user has no household profile mapping."""

    ha_user_id: str

    def __init__(self, ha_user_id: str) -> None:
        self.ha_user_id = ha_user_id
        super().__init__(f"HA user {ha_user_id!r} has no household profile mapping")


class InvalidUserProfileMappingError(TaskManagerError):
    """Raised when a HA user mapping references a missing household profile."""

    ha_user_id: str
    profile_id: str

    def __init__(self, ha_user_id: str, profile_id: str) -> None:
        self.ha_user_id = ha_user_id
        self.profile_id = profile_id
        super().__init__(
            f"Mapping for HA user {ha_user_id!r} references missing household "
            f"profile {profile_id!r}"
        )

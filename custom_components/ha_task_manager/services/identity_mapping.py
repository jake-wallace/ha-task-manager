"""Identity mapping service for HA users and household profiles."""

from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy

from custom_components.ha_task_manager.exceptions import UnmappedUserError
from custom_components.ha_task_manager.models import (
    HouseholdProfile,
    UserProfileMapping,
)


class IdentityMappingService:
    """Resolve Home Assistant users to household profiles."""

    def __init__(
        self,
        profiles: Iterable[HouseholdProfile] | None = None,
        mappings: Iterable[UserProfileMapping] | None = None,
    ) -> None:
        self._profiles_by_id: dict[str, HouseholdProfile] = {
            profile.id: deepcopy(profile) for profile in profiles or []
        }
        self._mappings_by_ha_user_id: dict[str, UserProfileMapping] = {
            mapping.ha_user_id: deepcopy(mapping) for mapping in mappings or []
        }

    def resolve_profile(self, ha_user_id: str) -> HouseholdProfile:
        """Return the mapped household profile for the provided HA user."""
        mapping = self._mappings_by_ha_user_id.get(ha_user_id)
        if mapping is None:
            raise UnmappedUserError(ha_user_id)

        profile = self._profiles_by_id.get(mapping.profile_id)
        if profile is None:
            raise UnmappedUserError(ha_user_id)

        return deepcopy(profile)

    def is_mapped(self, ha_user_id: str) -> bool:
        """Return whether the provided HA user resolves to a profile."""
        try:
            self.resolve_profile(ha_user_id)
        except UnmappedUserError:
            return False

        return True

    def list_profiles(self) -> list[HouseholdProfile]:
        """Return all known household profiles."""
        return [deepcopy(profile) for profile in self._profiles_by_id.values()]

    def add_profile(self, profile: HouseholdProfile) -> None:
        """Add or replace a household profile."""
        self._profiles_by_id[profile.id] = deepcopy(profile)

    def add_mapping(self, mapping: UserProfileMapping) -> None:
        """Add or replace a HA user to household profile mapping."""
        self._mappings_by_ha_user_id[mapping.ha_user_id] = deepcopy(mapping)

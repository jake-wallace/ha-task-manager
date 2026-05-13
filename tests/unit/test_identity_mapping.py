from datetime import UTC, datetime

import pytest

from custom_components.ha_task_manager.exceptions import (
    InvalidUserProfileMappingError,
    UnmappedUserError,
)
from custom_components.ha_task_manager.models import (
    HouseholdProfile,
    UserProfileMapping,
)
from custom_components.ha_task_manager.services.identity_mapping import (
    IdentityMappingService,
)


@pytest.fixture(name="existing_profile")
def existing_profile_fixture() -> HouseholdProfile:
    return HouseholdProfile(
        id="profile-alex",
        display_name="Alex",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )


@pytest.fixture(name="mapping_service")
def mapping_service_fixture(
    existing_profile: HouseholdProfile,
) -> IdentityMappingService:
    return IdentityMappingService(
        profiles=[existing_profile],
        mappings=[
            UserProfileMapping(
                id="mapping-1",
                ha_user_id="ha-user-1",
                profile_id=existing_profile.id,
                created_at=datetime(2026, 5, 13, tzinfo=UTC),
            )
        ],
    )


def test_resolve_profile_for_user_returns_household_profile(
    mapping_service: IdentityMappingService,
) -> None:
    profile = mapping_service.resolve_profile("ha-user-1")

    assert profile.id == "profile-alex"
    assert profile.display_name == "Alex"


def test_resolve_profile_for_unmapped_user_raises(
    mapping_service: IdentityMappingService,
) -> None:
    with pytest.raises(UnmappedUserError):
        mapping_service.resolve_profile("missing-user")


def test_list_profiles_returns_all_profiles(
    mapping_service: IdentityMappingService,
) -> None:
    profiles = mapping_service.list_profiles()

    assert [profile.id for profile in profiles] == ["profile-alex"]


def test_add_profile_and_mapping_supports_later_resolution() -> None:
    service = IdentityMappingService()
    profile = HouseholdProfile(
        id="profile-sam",
        display_name="Sam",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    mapping = UserProfileMapping(
        id="mapping-2",
        ha_user_id="ha-user-2",
        profile_id=profile.id,
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )

    service.add_profile(profile)
    service.add_mapping(mapping)

    resolved_profile = service.resolve_profile("ha-user-2")

    assert resolved_profile.id == "profile-sam"
    assert resolved_profile.display_name == "Sam"


def test_is_mapped_reports_true_and_false(
    mapping_service: IdentityMappingService,
) -> None:
    assert mapping_service.is_mapped("ha-user-1") is True
    assert mapping_service.is_mapped("missing-user") is False


def test_add_mapping_for_nonexistent_profile_is_rejected() -> None:
    service = IdentityMappingService()
    mapping = UserProfileMapping(
        id="mapping-3",
        ha_user_id="ha-user-3",
        profile_id="missing-profile",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )

    with pytest.raises(InvalidUserProfileMappingError):
        service.add_mapping(mapping)

from datetime import datetime, timezone

import pytest

from custom_components.ha_task_manager.exceptions import (
    InvalidUserProfileMappingError,
    UnmappedUserError,
)
from custom_components.ha_task_manager.models import (
    HaUserSummary,
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
        created_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
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
                created_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
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
        created_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
    )
    mapping = UserProfileMapping(
        id="mapping-2",
        ha_user_id="ha-user-2",
        profile_id=profile.id,
        created_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
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
        created_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
    )

    with pytest.raises(InvalidUserProfileMappingError):
        service.add_mapping(mapping)


def test_list_unmapped_ha_users_excludes_mapped_inactive_and_system_users(
    mapping_service: IdentityMappingService,
) -> None:
    users = [
        HaUserSummary(
            id="ha-user-1",
            name="Alex",
            is_active=True,
            is_admin=True,
            system_generated=False,
        ),
        HaUserSummary(
            id="ha-user-2",
            name="Sam",
            is_active=True,
            is_admin=False,
            system_generated=False,
        ),
        HaUserSummary(
            id="ha-user-3",
            name="Inactive",
            is_active=False,
            is_admin=False,
            system_generated=False,
        ),
        HaUserSummary(
            id="ha-user-4",
            name="System",
            is_active=True,
            is_admin=False,
            system_generated=True,
        ),
    ]

    result = mapping_service.list_unmapped_ha_users(users)

    assert [user.id for user in result] == ["ha-user-2"]


def test_ensure_profile_for_ha_user_is_idempotent() -> None:
    service = IdentityMappingService()
    ha_user = HaUserSummary(
        id="ha-user-4",
        name="Jordan",
        is_active=True,
        is_admin=False,
        system_generated=False,
    )

    profile, mapping, created = service.ensure_profile_for_ha_user(ha_user)
    second_profile, second_mapping, second_created = service.ensure_profile_for_ha_user(
        ha_user
    )

    mappings = service.list_mappings()
    profiles = service.list_profiles()

    assert created is True
    assert second_created is False
    assert profile.display_name == "Jordan"
    assert second_profile.id == profile.id
    assert second_mapping.id == mapping.id
    assert mapping.ha_user_id == "ha-user-4"
    assert mapping.profile_id == profile.id
    assert [stored_mapping.ha_user_id for stored_mapping in mappings] == ["ha-user-4"]
    assert [stored_profile.id for stored_profile in profiles] == [profile.id]

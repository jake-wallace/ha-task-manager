import type {
  CompletionAttempt,
  CompletionRecord,
  CurrentUserProfile,
  HaUserSummary,
  HouseholdProfile,
  NfcDiscoveryEntry,
  NfcTagMapping,
  ProfileAnalyticsSnapshot,
  TaskDefinition,
  TaskDueInstance,
  UserProfileMapping
} from "../types/task";

export interface HomeAssistantConnection {
  callWS: <T>(message: Record<string, unknown>) => Promise<T>;
}

export interface DueInstanceQuery {
  fromDate?: string;
  horizonDays?: number;
}

export interface ConfirmCompletionOptions {
  attemptId: string;
  completedAt?: string;
}

export interface CompleteDueInstanceOptions {
  dueInstanceId: string;
  completedAt?: string;
}

export interface AnalyticsQuery {
  profileId: string;
  asOf?: string;
  horizonDays?: number;
}

export interface ImportHaUserOptions {
  haUserId: string;
}

export interface ImportHaUserResult {
  created: boolean;
  ha_user: HaUserSummary;
  profile: HouseholdProfile;
  mapping: UserProfileMapping;
}

export interface LinkNfcTagOptions {
  tagId: string;
  taskId: string;
}

const DOMAIN = "ha_task_manager";

function callApi<T>(
  hass: HomeAssistantConnection,
  message: Record<string, unknown>
): Promise<T> {
  return hass.callWS<T>(message);
}

export function fetchPendingConfirmations(
  hass: HomeAssistantConnection
): Promise<CompletionAttempt[]> {
  return callApi<CompletionAttempt[]>(hass, {
    type: `${DOMAIN}/pending_confirmations`
  });
}

export function fetchProfiles(
  hass: HomeAssistantConnection
): Promise<HouseholdProfile[]> {
  return callApi<HouseholdProfile[]>(hass, {
    type: `${DOMAIN}/profiles`
  });
}

export function fetchCurrentProfile(
  hass: HomeAssistantConnection
): Promise<CurrentUserProfile> {
  return callApi<CurrentUserProfile>(hass, {
    type: `${DOMAIN}/current_profile`
  });
}

export function fetchProfileMappings(
  hass: HomeAssistantConnection
): Promise<UserProfileMapping[]> {
  return callApi<UserProfileMapping[]>(hass, {
    type: `${DOMAIN}/profile_mappings`
  });
}

export function fetchHaUsers(
  hass: HomeAssistantConnection
): Promise<HaUserSummary[]> {
  return callApi<HaUserSummary[]>(hass, {
    type: `${DOMAIN}/ha_users`
  });
}

export function fetchUnmappedNfcTags(
  hass: HomeAssistantConnection
): Promise<NfcDiscoveryEntry[]> {
  return callApi<NfcDiscoveryEntry[]>(hass, {
    type: `${DOMAIN}/unmapped_nfc_tags`
  });
}

export function importHaUser(
  hass: HomeAssistantConnection,
  options: ImportHaUserOptions
): Promise<ImportHaUserResult> {
  return callApi<ImportHaUserResult>(hass, {
    type: `${DOMAIN}/import_ha_user`,
    ha_user_id: options.haUserId
  });
}

export function linkNfcTag(
  hass: HomeAssistantConnection,
  options: LinkNfcTagOptions
): Promise<NfcTagMapping> {
  return callApi<NfcTagMapping>(hass, {
    type: `${DOMAIN}/link_nfc_tag`,
    tag_id: options.tagId,
    task_id: options.taskId
  });
}

export function fetchTasks(hass: HomeAssistantConnection): Promise<TaskDefinition[]> {
  return callApi<TaskDefinition[]>(hass, {
    type: `${DOMAIN}/tasks`
  });
}

export function fetchDueInstances(
  hass: HomeAssistantConnection,
  query: DueInstanceQuery = {}
): Promise<TaskDueInstance[]> {
  return callApi<TaskDueInstance[]>(hass, {
    type: `${DOMAIN}/due_instances`,
    ...(query.fromDate ? { from_date: query.fromDate } : {}),
    ...(query.horizonDays !== undefined ? { horizon_days: query.horizonDays } : {})
  });
}

export function saveTask(
  hass: HomeAssistantConnection,
  task: TaskDefinition
): Promise<TaskDefinition> {
  return callApi<TaskDefinition>(hass, {
    type: `${DOMAIN}/save_task`,
    task
  });
}

export function confirmCompletion(
  hass: HomeAssistantConnection,
  options: ConfirmCompletionOptions
): Promise<CompletionRecord> {
  return callApi<CompletionRecord>(hass, {
    type: `${DOMAIN}/confirm_completion`,
    attempt_id: options.attemptId,
    ...(options.completedAt ? { completed_at: options.completedAt } : {})
  });
}

export function completeDueInstance(
  hass: HomeAssistantConnection,
  options: CompleteDueInstanceOptions
): Promise<CompletionRecord> {
  return callApi<CompletionRecord>(hass, {
    type: `${DOMAIN}/complete_due_instance`,
    due_instance_id: options.dueInstanceId,
    ...(options.completedAt ? { completed_at: options.completedAt } : {})
  });
}

export function fetchAnalytics(
  hass: HomeAssistantConnection,
  query: AnalyticsQuery
): Promise<ProfileAnalyticsSnapshot> {
  return callApi<ProfileAnalyticsSnapshot>(hass, {
    type: `${DOMAIN}/analytics`,
    profile_id: query.profileId,
    ...(query.asOf ? { as_of: query.asOf } : {}),
    ...(query.horizonDays !== undefined ? { horizon_days: query.horizonDays } : {})
  });
}
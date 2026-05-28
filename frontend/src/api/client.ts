import type {
  AnalyticsQuery,
  CompletionAttempt,
  CompletionRecord,
  CurrentUserProfile,
  DeleteTaskDefinitionResult,
  HaUserSummary,
  HouseholdProfile,
  NfcDiscoveryEntry,
  NfcTagMapping,
  ProfileAnalyticsSnapshot,
  ResetAnalyticsBaselineResult,
  TaskDefinition,
  TaskDueInstance,
  UndoAnalyticsBaselineResetResult,
  UndoDeleteTaskDefinitionResult,
  UserProfileMapping
} from "../types/task";

export interface HomeAssistantConnection {
  callWS: <T>(message: Record<string, unknown>) => Promise<T>;
}

export interface DueInstanceQuery {
  fromDate?: string;
  toDate?: string;
  horizonDays?: number;
}

export interface ArchiveTaskOptions {
  taskId: string;
}

export interface ConfirmCompletionOptions {
  attemptId: string;
  completedAt?: string;
}

export interface CompleteDueInstanceOptions {
  dueInstanceId: string;
  completedAt?: string;
}

export interface DeleteTaskDefinitionOptions {
  taskId: string;
  confirmText: string;
}

export interface UndoDeleteTaskDefinitionOptions {
  operationId: string;
}

export interface ResetAnalyticsBaselineOptions {
  confirmText: string;
}

export interface UndoAnalyticsBaselineResetOptions {
  operationId: string;
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
    ...(query.toDate ? { to_date: query.toDate } : {}),
    ...(query.horizonDays !== undefined ? { horizon_days: query.horizonDays } : {})
  });
}

export function archiveTask(
  hass: HomeAssistantConnection,
  options: ArchiveTaskOptions
): Promise<TaskDefinition> {
  return callApi<TaskDefinition>(hass, {
    type: `${DOMAIN}/archive_task`,
    task_id: options.taskId
  });
}

export function restoreTask(
  hass: HomeAssistantConnection,
  options: ArchiveTaskOptions
): Promise<TaskDefinition> {
  return callApi<TaskDefinition>(hass, {
    type: `${DOMAIN}/restore_task`,
    task_id: options.taskId
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
    ...(query.horizonDays !== undefined ? { horizon_days: query.horizonDays } : {}),
    ...(query.includeDeletedTaskHistory !== undefined
      ? { include_deleted_task_history: query.includeDeletedTaskHistory }
      : {})
  });
}

export function deleteTaskDefinition(
  hass: HomeAssistantConnection,
  options: DeleteTaskDefinitionOptions
): Promise<DeleteTaskDefinitionResult> {
  return callApi<DeleteTaskDefinitionResult>(hass, {
    type: `${DOMAIN}/delete_task_definition`,
    task_id: options.taskId,
    confirm_text: options.confirmText
  });
}

export function undoDeleteTaskDefinition(
  hass: HomeAssistantConnection,
  options: UndoDeleteTaskDefinitionOptions
): Promise<UndoDeleteTaskDefinitionResult> {
  return callApi<UndoDeleteTaskDefinitionResult>(hass, {
    type: `${DOMAIN}/undo_delete_task_definition`,
    operation_id: options.operationId
  });
}

export function resetAnalyticsBaseline(
  hass: HomeAssistantConnection,
  options: ResetAnalyticsBaselineOptions
): Promise<ResetAnalyticsBaselineResult> {
  return callApi<ResetAnalyticsBaselineResult>(hass, {
    type: `${DOMAIN}/reset_analytics_baseline`,
    confirm_text: options.confirmText
  });
}

export function undoAnalyticsBaselineReset(
  hass: HomeAssistantConnection,
  options: UndoAnalyticsBaselineResetOptions
): Promise<UndoAnalyticsBaselineResetResult> {
  return callApi<UndoAnalyticsBaselineResetResult>(hass, {
    type: `${DOMAIN}/undo_analytics_baseline_reset`,
    operation_id: options.operationId
  });
}
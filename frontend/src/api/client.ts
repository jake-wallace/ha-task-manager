import type {
  CompletionAttempt,
  CompletionRecord,
  CurrentUserProfile,
  HouseholdProfile,
  ProfileAnalyticsSnapshot,
  TaskDefinition,
  TaskDueInstance
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
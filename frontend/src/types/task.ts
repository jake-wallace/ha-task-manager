export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "custom_days";

export type CompletionSource = "manual" | "nfc_phone" | "nfc_reader";

export type AttemptOutcome =
  | "confirmed"
  | "blocked_duplicate"
  | "blocked_assignment"
  | "blocked_no_mapping";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  days_of_week: number[];
  interval_days: number;
  day_of_month: number | null;
}

export interface SkipWindow {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  recurrence: RecurrenceRule;
  skip_windows: SkipWindow[];
  assigned_profile_id: string;
  nfc_tag_id: string | null;
  active: boolean;
  start_date: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDueInstance {
  id: string;
  task_id: string;
  due_date: string;
  skipped: boolean;
}

export interface SnapshotGroup {
  date: string;
  items: TaskDueInstance[];
}

export interface CompletionAttempt {
  id: string;
  task_id: string;
  due_instance_id: string;
  actor_ha_user_id: string;
  source: CompletionSource;
  initiated_at: string;
}

export interface CompletionRecord {
  id: string;
  task_id: string;
  due_instance_id: string;
  completed_at: string;
  actor_ha_user_id: string;
  actor_profile_id: string;
  source: CompletionSource;
  outcome: AttemptOutcome;
  blocked_reason: string;
}

export interface HouseholdProfile {
  id: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
}

export interface HaUserSummary {
  id: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
  system_generated: boolean;
}

export interface UserProfileMapping {
  id: string;
  ha_user_id: string;
  profile_id: string;
  created_at: string;
}

export interface NfcDiscoveryEntry {
  tag_id: string;
  first_seen: string;
  last_seen: string;
  last_source: "nfc_phone" | "nfc_reader";
}

export interface NfcTagMapping {
  id: string;
  tag_id: string;
  task_id: string;
  label: string;
  created_at: string;
}

export interface CurrentUserProfile {
  ha_user_id: string;
  mapped: boolean;
  profile_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface DailyCompletionBucket {
  date: string;
  count: number;
}

export interface AnalyticsQuery {
  profileId: string;
  asOf?: string;
  horizonDays?: number;
  includeDeletedTaskHistory?: boolean;
}

export interface ProfileAnalyticsSnapshot {
  profile_id: string;
  computed_at: string;
  daily_completions: DailyCompletionBucket[];
  on_time_count: number;
  late_count: number;
  missed_count: number;
  current_streak: number;
  longest_streak: number;
}

export interface DeleteTaskDefinitionResult {
  operation_id: string;
  task_id: string;
  undo_expires_at: string;
}

export interface UndoDeleteTaskDefinitionResult {
  operation_id: string;
  status: "undone";
  task: TaskDefinition;
}

export interface ResetAnalyticsBaselineResult {
  operation_id: string;
  new_baseline_at: string;
  undo_expires_at: string;
}

export interface UndoAnalyticsBaselineResetResult {
  operation_id: string;
  restored_baseline_at: string | null;
  status: "undone";
}
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  id: string;
  name: string;
  color: string; // Tailwind bg/text color slug
  icon: string;  // Lucide icon name
  role: 'admin' | 'parent' | 'child' | 'guest';
  streak: number;
  points: number;
  createdAt: string;
  notificationTarget?: string; // e.g. notify.mobile_app_sarah_iphone
  notifyOnCompleted?: boolean;  // notify this person when others complete chores
  notifyOnAssignedOnly?: boolean; // restrict alerts only to tasks assigned to them
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'interval';

export interface PostRecurrence {
  frequency: RecurrenceFrequency;
  weekdays?: number[]; // 0 = Sunday, 1 = Monday, etc.
  dayOfMonth?: number; // 1-31
  intervalDays?: number; // e.g. every 3 days
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'one-off' | 'recurring';
  recurrence?: PostRecurrence;
  dueDate: string; // YYYY-MM-DD format, or ISO with time
  dueTime?: string; // HH:MM
  category: 'kitchen' | 'living_room' | 'cleaning' | 'kids' | 'pets' | 'garden' | 'electronics' | 'general';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string; // User ID or 'all'
  points: number;
  nfcTagId?: string; // Optional linked NFC Tag ID
  lastTriggered?: string; // ISO date of last completion triggers
  createdAt: string;
  isCompleted: boolean; // For one-off tasks, or current period for recurring
}

export interface NfcTag {
  id: string;
  label: string;
  location: string;
  associatedTaskId?: string; // The specific task this tag is glued to
  scannedCount: number;
  lastScannedAt?: string;
  createdAt: string;
}

export interface CompletedLog {
  id: string;
  taskId: string;
  taskTitle: string;
  completedAt: string; // ISO String
  completedBy: string; // User ID
  userName: string;
  category: string;
  pointsEarned: number;
  streakIncremented: boolean;
}

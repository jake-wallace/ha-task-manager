/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from './types';

// Web Audio API Sound Synthesizer for instant haptic response
export function playBeep(type: 'success' | 'failure' | 'tap' | 'radar') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'success') {
      // Warm rising chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'failure') {
      // Descending buzzer chime
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220.00, now); // A3
      osc.frequency.setValueAtTime(146.83, now + 0.12); // D3
      osc.frequency.linearRampToValueAtTime(80, now + 0.35);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'tap') {
      // Simple sharp click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880.00, now); // A5
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'radar') {
      // Glowing radar pulse
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    // Audio context might be blocked or unsupported (especially in iframes)
    console.debug('Web Audio synthesis prevented:', e);
  }
}

/**
 * Checks if a task is active and due on a given YYYY-MM-DD local date string.
 * This helper calculates active state for both one-off and recurring tasks.
 */
export function isTaskDueOnDate(task: Task, dateStr: string): boolean {
  // Parse target date details
  const targetDate = new Date(dateStr + 'T12:00:00'); // Midday to bypass TZ offsets
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1; // 1-12
  const targetDay = targetDate.getDate(); // 1-31
  const targetDayOfWeek = targetDate.getDay(); // 0(Sun) - 6(Sat)
  
  // Creation details
  const taskCreatedDate = new Date(task.createdAt.slice(0, 10) + 'T12:00:00');
  
  if (targetDate < taskCreatedDate) {
    return false; // Task was not created yet
  }

  if (task.type === 'one-off') {
    // One-offs are due exact same day
    return task.dueDate === dateStr;
  }
  
  if (task.type === 'recurring' && task.recurrence) {
    const { frequency, weekdays, dayOfMonth, intervalDays } = task.recurrence;
    
    switch (frequency) {
      case 'daily':
        return true; // Due every day
        
      case 'weekly':
        if (weekdays && weekdays.length > 0) {
          return weekdays.includes(targetDayOfWeek);
        }
        return false;
        
      case 'monthly':
        if (dayOfMonth) {
          // If task asks for say day 31, and month has only 30, trigger on last day
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
          const adjustedDay = Math.min(dayOfMonth, lastDayOfTargetMonth);
          return targetDay === adjustedDay;
        }
        return false;
        
      case 'interval':
        if (intervalDays && intervalDays > 0) {
          // Compute difference in days
          const diffTime = targetDate.getTime() - taskCreatedDate.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays % intervalDays === 0;
        }
        return false;
        
      default:
        return false;
    }
  }
  
  return false;
}

export function getRecurrenceText(task: Task): string {
  if (task.type === 'one-off') {
    return 'One-off Task';
  }
  
  const rec = task.recurrence;
  if (!rec) return 'Recurring';
  
  switch (rec.frequency) {
    case 'daily':
      return 'Daily Chore';
    case 'weekly':
      if (rec.weekdays && rec.weekdays.length > 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayNames = rec.weekdays.map(d => days[d]).join(', ');
        return `Weekly on: ${dayNames}`;
      }
      return 'Weekly Chore';
    case 'monthly':
      return `Monthly (on day ${rec.dayOfMonth ?? 1})`;
    case 'interval':
      return `Every ${rec.intervalDays ?? 1} days`;
    default:
      return 'Recurring';
  }
}

export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'kitchen': return 'Kitchen 🍳';
    case 'living_room': return 'Living Room 🛋️';
    case 'cleaning': return 'Cleaning 🧹';
    case 'kids': return 'Kids 🧸';
    case 'pets': return 'Pets 🐶';
    case 'garden': return 'Garden 🌿';
    case 'electronics': return 'Electronics ⚡';
    default: return 'General 🏠';
  }
}

export function getCategoryIconName(category: string): string {
  switch (category) {
    case 'kitchen': return 'Utensils';
    case 'living_room': return 'Tv';
    case 'cleaning': return 'Sparkles';
    case 'kids': return 'Gamepad2';
    case 'pets': return 'Cat';
    case 'garden': return 'Leaf';
    case 'electronics': return 'Zap';
    default: return 'Home';
  }
}

export function getPriorityStyles(priority: string) {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-rose-500/15',
        text: 'text-rose-400 border border-rose-500/30',
        dot: 'bg-rose-400',
        glow: 'shadow-red-500/20'
      };
    case 'medium':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-400 border border-amber-500/30',
        dot: 'bg-amber-400',
        glow: 'shadow-amber-500/20'
      };
    case 'low':
    default:
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400 border border-emerald-500/30',
        dot: 'bg-emerald-400',
        glow: 'shadow-emerald-500/20'
      };
  }
}

export function getRelativeTimeLabel(dueDateStr: string, dueTimeStr?: string): { label: string; isOverdue: boolean } {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateComparison = dueDateStr.localeCompare(todayStr);

    if (dateComparison < 0) {
      return { label: 'Overdue', isOverdue: true };
    } else if (dateComparison === 0) {
      if (dueTimeStr) {
        // Check current hour/minute
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        
        const [dueHour, dueMin] = dueTimeStr.split(':').map(Number);
        
        if (currentHour > dueHour || (currentHour === dueHour && currentMin > dueMin)) {
          return { label: `Overdue (Due at ${dueTimeStr})`, isOverdue: true };
        } else {
          return { label: `Today by ${dueTimeStr}`, isOverdue: false };
        }
      }
      return { label: 'Today', isOverdue: false };
    } else if (dueDateStr === new Date(Date.now() + 86400000).toISOString().slice(0, 10)) {
      return { label: dueTimeStr ? `Tomorrow by ${dueTimeStr}` : 'Tomorrow', isOverdue: false };
    } else {
      // Normal formatting
      const parts = dueDateStr.split('-');
      const formatted = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { label: dueTimeStr ? `${formatted} at ${dueTimeStr}` : formatted, isOverdue: false };
    }
  } catch {
    return { label: 'Scheduled', isOverdue: false };
  }
}

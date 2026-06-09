/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ListTodo, 
  Clock, 
  Sparkles, 
  Award, 
  Calendar, 
  Zap, 
  Users, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  Flame, 
  Check, 
  Plus, 
  Filter, 
  Tv, 
  RotateCcw, 
  TrendingUp, 
  ChevronRight, 
  User, 
  AlertCircle 
} from 'lucide-react';

import { UserProfile, Task, NfcTag, CompletedLog } from './types';
import { 
  INITIAL_USERS, 
  INITIAL_TASKS, 
  INITIAL_NFC_TAGS, 
  INITIAL_COMPLETED_LOGS 
} from './initialData';
import { 
  isTaskDueOnDate, 
  getRelativeTimeLabel, 
  getCategoryLabel, 
  getCategoryIconName, 
  getPriorityStyles, 
  playBeep 
} from './helpers';

import { IconRenderer } from './components/IconRenderer';
import { NewTaskModal } from './components/NewTaskModal';
import { NfcPortal } from './components/NfcPortal';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SchedulerView } from './components/SchedulerView';
import { ProfilesView } from './components/ProfilesView';

const getTodayLocalString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function App({ hass, config }: { hass?: any; config?: any }) {
  // Navigation Screens: 'dashboard' | 'scheduler' | 'nfc' | 'analytics' | 'profiles'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scheduler' | 'nfc' | 'analytics' | 'profiles'>('dashboard');

  // Core Data States (persisted in LocalStorage)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nfcTags, setNfcTags] = useState<NfcTag[]>([]);
  const [completedLogs, setCompletedLogs] = useState<CompletedLog[]>([]);
  const [currentSystemDate, setCurrentSystemDate] = useState<string>('2026-06-09'); // Default starting date (Tue)
  const [hasSoundEnabled, setHasSoundEnabled] = useState<boolean>(true);

  // App UI States
  const [activeUserId, setActiveUserId] = useState<string>(''); // Set dynamically based on profiles or Home Assistant login
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  
  // Custom Floating Notifications Stack
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'alert' | 'info' } | null>(null);

  // Quick Virtual Tag scan overlay controller
  const [isQuickNfcScannerOpen, setIsQuickNfcScannerOpen] = useState(false);
  const [quickNfcSelectedTag, setQuickNfcSelectedTag] = useState('');

  // Lovelace Production Options
  const [isProductionMode, setIsProductionMode] = useState<boolean>(false);
  const [disableDateSkipping, setDisableDateSkipping] = useState<boolean>(false);
  const [autoDetectHass, setAutoDetectHass] = useState<boolean>(true);

  // Option A Notification Settings
  const [sendNotifications, setSendNotifications] = useState<boolean>(true);
  const [notificationTarget, setNotificationTarget] = useState<string>('notify.notify');

  // Read YAML config or localStorage resolved overrides
  const finalProductionMode = config?.production_mode !== undefined 
    ? (config.production_mode === true)
    : isProductionMode;

  const finalDisableDateSkipping = config?.disable_date_skipping !== undefined
    ? (config.disable_date_skipping === true)
    : disableDateSkipping;

  const finalAutoDetectHass = config?.auto_detect_hass !== undefined
    ? (config.auto_detect_hass === true)
    : autoDetectHass;

  // Hydrate from LocalStorage or seed defaults
  useEffect(() => {
    const storedUsers = localStorage.getItem('ha_users');
    const storedTasks = localStorage.getItem('ha_tasks');
    const storedTags = localStorage.getItem('ha_nfc_tags');
    const storedLogs = localStorage.getItem('ha_completed_logs');
    const storedDate = localStorage.getItem('ha_system_date');
    const storedSound = localStorage.getItem('ha_sound_preference');

    const storedProd = localStorage.getItem('ha_production_mode') === 'true';
    const storedDisableDate = localStorage.getItem('ha_disable_date_skipping') === 'true';
    const storedAutoDetect = localStorage.getItem('ha_auto_detect_hass') !== 'false';
    const storedSendNotifications = localStorage.getItem('ha_send_notifications') !== 'false';
    const storedNotificationTarget = localStorage.getItem('ha_notification_target') || 'notify.notify';

    setIsProductionMode(storedProd);
    setDisableDateSkipping(storedDisableDate);
    setAutoDetectHass(storedAutoDetect);
    setSendNotifications(storedSendNotifications);
    setNotificationTarget(storedNotificationTarget);

    const activeProd = config?.production_mode !== undefined ? (config.production_mode === true) : storedProd;
    const activeDisableDate = config?.disable_date_skipping !== undefined ? (config.disable_date_skipping === true) : storedDisableDate;

    if (storedUsers) {
      setUsers(JSON.parse(storedUsers));
    } else {
      setUsers(activeProd ? [] : INITIAL_USERS);
    }

    if (storedTasks) {
      setTasks(JSON.parse(storedTasks));
    } else {
      setTasks(activeProd ? [] : INITIAL_TASKS);
    }

    if (storedTags) {
      setNfcTags(JSON.parse(storedTags));
    } else {
      setNfcTags(activeProd ? [] : INITIAL_NFC_TAGS);
    }

    if (storedLogs) {
      setCompletedLogs(JSON.parse(storedLogs));
    } else {
      setCompletedLogs(activeProd ? [] : INITIAL_COMPLETED_LOGS);
    }

    if (storedDate) {
      setCurrentSystemDate(storedDate);
    } else {
      setCurrentSystemDate(activeDisableDate ? getTodayLocalString() : '2026-06-09');
    }

    if (storedSound) setHasSoundEnabled(storedSound === 'true');
    else setHasSoundEnabled(true);
  }, [config]);

  // Fallback default actor if users list is populated but activeUserId is empty
  useEffect(() => {
    if (users.length > 0 && !activeUserId) {
      setActiveUserId(users[0].id);
    }
  }, [users, activeUserId]);

  // Dynamic Home Assistant Logged-in User Sync
  useEffect(() => {
    if (!finalAutoDetectHass || !hass?.user?.name) return;
    
    const haUsername = hass.user.name.trim();
    const match = users.find(u => u.name.toLowerCase() === haUsername.toLowerCase());
    
    if (match) {
      if (activeUserId !== match.id) {
        setActiveUserId(match.id);
      }
    } else {
      const alreadyChecked = users.some(u => u.name.toLowerCase() === haUsername.toLowerCase());
      if (alreadyChecked) return;

      const newId = `ha-${Date.now()}`;
      const newProfile: UserProfile = {
        id: newId,
        name: haUsername,
        color: 'emerald',
        icon: 'User',
        role: 'parent',
        streak: 0,
        points: 0,
        createdAt: new Date().toISOString(),
      };
      
      setUsers(prev => {
        if (prev.some(u => u.name.toLowerCase() === haUsername.toLowerCase())) return prev;
        const next = [...prev, newProfile];
        updateStorage('ha_users', next);
        return next;
      });
      setActiveUserId(newId);
    }
  }, [finalAutoDetectHass, hass?.user?.name, users, activeUserId]);

  // Save changes to localStorage whenever they happen
  const updateStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleSetUsers = (newUsers: UserProfile[]) => {
    setUsers(newUsers);
    updateStorage('ha_users', newUsers);
  };

  const handleSetTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    updateStorage('ha_tasks', newTasks);
  };

  const handleSetTags = (newTags: NfcTag[]) => {
    setNfcTags(newTags);
    updateStorage('ha_nfc_tags', newTags);
  };

  const handleSetLogs = (newLogs: CompletedLog[]) => {
    setCompletedLogs(newLogs);
    updateStorage('ha_completed_logs', newLogs);
  };

  const handleSetSystemDate = (newDate: string) => {
    setCurrentSystemDate(newDate);
    localStorage.setItem('ha_system_date', newDate);
  };

  const toggleSound = () => {
    const nextVal = !hasSoundEnabled;
    setHasSoundEnabled(nextVal);
    localStorage.setItem('ha_sound_preference', String(nextVal));
    if (nextVal) setTimeout(() => playBeep('tap'), 50);
  };

  const triggerToast = (text: string, type: 'success' | 'alert' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Switch Active Active User Profile
  const handleSwitchActiveUser = (userId: string) => {
    if (hasSoundEnabled) playBeep('tap');
    setActiveUserId(userId);
    const u = users.find(user => user.id === userId);
    if (u) {
      triggerToast(`Acting browser user switched to ${u.name}`, 'info');
    }
  };

  // Add a new Profile
  const handleAddNewUser = (profileData: Omit<UserProfile, 'id' | 'streak' | 'points' | 'createdAt'>) => {
    const newUser: UserProfile = {
      ...profileData,
      id: `user-${Date.now()}`,
      streak: 0,
      points: 0,
      createdAt: new Date().toISOString(),
    };
    const updated = [...users, newUser];
    handleSetUsers(updated);
    triggerToast(`Added family profile: "${newUser.name}"!`, 'success');
  };

  // Delete a Profile
  const handleDeleteUser = (id: string) => {
    if (users.length <= 1) return;
    const updated = users.filter(u => u.id !== id);
    handleSetUsers(updated);
    if (activeUserId === id) {
      setActiveUserId(updated[0].id);
    }
    triggerToast('Family profile removed.', 'alert');
  };

  // TASK SCHEDULE BUILDER
  const handleSaveNewTask = (taskData: Omit<Task, 'id' | 'isCompleted' | 'createdAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
    
    // Check if task starting dueDate differs from currentSystemDate
    // Under typical environment, its due date is as configured.
    const updatedTasks = [...tasks, newTask];
    handleSetTasks(updatedTasks);
    
    // If an NFC tag was linked, associate it
    if (taskData.nfcTagId) {
      const updatedTags = nfcTags.map(tag => {
        if (tag.id === taskData.nfcTagId) {
          return { ...tag, associatedTaskId: newTask.id };
        }
        return tag;
      });
      handleSetTags(updatedTags);
    }

    triggerToast(`"${newTask.title}" is happily scheduled!`, 'success');
  };

  // Delete task
  const handleDeleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    const updatedTasks = tasks.filter(t => t.id !== id);
    handleSetTasks(updatedTasks);

    // Free up any corresponding NFC tag links
    if (taskToDelete?.nfcTagId) {
      const updatedTags = nfcTags.map(tag => {
        if (tag.id === taskToDelete.nfcTagId) {
          const { associatedTaskId, ...rest } = tag;
          return { ...rest, scannedCount: tag.scannedCount } as NfcTag; // removes associatedTaskId cleanly
        }
        return tag;
      });
      handleSetTags(updatedTags);
    }
    triggerToast('Task removed from scheduler.', 'alert');
  };

  // REGISTER NFC TAG
  const handleCreateNfcTag = (label: string, location: string, associatedTaskId?: string) => {
    const newTag: NfcTag = {
      id: `tag-${Math.random().toString(36).slice(2, 10)}`,
      label,
      location,
      associatedTaskId,
      scannedCount: 0,
      createdAt: new Date().toISOString(),
    };

    const updatedTags = [...nfcTags, newTag];
    handleSetTags(updatedTags);

    // If an associated task was selected, map from task back to tag
    if (associatedTaskId) {
      const updatedTasks = tasks.map(t => {
        if (t.id === associatedTaskId) {
          return { ...t, nfcTagId: newTag.id };
        }
        return t;
      });
      handleSetTasks(updatedTasks);
    }

    triggerToast(`Registered tag "${label}" in directory!`, 'success');
    return newTag;
  };

  // Link Tag to Task
  const handleLinkTagToTask = (tagId: string, taskId: string) => {
    // 1. Remove previous links on this tag
    // 2. Map tag to task
    const updatedTags = nfcTags.map(tag => {
      if (tag.id === tagId) {
        return { ...tag, associatedTaskId: taskId };
      }
      // If task was already linked to another tag, unlink it
      if (tag.associatedTaskId === taskId && tag.id !== tagId) {
        const { associatedTaskId, ...rest } = tag;
        return { ...rest } as NfcTag;
      }
      return tag;
    });

    const updatedTasks = tasks.map(task => {
      if (task.id === taskId) {
        return { ...task, nfcTagId: tagId };
      }
      // Unlink other tasks mapped to this same tagId
      if (task.nfcTagId === tagId && task.id !== taskId) {
        const { nfcTagId, ...rest } = task;
        return { ...rest } as Task;
      }
      return task;
    });

    handleSetTags(updatedTags);
    handleSetTasks(updatedTasks);
    const tag = nfcTags.find(t => t.id === tagId);
    const task = tasks.find(t => t.id === taskId);
    triggerToast(`Bound tag "${tag?.label}" to chore "${task?.title}"!`, 'success');
  };

  // Delete Tag
  const handleDeleteNfcTag = (id: string) => {
    const updatedTags = nfcTags.filter(t => t.id !== id);
    handleSetTags(updatedTags);

    // Clean references in task scheduler
    const updatedTasks = tasks.map(t => {
      if (t.nfcTagId === id) {
        const { nfcTagId, ...rest } = t;
        return { ...rest } as Task;
      }
      return t;
    });
    handleSetTasks(updatedTasks);
    triggerToast('Tag profile deleted.', 'alert');
  };

  // PROGRESS CORE: COMPLETE A TASK IN ACTIVE ENVIRONMENT
  const handleCompleteTask = (taskId: string, completedByUserId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    const activeExecutor = users.find(u => u.id === completedByUserId);

    if (!targetTask || !activeExecutor) return { success: false, message: 'Invalid target parameters' };

    // Prevent double completions of already-checked-off on the same day/period
    if (targetTask.isCompleted) {
      return { success: false, message: 'This chore is already ticked off for today!' };
    }

    // 1. Mark task as completed
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, isCompleted: true, lastTriggered: new Date().toISOString() };
      }
      return t;
    });
    handleSetTasks(updatedTasks);

    // 2. Award Points and advance Streak for active executor user
    // A streak increases when they perform their assigned chores, or general tasks
    const updatedUsers = users.map(u => {
      if (u.id === completedByUserId) {
        const isAssigned = targetTask.assignedTo === 'all' || targetTask.assignedTo === completedByUserId;
        const streakIncrement = isAssigned ? 1 : 0;
        return {
          ...u,
          points: u.points + targetTask.points,
          streak: u.streak + streakIncrement,
        };
      }
      return u;
    });
    handleSetUsers(updatedUsers);

    // 3. Create entry in Completed Chores History Log
    const newLog: CompletedLog = {
      id: `log-${Date.now()}`,
      taskId: targetTask.id,
      taskTitle: targetTask.title,
      completedAt: new Date().toISOString(),
      completedBy: activeExecutor.id,
      userName: activeExecutor.name,
      category: targetTask.category,
      pointsEarned: targetTask.points,
      streakIncremented: targetTask.assignedTo === 'all' || targetTask.assignedTo === completedByUserId,
    };
    handleSetLogs([...completedLogs, newLog]);

    if (hasSoundEnabled) playBeep('success');
    triggerToast(`✨ Chore completed! ${activeExecutor.name} earned +${targetTask.points} stars!`, 'success');

    // Option A: Active Home Assistant Companion App notify channel trigger
    if (sendNotifications && hass) {
      try {
        const serviceName = notificationTarget.startsWith('notify.') 
          ? notificationTarget.substring(7) 
          : notificationTarget || 'notify';
        
        hass.callService('notify', serviceName, {
          title: 'Chore Completed! ✨',
          message: `${activeExecutor.name} completed the chore: "${targetTask.title}" and earned +${targetTask.points} rating stars!`
        });
        console.log(`Fired Home Assistant notify command: notify.${serviceName}`);
      } catch (err) {
        console.error('Home Assistant notify callback error:', err);
      }
    }

    return { success: true, taskTitle: targetTask.title, message: 'Chore ticked off successfully!' };
  };

  // NFC INTEGRATION: SCANNING A TAG ID
  const handleScanNfcTag = (tagId: string) => {
    const tag = nfcTags.find(t => t.id === tagId);
    if (!tag) {
      return { success: false, message: 'NFC chip serial number unrecognized in this smart-home configuration.' };
    }

    // Update scanned counts
    const updatedTags = nfcTags.map(t => {
      if (t.id === tagId) {
        return { ...t, scannedCount: t.scannedCount + 1, lastScannedAt: new Date().toISOString() };
      }
      return t;
    });
    handleSetTags(updatedTags);

    if (!tag.associatedTaskId) {
      return { 
        success: false, 
        message: `Tag "${tag.label}" scanned. However, it holds no bound action. Associate it with a chore first!` 
      };
    }

    // Complete corresponding task checklist as active browser user
    const outcome = handleCompleteTask(tag.associatedTaskId, activeUserId);
    return outcome;
  };

  // TIME TRAVEL: ADVANCE SIMULATED TIME 
  const handleAdvanceDays = (daysToAdvance: number) => {
    const current = new Date(currentSystemDate + 'T12:00:00');
    current.setDate(current.getDate() + daysToAdvance);
    const newDateStr = current.toISOString().slice(0, 10);
    
    handleSetSystemDate(newDateStr);

    // Auto-reset check lists for completed tasks!
    // One-offs remain completed and fall into historic records,
    // Recurring tasks need to reset their completed state (isCompleted = false) if they are due on the new date
    const updatedTasks = tasks.map(task => {
      if (task.type === 'one-off') {
        return task; // one offs stay checked off
      }
      
      // For recurring, we check if it is due on the new date.
      // If it is due on this date, we reset isCompleted to false so the user can check it off again!
      // This is a wonderfully accurate physical simulation.
      const isDue = isTaskDueOnDate(task, newDateStr);
      if (isDue) {
        return { ...task, isCompleted: false, dueDate: newDateStr };
      } else {
        // If not due today, update its target dueDate further out
        return { ...task, isCompleted: false, dueDate: newDateStr };
      }
    });

    handleSetTasks(updatedTasks);
    
    // Stale streak check: If a user has chores explicitly assigned to them on the old date that they complete-missed, 
    // we break their streak for realistic habit motivation!
    const missedChores = tasks.filter(t => !t.isCompleted && t.type === 'recurring' && t.assignedTo !== 'all');
    if (missedChores.length > 0) {
      const missedUserIds = new Set(missedChores.map(c => c.assignedTo));
      const updatedUsers = users.map(u => {
        if (missedUserIds.has(u.id) && u.streak > 0) {
          // Reset streak of people who missed chores
          return { ...u, streak: 0 };
        }
        return u;
      });
      handleSetUsers(updatedUsers);
    }

    if (hasSoundEnabled) playBeep('radar');
    triggerToast(`System date advanced by ${daysToAdvance} days to ${new Date(newDateStr + 'T12:00:00').toLocaleDateString()}! Recurring task schedules reset.`, 'info');
  };

  // Periodic real calendar day crossover reset
  useEffect(() => {
    if (finalDisableDateSkipping && currentSystemDate) {
      const todayStr = getTodayLocalString();
      if (currentSystemDate !== todayStr) {
        const lastDate = new Date(currentSystemDate + 'T12:00:00');
        const todayDate = new Date(todayStr + 'T12:00:00');
        const diffTime = todayDate.getTime() - lastDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
          handleAdvanceDays(diffDays);
        } else {
          handleSetSystemDate(todayStr);
        }
      }
    }
  }, [finalDisableDateSkipping, currentSystemDate]);

  // Handle toggles from Lovelace Setup sidebar
  const handleToggleProductionMode = (val: boolean) => {
    setIsProductionMode(val);
    localStorage.setItem('ha_production_mode', String(val));
    if (val) {
      if (window.confirm("Enabling Lovelace Production Mode will switch to an empty sandbox layout without any mock default users/chores. Would you like to clear existing mocked elements now?")) {
        handleSetUsers([]);
        handleSetTasks([]);
        handleSetTags([]);
        handleSetLogs([]);
        setActiveUserId('');
        triggerToast("Switched to clean Lovelace Production sandbox!", "success");
      }
    } else {
      if (window.confirm("Disabling Production Mode to load simulated demo data? All existing data will be replaced by standard demo profiles.")) {
        handleSetUsers(INITIAL_USERS);
        handleSetTasks(INITIAL_TASKS);
        handleSetTags(INITIAL_NFC_TAGS);
        handleSetLogs(INITIAL_COMPLETED_LOGS);
        setActiveUserId('user-1');
        triggerToast("Simulated demo database loaded!", "success");
      }
    }
  };

  const handleToggleDisableDateSkipping = (val: boolean) => {
    setDisableDateSkipping(val);
    localStorage.setItem('ha_disable_date_skipping', String(val));
    if (val) {
      const todayStr = getTodayLocalString();
      handleSetSystemDate(todayStr);
      triggerToast(`System date locked to real local calendar: ${todayStr}`, "info");
    } else {
      triggerToast("Simulated date controls unlocked. (Simulation date: 2026-06-09)", "info");
    }
  };

  const handleToggleAutoDetectHass = (val: boolean) => {
    setAutoDetectHass(val);
    localStorage.setItem('ha_auto_detect_hass', String(val));
    triggerToast(val ? "Home Assistant operator auto-sync enabled!" : "Home Assistant auto-sync disabled", "info");
  };

  const handleToggleSendNotifications = (val: boolean) => {
    setSendNotifications(val);
    localStorage.setItem('ha_send_notifications', String(val));
    triggerToast(val ? "Push notification alerts enabled!" : "Push notification alerts disabled", "info");
  };

  const handleUpdateNotificationTarget = (target: string) => {
    setNotificationTarget(target);
    localStorage.setItem('ha_notification_target', target);
  };

  const handleWipeDatabase = () => {
    if (window.confirm("Are you sure you want to completely clear all chores, profiles, NFC registries, and history? This will prepare a 100% clean sheet for your Home Assistant deployment.")) {
      handleSetUsers([]);
      handleSetTasks([]);
      handleSetTags([]);
      handleSetLogs([]);
      setActiveUserId('');
      triggerToast("All data cleared successfully! Ready for your live configuration.", "success");
    }
  };

  // TRIGGER RE-SEED
  const handleResetToDefaults = () => {
    localStorage.clear();
    setUsers(INITIAL_USERS);
    setTasks(INITIAL_TASKS);
    setNfcTags(INITIAL_NFC_TAGS);
    setCompletedLogs(INITIAL_COMPLETED_LOGS);
    setCurrentSystemDate('2026-06-09');
    setActiveUserId('user-1');
    playBeep('success');
    triggerToast('All task data and profiles reset to default Lovelace configuration.', 'info');
  };

  // FILTERED DASHBOARD CHECKLISTS
  const dTodayTasks = tasks.filter(task => {
    const isDue = isTaskDueOnDate(task, currentSystemDate);
    
    const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          task.description.toLowerCase().includes(searchQuery.toLowerCase());

    return (isDue || (task.type === 'one-off' && !task.isCompleted)) && matchesCategory && matchesPriority && matchesSearch;
  });

  const activeActor = users.find(u => u.id === activeUserId) || users[0];

  return (
    <div className="min-h-screen bg-ha-bg-dark bg-gradient-to-br from-[#06100e] via-[#0b1c18] to-[#122c26] text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden" id="applet-dashboard-canvas">
      
      {/* Aurora Sage Glow Accents */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-gradient-to-tr from-teal-900/15 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* 2. CHORE WRAPPER PORTAL */}
      <div className="flex-grow flex flex-col md:flex-row items-stretch p-4 gap-4 relative z-10">
        
        {/* DESKTOP SIDEBAR RAIL */}
        <aside className="hidden md:flex flex-col justify-between w-64 bg-ha-card-dark/70 border border-ha-border-dark rounded-3xl py-6 px-4 shrink-0 shadow-xl transition-all backdrop-blur-md">
          <div className="space-y-6">
            
            {/* BRAND HEADER */}
            <div className="flex items-center gap-3 px-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                <Zap className="w-5 h-5 fill-white/10" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-white tracking-widest uppercase mb-0.5 leading-none">Home Suite</h1>
                <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider font-mono">Scheduler</span>
              </div>
            </div>

            {/* NAV LINKS */}
            <nav className="space-y-1.5 pt-4 text-xs font-semibold">
              <button
                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('dashboard'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-pointer ${activeTab === 'dashboard' ? 'bg-ha-blue/12 text-teal-300 ring-1 ring-ha-blue/20 font-bold' : 'text-slate-400 hover:bg-ha-border-dark/30 hover:text-white'}`}
                id="nav-dash-link"
              >
                <ListTodo className="w-4 h-4" /> Checklist Dashboard
              </button>
              
              <button
                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('scheduler'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-pointer ${activeTab === 'scheduler' ? 'bg-ha-blue/12 text-teal-300 ring-1 ring-ha-blue/20 font-bold' : 'text-slate-400 hover:bg-ha-border-dark/30 hover:text-white'}`}
                id="nav-sched-link"
              >
                <Clock className="w-4 h-4" /> Chore Scheduler
              </button>

              <button
                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('nfc'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition relative cursor-pointer ${activeTab === 'nfc' ? 'bg-ha-blue/12 text-teal-300 ring-1 ring-ha-blue/20 font-bold' : 'text-slate-400 hover:bg-ha-border-dark/30 hover:text-white'}`}
                id="nav-nfc-link"
              >
                <Zap className="w-4 h-4 animate-pulse text-teal-400" /> NFC Hub Registry
                <span className="absolute right-3.5 px-1.5 py-0.5 bg-gradient-to-r from-teal-400 to-emerald-500 text-white font-extrabold text-[8px] tracking-wide rounded-full scale-95 shadow-sm shadow-teal-500/20">
                  NEW
                </span>
              </button>

              <button
                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('analytics'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-pointer ${activeTab === 'analytics' ? 'bg-ha-blue/12 text-teal-300 ring-1 ring-ha-blue/20 font-bold' : 'text-slate-400 hover:bg-ha-border-dark/30 hover:text-white'}`}
                id="nav-stats-link"
              >
                <TrendingUp className="w-4 h-4" /> Family Analytics
              </button>

              <button
                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('profiles'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-pointer ${activeTab === 'profiles' ? 'bg-ha-blue/12 text-teal-300 ring-1 ring-ha-blue/20 font-bold' : 'text-slate-400 hover:bg-ha-border-dark/30 hover:text-white'}`}
                id="nav-users-link"
              >
                <Users className="w-4 h-4" /> Family Profiles
              </button>
            </nav>

          </div>          {/* LOWER CONFIGS */}
          <div className="space-y-4 text-xs font-semibold px-2">
                       {/* ACTOR SELECTOR ON DESKTOP */}
            <div className="p-3 bg-ha-bg-dark rounded-2xl border border-ha-border-dark space-y-2.5">
              <span className="text-[10px] text-teal-400 uppercase font-bold block leading-none font-mono">Current Operator</span>
              
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-white`} style={{ backgroundColor: `${activeActor?.color === 'emerald' ? '#10b981' : activeActor?.color === 'sky' ? '#0284c7' : activeActor?.color === 'amber' ? '#f59e0b' : '#d946ef'}` }}>
                  <IconRenderer name={activeActor?.icon || 'Smile'} size={12} />
                </div>
                <span className="text-white text-[11px] truncate">{activeActor?.name}</span>
              </div>
              
              <select
                value={activeUserId}
                onChange={(e) => handleSwitchActiveUser(e.target.value)}
                className="w-full px-2 py-1.5 bg-ha-card-dark text-[10px] border border-ha-border-dark/60 rounded-lg text-slate-200 outline-none active:scale-95 focus:border-ha-blue transition cursor-pointer"
                id="change-active-member-select"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* SOUND PREF & RESET */}
            <div className="flex items-center justify-between text-slate-500 pt-2 border-t border-ha-border-dark/60">
              <button
                onClick={toggleSound}
                className="p-1 px-1.5 hover:bg-ha-border-dark/60 hover:text-white rounded-lg transition-all flex items-center gap-1.5 text-[10px]"
                title="Toggle UI synthesized sound effects"
              >
                {hasSoundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-ha-blue" /> Sounds ON
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-650" /> Sounds OFF
                  </>
                )}
              </button>

              <button
                onClick={handleResetToDefaults}
                className="p-1 px-1.5 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg text-slate-550 transition-all text-[10px] font-mono leading-none cursor-pointer"
                title="Reset all schedule tasks back to seeded factory defaults"
              >
                Reset
              </button>
            </div>

          </div>
        </aside>

        {/* MAIN CONTAINER STREAM */}
        <main className="flex-1 flex flex-col p-2 md:p-4 space-y-6 max-h-[100vh] overflow-y-auto">
          
          {/* HEADER ROW: ACTING SWITCHER */}
          <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-2">
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-widest text-ha-blue">
                {activeTab === 'dashboard' ? 'Home Assistant Suite' : activeTab === 'scheduler' ? 'Automated Scheduling' : activeTab === 'nfc' ? 'Web NFC Automation' : activeTab === 'analytics' ? 'Performance Insights' : 'Household Registry'}
              </span>
              <h2 className="text-3xl font-light text-white tracking-tight mt-1">
                {activeTab === 'dashboard' ? 'Task Orchestrator' : activeTab === 'scheduler' ? 'Chore Scheduler' : activeTab === 'nfc' ? 'NFC Tag Hub' : activeTab === 'analytics' ? 'Family Metrics' : 'Family Profiles'}
              </h2>
            </div>

            {/* UPPER PANEL: HORIZONTAL FAMILY MEMBER CAP SULE */}
            <div className="p-1.5 bg-ha-card-dark/60 border border-ha-border-dark/55 rounded-full flex items-center gap-2 self-start lg:self-auto overflow-x-auto max-w-full backdrop-blur-md">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider shrink-0 pl-3 pr-2 border-r border-ha-border-dark leading-none">
                Active Member
              </span>
              
              <div className="flex items-center gap-1">
                {users.map(u => {
                  const isActive = u.id === activeUserId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSwitchActiveUser(u.id)}
                      className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 border transition cursor-pointer active:scale-95 ${isActive ? 'bg-gradient-to-r from-teal-400 to-emerald-500 border-emerald-500 text-white font-medium shadow-sm shadow-teal-400/10' : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'}`}
                      id={`switcher-member-${u.id}`}
                    >
                      <div className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center text-white font-bold" style={{ backgroundColor: `${u.color === 'emerald' ? '#10b981' : u.color === 'sky' ? '#0284c7' : u.color === 'amber' ? '#f59e0b' : '#d946ef'}` }}>
                        <IconRenderer name={u.icon} size={8} />
                      </div>
                      <span className="text-[10px] whitespace-nowrap font-semibold">{u.name.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </header>

          {/* ACTIVE SCREEN RENDERS */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="w-full"
              >
                
                {/* 1. CHECKLIST DASHBOARD VIEW */}
                {activeTab === 'dashboard' && (
                  <div className="space-y-6" id="checklist-dashboard">
                    
                    {/* FILTER CHIPS PANEL */}
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
                      <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
                        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase mr-2.5">Filter category:</span>
                        <button
                          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setCategoryFilter('all'); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${categoryFilter === 'all' ? 'bg-indigo-600 border border-indigo-500 text-white shadow' : 'text-slate-400 border border-transparent hover:text-slate-200'}`}
                        >
                          All Chores
                        </button>
                        <button
                          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setCategoryFilter('kitchen'); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${categoryFilter === 'kitchen' ? 'bg-indigo-600 border border-indigo-500 text-white shadow' : 'text-slate-400 border border-transparent hover:text-slate-200'}`}
                        >
                          Kitchen
                        </button>
                        <button
                          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setCategoryFilter('cleaning'); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${categoryFilter === 'cleaning' ? 'bg-indigo-600 border border-indigo-500 text-white shadow' : 'text-slate-400 border border-transparent hover:text-slate-200'}`}
                        >
                          Cleaning
                        </button>
                        <button
                          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setCategoryFilter('pets'); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${categoryFilter === 'pets' ? 'bg-indigo-600 border border-indigo-500 text-white shadow' : 'text-slate-400 border border-transparent hover:text-slate-200'}`}
                        >
                          Pets
                        </button>
                        <button
                          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setCategoryFilter('garden'); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${categoryFilter === 'garden' ? 'bg-indigo-600 border border-indigo-500 text-white shadow' : 'text-slate-400 border border-transparent hover:text-slate-200'}`}
                        >
                          Garden
                        </button>
                      </div>

                      {/* QUICK SYSTEM CLOCK BANNER */}
                      <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 rounded-full px-4 py-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="text-[10px] text-slate-350 font-mono font-medium">
                          {finalDisableDateSkipping ? 'Today' : 'Sim Date'}: {new Date(currentSystemDate + 'T12:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                        </span>
                      </div>
                    </div>

                    {/* TWO COLUMN GRID: ACTIVE TASKS CHECKLISTS & SMART ASSISTANT TILES */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 align-start">
                      
                      {/* CHORE WORKPLACE CHECKLISTS PANEL (2/3 col) */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl min-h-[420px] flex flex-col justify-between shadow-2xl">
                          <div>
                            <div className="flex justify-between items-center mb-6">
                              <h2 className="text-xl font-medium flex items-center gap-2 text-white">
                                <ListTodo className="w-5 h-5 text-indigo-400" /> Active Scheduler
                              </h2>
                              <button 
                                onClick={() => { if (hasSoundEnabled) playBeep('tap'); setIsNewTaskModalOpen(true); }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-full font-medium transition-colors cursor-pointer active:scale-95 duration-150"
                              >
                                + New Task
                              </button>
                            </div>

                            {/* CHORE RENDERED LOOP */}
                            <div className="space-y-3.5">
                              {dTodayTasks.length === 0 ? (
                                <div className="py-16 text-center text-slate-500">
                                  <CheckCircle2 className="w-12 h-12 text-emerald-400 fill-emerald-500/10 mx-auto mb-3" />
                                  <h4 className="font-bold text-slate-200 text-sm mb-1">House is Spotless!</h4>
                                  <p className="text-xs max-w-sm mx-auto leading-relaxed">
                                    No duties due on this simulated date in this category. Use the <strong>Chore Scheduler</strong> menu to create additional items or advance simulated days!
                                  </p>
                                </div>
                              ) : (
                                dTodayTasks.map(task => {
                                  const isDone = task.isCompleted;
                                  const hasTag = !!task.nfcTagId;
                                  const prStyle = getPriorityStyles(task.priority);
                                  const relativeTime = getRelativeTimeLabel(task.dueDate, task.dueTime);

                                  return (
                                    <div
                                      key={task.id}
                                      className={`p-4 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-between gap-4 transition duration-150 ${isDone ? 'opacity-60' : 'hover:border-slate-700/80'}`}
                                      id={`chore-item-row-${task.id}`}
                                    >
                                      <div className="flex items-center gap-4 min-w-0">
                                        {/* Status vertical line strip */}
                                        <div className={`w-1.5 h-10 ${isDone ? 'bg-slate-705' : 'bg-indigo-505'} rounded-full shrink-0`} style={{ backgroundColor: isDone ? '#475569' : '#6366f1' }}></div>
                                        
                                        {/* Pure-CSS Check Button box */}
                                        <button
                                          onClick={() => {
                                            if (!isDone) handleCompleteTask(task.id, activeUserId);
                                          }}
                                          disabled={isDone}
                                          className={`w-5.5 h-5.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${isDone ? 'bg-emerald-500 border-emerald-500 text-white cursor-default' : 'border-slate-550 hover:border-ha-blue hover:bg-ha-blue/10 text-transparent hover:text-ha-blue/60 active:scale-90 cursor-pointer'}`}
                                          id={`check-box-btn-${task.id}`}
                                        >
                                          <Check className="w-4.5 h-4.5 stroke-[3px]" />
                                        </button>

                                        {/* Task text particulars */}
                                        <div className="space-y-0.5 font-sans min-w-0">
                                          <h4 className={`text-sm font-semibold text-white tracking-tight truncate ${isDone ? 'line-through text-slate-500' : ''}`}>
                                            {task.title}
                                          </h4>
                                          <p className={`text-xs text-slate-400 truncate leading-relaxed ${isDone ? 'line-through text-slate-550' : ''}`}>
                                            {task.description || 'No direct step-instructions.'}
                                          </p>

                                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono select-none pt-0.5">
                                            {/* Due Date Indicator */}
                                            <span className={`px-1.5 py-0.5 rounded leading-none ${relativeTime.isOverdue ? 'bg-rose-500/15 text-rose-450 border border-rose-500/25 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                                              {relativeTime.label}
                                            </span>

                                            {/* Assigned Person tag */}
                                            <span className="px-1.5 py-0.5 bg-ha-blue/10 text-ha-blue rounded leading-none border border-ha-blue/15 capitalize">
                                              👤 {task.assignedTo === 'all' ? 'All family pool' : users.find(u => u.id === task.assignedTo)?.name.split(' ')[0]}
                                            </span>

                                            {/* Category Indicator */}
                                            <span className="px-1.5 py-0.5 bg-slate-900 text-slate-350 rounded leading-none flex items-center gap-1">
                                              <IconRenderer name={getCategoryIconName(task.category)} size={10} />
                                              {getCategoryLabel(task.category).split(' ')[0]}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Right particulars: Points Badge or Tag indicator */}
                                      <div className="text-right shrink-0 flex items-center gap-3 select-none">
                                        
                                        {/* Tag icon notifier */}
                                        {hasTag && (
                                          <div
                                            className="w-7 h-7 rounded bg-ha-orange/10 border border-ha-orange/20 flex items-center justify-center text-ha-orange animate-pulse"
                                            title="This chore uses physical NFC stickers around the house! Scan or simulate tap to complete easily"
                                          >
                                            <Zap className="w-3.5 h-3.5" />
                                          </div>
                                        )}

                                        <span className="px-2.5 py-0.5 rounded-full bg-ha-orange/15 text-ha-orange font-bold text-xs">
                                          +{task.points} ⭐
                                        </span>
                                      </div>

                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="mt-8 pt-4 border-t border-slate-800/60 text-[10px] text-slate-500 text-center uppercase font-mono">
                            💡 Change the acting profile at the top right to award points to different family members!
                          </div>
                        </div>
                      </div>

                      {/* QUICK QUICK ACTION BAR & DIRECT OVERVIEW (1/3 col) */}
                      <div className="lg:col-span-1 space-y-6">
                        
                        {/* CURRENT PROFILE SUMMARY */}
                        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
                          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-orange-400" /> Acting Member Stats
                          </h3>

                          <div className="flex items-center gap-3.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-850">
                            <div className="w-11 h-11 rounded-full border border-white/20 flex items-center justify-center text-white text-base font-bold shadow-md shadow-black/15" style={{ backgroundColor: `${activeActor?.color === 'emerald' ? '#10b981' : activeActor?.color === 'sky' ? '#0284c7' : activeActor?.color === 'amber' ? '#f59e0b' : '#d946ef'}` }}>
                              <IconRenderer name={activeActor?.icon || 'Smile'} size={20} />
                            </div>

                            <div>
                              <h4 className="font-semibold text-white text-xs capitalize">{activeActor?.name}</h4>
                              <p className="text-[10px] text-slate-500 font-mono capitalize">{activeActor?.role} family member</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
                            <div className="p-3 bg-slate-950 border border-slate-850 rounded-2xl text-center">
                              <span className="text-[9px] text-slate-500 block font-sans font-bold uppercase tracking-wider">Active Streak</span>
                              <span className="text-rose-450 font-bold flex items-center gap-1 justify-center mt-1 text-sm">
                                <Flame className="w-4 h-4 text-rose-500 fill-rose-500/10" /> {activeActor?.streak}d
                              </span>
                            </div>

                            <div className="p-3 bg-slate-950 border border-slate-850 rounded-2xl text-center">
                              <span className="text-[9px] text-slate-500 block font-sans font-bold uppercase tracking-wider">Points Gained</span>
                              <span className="text-orange-400 font-bold flex items-center gap-1 justify-center mt-1 text-sm">
                                <Award className="w-4 h-4" /> {activeActor?.points}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* HIGH-END INTERACTIVE NFC TAP CONTROLLER OVERLAY */}
                        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
                          <div className="flex items-start gap-3.5 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-505/10 border border-indigo-505/20 flex items-center justify-center text-indigo-400 shrink-0">
                              <Zap className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Household NFC Taps</h4>
                              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                                Simulate tapping an NFC tag sticker physically near household appliances to complete checklists.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3 pt-1 text-xs">
                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 font-mono">Select Virtual Tag:</label>
                              <select
                                value={quickNfcSelectedTag}
                                onChange={(e) => setQuickNfcSelectedTag(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 text-xs outline-none focus:border-indigo-500 transition font-medium"
                              >
                                <option value="">-- Choose Virtual Tag --</option>
                                {nfcTags.map(tag => {
                                  const tObj = tasks.find(tsk => tsk.id === tag.associatedTaskId);
                                  return (
                                    <option key={tag.id} value={tag.id}>
                                      🏷️ {tag.label} ({tObj?.title || 'None'})
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            <button
                              onClick={() => {
                                  if (!quickNfcSelectedTag) return;
                                  const action = handleScanNfcTag(quickNfcSelectedTag);
                                  setQuickNfcSelectedTag('');
                              }}
                              disabled={!quickNfcSelectedTag}
                              className={`w-full py-2.5 px-4 rounded-full font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition duration-200 active:scale-95 cursor-pointer ${quickNfcSelectedTag ? 'bg-indigo-600 text-white shadow-indigo-600/15 hover:bg-indigo-500' : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed shadow-none'}`}
                            >
                              <Zap className="w-4 h-4" /> Tap Physical Sticker
                            </button>
                          </div>
                        </div>

                        {/* ACCORDION TUTORIALS */}
                        <div className="p-5 bg-indigo-950/10 border border-indigo-900/20 rounded-2xl text-xs text-slate-400 space-y-2">
                          <span className="font-bold text-indigo-400 block text-[10px] uppercase tracking-wider">💡 Lovelace Quick Tip</span>
                          <p className="leading-relaxed text-[11px] text-slate-400">
                            Web NFC API supports real physical NFC tag stickers on premium mobile devices. Register them inside the <strong>NFC Hub Registry</strong> and mount them around the kitchen!
                          </p>
                        </div>

                      </div>

                    </div>
                  </div>
                )}

                {/* 2. CHORE RECURRENCE SCHEDULER VIEW */}
                {activeTab === 'scheduler' && (
                  <SchedulerView
                    tasks={tasks}
                    users={users}
                    onDeleteTask={handleDeleteTask}
                    onOpenNewTaskModal={() => { if (hasSoundEnabled) playBeep('tap'); setIsNewTaskModalOpen(true); }}
                    currentSystemDate={currentSystemDate}
                    onAdvanceDays={handleAdvanceDays}
                    disableDateSkipping={finalDisableDateSkipping}
                  />
                )}

                {/* 3. NFC HUB REGISTRY VIEW */}
                {activeTab === 'nfc' && (
                  <NfcPortal
                    nfcTags={nfcTags}
                    tasks={tasks}
                    onScanTag={handleScanNfcTag}
                    onCreateTag={handleCreateNfcTag}
                    onLinkTagToTask={handleLinkTagToTask}
                    onDeleteTag={handleDeleteNfcTag}
                  />
                )}

                {/* 4. PERFORMANCE ANALYTICS VIEW */}
                {activeTab === 'analytics' && (
                  <AnalyticsPanel
                    users={users}
                    logs={completedLogs}
                    tasks={tasks}
                  />
                )}

                {/* 5. FAMILY PROFILES VIEW */}
                {activeTab === 'profiles' && (
                  <ProfilesView
                    users={users}
                    onAddUser={handleAddNewUser}
                    onDeleteUser={handleDeleteUser}
                    isProductionMode={finalProductionMode}
                    onToggleProduction={handleToggleProductionMode}
                    disableDateSkipping={finalDisableDateSkipping}
                    onToggleDisableDate={handleToggleDisableDateSkipping}
                    autoDetectHass={finalAutoDetectHass}
                    onToggleAutoDetectHass={handleToggleAutoDetectHass}
                    onClearAllData={handleWipeDatabase}
                    sendNotifications={sendNotifications}
                    onToggleSendNotifications={handleToggleSendNotifications}
                    notificationTarget={notificationTarget}
                    onUpdateNotificationTarget={handleUpdateNotificationTarget}
                  />
                )}

              </motion.div>
            </AnimatePresence>
          </div>

        </main>
      </div>

      {/* 3. TOAST FLOATING ALERTS (pure in-app, perfect and sandbox friendly!) */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 35 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl border flex items-center gap-3 shadow-xl max-w-sm font-sans ${toastMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 ha-glow-green' : toastMessage.type === 'alert' ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' : 'bg-ha-blue/15 border-ha-blue/30 text-ha-blue'}`}
            id="toast-notification-panel"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toastMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : toastMessage.type === 'alert' ? 'bg-rose-500/20 text-rose-400' : 'bg-ha-blue/20 text-ha-blue'}`}>
              {toastMessage.type === 'success' ? <Check className="w-4.5 h-4.5" /> : toastMessage.type === 'alert' ? <AlertCircle className="w-4.5 h-4.5" /> : <Sparkles className="w-4.5 h-4.5" />}
            </div>
            <div>
              <p className="text-xs font-bold font-sans tracking-wide leading-tight">
                {toastMessage.type === 'success' ? 'TASK COMPLETED' : toastMessage.type === 'alert' ? 'ALERT NOTIFICATOR' : 'INTEGRATION UPDATE'}
              </p>
              <p className="text-[11px] opacity-90 mt-0.5 leading-snug font-sans">{toastMessage.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MODALS ROW */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onSave={handleSaveNewTask}
        users={users}
        nfcTags={nfcTags}
        onQuickRegisterNfc={handleCreateNfcTag}
      />

      {/* 5. RESPONSIVE BOTTOM MOBILE NAV BANNER */}
      <nav className="md:hidden bg-[#0a1815] border-t border-ha-border-dark/60 flex items-center justify-around py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 z-20 sticky bottom-0 animate-fade-in">
        <button
          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('dashboard'); }}
          className={`flex flex-col items-center gap-1 transition ${activeTab === 'dashboard' ? 'text-ha-blue font-extrabold' : 'text-slate-400'}`}
        >
          <ListTodo className="w-5 h-5" /> Checklist
        </button>
        <button
          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('scheduler'); }}
          className={`flex flex-col items-center gap-1 transition ${activeTab === 'scheduler' ? 'text-ha-blue font-extrabold' : 'text-slate-400'}`}
        >
          <Clock className="w-5 h-5" /> Scheduler
        </button>
        <button
          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('nfc'); }}
          className={`flex flex-col items-center gap-1 transition relative ${activeTab === 'nfc' ? 'text-ha-blue font-extrabold' : 'text-slate-400'}`}
        >
          <Zap className="w-5 h-5" /> NFC Hub
        </button>
        <button
          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('analytics'); }}
          className={`flex flex-col items-center gap-1 transition ${activeTab === 'analytics' ? 'text-ha-blue font-extrabold' : 'text-slate-400'}`}
        >
          <TrendingUp className="w-5 h-5" /> Stats
        </button>
        <button
          onClick={() => { if (hasSoundEnabled) playBeep('tap'); setActiveTab('profiles'); }}
          className={`flex flex-col items-center gap-1 transition ${activeTab === 'profiles' ? 'text-ha-blue font-extrabold' : 'text-slate-400'}`}
        >
          <Users className="w-5 h-5" /> Profiles
        </button>
      </nav>

    </div>
  );
}

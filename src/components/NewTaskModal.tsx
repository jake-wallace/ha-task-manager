/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Clock, Award, Tag, Sparkles, Plus, Info } from 'lucide-react';
import { UserProfile, NfcTag, Task, RecurrenceFrequency } from '../types';
import { IconRenderer } from './IconRenderer';
import { playBeep } from '../helpers';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => void;
  users: UserProfile[];
  nfcTags: NfcTag[];
  onQuickRegisterNfc: (label: string, location: string) => NfcTag;
}

const CATEGORIES = [
  { id: 'kitchen', label: 'Kitchen', icon: 'Utensils', emoji: '🍳' },
  { id: 'living_room', label: 'Living Room', icon: 'Tv', emoji: '🛋️' },
  { id: 'cleaning', label: 'Cleaning', icon: 'Sparkles', emoji: '🧹' },
  { id: 'kids', label: 'Bedrooms', icon: 'Bed', emoji: '🛏️' },
  { id: 'pets', label: 'Pets', icon: 'Cat', emoji: '🐶' },
  { id: 'garden', label: 'Garden', icon: 'Leaf', emoji: '🌿' },
  { id: 'electronics', label: 'Electronics', icon: 'Zap', emoji: '⚡' },
  { id: 'general', label: 'General', icon: 'Home', emoji: '🏠' },
];

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  users,
  nfcTags,
  onQuickRegisterNfc,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<'one-off' | 'recurring'>('recurring');
  
  // Recurrence Configs
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri default
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [intervalDays, setIntervalDays] = useState<number>(3);

  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState<string>('12:00');
  const [category, setCategory] = useState<string>('kitchen');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [assignedTo, setAssignedTo] = useState<string>('all');
  const [points, setPoints] = useState<number>(20);
  
  // NFC Tag integration
  const [nfcAssociationType, setNfcAssociationType] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagLocation, setNewTagLocation] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleWeekdayToggle = (day: number) => {
    playBeep('tap');
    if (weekdays.includes(day)) {
      setWeekdays(weekdays.filter(d => d !== day));
    } else {
      setWeekdays([...weekdays, day].sort());
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Task title is required';
    if (taskType === 'recurring') {
      if (frequency === 'weekly' && weekdays.length === 0) {
        newErrors.weekdays = 'Please select at least one weekday';
      }
      if (frequency === 'monthly' && (dayOfMonth < 1 || dayOfMonth > 31)) {
        newErrors.dayOfMonth = 'Day must be between 1 and 31';
      }
      if (frequency === 'interval' && (intervalDays < 1)) {
        newErrors.intervalDays = 'Interval must be 1 or more days';
      }
    }
    if (nfcAssociationType === 'existing' && !selectedTagId) {
      newErrors.selectedTag = 'Please select an existing NFC tag';
    }
    if (nfcAssociationType === 'new') {
      if (!newTagName.trim()) newErrors.newTagName = 'Tag label is required';
      if (!newTagLocation.trim()) newErrors.newTagLocation = 'Tag location is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      playBeep('failure');
      return;
    }

    // Determine final nfcTagId
    let finalNfcTagId: string | undefined = undefined;
    if (nfcAssociationType === 'existing') {
      finalNfcTagId = selectedTagId;
    } else if (nfcAssociationType === 'new') {
      const createdTag = onQuickRegisterNfc(newTagName, newTagLocation);
      finalNfcTagId = createdTag.id;
    }

    const taskData: any = {
      title: title.trim(),
      description: description.trim(),
      type: taskType,
      dueDate,
      dueTime: dueTime || undefined,
      category,
      priority,
      assignedTo,
      points,
      nfcTagId: finalNfcTagId,
    };

    if (taskType === 'recurring') {
      taskData.recurrence = {
        frequency,
        ...(frequency === 'weekly' ? { weekdays } : {}),
        ...(frequency === 'monthly' ? { dayOfMonth } : {}),
        ...(frequency === 'interval' ? { intervalDays } : {}),
      };
    }

    onSave(taskData);
    playBeep('success');
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTaskType('recurring');
    setFrequency('daily');
    setDueDate(new Date().toISOString().slice(0, 10));
    setDueTime('12:00');
    setCategory('kitchen');
    setPriority('medium');
    setAssignedTo('all');
    setPoints(20);
    setNfcAssociationType('none');
    setSelectedTagId('');
    setNewTagName('');
    setNewTagLocation('');
    setErrors({});
  };

  const daysOfWeek = [
    { label: 'S', value: 0 },
    { label: 'M', value: 1 },
    { label: 'T', value: 2 },
    { label: 'W', value: 3 },
    { label: 'T', value: 4 },
    { label: 'F', value: 5 },
    { label: 'S', value: 6 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-2xl ha-glass rounded-2xl border border-ha-border-dark overflow-hidden ha-glass-glow my-8"
        id="new-task-modal-container"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-ha-bg-dark/50 border-b border-ha-border-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ha-blue/10 border border-ha-blue/30 flex items-center justify-center text-ha-blue">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white tracking-tight">Create Smart Task</h3>
              <p className="text-xs text-slate-400">Schedule automatic tasks for your Home integration</p>
            </div>
          </div>
          <button
            onClick={() => { playBeep('tap'); onClose(); }}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            id="close-modal-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Title & Description */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Task Title *</label>
              <input
                type="text"
                placeholder="e.g., Feed the dogs or Clean Kitchen Stove"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-4 py-2.5 bg-ha-bg-dark border rounded-xl text-white outline-none focus:border-ha-blue focus:ring-1 focus:ring-ha-blue/30 transition text-sm ${errors.title ? 'border-rose-500/80 bg-rose-500/5' : 'border-ha-border-dark'}`}
                id="task-title-input"
              />
              {errors.title && <span className="text-xs text-rose-400 mt-1 block">{errors.title}</span>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Description</label>
              <textarea
                placeholder="Write specific step-by-step instructions details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 bg-ha-bg-dark border border-ha-border-dark rounded-xl text-white outline-none focus:border-ha-blue focus:ring-1 focus:ring-ha-blue/30 transition text-sm resize-none"
                id="task-desc-input"
              />
            </div>
          </div>

          {/* Task Type and Schedule */}
          <div className="p-4 bg-ha-bg-dark/40 rounded-xl border border-ha-border-dark/60 space-y-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => { playBeep('tap'); setTaskType('recurring'); }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition ${taskType === 'recurring' ? 'bg-ha-blue/15 border-ha-blue text-ha-blue ring-1 ring-ha-blue/30' : 'bg-ha-bg-dark border-ha-border-dark text-slate-400 hover:text-slate-200'}`}
                id="type-recurring-btn"
              >
                <Clock className="w-3.5 h-3.5" /> Recurring Schedule
              </button>
              <button
                type="button"
                onClick={() => { playBeep('tap'); setTaskType('one-off'); }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition ${taskType === 'one-off' ? 'bg-ha-blue/15 border-ha-blue text-ha-blue ring-1 ring-ha-blue/30' : 'bg-ha-bg-dark border-ha-border-dark text-slate-400 hover:text-slate-200'}`}
                id="type-oneoff-btn"
              >
                <Calendar className="w-3.5 h-3.5" /> One-off To-Do
              </button>
            </div>

            {/* If Recurring, show recursion configs */}
            {taskType === 'recurring' && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Frequency</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['daily', 'weekly', 'monthly', 'interval'] as RecurrenceFrequency[]).map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => { playBeep('tap'); setFrequency(freq); }}
                        className={`py-1.5 text-xs font-medium rounded-lg border capitalize transition ${frequency === freq ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-ha-border-dark text-slate-400 hover:text-slate-200'}`}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>
                </div>

                {frequency === 'weekly' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Days of the Week *</label>
                    <div className="flex gap-2 justify-between">
                      {daysOfWeek.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => handleWeekdayToggle(day.value)}
                          className={`w-9 h-9 rounded-full border text-xs font-semibold flex items-center justify-center transition ${weekdays.includes(day.value) ? 'bg-ha-orange/20 border-ha-orange text-ha-orange shadow-sm' : 'bg-ha-bg-dark border-ha-border-dark text-slate-400'}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    {errors.weekdays && <span className="text-xs text-rose-400 mt-1 block">{errors.weekdays}</span>}
                  </div>
                )}

                {frequency === 'monthly' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Day of Month</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Number(e.target.value))}
                        className={`w-20 px-3 py-1.5 bg-ha-bg-dark border border-ha-border-dark rounded-lg text-white text-sm outline-none focus:border-ha-blue ${errors.dayOfMonth ? 'border-rose-500' : ''}`}
                      />
                      <span className="text-xs text-slate-400">Trigger task monthly on this day of the month.</span>
                    </div>
                    {errors.dayOfMonth && <span className="text-xs text-rose-400 mt-1 block">{errors.dayOfMonth}</span>}
                  </div>
                )}

                {frequency === 'interval' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Interval Repeat</label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">Every</span>
                      <input
                        type="number"
                        min="1"
                        value={intervalDays}
                        onChange={(e) => setIntervalDays(Number(e.target.value))}
                        className="w-20 px-3 py-1.5 bg-ha-bg-dark border border-ha-border-dark rounded-lg text-white text-sm outline-none focus:border-ha-blue"
                      />
                      <span className="text-xs text-slate-400">days</span>
                    </div>
                    {errors.intervalDays && <span className="text-xs text-rose-400 mt-1 block">{errors.intervalDays}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Due Date & Time fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Target Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-ha-bg-dark border border-ha-border-dark rounded-xl text-white text-xs outline-none focus:border-ha-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Target Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-ha-bg-dark border border-ha-border-dark rounded-xl text-white text-xs outline-none focus:border-ha-blue"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Category, Priority, Points & Assignee Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Category Tag</label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-ha-border-dark/40 rounded-xl bg-ha-bg-dark/15">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { playBeep('tap'); setCategory(cat.id); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border text-left transition ${category === cat.id ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'}`}
                  >
                    <span>{cat.emoji}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee & Priority */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Assign To Family Member</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-ha-bg-dark border border-ha-border-dark rounded-xl text-white outline-none focus:border-ha-blue text-sm transition"
                  id="assign-member-select"
                >
                  <option value="all">🏠 Pool (Any family member)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((pri) => (
                    <button
                      key={pri}
                      type="button"
                      onClick={() => { playBeep('tap'); setPriority(pri); }}
                      className={`py-1.5 text-xs font-semibold rounded-lg border capitalize transition ${priority === pri ? pri === 'high' ? 'bg-rose-500/10 border-rose-500 text-rose-400' : pri === 'medium' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-transparent border-ha-border-dark text-slate-450 hover:text-slate-250 hover:border-slate-700'}`}
                    >
                      {pri}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reward Points */}
          <div className="p-4 bg-ha-bg-dark/40 rounded-xl border border-ha-border-dark/60 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-ha-orange" /> Completion Point Value
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-ha-orange/15 text-ha-orange font-bold text-sm tracking-wide">
                +{points} Stars
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-full accent-ha-orange cursor-pointer bg-slate-800 rounded-lg appearance-none h-1.5"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>5 Stars (Quick/Easy)</span>
              <span>50 Stars (Moderate Effort)</span>
              <span>100 Stars (Weekly Giant chore)</span>
            </div>
          </div>

          {/* NFC Integration Options */}
          <div className="p-4 rounded-xl border border-ha-blue/25 bg-ha-blue/5 space-y-4">
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-lg bg-ha-blue/15 flex items-center justify-center text-ha-blue shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white tracking-wider uppercase">Link NFC Tag Completion</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                  Glue a physical NFC sticker near chores. Tapping it with a phone or mock scanning it instantly completes this task!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { playBeep('tap'); setNfcAssociationType('none'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg border transition ${nfcAssociationType === 'none' ? 'bg-ha-blue/20 border-ha-blue text-ha-blue font-bold' : 'bg-ha-bg-dark/60 border-ha-border-dark text-slate-450 hover:text-slate-300'}`}
              >
                No Tag
              </button>
              <button
                type="button"
                onClick={() => { playBeep('tap'); setNfcAssociationType('existing'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg border transition ${nfcAssociationType === 'existing' ? 'bg-ha-blue/20 border-ha-blue text-ha-blue font-bold' : 'bg-ha-bg-dark/60 border-ha-border-dark text-slate-450 hover:text-slate-300'}`}
              >
                Existing Tag
              </button>
              <button
                type="button"
                onClick={() => { playBeep('tap'); setNfcAssociationType('new'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg border transition ${nfcAssociationType === 'new' ? 'bg-ha-blue/20 border-ha-blue text-ha-blue font-bold' : 'bg-ha-bg-dark/60 border-ha-border-dark text-slate-450 hover:text-slate-300'}`}
              >
                + Register New Tag
              </button>
            </div>

            {nfcAssociationType === 'existing' && (
              <div className="space-y-2 animate-fadeIn">
                <label className="block text-xs text-slate-400">Select Registered NFC Tag</label>
                {nfcTags.filter(tag => !tag.associatedTaskId).length === 0 ? (
                  <div className="p-3 bg-ha-bg-dark/80 rounded-xl border border-ha-border-dark/60 text-xs text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-ha-orange" />
                    <span>No unused NFC tags found. You can map a brand new physical tag instead!</span>
                  </div>
                ) : (
                  <select
                    value={selectedTagId}
                    onChange={(e) => setSelectedTagId(e.target.value)}
                    className={`w-full px-4 py-2 bg-ha-bg-dark border rounded-xl text-white outline-none focus:border-ha-blue text-xs ${errors.selectedTag ? 'border-rose-500' : 'border-ha-border-dark'}`}
                  >
                    <option value="">-- Choose a Tag --</option>
                    {nfcTags
                      .filter(tag => !tag.associatedTaskId)
                      .map(tag => (
                        <option key={tag.id} value={tag.id}>
                          🏷️ {tag.label} ({tag.location})
                        </option>
                    ))}
                  </select>
                )}
                {errors.selectedTag && <span className="text-xs text-rose-400 block">{errors.selectedTag}</span>}
              </div>
            )}

            {nfcAssociationType === 'new' && (
              <div className="grid grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tag Label *</label>
                  <input
                    type="text"
                    placeholder="e.g., Cat Food Bowl Sticker"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className={`w-full px-3 py-2 bg-ha-bg-dark border rounded-xl text-white text-xs outline-none focus:border-ha-blue ${errors.newTagName ? 'border-rose-500' : 'border-ha-border-dark'}`}
                  />
                  {errors.newTagName && <span className="text-xs text-rose-400 mt-0.5 block">{errors.newTagName}</span>}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tag Location Physical *</label>
                  <input
                    type="text"
                    placeholder="e.g., Laundry Room Cabinet"
                    value={newTagLocation}
                    onChange={(e) => setNewTagLocation(e.target.value)}
                    className={`w-full px-3 py-2 bg-ha-bg-dark border rounded-xl text-white text-xs outline-none focus:border-ha-blue ${errors.newTagLocation ? 'border-rose-500' : 'border-ha-border-dark'}`}
                  />
                  {errors.newTagLocation && <span className="text-xs text-rose-400 mt-0.5 block">{errors.newTagLocation}</span>}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 bg-ha-bg-dark/50 border-t border-ha-border-dark">
          <button
            type="button"
            onClick={() => { playBeep('tap'); onClose(); }}
            className="px-5 py-2 hover:bg-slate-800 text-slate-300 font-medium rounded-xl text-xs transition"
            id="cancel-modal-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-ha-blue hover:bg-ha-blue/80 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-ha-blue/20 cursor-pointer active:scale-95 transition-all"
            id="save-task-btn"
          >
            <Plus className="w-4 h-4" /> Schedule Task
          </button>
        </div>
      </motion.div>
    </div>
  );
};

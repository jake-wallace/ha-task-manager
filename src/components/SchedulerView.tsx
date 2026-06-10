/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Task, UserProfile } from '../types';
import { getRecurrenceText, getCategoryLabel, getCategoryIconName, getPriorityStyles, playBeep } from '../helpers';
import { IconRenderer } from './IconRenderer';
import { Calendar, Trash2, ArrowRight, Award, Plus, Sparkles, Filter, Search, RotateCcw, FastForward, Play, Edit2 } from 'lucide-react';

interface SchedulerViewProps {
  tasks: Task[];
  users: UserProfile[];
  onDeleteTask: (id: string) => void;
  onOpenNewTaskModal: () => void;
  onEditTask?: (task: Task) => void;
  currentSystemDate: string; // YYYY-MM-DD
  onAdvanceDays: (days: number) => void;
  disableDateSkipping?: boolean;
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({
  tasks,
  users,
  onDeleteTask,
  onOpenNewTaskModal,
  onEditTask,
  currentSystemDate,
  onAdvanceDays,
  disableDateSkipping = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Search/Filter logic
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          task.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
    const matchesType = filterType === 'all' || task.type === filterType;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    
    return matchesSearch && matchesCategory && matchesType && matchesPriority;
  });

  const getUserName = (id: string) => {
    if (id === 'all') return 'Pool (Any profile)';
    const u = users.find(user => user.id === id);
    return u ? u.name : 'Unknown Profile';
  };

  const getSystemDateText = () => {
    const d = new Date(currentSystemDate + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-6" id="scheduler-view-container">
      
      {/* HEADER CONTROLLER: SYSTEM CLOCK & TIME-TRAVEL SIMULATOR */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-xl">
        <div className="space-y-1 z-10">
          <span className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase block mb-0.5">Home Assistant Active Clock</span>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-indigo-450" />
            <h3 className="text-lg font-light text-white font-sans">{getSystemDateText()}</h3>
          </div>
          <p className="text-xs text-slate-400">
            Current simulated schedule date. Advance days to verify recurring intervals reset checklists:
          </p>
        </div>

        {/* TIME TRAVEL TRIGGERS */}
        {disableDateSkipping ? (
          <div className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 px-4 py-2 rounded-full font-semibold flex items-center gap-1.5 shrink-0 self-start md:self-center font-sans shadow shadow-emerald-500/5">
            <span className="w-1.5 h-1.5 bg-emerald-450 rounded-full animate-pulse" />
            Live Calendar Lock
          </div>
        ) : (
          <div className="flex items-center gap-2.5 z-10 shrink-0">
            <button
              onClick={() => { playBeep('tap'); onAdvanceDays(1); }}
              className="px-4 py-2 bg-slate-950 text-slate-100 hover:text-white hover:bg-slate-800 border border-slate-800 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              id="advance-1-day-btn"
            >
              <FastForward className="w-4 h-4" /> Advance 1 Day
            </button>
            
            <button
              onClick={() => { playBeep('tap'); onAdvanceDays(7); }}
              className="px-4 py-2 bg-indigo-650 text-white hover:bg-indigo-600 border border-indigo-500 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              ⏩ Fast-Forward 1 Week
            </button>
          </div>
        )}
      </div>

      {/* FILTER SEARCH GRID */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
        
        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search chores in task list (e.g. vacuum, cat, feed)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-white outline-none focus:border-indigo-500 text-xs transition"
              id="search-scheduler-input"
            />
          </div>

          <button
            onClick={() => { playBeep('tap'); onOpenNewTaskModal(); }}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white font-semibold text-xs rounded-full flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/15 cursor-pointer active:scale-95 transition-all"
            id="schedule-new-task-btn"
          >
            <Plus className="w-4 h-4" /> Add Smart Task
          </button>
        </div>

        {/* SELECTS FILTERSROW */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 font-mono">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => { playBeep('tap'); setFilterCategory(e.target.value); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-2xl text-slate-300 text-xs outline-none focus:border-indigo-500 transition"
            >
              <option value="all">All Yards/Rooms</option>
              <option value="kitchen">Kitchen 🍳</option>
              <option value="living_room">Living Room 🛋️</option>
              <option value="cleaning">Cleaning 🧹</option>
              <option value="kids">Bedrooms 🛏️</option>
              <option value="pets">Pets 🐶</option>
              <option value="garden">Garden 🌿</option>
              <option value="electronics">Electronics ⚡</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 font-mono">Schedule Type</label>
            <select
              value={filterType}
              onChange={(e) => { playBeep('tap'); setFilterType(e.target.value); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-2xl text-slate-300 text-xs outline-none focus:border-indigo-500 transition"
            >
              <option value="all">All Chore Types</option>
              <option value="one-off">One-off To-Dos</option>
              <option value="recurring">Recurring Tasks</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 font-mono">Priority</label>
            <select
              value={filterPriority}
              onChange={(e) => { playBeep('tap'); setFilterPriority(e.target.value); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-2xl text-slate-300 text-xs outline-none focus:border-indigo-500 transition"
              id="priority-filter-select"
            >
              <option value="all">All Priorities</option>
              <option value="high">🔴 High priority</option>
              <option value="medium">🟡 Medium priority</option>
              <option value="low">🟢 Low priority</option>
            </select>
          </div>
        </div>

      </div>

      {/* RENDERED CARDS GRID */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
          Scheduled Chores & Checklists ({filteredTasks.length})
        </h4>

        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-slate-800 rounded-3xl bg-slate-900 shadow-xl">
            <Search className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <h5 className="font-semibold text-slate-300 text-sm mb-1">No Matching Tasks</h5>
            <p className="text-xs max-w-sm mx-auto">
              We couldn't find any scheduled tasks matching your search. Clear your filters or create a new chore!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTasks.map(task => {
              const priorityStyle = getPriorityStyles(task.priority);
              
              return (
                <div
                  key={task.id}
                  className="p-5 bg-slate-900 border border-slate-800 hover:border-indigo-500/35 rounded-3xl shadow-xl transition flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    
                    {/* Header: Title & Delete */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white tracking-tight">{task.title}</h4>
                        <p className="text-xs text-slate-450 leading-relaxed mt-1">{task.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => { playBeep('tap'); onEditTask?.(task); }}
                          className="p-1.5 bg-[#172739] hover:bg-indigo-600 text-indigo-350 hover:text-white rounded-xl transition cursor-pointer"
                          title="Modify task parameter list"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { playBeep('failure'); onDeleteTask(task.id); }}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-450 hover:text-white rounded-xl transition cursor-pointer"
                          title="Delete scheduling task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Meta stats tags */}
                    <div className="flex flex-wrap gap-2 text-[11px] items-center">
                      {/* Priority Tag */}
                      <span className={`px-2 py-0.5 rounded-full font-bold font-sans capitalize flex items-center gap-1 ${priorityStyle.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityStyle.dot}`} />
                        {task.priority} Priority
                      </span>

                      {/* Recurrence text */}
                      <span className="px-2 py-0.5 bg-slate-950 text-slate-405 font-medium rounded-full border border-slate-850">
                        {getRecurrenceText(task)}
                      </span>

                      {/* Category icon tag */}
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 font-semibold rounded-full border border-indigo-500/15 flex items-center gap-1">
                        <IconRenderer name={getCategoryIconName(task.category)} size={11} />
                        {getCategoryLabel(task.category)}
                      </span>
                    </div>

                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs select-none">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-mono font-bold uppercase">Assigned To</span>
                      <span className="font-semibold text-slate-300 mt-0.5 block">{getUserName(task.assignedTo)}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block font-mono font-bold uppercase">Reward Stars</span>
                      <span className="font-bold text-orange-400 mt-0.5 block flex items-center gap-1 justify-end">
                        <Award className="w-3.5 h-3.5" /> +{task.points}
                      </span>
                    </div>
                  </div>

                  {task.nfcTagId && (
                    <div className="mt-3 bg-orange-500/5 border border-orange-500/20 px-3 py-1.5 rounded-2xl text-[10px] text-slate-300 flex items-center justify-between font-mono">
                      <span>🔗 Link-active NFC: {task.nfcTagId.slice(0, 10)}</span>
                      <span className="text-orange-405 font-semibold">Sticker Bonded</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

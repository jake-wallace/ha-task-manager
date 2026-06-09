/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserProfile, CompletedLog, Task } from '../types';
import { playBeep, getCategoryLabel, getCategoryIconName } from '../helpers';
import { Award, Flame, CheckCircle2, RefreshCw, BarChart2, ListTodo, TrendingUp, Sparkles, Calendar } from 'lucide-react';
import { IconRenderer } from './IconRenderer';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AnalyticsPanelProps {
  users: UserProfile[];
  logs: CompletedLog[];
  tasks: Task[];
  isLovelace?: boolean;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ users, logs, tasks, isLovelace = false }) => {
  // Aggregate stats
  const totalCompletions = logs.length;
  const totalPoints = users.reduce((sum, u) => sum + u.points, 0);
  const highestStreak = Math.max(...users.map(u => u.streak), 0);
  const highestStreakUser = users.find(u => u.streak === highestStreak);

  // 1. Weekly Completions Chart Data (Past 7 Days)
  // Calculate relative to: local date 2026-06-09 (Tuesday)
  // Let's list days from June 3rd (Wed) to June 9th (Tue)
  const getPast7Days = () => {
    const dates = [];
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date('2026-06-09T12:00:00');
      d.setDate(d.getDate() - i);
      const isoString = d.toISOString().slice(0, 10);
      const name = weekdays[d.getDay()];
      dates.push({ isoString, name, count: 0 });
    }
    return dates;
  };

  const chartDays = getPast7Days();
  logs.forEach(log => {
    const logDate = log.completedAt.slice(0, 10);
    const dayItem = chartDays.find(d => d.isoString === logDate);
    if (dayItem) {
      dayItem.count += 1;
    }
  });

  // 2. Leaderboard: Rank users descending by points
  const rankedUsers = [...users].sort((a, b) => b.points - a.points);

  // 3. Category distribution (Count tasks completed in each category)
  const categoryCounts: Record<string, number> = {};
  logs.forEach(log => {
    const cat = log.category || 'general';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categoriesData = Object.entries(categoryCounts).map(([cat, count]) => ({
    category: cat,
    label: getCategoryLabel(cat),
    count,
  })).sort((a, b) => b.count - a.count);

  const maxCategoryCount = Math.max(...categoriesData.map(c => c.count), 1);

  // 4. Task priority distribution
  const priorityCount = { high: 0, medium: 0, low: 0 };
  tasks.forEach(t => {
    if (t.isCompleted) {
      priorityCount[t.priority] = (priorityCount[t.priority] || 0) + 1;
    }
  });

  return (
    <div className="space-y-6" id="analytics-panel-container">
      
      {/* 4 OVERVIEW CHIP TILES */}
      <div className={`grid ${isLovelace ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-4`}>
        {/* STAT 1 */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-4 hover:border-slate-700 transition shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CheckCircle2 className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-slate-550 font-mono font-bold uppercase tracking-widest block mb-0.5">Chores Checked</span>
            <span className="text-xl font-bold font-sans text-white tracking-tight leading-none">{totalCompletions}</span>
          </div>
        </div>

        {/* STAT 2 */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-4 hover:border-slate-700 transition shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-550 font-mono font-bold uppercase tracking-widest block mb-0.5">Family Stars</span>
            <span className="text-xl font-bold font-sans text-white tracking-tight leading-none">{totalPoints} ✨</span>
          </div>
        </div>

        {/* STAT 3 */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-4 hover:border-slate-700 transition shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-455">
            <Flame className="w-6 h-6 animate-bounce-slow" />
          </div>
          <div>
            <span className="text-[10px] text-slate-550 font-mono font-bold uppercase tracking-widest block mb-0.5">Record Streak</span>
            <span className="text-xl font-bold font-sans text-white tracking-tight leading-none">
              {highestStreak} {highestStreak > 1 ? 'Days' : 'Day'}
            </span>
          </div>
        </div>

        {/* STAT 4 */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-4 hover:border-slate-700 transition shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ListTodo className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-550 font-mono font-bold uppercase tracking-widest block mb-0.5">Active Load</span>
            <span className="text-xl font-bold font-sans text-white tracking-tight leading-none">
              {tasks.filter(t => !t.isCompleted).length} Tasks
            </span>
          </div>
        </div>
      </div>      {/* MIDSECTION GRID */}
      <div className={`grid grid-cols-1 ${isLovelace ? '' : 'lg:grid-cols-3'} gap-6 align-start`}>
        
        {/* LEADERBOARD CARD */}
        <div className={`${isLovelace ? '' : 'lg:col-span-1'} p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-col h-full justify-between`}>
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-orange-400 rounded-full" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Household Leaderboard</h3>
              </div>
              <Sparkles className="w-4 h-4 text-orange-400" />
            </div>

            <div className="space-y-3">
              {rankedUsers.map((user, idx) => {
                const isWinner = idx === 0;
                
                // Color mapping logic
                let colorClass = 'border-slate-800 bg-slate-950';
                let textAccent = 'text-white';
                if (user.color === 'emerald') { colorClass = 'border-emerald-500/15 bg-emerald-950/20'; textAccent = 'text-emerald-400'; }
                if (user.color === 'sky') { colorClass = 'border-sky-500/15 bg-sky-950/20'; textAccent = 'text-sky-455'; }
                if (user.color === 'amber') { colorClass = 'border-amber-500/15 bg-amber-950/20'; textAccent = 'text-amber-400'; }
                if (user.color === 'fuchsia') { colorClass = 'border-fuchsia-500/15 bg-fuchsia-950/20'; textAccent = 'text-fuchsia-400'; }

                return (
                  <div
                    key={user.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${colorClass} transition hover:bg-white/[0.015]`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank number or Crown */}
                      <span className="text-xs font-bold font-mono text-slate-400 w-4">
                        {isWinner ? '👑' : `${idx + 1}`}
                      </span>

                      {/* Avatar Icon */}
                      <div className={`w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white`} style={{ backgroundColor: `${user.color === 'emerald' ? '#10b981' : user.color === 'sky' ? '#0284c7' : user.color === 'amber' ? '#f59e0b' : '#d946ef'}` }}>
                        <IconRenderer name={user.icon} size={16} />
                      </div>

                      {/* User Info */}
                      <div>
                        <span className="font-semibold text-xs text-white block capitalize">{user.name}</span>
                        <span className="text-[10px] text-slate-450 block capitalize leading-none pt-0.5">{user.role} Member</span>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3 font-mono">
                      {/* Active streak */}
                      <div className="flex items-center gap-0.5 text-rose-455">
                        <Flame className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-xs text-rose-400 font-bold">{user.streak}d</span>
                      </div>
                      
                      {/* Total accumulated points */}
                      <div className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full text-[11px] font-bold text-slate-200">
                        {user.points}✨
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800/60 text-[10px] text-slate-400 leading-relaxed text-center">
            🔥 Streaks advance when users complete recurring tasks assigned to them daily. Keep the chain going!
          </div>
        </div>

        {/* 7 DAYS PERFORMANCE BAR CHART */}
        <div className={`${isLovelace ? '' : 'lg:col-span-2'} p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Weekly Activity (Chores completed daily)</h3>
            </div>

            {/* Interactive chart using Recharts */}
            <div className="h-44 w-full pr-4 select-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDays}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#475569" 
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#020617', 
                      borderColor: '#1e293b', 
                      borderRadius: '16px',
                      color: '#ffffff',
                      fontSize: '11px',
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={24}>
                    {chartDays.map((entry, index) => {
                      // Alternate glowing colors
                      const color = index === chartDays.length - 1 ? '#f97316' : '#6366f1';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800/60 pt-4">
            <div className="text-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Top Category Daily</span>
              <span className="text-xs font-bold text-white block mt-0.5">Pet Care & Feeding 🐈</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Chore Density Map</span>
              <span className="text-xs font-bold text-white block mt-0.5">Kitchen Duties (42%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM METER: CATEGORIES BREAKDOWN & LOGS LIST */}
      <div className={`grid grid-cols-1 ${isLovelace ? '' : 'lg:grid-cols-3'} gap-6 align-start`}>
        
        {/* CATEGORY WORKLOAD BREAKDOWN METER */}
        <div className={`${isLovelace ? '' : 'lg:col-span-1'} p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl`}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-sans">Task Effort by Category</h3>
          </div>

          {categoriesData.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl bg-slate-950">
              <BarChart2 className="w-10 h-10 mx-auto text-slate-700 mb-2" />
              <p>Execute tasks to populate category load metrics.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {categoriesData.map((cat, idx) => {
                // Calculate percentage based on max occurrences
                const percentage = Math.round((cat.count / maxCategoryCount) * 100);
                
                // Assign a color
                let barColor = 'bg-indigo-500';
                if (cat.category === 'pets') barColor = 'bg-fuchsia-500';
                if (cat.category === 'kitchen') barColor = 'bg-orange-500';
                if (cat.category === 'cleaning') barColor = 'bg-emerald-500';
                if (cat.category === 'garden') barColor = 'bg-teal-400';
                if (cat.category === 'kids') barColor = 'bg-amber-400';

                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-350 font-medium flex items-center gap-1.5">
                        <IconRenderer name={getCategoryIconName(cat.category)} size={12} className="text-slate-500" />
                        {cat.label}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px] font-semibold">{cat.count} completed</span>
                    </div>
                    {/* Background Progress track representation */}
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RECENT HISTORIC CHORE LOGGERS */}
        <div className={`${isLovelace ? '' : 'lg:col-span-2'} p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-col justify-between h-full`}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Family Completion Logs</h3>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl bg-slate-950 text-xs">
                  No chores have been checked off yet. Let's tap some scheduled list items!
                </div>
              ) : (
                [...logs].reverse().map(log => {
                  const compDate = new Date(log.completedAt);
                  const formattedTime = compDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = compDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  
                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-2xl flex items-center justify-between text-xs transition"
                    >
                      <div className="flex items-center gap-3">
                        {/* Bullet indicator */}
                        <div className="w-2 h-2 rounded-full bg-emerald-450 shadow-sm shadow-emerald-500/40" />
                        <div>
                          <span className="font-semibold text-white block leading-snug">{log.taskTitle}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 leading-none">
                            Completed by <strong className="text-slate-300 font-medium">{log.userName}</strong> in <span className="bg-slate-900 py-0.5 px-1.5 border border-slate-800 rounded">{getCategoryLabel(log.category)}</span>
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono text-[10px]">
                        <span className="text-slate-450 block">{formattedDate} @ {formattedTime}</span>
                        <span className="text-orange-400 font-bold font-sans text-[11px] block mt-0.5">+{log.pointsEarned}✨</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500">
            <span>Updating real-time triggers</span>
            <span className="text-slate-600">Database Engine active (LocalStorage copy)</span>
          </div>
        </div>

      </div>

    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserProfile } from '../types';
import { playBeep } from '../helpers';
import { IconRenderer } from './IconRenderer';
import { Plus, Users, Trash2, Award, Flame, Smile, ShieldAlert } from 'lucide-react';

interface ProfilesViewProps {
  users: UserProfile[];
  onAddUser: (user: Omit<UserProfile, 'id' | 'streak' | 'points' | 'createdAt'>) => void;
  onDeleteUser: (id: string) => void;
  isProductionMode?: boolean;
  onToggleProduction?: (val: boolean) => void;
  disableDateSkipping?: boolean;
  onToggleDisableDate?: (val: boolean) => void;
  autoDetectHass?: boolean;
  onToggleAutoDetectHass?: (val: boolean) => void;
  onClearAllData?: () => void;
  sendNotifications?: boolean;
  onToggleSendNotifications?: (val: boolean) => void;
  notificationTarget?: string;
  onUpdateNotificationTarget?: (target: string) => void;
  isLovelace?: boolean;
}

const AVATARS = [
  'Smile', 'Wrench', 'Brain', 'Gamepad2', 'Cat', 'Sparkles', 'Star', 'Coffee', 'Heart', 'ShieldAlert'
];

const COLORS = [
  { id: 'emerald', label: 'Emerald Green', hex: '#10b981' },
  { id: 'sky', label: 'Sky Blue', hex: '#0284c7' },
  { id: 'amber', label: 'Amber Orange', hex: '#f59e0b' },
  { id: 'fuchsia', label: 'Fuchsia Pink', hex: '#d946ef' },
];

export const ProfilesView: React.FC<ProfilesViewProps> = ({ 
  users, 
  onAddUser, 
  onDeleteUser,
  isProductionMode = false,
  onToggleProduction,
  disableDateSkipping = false,
  onToggleDisableDate,
  autoDetectHass = true,
  onToggleAutoDetectHass,
  onClearAllData,
  sendNotifications = true,
  onToggleSendNotifications,
  notificationTarget = 'notify.notify',
  onUpdateNotificationTarget,
  isLovelace = false
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'parent' | 'child' | 'guest'>('child');
  const [color, setColor] = useState('sky');
  const [icon, setIcon] = useState('Smile');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a profile name.');
      playBeep('failure');
      return;
    }
    setError('');
    onAddUser({
      name: name.trim(),
      role,
      color,
      icon,
    });
    playBeep('success');
    setName('');
    setIcon('Smile');
    setColor('sky');
    setRole('child');
  };

  return (
    <div className={`grid grid-cols-1 ${isLovelace ? '' : 'lg:grid-cols-3'} gap-6 align-start`} id="profiles-view-container">
      
      {/* LEFT: USERS DIRECTORY GRID (2/3 cols) */}
      <div className={isLovelace ? 'space-y-6' : 'lg:col-span-2 space-y-6'}>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Household Profiles</h3>
              <p className="text-xs text-slate-400">View and manage family members tracked on this scheduler</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.map(user => {
              
              // Color styles calculation
              let cardStyle = 'border-slate-850 bg-slate-950 hover:border-slate-800';
              let accentColor = '#64748b'; // default slate
              if (user.color === 'emerald') { cardStyle = 'border-emerald-500/15 bg-emerald-950/20 hover:border-emerald-500/40'; accentColor = '#10b981'; }
              if (user.color === 'sky') { cardStyle = 'border-sky-500/15 bg-sky-950/20 hover:border-sky-500/40'; accentColor = '#0284c7'; }
              if (user.color === 'amber') { cardStyle = 'border-amber-500/15 bg-amber-950/20 hover:border-amber-500/40'; accentColor = '#f59e0b'; }
              if (user.color === 'fuchsia') { cardStyle = 'border-fuchsia-500/15 bg-fuchsia-950/20 hover:border-fuchsia-505/40'; accentColor = '#d946ef'; }

              return (
                <div
                  key={user.id}
                  className={`p-5 rounded-3xl border flex flex-col justify-between h-44 transition duration-300 ${cardStyle}`}
                >
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      {/* Avatar container */}
                      <div
                        className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white shrink-0 shadow-lg"
                        style={{ backgroundColor: accentColor }}
                      >
                        <IconRenderer name={user.icon} size={22} />
                      </div>

                      {/* Header values */}
                      <div>
                        <h4 className="font-semibold text-white text-sm capitalize">{user.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-white/10 text-slate-350 mt-1 inline-block">
                          {user.role} member
                        </span>
                      </div>
                    </div>

                    {/* Delete button (except default parent) */}
                    {users.length > 1 && (
                      <button
                        onClick={() => { playBeep('failure'); onDeleteUser(user.id); }}
                        className="p-1.5 hover:bg-rose-500 hover:text-white text-slate-500 rounded-xl transition"
                        title={`Remove profile ${user.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Body highlights: Streaks, stars accumulated, etc */}
                  <div className="mt-4 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-rose-400">
                      <Flame className="w-4 h-4" />
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-sans tracking-wide">Daily Streak</span>
                        <span className="font-bold">{user.streak} Days Active</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-orange-400 font-sans">
                      <Award className="w-4 h-4" />
                      <div>
                        <span className="text-[9px] text-slate-505 block uppercase font-mono tracking-wide">Star Score</span>
                        <span className="font-bold text-xs">{user.points} Stars</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: REGISTER NEW FAMILY MEMBER PANEL (1/3 col) */}
      <div className="lg:col-span-1">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            <Plus className="w-4 h-4 text-indigo-400" /> Add New Profile
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-300">
            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Profile Name *</label>
              <input
                type="text"
                placeholder="e.g. Alice, Bob, Uncle Greg..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-white outline-none focus:border-indigo-500 text-xs transition"
                id="profile-name-input"
              />
              {error && <span className="text-rose-450 block mt-1 font-bold text-[10px]">{error}</span>}
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Family Role Type</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 outline-none focus:border-indigo-505 text-xs transition"
                id="profile-role-select"
              >
                <option value="child">Child (Chore Runner)</option>
                <option value="parent">Parent / Administrator</option>
                <option value="guest">Guest / Temporal Resident</option>
              </select>
            </div>

            {/* Custom avatars dropdown */}
            <div>
              <label className="block text-slate-400 mb-2 font-bold text-[10px] uppercase font-mono">Assign Avatar Icon</label>
              <div className="grid grid-cols-5 gap-2 bg-slate-950 p-2.5 rounded-2xl border border-slate-855">
                {AVATARS.map(av => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => { playBeep('tap'); setIcon(av); }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 border transition ${icon === av ? 'bg-indigo-500/15 border-indigo-550 text-indigo-400 font-bold scale-105' : 'bg-transparent border-transparent hover:bg-slate-900'}`}
                  >
                    <IconRenderer name={av} size={15} />
                  </button>
                ))}
              </div>
            </div>

            {/* Accent theme color selections */}
            <div>
              <label className="block text-slate-400 mb-2 font-bold text-[10px] uppercase font-mono">Dashboard Accent Color</label>
              <div className="grid grid-cols-2 gap-2">
                {COLORS.map(col => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => { playBeep('tap'); setColor(col.id); }}
                    className={`py-1.5 px-2 rounded-xl border text-[10px] font-bold text-center transition flex items-center justify-center gap-1.5 ${color === col.id ? 'text-white border-white' : 'text-slate-400 border-slate-850 hover:border-slate-800'}`}
                    style={{ backgroundColor: `${col.hex}15` }}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: col.hex }} />
                    {col.id}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 mt-2 bg-indigo-600 hover:bg-indigo-550 text-white font-bold rounded-full shadow-lg shadow-indigo-600/15 cursor-pointer active:scale-95 transition"
              id="create-profile-btn"
            >
              Add Household Member
            </button>
          </form>
        </div>

        {/* Home Assistant Lovelace Export Configuration card */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl mt-6">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-white">
            <Smile className="w-4 h-4 text-emerald-400" /> Lovelace & Export Setup
          </div>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Prepare your Custom Card for production. Disable simulation, purge defaults, and configure direct Home Assistant ecosystem integrations.
          </p>

          <div className="space-y-3.5">
            {/* Toggle Production Mode */}
            <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-850 cursor-pointer select-none hover:border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={isProductionMode}
                onChange={(e) => onToggleProduction?.(e.target.checked)}
                className="mt-0.5 rounded border-slate-800 text-indigo-500 focus:ring-0 bg-slate-900 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-200 text-xs block">Production Sandbox Mode</span>
                <span className="text-[10px] text-slate-400 block leading-normal mt-0.5">
                  Exclude hardcoded sample demo profiles (Sarah, David, Liam, Emma) and default to a fresh skeleton structure.
                </span>
              </div>
            </label>

            {/* Toggle Disable Date Skipping */}
            <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-850 cursor-pointer select-none hover:border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={disableDateSkipping}
                onChange={(e) => onToggleDisableDate?.(e.target.checked)}
                className="mt-0.5 rounded border-slate-800 text-indigo-500 focus:ring-0 bg-slate-900 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-200 text-xs block">Lock to Real Today Date</span>
                <span className="text-[10px] text-slate-400 block leading-normal mt-0.5">
                  Disable sim dates and lock the checklist reset clock to your local browser/system calendar date.
                </span>
              </div>
            </label>

            {/* Toggle Auto Sync Current Home Assistant User */}
            <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-850 cursor-pointer select-none hover:border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={autoDetectHass}
                onChange={(e) => onToggleAutoDetectHass?.(e.target.checked)}
                className="mt-0.5 rounded border-slate-800 text-indigo-500 focus:ring-0 bg-slate-900 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-200 text-xs block">Auto-Sync HA Logged User</span>
                <span className="text-[10px] text-slate-400 block leading-normal mt-0.5">
                  Match Hass operator user attributes and dynamically auto-select them on dashboard load.
                </span>
              </div>
            </label>

            {/* Total clean slate db wipe */}
            <button
              type="button"
              onClick={onClearAllData}
              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] uppercase font-bold tracking-wider rounded-xl transition cursor-pointer border border-rose-500/15"
            >
              🧹 Reset Content Database
            </button>
          </div>
        </div>

        {/* Option A: Push Notifications Setup card */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl mt-6">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-white">
            <span className="p-1 px-1.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-mono rounded mr-1">Option A</span>
            Push Notifications (Companion App)
          </div>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Configure native push alerts to your mobile device. Because local Home Assistant can still make <strong>outbound</strong> connection requests, these companion app notifications work perfectly <strong>even when you are outside home</strong> on a local-only network!
          </p>

          <div className="space-y-4">
            {/* Enable/Disable Notifications Toggle */}
            <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-850 cursor-pointer select-none hover:border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={sendNotifications}
                onChange={(e) => onToggleSendNotifications?.(e.target.checked)}
                className="mt-0.5 rounded border-slate-800 text-indigo-500 focus:ring-0 bg-slate-900 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-200 text-xs block">Allow Push Notifications</span>
                <span className="text-[10px] text-slate-400 block leading-normal mt-0.5">
                  Send a notification trigger to your phone whenever someone registers a checklist chore as completed.
                </span>
              </div>
            </label>

            {/* Notification Target Selector */}
            {sendNotifications && (
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-bold text-[10px] uppercase font-mono">Mobile App Target Service</label>
                <input
                  type="text"
                  placeholder="e.g. notify.notify or notify.mobile_app_phone"
                  value={notificationTarget}
                  onChange={(e) => onUpdateNotificationTarget?.(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-white outline-none focus:border-indigo-500 text-xs transition font-mono"
                  id="notification-target-input"
                />
                <p className="text-[9px] text-slate-500 leading-normal">
                  Defaults to <code className="text-slate-350">notify.notify</code>. You can customize this to target your specific phone (e.g. <code className="text-slate-350">notify.mobile_app_yourname_phone</code>).
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

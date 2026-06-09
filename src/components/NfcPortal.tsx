/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { NfcTag, Task } from '../types';
import { playBeep } from '../helpers';
import { Tag, Sparkles, Check, Play, Info, AlertTriangle, AlertCircle, ArrowUpRight, Zap, RefreshCw, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NfcPortalProps {
  nfcTags: NfcTag[];
  tasks: Task[];
  onScanTag: (tagId: string) => { success: boolean; taskTitle?: string; message: string };
  onCreateTag: (label: string, location: string, associatedTaskId?: string) => void;
  onLinkTagToTask: (tagId: string, taskId: string) => void;
  onDeleteTag: (tagId: string) => void;
  isLovelace?: boolean;
}

export const NfcPortal: React.FC<NfcPortalProps> = ({
  nfcTags,
  tasks,
  onScanTag,
  onCreateTag,
  onLinkTagToTask,
  onDeleteTag,
  isLovelace = false,
}) => {
  // Web NFC State
  const [isWebNfcSupported, setIsWebNfcSupported] = useState(false);
  const [isScanningWebNfc, setIsScanningWebNfc] = useState(false);
  const [webNfcStatus, setWebNfcStatus] = useState<string>('Ready to initialize');
  const [webNfcError, setWebNfcError] = useState<string | null>(null);

  // Simulation State
  const [selectedSimTagId, setSelectedSimTagId] = useState<string>('');
  const [isSimulatingScan, setIsSimulatingScan] = useState(false);
  const [simScanResult, setSimScanResult] = useState<{ success: boolean; message: string } | null>(null);

  // Creation State
  const [label, setLabel] = useState('');
  const [location, setLocation] = useState('');
  const [associatedTaskId, setAssociatedTaskId] = useState('');
  
  // Quick Link State
  const [linkTagId, setLinkTagId] = useState('');
  const [linkTaskId, setLinkTaskId] = useState('');

  // Detect Web NFC support on mount
  useEffect(() => {
    if ('NDEFReader' in window) {
      setIsWebNfcSupported(true);
      setWebNfcStatus('Available. Tap "Start Reader" to bind physical NFC stickers!');
    } else {
      setIsWebNfcSupported(false);
      setWebNfcStatus('Web NFC is restricted on this browser (Requires Chrome on Android).');
    }
  }, []);

  // Web NFC implementation
  const handleStartWebNfcScan = async () => {
    if (!('NDEFReader' in window)) return;
    
    playBeep('tap');
    setIsScanningWebNfc(true);
    setWebNfcError(null);
    setWebNfcStatus('Web NFC Reader starting...');
    
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      setWebNfcStatus('🤖 Physical scan active! Hold an NFC chip/tag near back of phone...');
      
      ndef.onreading = (event: any) => {
        const { serialNumber, message } = event;
        playBeep('radar');
        
        let scannedTaskId: string | null = null;
        
        // Read text records from the physical NDEF chip
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding);
            const text = textDecoder.decode(record.data);
            try {
              const parsed = JSON.parse(text);
              if (parsed && parsed.taskId) {
                scannedTaskId = parsed.taskId;
              }
            } catch {
              // Not JSON, check if it's raw taskId
              scannedTaskId = text.trim();
            }
          }
        }

        if (scannedTaskId) {
          // Find if there is a tag matching this Serial or Task
          const matchedTag = nfcTags.find(t => t.id === serialNumber || t.associatedTaskId === scannedTaskId);
          const tagIdentifier = matchedTag ? matchedTag.id : serialNumber;
          
          const result = onScanTag(tagIdentifier);
          playBeep('success');
          setWebNfcStatus(`🎉 Scanned Tag: "${matchedTag?.label || serialNumber}"! task checklist completed!`);
          
          setTimeout(() => {
            setWebNfcStatus('🤖 Physical scan active! Point tag near back of phone...');
          }, 4000);
        } else {
          // Unrecognized tag payload. Let's register it to selected task!
          setWebNfcStatus(`💡 Blank chip found (id: ${serialNumber}). Bind it below!`);
        }
      };

      ndef.onreadingerror = () => {
        playBeep('failure');
        setWebNfcError('Could not decode scanned NFC tag. Try again.');
      };

    } catch (error: any) {
      console.error(error);
      setIsScanningWebNfc(false);
      setWebNfcError(error.message || 'Permission denied or NFC disabled.');
      setWebNfcStatus('Reader stopped due to error.');
    }
  };

  const handleStopWebNfcScan = () => {
    playBeep('tap');
    setIsScanningWebNfc(false);
    setWebNfcError(null);
    setWebNfcStatus('Scanner paused.');
  };

  // Mock physical tag write
  const handleWritePhysicalTag = async (taskId: string) => {
    if (!('NDEFReader' in window)) return;
    playBeep('tap');
    try {
      setWebNfcStatus('✍️ Writing task data to physical NFC card. Hold tag on device...');
      const ndef = new (window as any).NDEFReader();
      await ndef.write(JSON.stringify({ taskId }));
      playBeep('success');
      setWebNfcStatus('✅ Chip programmed successfully! Tapping this will now complete the task.');
    } catch (err: any) {
      setWebNfcError(`Write FAILED: ${err.message || err}`);
      playBeep('failure');
    }
  };

  // Simulated NFC triggers
  const handleSimulatedScan = () => {
    if (!selectedSimTagId) return;
    
    playBeep('radar');
    setIsSimulatingScan(true);
    setSimScanResult(null);

    // Short scan delay for suspense/realism
    setTimeout(() => {
      const outcome = onScanTag(selectedSimTagId);
      
      if (outcome.success) {
        playBeep('success');
        setSimScanResult({
          success: true,
          message: outcome.message
        });
      } else {
        playBeep('failure');
        setSimScanResult({
          success: false,
          message: outcome.message
        });
      }
      setIsSimulatingScan(false);
    }, 1200);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !location.trim()) {
      playBeep('failure');
      return;
    }
    onCreateTag(label.trim(), location.trim(), associatedTaskId || undefined);
    playBeep('success');
    setLabel('');
    setLocation('');
    setAssociatedTaskId('');
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTagId || !linkTaskId) {
      playBeep('failure');
      return;
    }
    onLinkTagToTask(linkTagId, linkTaskId);
    playBeep('success');
    setLinkTagId('');
    setLinkTaskId('');
  };

  // Find remaining tasks that don't have tags linked for easy mapping
  const untaggedTasks = tasks.filter(t => !t.nfcTagId);

  return (
    <div className={`grid grid-cols-1 ${isLovelace ? '' : 'lg:grid-cols-3'} gap-6 align-start`} id="nfc-portal-container">
      {/* 1. NFC PHYSICAL WRITER / SCANNER CORE */}
      <div className={isLovelace ? 'space-y-6' : 'lg:col-span-2 space-y-6'}>
        
        {/* PHYSICAL WEB NFC BOX */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-indigo-505 pointer-events-none">
            <Zap className="w-48 h-48" />
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isWebNfcSupported ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Web NFC Physical Integration</h3>
                <p className="text-xs text-slate-450">Interact with real NFC tags around your house</p>
              </div>
            </div>

            <span className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wider ${isWebNfcSupported ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {isWebNfcSupported ? 'HARDWARE ACTIVE' : 'SIMULATION MODE'}
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              Home Assistant dashboards become incredibly fun when backed by real physical buttons or tags. Paste NFC stickers on cat plates, trash cans, or garage walls. Tapping triggers your phone to automatically tick off task list items!
            </p>

            <div className={`p-4 rounded-2xl border flex items-start gap-3 ${isWebNfcSupported ? 'bg-indigo-650/5 border-indigo-500/20' : 'bg-slate-950 border-slate-850'}`}>
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-200 block">Hardware Reader Status:</span>
                <span className="text-slate-400 leading-relaxed font-mono text-[11px] mt-1 block">{webNfcStatus}</span>
                {webNfcError && (
                  <span className="text-rose-400 block font-mono mt-1 font-bold text-[10px]">⚠️ Error: {webNfcError}</span>
                )}
              </div>
            </div>

            {isWebNfcSupported && (
              <div className="flex gap-3 pt-2">
                {!isScanningWebNfc ? (
                  <button
                    onClick={handleStartWebNfcScan}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-bold rounded-full flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 transition cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-4.5 h-4.5 animate-spin-slow" /> Start NFC Chip Scanners
                  </button>
                ) : (
                  <button
                    onClick={handleStopWebNfcScan}
                    className="flex-1 py-2.5 bg-ha-red hover:bg-ha-red/80 text-white text-xs font-bold rounded-full flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    Pause Physical Scanner
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MOCK VIRTUAL SCANNER WIDGET */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden shadow-xl" id="nfc-scanner-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Tag className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-sans">Virtual NFC Tap Simulator</h3>
              <p className="text-xs text-slate-450">Test physical check-offs in any web browser</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Tag selector */}
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wide text-[10px] uppercase font-mono mb-1.5Packed">Select physical tag to simulate:</label>
                <select
                  value={selectedSimTagId}
                  onChange={(e) => { playBeep('tap'); setSelectedSimTagId(e.target.value); setSimScanResult(null); }}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 outline-none focus:border-indigo-500 text-xs transition"
                  id="select-sim-tag"
                >
                  <option value="">-- Choose Virtual Tag --</option>
                  {nfcTags.map(tag => {
                    const task = tasks.find(t => t.id === tag.associatedTaskId);
                    return (
                      <option key={tag.id} value={tag.id}>
                        🏷️ {tag.label} (At: {tag.location}) {task ? `➟ [${task.title}]` : '➟ [No Task Linked]'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="button"
                disabled={!selectedSimTagId || isSimulatingScan}
                onClick={handleSimulatedScan}
                className={`w-full py-2.5 rounded-full font-bold flex items-center justify-center gap-2 text-xs transition active:scale-[0.98] cursor-pointer shadow-lg ${selectedSimTagId ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed shadow-none'}`}
                id="tap-tag-btn"
              >
                {isSimulatingScan ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Scanning Tag...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 animate-bounce-slow" /> Tap Simulated Tag
                  </>
                )}
              </button>

              <AnimatePresence>
                {simScanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${simScanResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}
                  >
                    {simScanResult.success ? (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-450 shrink-0 mt-0.5" />
                    )}
                    <div className="leading-tight">
                      <span className="font-bold text-[10px] uppercase font-mono block tracking-wider">{simScanResult.success ? 'CHECK-OFF SUCCESSFUL' : 'TRIGGER ERROR'}</span>
                      <span className="text-[11px] mt-0.5 block opacity-90">{simScanResult.message}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tap Sensor Visualizer */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-2xl border border-slate-850 h-48 relative overflow-hidden">
              <div className={`absolute inset-0 bg-orange-500/5 transition-opacity duration-300 ${isSimulatingScan ? 'opacity-100' : 'opacity-0'}`} />
              
              <div className={`w-20 h-20 rounded-full border flex items-center justify-center transition-all duration-300 ${isSimulatingScan ? 'border-orange-505 bg-orange-500/15 scale-110' : 'border-slate-800 bg-slate-900'}`}>
                <Tag className={`w-8 h-8 transition-all duration-300 ${isSimulatingScan ? 'text-orange-500 rotate-12 scale-110 animate-pulse' : 'text-slate-500'}`} />
              </div>

              <div className="mt-4 text-center">
                <span className="text-[11px] font-mono tracking-widest text-slate-405 uppercase font-bold block">
                  {isSimulatingScan ? '📡 READING NDEF...' : '📟 TAP SENSOR READY'}
                </span>
                <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">
                  {selectedSimTagId ? 'Target tag selected' : 'Waiting for tag choice'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* REGISTERED TAGS DIRECTORY */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Household Tag Directory ({nfcTags.length})</h3>
          
          {nfcTags.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl bg-slate-950">
              <Tag className="w-10 h-10 mx-auto text-slate-700 mb-2.5" />
              <p className="text-xs">No registered tags in this Home setup. Use the registration panel to create one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nfcTags.map(tag => {
                const linkedTask = tasks.find(t => t.id === tag.associatedTaskId);
                return (
                  <div key={tag.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-850 flex items-start justify-between gap-3 hover:border-slate-800 transition">
                    <div className="space-y-1.5 text-xs select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 scale-95 font-semibold text-[9px] rounded uppercase font-mono">
                          {tag.id.slice(0, 8)}
                        </span>
                        <h4 className="font-semibold text-white text-xs">{tag.label}</h4>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-tight flex items-center gap-1">📍 {tag.location}</p>
                      
                      <div className="pt-1.5">
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Linked Task: {linkedTask ? (
                            <span className="text-indigo-455 hover:underline">{linkedTask.title}</span>
                          ) : (
                            <span className="text-orange-400 font-semibold flex items-center gap-1 mt-0.5">⚠️ Unlinked tag</span>
                          )}
                        </span>
                      </div>

                      <div className="pt-1 flex gap-4 text-[9px] text-slate-500 font-mono">
                        <span>Scans: {tag.scannedCount}</span>
                        {tag.lastScannedAt && (
                          <span>Last: {new Date(tag.lastScannedAt).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => { playBeep('failure'); onDeleteTag(tag.id); }}
                      className="p-1 px-2.5 bg-rose-500/10 border border-rose-500/20 rounded-full hover:bg-rose-500 text-rose-400 hover:text-white transition text-[10px]"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. RIGHT BAR: CREATE TAG / MAP ACTIONS */}
      <div className="space-y-6">
        
        {/* CREATE REGISTER A BRAND NEW TAG */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            <Plus className="w-4 h-4 text-indigo-400" /> Register Physical Tag
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Tag Label *</label>
              <input
                type="text"
                placeholder="e.g., Cat Bowl, Trash Can Lid"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-white outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Physical Location *</label>
              <input
                type="text"
                placeholder="e.g., Kitchen under cupboard"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-white outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono font-bold tracking-wide">Associate immediately with task (Optional)</label>
              <select
                value={associatedTaskId}
                onChange={(e) => setAssociatedTaskId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 outline-none focus:border-indigo-500 text-xs transition"
              >
                <option value="">-- Do Not Link Yet --</option>
                {untaggedTasks.map(task => (
                  <option key={task.id} value={task.id}>
                    📋 {task.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white font-bold rounded-full shadow shadow-indigo-600/15 cursor-pointer active:scale-95 transition text-xs"
            >
              Add Virtual Tag
            </button>
          </form>
        </div>

        {/* LINK / RE-LINK EXISTING TAGS */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            <ArrowUpRight className="w-4 h-4 text-orange-400 font-bold" /> Remap Tag to Task
          </div>

          <form onSubmit={handleLinkSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Select Tag</label>
              <select
                value={linkTagId}
                onChange={(e) => setLinkTagId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 outline-none focus:border-indigo-500 transition"
              >
                <option value="">-- Choose Tag --</option>
                {nfcTags.map(tag => (
                  <option key={tag.id} value={tag.id}>
                    🏷️ {tag.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-bold text-[10px] uppercase font-mono">Target Task Checklist</label>
              <select
                value={linkTaskId}
                onChange={(e) => setLinkTaskId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 outline-none focus:border-indigo-500 transition"
              >
                <option value="">-- Choose Task --</option>
                {tasks.map(task => (
                  <option key={task.id} value={task.id}>
                    📋 {task.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!linkTagId || !linkTaskId}
              className={`w-full py-2.5 font-bold rounded-full transition text-xs ${linkTagId && linkTaskId ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer active:scale-95 shadow shadow-orange-550/15' : 'bg-slate-850 text-slate-500 border border-slate-800/60 cursor-not-allowed'}`}
            >
              Link & Bind Tag
            </button>
          </form>
        </div>

        {/* HOME ASSISTANT YAML ASSISTANT */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl text-xs text-slate-300 leading-relaxed font-mono">
          <div className="flex items-center gap-1.5 text-slate-100 font-sans font-bold text-[10px] uppercase tracking-widest mb-2.5">
            <Info className="w-4 h-4 text-indigo-400" /> Lovelace card YAML
          </div>
          <p className="text-[11px] text-slate-400 mb-3 font-sans">
            Paste this YAML in your physical Home Assistant Lovelace deck to link scanned NFC values:
          </p>
          <pre className="p-3.5 bg-slate-950 rounded-2xl border border-slate-850 text-[10px] overflow-x-auto text-orange-400">
{`alias: Scan Tag Chores
trigger:
  - platform: tag
    tag_id: ${selectedSimTagId || "f4-e7-2b-8a"}
action:
  - service: app.complete_task
    data:
      user: "Sarah (Mom)"`}
          </pre>
        </div>

      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  ClinicScheduleConfig,
  ServiceDurationConfigItem,
  AvailabilityGenerationSummary,
} from '../types';
import {
  getClinicScheduleConfig,
  saveClinicScheduleConfig,
  CONFIGURABLE_SERVICES,
  DEFAULT_CLINIC_SCHEDULE_CONFIG,
} from '../services/scheduleConfigService';
import { generateMissingAvailability } from '../services/availabilityGeneratorService';
import { getHoustonCurrentDateTime } from '../utils/clinicTime';
import {
  Clock,
  Calendar,
  Sparkles,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  Layers,
  ArrowRight,
  Info,
  RotateCcw,
  CalendarCheck,
  AlertTriangle,
  Globe,
  Sliders,
} from 'lucide-react';

interface AdminScheduleSettingsProps {
  adminEmail?: string;
  onAvailabilityGenerated?: (summary: AvailabilityGenerationSummary) => void;
  onScheduleUpdated?: () => void;
}

const DAY_NAMES = [
  { name: 'Monday', short: 'Mon' },
  { name: 'Tuesday', short: 'Tue' },
  { name: 'Wednesday', short: 'Wed' },
  { name: 'Thursday', short: 'Thu' },
  { name: 'Friday', short: 'Fri' },
  { name: 'Saturday', short: 'Sat' },
  { name: 'Sunday', short: 'Sun' },
];

export const AdminScheduleSettings: React.FC<AdminScheduleSettingsProps> = ({
  adminEmail,
  onAvailabilityGenerated,
  onScheduleUpdated,
}) => {
  const [config, setConfig] = useState<ClinicScheduleConfig>(DEFAULT_CLINIC_SCHEDULE_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [generationSummary, setGenerationSummary] = useState<AvailabilityGenerationSummary | null>(null);

  // Form states
  const [weekdayOpen, setWeekdayOpen] = useState('08:00 AM');
  const [weekdayClose, setWeekdayClose] = useState('07:00 PM');
  const [saturdayOpen, setSaturdayOpen] = useState('08:00 AM');
  const [saturdayClose, setSaturdayClose] = useState('05:00 PM');
  const [sundayOpen, setSundayOpen] = useState(false);
  const [sundayOpenTime, setSundayOpenTime] = useState('09:00 AM');
  const [sundayCloseTime, setSundayCloseTime] = useState('02:00 PM');
  const [workingDays, setWorkingDays] = useState<string[]>([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [slotInterval, setSlotInterval] = useState(30);
  const [windowDays, setWindowDays] = useState(30);
  const [urgentSlotsPerDay, setUrgentSlotsPerDay] = useState(2);
  const [urgentTimesStr, setUrgentTimesStr] = useState('08:00 AM, 01:30 PM');
  const [durations, setDurations] = useState<Record<string, number>>({});

  const houstonTime = getHoustonCurrentDateTime();

  const populateFormWithConfig = (data: ClinicScheduleConfig) => {
    setConfig(data);
    setWeekdayOpen(data.weekdayOpen || '08:00 AM');
    setWeekdayClose(data.weekdayClose || '07:00 PM');
    setSaturdayOpen(data.saturdayOpen || '08:00 AM');
    setSaturdayClose(data.saturdayClose || '05:00 PM');
    setSundayOpen(!!data.sundayOpen);
    setSundayOpenTime(data.sundayOpenTime || data.sundayOpeningTime || '09:00 AM');
    setSundayCloseTime(data.sundayCloseTime || data.sundayClosingTime || '02:00 PM');
    setWorkingDays(
      Array.isArray(data.workingDays) && data.workingDays.length > 0
        ? data.workingDays
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    );
    setTimezone(data.timezone || 'America/Chicago');
    setSlotInterval(data.slotIntervalMinutes || 30);
    setWindowDays(data.availabilityWindowDays || 30);
    setUrgentSlotsPerDay(data.urgentSlotsPerDay ?? 2);
    setUrgentTimesStr((data.urgentSlotTimes || ['08:00 AM', '01:30 PM']).join(', '));
    setDurations(data.serviceDurations || {});
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getClinicScheduleConfig();
        if (mounted) {
          populateFormWithConfig(data);
        }
      } catch (err) {
        console.error('Failed to load clinic schedule settings:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleDay = (dayName: string) => {
    setWorkingDays((prev) => {
      const exists = prev.includes(dayName);
      let updated: string[];
      if (exists) {
        updated = prev.filter((d) => d !== dayName);
      } else {
        updated = [...prev, dayName];
      }
      // If Sunday was toggled, keep sundayOpen in sync
      if (dayName === 'Sunday') {
        setSundayOpen(!exists);
      }
      return updated;
    });
  };

  const handleToggleSundayOpen = (enabled: boolean) => {
    setSundayOpen(enabled);
    setWorkingDays((prev) => {
      if (enabled && !prev.includes('Sunday')) {
        return [...prev, 'Sunday'];
      } else if (!enabled && prev.includes('Sunday')) {
        return prev.filter((d) => d !== 'Sunday');
      }
      return prev;
    });
  };

  const handleDurationChange = (serviceId: string, minutes: number) => {
    setDurations((prev) => ({
      ...prev,
      [serviceId]: minutes,
    }));
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all schedule settings and service durations to clinic defaults?')) {
      populateFormWithConfig(DEFAULT_CLINIC_SCHEDULE_CONFIG);
      setStatusMessage({
        type: 'info',
        text: 'Form values reset to clinic defaults. Click "Save Business Settings" to persist these changes to Firestore.',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    const urgentTimesArray = urgentTimesStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload: Partial<ClinicScheduleConfig> = {
      weekdayOpen,
      weekdayClose,
      saturdayOpen,
      saturdayClose,
      sundayOpen,
      sundayOpenTime,
      sundayCloseTime,
      sundayOpeningTime: sundayOpenTime,
      sundayClosingTime: sundayCloseTime,
      workingDays,
      timezone: 'America/Chicago',
      slotIntervalMinutes: Number(slotInterval) || 30,
      availabilityWindowDays: Number(windowDays) || 30,
      urgentSlotsPerDay: Number(urgentSlotsPerDay) || 2,
      urgentSlotTimes: urgentTimesArray,
      serviceDurations: durations,
    };

    const result = await saveClinicScheduleConfig(payload, adminEmail);
    setIsSaving(false);

    if (result.success) {
      setConfig(result.config);
      setStatusMessage({
        type: 'success',
        text: `Schedule settings saved successfully at ${new Date().toLocaleTimeString()}.`,
      });
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Could not save schedule settings.',
      });
    }
  };

  const handleRunGeneration = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const summary = await generateMissingAvailability({
        windowDays: Number(windowDays) || 30,
        adminEmail,
        force: true,
      });
      setGenerationSummary(summary);
      if (onAvailabilityGenerated) {
        onAvailabilityGenerated(summary);
      }
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
      setStatusMessage({
        type: 'success',
        text: `Availability successfully maintained through ${summary.maintainedThrough} (${summary.windowDays} days). Created ${summary.slotsCreated} slots; preserved ${summary.existingPreserved} existing records.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error generating missing availability.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="w-6 h-6 text-teal-600 animate-spin mr-3" />
        <span className="text-slate-600 font-medium">Loading clinic schedule configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                <Shield className="w-3.5 h-3.5 text-teal-600" />
                Clinic Operations
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                <Globe className="w-3 h-3 text-slate-400" />
                {timezone} (Houston CT)
              </span>
              <span className="text-xs text-slate-400">
                Current Time: <span className="font-semibold text-slate-600">{houstonTime.timeStr}</span>
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1 font-['Outfit']">
              Clinic Schedule & Service Configuration
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Control operating hours, working days, start-time intervals, emergency slot allocation, and procedure durations in real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Reset all fields to clinic defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleRunGeneration}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Syncing...' : 'Sync & Generate Slots'}
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 p-4 rounded-lg flex items-start gap-3 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            {statusMessage.type === 'info' && <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />}
            <span className="text-sm">{statusMessage.text}</span>
          </div>
        )}

        {generationSummary && (
          <div className="mt-4 p-4 rounded-lg bg-teal-50/70 border border-teal-200 text-teal-950 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-teal-700 font-medium">Horizon Window</div>
              <div className="text-base font-bold text-teal-900">{generationSummary.windowDays} Days</div>
            </div>
            <div>
              <div className="text-xs text-teal-700 font-medium">Maintained Through</div>
              <div className="text-base font-bold text-teal-900">{generationSummary.maintainedThrough}</div>
            </div>
            <div>
              <div className="text-xs text-teal-700 font-medium">New Slots Created</div>
              <div className="text-base font-bold text-emerald-700">+{generationSummary.slotsCreated}</div>
            </div>
            <div>
              <div className="text-xs text-teal-700 font-medium">Existing Preserved</div>
              <div className="text-base font-bold text-slate-800">{generationSummary.existingPreserved}</div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Working Days Selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-teal-600" />
              <div>
                <h3 className="font-semibold text-slate-900">Weekly Operating Days</h3>
                <p className="text-xs text-slate-500">
                  Select which days of the week the clinic accepts appointments. Disabled days will be marked closed.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              {workingDays.length} Active Days / Week
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {DAY_NAMES.map(({ name, short }) => {
              const isOpen = workingDays.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleToggleDay(name)}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-between gap-1.5 ${
                    isOpen
                      ? 'bg-teal-50/80 border-teal-300 text-teal-900 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-100'
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wider">{short}</span>
                  <span className="text-[11px] font-medium truncate">{name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isOpen ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isOpen ? 'Open' : 'Closed'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Operating Hours */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <Clock className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Clinic Operating Hours</h3>
              <p className="text-xs text-slate-500">
                Opening and closing times for each operating shift (format: HH:MM AM/PM).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Monday - Friday */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="font-medium text-slate-800 text-sm flex items-center justify-between">
                <span className="font-semibold">Monday – Friday</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  Weekdays
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Opening Time</label>
                  <input
                    type="text"
                    value={weekdayOpen}
                    onChange={(e) => setWeekdayOpen(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="08:00 AM"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Closing Time</label>
                  <input
                    type="text"
                    value={weekdayClose}
                    onChange={(e) => setWeekdayClose(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="07:00 PM"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Default clinic weekday shift: 8:00 AM to 7:00 PM</p>
            </div>

            {/* Saturday */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="font-medium text-slate-800 text-sm flex items-center justify-between">
                <span className="font-semibold">Saturday</span>
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${workingDays.includes('Saturday') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {workingDays.includes('Saturday') ? 'Open' : 'Closed'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Opening Time</label>
                  <input
                    type="text"
                    value={saturdayOpen}
                    onChange={(e) => setSaturdayOpen(e.target.value)}
                    disabled={!workingDays.includes('Saturday')}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="08:00 AM"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Closing Time</label>
                  <input
                    type="text"
                    value={saturdayClose}
                    onChange={(e) => setSaturdayClose(e.target.value)}
                    disabled={!workingDays.includes('Saturday')}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="05:00 PM"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Default clinic Saturday shift: 8:00 AM to 5:00 PM</p>
            </div>

            {/* Sunday */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="font-medium text-slate-800 text-sm flex items-center justify-between">
                <span className="font-semibold">Sunday</span>
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${sundayOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {sundayOpen ? 'Open' : 'Closed (Default)'}
                </span>
              </div>
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sundayOpen}
                    onChange={(e) => handleToggleSundayOpen(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span className="text-xs text-slate-700 font-semibold">Enable Sunday Clinic Hours</span>
                </label>
              </div>
              {sundayOpen ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 font-medium">Opening Time</label>
                    <input
                      type="text"
                      value={sundayOpenTime}
                      onChange={(e) => setSundayOpenTime(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      placeholder="09:00 AM"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 font-medium">Closing Time</label>
                    <input
                      type="text"
                      value={sundayCloseTime}
                      onChange={(e) => setSundayCloseTime(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      placeholder="02:00 PM"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 pt-1">
                  Clinic is closed on Sunday. AI Receptionist will inform callers and automatically suggest Monday or Saturday slots.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Scheduling Parameters & Urgent Care */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <Sliders className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Scheduling Parameters & Urgent Allocation</h3>
              <p className="text-xs text-slate-500">
                Configure appointment start-time intervals, future booking horizon, and emergency slot reserves.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Start-Time Interval
              </label>
              <select
                value={slotInterval}
                onChange={(e) => setSlotInterval(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value={15}>15 Minutes (Dense)</option>
                <option value={30}>30 Minutes (Standard Clinic)</option>
                <option value={60}>60 Minutes (Hourly)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Slots generated in {slotInterval}-minute increments.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Availability Window (Days)
              </label>
              <input
                type="number"
                min={7}
                max={90}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Maintains availability for {windowDays} calendar days into future.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Urgent Slots / Day
              </label>
              <input
                type="number"
                min={0}
                max={6}
                value={urgentSlotsPerDay}
                onChange={(e) => setUrgentSlotsPerDay(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Protected emergency slots per operating day.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Urgent Slot Times
              </label>
              <input
                type="text"
                value={urgentTimesStr}
                onChange={(e) => setUrgentTimesStr(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                placeholder="08:00 AM, 01:30 PM"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Comma-separated times reserved for emergencies.
              </p>
            </div>
          </div>
        </div>

        {/* Service -> Duration Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" />
              <div>
                <h3 className="font-semibold text-slate-900">Service Durations & Overlap Rules</h3>
                <p className="text-xs text-slate-500">
                  Appointments reserve contiguous blocks based on service length. Contiguous slot validation prevents double-bookings.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CONFIGURABLE_SERVICES.map((srv) => {
              const currentMinutes = durations[srv.id] || durations[srv.name] || srv.durationMinutes;
              return (
                <div
                  key={srv.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-teal-300 transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 text-sm">{srv.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                        {srv.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{srv.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-700 font-medium">Required Chair Duration:</span>
                    <select
                      value={currentMinutes}
                      onChange={(e) => handleDurationChange(srv.id, Number(e.target.value))}
                      className="px-3 py-1 text-sm font-semibold text-teal-900 bg-white border border-teal-300 rounded-lg shadow-2xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes (1 hr)</option>
                      <option value={75}>75 minutes</option>
                      <option value={90}>90 minutes (1.5 hr)</option>
                      <option value={120}>120 minutes (2 hr)</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Updates are persisted to Firestore (<code className="font-mono text-[11px]">settings/scheduling</code>) and take effect immediately.</span>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? 'Saving Settings...' : 'Save Business Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

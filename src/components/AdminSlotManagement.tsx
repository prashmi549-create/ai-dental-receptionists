import React, { useState, useMemo } from 'react';
import {
  DemoAppointmentSlot,
  AdminAppointment,
  SlotType,
  SlotStatus,
  AvailabilityGenerationSummary,
} from '../types';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  parseTimeToMinutes,
} from '../utils/clinicTime';
import {
  getClinicDayInfo,
  validateSlotParameters,
  adminCreateSlot,
  adminEditSlot,
  adminDisableSlot,
  adminEnableSlot,
  STANDARD_WEEKDAY_TIME_SLOTS,
  STANDARD_SATURDAY_TIME_SLOTS,
} from '../services/adminSlotsService';
import { normalizeSlotTime } from '../services/demoSlotsService';
import { formatPhoneNumber } from '../services/adminAppointmentsService';
import { computeEndTime } from '../services/scheduleConfigService';
import { generateMissingAvailability } from '../services/availabilityGeneratorService';
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Ban,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  FileText,
  Lock,
  ArrowRight,
  Sparkles,
  RefreshCw,
  X,
  Settings,
  Layers,
} from 'lucide-react';

export type SlotFilterType =
  | 'all'
  | 'available'
  | 'booked'
  | 'urgent'
  | 'normal'
  | 'disabled'
  | 'expired';

interface AdminSlotManagementProps {
  slots: DemoAppointmentSlot[];
  appointments: AdminAppointment[];
  adminEmail?: string;
  onNavigateToAppointment?: (appointmentId: string) => void;
  onOpenScheduleSettings?: () => void;
  onRefresh?: () => void;
}

export const AdminSlotManagement: React.FC<AdminSlotManagementProps> = ({
  slots,
  appointments,
  adminEmail,
  onNavigateToAppointment,
  onOpenScheduleSettings,
  onRefresh,
}) => {
  const houstonNow = useMemo(() => getHoustonCurrentDateTime(), []);
  const [selectedDate, setSelectedDate] = useState<string>(houstonNow.dateStr);
  const [activeSlotFilter, setActiveSlotFilter] = useState<SlotFilterType>('all');

  // Availability Generator State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSummary, setGenerationSummary] = useState<AvailabilityGenerationSummary | null>(null);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<DemoAppointmentSlot | null>(null);
  const [disablingSlot, setDisablingSlot] = useState<DemoAppointmentSlot | null>(null);

  // Form States for Add Slot
  const [newSlotTime, setNewSlotTime] = useState('09:00 AM');
  const [newSlotType, setNewSlotType] = useState<SlotType>('normal');
  const [newSlotDuration, setNewSlotDuration] = useState(30);
  const [newSlotNote, setNewSlotNote] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Form States for Edit Slot
  const [editSlotTime, setEditSlotTime] = useState('');
  const [editSlotType, setEditSlotType] = useState<SlotType>('normal');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Form State for Disable Slot
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isSubmittingDisable, setIsSubmittingDisable] = useState(false);

  // General Notification
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Get clinic schedule info for selected date
  const dayInfo = useMemo(() => getClinicDayInfo(selectedDate), [selectedDate]);

  // Available standard presets for current date
  const timePresets = useMemo(() => {
    if (dayInfo.dayOfWeek === 6) return STANDARD_SATURDAY_TIME_SLOTS;
    return STANDARD_WEEKDAY_TIME_SLOTS;
  }, [dayInfo.dayOfWeek]);

  // Filter slots for selected date
  const slotsOnDate = useMemo(() => {
    const list = slots.filter((s) => s.date === selectedDate);
    return list.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  }, [slots, selectedDate]);

  // Quick lookup of appointments on this date
  const appointmentMap = useMemo(() => {
    const map = new Map<string, AdminAppointment>();
    for (const app of appointments) {
      if (app.date === selectedDate && app.status !== 'Cancelled') {
        if (app.slotId) map.set(app.slotId, app);
        // Also map normalized date + time as fallback
        const key = `${app.date}_${normalizeSlotTime(app.time).toLowerCase()}`;
        map.set(key, app);
      }
    }
    return map;
  }, [appointments, selectedDate]);

  // Summary statistics for selected date (prompt requirement)
  const dateSummary = useMemo(() => {
    const total = slotsOnDate.length;
    // Expired slots must NOT be counted as active availability
    const available = slotsOnDate.filter(
      (s) => s.status === 'available' && !s.isExpired
    ).length;
    const booked = slotsOnDate.filter((s) => s.status === 'booked').length;
    const urgent = slotsOnDate.filter((s) => s.type === 'urgent').length;
    const normal = slotsOnDate.filter((s) => (s.type || 'normal') === 'normal').length;
    const disabled = slotsOnDate.filter((s) => s.status === 'disabled').length;
    const expired = slotsOnDate.filter(
      (s) => s.status === 'expired' || (s.status === 'available' && s.isExpired)
    ).length;

    return { total, available, booked, urgent, normal, disabled, expired };
  }, [slotsOnDate]);

  // Filtered slot list based on active filter tab
  const filteredSlots = useMemo(() => {
    let list = [...slotsOnDate];

    switch (activeSlotFilter) {
      case 'available':
        list = list.filter((s) => s.status === 'available' && !s.isExpired);
        break;
      case 'booked':
        list = list.filter((s) => s.status === 'booked');
        break;
      case 'urgent':
        list = list.filter((s) => s.type === 'urgent');
        break;
      case 'normal':
        list = list.filter((s) => (s.type || 'normal') === 'normal');
        break;
      case 'disabled':
        list = list.filter((s) => s.status === 'disabled');
        break;
      case 'expired':
        list = list.filter((s) => s.status === 'expired' || (s.status === 'available' && s.isExpired));
        break;
      case 'all':
      default:
        break;
    }

    return list;
  }, [slotsOnDate, activeSlotFilter]);

  // Date Navigation Handlers
  const handleShiftDate = (days: number) => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const curr = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      curr.setUTCDate(curr.getUTCDate() + days);
      const nextStr = curr.toISOString().split('T')[0];
      setSelectedDate(nextStr);
    } catch {
      // ignore
    }
  };

  const handleJumpToToday = () => {
    setSelectedDate(houstonNow.dateStr);
  };

  const handleJumpToTomorrow = () => {
    handleShiftDate(1);
  };

  // Open Add Slot Modal
  const handleOpenAddModal = () => {
    setAddError(null);
    setNewSlotType('normal');
    setNewSlotDuration(30);
    setNewSlotNote('');
    // Pre-select first valid future preset
    const validPreset = timePresets.find((t) => {
      const val = validateSlotParameters(selectedDate, t, houstonNow);
      return val.valid;
    });
    setNewSlotTime(validPreset || '09:00 AM');
    setIsAddModalOpen(true);
  };

  // Submit Add Slot
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setIsSubmittingAdd(true);

    try {
      const res = await adminCreateSlot(
        {
          date: selectedDate,
          time: newSlotTime,
          type: newSlotType,
          duration: newSlotDuration,
          note: newSlotNote.trim() || undefined,
        },
        adminEmail
      );

      if (!res.success) {
        setAddError(res.message || res.error || 'Failed to create slot.');
        setIsSubmittingAdd(false);
        return;
      }

      setIsAddModalOpen(false);
      setSuccessBanner(res.message || 'Slot successfully created.');
      setTimeout(() => setSuccessBanner(null), 4000);
      onRefresh?.();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create slot.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Run automatic availability generator
  const handleRunGenerateMissing = async () => {
    setIsGenerating(true);
    try {
      const summary = await generateMissingAvailability({ adminEmail, force: true });
      setGenerationSummary(summary);
      setSuccessBanner(
        `Availability maintained through ${summary.maintainedThrough} (${summary.windowDays} days). +${summary.slotsCreated} new slots created; ${summary.existingPreserved} preserved.`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
      onRefresh?.();
    } catch (err: any) {
      alert(err?.message || 'Error maintaining missing availability.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Open Edit Slot Modal
  const handleOpenEditModal = (slot: DemoAppointmentSlot) => {
    // Strict requirement: If slot is already booked, prevent editing and show clear message
    if (slot.status === 'booked') {
      alert('This slot is already booked. Use the appointment rescheduling workflow to move the appointment.');
      return;
    }

    if (slot.status === 'expired' || slot.isExpired) {
      alert('Cannot edit an expired past appointment slot.');
      return;
    }

    if (slot.status !== 'available') {
      alert('Only available future slots can be edited.');
      return;
    }

    setEditingSlot(slot);
    setEditSlotTime(slot.time);
    setEditSlotType(slot.type || 'normal');
    setEditError(null);
  };

  // Submit Edit Slot
  const handleSaveEditSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;

    setEditError(null);
    setIsSubmittingEdit(true);

    try {
      const res = await adminEditSlot(
        editingSlot.id,
        {
          time: editSlotTime,
          type: editSlotType,
        },
        adminEmail
      );

      if (!res.success) {
        setEditError(res.message || res.error || 'Failed to update slot.');
        setIsSubmittingEdit(false);
        return;
      }

      setEditingSlot(null);
      setSuccessBanner(res.message || 'Slot successfully updated.');
      setTimeout(() => setSuccessBanner(null), 4000);
      onRefresh?.();
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update slot.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Open Disable Slot Dialog
  const handleOpenDisableDialog = (slot: DemoAppointmentSlot) => {
    if (slot.status === 'booked') {
      alert('This slot is already booked and cannot be disabled. Use the appointment cancellation or rescheduling workflow.');
      return;
    }

    if (slot.status === 'expired' || slot.isExpired) {
      alert('Cannot disable past expired slots.');
      return;
    }

    if (slot.status !== 'available') {
      alert('Only available slots can be disabled.');
      return;
    }

    setDisablingSlot(slot);
    setDisableError(null);
  };

  // Submit Disable Slot
  const handleConfirmDisable = async () => {
    if (!disablingSlot) return;

    setDisableError(null);
    setIsSubmittingDisable(true);

    try {
      const res = await adminDisableSlot(disablingSlot.id, adminEmail);

      if (!res.success) {
        setDisableError(res.message || res.error || 'Failed to disable slot.');
        setIsSubmittingDisable(false);
        return;
      }

      setDisablingSlot(null);
      setSuccessBanner('Slot successfully disabled. Patients will no longer be able to book it.');
      setTimeout(() => setSuccessBanner(null), 4000);
      onRefresh?.();
    } catch (err: any) {
      setDisableError(err?.message || 'Failed to disable slot.');
    } finally {
      setIsSubmittingDisable(false);
    }
  };

  // Enable a disabled slot
  const handleEnableSlot = async (slot: DemoAppointmentSlot) => {
    if (slot.status !== 'disabled') return;
    try {
      const res = await adminEnableSlot(slot.id, adminEmail);
      if (res.success) {
        setSuccessBanner(res.message || 'Slot re-enabled and now available for booking.');
        setTimeout(() => setSuccessBanner(null), 4000);
        onRefresh?.();
      } else {
        alert(res.message || 'Failed to enable slot.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to enable slot.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Message */}
      {successBanner && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP HEADER: PHASE 5 ROLLING AVAILABILITY MAINTENANCE & CONFIG */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Rolling 30-Day Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Availability maintained through {houstonNow.dateStr ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : 'future window'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">
            Appointment Availability & Overlap Protection
          </h2>
          <p className="text-xs text-slate-500">
            Automatically generates missing schedule blocks while preserving booked, disabled, and manual doctor records.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleRunGenerateMissing}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Maintaining...' : 'Generate Missing Availability'}</span>
          </button>

          {onOpenScheduleSettings && (
            <button
              type="button"
              onClick={onOpenScheduleSettings}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Schedule Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION: DATE SELECTION & CLINIC OPERATING HOURS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Date Picker and Navigation Controls */}
          <div className="space-y-1">
            <label
              htmlFor="slot-date-picker"
              className="text-xs font-bold text-slate-500 uppercase tracking-wider block"
            >
              Select Schedule Date
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  id="slot-date-picker"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                />
              </div>

              {/* Prev Day Button */}
              <button
                type="button"
                onClick={() => handleShiftDate(-1)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Next Day Button */}
              <button
                type="button"
                onClick={() => handleShiftDate(1)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Quick Preset Buttons */}
              <button
                type="button"
                onClick={handleJumpToToday}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  selectedDate === houstonNow.dateStr
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleJumpToTomorrow}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              >
                Tomorrow
              </button>
            </div>
          </div>

          {/* Date Label & Add Slot Button */}
          <div className="flex items-center gap-3 justify-between md:justify-end">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 font-['Outfit']">
                {dayInfo.dayName}
              </p>
              <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Hours: {dayInfo.hoursDescription}</span>
              </p>
            </div>

            <button
              id="btn-add-new-slot"
              type="button"
              onClick={handleOpenAddModal}
              disabled={dayInfo.isSunday}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-xs transition-all cursor-pointer ${
                dayInfo.isSunday
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white'
              }`}
              title={dayInfo.isSunday ? 'Clinic is closed on Sundays' : 'Create a new appointment slot'}
            >
              <Plus className="w-4 h-4" />
              <span>Add Slot</span>
            </button>
          </div>
        </div>

        {/* Sunday Warning Alert if Sunday is selected */}
        {dayInfo.isSunday && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Clinic Closed on Sunday</p>
              <p className="text-amber-800 text-xs mt-0.5">
                Dental Care & Implants of Houston is closed on Sundays. Appointment slots cannot be scheduled on this day.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              className="text-xs font-semibold px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              Jump to Monday
            </button>
          </div>
        )}
      </div>

      {/* SUMMARY STATISTICS STRIP FOR SELECTED DATE */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Total Slots */}
        <div
          onClick={() => setActiveSlotFilter('all')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'all'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Slots</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-['Outfit']">{dateSummary.total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Scheduled for date</p>
        </div>

        {/* Metric 2: Available Slots */}
        <div
          onClick={() => setActiveSlotFilter('available')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'available'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">Available</p>
          <p className="text-2xl font-bold text-teal-800 mt-1 font-['Outfit']">{dateSummary.available}</p>
          <p className="text-[10px] text-teal-600 mt-0.5">Active bookable</p>
        </div>

        {/* Metric 3: Booked Slots */}
        <div
          onClick={() => setActiveSlotFilter('booked')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'booked'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Booked</p>
          <p className="text-2xl font-bold text-blue-700 mt-1 font-['Outfit']">{dateSummary.booked}</p>
          <p className="text-[10px] text-blue-600 mt-0.5">Reserved by patients</p>
        </div>

        {/* Metric 4: Urgent Slots */}
        <div
          onClick={() => setActiveSlotFilter('urgent')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'urgent'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Urgent Care</p>
          <p className="text-2xl font-bold text-amber-800 mt-1 font-['Outfit']">{dateSummary.urgent}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">Reserved priority</p>
        </div>

        {/* Metric 5: Normal Slots */}
        <div
          onClick={() => setActiveSlotFilter('normal')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'normal'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Normal</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 font-['Outfit']">{dateSummary.normal}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Routine visits</p>
        </div>

        {/* Metric 6: Disabled or Expired */}
        <div
          onClick={() => setActiveSlotFilter(dateSummary.disabled > 0 ? 'disabled' : 'expired')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeSlotFilter === 'disabled' || activeSlotFilter === 'expired'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {dateSummary.disabled > 0 ? 'Disabled' : 'Archived'}
          </p>
          <p className="text-2xl font-bold text-slate-600 mt-1 font-['Outfit']">
            {dateSummary.disabled > 0 ? dateSummary.disabled : dateSummary.expired}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {dateSummary.disabled > 0 ? 'Soft-deleted' : 'Past / Expired'}
          </p>
        </div>
      </div>

      {/* FILTER TABS STRIP */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { key: 'all', label: 'All Slots', count: dateSummary.total },
              { key: 'available', label: 'Available', count: dateSummary.available },
              { key: 'booked', label: 'Booked', count: dateSummary.booked },
              { key: 'urgent', label: 'Urgent Priority', count: dateSummary.urgent },
              { key: 'normal', label: 'Normal', count: dateSummary.normal },
              { key: 'disabled', label: 'Disabled', count: dateSummary.disabled },
              { key: 'expired', label: 'Expired', count: dateSummary.expired },
            ] as { key: SlotFilterType; label: string; count: number }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSlotFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSlotFilter === tab.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeSlotFilter === tab.key ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 italic">
          * Expired past slots are preserved for history and excluded from receptionist availability.
        </p>
      </div>

      {/* SLOT CARDS / LIST */}
      {filteredSlots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-800 font-['Outfit']">
              No Slots Found
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {dayInfo.isSunday
                ? 'The clinic is closed on Sundays.'
                : `There are no ${activeSlotFilter !== 'all' ? activeSlotFilter : ''} appointment slots scheduled for ${selectedDate}.`}
            </p>
          </div>
          {!dayInfo.isSunday && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Slot for this Date</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSlots.map((slot) => {
            const isBooked = slot.status === 'booked';
            const isDisabled = slot.status === 'disabled';
            const isExpired = slot.status === 'expired' || slot.isExpired;
            const isAvailable = slot.status === 'available' && !isExpired;
            const isUrgent = slot.type === 'urgent';

            // Find linked appointment if booked
            const linkedAppt = isBooked
              ? appointmentMap.get(slot.id) ||
                appointmentMap.get(`${slot.date}_${normalizeSlotTime(slot.time).toLowerCase()}`)
              : null;

            return (
              <div
                key={slot.id}
                id={`slot-card-${slot.id}`}
                className={`bg-white rounded-2xl border p-4.5 shadow-xs transition-all flex flex-col justify-between gap-4 ${
                  isBooked
                    ? 'border-blue-200/90 bg-linear-to-b from-white to-blue-50/20'
                    : isDisabled
                    ? 'border-slate-200 bg-slate-50/50 opacity-80'
                    : isExpired
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : 'border-slate-200/90 hover:border-blue-300 hover:shadow-xs'
                }`}
              >
                {/* Card Top: Time, Status, and Type Badges */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <Clock className="w-4 h-4 text-slate-400 self-center" />
                      <span className="text-lg font-bold tracking-tight text-slate-900 font-['Outfit']">
                        {slot.time} {slot.endTime ? `– ${slot.endTime}` : ''}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        ({slot.duration || 30} min)
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {slot.source === 'manual' || slot.note ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Manual
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Automatic
                        </span>
                      )}
                      {isAvailable && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                          Available
                        </span>
                      )}
                      {isBooked && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <Lock className="w-3 h-3 text-blue-600" />
                          Booked
                        </span>
                      )}
                      {isDisabled && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Ban className="w-3 h-3 text-slate-400" />
                          Disabled
                        </span>
                      )}
                      {isExpired && !isDisabled && !isBooked && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Expired
                        </span>
                      )}
                    </div>
                  </div>

                  {slot.note && (
                    <div className="mt-2 px-2.5 py-1 rounded-lg bg-blue-50/60 border border-blue-200/70 text-blue-800 text-xs">
                      <span className="font-semibold">Note: </span>{slot.note}
                    </div>
                  )}

                  {/* Type Badge & Location */}
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    {/* Appointment Type Badge (Normal vs Urgent) */}
                    {isUrgent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Urgent Priority Slot
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        Normal Routine Slot
                      </span>
                    )}

                    <span className="text-[11px] text-slate-400 truncate">
                      Greenspoint Clinic
                    </span>
                  </div>

                  {/* Booked Slot Information (Prompt Requirement: Display patient info) */}
                  {isBooked && (
                    <div className="mt-3.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          {linkedAppt?.patientName || 'Patient Booked'}
                        </span>
                        {linkedAppt && (
                          <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-sm">
                            {linkedAppt.patientType} Patient
                          </span>
                        )}
                      </div>

                      {linkedAppt?.phone && (
                        <p className="text-slate-600 flex items-center gap-1.5 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {formatPhoneNumber(linkedAppt.phone)}
                        </p>
                      )}

                      {linkedAppt?.reason && (
                        <p className="text-slate-700 text-[11px] flex items-center gap-1.5 line-clamp-1">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{linkedAppt.reason}</span>
                        </p>
                      )}

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-blue-800 italic">
                          Locked to patient booking.
                        </p>
                        {linkedAppt && onNavigateToAppointment && (
                          <button
                            type="button"
                            onClick={() => onNavigateToAppointment(linkedAppt.id)}
                            className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Reschedule</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Disabled Slot Reason */}
                  {isDisabled && (
                    <div className="mt-3 p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/60 text-xs text-rose-800">
                      <p className="font-medium text-[11px]">
                        Slot soft-deleted / disabled. Hidden from receptionist availability.
                      </p>
                    </div>
                  )}

                  {/* Expired Slot Note */}
                  {isExpired && !isDisabled && !isBooked && (
                    <div className="mt-3 p-2 rounded-xl bg-slate-100 text-xs text-slate-500 text-[11px]">
                      Historical record. Time has passed.
                    </div>
                  )}
                </div>

                {/* Card Bottom: Action Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {isAvailable && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(slot)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                        title="Edit slot time or appointment type"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDisableDialog(slot)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-xs font-semibold transition-colors cursor-pointer"
                        title="Disable slot to prevent patient booking"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-600" />
                        <span>Disable</span>
                      </button>
                    </>
                  )}

                  {isDisabled && !isExpired && (
                    <button
                      type="button"
                      onClick={() => handleEnableSlot(slot)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
                      title="Re-enable slot for patient booking"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Re-enable Slot</span>
                    </button>
                  )}

                  {isBooked && (
                    <div className="w-full flex items-center justify-between text-xs text-slate-400">
                      <span className="text-[11px]">Direct edit disabled</span>
                      {linkedAppt && onNavigateToAppointment ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToAppointment(linkedAppt.id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[11px] hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          Reschedule Appointment
                        </button>
                      ) : (
                        <span className="text-[11px] italic">Use Rescheduling</span>
                      )}
                    </div>
                  )}

                  {isExpired && !isDisabled && !isBooked && (
                    <span className="text-[11px] text-slate-400 italic">
                      Archived past slot
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD NEW APPOINTMENT SLOT */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                    Add New Appointment Slot
                  </h3>
                  <p className="text-xs text-slate-500">
                    {dayInfo.dayName}, {selectedDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner inside modal */}
            {addError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSlot} className="space-y-4">
              {/* Date preview */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Scheduled Date
                </label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 flex items-center justify-between">
                  <span>{selectedDate}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {dayInfo.dayName} ({dayInfo.hoursDescription})
                  </span>
                </div>
              </div>

              {/* Time Selector with Presets */}
              <div>
                <label
                  htmlFor="new-slot-time-select"
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1"
                >
                  Appointment Time
                </label>
                <select
                  id="new-slot-time-select"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                >
                  {timePresets.map((timeStr) => {
                    const isPassed = isSlotOrAppointmentExpired(selectedDate, timeStr, houstonNow);
                    return (
                      <option key={timeStr} value={timeStr} disabled={isPassed}>
                        {timeStr} {isPassed ? '(Time passed)' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Operating hours: {dayInfo.hoursDescription} (Houston Central Time)
                </p>
              </div>

              {/* Slot Type Selector (Prompt requirement: Normal or Urgent) */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Slot Type & Priority
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newSlotType === 'normal'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="slotType"
                      value="normal"
                      checked={newSlotType === 'normal'}
                      onChange={() => setNewSlotType('normal')}
                      className="sr-only"
                    />
                    <p className="font-semibold text-xs">Normal Slot</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Checkup, cleaning, implants
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newSlotType === 'urgent'
                        ? 'border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="slotType"
                      value="urgent"
                      checked={newSlotType === 'urgent'}
                      onChange={() => setNewSlotType('urgent')}
                      className="sr-only"
                    />
                    <p className="font-semibold text-xs text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Urgent Slot
                    </p>
                    <p className="text-[10px] text-amber-700/80 mt-0.5">
                      Reserved emergency pain visits
                    </p>
                  </label>
                </div>
              </div>

              {/* Duration & End Time Selection (Phase 5 Requirement) */}
              <div>
                <label
                  htmlFor="new-slot-duration-select"
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1"
                >
                  Duration & End Time
                </label>
                <select
                  id="new-slot-duration-select"
                  value={newSlotDuration}
                  onChange={(e) => setNewSlotDuration(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                >
                  <option value={30}>30 Minutes (Standard Single Block)</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes (1 Hour - Cleaning / Filling)</option>
                  <option value={90}>90 Minutes (1.5 Hours - Root Canal / Implants)</option>
                  <option value={120}>120 Minutes (2 Hours - Complex Surgery)</option>
                </select>
                <p className="text-[11px] text-blue-700 font-medium mt-1">
                  Scheduled Window: {newSlotTime} – {computeEndTime(newSlotTime, newSlotDuration)} ({newSlotDuration} minutes)
                </p>
              </div>

              {/* Optional Note / Internal Doctor Label */}
              <div>
                <label
                  htmlFor="new-slot-note-input"
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1"
                >
                  Internal Note / Label (Optional)
                </label>
                <input
                  id="new-slot-note-input"
                  type="text"
                  placeholder="e.g., Doctor opening extra evening block"
                  value={newSlotNote}
                  onChange={(e) => setNewSlotNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {/* Initial Status notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Default status: <strong>Available</strong> (bookable immediately by AI Receptionist).</span>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-create-slot"
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAdd ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Slot</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT AVAILABLE SLOT */}
      {editingSlot && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                    Edit Available Slot
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingSlot.date} ({editingSlot.time})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit error banner */}
            {editError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditSlot} className="space-y-4">
              {/* Slot Date (read-only) */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Slot Date
                </label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700">
                  {editingSlot.date}
                </div>
              </div>

              {/* Slot Time Select */}
              <div>
                <label
                  htmlFor="edit-slot-time-select"
                  className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1"
                >
                  Adjust Time
                </label>
                <select
                  id="edit-slot-time-select"
                  value={editSlotTime}
                  onChange={(e) => setEditSlotTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                >
                  {timePresets.map((timeStr) => {
                    const isPassed = isSlotOrAppointmentExpired(editingSlot.date, timeStr, houstonNow);
                    return (
                      <option key={timeStr} value={timeStr} disabled={isPassed}>
                        {timeStr} {isPassed ? '(Time passed)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Slot Type Selector */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Slot Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      editSlotType === 'normal'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editSlotType"
                      value="normal"
                      checked={editSlotType === 'normal'}
                      onChange={() => setEditSlotType('normal')}
                      className="sr-only"
                    />
                    <p className="font-semibold text-xs">Normal Slot</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Routine booking</p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      editSlotType === 'urgent'
                        ? 'border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editSlotType"
                      value="urgent"
                      checked={editSlotType === 'urgent'}
                      onChange={() => setEditSlotType('urgent')}
                      className="sr-only"
                    />
                    <p className="font-semibold text-xs text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Urgent Slot
                    </p>
                    <p className="text-[10px] text-amber-700/80 mt-0.5">Emergency reserved</p>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-save-edit"
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DISABLE SLOT CONFIRMATION DIALOG (PROMPT REQUIREMENT) */}
      {disablingSlot && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                  Disable Appointment Slot
                </h3>
                {/* Prompt requirement exact copy */}
                <p className="text-sm text-slate-600 font-medium">
                  Disable this available slot? Patients will no longer be able to book it.
                </p>
              </div>
            </div>

            {/* Slot Details Review */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">Date & Time:</span>
                <span>{disablingSlot.date} at {disablingSlot.time}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">Type:</span>
                <span className="capitalize">{disablingSlot.type || 'normal'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">Current Status:</span>
                <span className="text-emerald-700 font-semibold">Available</span>
              </div>
            </div>

            {/* Error banner */}
            {disableError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{disableError}</span>
              </div>
            )}

            {/* Prompt requirement exact buttons: Cancel, Disable Slot */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDisablingSlot(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-disable-slot"
                type="button"
                onClick={handleConfirmDisable}
                disabled={isSubmittingDisable}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmittingDisable ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disabling...</span>
                  </>
                ) : (
                  <span>Disable Slot</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  FileText,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  Tag,
  CalendarDays,
  Ban,
  Loader2,
  ArrowRight,
  History,
  Bell,
} from 'lucide-react';
import { AdminAppointment, DemoAppointmentSlot, NotificationRecord } from '../types';
import {
  formatAppointmentDate,
  formatAppointmentDateFull,
  formatPhoneNumber,
  cancelAppointment,
  rescheduleAppointment,
} from '../services/adminAppointmentsService';
import { getNotificationsForAppointment } from '../services/notificationsService';
import { formatScheduledForDisplay } from '../utils/clinicTime';
import { resolveServiceDuration } from '../services/scheduleConfigService';
import { normalizeSlotTime } from '../services/demoSlotsService';
import { isSundayDate, formatMinutesToTime, parseTimeToMinutes } from '../utils/bookingConversationEngine';

interface AppointmentDetailsModalProps {
  appointment: AdminAppointment | null;
  slots: DemoAppointmentSlot[];
  adminEmail: string;
  onClose: () => void;
  onAppointmentUpdated?: () => void;
}

export const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  appointment,
  slots,
  adminEmail,
  onClose,
  onAppointmentUpdated,
}) => {
  // Action modes: null | 'reschedule' | 'cancel'
  const [actionMode, setActionMode] = useState<null | 'reschedule' | 'cancel'>(null);

  // Reschedule state
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [allowUrgentDowngrade, setAllowUrgentDowngrade] = useState<boolean>(false);

  // Notifications state for this appointment
  const [apptNotifications, setApptNotifications] = useState<NotificationRecord[]>([]);

  // Async action processing state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Close on Escape key press
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  // Reset internal states when appointment changes or opens
  React.useEffect(() => {
    setActionMode(null);
    setSelectedSlotId('');
    setAllowUrgentDowngrade(false);
    setFeedback(null);

    if (appointment?.id) {
      let active = true;
      getNotificationsForAppointment(appointment.id).then((records) => {
        if (active) {
          setApptNotifications(records);
        }
      });
      return () => {
        active = false;
      };
    } else {
      setApptNotifications([]);
    }
  }, [appointment?.id, feedback]);

  // Filter valid future available slots for rescheduling with full interval duration check
  const appointmentDuration = useMemo(() => {
    if (!appointment) return 30;
    return (
      Number(appointment.durationMinutes || appointment.duration) ||
      resolveServiceDuration(appointment.reason || appointment.reasonForVisit) ||
      30
    );
  }, [appointment]);

  const availableFutureSlots = useMemo(() => {
    if (!appointment) return [];
    const dur = appointmentDuration;
    const stepCount = Math.max(1, Math.round(dur / 30));

    // Map of date_time -> slot
    const slotMap = new Map<string, DemoAppointmentSlot>();
    for (const s of slots) {
      slotMap.set(`${s.date}_${normalizeSlotTime(s.time).toLowerCase()}`, s);
    }

    return slots.filter((slot) => {
      // Must be currently available and not expired
      if (slot.status !== 'available' || slot.isExpired) return false;
      // Cannot be the exact current slot
      if (slot.id === appointment.slotId) return false;
      if (isSundayDate(slot.date)) return false;

      const startMin = parseTimeToMinutes(slot.time);
      const endMin = startMin + dur;

      // Check clinic operating hours
      const parts = slot.date.split('-');
      const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const isSat = dObj.getDay() === 6;
      const clinicCloseMin = isSat ? 17 * 60 : 19 * 60; // Sat 5 PM, Weekday 7 PM
      const clinicOpenMin = 8 * 60;
      if (startMin < clinicOpenMin || endMin > clinicCloseMin) return false;

      // Check all constituent intervals
      for (let i = 1; i < stepCount; i++) {
        const curMins = startMin + i * 30;
        if (curMins + 30 > clinicCloseMin) return false;
        const curTimeStr = normalizeSlotTime(formatMinutesToTime(curMins)).toLowerCase();
        const sub = slotMap.get(`${slot.date}_${curTimeStr}`);
        if (!sub || (sub.status !== 'available' && sub.id !== appointment.slotId) || sub.isExpired) {
          return false;
        }
      }

      return true;
    });
  }, [slots, appointment, appointmentDuration]);

  // Selected new slot object
  const selectedNewSlot = useMemo(() => {
    if (!selectedSlotId) return undefined;
    return slots.find((s) => s.id === selectedSlotId);
  }, [slots, selectedSlotId]);

  if (!appointment) return null;

  const isUrgent = appointment.isUrgent;
  const isCancelled = appointment.status === 'Cancelled';
  const isPast = !!appointment.isPast;
  const isExistingPatient = appointment.patientType === 'existing';

  const isSwitchingUrgentToNormal =
    isUrgent && selectedNewSlot && (selectedNewSlot.type || 'normal') !== 'urgent';

  // Handler: Confirm Cancellation
  const handleConfirmCancel = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await cancelAppointment(appointment.id, adminEmail);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Appointment has been cancelled and the slot is now released.',
        });
        if (onAppointmentUpdated) onAppointmentUpdated();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Unable to cancel appointment right now.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'A network error occurred while cancelling the appointment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Confirm Rescheduling
  const handleConfirmReschedule = async () => {
    if (!selectedSlotId) {
      setFeedback({
        type: 'error',
        message: 'Please select a new appointment slot to continue.',
      });
      return;
    }

    if (isSwitchingUrgentToNormal && !allowUrgentDowngrade) {
      setFeedback({
        type: 'error',
        message:
          'Please confirm you wish to reschedule this urgent patient into a routine non-urgent slot.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await rescheduleAppointment(
        appointment.id,
        selectedSlotId,
        adminEmail,
        allowUrgentDowngrade
      );
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Appointment successfully rescheduled to the new time slot.',
        });
        if (onAppointmentUpdated) onAppointmentUpdated();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Unable to reschedule appointment.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'A network error occurred while rescheduling the appointment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="appointment-details-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-appointment-title"
    >
      <div
        id="appointment-details-modal-card"
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="modal-appointment-title"
                className="text-base font-bold text-slate-900 font-['Outfit'] leading-tight"
              >
                Appointment Details
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap font-mono">
                <span>Appt ID: {appointment.id}</span>
                {appointment.slotId && (
                  <>
                    <span>•</span>
                    <span>Slot: {appointment.slotId}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            id="btn-close-appointment-modal"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert if present */}
        {feedback && (
          <div
            id="modal-action-feedback-alert"
            className={`px-6 py-3 text-xs font-semibold flex items-center gap-2 border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Modal Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Patient Overview Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Patient Full Name
                </p>
                <h4 className="text-lg font-bold text-slate-900 font-['Outfit'] mt-0.5">
                  {appointment.patientName}
                </h4>
              </div>

              {/* Status and Urgency Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {isCancelled ? (
                  <span
                    id="modal-booking-status-badge"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
                  >
                    <Ban className="w-3.5 h-3.5 text-slate-400" />
                    <span>Cancelled</span>
                  </span>
                ) : isPast ? (
                  <span
                    id="modal-booking-status-badge"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Past Appointment</span>
                  </span>
                ) : (
                  <span
                    id="modal-booking-status-badge"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Booked</span>
                  </span>
                )}

                <span
                  id="modal-appointment-type-badge"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    isUrgent
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {isUrgent && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                  <span>{isUrgent ? 'Urgent' : 'Normal'}</span>
                </span>
              </div>
            </div>

            {/* Patient Type & Demographics Pill */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center gap-2 flex-wrap text-xs">
              <span
                id="modal-patient-type-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-medium text-[11px] ${
                  isExistingPatient
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                <User className="w-3 h-3 text-slate-400" />
                <span>{isExistingPatient ? 'Existing Patient' : 'New Patient'}</span>
              </span>

              {appointment.patientId && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span>ID: {appointment.patientId}</span>
                </span>
              )}

              {appointment.rescheduledAt && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                  <History className="w-3 h-3" />
                  <span>Rescheduled</span>
                </span>
              )}
            </div>
          </div>

          {/* Cancellation History Notice if cancelled */}
          {isCancelled && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Ban className="w-4 h-4 text-slate-400" />
                <span>Appointment Was Cancelled</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                {appointment.cancelledAt ? (
                  <>
                    Cancelled on {new Date(appointment.cancelledAt).toLocaleString()}
                    {appointment.cancelledBy && ` by ${appointment.cancelledBy}`}.
                  </>
                ) : (
                  'This appointment is cancelled and the slot has been returned to clinic availability.'
                )}
              </p>
            </div>
          )}

          {/* Reschedule History Details if previously rescheduled */}
          {appointment.previousDate && (
            <div className="p-3 rounded-xl border border-blue-200/80 bg-blue-50/50 text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-blue-950">
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span>Previous Schedule</span>
              </div>
              <p className="text-[11px] text-blue-800/90">
                Previously scheduled for {formatAppointmentDate(appointment.previousDate)} at{' '}
                {appointment.previousTime || '—'}.
              </p>
            </div>
          )}

          {/* Appointment Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Appointment Date */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Appointment Date</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {formatAppointmentDateFull(appointment.date)}
              </p>
              <p className="text-[11px] font-mono text-slate-400">{appointment.date}</p>
            </div>

            {/* Appointment Time & Duration */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Appointment Time & Duration</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {appointment.time || 'Time Not Specified'}
                {appointment.endTime && appointment.endTime !== appointment.time
                  ? ` – ${appointment.endTime}`
                  : ''}
              </p>
              <p className="text-[11px] text-slate-500">
                {appointment.durationMinutes || appointment.duration
                  ? `${appointment.durationMinutes || appointment.duration} min duration • Houston CDT`
                  : 'Houston Central Time (CDT)'}
              </p>
            </div>

            {/* Contact Phone */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                <span>Contact Phone</span>
              </div>
              <p className="text-sm font-semibold font-mono text-slate-900">
                {formatPhoneNumber(appointment.phone)}
              </p>
              <p className="text-[11px] text-slate-400">Primary patient confirmation number</p>
            </div>

            {/* Booking Status */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Booking Status</span>
              </div>
              <p
                className={`text-sm font-semibold ${
                  isCancelled ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {isCancelled ? 'Cancelled' : isPast ? 'Completed / Past' : 'Booked & Verified'}
              </p>
              <p className="text-[11px] text-slate-400">
                {isCancelled
                  ? 'Inactive in clinic schedule'
                  : 'Locked in clinic schedule database'}
              </p>
            </div>
          </div>

          {/* Reason for Visit Box */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Reason for Visit</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 leading-relaxed">
              {appointment.reason || 'General Dental Consultation'}
            </p>
            <p className="text-[11px] text-slate-400">
              Captured directly from patient intake during conversation
            </p>
          </div>

          {/* Clinic Location */}
          <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Greenspoint Location:</span> 165 Greens
              Rd, Houston, TX 77060
            </div>
          </div>

          {/* Notifications & Reminder Queue Card */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-['Outfit']">
                  Notification & Reminder Records
                </h5>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {apptNotifications.length} record{apptNotifications.length === 1 ? '' : 's'}
              </span>
            </div>

            {apptNotifications.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No notification records generated yet.
              </p>
            ) : (
              <div className="space-y-2">
                {apptNotifications.map((notif) => {
                  const is24h = notif.type === 'appointment_reminder_24h';
                  const is2h = notif.type === 'appointment_reminder_2h';
                  const isConfirm = notif.type === 'appointment_confirmation';
                  const isCancel = notif.type === 'appointment_cancellation';
                  const isResched = notif.type === 'appointment_rescheduled';

                  const typeLabel = is24h
                    ? '24h SMS Reminder'
                    : is2h
                    ? '2h SMS Reminder'
                    : isConfirm
                    ? 'Booking Confirmation'
                    : isCancel
                    ? 'Cancellation Notice'
                    : isResched
                    ? 'Rescheduled Notice'
                    : notif.type;

                  return (
                    <div
                      key={notif.id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              notif.status === 'cancelled'
                                ? 'bg-slate-400'
                                : notif.status === 'pending'
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          <span>{typeLabel}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {notif.scheduledFor ? (
                            <span>Scheduled: {formatScheduledForDisplay(notif.scheduledFor)}</span>
                          ) : (
                            <span>Immediate on transaction</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            notif.status === 'cancelled'
                              ? 'bg-slate-200 text-slate-700'
                              : notif.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {notif.status}
                        </span>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {notif.phone}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Concept Demo: SMS dispatch remains in pending status without external carrier integration.
            </p>
          </div>

          {/* INLINE ACTION PANEL: RESCHEDULE */}
          {actionMode === 'reschedule' && !isCancelled && !isPast && (
            <div
              id="reschedule-action-panel"
              className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/60 space-y-3.5 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-700" />
                  <h5 className="text-xs font-bold uppercase tracking-wider text-blue-900 font-['Outfit']">
                    Reschedule Appointment
                  </h5>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActionMode(null);
                    setSelectedSlotId('');
                    setFeedback(null);
                  }}
                  disabled={isSubmitting}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Select an available future slot below. Upon confirming, the current slot will be
                released and the patient’s booking will immediately transfer to the new slot.
              </p>

              {availableFutureSlots.length === 0 ? (
                <div className="p-3 bg-white rounded-lg border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>No other upcoming slots are currently available in the system.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    htmlFor="select-reschedule-slot"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Available Upcoming Slots ({availableFutureSlots.length})
                  </label>
                  <select
                    id="select-reschedule-slot"
                    value={selectedSlotId}
                    onChange={(e) => {
                      setSelectedSlotId(e.target.value);
                      setFeedback(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">— Select an available date & time —</option>
                    {availableFutureSlots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatAppointmentDate(s.date)} • {s.time} (
                        {(s.type || 'normal') === 'urgent' ? 'Urgent Slot' : 'Routine Slot'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Urgent patient downgrading notice / checkbox */}
              {isSwitchingUrgentToNormal && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                  <div className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Urgent Patient Notice:</span> This patient was
                      flagged as urgent, but the selected slot is a standard routine slot.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer pt-1">
                    <input
                      id="checkbox-confirm-urgent-downgrade"
                      type="checkbox"
                      checked={allowUrgentDowngrade}
                      onChange={(e) => setAllowUrgentDowngrade(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Yes, proceed with rescheduling into routine slot</span>
                  </label>
                </div>
              )}

              {/* Confirmation Button */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  id="btn-confirm-reschedule"
                  type="button"
                  onClick={handleConfirmReschedule}
                  disabled={
                    !selectedSlotId ||
                    isSubmitting ||
                    (isSwitchingUrgentToNormal && !allowUrgentDowngrade)
                  }
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Rescheduling...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm New Time</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* INLINE ACTION PANEL: CANCEL */}
          {actionMode === 'cancel' && !isCancelled && !isPast && (
            <div
              id="cancel-action-panel"
              className="p-4 rounded-xl border-2 border-rose-200 bg-rose-50/70 space-y-3.5 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-800">
                  <Ban className="w-4 h-4 text-rose-600" />
                  <h5 className="text-xs font-bold uppercase tracking-wider font-['Outfit']">
                    Confirm Appointment Cancellation
                  </h5>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActionMode(null);
                    setFeedback(null);
                  }}
                  disabled={isSubmitting}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              <p className="text-xs text-rose-900/90 leading-relaxed">
                Are you sure you want to cancel the booking for{' '}
                <span className="font-bold">{appointment.patientName}</span> on{' '}
                <span className="font-bold">
                  {formatAppointmentDate(appointment.date)} at {appointment.time}
                </span>
                ? This will mark the appointment cancelled and restore the slot for other patients.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActionMode(null)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
                >
                  Keep Appointment
                </button>
                <button
                  id="btn-confirm-cancel-appointment"
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Cancelling...</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      <span>Confirm Cancellation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Security & Non-Clinical Notice */}
          <p className="text-[11px] text-slate-400 text-center italic">
            Receptionist demonstration record. No PHI, medical diagnoses, prescriptions, or payment
            records are stored.
          </p>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
          {/* Action buttons (only allowed if appointment is active & not past) */}
          <div className="flex items-center gap-2">
            {!isCancelled && !isPast && actionMode === null && (
              <>
                <button
                  id="btn-open-reschedule-panel"
                  type="button"
                  onClick={() => {
                    setActionMode('reschedule');
                    setFeedback(null);
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Reschedule</span>
                </button>

                <button
                  id="btn-open-cancel-panel"
                  type="button"
                  onClick={() => {
                    setActionMode('cancel');
                    setFeedback(null);
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Ban className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cancel</span>
                </button>
              </>
            )}
          </div>

          <button
            id="btn-close-appointment-modal-footer"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

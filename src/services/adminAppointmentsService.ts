import { collection, onSnapshot, getDocs, getDoc, doc, runTransaction, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PREFERENCES_COLLECTION, SLOTS_COLLECTION } from './demoSlotsService';
import {
  AdminAppointment,
  AdminDashboardSummary,
  DemoAppointmentSlot,
  PatientType,
  SlotType,
} from '../types';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  parseTimeToMinutes as parseTimeToMinutesUtil,
} from '../utils/clinicTime';
import {
  resolveServiceDuration,
  computeEndTime,
  getClinicScheduleConfig,
  isAppointmentWithinClinicHours,
  doTimeIntervalsOverlap,
} from './scheduleConfigService';
import { normalizeSlotTime } from './demoSlotsService';
import { formatMinutesToTime } from '../utils/bookingConversationEngine';
import {
  createAppointmentCancellationNotification,
  createAppointmentRescheduledNotification,
  cancelAppointmentReminders,
  updateAppointmentRemindersForReschedule,
} from './notificationsService';

/**
 * Standard clinic schedule reference date based on clinic local time (Houston, TX).
 */
export const getClinicTodayDate = (): string => getHoustonCurrentDateTime().dateStr;
export const CLINIC_REFERENCE_TODAY = getHoustonCurrentDateTime().dateStr;

/**
 * Parse time string (e.g. "08:30 AM", "01:00 PM") into total minutes since midnight
 * for precise chronological sorting.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  return parseTimeToMinutesUtil(timeStr);
}

/**
 * Check whether an appointment is classified as urgent based strictly on
 * existing appointment fields (isUrgent, appointmentType, type).
 * Avoids guessing from random unstructured text when classification fields exist.
 */
export function isAppointmentUrgent(item: {
  isUrgent?: boolean;
  appointmentType?: string;
  type?: string;
  reason?: string;
  reasonForVisit?: string;
}): boolean {
  if (item.isUrgent === true) return true;
  const apptType = item.appointmentType || item.type;
  if (apptType === 'urgent') return true;
  if (apptType === 'normal') return false;
  return false;
}

/**
 * Format date string (YYYY-MM-DD) into concise readable date without UTC shifting.
 */
export function formatAppointmentDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, monthIndex, day);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/**
 * Full expanded date display for appointment details modal.
 */
export function formatAppointmentDateFull(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, monthIndex, day);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

import { formatDisplayPhone } from '../utils/phoneUtils';

/**
 * Format phone numbers into standard readable format (supports both US and India).
 */
export function formatPhoneNumber(phone?: string): string {
  return formatDisplayPhone(phone);
}

/**
 * Normalizes a raw Firestore preference or appointment record into a clean AdminAppointment.
 */
export function normalizeAppointmentRecord(id: string, data: any): AdminAppointment {
  const patientType: PatientType =
    data.patientType === 'existing' ? 'existing' : 'new';
  const urgent = isAppointmentUrgent(data);
  const rawDate = data.date || data.appointmentDate || '';
  const rawTime = data.time || data.appointmentTime || '';
  const rawPhone = data.patientPhone || data.phone || '';
  const rawName =
    data.patientName ||
    data.fullName ||
    (patientType === 'existing' ? 'Existing Patient (Demo)' : 'New Patient');
  const rawReason =
    data.reason ||
    data.reasonForVisit ||
    (urgent ? 'Tooth Pain / Urgent Discomfort' : 'Routine Checkup & Cleaning');

  const isPast = isSlotOrAppointmentExpired(rawDate, rawTime);
  const rawStatus = (data.status || '').toLowerCase();
  const isCancelled = rawStatus === 'cancelled';
  const status = isCancelled ? 'Cancelled' : 'Booked';

  const startTime = data.startTime || rawTime;
  const durationMinutes =
    Number(data.durationMinutes || data.duration) || resolveServiceDuration(rawReason) || 30;
  const endTime =
    data.endTime || (startTime ? computeEndTime(startTime, durationMinutes) : '');

  return {
    id,
    slotId: data.slotId,
    patientName: rawName,
    patientType,
    patientId: data.patientId,
    phone: rawPhone,
    patientPhone: rawPhone,
    reason: rawReason,
    reasonForVisit: rawReason,
    date: rawDate,
    appointmentDate: rawDate,
    time: rawTime,
    appointmentTime: rawTime,
    startTime,
    endTime,
    duration: durationMinutes,
    durationMinutes,
    appointmentType: urgent ? 'urgent' : 'normal',
    type: urgent ? 'urgent' : 'normal',
    isUrgent: urgent,
    status,
    location: data.location || 'Greenspoint Location: 165 Greens Rd, Houston, TX 77060',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    cancelledAt: data.cancelledAt,
    cancelledBy: data.cancelledBy,
    rescheduledAt: data.rescheduledAt,
    rescheduledBy: data.rescheduledBy,
    previousSlotId: data.previousSlotId,
    previousDate: data.previousDate,
    previousTime: data.previousTime,
    isDemo: true,
    isPast,
  };
}

/**
 * Sort appointments chronologically:
 * Earliest date first, then earliest time first.
 */
export function sortAppointmentsChronologically(
  items: AdminAppointment[],
  order: 'asc' | 'desc' = 'asc'
): AdminAppointment[] {
  return [...items].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) {
      return order === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    const timeA = parseTimeToMinutes(a.time);
    const timeB = parseTimeToMinutes(b.time);
    return order === 'asc' ? timeA - timeB : timeB - timeA;
  });
}

/**
 * Computes the 4 summary card metrics from current appointments and slot inventory,
 * automatically taking into account past-date/time expiration in Houston local time.
 */
export function computeDashboardSummary(
  appointments: AdminAppointment[],
  slots: DemoAppointmentSlot[],
  referenceDate?: string
): AdminDashboardSummary {
  const houstonNow = getHoustonCurrentDateTime();
  const activeDate = referenceDate || houstonNow.dateStr;

  // Active appointments (strictly exclude Cancelled appointments from active booked counts)
  const activeAppts = appointments.filter((a) => a.status !== 'Cancelled');

  // 1. Today's Appointments (strictly for today's active date, excluding past times and cancelled)
  const todayAppts = activeAppts.filter(
    (a) => a.date === activeDate && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );
  const todayNormal = todayAppts.filter((a) => !a.isUrgent);
  const todayUrgent = todayAppts.filter((a) => a.isUrgent);
  const todayNew = todayAppts.filter((a) => a.patientType === 'new');
  const todayExisting = todayAppts.filter((a) => a.patientType === 'existing');

  // 2. Upcoming Appointments (scheduled after reference today, excluding past appointments and cancelled)
  const upcomingAppts = activeAppts.filter(
    (a) => a.date > activeDate && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );
  const upcomingDates = new Set(upcomingAppts.map((a) => a.date));

  // Past Appointments (active appointments whose scheduled date/time has passed, excluding cancelled)
  const pastAppts = activeAppts.filter((a) =>
    isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );

  // Active Urgent Appointments (booked, not cancelled, and not past)
  const activeUrgentAppts = activeAppts.filter(
    (a) => a.isUrgent && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );

  // Active New Patients (booked, not cancelled, and not past)
  const activeNewPatients = activeAppts.filter(
    (a) => a.patientType === 'new' && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );

  // Active Existing Patients (booked, not cancelled, and not past)
  const activeExistingPatients = activeAppts.filter(
    (a) => a.patientType === 'existing' && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
  );

  // Cancelled Appointments (all cancelled records preserved in Firestore history)
  const cancelledAppts = appointments.filter((a) => a.status === 'Cancelled');

  // 3. Available Slots (strictly excluding expired slots)
  const availableSlots = slots.filter(
    (s) => s.status === 'available' && !isSlotOrAppointmentExpired(s.date, s.time, houstonNow)
  );
  const availableNormal = availableSlots.filter((s) => (s.type || 'normal') === 'normal');
  const availableUrgent = availableSlots.filter((s) => s.type === 'urgent');

  // 4. Urgent Slots (strictly excluding expired urgent slots)
  const allUrgentSlots = slots.filter((s) => s.type === 'urgent');
  const bookedUrgentSlots = allUrgentSlots.filter((s) => s.status === 'booked');
  const availableUrgentSorted = [...availableUrgent].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
  });
  const earliestUrgent = availableUrgentSorted[0];

  return {
    todayDate: activeDate,
    todayFormatted: formatAppointmentDateFull(activeDate),
    todayAppointments: {
      total: todayAppts.length,
      normal: todayNormal.length,
      urgent: todayUrgent.length,
      newPatients: todayNew.length,
      existingPatients: todayExisting.length,
      hasAppointments: todayAppts.length > 0,
    },
    upcomingAppointments: {
      total: upcomingAppts.length,
      datesCount: upcomingDates.size,
    },
    urgentAppointments: {
      total: activeUrgentAppts.length,
      today: todayUrgent.length,
      upcoming: activeUrgentAppts.filter((a) => a.date > activeDate).length,
    },
    newPatients: {
      total: activeNewPatients.length,
      today: todayNew.length,
      upcoming: activeNewPatients.filter((a) => a.date > activeDate).length,
    },
    existingPatients: {
      total: activeExistingPatients.length,
      today: todayExisting.length,
      upcoming: activeExistingPatients.filter((a) => a.date > activeDate).length,
    },
    cancelledAppointments: {
      total: cancelledAppts.length,
    },
    urgentSlots: {
      available: availableUrgent.length,
      booked: bookedUrgentSlots.length,
      total: allUrgentSlots.length,
      nextAvailableTime: earliestUrgent?.time,
      nextAvailableDate: earliestUrgent?.date,
    },
    availableSlots: {
      total: availableSlots.length,
      normal: availableNormal.length,
      urgent: availableUrgent.length,
    },
    pastAppointments: {
      total: pastAppts.length,
    },
  };
}

/**
 * Subscribes to real-time updates for booked appointments and slots.
 * Cleans up listeners automatically when the returned function is called.
 */
export function subscribeToAdminData(
  onData: (data: {
    appointments: AdminAppointment[];
    slots: DemoAppointmentSlot[];
    summary: AdminDashboardSummary;
  }) => void,
  onError: (errorMessage: string) => void,
  referenceDate = CLINIC_REFERENCE_TODAY
): () => void {
  let cachedSlots: DemoAppointmentSlot[] = [];
  let cachedAppointments: AdminAppointment[] = [];
  let hasSlotsLoaded = false;
  let hasPrefsLoaded = false;

  const emitIfReady = () => {
    if (!hasSlotsLoaded || !hasPrefsLoaded) return;
    const summary = computeDashboardSummary(
      cachedAppointments,
      cachedSlots,
      referenceDate
    );
    onData({
      appointments: cachedAppointments,
      slots: cachedSlots,
      summary,
    });
  };

  // 1. Subscribe to demo_appointment_preferences (booked appointments)
  const prefsCol = collection(db, PREFERENCES_COLLECTION);
  const unsubPrefs = onSnapshot(
    prefsCol,
    (snapshot) => {
      const rawMap = new Map<string, AdminAppointment>();

      snapshot.forEach((docSnap) => {
        const item = normalizeAppointmentRecord(docSnap.id, docSnap.data());
        rawMap.set(docSnap.id, item);
      });

      cachedAppointments = sortAppointmentsChronologically(
        Array.from(rawMap.values()),
        'asc'
      );
      hasPrefsLoaded = true;
      emitIfReady();
    },
    (err) => {
      console.error('Firestore real-time subscription error (preferences):', err);
      onError('Unable to load appointments right now. Please try again.');
    }
  );

  // 2. Subscribe to demo_appointment_slots (availability and slot status)
  const slotsCol = collection(db, SLOTS_COLLECTION);
  const unsubSlots = onSnapshot(
    slotsCol,
    (snapshot) => {
      const slotList: DemoAppointmentSlot[] = [];
      const houstonNow = getHoustonCurrentDateTime();

      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as any;
        const isExpired = isSlotOrAppointmentExpired(raw.date, raw.time, houstonNow);
        const status = isExpired && raw.status === 'available' ? 'expired' : raw.status;

        slotList.push({
          id: docSnap.id,
          ...raw,
          status,
          isExpired,
        } as DemoAppointmentSlot);
      });

      cachedSlots = slotList;
      hasSlotsLoaded = true;
      emitIfReady();
    },
    (err) => {
      console.error('Firestore real-time subscription error (slots):', err);
      onError('Unable to load appointments right now. Please try again.');
    }
  );

  // Return unsubscribe cleanup function
  return () => {
    unsubPrefs();
    unsubSlots();
  };
}

/**
 * Manual one-time fetch fallback for admin appointment records and slots.
 */
export async function fetchAdminData(
  referenceDate = CLINIC_REFERENCE_TODAY
): Promise<{
  appointments: AdminAppointment[];
  slots: DemoAppointmentSlot[];
  summary: AdminDashboardSummary;
}> {
  try {
    const prefsCol = collection(db, PREFERENCES_COLLECTION);
    const slotsCol = collection(db, SLOTS_COLLECTION);

    const [prefsSnap, slotsSnap] = await Promise.all([
      getDocs(prefsCol),
      getDocs(slotsCol),
    ]);

    const rawMap = new Map<string, AdminAppointment>();
    prefsSnap.forEach((docSnap) => {
      const item = normalizeAppointmentRecord(docSnap.id, docSnap.data());
      rawMap.set(docSnap.id, item);
    });

    const appointments = sortAppointmentsChronologically(
      Array.from(rawMap.values()),
      'asc'
    );

    const slots: DemoAppointmentSlot[] = [];
    const houstonNow = getHoustonCurrentDateTime();
    slotsSnap.forEach((docSnap) => {
      const raw = docSnap.data() as any;
      const isExpired = isSlotOrAppointmentExpired(raw.date, raw.time, houstonNow);
      const status = isExpired && raw.status === 'available' ? 'expired' : raw.status;

      slots.push({
        id: docSnap.id,
        ...raw,
        status,
        isExpired,
      } as DemoAppointmentSlot);
    });

    const summary = computeDashboardSummary(appointments, slots, referenceDate);

    return {
      appointments,
      slots,
      summary,
    };
  } catch (err) {
    console.error('Error fetching admin appointments and slots:', err);
    throw new Error('Unable to load appointments right now. Please try again.');
  }
}

/**
 * Result returned by appointment administrative mutation actions
 */
export interface AdminAppointmentActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Cancel an existing appointment atomically using Firestore transaction.
 * Updates appointment status to 'cancelled', records audit info, and releases the slot if not expired.
 */
export async function cancelAppointment(
  appointmentId: string,
  adminEmail: string
): Promise<AdminAppointmentActionResult> {
  if (!appointmentId) {
    return {
      success: false,
      error: 'INVALID_ID',
      message: 'Invalid appointment ID provided.',
    };
  }

  try {
    const prefRef = doc(db, PREFERENCES_COLLECTION, appointmentId);

    let cancelledDate = '';
    let cancelledTime = '';
    let patientName = '';
    let patientPhone = '';
    let patientId: string | null = null;

    const result = await runTransaction(db, async (transaction) => {
      const prefSnap = await transaction.get(prefRef);

      if (!prefSnap.exists()) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }

      const prefData = prefSnap.data();
      const currentStatus = (prefData.status || '').toLowerCase();

      if (currentStatus === 'cancelled') {
        throw new Error('ALREADY_CANCELLED');
      }

      const rawDate = prefData.date || prefData.appointmentDate || '';
      const rawTime = prefData.time || prefData.appointmentTime || '';
      cancelledDate = rawDate;
      cancelledTime = rawTime;
      patientName = prefData.patientName || prefData.fullName || 'Valued Patient';
      patientPhone = prefData.patientPhone || prefData.phone || '';
      patientId = prefData.patientId || null;
      const houstonNow = getHoustonCurrentDateTime();
      const isExpired = isSlotOrAppointmentExpired(rawDate, rawTime, houstonNow);

      const slotId = prefData.slotId;
      let slotSnap = null;
      let slotRef = null;

      if (slotId) {
        slotRef = doc(db, SLOTS_COLLECTION, slotId);
        slotSnap = await transaction.get(slotRef);
      }

      const nowIso = new Date().toISOString();

      // 1. Update appointment preference record to status: 'cancelled'
      transaction.update(prefRef, {
        status: 'cancelled',
        cancelledAt: nowIso,
        cancelledBy: adminEmail || 'admin',
        updatedAt: nowIso,
      });

      // 2. Release corresponding slot ONLY if slot exists, is not expired, and is currently booked
      if (slotRef && slotSnap && slotSnap.exists()) {
        const slotData = slotSnap.data();
        const slotDate = slotData.date || rawDate;
        const slotTime = slotData.time || rawTime;
        const slotIsExpired = isSlotOrAppointmentExpired(slotDate, slotTime, houstonNow);

        // Only release back to 'available' if not expired and not disabled/unavailable
        if (!slotIsExpired && slotData.status === 'booked') {
          transaction.update(slotRef, {
            status: 'available',
            updatedAt: nowIso,
          });
        }
      }

      return { isExpired };
    });

    // Also release any continuation slots associated with this appointment
    if (cancelledDate && cancelledTime) {
      try {
        const qCont = query(
          collection(db, SLOTS_COLLECTION),
          where('date', '==', cancelledDate),
          where('parentSlotTime', '==', cancelledTime)
        );
        const contSnap = await getDocs(qCont);
        for (const cd of contSnap.docs) {
          const cData = cd.data();
          if (cData.status === 'booked') {
            await runTransaction(db, async (t) => {
              t.update(doc(db, SLOTS_COLLECTION, cd.id), {
                status: 'available',
                updatedAt: new Date().toISOString(),
              });
            });
          }
        }
      } catch {
        // Safe fallback
      }
    }

    // Phase 6B: Create cancellation notification record strictly AFTER transaction succeeds
    try {
      await createAppointmentCancellationNotification({
        appointmentId,
        patientId,
        patientName,
        phone: patientPhone,
        date: cancelledDate,
        time: cancelledTime,
      });
    } catch (notifErr) {
      console.warn('[Notifications] Non-blocking cancellation notification error:', notifErr);
    }

    // Phase 6C: Cancel pending reminder records so they are not sent later
    try {
      await cancelAppointmentReminders(appointmentId);
    } catch (cancelRemindErr) {
      console.warn('[Notifications] Non-blocking reminder cancellation error:', cancelRemindErr);
    }

    return {
      success: true,
      message: 'Appointment cancelled successfully.',
    };
  } catch (err: any) {
    console.error('Error cancelling appointment:', err);
    if (err?.message === 'ALREADY_CANCELLED') {
      return {
        success: false,
        error: 'ALREADY_CANCELLED',
        message: 'This appointment has already been cancelled.',
      };
    }
    if (err?.message === 'APPOINTMENT_NOT_FOUND') {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Appointment record not found in system.',
      };
    }
    if (
      err?.code === 'permission-denied' ||
      err?.message?.includes('permission') ||
      err?.message?.includes('insufficient')
    ) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: "You don't have permission to manage this appointment.",
      };
    }
    return {
      success: false,
      error: 'TRANSACTION_FAILED',
      message: 'Unable to cancel appointment right now. Please try again.',
    };
  }
}

/**
 * Reschedule an existing appointment atomically to a new slot using a Firestore transaction.
 * Verifies new slot is valid & available, releases old slot if not expired, and updates appointment record.
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newSlotId: string,
  adminEmail: string,
  explicitUrgentToNormalConfirmed = false
): Promise<AdminAppointmentActionResult> {
  if (!appointmentId || !newSlotId) {
    return {
      success: false,
      error: 'INVALID_PARAMETERS',
      message: 'Appointment and new slot ID are required.',
    };
  }

  try {
    const prefRef = doc(db, PREFERENCES_COLLECTION, appointmentId);
    const newSlotRef = doc(db, SLOTS_COLLECTION, newSlotId);

    let patientName = '';
    let patientPhone = '';
    let patientId: string | null = null;
    let rescheduledNewDate = '';
    let rescheduledNewTime = '';
    let rescheduledTimestamp = '';
    let origDate = '';
    let origTime = '';

    await runTransaction(db, async (transaction) => {
      const [prefSnap, newSlotSnap] = await Promise.all([
        transaction.get(prefRef),
        transaction.get(newSlotRef),
      ]);

      if (!prefSnap.exists()) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }
      if (!newSlotSnap.exists()) {
        throw new Error('SLOT_NOT_FOUND');
      }

      const prefData = prefSnap.data();
      const currentStatus = (prefData.status || '').toLowerCase();

      if (currentStatus === 'cancelled') {
        throw new Error('ALREADY_CANCELLED');
      }

      const houstonNow = getHoustonCurrentDateTime();

      // Check if original appointment has already passed
      origDate = prefData.date || prefData.appointmentDate || '';
      origTime = prefData.time || prefData.appointmentTime || '';
      if (isSlotOrAppointmentExpired(origDate, origTime, houstonNow)) {
        throw new Error('ORIGINAL_APPOINTMENT_EXPIRED');
      }

      const newSlotData = newSlotSnap.data();
      const newSlotDate = newSlotData.date;
      const newSlotTime = newSlotData.time;

      patientName = prefData.patientName || prefData.fullName || 'Valued Patient';
      patientPhone = prefData.patientPhone || prefData.phone || '';
      patientId = prefData.patientId || null;
      rescheduledNewDate = newSlotDate;
      rescheduledNewTime = newSlotTime;

      const config = await getClinicScheduleConfig();
      const reschedDuration =
        Number(prefData.durationMinutes || prefData.duration) ||
        resolveServiceDuration(prefData.reason || prefData.reasonForVisit, config) ||
        30;
      const reschedEndTime = computeEndTime(newSlotTime, reschedDuration);

      // 1. Check if new slot has expired
      if (isSlotOrAppointmentExpired(newSlotDate, newSlotTime, houstonNow)) {
        throw new Error('SLOT_EXPIRED');
      }

      // 2. Validate clinic operating hours and working days
      const hoursValidation = isAppointmentWithinClinicHours(newSlotDate, newSlotTime, reschedDuration, config);
      if (!hoursValidation.valid) {
        throw new Error('OUTSIDE_CLINIC_HOURS');
      }

      // 3. Check if new slot is currently available (prevent double-booking)
      if (newSlotData.status !== 'available') {
        throw new Error('SLOT_UNAVAILABLE');
      }

      // 4. Overlap check against active appointments on newSlotDate
      const newStartMin = parseTimeToMinutes(newSlotTime);
      const qPrefs = query(collection(db, PREFERENCES_COLLECTION), where('date', '==', newSlotDate));
      const activePrefsSnap = await getDocs(qPrefs);
      for (const d of activePrefsSnap.docs) {
        if (d.id === appointmentId) continue;
        const ap = d.data();
        const apStatus = (ap.status || '').toLowerCase();
        if (apStatus !== 'cancelled') {
          const apTime = ap.time || ap.appointmentTime || ap.startTime || '';
          if (apTime) {
            const apStart = parseTimeToMinutes(apTime);
            const apDur = Number(ap.durationMinutes || ap.duration) || resolveServiceDuration(ap.reason || ap.reasonForVisit, config) || 30;
            if (doTimeIntervalsOverlap(newStartMin, reschedDuration, apStart, apDur)) {
              throw new Error('SLOT_UNAVAILABLE');
            }
          }
        }
      }

      // 5. Check urgent slot compatibility
      const isCurrentlyUrgent =
        prefData.isUrgent ||
        prefData.type === 'urgent' ||
        prefData.appointmentType === 'urgent';
      const newSlotType = newSlotData.type || 'normal';

      if (isCurrentlyUrgent && newSlotType !== 'urgent' && !explicitUrgentToNormalConfirmed) {
        throw new Error('EXPLICIT_CONFIRMATION_REQUIRED_FOR_URGENT_CHANGE');
      }

      // 6. Identify continuation slots if multi-interval
      const stepInterval = config.slotIntervalMinutes || 30;
      const stepCount = Math.max(1, Math.ceil(reschedDuration / stepInterval));
      const continuationSlotRefs: { ref: any; time: string }[] = [];
      if (stepCount > 1) {
        const slotsCol = collection(db, SLOTS_COLLECTION);
        for (let i = 1; i < stepCount; i++) {
          const nextMin = newStartMin + i * stepInterval;
          const nextTimeStr = normalizeSlotTime(formatMinutesToTime(nextMin));
          const qNext = query(slotsCol, where('date', '==', newSlotDate), where('time', '==', nextTimeStr));
          const nextSnap = await getDocs(qNext);
          if (nextSnap.empty) {
            throw new Error('SLOT_UNAVAILABLE');
          }
          const nextDoc = nextSnap.docs[0];
          const nextData = nextDoc.data() as DemoAppointmentSlot;
          if (nextData.status !== 'available' || isSlotOrAppointmentExpired(newSlotDate, nextData.time, houstonNow)) {
            throw new Error('SLOT_UNAVAILABLE');
          }
          continuationSlotRefs.push({
            ref: doc(db, SLOTS_COLLECTION, nextDoc.id),
            time: nextTimeStr,
          });
        }
      }

      // 7. Fetch old slot to release if distinct from new slot
      const oldSlotId = prefData.slotId;
      let oldSlotRef = null;
      let oldSlotSnap = null;

      if (oldSlotId && oldSlotId !== newSlotId) {
        oldSlotRef = doc(db, SLOTS_COLLECTION, oldSlotId);
        oldSlotSnap = await transaction.get(oldSlotRef);
      }

      const nowIso = new Date().toISOString();
      rescheduledTimestamp = nowIso;

      // 5. Update appointment preference record
      const updatePayload: Record<string, any> = {
        slotId: newSlotId,
        date: newSlotDate,
        appointmentDate: newSlotDate,
        time: newSlotTime,
        appointmentTime: newSlotTime,
        startTime: newSlotTime,
        duration: reschedDuration,
        durationMinutes: reschedDuration,
        endTime: reschedEndTime,
        location: newSlotData.location || prefData.location || 'Greenspoint Location: 165 Greens Rd, Houston, TX 77060',
        status: 'booked',
        updatedAt: nowIso,
        rescheduledAt: nowIso,
        rescheduledBy: adminEmail || 'admin',
        previousSlotId: oldSlotId || null,
        previousDate: origDate,
        previousTime: origTime,
      };

      // If urgent appointment was downgraded to normal with explicit confirmation
      if (isCurrentlyUrgent && newSlotType === 'normal' && explicitUrgentToNormalConfirmed) {
        updatePayload.type = 'normal';
        updatePayload.appointmentType = 'normal';
        updatePayload.isUrgent = false;
      }

      transaction.update(prefRef, updatePayload);

      // 6. Book the new slot and continuation slots
      transaction.update(newSlotRef, {
        status: 'booked',
        duration: reschedDuration,
        durationMinutes: reschedDuration,
        startTime: newSlotTime,
        endTime: reschedEndTime,
        updatedAt: nowIso,
      });

      for (const cont of continuationSlotRefs) {
        transaction.update(cont.ref, {
          status: 'booked',
          duration: 30,
          durationMinutes: 30,
          parentSlotTime: newSlotTime,
          note: `Continuation of ${newSlotTime} (${prefData.reason || prefData.reasonForVisit || ''})`,
          updatedAt: nowIso,
        });
      }

      // 7. Release the old slot if it exists and is not expired
      if (oldSlotRef && oldSlotSnap && oldSlotSnap.exists()) {
        const oldSlotData = oldSlotSnap.data();
        const oldIsExpired = isSlotOrAppointmentExpired(
          oldSlotData.date || origDate,
          oldSlotData.time || origTime,
          houstonNow
        );
        if (!oldIsExpired && oldSlotData.status === 'booked') {
          transaction.update(oldSlotRef, {
            status: 'available',
            updatedAt: nowIso,
          });
        }
      }
    });

    // Also release any old continuation slots associated with the previous time
    if (origDate && origTime && (origDate !== rescheduledNewDate || origTime !== rescheduledNewTime)) {
      try {
        const qOldCont = query(
          collection(db, SLOTS_COLLECTION),
          where('date', '==', origDate),
          where('parentSlotTime', '==', origTime)
        );
        const oldContSnap = await getDocs(qOldCont);
        for (const cd of oldContSnap.docs) {
          if (cd.data().status === 'booked') {
            await runTransaction(db, async (t) => {
              t.update(doc(db, SLOTS_COLLECTION, cd.id), {
                status: 'available',
                updatedAt: new Date().toISOString(),
              });
            });
          }
        }
      } catch (oldContErr) {
        console.warn('Old continuation slot cleanup notice:', oldContErr);
      }
    }

    // Phase 6B: Create rescheduling notification record strictly AFTER transaction succeeds
    try {
      await createAppointmentRescheduledNotification({
        appointmentId,
        patientId,
        patientName,
        phone: patientPhone,
        newDate: rescheduledNewDate,
        newTime: rescheduledNewTime,
        rescheduledAt: rescheduledTimestamp || new Date().toISOString(),
      });
    } catch (notifErr) {
      console.warn('[Notifications] Non-blocking rescheduling notification error:', notifErr);
    }

    // Phase 6C: Update appointment reminder schedule to the new appointment date/time
    try {
      await updateAppointmentRemindersForReschedule({
        appointmentId,
        patientId,
        patientName,
        phone: patientPhone,
        newDate: rescheduledNewDate,
        newTime: rescheduledNewTime,
      });
    } catch (remindErr) {
      console.warn('[Notifications] Non-blocking reminder reschedule update error:', remindErr);
    }

    return {
      success: true,
      message: 'Appointment rescheduled successfully.',
    };
  } catch (err: any) {
    console.error('Error rescheduling appointment:', err);
    if (err?.message === 'SLOT_UNAVAILABLE' || err?.message === 'SLOT_NOT_FOUND') {
      return {
        success: false,
        error: 'SLOT_UNAVAILABLE',
        message: 'That time was just booked. Please choose another available slot.',
      };
    }
    if (err?.message === 'OUTSIDE_CLINIC_HOURS') {
      return {
        success: false,
        error: 'OUTSIDE_CLINIC_HOURS',
        message: 'Selected reschedule time falls outside clinic operating hours or on a day the clinic is closed.',
      };
    }
    if (err?.message === 'SLOT_EXPIRED') {
      return {
        success: false,
        error: 'SLOT_EXPIRED',
        message: 'This appointment time has already passed. Please select an upcoming available time.',
      };
    }
    if (err?.message === 'ORIGINAL_APPOINTMENT_EXPIRED') {
      return {
        success: false,
        error: 'ORIGINAL_APPOINTMENT_EXPIRED',
        message: 'This appointment has already passed and cannot be rescheduled.',
      };
    }
    if (err?.message === 'ALREADY_CANCELLED') {
      return {
        success: false,
        error: 'ALREADY_CANCELLED',
        message: 'This appointment has already been cancelled.',
      };
    }
    if (err?.message === 'EXPLICIT_CONFIRMATION_REQUIRED_FOR_URGENT_CHANGE') {
      return {
        success: false,
        error: 'URGENT_CONFIRMATION_NEEDED',
        message: 'Changing an urgent appointment to a routine slot requires explicit confirmation.',
      };
    }
    if (
      err?.code === 'permission-denied' ||
      err?.message?.includes('permission') ||
      err?.message?.includes('insufficient')
    ) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: "You don't have permission to manage this appointment.",
      };
    }
    return {
      success: false,
      error: 'TRANSACTION_FAILED',
      message: 'Unable to reschedule appointment right now. Please try again.',
    };
  }
}

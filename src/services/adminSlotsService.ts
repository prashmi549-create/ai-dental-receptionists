/**
 * Admin Slot Management Service
 * Dental Care & Implants of Houston
 *
 * Implements full lifecycle slot management for authorized administrators:
 * - Real-time slot listing and date-based filtering
 * - Strict validation against clinic operating hours and Houston, Texas timezone
 * - Sunday clinic-closed protection
 * - Duplicate slot prevention
 * - Editing of available future slots (time and type) with race-condition safety
 * - Soft-delete/disabling of available future slots (status: 'disabled')
 * - Protection of booked slots (direct edit/disable blocked; directs to rescheduling)
 * - Expired slot preservation for historical records
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DemoAppointmentSlot, SlotType, SlotStatus } from '../types';
import { CLINIC_INFO } from '../data/clinicData';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  parseTimeToMinutes,
  HoustonDateTime,
} from '../utils/clinicTime';
import { normalizeSlotTime } from './demoSlotsService';
import { computeEndTime } from './scheduleConfigService';

export const SLOTS_COLLECTION = 'demo_appointment_slots';
export const PREFERENCES_COLLECTION = 'demo_appointment_preferences';

export const CLINIC_LOCATION_STRING = `${CLINIC_INFO.locationName}: ${CLINIC_INFO.address}, ${CLINIC_INFO.cityStateZip}`;

/**
 * Standard clinic slot time intervals for easy selection
 */
export const STANDARD_WEEKDAY_TIME_SLOTS = [
  '08:00 AM',
  '08:30 AM',
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
  '05:30 PM',
  '06:00 PM',
  '06:30 PM',
];

export const STANDARD_SATURDAY_TIME_SLOTS = [
  '08:00 AM',
  '08:30 AM',
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
];

export interface ClinicDayInfo {
  dateStr: string;
  dayName: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isSunday: boolean;
  isOpen: boolean;
  hoursDescription: string;
  openMinutes: number;
  closeMinutes: number;
}

/**
 * Retrieves clinic operating schedule details for any given calendar date.
 */
export function getClinicDayInfo(dateStr: string): ClinicDayInfo {
  if (!dateStr || !dateStr.includes('-')) {
    return {
      dateStr,
      dayName: '',
      dayOfWeek: -1,
      isSunday: false,
      isOpen: false,
      hoursDescription: 'Invalid Date',
      openMinutes: 0,
      closeMinutes: 0,
    };
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay();

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayOfWeek] || '';

  if (dayOfWeek === 0) {
    // Sunday: Clinic closed
    return {
      dateStr,
      dayName,
      dayOfWeek,
      isSunday: true,
      isOpen: false,
      hoursDescription: 'Closed on Sunday',
      openMinutes: 0,
      closeMinutes: 0,
    };
  }

  if (dayOfWeek === 6) {
    // Saturday: 8:00 AM – 5:00 PM
    return {
      dateStr,
      dayName,
      dayOfWeek,
      isSunday: false,
      isOpen: true,
      hoursDescription: '8:00 AM – 5:00 PM',
      openMinutes: 8 * 60, // 480
      closeMinutes: 17 * 60, // 1020
    };
  }

  // Monday - Friday: 8:00 AM – 7:00 PM
  return {
    dateStr,
    dayName,
    dayOfWeek,
    isSunday: false,
    isOpen: true,
    hoursDescription: '8:00 AM – 7:00 PM',
    openMinutes: 8 * 60, // 480
    closeMinutes: 19 * 60, // 1140
  };
}

export interface SlotValidationResult {
  valid: boolean;
  error?: string;
  normalizedDate?: string;
  normalizedTime?: string;
}

/**
 * Validates date, time, operating hours, Sunday closure, and past-time restrictions.
 */
export function validateSlotParameters(
  dateStr: string,
  timeStr: string,
  currentHouston?: HoustonDateTime
): SlotValidationResult {
  const normalizedDate = dateStr?.trim();
  if (!normalizedDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return {
      valid: false,
      error: 'Please provide a valid date in YYYY-MM-DD format.',
    };
  }

  const normalizedTime = normalizeSlotTime(timeStr?.trim() || '');
  if (!normalizedTime || !/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(normalizedTime)) {
    return {
      valid: false,
      error: 'Please provide a valid time (e.g. 09:00 AM or 02:30 PM).',
    };
  }

  const dayInfo = getClinicDayInfo(normalizedDate);

  // 1. Sunday closure check
  if (dayInfo.isSunday) {
    return {
      valid: false,
      error: 'The clinic is closed on Sundays. Please select Monday through Saturday.',
    };
  }

  // 2. Operating hours check
  const timeMinutes = parseTimeToMinutes(normalizedTime);
  if (timeMinutes < dayInfo.openMinutes || timeMinutes >= dayInfo.closeMinutes) {
    return {
      valid: false,
      error: `Operating hours for ${dayInfo.dayName} are ${dayInfo.hoursDescription}. Slot must be within these hours.`,
    };
  }

  // 3. Past time check using Houston timezone
  const houstonNow = currentHouston || getHoustonCurrentDateTime();
  if (isSlotOrAppointmentExpired(normalizedDate, normalizedTime, houstonNow)) {
    return {
      valid: false,
      error: 'Cannot schedule an appointment slot in the past. Please select an upcoming date and time.',
    };
  }

  return {
    valid: true,
    normalizedDate,
    normalizedTime,
  };
}

export interface AdminSlotActionResult {
  success: boolean;
  slot?: DemoAppointmentSlot;
  error?: string;
  message?: string;
}

/**
 * Creates a new appointment slot with duplicate prevention, operating hours validation,
 * duration calculation, and Houston timezone checks.
 * Supports manual duration overrides (e.g. 30, 60, 90 min) creating consecutive manual blocks.
 */
export async function adminCreateSlot(
  data: {
    date: string;
    time: string;
    type: SlotType;
    duration?: number;
    endTime?: string;
    note?: string;
    location?: string;
  },
  adminEmail?: string
): Promise<AdminSlotActionResult> {
  const validation = validateSlotParameters(data.date, data.time);
  if (!validation.valid || !validation.normalizedDate || !validation.normalizedTime) {
    return {
      success: false,
      error: 'VALIDATION_FAILED',
      message: validation.error || 'Invalid slot parameters.',
    };
  }

  const { normalizedDate, normalizedTime } = validation;
  const slotType: SlotType = data.type === 'urgent' ? 'urgent' : 'normal';
  const location = data.location?.trim() || CLINIC_LOCATION_STRING;
  const requestedDuration = Number(data.duration) || 30;
  const note = data.note?.trim() || 'Manual override';

  try {
    const slotsCol = collection(db, SLOTS_COLLECTION);
    const dateQuery = query(slotsCol, where('date', '==', normalizedDate));
    const snap = await getDocs(dateQuery);

    // Calculate start time intervals to create based on requested duration
    // e.g. 60m at 9:00 AM creates 9:00 AM and 9:30 AM slots if missing
    const startMins = parseTimeToMinutes(normalizedTime);
    const stepCount = Math.max(1, Math.round(requestedDuration / 30));
    const intervalsToCreate: { time: string; duration: number; endTime: string }[] = [];

    for (let i = 0; i < stepCount; i++) {
      const curMins = startMins + i * 30;
      const { formatMinutesToTime } = await import('../utils/bookingConversationEngine');
      const timeStr = normalizeSlotTime(formatMinutesToTime(curMins));
      const endStr = formatMinutesToTime(curMins + 30);
      intervalsToCreate.push({
        time: timeStr,
        duration: 30,
        endTime: endStr,
      });
    }

    // Check duplicate for the primary start time
    const existingSlot = snap.docs.find((d) => {
      const s = d.data();
      return normalizeSlotTime(s.time || '').toLowerCase() === normalizedTime.toLowerCase();
    });

    if (existingSlot) {
      const existingData = existingSlot.data();
      const existingStatus = existingData.status;
      return {
        success: false,
        error: 'DUPLICATE_SLOT',
        message: `A slot for ${normalizedDate} at ${normalizedTime} already exists (Current status: ${existingStatus}).`,
      };
    }

    let primarySlot: DemoAppointmentSlot | null = null;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < intervalsToCreate.length; i++) {
      const interval = intervalsToCreate[i];
      // Check if sub-interval already exists
      const alreadyHasSub = snap.docs.some((d) => {
        const s = d.data();
        return normalizeSlotTime(s.time || '').toLowerCase() === interval.time.toLowerCase();
      });

      if (alreadyHasSub) continue;

      const cleanTime = interval.time.replace(/[^a-zA-Z0-9]/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const docId = `slot_${normalizedDate}_${cleanTime}_${randomSuffix}`;

      const newSlot: DemoAppointmentSlot = {
        id: docId,
        date: normalizedDate,
        time: interval.time,
        type: slotType,
        duration: 30,
        endTime: interval.endTime,
        source: 'manual',
        note,
        status: 'available',
        location,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, SLOTS_COLLECTION, docId), {
        ...newSlot,
        createdBy: adminEmail || 'admin',
      });

      if (i === 0) {
        primarySlot = newSlot;
      }
    }

    const totalEndTime = computeEndTime(normalizedTime, requestedDuration);

    return {
      success: true,
      slot: primarySlot || undefined,
      message: `Manual availability successfully opened for ${normalizedDate}: ${normalizedTime} – ${totalEndTime} (${requestedDuration}m, ${slotType.toUpperCase()}).`,
    };
  } catch (err: any) {
    console.error('Error creating slot in Firestore:', err);
    if (
      err?.code === 'permission-denied' ||
      err?.message?.includes('permission') ||
      err?.message?.includes('insufficient')
    ) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: "You don't have permission to create appointment slots.",
      };
    }
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: err?.message || 'Failed to create slot. Please check network and permissions.',
    };
  }
}

/**
 * Edits an AVAILABLE future slot (Time and Type).
 * Prevents editing booked slots (directs to rescheduling workflow).
 * Re-checks Firestore state to avoid race conditions.
 */
export async function adminEditSlot(
  slotId: string,
  updates: {
    time: string;
    type: SlotType;
  },
  adminEmail?: string
): Promise<AdminSlotActionResult> {
  if (!slotId) {
    return { success: false, error: 'INVALID_ID', message: 'Slot ID is required.' };
  }

  try {
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);
    let updatedSlot: DemoAppointmentSlot | null = null;

    await runTransaction(db, async (transaction) => {
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists()) {
        throw new Error('SLOT_NOT_FOUND');
      }

      const currentData = slotSnap.data() as DemoAppointmentSlot;
      const currentStatus = currentData.status;

      // 1. Strict protection against modifying booked slots
      if (currentStatus === 'booked') {
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      // 2. Check expired
      const houstonNow = getHoustonCurrentDateTime();
      if (isSlotOrAppointmentExpired(currentData.date, currentData.time, houstonNow)) {
        throw new Error('SLOT_EXPIRED');
      }

      // 3. Must be available
      if (currentStatus !== 'available') {
        throw new Error('SLOT_NOT_AVAILABLE');
      }

      // 4. Validate new time
      const validation = validateSlotParameters(currentData.date, updates.time, houstonNow);
      if (!validation.valid || !validation.normalizedTime) {
        const customErr = new Error('VALIDATION_FAILED');
        (customErr as any).validationMessage = validation.error;
        throw customErr;
      }

      const normalizedNewTime = validation.normalizedTime;

      // 5. Duplicate check if time is changing
      if (normalizeSlotTime(currentData.time).toLowerCase() !== normalizedNewTime.toLowerCase()) {
        // Query other slots on the same date
        const slotsCol = collection(db, SLOTS_COLLECTION);
        const dateQ = query(slotsCol, where('date', '==', currentData.date));
        const allOnDateSnap = await getDocs(dateQ);

        const hasDuplicate = allOnDateSnap.docs.some((d) => {
          if (d.id === slotId) return false;
          const sData = d.data();
          return normalizeSlotTime(sData.time || '').toLowerCase() === normalizedNewTime.toLowerCase();
        });

        if (hasDuplicate) {
          throw new Error('DUPLICATE_TIME');
        }
      }

      const nowIso = new Date().toISOString();
      const newType: SlotType = updates.type === 'urgent' ? 'urgent' : 'normal';

      transaction.update(slotRef, {
        time: normalizedNewTime,
        type: newType,
        updatedAt: nowIso,
        updatedBy: adminEmail || 'admin',
      });

      updatedSlot = {
        ...currentData,
        id: slotId,
        time: normalizedNewTime,
        type: newType,
        updatedAt: nowIso,
      };
    });

    return {
      success: true,
      slot: updatedSlot || undefined,
      message: 'Slot updated successfully.',
    };
  } catch (err: any) {
    console.error('Error editing slot:', err);
    if (err?.message === 'SLOT_ALREADY_BOOKED') {
      return {
        success: false,
        error: 'SLOT_ALREADY_BOOKED',
        message: 'This slot is already booked. Use the appointment rescheduling workflow to move the appointment.',
      };
    }
    if (err?.message === 'SLOT_EXPIRED') {
      return {
        success: false,
        error: 'SLOT_EXPIRED',
        message: 'Cannot edit past expired appointment slots.',
      };
    }
    if (err?.message === 'SLOT_NOT_AVAILABLE') {
      return {
        success: false,
        error: 'SLOT_NOT_AVAILABLE',
        message: 'Only available future slots can be edited.',
      };
    }
    if (err?.message === 'DUPLICATE_TIME') {
      return {
        success: false,
        error: 'DUPLICATE_TIME',
        message: 'Another slot is already scheduled for this date and time.',
      };
    }
    if (err?.message === 'SLOT_NOT_FOUND') {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested appointment slot was not found.',
      };
    }
    if (err?.validationMessage) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: err.validationMessage,
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
        message: "You don't have permission to modify appointment slots.",
      };
    }
    return {
      success: false,
      error: 'UPDATE_FAILED',
      message: err?.message || 'Failed to update slot.',
    };
  }
}

/**
 * Disables an AVAILABLE future slot (status: 'disabled').
 * Soft-delete implementation: preserves the document and audit trail,
 * while preventing receptionist patients from seeing or booking it.
 */
export async function adminDisableSlot(
  slotId: string,
  adminEmail?: string
): Promise<AdminSlotActionResult> {
  if (!slotId) {
    return { success: false, error: 'INVALID_ID', message: 'Slot ID is required.' };
  }

  try {
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);

    await runTransaction(db, async (transaction) => {
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists()) {
        throw new Error('SLOT_NOT_FOUND');
      }

      const currentData = slotSnap.data() as DemoAppointmentSlot;

      // 1. Cannot disable booked slots directly
      if (currentData.status === 'booked') {
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      // 2. Cannot disable expired past slots
      const houstonNow = getHoustonCurrentDateTime();
      if (isSlotOrAppointmentExpired(currentData.date, currentData.time, houstonNow)) {
        throw new Error('SLOT_EXPIRED');
      }

      // 3. Must currently be available
      if (currentData.status !== 'available') {
        throw new Error('SLOT_NOT_AVAILABLE');
      }

      const nowIso = new Date().toISOString();
      transaction.update(slotRef, {
        status: 'disabled',
        disabledAt: nowIso,
        disabledBy: adminEmail || 'admin',
        updatedAt: nowIso,
      });
    });

    return {
      success: true,
      message: 'Slot successfully disabled. Patients will no longer be able to book it.',
    };
  } catch (err: any) {
    console.error('Error disabling slot:', err);
    if (err?.message === 'SLOT_ALREADY_BOOKED') {
      return {
        success: false,
        error: 'SLOT_ALREADY_BOOKED',
        message: 'This slot is already booked and cannot be disabled. Use the appointment cancellation or rescheduling workflow.',
      };
    }
    if (err?.message === 'SLOT_EXPIRED') {
      return {
        success: false,
        error: 'SLOT_EXPIRED',
        message: 'Cannot disable a past slot that has already expired.',
      };
    }
    if (err?.message === 'SLOT_NOT_AVAILABLE') {
      return {
        success: false,
        error: 'SLOT_NOT_AVAILABLE',
        message: 'Only currently available slots can be disabled.',
      };
    }
    if (err?.message === 'SLOT_NOT_FOUND') {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Appointment slot not found.',
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
        message: "You don't have permission to disable appointment slots.",
      };
    }
    return {
      success: false,
      error: 'DISABLE_FAILED',
      message: err?.message || 'Failed to disable slot.',
    };
  }
}

/**
 * Re-enables a disabled future slot back to 'available'.
 */
export async function adminEnableSlot(
  slotId: string,
  adminEmail?: string
): Promise<AdminSlotActionResult> {
  if (!slotId) {
    return { success: false, error: 'INVALID_ID', message: 'Slot ID is required.' };
  }

  try {
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);

    await runTransaction(db, async (transaction) => {
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists()) {
        throw new Error('SLOT_NOT_FOUND');
      }

      const currentData = slotSnap.data() as DemoAppointmentSlot;

      if (currentData.status !== 'disabled') {
        throw new Error('SLOT_NOT_DISABLED');
      }

      // Check if expired
      const houstonNow = getHoustonCurrentDateTime();
      if (isSlotOrAppointmentExpired(currentData.date, currentData.time, houstonNow)) {
        throw new Error('SLOT_EXPIRED');
      }

      // Check operating hours & Sunday
      const validation = validateSlotParameters(currentData.date, currentData.time, houstonNow);
      if (!validation.valid) {
        const err = new Error('VALIDATION_FAILED');
        (err as any).validationMessage = validation.error;
        throw err;
      }

      const nowIso = new Date().toISOString();
      transaction.update(slotRef, {
        status: 'available',
        reEnabledAt: nowIso,
        reEnabledBy: adminEmail || 'admin',
        updatedAt: nowIso,
      });
    });

    return {
      success: true,
      message: 'Slot re-enabled and now available for patient booking.',
    };
  } catch (err: any) {
    console.error('Error re-enabling slot:', err);
    if (err?.message === 'SLOT_NOT_DISABLED') {
      return {
        success: false,
        error: 'NOT_DISABLED',
        message: 'This slot is not currently disabled.',
      };
    }
    if (err?.message === 'SLOT_EXPIRED') {
      return {
        success: false,
        error: 'SLOT_EXPIRED',
        message: 'Cannot re-enable a past expired slot.',
      };
    }
    if (err?.validationMessage) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: err.validationMessage,
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
        message: "You don't have permission to re-enable appointment slots.",
      };
    }
    return {
      success: false,
      error: 'ENABLE_FAILED',
      message: err?.message || 'Failed to re-enable slot.',
    };
  }
}

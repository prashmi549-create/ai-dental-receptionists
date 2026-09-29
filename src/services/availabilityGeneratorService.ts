/**
 * Automatic Availability Generator Service
 * Dental Care & Implants of Houston
 *
 * Implements intelligent, idempotent maintenance of rolling 30-day availability:
 * - Generates only MISSING future availability
 * - Respects existing booked appointments (never overwrites)
 * - Respects manually disabled slots (never recreates or enables disabled slots)
 * - Never creates duplicate records
 * - Never deletes or modifies historical appointments
 * - Uses Houston local timezone
 * - Configurable clinic hours (Mon-Fri 8am-7pm, Sat 8am-5pm, Sun closed)
 * - Distributes urgent availability on operating days
 * - Marks source as 'automatic'
 * - Fast batch Firestore writing
 * - Safe for concurrent execution / repeated triggers
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  DemoAppointmentSlot,
  AvailabilityGenerationSummary,
  ClinicScheduleConfig,
} from '../types';
import { CLINIC_LOCATION_STRING } from './adminSlotsService';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  parseTimeToMinutes,
  HoustonDateTime,
} from '../utils/clinicTime';
import {
  formatMinutesToTime,
  isSundayDate,
} from '../utils/bookingConversationEngine';
import { normalizeSlotTime } from './demoSlotsService';
import {
  getClinicScheduleConfig,
  DEFAULT_CLINIC_SCHEDULE_CONFIG,
  isClinicClosedOnDate,
} from './scheduleConfigService';

export const SLOTS_COLLECTION = 'demo_appointment_slots';

/**
 * Strips undefined properties so Firestore writeBatch/setDoc operations never fail.
 */
function cleanFirestoreObject<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean as T;
}

// Throttle automatic background generator to avoid duplicate calls in tight loops
let isGenerating = false;
let lastGenerationCompletedAt = 0;
const GENERATOR_DEBOUNCE_MS = 10 * 1000; // 10 seconds

/**
 * Calculates calendar date strings from Houston today to today + daysAhead
 */
export function getRollingDateRange(daysAhead = 30, baseDateStr?: string): string[] {
  const houstonNow = getHoustonCurrentDateTime();
  const startStr = baseDateStr || houstonNow.dateStr;
  const [y, m, d] = startStr.split('-').map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const dates: string[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const target = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const yr = target.getUTCFullYear();
    const mo = String(target.getUTCMonth() + 1).padStart(2, '0');
    const da = String(target.getUTCDate()).padStart(2, '0');
    dates.push(`${yr}-${mo}-${da}`);
  }
  return dates;
}

/**
 * Generates expected start-time intervals for a given date based on clinic schedule config
 */
export function getExpectedTimeSlotsForDate(
  dateStr: string,
  config: ClinicScheduleConfig
): { time: string; type: 'normal' | 'urgent' }[] {
  // Check if clinic is closed on this date (working days or Sunday closed)
  const closedCheck = isClinicClosedOnDate(dateStr, config);
  if (closedCheck.isClosed) {
    return [];
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 1..5 = Mon..Fri, 6 = Saturday

  let openMinutes = 8 * 60; // 480
  let closeMinutes = 19 * 60; // 1140 (7:00 PM)

  if (dayOfWeek === 6) {
    // Saturday
    openMinutes = parseTimeToMinutes(config.saturdayOpen) || 8 * 60;
    closeMinutes = parseTimeToMinutes(config.saturdayClose) || 17 * 60;
  } else if (dayOfWeek === 0 && config.sundayOpen) {
    openMinutes = parseTimeToMinutes(config.sundayOpenTime || config.sundayOpeningTime || '09:00 AM') || 9 * 60;
    closeMinutes = parseTimeToMinutes(config.sundayCloseTime || config.sundayClosingTime || '02:00 PM') || 14 * 60;
  } else {
    // Mon - Fri
    openMinutes = parseTimeToMinutes(config.weekdayOpen) || 8 * 60;
    closeMinutes = parseTimeToMinutes(config.weekdayClose) || 19 * 60;
  }

  const interval = config.slotIntervalMinutes || 30;
  const urgentTimes = (config.urgentSlotTimes || ['08:00 AM', '01:30 PM']).map((t) =>
    normalizeSlotTime(t).toLowerCase()
  );

  const result: { time: string; type: 'normal' | 'urgent' }[] = [];
  for (let mins = openMinutes; mins < closeMinutes; mins += interval) {
    const formatted = formatMinutesToTime(mins);
    const normalized = normalizeSlotTime(formatted);
    const isUrgent = urgentTimes.includes(normalized.toLowerCase());
    result.push({
      time: normalized,
      type: isUrgent ? 'urgent' : 'normal',
    });
  }

  return result;
}

/**
 * Generate missing availability for the rolling 30-day window.
 * Strictly idempotent:
 * - Checks existing Firestore slots by date
 * - If a slot exists (available, booked, or disabled) -> PRESERVED
 * - Creates only truly missing slots
 * - Never generates expired times for today
 * - Never generates Sunday slots when clinic is closed
 */
export async function generateMissingAvailability(options?: {
  windowDays?: number;
  adminEmail?: string;
  force?: boolean;
}): Promise<AvailabilityGenerationSummary> {
  const now = Date.now();
  if (isGenerating) {
    // Return cached / in-progress confirmation
    const config = await getClinicScheduleConfig();
    const dates = getRollingDateRange(options?.windowDays || config.availabilityWindowDays);
    return {
      daysChecked: dates.length,
      slotsCreated: 0,
      existingPreserved: 0,
      maintainedThrough: dates[dates.length - 1] || '',
      windowDays: dates.length,
      timestamp: new Date().toISOString(),
    };
  }

  if (!options?.force && now - lastGenerationCompletedAt < GENERATOR_DEBOUNCE_MS) {
    const config = await getClinicScheduleConfig();
    const dates = getRollingDateRange(options?.windowDays || config.availabilityWindowDays);
    return {
      daysChecked: dates.length,
      slotsCreated: 0,
      existingPreserved: 0,
      maintainedThrough: dates[dates.length - 1] || '',
      windowDays: dates.length,
      timestamp: new Date().toISOString(),
    };
  }

  isGenerating = true;

  try {
    const config = await getClinicScheduleConfig();
    const windowDays = options?.windowDays || config.availabilityWindowDays || 30;
    const houstonNow = getHoustonCurrentDateTime();
    const rollingDates = getRollingDateRange(windowDays, houstonNow.dateStr);

    let totalSlotsCreated = 0;
    let totalExistingPreserved = 0;

    // Process dates in chunks to be respectful of Firestore connection and limits
    const slotsCol = collection(db, SLOTS_COLLECTION);

    // Fetch all existing slots across the target date range
    // To handle up to 30 days, we can query in date batches
    const existingSlotsMap = new Map<string, DemoAppointmentSlot>(); // Key: `${date}_${normalizeSlotTime(time).toLowerCase()}`

    // Fetch existing slots
    const allSlotsSnap = await getDocs(slotsCol);
    for (const d of allSlotsSnap.docs) {
      const data = d.data() as DemoAppointmentSlot;
      if (data.date && data.time) {
        const key = `${data.date}_${normalizeSlotTime(data.time).toLowerCase()}`;
        existingSlotsMap.set(key, { ...data, id: d.id });
      }
    }

    // Fetch active booked appointments to strictly prevent overlapping slots
    const prefsCol = collection(db, 'demo_appointment_preferences');
    const allPrefsSnap = await getDocs(prefsCol);
    const activeBookedIntervals: { date: string; startMin: number; endMin: number }[] = [];
    for (const pd of allPrefsSnap.docs) {
      const pData = pd.data();
      if (pData.status !== 'Cancelled' && (pData.date || pData.appointmentDate)) {
        const timeStr = pData.time || pData.appointmentTime || pData.startTime || '';
        const dDate = pData.date || pData.appointmentDate;
        if (timeStr && dDate) {
          const sMin = parseTimeToMinutes(timeStr);
          const dMin = Number(pData.durationMinutes || pData.duration) || 30;
          activeBookedIntervals.push({
            date: dDate,
            startMin: sMin,
            endMin: sMin + dMin,
          });
        }
      }
    }

    const slotsToCreate: DemoAppointmentSlot[] = [];
    const nowIso = new Date().toISOString();

    for (const dateStr of rollingDates) {
      // Check if clinic is closed on this date (working days or Sunday closed)
      if (isClinicClosedOnDate(dateStr, config).isClosed) {
        continue;
      }

      const expectedSlots = getExpectedTimeSlotsForDate(dateStr, config);

      for (const expected of expectedSlots) {
        const key = `${dateStr}_${expected.time.toLowerCase()}`;

        if (existingSlotsMap.has(key)) {
          // Slot already exists!
          // PRESERVE IT COMPLETELY:
          // If it was booked: keep it booked!
          // If it was disabled: keep it disabled! (Do NOT recreate or enable)
          // If it was available: keep it available!
          totalExistingPreserved++;
          continue;
        }

        // Do not generate times that are already expired in Houston time today
        if (isSlotOrAppointmentExpired(dateStr, expected.time, houstonNow)) {
          continue;
        }

        // Check if an existing active booked appointment overlaps this slot's interval
        const expectedStartMin = parseTimeToMinutes(expected.time);
        const slotInterval = config.slotIntervalMinutes || 30;
        const expectedEndMin = expectedStartMin + slotInterval;
        const overlapsActiveBooking = activeBookedIntervals.some(
          (b) => b.date === dateStr && Math.max(expectedStartMin, b.startMin) < Math.min(expectedEndMin, b.endMin)
        );

        // Slot is missing! Prepare new automatic slot document
        const cleanTime = expected.time.replace(/[^a-zA-Z0-9]/g, '');
        const docId = `slot_${dateStr}_${cleanTime}_auto`;
        const endTimeStr = formatMinutesToTime(expectedEndMin);

        const newSlot: DemoAppointmentSlot = {
          id: docId,
          date: dateStr,
          time: expected.time,
          startTime: expected.time,
          endTime: endTimeStr,
          status: overlapsActiveBooking ? 'booked' : 'available',
          type: expected.type,
          duration: slotInterval,
          durationMinutes: slotInterval,
          source: 'automatic',
          location: CLINIC_LOCATION_STRING,
          ...(overlapsActiveBooking ? { note: 'Reserved for existing appointment' } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        slotsToCreate.push(newSlot);
        existingSlotsMap.set(key, newSlot); // prevent internal duplicate
      }
    }

    // Commit missing slots in Firestore batches of up to 400
    if (slotsToCreate.length > 0) {
      const BATCH_SIZE = 400;
      for (let i = 0; i < slotsToCreate.length; i += BATCH_SIZE) {
        const chunk = slotsToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const slot of chunk) {
          const slotRef = doc(db, SLOTS_COLLECTION, slot.id);
          batch.set(slotRef, cleanFirestoreObject(slot));
        }
        await batch.commit();
      }
      totalSlotsCreated = slotsToCreate.length;
    }

    lastGenerationCompletedAt = Date.now();

    const maintainedThrough = rollingDates[rollingDates.length - 1] || houstonNow.dateStr;

    return {
      daysChecked: rollingDates.length,
      slotsCreated: totalSlotsCreated,
      existingPreserved: totalExistingPreserved,
      maintainedThrough,
      windowDays: rollingDates.length,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error generating missing availability:', err);
    throw err;
  } finally {
    isGenerating = false;
  }
}

/**
 * Ensures that a specific single date within the clinic's operating calendar
 * has all missing availability slots generated in Firestore without duplicating.
 * Preserves booked, disabled, and manually created slots.
 */
export async function generateMissingAvailabilityForDate(
  dateStr: string
): Promise<DemoAppointmentSlot[]> {
  try {
    const config = await getClinicScheduleConfig();
    const houstonNow = getHoustonCurrentDateTime();

    // Closed on this date (working days or Sunday closed)
    if (isClinicClosedOnDate(dateStr, config).isClosed) {
      return [];
    }

    const slotsCol = collection(db, SLOTS_COLLECTION);
    const dateQuery = query(slotsCol, where('date', '==', dateStr));
    const snap = await getDocs(dateQuery);

    const existingSlotsMap = new Map<string, DemoAppointmentSlot>();
    const existingSlots: DemoAppointmentSlot[] = [];

    snap.forEach((d) => {
      const data = d.data() as DemoAppointmentSlot;
      const normalized = normalizeSlotTime(data.time).toLowerCase();
      existingSlotsMap.set(normalized, { ...data, id: d.id });
      existingSlots.push({ ...data, id: d.id });
    });

    const expectedSlots = getExpectedTimeSlotsForDate(dateStr, config);
    const slotsToCreate: DemoAppointmentSlot[] = [];
    const nowIso = new Date().toISOString();

    // Check active booked appointments on this date
    const prefsCol = collection(db, 'demo_appointment_preferences');
    const prefsQuery = query(prefsCol, where('date', '==', dateStr));
    const prefsSnap = await getDocs(prefsQuery);
    const activeBookedIntervals: { startMin: number; endMin: number }[] = [];

    prefsSnap.forEach((pd) => {
      const pData = pd.data();
      if (pData.status !== 'Cancelled') {
        const timeStr = pData.time || pData.appointmentTime || pData.startTime || '';
        if (timeStr) {
          const sMin = parseTimeToMinutes(timeStr);
          const dMin = Number(pData.durationMinutes || pData.duration) || 30;
          activeBookedIntervals.push({ startMin: sMin, endMin: sMin + dMin });
        }
      }
    });

    for (const expected of expectedSlots) {
      const normalizedTime = expected.time.toLowerCase();
      if (existingSlotsMap.has(normalizedTime)) {
        continue; // Preserved existing (booked, disabled, manual, or available)
      }

      if (isSlotOrAppointmentExpired(dateStr, expected.time, houstonNow)) {
        continue;
      }

      const expectedStartMin = parseTimeToMinutes(expected.time);
      const slotInterval = config.slotIntervalMinutes || 30;
      const expectedEndMin = expectedStartMin + slotInterval;
      const overlapsActiveBooking = activeBookedIntervals.some(
        (b) => Math.max(expectedStartMin, b.startMin) < Math.min(expectedEndMin, b.endMin)
      );

      const cleanTime = expected.time.replace(/[^a-zA-Z0-9]/g, '');
      const docId = `slot_${dateStr}_${cleanTime}_auto`;
      const endTimeStr = formatMinutesToTime(expectedEndMin);

      const newSlot: DemoAppointmentSlot = {
        id: docId,
        date: dateStr,
        time: expected.time,
        startTime: expected.time,
        endTime: endTimeStr,
        status: overlapsActiveBooking ? 'booked' : 'available',
        type: expected.type,
        duration: slotInterval,
        durationMinutes: slotInterval,
        source: 'automatic',
        location: CLINIC_LOCATION_STRING,
        ...(overlapsActiveBooking ? { note: 'Reserved for existing appointment' } : {}),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      slotsToCreate.push(newSlot);
      existingSlots.push(newSlot);
    }

    if (slotsToCreate.length > 0) {
      const batch = writeBatch(db);
      for (const slot of slotsToCreate) {
        const slotRef = doc(db, SLOTS_COLLECTION, slot.id);
        batch.set(slotRef, cleanFirestoreObject(slot));
      }
      await batch.commit();
    }

    return existingSlots;
  } catch (err) {
    console.error(`Error generating availability for date ${dateStr}:`, err);
    return [];
  }
}

/**
 * Ensures rolling 30-day future availability is maintained.
 * Throttled to avoid repeatedly running on every user keystroke or page load.
 */
export async function ensureRollingAvailability(options?: {
  force?: boolean;
}): Promise<AvailabilityGenerationSummary | null> {
  const SESSION_KEY = 'ai_dental_last_availability_gen';
  const now = Date.now();
  if (!options?.force) {
    const lastSession = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
    if (lastSession) {
      const lastTs = parseInt(lastSession, 10);
      if (!isNaN(lastTs) && now - lastTs < 15 * 60 * 1000) {
        // Maintained within last 15 minutes
        return null;
      }
    }
  }

  try {
    const summary = await generateMissingAvailability({ force: options?.force });
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, String(now));
    }
    return summary;
  } catch (err) {
    console.warn('Failed background rolling availability generation:', err);
    return null;
  }
}


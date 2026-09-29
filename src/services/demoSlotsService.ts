import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DemoAppointmentSlot, DemoAppointmentPreference, SlotType, SlotStatus } from '../types';
import { CLINIC_INFO } from '../data/clinicData';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
} from '../utils/clinicTime';
import {
  resolveServiceDuration,
  computeEndTime,
  doTimeIntervalsOverlap,
  getClinicScheduleConfig,
  isClinicClosedOnDate,
  isAppointmentWithinClinicHours,
} from './scheduleConfigService';

export {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  resolveServiceDuration,
  computeEndTime,
  doTimeIntervalsOverlap,
  getClinicScheduleConfig,
  isClinicClosedOnDate,
  isAppointmentWithinClinicHours,
};
import { isSundayDate, formatDatePretty, formatMinutesToTime } from '../utils/bookingConversationEngine';

export const SLOTS_COLLECTION = 'demo_appointment_slots';
export const PREFERENCES_COLLECTION = 'demo_appointment_preferences';

const CLINIC_LOCATION_STRING = `${CLINIC_INFO.locationName}: ${CLINIC_INFO.address}, ${CLINIC_INFO.cityStateZip}`;

export const INITIAL_DEMO_SLOTS: Omit<DemoAppointmentSlot, 'createdAt' | 'updatedAt'>[] = [
  // Date: 2026-09-11 (Friday - Today)
  {
    id: 'slot_2026-09-11_0830AM_urg',
    date: '2026-09-11',
    time: '08:30 AM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0900AM',
    date: '2026-09-11',
    time: '09:00 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_1000AM',
    date: '2026-09-11',
    time: '10:00 AM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_1100AM',
    date: '2026-09-11',
    time: '11:00 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_1200PM',
    date: '2026-09-11',
    time: '12:00 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0100PM',
    date: '2026-09-11',
    time: '01:00 PM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0130PM_urg',
    date: '2026-09-11',
    time: '01:30 PM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0200PM',
    date: '2026-09-11',
    time: '02:00 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0300PM',
    date: '2026-09-11',
    time: '03:00 PM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-11_0400PM',
    date: '2026-09-11',
    time: '04:00 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },

  // Date: 2026-09-12 (Saturday - Tomorrow)
  {
    id: 'slot_2026-09-12_0830AM_urg',
    date: '2026-09-12',
    time: '08:30 AM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_0900AM',
    date: '2026-09-12',
    time: '09:00 AM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_1000AM',
    date: '2026-09-12',
    time: '10:00 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_1100AM',
    date: '2026-09-12',
    time: '11:00 AM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_0100PM',
    date: '2026-09-12',
    time: '01:00 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_0200PM',
    date: '2026-09-12',
    time: '02:00 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_0230PM_urg',
    date: '2026-09-12',
    time: '02:30 PM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-12_0300PM',
    date: '2026-09-12',
    time: '03:00 PM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },

  // Date: 2026-09-14 (Monday - Next Business Day)
  {
    id: 'slot_2026-09-14_0800AM_urg',
    date: '2026-09-14',
    time: '08:00 AM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0830AM',
    date: '2026-09-14',
    time: '08:30 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0930AM',
    date: '2026-09-14',
    time: '09:30 AM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_1000AM',
    date: '2026-09-14',
    time: '10:00 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_1030AM',
    date: '2026-09-14',
    time: '10:30 AM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0130PM',
    date: '2026-09-14',
    time: '01:30 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0200PM_urg',
    date: '2026-09-14',
    time: '02:00 PM',
    status: 'available',
    type: 'urgent',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0300PM',
    date: '2026-09-14',
    time: '03:00 PM',
    status: 'booked',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
  {
    id: 'slot_2026-09-14_0430PM',
    date: '2026-09-14',
    time: '04:30 PM',
    status: 'available',
    type: 'normal',
    location: CLINIC_LOCATION_STRING,
  },
];

/**
 * Seed initial demo appointment slots into Firestore if none exist or if forced.
 * Also upgrades existing legacy Firestore databases by ensuring type: 'normal' and adding urgent slots if missing.
 */
export async function seedDemoAppointmentSlots(force: boolean = false): Promise<DemoAppointmentSlot[]> {
  const slotsCol = collection(db, SLOTS_COLLECTION);
  const existingSnap = await getDocs(slotsCol);

  if (!force && !existingSnap.empty) {
    const existingSlots = existingSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as DemoAppointmentSlot)
    );

    // If existing slots lack urgent slots, upgrade the database with urgent slots and normalize legacy slots
    const hasUrgent = existingSlots.some((s) => s.type === 'urgent');
    if (!hasUrgent) {
      try {
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();
        for (const d of existingSnap.docs) {
          const data = d.data();
          if (!data.type) {
            batch.update(d.ref, { type: 'normal', updatedAt: nowIso });
          }
        }
        const urgentInitial = INITIAL_DEMO_SLOTS.filter((s) => s.type === 'urgent');
        for (const slot of urgentInitial) {
          const slotDocRef = doc(db, SLOTS_COLLECTION, slot.id);
          batch.set(slotDocRef, { ...slot, createdAt: nowIso, updatedAt: nowIso }, { merge: true });
        }
        await batch.commit();

        const refreshedSnap = await getDocs(slotsCol);
        return refreshedSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DemoAppointmentSlot));
      } catch (e) {
        console.warn('Could not auto-upgrade legacy slots with urgent slots:', e);
      }
    }

    return existingSlots;
  }

  const batch = writeBatch(db);
  const nowIso = new Date().toISOString();
  const seededSlots: DemoAppointmentSlot[] = [];

  for (const slot of INITIAL_DEMO_SLOTS) {
    const slotDocRef = doc(db, SLOTS_COLLECTION, slot.id);
    const slotData: DemoAppointmentSlot = {
      ...slot,
      type: slot.type || 'normal',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    batch.set(slotDocRef, slotData, { merge: true });
    seededSlots.push(slotData);
  }

  await batch.commit();
  return seededSlots;
}

function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/**
 * Fetch demo appointment slots from Firestore, auto-seeding if empty.
 * Supports filtering by date and slot type ('normal' | 'urgent').
 */
export async function getDemoAppointmentSlots(
  dateFilter?: string,
  typeFilter?: 'normal' | 'urgent'
): Promise<DemoAppointmentSlot[]> {
  try {
    const slotsCol = collection(db, SLOTS_COLLECTION);
    const q = dateFilter
      ? query(slotsCol, where('date', '==', dateFilter))
      : query(slotsCol);

    const snapshot = await getDocs(q);

    let slots: DemoAppointmentSlot[] = [];
    const houstonNow = getHoustonCurrentDateTime();

    if (snapshot.empty) {
      if (dateFilter) {
        if (isSundayDate(dateFilter)) {
          slots = [];
        } else {
          // Automatically generate missing availability for this date
          const { generateMissingAvailabilityForDate } = await import('./availabilityGeneratorService');
          slots = await generateMissingAvailabilityForDate(dateFilter);
          if (slots.length === 0) {
            const allSnap = await getDocs(slotsCol);
            if (allSnap.empty) {
              const seeded = await seedDemoAppointmentSlots();
              slots = seeded.filter((s) => s.date === dateFilter);
            }
          }
        }
      } else {
        const { generateMissingAvailability } = await import('./availabilityGeneratorService');
        await generateMissingAvailability();
        const refetch = await getDocs(slotsCol);
        if (refetch.empty) {
          slots = await seedDemoAppointmentSlots();
        } else {
          refetch.forEach((docSnap) => {
            const d = docSnap.data();
            slots.push({
              id: docSnap.id,
              date: d.date,
              time: d.time,
              status: d.status,
              location: d.location,
              type: d.type || 'normal',
              duration: d.duration || d.durationMinutes || 30,
              durationMinutes: d.durationMinutes || d.duration || 30,
              startTime: d.startTime || d.time,
              endTime: d.endTime,
              source: d.source,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            } as DemoAppointmentSlot);
          });
        }
      }
      slots = slots.map((s) => {
        const isExpired = isSlotOrAppointmentExpired(s.date, s.time, houstonNow);
        const status: SlotStatus = isExpired && s.status === 'available' ? 'expired' : s.status;
        return {
          ...s,
          status,
          isExpired,
        };
      });
    } else {
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const isExpired = isSlotOrAppointmentExpired(d.date, d.time, houstonNow);
        const status: SlotStatus = isExpired && d.status === 'available' ? 'expired' : d.status;
        slots.push({
          id: docSnap.id,
          date: d.date,
          time: d.time,
          status,
          location: d.location,
          type: d.type || 'normal',
          duration: d.duration || d.durationMinutes || 30,
          durationMinutes: d.durationMinutes || d.duration || 30,
          startTime: d.startTime || d.time,
          endTime: d.endTime,
          source: d.source,
          note: d.note,
          reason: d.reason,
          patientName: d.patientName,
          patientPhone: d.patientPhone,
          patientType: d.patientType,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          isExpired,
        } as DemoAppointmentSlot);
      });
    }

    // Apply type filter if provided
    if (typeFilter === 'urgent') {
      slots = slots.filter((s) => s.type === 'urgent');
    } else if (typeFilter === 'normal') {
      slots = slots.filter((s) => (s.type || 'normal') === 'normal');
    }

    slots.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

    return slots;
  } catch (error) {
    console.error('Error fetching demo appointment slots from Firestore:', error);
    throw error;
  }
}

let hasEnsuredUrgentSlots = false;

/**
 * Ensures that urgent priority slots exist in Firestore.
 * If an existing database only has legacy normal slots, this seeds the reserved urgent slots.
 */
export async function ensureUrgentSlotsSeeded(): Promise<void> {
  if (hasEnsuredUrgentSlots) return;
  try {
    const slotsCol = collection(db, SLOTS_COLLECTION);
    const urgentQ = query(slotsCol, where('type', '==', 'urgent'));
    const urgentSnap = await getDocs(urgentQ);
    if (urgentSnap.empty) {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      const urgentInitial = INITIAL_DEMO_SLOTS.filter((s) => s.type === 'urgent');
      for (const slot of urgentInitial) {
        const slotDocRef = doc(db, SLOTS_COLLECTION, slot.id);
        batch.set(slotDocRef, { ...slot, createdAt: nowIso, updatedAt: nowIso }, { merge: true });
      }
      await batch.commit();
    }
    hasEnsuredUrgentSlots = true;
  } catch (err) {
    console.warn('Could not ensure urgent slots in Firestore:', err);
  }
}

/**
 * Search for earliest available non-expired urgent slot.
 * Checks requested preferred date (if future/today), today, or upcoming business days.
 * Strictly ignores any past dates or expired times.
 */
export async function findEarliestUrgentSlot(
  preferredDateStr?: string
): Promise<{ slot: DemoAppointmentSlot; isToday: boolean } | null> {
  await ensureUrgentSlotsSeeded();
  const config = await getClinicScheduleConfig();
  const houstonNow = getHoustonCurrentDateTime();
  const TODAY = houstonNow.dateStr;

  // If a specific preferred date was requested (and it is >= TODAY and not closed), check that date first
  if (preferredDateStr && preferredDateStr >= TODAY && !isClinicClosedOnDate(preferredDateStr, config).isClosed) {
    const durationAware = await getDurationAwareAvailableSlots(preferredDateStr, 30, true);
    const availInDate = durationAware
      .map((r) => r.slot)
      .find(
        (s) =>
          s.type === 'urgent' &&
          s.status === 'available' &&
          !isSlotOrAppointmentExpired(s.date, s.time, houstonNow)
      );
    if (availInDate) {
      return { slot: availInDate, isToday: preferredDateStr === TODAY };
    }
  }

  // 1. Search today's non-expired urgent slots first
  if (!isClinicClosedOnDate(TODAY, config).isClosed) {
    const todaySlots = await getDurationAwareAvailableSlots(TODAY, 30, true);
    const availToday = todaySlots
      .map((r) => r.slot)
      .find(
        (s) =>
          s.type === 'urgent' &&
          s.status === 'available' &&
          !isSlotOrAppointmentExpired(s.date, s.time, houstonNow)
      );
    if (availToday) {
      return { slot: availToday, isToday: true };
    }
  }

  // 2. If no available urgent slots today, search upcoming business days
  const [refY, refM, refD] = TODAY.split('-').map(Number);
  const baseDate = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));

  for (let i = 1; i <= 14; i++) {
    const target = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const yr = target.getUTCFullYear();
    const mo = String(target.getUTCMonth() + 1).padStart(2, '0');
    const da = String(target.getUTCDate()).padStart(2, '0');
    const dStr = `${yr}-${mo}-${da}`;

    if (isClinicClosedOnDate(dStr, config).isClosed) continue;

    const daySlots = await getDurationAwareAvailableSlots(dStr, 30, true);
    const availSlot = daySlots
      .map((r) => r.slot)
      .find(
        (s) =>
          s.type === 'urgent' &&
          s.status === 'available' &&
          !isSlotOrAppointmentExpired(s.date, s.time, houstonNow)
      );
    if (availSlot) {
      return { slot: availSlot, isToday: false };
    }
  }

  return null;
}

/**
 * Find earliest available normal slot that is NOT expired.
 * Always searches starting from today or fromDateStr if later.
 */
export async function findEarliestNormalSlot(
  fromDateStr?: string
): Promise<DemoAppointmentSlot | null> {
  const config = await getClinicScheduleConfig();
  const houstonNow = getHoustonCurrentDateTime();
  const startFrom = fromDateStr && fromDateStr >= houstonNow.dateStr ? fromDateStr : houstonNow.dateStr;

  const [refY, refM, refD] = startFrom.split('-').map(Number);
  const baseDate = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));

  for (let i = 0; i <= 14; i++) {
    const target = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const yr = target.getUTCFullYear();
    const mo = String(target.getUTCMonth() + 1).padStart(2, '0');
    const da = String(target.getUTCDate()).padStart(2, '0');
    const dStr = `${yr}-${mo}-${da}`;

    if (isClinicClosedOnDate(dStr, config).isClosed) continue;

    const daySlots = await getDurationAwareAvailableSlots(dStr, 30, false);
    const availSlot = daySlots
      .map((r) => r.slot)
      .find(
        (s) =>
          s.status === 'available' &&
          s.type !== 'urgent' &&
          !isSlotOrAppointmentExpired(s.date, s.time, houstonNow)
      );
    if (availSlot) {
      return availSlot;
    }
  }

  return null;
}

export interface AlternativeDayGroup {
  date: string;
  dateLabel: string;
  relation: 'previous' | 'next';
  slots: DemoAppointmentSlot[];
}

export interface AlternativeSlotsResult {
  requestedDate: string;
  isSunday: boolean;
  hasAlternatives: boolean;
  dayGroups: AlternativeDayGroup[];
  allSlots: DemoAppointmentSlot[];
}

export interface AlternativeSearchOptions {
  isUrgent?: boolean;
  requiredDurationMinutes?: number;
  serviceReason?: string;
  timePref?: {
    targetTime?: string;
    targetHour?: number;
    period?: 'morning' | 'afternoon';
    minMinutes?: number;
    maxMinutes?: number;
    rawLabel?: string;
  };
  maxPreviousDays?: number;
  maxNextDays?: number;
  maxSlotsPerDay?: number;
}

/**
 * Searches for alternative available demo appointment slots on nearby business days
 * when the requested date has no available slots (or is Sunday / clinic closed).
 *
 * Strict search order:
 * 1. Requested date (already determined to have no slots)
 * 2. Previous business days (closest to requested date first, within clinic operating days, >= today)
 * 3. Next business days (closest upcoming business days first, within clinic operating days)
 *
 * Never suggests:
 * - Past dates or expired times
 * - Sunday slots (clinic is closed)
 */
export async function findAlternativeAppointmentSlots(
  requestedDateStr: string,
  options?: AlternativeSearchOptions
): Promise<AlternativeSlotsResult> {
  const config = await getClinicScheduleConfig();
  const houstonNow = getHoustonCurrentDateTime();
  const TODAY = houstonNow.dateStr;
  const isUrgent = !!options?.isUrgent;
  const typeFilter: SlotType = isUrgent ? 'urgent' : 'normal';
  const closedCheck = isClinicClosedOnDate(requestedDateStr, config);
  const isSunday = closedCheck.isClosed || isSundayDate(requestedDateStr);

  // Fetch all slots from Firestore
  const allSlots = await getDemoAppointmentSlots(undefined, typeFilter);

  // Filter for valid available slots
  const validAvailableSlots = allSlots.filter((s) => {
    if (s.status !== 'available') return false;
    if (isSlotOrAppointmentExpired(s.date, s.time, houstonNow)) return false;
    if (isClinicClosedOnDate(s.date, config).isClosed) return false;
    if (s.date < TODAY) return false;
    if (s.date === requestedDateStr) return false;
    return true;
  });

  // Group by date
  const slotsByDateMap = new Map<string, DemoAppointmentSlot[]>();
  for (const s of validAvailableSlots) {
    const list = slotsByDateMap.get(s.date) || [];
    list.push(s);
    slotsByDateMap.set(s.date, list);
  }

  const dates = Array.from(slotsByDateMap.keys());

  // Previous business days: date < requestedDateStr && date >= TODAY
  // Sort descending so the previous day closest to requested date comes first
  const prevDates = dates
    .filter((d) => d < requestedDateStr && d >= TODAY)
    .sort((a, b) => b.localeCompare(a));

  // Next business days: date > requestedDateStr && date >= TODAY
  // Sort ascending so the next upcoming day closest to requested date comes first
  const nextDates = dates
    .filter((d) => d > requestedDateStr && d >= TODAY)
    .sort((a, b) => a.localeCompare(b));

  const maxSlotsPerDay = options?.maxSlotsPerDay || 4;
  const dayGroups: AlternativeDayGroup[] = [];
  const allResultSlots: DemoAppointmentSlot[] = [];
  const reqDuration =
    options?.requiredDurationMinutes ||
    (options?.serviceReason ? resolveServiceDuration(options.serviceReason) : 30);

  const processDay = async (d: string, relation: 'previous' | 'next') => {
    const durationResults = await getDurationAwareAvailableSlots(d, reqDuration, isUrgent);
    const daySlots: DemoAppointmentSlot[] = durationResults.map((r) => r.slot);
    if (daySlots.length === 0) return;

    daySlots.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

    let selectedSlots: DemoAppointmentSlot[] = [];
    if (options?.timePref) {
      const tp = options.timePref;
      const matching = daySlots.filter((s) => {
        const mins = parseTimeToMinutes(s.time);
        if (tp.targetTime && s.time.toLowerCase() === tp.targetTime.toLowerCase()) return true;
        if (tp.period === 'morning' && mins < 720) return true;
        if (tp.period === 'afternoon' && mins >= 720) return true;
        if (tp.minMinutes !== undefined && tp.maxMinutes !== undefined) {
          return mins >= tp.minMinutes && mins <= tp.maxMinutes;
        }
        return false;
      });

      if (matching.length > 0) {
        selectedSlots = matching.slice(0, maxSlotsPerDay);
      } else {
        selectedSlots = daySlots.slice(0, maxSlotsPerDay);
      }
    } else {
      selectedSlots = daySlots.slice(0, maxSlotsPerDay);
    }

    dayGroups.push({
      date: d,
      dateLabel: formatDatePretty(d),
      relation,
      slots: selectedSlots,
    });
    allResultSlots.push(...selectedSlots);
  };

  // Search order: Previous business days -> Next business days!
  const maxPrev = options?.maxPreviousDays || 2;
  for (const d of prevDates.slice(0, maxPrev)) {
    await processDay(d, 'previous');
  }

  const maxNext = options?.maxNextDays || 2;
  for (const d of nextDates.slice(0, maxNext)) {
    await processDay(d, 'next');
  }

  return {
    requestedDate: requestedDateStr,
    isSunday,
    hasAlternatives: dayGroups.length > 0 && allResultSlots.length > 0,
    dayGroups,
    allSlots: allResultSlots,
  };
}

/**
 * Searches for the earliest available upcoming non-expired demo slots starting from today.
 * For today's date:
 * - ignores start times that have already passed
 * - only considers future start times
 * Then searches future business days as necessary.
 */
export async function findNextAvailableSlots(options?: {
  isUrgent?: boolean;
  requiredDurationMinutes?: number;
  serviceReason?: string;
  maxDays?: number;
  maxSlotsPerDay?: number;
}): Promise<{
  hasSlots: boolean;
  slots: DemoAppointmentSlot[];
  byDate: AlternativeDayGroup[];
}> {
  const config = await getClinicScheduleConfig();
  const houstonNow = getHoustonCurrentDateTime();
  const TODAY = houstonNow.dateStr;
  const isUrgent = !!options?.isUrgent;
  const reqDuration =
    options?.requiredDurationMinutes ||
    (options?.serviceReason ? resolveServiceDuration(options.serviceReason, config) : 30);
  const maxDays = options?.maxDays || 2;
  const maxSlotsPerDay = options?.maxSlotsPerDay || 4;

  const byDate: AlternativeDayGroup[] = [];
  const resultSlots: DemoAppointmentSlot[] = [];

  const [refY, refM, refD] = TODAY.split('-').map(Number);
  const baseDate = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));

  const maxSearchDays = config.availabilityWindowDays || 30;

  // Search starting from TODAY up to availabilityWindowDays ahead
  for (let i = 0; i < maxSearchDays; i++) {
    if (byDate.length >= maxDays) break;

    const target = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const yr = target.getUTCFullYear();
    const mo = String(target.getUTCMonth() + 1).padStart(2, '0');
    const da = String(target.getUTCDate()).padStart(2, '0');
    const dStr = `${yr}-${mo}-${da}`;

    // Skip closed days
    if (isClinicClosedOnDate(dStr, config).isClosed) continue;

    const durationResults = await getDurationAwareAvailableSlots(dStr, reqDuration, isUrgent);
    const daySlots = durationResults
      .map((r) => r.slot)
      .filter((s) => {
        if (s.status !== 'available') return false;
        if (isSlotOrAppointmentExpired(s.date, s.time, houstonNow)) return false;
        if (s.date < TODAY) return false;
        return true;
      });

    if (daySlots.length === 0) continue;

    daySlots.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
    const chosen = daySlots.slice(0, maxSlotsPerDay);

    byDate.push({
      date: dStr,
      dateLabel: formatDatePretty(dStr),
      relation: 'next',
      slots: chosen,
    });
    resultSlots.push(...chosen);
  }

  return {
    hasSlots: resultSlots.length > 0,
    slots: resultSlots,
    byDate,
  };
}

/**
 * Formats a clear, friendly receptionist message offering alternative appointments.
 * Explicitly notes when the requested date has already passed.
 */
export function formatAlternativeSlotsMessage(
  requestedDateStr: string,
  result: AlternativeSlotsResult,
  timePref?: { rawLabel?: string; period?: string }
): string {
  const houstonNow = getHoustonCurrentDateTime();
  const isPast = requestedDateStr < houstonNow.dateStr;
  const closedCheck = isClinicClosedOnDate(requestedDateStr);
  const isClosedDay = closedCheck.isClosed || result.isSunday;
  const closedDayName = closedCheck.dayName || (result.isSunday ? 'Sunday' : 'that day');

  if (!result.hasAlternatives || result.dayGroups.length === 0) {
    if (isPast) {
      return `${formatDatePretty(
        requestedDateStr
      )} has already passed. Please suggest an upcoming date, or call our office directly at (281) 946-2569 for scheduling assistance.`;
    }
    if (isClosedDay) {
      return `Our clinic is closed on ${closedDayName}s. There are currently no alternative appointments found on nearby dates. Please suggest another date or call (281) 946-2569.`;
    }
    return `There are currently no available slots on ${formatDatePretty(
      requestedDateStr
    )}, and no appointments were found on nearby dates. Please suggest a later date, or call our office directly at (281) 946-2569 for scheduling assistance.`;
  }

  const lines: string[] = [];
  if (isPast) {
    lines.push(
      `${formatDatePretty(requestedDateStr)} has already passed.`
    );
    lines.push('Here are our earliest upcoming available appointment times:');
  } else if (isClosedDay) {
    lines.push(
      `Our clinic is closed on ${closedDayName}s.`
    );
    lines.push('However, I checked nearby dates and found available appointments on our open days:');
  } else if (timePref?.rawLabel) {
    lines.push(
      `There are currently no available ${timePref.rawLabel} slots on ${formatDatePretty(
        requestedDateStr
      )}.`
    );
    lines.push('However, I checked nearby dates and found available appointments:');
  } else {
    lines.push(
      `There are currently no available slots on ${formatDatePretty(requestedDateStr)}.`
    );
    lines.push('However, I checked nearby dates and found available appointments:');
  }

  for (const group of result.dayGroups) {
    const times = group.slots.map((s) => s.time).join(', ');
    lines.push(`• ${group.dateLabel}: ${times}`);
  }

  lines.push('\nWould you like to book one of these times, or choose another date?');
  return lines.join('\n');
}

/**
 * Save a demo appointment preference to Firestore.
 * Does NOT collect personal health records or connect to real scheduling.
 */
export async function saveDemoAppointmentPreference(
  pref: Omit<DemoAppointmentPreference, 'createdAt' | 'isDemo' | 'location'>
): Promise<string> {
  const prefsCol = collection(db, PREFERENCES_COLLECTION);
  const docData: DemoAppointmentPreference = {
    ...pref,
    location: CLINIC_LOCATION_STRING,
    createdAt: new Date().toISOString(),
    isDemo: true,
  };

  const docRef = await addDoc(prefsCol, docData);

  // If a slot ID was selected, update its status to booked in the demo database
  if (pref.slotId) {
    try {
      const slotRef = doc(db, SLOTS_COLLECTION, pref.slotId);
      await setDoc(
        slotRef,
        { status: 'booked', updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.warn('Could not update slot booked status:', err);
    }
  }

  return docRef.id;
}

/**
 * Execute an atomic reservation transaction directly on Firestore.
 * Double-booking protection: checks current status in transaction before updating.
 */
export async function reserveDemoSlotDirectTransaction(bookingData: {
  slotId: string;
  bookingAttemptId?: string;
  patientType: string;
  patientId?: string;
  reason: string;
  reasonForVisit?: string;
  date: string;
  appointmentDate?: string;
  time: string;
  appointmentTime?: string;
  patientName?: string;
  patientPhone?: string;
  isUrgent?: boolean;
  type?: SlotType;
  appointmentType?: SlotType;
  duration?: number;
  durationMinutes?: number;
  endTime?: string;
}): Promise<{
  success: boolean;
  appointmentId?: string;
  error?: string;
  message?: string;
  slot?: DemoAppointmentSlot;
  duplicateSubmission?: boolean;
}> {
  try {
    const slotRef = doc(db, SLOTS_COLLECTION, bookingData.slotId);
    let reservedSlot: DemoAppointmentSlot | null = null;
    let createdPrefId: string | null = null;

    // Idempotency: Duplicate submission check by bookingAttemptId before doing any reads
    if (bookingData.bookingAttemptId) {
      try {
        const { getDoc } = await import('firebase/firestore');
        const attemptSnap = await getDoc(doc(db, PREFERENCES_COLLECTION, bookingData.bookingAttemptId));
        if (attemptSnap.exists()) {
          const attemptData = attemptSnap.data();
          if ((attemptData.status || '').toLowerCase() !== 'cancelled') {
            return {
              success: true,
              appointmentId: bookingData.bookingAttemptId,
              duplicateSubmission: true,
              message: 'Demo appointment preference submitted!',
            };
          }
        }
      } catch (attemptErr) {
        console.warn('Attempt check note:', attemptErr);
      }
    }

    // Pre-read primary slot
    const { getDoc } = await import('firebase/firestore');
    const initSnap = await getDoc(slotRef);
    if (!initSnap.exists()) {
      throw new Error('SLOT_NOT_FOUND');
    }
    const currentData = initSnap.data() as DemoAppointmentSlot;

    const effectiveReason = bookingData.reason || bookingData.reasonForVisit || (currentData.type === 'urgent' ? 'Urgent Dental Care' : 'Routine Checkup & Cleaning');
    const effectiveDate = bookingData.date || bookingData.appointmentDate || currentData.date;
    const effectiveTime = bookingData.time || bookingData.appointmentTime || currentData.time;
    const effectiveAppointmentType = bookingData.appointmentType || currentData.type || 'normal';
    const effectiveDuration = Number(bookingData.duration || bookingData.durationMinutes || currentData.duration || resolveServiceDuration(effectiveReason)) || 30;
    const effectiveEndTime = bookingData.endTime || currentData.endTime || computeEndTime(effectiveTime, effectiveDuration);
    const startMin = parseTimeToMinutes(effectiveTime);

    // 1. Expiration check (never book slots in the past)
    if (isSlotOrAppointmentExpired(effectiveDate, effectiveTime)) {
      throw new Error('SLOT_EXPIRED');
    }

    // 2. Clinic operating hours and closed working day check
    const config = await getClinicScheduleConfig();
    const hoursValidation = isAppointmentWithinClinicHours(effectiveDate, effectiveTime, effectiveDuration, config);
    if (!hoursValidation.valid) {
      throw new Error('OUTSIDE_CLINIC_HOURS');
    }

    // 3. Overlap check against existing active bookings on this date
    // Cancelled appointments must NOT block availability. Incomplete status treated conservatively as active.
    const prefsCol = collection(db, PREFERENCES_COLLECTION);
    const qPrefs = query(prefsCol, where('date', '==', effectiveDate));
    const activePrefsSnap = await getDocs(qPrefs);
    for (const d of activePrefsSnap.docs) {
      if (bookingData.bookingAttemptId && d.id === bookingData.bookingAttemptId) continue;
      const ap = d.data();
      const apStatus = (ap.status || '').toLowerCase();
      if (apStatus !== 'cancelled') {
        const apTime = ap.time || ap.appointmentTime || ap.startTime || '';
        if (apTime) {
          const apStart = parseTimeToMinutes(apTime);
          const apDur = Number(ap.durationMinutes || ap.duration) || resolveServiceDuration(ap.reason || ap.reasonForVisit, config) || 30;
          if (doTimeIntervalsOverlap(startMin, effectiveDuration, apStart, apDur)) {
            throw new Error('SLOT_ALREADY_BOOKED');
          }
        }
      }
    }

    // Identify consecutive continuation slots for duration > slotIntervalMinutes
    const stepInterval = config.slotIntervalMinutes || 30;
    const stepCount = Math.max(1, Math.ceil(effectiveDuration / stepInterval));
    const continuationSlotRefs: { ref: any; time: string }[] = [];
    if (stepCount > 1) {
      const { formatMinutesToTime } = await import('../utils/bookingConversationEngine');
      const slotsCol = collection(db, SLOTS_COLLECTION);
      for (let i = 1; i < stepCount; i++) {
        const nextMin = startMin + i * stepInterval;
        const nextTimeStr = normalizeSlotTime(formatMinutesToTime(nextMin));
        const qNext = query(slotsCol, where('date', '==', effectiveDate), where('time', '==', nextTimeStr));
        const nextSnap = await getDocs(qNext);
        if (nextSnap.empty) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }
        const nextDoc = nextSnap.docs[0];
        const nextData = nextDoc.data() as DemoAppointmentSlot;
        if (nextData.status !== 'available' || isSlotOrAppointmentExpired(effectiveDate, nextData.time)) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }
        continuationSlotRefs.push({
          ref: doc(db, SLOTS_COLLECTION, nextDoc.id),
          time: nextTimeStr,
        });
      }
    }

    await runTransaction(db, async (transaction) => {
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists()) {
        throw new Error('SLOT_NOT_FOUND');
      }

      const snapData = slotSnap.data() as DemoAppointmentSlot;
      if (snapData.status !== 'available') {
        // If slot is booked, check if booked by THIS attemptId
        if (bookingData.bookingAttemptId) {
          const prefCheckSnap = await transaction.get(doc(db, PREFERENCES_COLLECTION, bookingData.bookingAttemptId));
          if (prefCheckSnap.exists() && (prefCheckSnap.data().status || '').toLowerCase() !== 'cancelled') {
            createdPrefId = bookingData.bookingAttemptId;
            reservedSlot = snapData;
            return;
          }
        }
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      if (isSlotOrAppointmentExpired(snapData.date, snapData.time)) {
        throw new Error('SLOT_EXPIRED');
      }

      const slotType = snapData.type || 'normal';
      if (slotType === 'urgent' && !bookingData.isUrgent) {
        throw new Error('URGENT_SLOT_RESTRICTED');
      }

      // Verify continuation slots inside transaction
      for (const cont of continuationSlotRefs) {
        const cSnap = await transaction.get(cont.ref);
        if (!cSnap.exists() || (cSnap.data() as DemoAppointmentSlot).status !== 'available') {
          throw new Error('SLOT_ALREADY_BOOKED');
        }
      }

      const prefRef = bookingData.bookingAttemptId
        ? doc(db, PREFERENCES_COLLECTION, bookingData.bookingAttemptId)
        : doc(collection(db, PREFERENCES_COLLECTION));
      createdPrefId = prefRef.id;

      // Duplicate submission protection within the transaction
      const existingPrefSnap = await transaction.get(prefRef);
      if (existingPrefSnap.exists()) {
        const existingData = existingPrefSnap.data();
        if ((existingData.status || '').toLowerCase() !== 'cancelled') {
          reservedSlot = snapData;
          return;
        }
      }

      const nowIso = new Date().toISOString();
      transaction.update(slotRef, {
        status: 'booked',
        duration: effectiveDuration,
        durationMinutes: effectiveDuration,
        startTime: effectiveTime,
        endTime: effectiveEndTime,
        updatedAt: nowIso,
      });

      for (const cont of continuationSlotRefs) {
        transaction.update(cont.ref, {
          status: 'booked',
          duration: 30,
          durationMinutes: 30,
          parentSlotTime: effectiveTime,
          note: `Continuation of ${effectiveTime} (${effectiveReason})`,
          updatedAt: nowIso,
        });
      }

      const prefDoc: any = {
        slotId: bookingData.slotId,
        bookingAttemptId: bookingData.bookingAttemptId || createdPrefId,
        patientType: bookingData.patientType,
        reason: effectiveReason,
        reasonForVisit: effectiveReason,
        type: slotType,
        appointmentType: effectiveAppointmentType,
        isUrgent: slotType === 'urgent' || !!bookingData.isUrgent,
        date: effectiveDate,
        appointmentDate: effectiveDate,
        time: effectiveTime,
        appointmentTime: effectiveTime,
        startTime: effectiveTime,
        duration: effectiveDuration,
        durationMinutes: effectiveDuration,
        endTime: effectiveEndTime,
        location: snapData.location || CLINIC_LOCATION_STRING,
        patientName: bookingData.patientName || '',
        patientPhone: bookingData.patientPhone || '',
        status: 'booked',
        createdAt: nowIso,
        updatedAt: nowIso,
        isDemo: true,
      };

      if (bookingData.patientId) {
        prefDoc.patientId = bookingData.patientId;
      } else {
        const cleanDigits = String(bookingData.patientPhone || '').replace(/\D/g, '').slice(-10);
        if (cleanDigits) {
          prefDoc.patientId = `patient_${cleanDigits}`;
        }
      }

      transaction.set(prefRef, prefDoc);

      reservedSlot = {
        ...snapData,
        id: bookingData.slotId,
        status: 'booked',
        duration: effectiveDuration,
        durationMinutes: effectiveDuration,
        startTime: effectiveTime,
        endTime: effectiveEndTime,
        updatedAt: nowIso,
      };
    });

    return {
      success: true,
      appointmentId: createdPrefId || bookingData.slotId,
      slot: reservedSlot || undefined,
      message: 'Demo appointment preference submitted!',
    };
  } catch (err: any) {
    if (err?.message === 'OUTSIDE_CLINIC_HOURS') {
      return {
        success: false,
        error: 'OUTSIDE_CLINIC_HOURS',
        message: 'The requested appointment time falls outside clinic operating hours or on a day the clinic is closed.',
      };
    }
    if (err?.message === 'SLOT_EXPIRED') {
      return {
        success: false,
        error: 'SLOT_EXPIRED',
        message: 'This appointment time has already passed. Please select an upcoming available time.',
      };
    }
    if (err?.message === 'SLOT_ALREADY_BOOKED') {
      return {
        success: false,
        error: 'SLOT_ALREADY_BOOKED',
        message: 'Sorry, this time slot was just booked. Please choose another available time.',
      };
    }
    if (err?.message === 'URGENT_SLOT_RESTRICTED') {
      return {
        success: false,
        error: 'URGENT_SLOT_RESTRICTED',
        message: 'Reserved urgent care slots can only be booked for urgent dental needs.',
      };
    }
    if (err?.message === 'SLOT_NOT_FOUND') {
      return {
        success: false,
        error: 'SLOT_NOT_FOUND',
        message: 'Appointment slot not found.',
      };
    }
    return {
      success: false,
      error: 'TRANSACTION_ERROR',
      message: err?.message || 'Error executing reservation transaction.',
    };
  }
}

/**
 * Reserve a demo appointment slot via server-side API, with fallback to direct Firestore transaction.
 */
export async function reserveDemoSlot(bookingData: {
  slotId: string;
  bookingAttemptId?: string;
  patientType: string;
  patientId?: string;
  reason: string;
  reasonForVisit?: string;
  date: string;
  appointmentDate?: string;
  time: string;
  appointmentTime?: string;
  patientName?: string;
  patientPhone?: string;
  isUrgent?: boolean;
  type?: SlotType;
  appointmentType?: SlotType;
  duration?: number;
  durationMinutes?: number;
  endTime?: string;
}): Promise<{
  success: boolean;
  appointmentId?: string;
  error?: string;
  message?: string;
  slot?: DemoAppointmentSlot;
  duplicateSubmission?: boolean;
}> {
  try {
    const res = await fetch('/api/reserve-slot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bookingData),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.error === 'OUTSIDE_CLINIC_HOURS') {
        return {
          success: false,
          error: 'OUTSIDE_CLINIC_HOURS',
          message: data.message || 'The requested appointment time falls outside clinic operating hours.',
        };
      }
      if (data.error === 'SLOT_ALREADY_BOOKED') {
        return {
          success: false,
          error: 'SLOT_ALREADY_BOOKED',
          message: 'Sorry, this time slot was just booked. Please choose another available time.',
        };
      }
      if (data.error === 'SLOT_EXPIRED') {
        return {
          success: false,
          error: 'SLOT_EXPIRED',
          message: 'This appointment time has already passed. Please select an upcoming available time.',
        };
      }
      if (data.error === 'URGENT_SLOT_RESTRICTED') {
        return {
          success: false,
          error: 'URGENT_SLOT_RESTRICTED',
          message: 'Reserved urgent care slots can only be booked for urgent dental needs.',
        };
      }
      return {
        success: false,
        error: data.error || 'SERVER_ERROR',
        message: data.message || 'Server returned an error.',
      };
    }

    return {
      success: true,
      appointmentId: data.appointmentId || data.slot?.id || bookingData.slotId,
      slot: data.slot,
      message: data.message,
      duplicateSubmission: data.duplicateSubmission,
    };
  } catch (error) {
    console.warn('Network call to /api/reserve-slot failed; falling back to direct Firestore transaction:', error);
    return await reserveDemoSlotDirectTransaction(bookingData);
  }
}

/**
 * Normalize time strings to clean standard format (e.g. "09:00 AM", "01:30 PM")
 */
export function normalizeSlotTime(timeStr: string): string {
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = match[2];
    let meridiem = (match[3] || '').toUpperCase();
    if (!meridiem) {
      if (hours >= 12) {
        meridiem = 'PM';
        if (hours > 12) hours -= 12;
      } else {
        meridiem = 'AM';
        if (hours === 0) hours = 12;
      }
    }
    const formattedHours = hours.toString().padStart(2, '0');
    return `${formattedHours}:${mins} ${meridiem}`;
  }
  return trimmed;
}

/**
 * Fetch all demo appointment slots across all dates for the admin dashboard.
 */
export async function getAllDemoSlots(): Promise<DemoAppointmentSlot[]> {
  try {
    const slots = await getDemoAppointmentSlots();
    return slots;
  } catch (err) {
    console.error('Failed to get all demo slots:', err);
    throw err;
  }
}

/**
 * Update slot status (available <-> booked) in Firestore with server endpoint and direct fallback.
 */
export async function updateDemoSlotStatus(
  slotId: string,
  newStatus: 'available' | 'booked'
): Promise<{ success: boolean; slot?: DemoAppointmentSlot; error?: string }> {
  try {
    const res = await fetch('/api/admin/slots/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true, slot: data.slot };
      }
    }
  } catch (err) {
    console.warn('API /api/admin/slots/update-status failed, using direct Firestore fallback:', err);
  }

  // Direct Firestore fallback
  try {
    const nowIso = new Date().toISOString();
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);
    await updateDoc(slotRef, {
      status: newStatus,
      updatedAt: nowIso,
    });
    return { success: true };
  } catch (err: any) {
    console.error('Direct Firestore update failed:', err);
    return { success: false, error: err?.message || 'Failed to update slot status' };
  }
}

/**
 * Create a new demo appointment slot in Firestore with duplicate prevention.
 * Validates that no existing slot shares the same date, time, and location.
 */
export async function createDemoSlot(slotData: {
  date: string;
  time: string;
  location: string;
}): Promise<{
  success: boolean;
  slot?: DemoAppointmentSlot;
  error?: string;
  message?: string;
}> {
  const normalizedDate = slotData.date.trim();
  const normalizedTime = normalizeSlotTime(slotData.time);
  const normalizedLocation = slotData.location.trim();

  if (!normalizedDate) {
    return { success: false, error: 'MISSING_DATE', message: 'Date is required.' };
  }
  if (!normalizedTime) {
    return { success: false, error: 'MISSING_TIME', message: 'Time is required.' };
  }
  if (!normalizedLocation) {
    return { success: false, error: 'MISSING_LOCATION', message: 'Location is required.' };
  }

  // Attempt server API first
  try {
    const res = await fetch('/api/admin/slots/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: normalizedDate,
        time: normalizedTime,
        location: normalizedLocation,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, slot: data.slot };
    }
    if (data.error === 'DUPLICATE_SLOT') {
      return {
        success: false,
        error: 'DUPLICATE_SLOT',
        message: data.message || 'A slot for this date, time, and location already exists.',
      };
    }
  } catch (err) {
    console.warn('API /api/admin/slots/add failed, using direct Firestore check and creation:', err);
  }

  // Direct Firestore fallback with duplicate prevention
  try {
    const slotsCol = collection(db, SLOTS_COLLECTION);
    const dateQuery = query(slotsCol, where('date', '==', normalizedDate));
    const snap = await getDocs(dateQuery);

    const isDuplicate = snap.docs.some((d) => {
      const data = d.data() as DemoAppointmentSlot;
      const sTime = normalizeSlotTime(data.time);
      const sLoc = (data.location || '').trim().toLowerCase();
      return (
        sTime.toLowerCase() === normalizedTime.toLowerCase() &&
        sLoc === normalizedLocation.toLowerCase()
      );
    });

    if (isDuplicate) {
      return {
        success: false,
        error: 'DUPLICATE_SLOT',
        message: `A slot for date ${normalizedDate}, time ${normalizedTime}, and location already exists.`,
      };
    }

    const cleanTime = normalizedTime.replace(/[^a-zA-Z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const docId = `slot_${normalizedDate}_${cleanTime}_${randomSuffix}`;
    const nowIso = new Date().toISOString();

    const newSlot: DemoAppointmentSlot = {
      id: docId,
      date: normalizedDate,
      time: normalizedTime,
      location: normalizedLocation,
      status: 'available',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(doc(db, SLOTS_COLLECTION, docId), newSlot);
    return { success: true, slot: newSlot };
  } catch (err: any) {
    console.error('Direct Firestore slot creation failed:', err);
    return { success: false, error: err?.message || 'Failed to create slot in database.' };
  }
}

/**
 * Delete a demo appointment slot from Firestore with server endpoint and direct fallback.
 */
export async function deleteDemoSlot(
  slotId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/slots/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true };
      }
    }
  } catch (err) {
    console.warn('API /api/admin/slots/delete failed, using direct Firestore fallback:', err);
  }

  // Direct Firestore fallback
  try {
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);
    await deleteDoc(slotRef);
    return { success: true };
  } catch (err: any) {
    console.error('Direct Firestore delete failed:', err);
    return { success: false, error: err?.message || 'Failed to delete slot.' };
  }
}

/**
 * Diagnostic utility to verify Firestore read/write capabilities for demo slots.
 */
export async function verifyFirestoreConnection(): Promise<{
  connected: boolean;
  slotCount: number;
  sampleSlots: DemoAppointmentSlot[];
  error?: string;
}> {
  try {
    const slots = await getDemoAppointmentSlots();
    return {
      connected: true,
      slotCount: slots.length,
      sampleSlots: slots.slice(0, 4),
    };
  } catch (err: any) {
    return {
      connected: false,
      slotCount: 0,
      sampleSlots: [],
      error: err?.message || 'Unknown Firestore error',
    };
  }
}

export interface DurationAwareSlotResult {
  slot: DemoAppointmentSlot;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  coveredSlotIds: string[];
}

/**
 * Returns available start times for a requested duration on a specific date.
 * Strictly verifies contiguous availability and protects against overlapping appointments.
 * - Granularity: 30 minutes start times
 * - Duration: e.g. 30m, 60m, 90m
 * - Verifies that ALL constituent 30-min intervals exist and are 'available'
 * - Verifies that no booked appointment on that date overlaps [startTime, endTime)
 */
export async function getDurationAwareAvailableSlots(
  dateStr: string,
  durationMinutes = 30,
  isUrgent = false
): Promise<DurationAwareSlotResult[]> {
  const houstonNow = getHoustonCurrentDateTime();
  const config = await getClinicScheduleConfig();

  // Check if clinic is closed on this date (working days or Sunday closed)
  if (isClinicClosedOnDate(dateStr, config).isClosed) return [];

  // 1. Clinic Operating Hours Check
  const parts = dateStr.split('-');
  const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const dayOfWeek = dObj.getDay(); // 0 = Sun, 6 = Sat, 1-5 = Mon-Fri

  let openTimeStr = config.weekdayOpen || '08:00 AM';
  let closeTimeStr = config.weekdayClose || '07:00 PM';
  if (dayOfWeek === 0) {
    if (!config.sundayOpen) return [];
    openTimeStr = config.sundayOpenTime || config.sundayOpeningTime || '09:00 AM';
    closeTimeStr = config.sundayCloseTime || config.sundayClosingTime || '02:00 PM';
  } else if (dayOfWeek === 6) {
    openTimeStr = config.saturdayOpen || '08:00 AM';
    closeTimeStr = config.saturdayClose || '05:00 PM';
  }

  const clinicOpenMin = parseTimeToMinutes(openTimeStr);
  const clinicCloseMin = parseTimeToMinutes(closeTimeStr);

  // 2. Fetch all slots on this date (ensuring automatic generation or seeding has populated it)
  const dateSlots = await getDemoAppointmentSlots(dateStr);

  // 3. Collect all occupied / blocked / booked intervals on this date
  const occupiedIntervals: { startMin: number; durationMin: number; endMin: number; source: string }[] = [];

  // 3a. Active bookings in demo_appointment_preferences
  const prefsCol = collection(db, PREFERENCES_COLLECTION);
  const qPrefs = query(prefsCol, where('date', '==', dateStr));
  const prefsSnap = await getDocs(qPrefs);

  prefsSnap.forEach((d) => {
    const data = d.data();
    if (data.status !== 'Cancelled') {
      const timeStr = data.time || data.appointmentTime || data.startTime || '';
      if (timeStr) {
        const startMin = parseTimeToMinutes(timeStr);
        const durMin =
          Number(data.durationMinutes || data.duration || resolveServiceDuration(data.reason || data.visitReason)) || 30;
        occupiedIntervals.push({
          startMin,
          durationMin: durMin,
          endMin: startMin + durMin,
          source: 'preference_' + d.id,
        });
      }
    }
  });

  // 3b. Active bookings in legacy demo_patient_preferences (if any)
  try {
    const legacyCol = collection(db, 'demo_patient_preferences');
    const qLegacy = query(legacyCol, where('date', '==', dateStr));
    const legacySnap = await getDocs(qLegacy);
    legacySnap.forEach((d) => {
      const data = d.data();
      if (data.status !== 'Cancelled') {
        const timeStr = data.time || data.appointmentTime || data.startTime || '';
        if (timeStr) {
          const startMin = parseTimeToMinutes(timeStr);
          const durMin =
            Number(data.durationMinutes || data.duration || resolveServiceDuration(data.reason || data.visitReason)) || 30;
          occupiedIntervals.push({
            startMin,
            durationMin: durMin,
            endMin: startMin + durMin,
            source: 'legacy_preference_' + d.id,
          });
        }
      }
    });
  } catch (err) {
    // Legacy collection optional
  }

  // 3c. Booked or disabled slots from demo_appointment_slots
  for (const s of dateSlots) {
    if (s.status === 'booked' || s.status === 'disabled') {
      const startMin = parseTimeToMinutes(s.time);
      const durMin = Number(s.duration || s.durationMinutes) || 30;
      occupiedIntervals.push({
        startMin,
        durationMin: durMin,
        endMin: startMin + durMin,
        source: `slot_${s.id}_${s.status}`,
      });
    }
  }

  // 3d. Urgent slots are reserved exclusively for urgent appointments
  if (!isUrgent) {
    for (const s of dateSlots) {
      if (s.type === 'urgent') {
        const startMin = parseTimeToMinutes(s.time);
        const durMin = Number(s.duration || s.durationMinutes) || 30;
        occupiedIntervals.push({
          startMin,
          durationMin: durMin,
          endMin: startMin + durMin,
          source: `urgent_slot_${s.id}`,
        });
      }
    }
  }

  // Map of normalized time -> slot
  const slotByTime = new Map<string, DemoAppointmentSlot>();
  for (const s of dateSlots) {
    slotByTime.set(normalizeSlotTime(s.time).toLowerCase(), s);
  }

  // Sort slots chronologically
  dateSlots.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

  const validWindows: DurationAwareSlotResult[] = [];
  const stepInterval = config.slotIntervalMinutes || 30;
  const stepCount = Math.max(1, Math.ceil(durationMinutes / stepInterval));

  for (const s of dateSlots) {
    // 1. Primary slot status and expiration checks
    if (s.status !== 'available') continue;
    if (isSlotOrAppointmentExpired(s.date, s.time, houstonNow)) continue;
    if (!isUrgent && s.type === 'urgent') continue;

    const startMin = parseTimeToMinutes(s.time);
    const endMin = startMin + durationMinutes;

    // 2. Clinic operating hours boundary check
    if (startMin < clinicOpenMin || endMin > clinicCloseMin) continue;

    // 3. Overlap check against any booked, blocked, or disabled interval
    let hasOverlap = false;
    for (const occ of occupiedIntervals) {
      if (doTimeIntervalsOverlap(startMin, durationMinutes, occ.startMin, occ.durationMin)) {
        hasOverlap = true;
        break;
      }
    }
    if (hasOverlap) continue;

    // 4. Validate all constituent intervals from start to start + durationMinutes
    let allIntervalsValid = true;
    const coveredSlotIds: string[] = [s.id];

    for (let i = 1; i < stepCount; i++) {
      const curMins = startMin + i * stepInterval;
      if (curMins + stepInterval > clinicCloseMin) {
        allIntervalsValid = false;
        break;
      }
      const curTimeStr = normalizeSlotTime(formatMinutesToTime(curMins)).toLowerCase();
      const subSlot = slotByTime.get(curTimeStr);

      if (
        !subSlot ||
        subSlot.status !== 'available' ||
        isSlotOrAppointmentExpired(dateStr, subSlot.time, houstonNow) ||
        (!isUrgent && subSlot.type === 'urgent')
      ) {
        allIntervalsValid = false;
        break;
      }
      coveredSlotIds.push(subSlot.id);
    }

    if (!allIntervalsValid) continue;

    const endTime = computeEndTime(s.time, durationMinutes);

    validWindows.push({
      slot: {
        ...s,
        duration: durationMinutes,
        durationMinutes,
        startTime: s.time,
        endTime,
      },
      startTime: s.time,
      endTime,
      durationMinutes,
      coveredSlotIds,
    });
  }

  return validWindows;
}



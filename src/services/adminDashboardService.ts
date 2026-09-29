import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  SLOTS_COLLECTION,
  PREFERENCES_COLLECTION,
  getDemoAppointmentSlots,
} from './demoSlotsService';
import { AdminDashboardSummary, DemoAppointmentSlot, DemoAppointmentPreference } from '../types';
import { getHoustonCurrentDateTime, isSlotOrAppointmentExpired } from '../utils/clinicTime';

/**
 * Format date string (YYYY-MM-DD) into readable format
 */
export function formatDashboardDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, monthIndex, day);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/**
 * Fetch and calculate all summary metrics for Admin Phase 1 Dashboard
 */
export async function getAdminDashboardMetrics(
  overrideToday?: string
): Promise<AdminDashboardSummary> {
  // 1. Fetch all slots (auto-seeding if empty)
  const allSlots: DemoAppointmentSlot[] = await getDemoAppointmentSlots();

  // 2. Fetch recorded preferences
  const prefsCol = collection(db, PREFERENCES_COLLECTION);
  const prefsSnap = await getDocs(prefsCol);
  const allPreferences: DemoAppointmentPreference[] = [];
  prefsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    allPreferences.push({
      id: docSnap.id,
      ...data,
    } as DemoAppointmentPreference);
  });

  // Determine demo "Today"
  // Default to Houston clinic current date or override (NEVER shift date away from real Houston today)
  const todayStr = overrideToday || getHoustonCurrentDateTime().dateStr;

  // A. Today's Appointments
  const todaySlots = allSlots.filter((s) => s.date === todayStr);
  const todayBookedSlots = todaySlots.filter((s) => s.status === 'booked');
  const todayPreferences = allPreferences.filter(
    (p) => p.date === todayStr || p.appointmentDate === todayStr
  );

  const todayBookedTotal = Math.max(todayBookedSlots.length, todayPreferences.length);

  // Breakdown counts
  let normalCount = todayPreferences.filter(
    (p) => (p.type || p.appointmentType || 'normal') === 'normal' && !p.isUrgent
  ).length;
  let urgentCount = todayPreferences.filter(
    (p) => (p.type || p.appointmentType) === 'urgent' || p.isUrgent
  ).length;

  // If preferences don't cover all booked slots (e.g. pre-seeded booked slots)
  const slotNormalBooked = todayBookedSlots.filter((s) => (s.type || 'normal') === 'normal').length;
  const slotUrgentBooked = todayBookedSlots.filter((s) => s.type === 'urgent').length;

  normalCount = Math.max(normalCount, slotNormalBooked);
  urgentCount = Math.max(urgentCount, slotUrgentBooked);

  // If still unequal to total, adjust
  if (normalCount + urgentCount < todayBookedTotal) {
    normalCount = todayBookedTotal - urgentCount;
  }

  const newPatientsCount = todayPreferences.filter((p) => p.patientType === 'new').length;
  const existingPatientsCount = todayPreferences.filter(
    (p) => p.patientType === 'existing'
  ).length;

  // B. Upcoming Appointments
  const upcomingSlots = allSlots.filter((s) => s.date > todayStr && s.status === 'booked');
  const upcomingPreferences = allPreferences.filter(
    (p) => (p.date || p.appointmentDate || '') > todayStr
  );
  const upcomingTotal = Math.max(upcomingSlots.length, upcomingPreferences.length);

  const upcomingDatesSet = new Set<string>();
  upcomingSlots.forEach((s) => upcomingDatesSet.add(s.date));
  upcomingPreferences.forEach((p) => {
    const d = p.date || p.appointmentDate;
    if (d && d > todayStr) upcomingDatesSet.add(d);
  });

  // C. Urgent Slots
  const urgentSlots = allSlots.filter((s) => s.type === 'urgent');
  const availableUrgentSlots = urgentSlots.filter((s) => s.status === 'available');
  const bookedUrgentSlots = urgentSlots.filter((s) => s.status === 'booked');

  // Next available urgent slot
  const nextUrgent = availableUrgentSlots[0];

  // D. Available Slots
  const availableNormal = allSlots.filter(
    (s) => s.status === 'available' && (s.type || 'normal') === 'normal'
  );
  const availableUrgent = availableUrgentSlots;

  // Active urgent appointments
  const allUrgentPreferences = allPreferences.filter(
    (p) => (p.type || p.appointmentType) === 'urgent' || p.isUrgent
  );

  // Past appointments
  const pastPreferences = allPreferences.filter((p) => {
    const d = p.date || p.appointmentDate;
    const t = p.time || p.appointmentTime;
    return isSlotOrAppointmentExpired(d, t);
  });
  const pastSlots = allSlots.filter((s) => s.status === 'booked' && isSlotOrAppointmentExpired(s.date, s.time));
  const pastTotal = Math.max(pastPreferences.length, pastSlots.length);

  return {
    todayDate: todayStr,
    todayFormatted: formatDashboardDate(todayStr),
    todayAppointments: {
      total: todayBookedTotal,
      normal: normalCount,
      urgent: urgentCount,
      newPatients: newPatientsCount,
      existingPatients: existingPatientsCount,
      hasAppointments: todayBookedTotal > 0,
    },
    upcomingAppointments: {
      total: upcomingTotal,
      datesCount: upcomingDatesSet.size,
    },
    urgentAppointments: {
      total: allUrgentPreferences.length,
      today: urgentCount,
      upcoming: allUrgentPreferences.filter((p) => (p.date || p.appointmentDate || '') > todayStr).length,
    },
    newPatients: {
      total: allPreferences.filter((p) => p.patientType === 'new').length,
      today: newPatientsCount,
      upcoming: allPreferences.filter((p) => p.patientType === 'new' && (p.date || p.appointmentDate || '') > todayStr).length,
    },
    existingPatients: {
      total: allPreferences.filter((p) => p.patientType === 'existing').length,
      today: existingPatientsCount,
      upcoming: allPreferences.filter((p) => p.patientType === 'existing' && (p.date || p.appointmentDate || '') > todayStr).length,
    },
    cancelledAppointments: {
      total: 0,
    },
    pastAppointments: {
      total: pastTotal,
    },
    urgentSlots: {
      available: availableUrgentSlots.length,
      booked: bookedUrgentSlots.length,
      total: urgentSlots.length,
      nextAvailableTime: nextUrgent?.time,
      nextAvailableDate: nextUrgent?.date,
    },
    availableSlots: {
      total: availableNormal.length + availableUrgent.length,
      normal: availableNormal.length,
      urgent: availableUrgent.length,
    },
  };
}

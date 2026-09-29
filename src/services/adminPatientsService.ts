import {
  collection,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { PATIENTS_COLLECTION, INITIAL_DEMO_PATIENTS } from './demoPatientsService';
import {
  AdminAppointment,
  AdminPatientRecord,
  DemoPatient,
  PatientFilterType,
  PatientType,
} from '../types';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
  parseTimeToMinutes,
} from '../utils/clinicTime';

import {
  formatDisplayPhone,
  isPatientPhoneMatch,
} from '../utils/phoneUtils';

/**
 * Standardize clean 10-digit phone number for reliable matching.
 */
export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

/**
 * Format phone numbers into standard readable format (supports both US and India).
 */
export function formatPatientPhone(phone?: string): string {
  return formatDisplayPhone(phone);
}

/**
 * Subscribes to real-time updates from Firestore `patients` collection.
 * Automatically seeds the 4 initial demo patient profiles if the collection is empty.
 */
export function subscribeToPatients(
  onData: (patients: DemoPatient[]) => void,
  onError: (errorMessage: string) => void
): () => void {
  const patientsCol = collection(db, PATIENTS_COLLECTION);

  const unsubscribe = onSnapshot(
    patientsCol,
    async (snapshot) => {
      // If collection is empty, seed demo patients
      if (snapshot.empty) {
        try {
          const nowIso = new Date().toISOString();
          for (const item of INITIAL_DEMO_PATIENTS) {
            const pRef = doc(db, PATIENTS_COLLECTION, item.id);
            await setDoc(
              pRef,
              {
                ...item,
                createdAt: nowIso,
                updatedAt: nowIso,
              },
              { merge: true }
            );
          }
        } catch (seedErr) {
          console.warn('[PatientsService] Non-fatal seed error (falling back to initial demo list):', seedErr);
          onData(INITIAL_DEMO_PATIENTS);
          return;
        }
      }

      const list: DemoPatient[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          fullName: data.fullName || 'Valued Patient',
          phone: data.phone || '',
          patientType: (data.patientType as PatientType) || 'existing',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });

      onData(list.length > 0 ? list : INITIAL_DEMO_PATIENTS);
    },
    (err) => {
      console.error('[PatientsService] Real-time subscription error on patients collection:', err);
      onError('Unable to load patients directory right now. Please try again.');
    }
  );

  return unsubscribe;
}

/**
 * Persists a new patient document into Firestore `patients` if not yet stored.
 */
export async function syncPatientToFirestore(patient: {
  id?: string;
  fullName: string;
  phone: string;
  patientType: PatientType;
}): Promise<string> {
  const cleanPhone = normalizePhoneDigits(patient.phone);
  const patientId = patient.id || (cleanPhone ? `patient_${cleanPhone}` : `patient_${Date.now()}`);

  try {
    const patientRef = doc(db, PATIENTS_COLLECTION, patientId);
    const existingSnap = await getDoc(patientRef);
    if (!existingSnap.exists()) {
      const nowIso = new Date().toISOString();
      await setDoc(patientRef, {
        id: patientId,
        fullName: patient.fullName.trim(),
        phone: cleanPhone || patient.phone,
        patientType: patient.patientType,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return patientId;
  } catch (err) {
    console.warn('[PatientsService] Non-fatal sync patient error:', err);
    return patientId;
  }
}

/**
 * Sorts appointments chronologically:
 * Earliest date and time first for ascending (upcoming).
 * Latest date and time first for descending (past / history).
 */
export function sortPatientAppointments(
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
 * Merges Firestore patients and current real-time booked appointments.
 * Matches appointments to patient via:
 * 1. Matching patientId / id
 * 2. Matching 10-digit phone numbers
 * 3. Matching case-insensitive trimmed full names
 *
 * Separates appointments into:
 * - UPCOMING (chronologically earliest first, non-expired, non-cancelled)
 * - PAST (chronologically latest first, expired, non-cancelled)
 * - CANCELLED (chronologically latest first)
 *
 * Automatically captures any patient records introduced via booked appointments.
 * Strictly avoids sensitive medical information.
 */
export function buildAdminPatientRecords(
  rawPatients: DemoPatient[],
  appointments: AdminAppointment[],
  referenceDate?: string
): AdminPatientRecord[] {
  const houstonNow = getHoustonCurrentDateTime();
  const todayStr = referenceDate || houstonNow.dateStr;

  // Track matched appointments so we can also discover appointment patients not yet in `patients`
  const claimedAppointmentIds = new Set<string>();
  const patientRecordsMap = new Map<string, AdminPatientRecord>();

  // 1. Process explicit patients from Firestore collection
  for (const p of rawPatients) {
    const patientPhoneDigits = normalizePhoneDigits(p.phone);
    const patientNameLower = p.fullName.trim().toLowerCase();

    const matchedAppts = appointments.filter((appt) => {
      // Direct ID match
      if (appt.patientId && (appt.patientId === p.id || appt.patientId === p.id.replace('demo_patient_', ''))) {
        claimedAppointmentIds.add(appt.id);
        return true;
      }
      // Phone match
      const apptPhoneDigits = normalizePhoneDigits(appt.phone || appt.patientPhone);
      if (patientPhoneDigits && apptPhoneDigits && patientPhoneDigits === apptPhoneDigits) {
        claimedAppointmentIds.add(appt.id);
        return true;
      }
      // Name match fallback
      if (
        !appt.patientId &&
        appt.patientName &&
        appt.patientName.trim().toLowerCase() === patientNameLower
      ) {
        claimedAppointmentIds.add(appt.id);
        return true;
      }
      return false;
    });

    // Partition appointments using Houston clinic date/time logic
    const upcoming: AdminAppointment[] = [];
    const past: AdminAppointment[] = [];
    const cancelled: AdminAppointment[] = [];

    for (const appt of matchedAppts) {
      if (appt.status === 'Cancelled') {
        cancelled.push(appt);
      } else if (isSlotOrAppointmentExpired(appt.date, appt.time, houstonNow)) {
        past.push(appt);
      } else {
        upcoming.push(appt);
      }
    }

    const sortedUpcoming = sortPatientAppointments(upcoming, 'asc');
    const sortedPast = sortPatientAppointments(past, 'desc');
    const sortedCancelled = sortPatientAppointments(cancelled, 'desc');

    const totalCount = sortedUpcoming.length + sortedPast.length + sortedCancelled.length;
    const mostRecentOrUpcoming = sortedUpcoming[0] || sortedPast[0] || sortedCancelled[0];

    patientRecordsMap.set(p.id, {
      id: p.id,
      fullName: p.fullName,
      phone: p.phone,
      patientType: p.patientType || 'existing',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      upcomingAppointments: sortedUpcoming,
      pastAppointments: sortedPast,
      cancelledAppointments: sortedCancelled,
      totalAppointmentsCount: totalCount,
      mostRecentOrUpcomingAppointment: mostRecentOrUpcoming,
    });
  }

  // 2. Discover patients from remaining appointments that don't have a profile yet (e.g. booked via receptionist)
  for (const appt of appointments) {
    if (claimedAppointmentIds.has(appt.id)) continue;

    const rawPhone = appt.phone || appt.patientPhone || '';
    const cleanPhone = normalizePhoneDigits(rawPhone);
    const rawName = appt.patientName?.trim() || 'New Patient';
    const key = appt.patientId || (cleanPhone ? `patient_${cleanPhone}` : `patient_name_${rawName.toLowerCase()}`);

    if (patientRecordsMap.has(key)) {
      // Append appointment to existing mapped record
      const existing = patientRecordsMap.get(key)!;
      claimedAppointmentIds.add(appt.id);
      if (appt.status === 'Cancelled') {
        existing.cancelledAppointments.push(appt);
      } else if (isSlotOrAppointmentExpired(appt.date, appt.time, houstonNow)) {
        existing.pastAppointments.push(appt);
      } else {
        existing.upcomingAppointments.push(appt);
      }
      existing.upcomingAppointments = sortPatientAppointments(existing.upcomingAppointments, 'asc');
      existing.pastAppointments = sortPatientAppointments(existing.pastAppointments, 'desc');
      existing.cancelledAppointments = sortPatientAppointments(existing.cancelledAppointments, 'desc');
      existing.totalAppointmentsCount =
        existing.upcomingAppointments.length +
        existing.pastAppointments.length +
        existing.cancelledAppointments.length;
      existing.mostRecentOrUpcomingAppointment =
        existing.upcomingAppointments[0] ||
        existing.pastAppointments[0] ||
        existing.cancelledAppointments[0];
      continue;
    }

    // Create record for this newly discovered patient
    claimedAppointmentIds.add(appt.id);
    const isCancelled = appt.status === 'Cancelled';
    const isExpired = isSlotOrAppointmentExpired(appt.date, appt.time, houstonNow);

    const upcomingList = !isCancelled && !isExpired ? [appt] : [];
    const pastList = !isCancelled && isExpired ? [appt] : [];
    const cancelledList = isCancelled ? [appt] : [];

    patientRecordsMap.set(key, {
      id: key,
      fullName: rawName,
      phone: rawPhone,
      patientType: (appt.patientType as PatientType) || 'new',
      createdAt: appt.createdAt,
      upcomingAppointments: upcomingList,
      pastAppointments: pastList,
      cancelledAppointments: cancelledList,
      totalAppointmentsCount: 1,
      mostRecentOrUpcomingAppointment: appt,
    });
  }

  const allRecords = Array.from(patientRecordsMap.values());

  // 3. Sort active/relevant patients sensibly, with upcoming activity prioritized
  return allRecords.sort((a, b) => {
    const aHasUpcoming = a.upcomingAppointments.length > 0;
    const bHasUpcoming = b.upcomingAppointments.length > 0;

    // Prioritize patients with upcoming appointments
    if (aHasUpcoming && !bHasUpcoming) return -1;
    if (!aHasUpcoming && bHasUpcoming) return 1;

    // If both have upcoming appointments, sort by earliest upcoming appointment date & time
    if (aHasUpcoming && bHasUpcoming) {
      const nextA = a.upcomingAppointments[0];
      const nextB = b.upcomingAppointments[0];
      const dateA = nextA?.date || '';
      const dateB = nextB?.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return parseTimeToMinutes(nextA?.time) - parseTimeToMinutes(nextB?.time);
    }

    // If neither has upcoming appointments, prioritize patients with past appointments
    const aHasPast = a.pastAppointments.length > 0;
    const bHasPast = b.pastAppointments.length > 0;
    if (aHasPast && !bHasPast) return -1;
    if (!aHasPast && bHasPast) return 1;

    // Fallback alphabetical sort by full name
    return a.fullName.localeCompare(b.fullName);
  });
}

/**
 * Filter and search patient directory.
 * Search matches full name (case-insensitive) or phone number.
 */
export function filterPatients(
  patients: AdminPatientRecord[],
  filter: PatientFilterType,
  searchQuery: string
): AdminPatientRecord[] {
  const query = searchQuery.trim().toLowerCase();
  const queryDigits = normalizePhoneDigits(query);

  return patients.filter((patient) => {
    // 1. Search Query Matching
    if (query) {
      const nameMatch = patient.fullName.toLowerCase().includes(query);
      const phoneMatch = isPatientPhoneMatch(query, patient.phone);
      const idMatch = patient.id.toLowerCase().includes(query);

      if (!nameMatch && !phoneMatch && !idMatch) {
        return false;
      }
    }

    // 2. Tab Filter Matching
    if (filter === 'all') return true;
    if (filter === 'new') return patient.patientType === 'new';
    if (filter === 'existing') return patient.patientType === 'existing';
    if (filter === 'has_upcoming') return patient.upcomingAppointments.length > 0;
    if (filter === 'no_upcoming') return patient.upcomingAppointments.length === 0;

    return true;
  });
}

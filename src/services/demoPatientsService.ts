import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { DemoPatient } from '../types';
import {
  validateStrictPhone,
  formatDisplayPhone,
  SupportedCountry,
} from '../utils/phoneUtils';

export const PATIENTS_COLLECTION = 'patients';

export const INITIAL_DEMO_PATIENTS: DemoPatient[] = [
  {
    id: 'demo_patient_john_smith',
    fullName: 'John Smith',
    phone: '+12815551234',
    patientType: 'existing',
  },
  {
    id: 'demo_patient_sarah_jenkins',
    fullName: 'Sarah Jenkins',
    phone: '+12815555678',
    patientType: 'existing',
  },
  {
    id: 'demo_patient_michael_chang',
    fullName: 'Michael Chang',
    phone: '+17135551234',
    patientType: 'existing',
  },
  {
    id: 'demo_patient_elena_rodriguez',
    fullName: 'Elena Rodriguez',
    phone: '+18325554321',
    patientType: 'existing',
  },
  {
    id: 'demo_patient_rajesh_sharma',
    fullName: 'Rajesh Sharma',
    phone: '+919876543210',
    patientType: 'existing',
  },
];

let hasSeededPatients = false;

/**
 * Ensures demo patients collection is seeded in Firestore.
 * Does not store sensitive medical history or PHI.
 */
export async function seedDemoPatients(force = false): Promise<DemoPatient[]> {
  if (hasSeededPatients && !force) {
    return INITIAL_DEMO_PATIENTS;
  }

  try {
    const patientsCol = collection(db, PATIENTS_COLLECTION);
    const snap = await getDocs(patientsCol);

    if (snap.empty || force) {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      for (const patient of INITIAL_DEMO_PATIENTS) {
        const patientRef = doc(db, PATIENTS_COLLECTION, patient.id);
        batch.set(
          patientRef,
          {
            ...patient,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    hasSeededPatients = true;
    return INITIAL_DEMO_PATIENTS;
  } catch (err) {
    console.warn('Could not seed demo patients into Firestore, falling back to local list:', err);
    hasSeededPatients = true;
    return INITIAL_DEMO_PATIENTS;
  }
}

/**
 * Creates or updates a patient profile in the Firestore `patients` collection
 * after every successful booking.
 * 
 * Rules:
 * 1. Uses normalized E.164 phone (+1XXXXXXXXXX or +91XXXXXXXXXX) as the matching identifier.
 * 2. Stores only allowed demo fields: fullName, phone, patientType, createdAt, updatedAt.
 * 3. Does not store sensitive medical information.
 * 4. If a patient with the same normalized phone (or legacy 10-digit phone) exists:
 *    - Updates existing record, preserving original createdAt.
 *    - Sets patientType to 'existing' (once booked, they are now an existing patient).
 *    - Prevents duplicate patient documents.
 * 5. If no patient exists:
 *    - Creates a new patient document.
 * 6. Handled safely: failures do not falsely fail the appointment.
 */
export async function saveOrUpdatePatientProfile(
  fullName: string,
  rawPhone: string,
  patientType: 'new' | 'existing' = 'existing',
  countryHint?: SupportedCountry | null
): Promise<DemoPatient | null> {
  const phoneVal = validateStrictPhone(rawPhone, countryHint, true);
  if (!phoneVal.isValid || !phoneVal.e164) {
    return null;
  }

  const cleanName = (fullName || '').trim() || 'Valued Patient';
  const cleanPhone = phoneVal.e164;
  const nationalDigits = phoneVal.nationalNumber;
  const nowIso = new Date().toISOString();

  try {
    const patientsCol = collection(db, PATIENTS_COLLECTION);
    
    // 1. Try exact E.164 match
    let q = query(patientsCol, where('phone', '==', cleanPhone));
    let snap = await getDocs(q);

    // 2. If not found, try legacy un-prefixed 10-digit match
    if (snap.empty && nationalDigits) {
      const legacyQuery = query(patientsCol, where('phone', '==', nationalDigits));
      snap = await getDocs(legacyQuery);
    }

    let patientRecord: DemoPatient;

    if (!snap.empty) {
      // Patient with this phone already exists - update record without creating a duplicate
      const docSnap = snap.docs[0];
      const existingData = docSnap.data();
      const docRef = doc(db, PATIENTS_COLLECTION, docSnap.id);

      const updatedPayload = {
        fullName: cleanName || existingData.fullName || 'Valued Patient',
        phone: cleanPhone,
        patientType: 'existing' as const,
        updatedAt: nowIso,
      };

      await updateDoc(docRef, updatedPayload);

      patientRecord = {
        id: docSnap.id,
        fullName: updatedPayload.fullName,
        phone: cleanPhone,
        patientType: 'existing',
        createdAt: existingData.createdAt || nowIso,
        updatedAt: nowIso,
      };
    } else {
      // Create new patient document
      const docId = `patient_${cleanPhone.replace('+', '')}`;
      const docRef = doc(db, PATIENTS_COLLECTION, docId);

      const newPayload = {
        fullName: cleanName,
        phone: cleanPhone,
        patientType: 'existing' as const,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(docRef, newPayload, { merge: true });

      patientRecord = {
        id: docId,
        ...newPayload,
      };
    }

    // Keep in-memory cache synchronized
    const existingIndex = INITIAL_DEMO_PATIENTS.findIndex(
      (p) => p.phone === cleanPhone || p.phone === nationalDigits
    );
    if (existingIndex >= 0) {
      INITIAL_DEMO_PATIENTS[existingIndex] = {
        ...INITIAL_DEMO_PATIENTS[existingIndex],
        ...patientRecord,
      };
    } else {
      INITIAL_DEMO_PATIENTS.push(patientRecord);
    }

    return patientRecord;
  } catch (err) {
    console.warn('[PatientsService] Non-fatal patient save/update error:', err);
    // Keep in local memory so the active session still recognizes them
    const localRecord: DemoPatient = {
      id: `patient_${cleanPhone.replace('+', '')}`,
      fullName: cleanName,
      phone: cleanPhone,
      patientType: 'existing',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const existingIndex = INITIAL_DEMO_PATIENTS.findIndex(
      (p) => p.phone === cleanPhone || p.phone === nationalDigits
    );
    if (existingIndex >= 0) {
      INITIAL_DEMO_PATIENTS[existingIndex] = localRecord;
    } else {
      INITIAL_DEMO_PATIENTS.push(localRecord);
    }
    return localRecord;
  }
}

/**
 * Look up a demo patient by exact normalized phone number or legacy format.
 * Returns the matched DemoPatient if found, or null if no profile exists.
 * Strictly adheres to privacy: only returns match for the exact phone entered.
 */
export async function lookupDemoPatientByPhone(
  rawPhone: string,
  countryHint?: SupportedCountry | null
): Promise<DemoPatient | null> {
  const phoneVal = validateStrictPhone(rawPhone, countryHint, false);
  const rawClean = rawPhone.replace(/\D/g, '');

  // Determine lookup candidate targets
  const candidatePhones: string[] = [];
  if (phoneVal.isValid && phoneVal.e164) {
    candidatePhones.push(phoneVal.e164);
    if (phoneVal.nationalNumber) {
      candidatePhones.push(phoneVal.nationalNumber);
    }
  } else if (rawClean.length === 10) {
    // 10 digits entered without country prefix:
    // Check both potential E.164 variations and legacy format
    candidatePhones.push(`+91${rawClean}`);
    candidatePhones.push(`+1${rawClean}`);
    candidatePhones.push(rawClean);
  } else if (rawClean.length > 0) {
    candidatePhones.push(rawClean);
  }

  if (candidatePhones.length === 0) {
    return null;
  }

  // 1. Primary real-time Firestore query on `patients` collection
  try {
    const patientsCol = collection(db, PATIENTS_COLLECTION);
    for (const phoneTarget of candidatePhones) {
      const q = query(patientsCol, where('phone', '==', phoneTarget));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        return {
          id: docSnap.id,
          fullName: data.fullName || 'Valued Patient',
          phone: data.phone || phoneTarget,
          patientType: (data.patientType as 'existing' | 'new') || 'existing',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      }
    }
  } catch (err) {
    console.warn('[PatientsService] Firestore patient lookup note:', err);
  }

  // 2. Fallback to initial demo patient records
  for (const phoneTarget of candidatePhones) {
    const localMatch = INITIAL_DEMO_PATIENTS.find(
      (p) =>
        p.phone === phoneTarget ||
        p.phone.replace(/\D/g, '') === phoneTarget.replace(/\D/g, '') ||
        (phoneTarget.length === 10 && p.phone.endsWith(phoneTarget))
    );
    if (localMatch) {
      return {
        id: localMatch.id,
        fullName: localMatch.fullName,
        phone: localMatch.phone,
        patientType: localMatch.patientType || 'existing',
      };
    }
  }

  return null;
}

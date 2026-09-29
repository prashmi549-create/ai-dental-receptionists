import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { NotificationRecord } from '../types';
import { formatDatePretty } from '../utils/bookingConversationEngine';
import { CLINIC_INFO } from '../data/clinicData';
import { calculateReminderScheduledTimes } from '../utils/clinicTime';

import {
  normalizePhoneNumber,
  SupportedCountry,
} from '../utils/phoneUtils';

export const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Configurable test country setting for notification phone-number normalization.
 * Supported values:
 * - "IN" : India (+91)
 * - "US" : United States (+1)
 */
export type NotificationTestCountry = 'IN' | 'US';

export const NOTIFICATION_TEST_COUNTRY: NotificationTestCountry = 'IN';

/**
 * Centralized phone normalization for the notification layer.
 * Uses the global phoneUtils E.164 normalization, respecting +91, +1, or test country.
 */
export function normalizeNotificationPhone(
  phone: string,
  testCountry: NotificationTestCountry = NOTIFICATION_TEST_COUNTRY
): string {
  if (!phone) return '';
  const normalized = normalizePhoneNumber(phone, testCountry as SupportedCountry, true);
  return normalized || phone;
}

// Alias for backwards compatibility
export const normalizePhoneE164 = normalizeNotificationPhone;

/**
 * Generate a short, professional appointment confirmation message.
 *
 * CRITICAL GUARDRAIL:
 * Do NOT include sensitive medical information (no diagnosis, treatment details,
 * tooth pain, or medical history).
 */
export function generateAppointmentConfirmationMessage(params: {
  date: string;
  time: string;
}): string {
  const formattedDate = formatDatePretty(params.date);
  return `Your appointment with Dental Care & Implants of Houston – Greenspoint is confirmed for ${formattedDate} at ${params.time}. Please call ${CLINIC_INFO.phoneNewPatients} for questions.`;
}

/**
 * Generate a short, professional appointment cancellation message.
 *
 * CRITICAL GUARDRAIL:
 * Do NOT include diagnosis, symptoms, treatment details, or other sensitive health information.
 */
export function generateAppointmentCancellationMessage(params: {
  date: string;
  time: string;
}): string {
  const formattedDate = formatDatePretty(params.date);
  return `Your appointment scheduled for ${formattedDate} at ${params.time} has been cancelled. Please contact the clinic if you need assistance.`;
}

/**
 * Generate a short, professional appointment rescheduled message.
 *
 * CRITICAL GUARDRAIL:
 * Clearly contains the new appointment date and time.
 * Do NOT include sensitive dental or medical information.
 */
export function generateAppointmentRescheduledMessage(params: {
  newDate: string;
  newTime: string;
}): string {
  const formattedDate = formatDatePretty(params.newDate);
  return `Your appointment has been rescheduled to ${formattedDate} at ${params.newTime}. Please contact the clinic if you need assistance.`;
}

/**
 * Generate a generic 24-hour appointment reminder message.
 *
 * CRITICAL GUARDRAIL:
 * Generic and contains NO sensitive medical information (no symptoms, diagnosis, treatment details).
 */
export function generateAppointmentReminder24hMessage(params: {
  time: string;
}): string {
  return `Reminder: You have an appointment scheduled for tomorrow at ${params.time} at Dental Care & Implants of Houston - Greenspoint. Please contact the clinic if you need assistance.`;
}

/**
 * Generate a generic 2-hour appointment reminder message.
 *
 * CRITICAL GUARDRAIL:
 * Generic and contains NO sensitive medical information (no symptoms, diagnosis, treatment details).
 */
export function generateAppointmentReminder2hMessage(params: {
  time: string;
}): string {
  return `Reminder: You have an appointment scheduled today at ${params.time} at Dental Care & Implants of Houston - Greenspoint. Please contact the clinic if you need assistance.`;
}

/**
 * Generate a deterministic document ID for appointment confirmation notifications
 * to assist in atomic idempotency and duplicate prevention.
 */
export function getConfirmationNotificationDocId(appointmentId: string): string {
  const sanitizedApptId = appointmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `notif_confirm_${sanitizedApptId}`;
}

/**
 * Generate a deterministic document ID for 24-hour appointment reminder notification
 * to prevent duplicates and ensure atomic idempotency.
 */
export function getReminder24hDocId(appointmentId: string): string {
  const sanitizedApptId = appointmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `notif_remind_24h_${sanitizedApptId}`;
}

/**
 * Generate a deterministic document ID for 2-hour appointment reminder notification
 * to prevent duplicates and ensure atomic idempotency.
 */
export function getReminder2hDocId(appointmentId: string): string {
  const sanitizedApptId = appointmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `notif_remind_2h_${sanitizedApptId}`;
}

/**
 * Generate a deterministic document ID for appointment cancellation notifications
 * to ensure exactly one notification per cancelled appointment.
 */
export function getCancellationNotificationDocId(appointmentId: string): string {
  const sanitizedApptId = appointmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `notif_cancel_${sanitizedApptId}`;
}

/**
 * Generate a deterministic document ID for appointment rescheduling notifications.
 * If rescheduled multiple times, each distinct reschedule action has its own unique record.
 */
export function getRescheduledNotificationDocId(
  appointmentId: string,
  rescheduledAt?: string
): string {
  const sanitizedApptId = appointmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestampSuffix = rescheduledAt
    ? rescheduledAt.replace(/[^a-zA-Z0-9_-]/g, '_')
    : Date.now().toString();
  return `notif_resched_${sanitizedApptId}_${timestampSuffix}`;
}

/**
 * Create an appointment confirmation notification record in Firestore.
 *
 * Sequence & Guardrails:
 * 1. Normalized phone to E.164 (+1XXXXXXXXXX or +91XXXXXXXXXX based on NOTIFICATION_TEST_COUNTRY).
 * 2. Checks for existing confirmation notification for this appointmentId (duplicate protection).
 * 3. Initial status is strictly "pending" (no SMS provider connected yet).
 * 4. Never includes PHI or diagnosis.
 * 5. Fails gracefully without throwing, ensuring the booked appointment remains valid.
 */
export async function createAppointmentConfirmationNotification(params: {
  appointmentId: string;
  patientId?: string | null;
  patientName: string;
  phone: string;
  date: string;
  time: string;
}): Promise<{
  success: boolean;
  notificationId?: string;
  duplicate?: boolean;
  error?: string;
}> {
  try {
    if (!params.appointmentId) {
      console.warn('createAppointmentConfirmationNotification called without appointmentId');
      return { success: false, error: 'MISSING_APPOINTMENT_ID' };
    }

    const deterministicId = getConfirmationNotificationDocId(params.appointmentId);
    const deterministicRef = doc(db, NOTIFICATIONS_COLLECTION, deterministicId);

    // 1. Duplicate check (only if authenticated user has read access; otherwise write directly)
    if (auth.currentUser) {
      try {
        const existingDocSnap = await getDoc(deterministicRef);
        if (existingDocSnap.exists()) {
          console.log(
            `[Notifications] Confirmation notification already exists for appointment ${params.appointmentId} (doc ID: ${deterministicId}). Skipping duplicate creation.`
          );
          return {
            success: true,
            notificationId: deterministicId,
            duplicate: true,
          };
        }
      } catch (checkErr) {
        // Non-blocking
      }
    }

    // 3. Normalize phone for notification layer (respects NOTIFICATION_TEST_COUNTRY)
    const normalizedPhone = normalizeNotificationPhone(params.phone);

    // 4. Generate professional confirmation message without PHI
    const message = generateAppointmentConfirmationMessage({
      date: params.date,
      time: params.time,
    });

    const payload: Omit<NotificationRecord, 'id'> = {
      appointmentId: params.appointmentId,
      patientId: params.patientId || null,
      patientName: params.patientName?.trim() || 'Valued Patient',
      phone: normalizedPhone,
      channel: 'sms',
      type: 'appointment_confirmation',
      status: 'pending', // Strictly "pending" as required (no external SMS provider connected)
      message,
      createdAt: serverTimestamp(),
    };

    // 5. Store notification record in Firestore
    await setDoc(deterministicRef, payload);

    console.log(
      `[Notifications] Successfully prepared appointment confirmation notification record: ${deterministicId} (Status: pending)`
    );

    // Phase 6C: Create 24h and 2h reminder records after booking confirmation
    try {
      await createAppointmentReminderNotifications({
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        patientName: params.patientName,
        phone: params.phone,
        date: params.date,
        time: params.time,
      });
    } catch (reminderErr) {
      console.warn('[Notifications] Non-blocking reminder creation note:', reminderErr);
    }

    return {
      success: true,
      notificationId: deterministicId,
      duplicate: false,
    };
  } catch (err: any) {
    console.error('[Notifications] Failed to create confirmation notification record:', err);
    return {
      success: false,
      error: err?.message || 'NOTIFICATION_CREATION_FAILED',
    };
  }
}

/**
 * Create an appointment cancellation notification record in Firestore (Phase 6B).
 *
 * Sequence & Guardrails:
 * 1. Must be called only AFTER the cancellation transaction succeeds.
 * 2. Normalizes phone using Phase 6A normalization logic (+91 for Indian test numbers, preserving existing +).
 * 3. Checks for existing cancellation notification for this appointmentId (duplicate protection).
 * 4. Initial status is strictly "pending" (no SMS provider connected yet).
 * 5. Contains date and time, with no diagnosis, symptoms, or sensitive medical info.
 * 6. Non-blocking: logs any error without rolling back or failing the appointment cancellation.
 */
export async function createAppointmentCancellationNotification(params: {
  appointmentId: string;
  patientId?: string | null;
  patientName: string;
  phone: string;
  date: string;
  time: string;
}): Promise<{
  success: boolean;
  notificationId?: string;
  duplicate?: boolean;
  error?: string;
}> {
  try {
    if (!params.appointmentId) {
      console.warn('createAppointmentCancellationNotification called without appointmentId');
      return { success: false, error: 'MISSING_APPOINTMENT_ID' };
    }

    const deterministicId = getCancellationNotificationDocId(params.appointmentId);
    const deterministicRef = doc(db, NOTIFICATIONS_COLLECTION, deterministicId);

    // 1. Direct duplicate check via deterministic document ID
    try {
      const existingDocSnap = await getDoc(deterministicRef);
      if (existingDocSnap.exists()) {
        console.log(
          `[Notifications] Cancellation notification already exists for appointment ${params.appointmentId} (doc ID: ${deterministicId}). Skipping duplicate creation.`
        );
        return {
          success: true,
          notificationId: deterministicId,
          duplicate: true,
        };
      }
    } catch (checkErr) {
      console.warn('[Notifications] Deterministic doc check note:', checkErr);
    }

    // 2. Secondary duplicate check via Firestore query
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('appointmentId', '==', params.appointmentId),
        where('type', '==', 'appointment_cancellation'),
        limit(1)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const foundDoc = querySnap.docs[0];
        console.log(
          `[Notifications] Duplicate cancellation notification found via query for appointment ${params.appointmentId} (doc ID: ${foundDoc.id}). Skipping duplicate creation.`
        );
        return {
          success: true,
          notificationId: foundDoc.id,
          duplicate: true,
        };
      }
    } catch (queryErr) {
      console.warn('[Notifications] Query duplicate check note (proceeding with deterministic write):', queryErr);
    }

    // 3. Normalize phone for notification layer (respects NOTIFICATION_TEST_COUNTRY)
    const normalizedPhone = normalizeNotificationPhone(params.phone);

    // 4. Generate professional cancellation message without PHI
    const message = generateAppointmentCancellationMessage({
      date: params.date,
      time: params.time,
    });

    const payload: Omit<NotificationRecord, 'id'> = {
      appointmentId: params.appointmentId,
      patientId: params.patientId || null,
      patientName: params.patientName?.trim() || 'Valued Patient',
      phone: normalizedPhone,
      channel: 'sms',
      type: 'appointment_cancellation',
      status: 'pending', // Strictly "pending" as required (no external SMS provider connected)
      message,
      createdAt: serverTimestamp(),
    };

    // 5. Store notification record in Firestore
    await setDoc(deterministicRef, payload);

    console.log(
      `[Notifications] Successfully prepared appointment cancellation notification record: ${deterministicId} (Status: pending)`
    );

    return {
      success: true,
      notificationId: deterministicId,
      duplicate: false,
    };
  } catch (err: any) {
    console.error('[Notifications] Failed to create cancellation notification record:', err);
    return {
      success: false,
      error: err?.message || 'CANCELLATION_NOTIFICATION_CREATION_FAILED',
    };
  }
}

/**
 * Create an appointment rescheduled notification record in Firestore (Phase 6B).
 *
 * Sequence & Guardrails:
 * 1. Must be called only AFTER the rescheduling transaction succeeds.
 * 2. Normalizes phone using Phase 6A normalization logic.
 * 3. Supports multiple reschedules (each genuine rescheduling action creates its own record),
 *    while protecting against duplicate clicks/reloads for the same rescheduling event.
 * 4. Initial status is strictly "pending" (no SMS provider connected yet).
 * 5. Clearly contains the new appointment date and time, without sensitive medical information.
 * 6. Non-blocking: logs any error without rolling back or failing the appointment reschedule.
 */
export async function createAppointmentRescheduledNotification(params: {
  appointmentId: string;
  patientId?: string | null;
  patientName: string;
  phone: string;
  newDate: string;
  newTime: string;
  rescheduledAt?: string;
}): Promise<{
  success: boolean;
  notificationId?: string;
  duplicate?: boolean;
  error?: string;
}> {
  try {
    if (!params.appointmentId) {
      console.warn('createAppointmentRescheduledNotification called without appointmentId');
      return { success: false, error: 'MISSING_APPOINTMENT_ID' };
    }

    const deterministicId = getRescheduledNotificationDocId(
      params.appointmentId,
      params.rescheduledAt
    );
    const deterministicRef = doc(db, NOTIFICATIONS_COLLECTION, deterministicId);

    // 1. Direct duplicate check via deterministic document ID
    try {
      const existingDocSnap = await getDoc(deterministicRef);
      if (existingDocSnap.exists()) {
        console.log(
          `[Notifications] Reschedule notification already exists for appointment ${params.appointmentId} with timestamp ${params.rescheduledAt} (doc ID: ${deterministicId}). Skipping duplicate creation.`
        );
        return {
          success: true,
          notificationId: deterministicId,
          duplicate: true,
        };
      }
    } catch (checkErr) {
      console.warn('[Notifications] Deterministic doc check note:', checkErr);
    }

    // 2. Generate professional rescheduled message with new date and new time without PHI
    const message = generateAppointmentRescheduledMessage({
      newDate: params.newDate,
      newTime: params.newTime,
    });

    // 3. Secondary duplicate check via Firestore query for same message
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('appointmentId', '==', params.appointmentId),
        where('type', '==', 'appointment_rescheduled'),
        where('message', '==', message),
        limit(1)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const foundDoc = querySnap.docs[0];
        console.log(
          `[Notifications] Duplicate rescheduling notification with identical target date/time found for appointment ${params.appointmentId} (doc ID: ${foundDoc.id}). Skipping duplicate creation.`
        );
        return {
          success: true,
          notificationId: foundDoc.id,
          duplicate: true,
        };
      }
    } catch (queryErr) {
      console.warn('[Notifications] Query duplicate check note (proceeding with deterministic write):', queryErr);
    }

    // 4. Normalize phone for notification layer (respects NOTIFICATION_TEST_COUNTRY)
    const normalizedPhone = normalizeNotificationPhone(params.phone);

    const payload: Omit<NotificationRecord, 'id'> = {
      appointmentId: params.appointmentId,
      patientId: params.patientId || null,
      patientName: params.patientName?.trim() || 'Valued Patient',
      phone: normalizedPhone,
      channel: 'sms',
      type: 'appointment_rescheduled',
      status: 'pending', // Strictly "pending" as required (no external SMS provider connected)
      message,
      createdAt: serverTimestamp(),
    };

    // 5. Store notification record in Firestore
    await setDoc(deterministicRef, payload);

    console.log(
      `[Notifications] Successfully prepared appointment rescheduled notification record: ${deterministicId} (Status: pending)`
    );

    return {
      success: true,
      notificationId: deterministicId,
      duplicate: false,
    };
  } catch (err: any) {
    console.error('[Notifications] Failed to create rescheduling notification record:', err);
    return {
      success: false,
      error: err?.message || 'RESCHEDULED_NOTIFICATION_CREATION_FAILED',
    };
  }
}

/**
 * Check if a notification exists for a given appointment ID.
 */
export async function getConfirmationNotificationForAppointment(
  appointmentId: string
): Promise<NotificationRecord | null> {
  try {
    const docId = getConfirmationNotificationDocId(appointmentId);
    const snap = await getDoc(doc(db, NOTIFICATIONS_COLLECTION, docId));
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<NotificationRecord, 'id'>) };
    }
    return null;
  } catch (err) {
    console.warn('[Notifications] Error retrieving confirmation notification:', err);
    return null;
  }
}

/**
 * Query all notifications (for Admin Notifications phase).
 */
export async function getAllNotifications(): Promise<NotificationRecord[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NotificationRecord, 'id'>),
    }));
  } catch (err) {
    console.warn('[Notifications] Error retrieving notifications list:', err);
    // Fallback if index not ready
    try {
      const qFallback = query(collection(db, NOTIFICATIONS_COLLECTION), limit(100));
      const snapFallback = await getDocs(qFallback);
      return snapFallback.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<NotificationRecord, 'id'>),
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Real-time listener for notification records (used by Admin Dashboard).
 */
export function subscribeToNotifications(
  callback: (notifications: NotificationRecord[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationRecord, 'id'>),
        }));
        callback(list);
      },
      (err) => {
        console.warn('[Notifications] Falling back to non-ordered snapshot:', err);
        // Fallback without orderBy in case of missing index or mixed types
        const fallbackQ = query(collection(db, NOTIFICATIONS_COLLECTION), limit(100));
        return onSnapshot(
          fallbackQ,
          (fallbackSnap) => {
            const list = fallbackSnap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<NotificationRecord, 'id'>),
            }));
            callback(list);
          },
          (fallbackErr) => {
            console.error('[Notifications] Failed to subscribe:', fallbackErr);
            if (onError) onError(fallbackErr);
          }
        );
      }
    );
  } catch (err) {
    console.error('[Notifications] Error initializing subscription:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetch all notification records associated with a specific appointment.
 */
export async function getNotificationsForAppointment(
  appointmentId: string
): Promise<NotificationRecord[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('appointmentId', '==', appointmentId),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NotificationRecord, 'id'>),
    }));
  } catch (err) {
    console.warn('[Notifications] Error retrieving appointment notifications:', err);
    return [];
  }
}

/**
 * Phase 6C: Create appointment reminder notification records in Firestore.
 *
 * Requirements:
 * Reminder 1:
 * - type: "appointment_reminder_24h"
 * - channel: "sms"
 * - status: "pending"
 * Reminder 2:
 * - type: "appointment_reminder_2h"
 * - channel: "sms"
 * - status: "pending"
 *
 * Guardrails:
 * - scheduledFor: exactly 24h and 2h before the appointment start time in Houston timezone.
 * - messages: generic and contain NO sensitive medical information.
 * - status: strictly "pending" (no SMS sent, concept demo).
 * - duplicate prevention: deterministic document IDs and check existing.
 * - non-blocking: catches errors and never fails the booking.
 */
export async function createAppointmentReminderNotifications(params: {
  appointmentId: string;
  patientId?: string | null;
  patientName: string;
  phone: string;
  date: string;
  time: string;
}): Promise<{
  success: boolean;
  reminders?: {
    reminder24hId?: string;
    reminder2hId?: string;
  };
  error?: string;
}> {
  try {
    if (!params.appointmentId) {
      console.warn('[Notifications] Missing appointmentId for reminder creation');
      return { success: false, error: 'MISSING_APPOINTMENT_ID' };
    }

    if (!params.date || !params.time) {
      console.warn('[Notifications] Missing date or time for reminder schedule calculation');
      return { success: false, error: 'MISSING_DATE_OR_TIME' };
    }

    // 1. Calculate scheduledFor times (Houston clinic timezone: America/Chicago)
    const { scheduledFor24h, scheduledFor2h } = calculateReminderScheduledTimes(
      params.date,
      params.time
    );

    // 2. Normalize recipient phone number
    const normalizedPhone = normalizeNotificationPhone(params.phone);
    const patientName = params.patientName?.trim() || 'Valued Patient';
    const patientId = params.patientId || null;

    const reminder24hId = getReminder24hDocId(params.appointmentId);
    const reminder2hId = getReminder2hDocId(params.appointmentId);

    const ref24h = doc(db, NOTIFICATIONS_COLLECTION, reminder24hId);
    const ref2h = doc(db, NOTIFICATIONS_COLLECTION, reminder2hId);

    // 3. Create 24h reminder
    try {
      let alreadyExists = false;
      if (auth.currentUser) {
        try {
          const snap24h = await getDoc(ref24h);
          alreadyExists = snap24h.exists();
        } catch {
          // Continue
        }
      }

      if (!alreadyExists) {
        const payload24h = {
          appointmentId: params.appointmentId,
          patientId,
          patientName,
          phone: normalizedPhone,
          channel: 'sms',
          type: 'appointment_reminder_24h',
          status: 'pending',
          message: generateAppointmentReminder24hMessage({ time: params.time }),
          scheduledFor: scheduledFor24h,
          createdAt: serverTimestamp(),
        };
        await setDoc(ref24h, payload24h);
        console.log(
          `[Notifications] Created 24h reminder notification: ${reminder24hId} (scheduled: ${scheduledFor24h})`
        );
      } else {
        console.log(`[Notifications] 24h reminder already exists: ${reminder24hId}`);
      }
    } catch (err24h) {
      console.warn('[Notifications] Error creating 24h reminder:', err24h);
    }

    // 4. Create 2h reminder
    try {
      let alreadyExists = false;
      if (auth.currentUser) {
        try {
          const snap2h = await getDoc(ref2h);
          alreadyExists = snap2h.exists();
        } catch {
          // Continue
        }
      }

      if (!alreadyExists) {
        const payload2h = {
          appointmentId: params.appointmentId,
          patientId,
          patientName,
          phone: normalizedPhone,
          channel: 'sms',
          type: 'appointment_reminder_2h',
          status: 'pending',
          message: generateAppointmentReminder2hMessage({ time: params.time }),
          scheduledFor: scheduledFor2h,
          createdAt: serverTimestamp(),
        };
        await setDoc(ref2h, payload2h);
        console.log(
          `[Notifications] Created 2h reminder notification: ${reminder2hId} (scheduled: ${scheduledFor2h})`
        );
      } else {
        console.log(`[Notifications] 2h reminder already exists: ${reminder2hId}`);
      }
    } catch (err2h) {
      console.warn('[Notifications] Error creating 2h reminder:', err2h);
    }

    return {
      success: true,
      reminders: {
        reminder24hId,
        reminder2hId,
      },
    };
  } catch (err: any) {
    console.error('[Notifications] Failed to create reminder notifications:', err);
    return {
      success: false,
      error: err?.message || 'REMINDER_CREATION_FAILED',
    };
  }
}

/**
 * Phase 6C: Cancel pending reminder notifications for an appointment.
 *
 * When an appointment is cancelled:
 * - Marks existing pending reminder records as "cancelled".
 * - Ensures pending reminder records for that appointment are NOT sent later.
 */
export async function cancelAppointmentReminders(
  appointmentId: string
): Promise<{ success: boolean; cancelledCount: number }> {
  let cancelledCount = 0;
  try {
    if (!appointmentId) return { success: false, cancelledCount: 0 };

    // Check 24h reminder doc
    const reminder24hId = getReminder24hDocId(appointmentId);
    const ref24h = doc(db, NOTIFICATIONS_COLLECTION, reminder24hId);
    try {
      const snap24h = await getDoc(ref24h);
      if (snap24h.exists()) {
        const data = snap24h.data();
        if (data.status === 'pending') {
          await updateDoc(ref24h, {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
          });
          cancelledCount++;
          console.log(`[Notifications] Marked 24h reminder as cancelled: ${reminder24hId}`);
        }
      }
    } catch (err) {
      console.warn('[Notifications] Could not update 24h reminder doc to cancelled:', err);
    }

    // Check 2h reminder doc
    const reminder2hId = getReminder2hDocId(appointmentId);
    const ref2h = doc(db, NOTIFICATIONS_COLLECTION, reminder2hId);
    try {
      const snap2h = await getDoc(ref2h);
      if (snap2h.exists()) {
        const data = snap2h.data();
        if (data.status === 'pending') {
          await updateDoc(ref2h, {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
          });
          cancelledCount++;
          console.log(`[Notifications] Marked 2h reminder as cancelled: ${reminder2hId}`);
        }
      }
    } catch (err) {
      console.warn('[Notifications] Could not update 2h reminder doc to cancelled:', err);
    }

    // Secondary query check for any other pending reminders for this appointment
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('appointmentId', '==', appointmentId),
        where('status', '==', 'pending')
      );
      const querySnap = await getDocs(q);
      for (const d of querySnap.docs) {
        const data = d.data();
        if (
          data.type === 'appointment_reminder_24h' ||
          data.type === 'appointment_reminder_2h'
        ) {
          await updateDoc(d.ref, {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
          });
          cancelledCount++;
          console.log(`[Notifications] Cancelled secondary reminder record: ${d.id}`);
        }
      }
    } catch (qErr) {
      console.warn('[Notifications] Secondary reminder cancellation query note:', qErr);
    }

    return { success: true, cancelledCount };
  } catch (err) {
    console.error('[Notifications] Error cancelling appointment reminders:', err);
    return { success: false, cancelledCount };
  }
}

/**
 * Phase 6C: Update reminder notifications schedule for a rescheduled appointment.
 *
 * When an appointment is rescheduled:
 * - Updates the appointment's reminder schedule to the NEW appointment date/time.
 * - Does not leave outdated pending reminders for the old appointment time.
 * - Avoids duplicate reminder records by reusing the deterministic document IDs.
 * - Updates messages to reflect the new time.
 * - Keeps status as "pending".
 */
export async function updateAppointmentRemindersForReschedule(params: {
  appointmentId: string;
  patientId?: string | null;
  patientName: string;
  phone: string;
  newDate: string;
  newTime: string;
}): Promise<{ success: boolean }> {
  try {
    if (!params.appointmentId || !params.newDate || !params.newTime) {
      console.warn('[Notifications] Missing parameters for reminder reschedule update');
      return { success: false };
    }

    // 1. Calculate new scheduled times
    const { scheduledFor24h, scheduledFor2h } = calculateReminderScheduledTimes(
      params.newDate,
      params.newTime
    );

    const normalizedPhone = normalizeNotificationPhone(params.phone);
    const patientName = params.patientName?.trim() || 'Valued Patient';
    const patientId = params.patientId || null;

    const reminder24hId = getReminder24hDocId(params.appointmentId);
    const reminder2hId = getReminder2hDocId(params.appointmentId);

    const ref24h = doc(db, NOTIFICATIONS_COLLECTION, reminder24hId);
    const ref2h = doc(db, NOTIFICATIONS_COLLECTION, reminder2hId);

    // 2. Update or upsert 24h reminder
    const payload24h = {
      appointmentId: params.appointmentId,
      patientId,
      patientName,
      phone: normalizedPhone,
      channel: 'sms',
      type: 'appointment_reminder_24h',
      status: 'pending',
      message: generateAppointmentReminder24hMessage({ time: params.newTime }),
      scheduledFor: scheduledFor24h,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref24h, payload24h, { merge: true });

    // 3. Update or upsert 2h reminder
    const payload2h = {
      appointmentId: params.appointmentId,
      patientId,
      patientName,
      phone: normalizedPhone,
      channel: 'sms',
      type: 'appointment_reminder_2h',
      status: 'pending',
      message: generateAppointmentReminder2hMessage({ time: params.newTime }),
      scheduledFor: scheduledFor2h,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref2h, payload2h, { merge: true });

    console.log(
      `[Notifications] Updated reminder schedule for rescheduled appointment ${params.appointmentId}: 24h at ${scheduledFor24h}, 2h at ${scheduledFor2h}`
    );

    return { success: true };
  } catch (err) {
    console.error('[Notifications] Failed to update reminders for reschedule:', err);
    return { success: false };
  }
}

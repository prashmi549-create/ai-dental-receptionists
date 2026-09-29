/**
 * Clinic Time & Timezone Utilities
 * Dental Care & Implants of Houston (Greenspoint, Houston, TX)
 * Timezone: America/Chicago (US Central Time)
 */

export const CLINIC_TIMEZONE = 'America/Chicago';

export interface HoustonDateTime {
  dateStr: string; // 'YYYY-MM-DD'
  timeStr: string; // e.g. '11:09 AM'
  hours: number; // 0-23
  minutes: number; // 0-59
  totalMinutes: number; // minutes since midnight (0-1439)
  isoString: string;
}

/**
 * Parses time string (e.g. "08:30 AM", "1:00 PM", "14:00") into total minutes since midnight
 * for exact chronological comparison.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/**
 * Returns current date and time in the clinic's local timezone (Houston, TX - America/Chicago).
 */
export function getHoustonCurrentDateTime(date = new Date()): HoustonDateTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = parseInt(getPart('hour'), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(getPart('minute'), 10);

  const dateStr = `${year}-${month}-${day}`;
  const totalMinutes = hour * 60 + minute;

  // Format 12-hour string
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const timeStr = `${pad(h12)}:${pad(minute)} ${ampm}`;

  return {
    dateStr,
    timeStr,
    hours: hour,
    minutes: minute,
    totalMinutes,
    isoString: date.toISOString(),
  };
}

/**
 * Determines whether an appointment slot or booked appointment has already passed
 * relative to Houston local time.
 *
 * Rules:
 * 1. If date < current Houston date -> ALREADY PASSED (true)
 * 2. If date > current Houston date -> FUTURE (false)
 * 3. If date === current Houston date:
 *    - If scheduled time is provided, passed if scheduled time <= current Houston time (true)
 *    - If no time provided, considered active for today (false)
 */
export function isSlotOrAppointmentExpired(
  dateStr?: string,
  timeStr?: string,
  currentHouston?: HoustonDateTime
): boolean {
  if (!dateStr) return false;
  const now = currentHouston || getHoustonCurrentDateTime();

  if (dateStr < now.dateStr) {
    return true;
  }
  if (dateStr > now.dateStr) {
    return false;
  }

  // Same date as today in Houston
  if (!timeStr) {
    return false;
  }

  const slotMinutes = parseTimeToMinutes(timeStr);
  return slotMinutes <= now.totalMinutes;
}

/**
  * Calculates the exact UTC Date object corresponding to an appointment date (YYYY-MM-DD)
  * and 12-hour time string (e.g. "10:30 AM") in the Houston clinic timezone (America/Chicago).
  */
export function getClinicAppointmentDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMinutes = parseTimeToMinutes(timeStr);
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;

  // Initial estimate: Houston is Central Time (UTC-5 during CDT or UTC-6 during CST).
  let utcMs = Date.UTC(y, m - 1, d, h + 5, min);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Iterative convergence to match the exact local time in America/Chicago
  for (let i = 0; i < 3; i++) {
    const parts = dtf.formatToParts(new Date(utcMs));
    const p: Record<string, string> = {};
    parts.forEach((x) => (p[x.type] = x.value));
    const curH = parseInt(p.hour === '24' ? '0' : p.hour, 10);
    const curMin = parseInt(p.minute, 10);
    const curY = parseInt(p.year, 10);
    const curM = parseInt(p.month, 10);
    const curD = parseInt(p.day, 10);

    const diffMs =
      Date.UTC(y, m - 1, d, h, min) - Date.UTC(curY, curM - 1, curD, curH, curMin);
    if (diffMs === 0) break;
    utcMs += diffMs;
  }
  return new Date(utcMs);
}

/**
 * Calculates scheduled reminder times (24 hours and 2 hours before the appointment start time).
 * Returns ISO strings in UTC format.
 */
export function calculateReminderScheduledTimes(dateStr: string, timeStr: string): {
  scheduledFor24h: string;
  scheduledFor2h: string;
  appointmentDateTime: Date;
} {
  const appointmentDateTime = getClinicAppointmentDateTime(dateStr, timeStr);
  const apptMs = appointmentDateTime.getTime();

  const ms24h = apptMs - 24 * 60 * 60 * 1000;
  const ms2h = apptMs - 2 * 60 * 60 * 1000;

  return {
    scheduledFor24h: new Date(ms24h).toISOString(),
    scheduledFor2h: new Date(ms2h).toISOString(),
    appointmentDateTime,
  };
}

/**
 * Formats a scheduled ISO timestamp into a user-friendly Houston local time string.
 */
export function formatScheduledForDisplay(isoString?: string): string {
  if (!isoString) return 'Not scheduled';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CLINIC_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Checks whether an appointment is active and upcoming according to Houston timezone rules:
 * - NOT cancelled
 * - Either future date, OR today and start time has not passed.
 */
export function isAppointmentActiveAndUpcoming(
  appointment?: { date?: string; time?: string; status?: string } | null,
  currentHouston?: HoustonDateTime
): boolean {
  if (!appointment) return false;
  if (appointment.status === 'cancelled') return false;
  if (!appointment.date) return false;
  const now = currentHouston || getHoustonCurrentDateTime();
  return !isSlotOrAppointmentExpired(appointment.date, appointment.time, now);
}

/**
 * Derives appointment date and time for a notification record.
 * Uses the related appointment if present, with fallback to calculating from reminder scheduledFor.
 */
export function deriveAppointmentDateTimeForNotification(
  notif: {
    appointmentId?: string;
    type?: string;
    scheduledFor?: string;
    status?: string;
  },
  appointment?: { date?: string; time?: string; status?: string } | null
): {
  dateStr?: string;
  timeStr?: string;
  isCancelled: boolean;
  isUpcoming: boolean;
  isToday: boolean;
} {
  const isCancelled =
    appointment?.status === 'cancelled' ||
    notif.status === 'cancelled' ||
    notif.type === 'appointment_cancellation';

  let dateStr = appointment?.date;
  let timeStr = appointment?.time;

  // Fallback: if appointment is not found in memory but notification has scheduledFor:
  if ((!dateStr || !timeStr) && notif.scheduledFor) {
    try {
      const scheduledDate = new Date(notif.scheduledFor);
      if (!isNaN(scheduledDate.getTime())) {
        const offsetMs =
          notif.type === 'appointment_reminder_24h'
            ? 24 * 60 * 60 * 1000
            : notif.type === 'appointment_reminder_2h'
            ? 2 * 60 * 60 * 1000
            : 0;
        const apptDate = new Date(scheduledDate.getTime() + offsetMs);
        const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone: CLINIC_TIMEZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const parts = dtf.formatToParts(apptDate);
        const p: Record<string, string> = {};
        parts.forEach((x) => (p[x.type] = x.value));
        if (p.year && p.month && p.day) {
          dateStr = `${p.year}-${p.month}-${p.day}`;
        }
        if (p.hour && p.minute && p.dayPeriod) {
          timeStr = `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
        }
      }
    } catch {
      // ignore
    }
  }

  const now = getHoustonCurrentDateTime();
  const isExpired = dateStr ? isSlotOrAppointmentExpired(dateStr, timeStr, now) : true;
  const isToday = dateStr === now.dateStr;
  const isUpcoming = !isCancelled && !isExpired && Boolean(dateStr);

  return {
    dateStr,
    timeStr,
    isCancelled,
    isUpcoming,
    isToday,
  };
}

/**
 * Schedule Configuration and Business Controls Service (Phase 9B)
 * Dental Care & Implants of Houston
 *
 * Manages:
 * - Clinic operating hours (Monday–Friday, Saturday, Sunday)
 * - Working days enabling/disabling (Monday - Sunday)
 * - Start-time granularity interval (15m, 30m, 60m)
 * - Future rolling availability window (e.g., 14, 30, 60 days)
 * - Urgent availability priority distribution
 * - Service -> Duration configuration with sensible demo defaults
 * - Firestore persistence (settings/scheduling and clinic_settings/schedule)
 * - Security & validation enforcing admin-only write permissions
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ClinicScheduleConfig, ServiceDurationConfigItem } from '../types';
import { parseTimeToMinutes, formatMinutesToTime } from '../utils/bookingConversationEngine';
import { normalizeSlotTime } from './demoSlotsService';

export const SETTINGS_COLLECTION = 'settings';
export const SCHEDULING_DOC_ID = 'scheduling';
export const CLINIC_SETTINGS_COLLECTION = 'clinic_settings';
export const SCHEDULE_CONFIG_DOC_ID = 'schedule';

export const ALL_DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DEFAULT_WORKING_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Default service durations (Phase 9B requirements):
 * - Consultation = 30 minutes
 * - General Dentistry / Cleaning = 60 minutes
 * - Filling = 60 minutes
 * - Root Canal = 90 minutes
 * - Dental Implant Consultation = 60 minutes
 * - Implant-related Procedure = 90 minutes
 * - Cosmetic Consultation = 60 minutes
 * - Invisalign / Clear Aligners Consultation = 60 minutes
 * - Emergency / Urgent Evaluation = 30 minutes
 * - Unmatched service = 30 minutes
 */
export const DEFAULT_SERVICE_DURATIONS: Record<string, number> = {
  // Phase 9B Canonical Services
  'Consultation': 30,
  'General Dentistry / Cleaning': 60,
  'Filling': 60,
  'Root Canal': 90,
  'Dental Implant Consultation': 60,
  'Implant-related Procedure': 90,
  'Cosmetic Consultation': 60,
  'Invisalign / Clear Aligners Consultation': 60,
  'Emergency / Urgent Evaluation': 30,
  'Unmatched service': 30,

  // Common aliases & variations for robust mapping
  'consultation': 30,
  'General Consultation': 30,
  'general-consultation': 30,
  'General Dentistry': 60,
  'Routine Checkup & Cleaning': 60,
  'General cleaning': 60,
  'cleaning': 60,
  'routine-cleaning': 60,
  'Checkup': 60,
  'filling': 60,
  'Filling / General Dentistry': 60,
  'dental-filling': 60,
  'Root Canals': 90,
  'root-canal': 90,
  'Root Canal Therapy': 90,
  'Dental Implants Consultation': 60,
  'Dental Implants': 60,
  'implants-consultation': 60,
  'Implant-Related Procedure / Full-Mouth': 90,
  'implant-procedure': 90,
  'Full-Mouth Dental Implants': 90,
  'Implant-Supported Dentures': 90,
  'Cosmetic Dentistry / Whitening': 60,
  'Cosmetic Dentistry & Whitening': 60,
  'Cosmetic Dentistry': 60,
  'teeth-whitening': 60,
  'Teeth Whitening': 60,
  'Invisalign® / Clear Aligners': 60,
  'Invisalign® & Clear Aligners': 60,
  'invisalign': 60,
  'Emergency / urgent evaluation': 30,
  'Urgent / Emergency Dental Evaluation': 30,
  'Emergency Dental Care': 30,
  'Tooth Pain / Urgent Discomfort': 30,
  'tooth-pain-urgent': 30,
  'Dental Crown or Bridge': 60,
  'Dental Crowns': 60,
  'Dental Bridges': 60,
  'Family Dentistry': 60,
  'preventive-care': 60,
  'Preventive Dental Care': 60,
  'sedation-dentistry': 60,
  'Sedation Dentistry': 60,
};

/**
 * 10 Canonical Configurable Services for Admin Business Controls UI
 */
export const CONFIGURABLE_SERVICES: ServiceDurationConfigItem[] = [
  {
    id: 'Consultation',
    name: 'Consultation',
    durationMinutes: 30,
    category: 'General & Preventive',
    description: 'General preliminary consultation, new patient conversation, or second opinion',
  },
  {
    id: 'General Dentistry / Cleaning',
    name: 'General Dentistry / Cleaning',
    durationMinutes: 60,
    category: 'General & Preventive',
    description: 'Comprehensive dental exam, routine prophylaxis cleaning & oral health review',
  },
  {
    id: 'Filling',
    name: 'Filling',
    durationMinutes: 60,
    category: 'General & Preventive',
    description: 'Composite tooth-colored restoration or minor cavity restoration',
  },
  {
    id: 'Root Canal',
    name: 'Root Canal',
    durationMinutes: 90,
    category: 'Specialty & Urgent',
    description: 'Endodontic procedure to relieve infection, alleviate pain & save the natural tooth',
  },
  {
    id: 'Dental Implant Consultation',
    name: 'Dental Implant Consultation',
    durationMinutes: 60,
    category: 'Restorative & Implants',
    description: 'Implant suitability assessment, bone density review & customized treatment plan',
  },
  {
    id: 'Implant-related Procedure',
    name: 'Implant-related Procedure',
    durationMinutes: 90,
    category: 'Restorative & Implants',
    description: 'Implant placement surgery, full-arch restoration, or implant-supported dentures',
  },
  {
    id: 'Cosmetic Consultation',
    name: 'Cosmetic Consultation',
    durationMinutes: 60,
    category: 'Cosmetic & Ortho',
    description: 'Aesthetic smile evaluation, veneers consultation, or in-office whitening plan',
  },
  {
    id: 'Invisalign / Clear Aligners Consultation',
    name: 'Invisalign / Clear Aligners Consultation',
    durationMinutes: 60,
    category: 'Cosmetic & Ortho',
    description: 'Digital smile scans, orthodontic alignment assessment & clear aligner preview',
  },
  {
    id: 'Emergency / Urgent Evaluation',
    name: 'Emergency / Urgent Evaluation',
    durationMinutes: 30,
    category: 'Specialty & Urgent',
    description: 'Acute toothache diagnostic, emergency trauma evaluation & immediate pain relief',
  },
  {
    id: 'Unmatched service',
    name: 'Unmatched service',
    durationMinutes: 30,
    category: 'General & Preventive',
    description: 'Default scheduling duration fallback for unrecognized or custom dental requests',
  },
];

export const DEFAULT_CLINIC_SCHEDULE_CONFIG: ClinicScheduleConfig = {
  timezone: 'America/Chicago',
  workingDays: [...DEFAULT_WORKING_DAYS],
  weekdayOpen: '08:00 AM',
  weekdayClose: '07:00 PM',
  weekdayOpeningTime: '08:00',
  weekdayClosingTime: '19:00',
  saturdayOpen: '08:00 AM',
  saturdayClose: '05:00 PM',
  saturdayOpeningTime: '08:00',
  saturdayClosingTime: '17:00',
  sundayOpen: false,
  sundayOpeningTime: '09:00',
  sundayClosingTime: '14:00',
  sundayOpenTime: '09:00 AM',
  sundayCloseTime: '02:00 PM',
  slotIntervalMinutes: 30,
  availabilityWindowDays: 30,
  urgentSlotsPerDay: 2,
  urgentSlotTimes: ['08:00 AM', '01:30 PM'],
  serviceDurations: { ...DEFAULT_SERVICE_DURATIONS },
};

// In-memory cache for fast lookup during high-volume slot evaluation
let cachedConfig: ClinicScheduleConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Returns currently loaded config from memory cache or default
 */
export function getLoadedClinicScheduleConfig(): ClinicScheduleConfig {
  return cachedConfig || DEFAULT_CLINIC_SCHEDULE_CONFIG;
}

/**
 * Converts 24-hour time "08:00" or "19:00" to 12-hour "08:00 AM" or "07:00 PM"
 */
export function time24To12(time24: string): string {
  if (!time24) return '08:00 AM';
  if (time24.includes('AM') || time24.includes('PM')) {
    return normalizeSlotTime(time24);
  }
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Converts 12-hour time "08:00 AM" or "07:00 PM" to 24-hour "08:00" or "19:00"
 */
export function time12To24(time12: string): string {
  if (!time12) return '08:00';
  const mins = parseTimeToMinutes(time12);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Fetch clinic schedule config from Firestore with multi-document support & caching.
 * Tries settings/scheduling first, then clinic_settings/schedule.
 */
export async function getClinicScheduleConfig(forceRefresh = false): Promise<ClinicScheduleConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    // 1. Try settings/scheduling (preferred single settings document)
    let docRef = doc(db, SETTINGS_COLLECTION, SCHEDULING_DOC_ID);
    let snap = await getDoc(docRef);

    // 2. If not found, try legacy clinic_settings/schedule
    if (!snap.exists()) {
      docRef = doc(db, CLINIC_SETTINGS_COLLECTION, SCHEDULE_CONFIG_DOC_ID);
      snap = await getDoc(docRef);
    }

    if (snap.exists()) {
      const data = snap.data() as Partial<ClinicScheduleConfig>;
      
      const weekdayOpen = data.weekdayOpen || (data.weekdayOpeningTime ? time24To12(data.weekdayOpeningTime) : DEFAULT_CLINIC_SCHEDULE_CONFIG.weekdayOpen);
      const weekdayClose = data.weekdayClose || (data.weekdayClosingTime ? time24To12(data.weekdayClosingTime) : DEFAULT_CLINIC_SCHEDULE_CONFIG.weekdayClose);
      const saturdayOpen = data.saturdayOpen || (data.saturdayOpeningTime ? time24To12(data.saturdayOpeningTime) : DEFAULT_CLINIC_SCHEDULE_CONFIG.saturdayOpen);
      const saturdayClose = data.saturdayClose || (data.saturdayClosingTime ? time24To12(data.saturdayClosingTime) : DEFAULT_CLINIC_SCHEDULE_CONFIG.saturdayClose);

      const workingDays = Array.isArray(data.workingDays) && data.workingDays.length > 0
        ? data.workingDays
        : [...DEFAULT_WORKING_DAYS];

      const merged: ClinicScheduleConfig = {
        ...DEFAULT_CLINIC_SCHEDULE_CONFIG,
        ...data,
        timezone: data.timezone || 'America/Chicago',
        workingDays,
        weekdayOpen,
        weekdayClose,
        weekdayOpeningTime: data.weekdayOpeningTime || time12To24(weekdayOpen),
        weekdayClosingTime: data.weekdayClosingTime || time12To24(weekdayClose),
        saturdayOpen,
        saturdayClose,
        saturdayOpeningTime: data.saturdayOpeningTime || time12To24(saturdayOpen),
        saturdayClosingTime: data.saturdayClosingTime || time12To24(saturdayClose),
        sundayOpen: data.sundayOpen !== undefined ? data.sundayOpen : workingDays.includes('Sunday'),
        slotIntervalMinutes: Number(data.slotIntervalMinutes) || 30,
        availabilityWindowDays: Number(data.availabilityWindowDays) || 30,
        urgentSlotsPerDay: Number(data.urgentSlotsPerDay) || 2,
        urgentSlotTimes: Array.isArray(data.urgentSlotTimes) && data.urgentSlotTimes.length > 0 ? data.urgentSlotTimes : ['08:00 AM', '01:30 PM'],
        serviceDurations: {
          ...DEFAULT_SERVICE_DURATIONS,
          ...(data.serviceDurations || {}),
        },
      };

      cachedConfig = merged;
      lastFetchTime = now;
      return merged;
    }
  } catch (err) {
    console.warn('Could not read clinic schedule settings from Firestore, using defaults:', err);
  }

  cachedConfig = { ...DEFAULT_CLINIC_SCHEDULE_CONFIG };
  lastFetchTime = now;
  return cachedConfig;
}

/**
 * Validates schedule settings before saving
 */
export function validateScheduleConfig(config: Partial<ClinicScheduleConfig>): { valid: boolean; error?: string } {
  // Weekday open/close check
  const wOpen = config.weekdayOpen || (config.weekdayOpeningTime ? time24To12(config.weekdayOpeningTime) : '08:00 AM');
  const wClose = config.weekdayClose || (config.weekdayClosingTime ? time24To12(config.weekdayClosingTime) : '07:00 PM');
  const wOpenM = parseTimeToMinutes(wOpen);
  const wCloseM = parseTimeToMinutes(wClose);
  if (wCloseM <= wOpenM) {
    return { valid: false, error: 'Monday–Friday closing time must be after opening time.' };
  }

  // Saturday open/close check
  const sOpen = config.saturdayOpen || (config.saturdayOpeningTime ? time24To12(config.saturdayOpeningTime) : '08:00 AM');
  const sClose = config.saturdayClose || (config.saturdayClosingTime ? time24To12(config.saturdayClosingTime) : '05:00 PM');
  const sOpenM = parseTimeToMinutes(sOpen);
  const sCloseM = parseTimeToMinutes(sClose);
  if (sCloseM <= sOpenM) {
    return { valid: false, error: 'Saturday closing time must be after opening time.' };
  }

  // Sunday check if enabled
  if (config.sundayOpen) {
    const suOpen = config.sundayOpenTime || (config.sundayOpeningTime ? time24To12(config.sundayOpeningTime) : '09:00 AM');
    const suClose = config.sundayCloseTime || (config.sundayClosingTime ? time24To12(config.sundayClosingTime) : '02:00 PM');
    const suOpenM = parseTimeToMinutes(suOpen);
    const suCloseM = parseTimeToMinutes(suClose);
    if (suCloseM <= suOpenM) {
      return { valid: false, error: 'Sunday closing time must be after opening time.' };
    }
  }

  // Slot Interval check
  if (config.slotIntervalMinutes !== undefined) {
    if (config.slotIntervalMinutes <= 0 || isNaN(config.slotIntervalMinutes)) {
      return { valid: false, error: 'Slot start interval must be a positive number of minutes (e.g., 30 or 60).' };
    }
  }

  // Availability Window check
  if (config.availabilityWindowDays !== undefined) {
    if (config.availabilityWindowDays <= 0 || isNaN(config.availabilityWindowDays)) {
      return { valid: false, error: 'Availability horizon window must be a positive number of days (e.g., 14, 30, or 60).' };
    }
  }

  // Service Durations check
  if (config.serviceDurations) {
    for (const [key, dur] of Object.entries(config.serviceDurations)) {
      if (typeof dur !== 'number' || isNaN(dur) || dur <= 0) {
        return { valid: false, error: `Invalid duration for ${key}. Durations must be positive numbers.` };
      }
    }
  }

  return { valid: true };
}

/**
 * Save clinic schedule config to Firestore in settings/scheduling and clinic_settings/schedule.
 * Only callable by authorized admins via UI/rules.
 */
export async function saveClinicScheduleConfig(
  config: Partial<ClinicScheduleConfig>,
  adminEmail?: string
): Promise<{ success: boolean; config: ClinicScheduleConfig; error?: string }> {
  // Validate first
  const validation = validateScheduleConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      config: cachedConfig || DEFAULT_CLINIC_SCHEDULE_CONFIG,
      error: validation.error,
    };
  }

  try {
    const current = await getClinicScheduleConfig(true);

    const weekdayOpen = config.weekdayOpen || (config.weekdayOpeningTime ? time24To12(config.weekdayOpeningTime) : current.weekdayOpen);
    const weekdayClose = config.weekdayClose || (config.weekdayClosingTime ? time24To12(config.weekdayClosingTime) : current.weekdayClose);
    const saturdayOpen = config.saturdayOpen || (config.saturdayOpeningTime ? time24To12(config.saturdayOpeningTime) : current.saturdayOpen);
    const saturdayClose = config.saturdayClose || (config.saturdayClosingTime ? time24To12(config.saturdayClosingTime) : current.saturdayClose);

    const workingDays = config.workingDays || current.workingDays;
    const sundayOpen = config.sundayOpen !== undefined
      ? config.sundayOpen
      : workingDays.includes('Sunday');

    const updated: ClinicScheduleConfig = {
      ...current,
      ...config,
      timezone: 'America/Chicago',
      workingDays,
      weekdayOpen,
      weekdayClose,
      weekdayOpeningTime: config.weekdayOpeningTime || time12To24(weekdayOpen),
      weekdayClosingTime: config.weekdayClosingTime || time12To24(weekdayClose),
      saturdayOpen,
      saturdayClose,
      saturdayOpeningTime: config.saturdayOpeningTime || time12To24(saturdayOpen),
      saturdayClosingTime: config.saturdayClosingTime || time12To24(saturdayClose),
      sundayOpen,
      slotIntervalMinutes: Number(config.slotIntervalMinutes) || current.slotIntervalMinutes || 30,
      availabilityWindowDays: Number(config.availabilityWindowDays) || current.availabilityWindowDays || 30,
      urgentSlotsPerDay: Number(config.urgentSlotsPerDay) || current.urgentSlotsPerDay || 2,
      urgentSlotTimes: config.urgentSlotTimes || current.urgentSlotTimes,
      serviceDurations: {
        ...current.serviceDurations,
        ...(config.serviceDurations || {}),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail || 'admin',
    };

    // Propagate durations to canonical keys and aliases
    if (config.serviceDurations) {
      for (const [sKey, sDur] of Object.entries(config.serviceDurations)) {
        if (sKey === 'Root Canal') {
          updated.serviceDurations['Root Canals'] = sDur;
          updated.serviceDurations['root-canal'] = sDur;
          updated.serviceDurations['Root Canal Therapy'] = sDur;
        } else if (sKey === 'General Dentistry / Cleaning') {
          updated.serviceDurations['Routine Checkup & Cleaning'] = sDur;
          updated.serviceDurations['General cleaning'] = sDur;
          updated.serviceDurations['cleaning'] = sDur;
          updated.serviceDurations['routine-cleaning'] = sDur;
        } else if (sKey === 'Filling') {
          updated.serviceDurations['Filling / General Dentistry'] = sDur;
          updated.serviceDurations['filling'] = sDur;
          updated.serviceDurations['dental-filling'] = sDur;
        } else if (sKey === 'Dental Implant Consultation') {
          updated.serviceDurations['Dental Implants Consultation'] = sDur;
          updated.serviceDurations['Dental Implants'] = sDur;
          updated.serviceDurations['implants-consultation'] = sDur;
        } else if (sKey === 'Implant-related Procedure') {
          updated.serviceDurations['Implant-Related Procedure / Full-Mouth'] = sDur;
          updated.serviceDurations['implant-procedure'] = sDur;
          updated.serviceDurations['Full-Mouth Dental Implants'] = sDur;
          updated.serviceDurations['Implant-Supported Dentures'] = sDur;
        } else if (sKey === 'Cosmetic Consultation') {
          updated.serviceDurations['Cosmetic Dentistry / Whitening'] = sDur;
          updated.serviceDurations['Cosmetic Dentistry & Whitening'] = sDur;
          updated.serviceDurations['teeth-whitening'] = sDur;
          updated.serviceDurations['Teeth Whitening'] = sDur;
        } else if (sKey === 'Invisalign / Clear Aligners Consultation') {
          updated.serviceDurations['Invisalign® / Clear Aligners'] = sDur;
          updated.serviceDurations['Invisalign® & Clear Aligners'] = sDur;
          updated.serviceDurations['invisalign'] = sDur;
        } else if (sKey === 'Emergency / Urgent Evaluation') {
          updated.serviceDurations['Emergency / urgent evaluation'] = sDur;
          updated.serviceDurations['Emergency Dental Care'] = sDur;
          updated.serviceDurations['Tooth Pain / Urgent Discomfort'] = sDur;
          updated.serviceDurations['Urgent / Emergency Dental Evaluation'] = sDur;
        } else if (sKey === 'Consultation') {
          updated.serviceDurations['consultation'] = sDur;
          updated.serviceDurations['General Consultation'] = sDur;
        }
      }
    }

    // Save to primary settings/scheduling
    const settingsDocRef = doc(db, SETTINGS_COLLECTION, SCHEDULING_DOC_ID);
    await setDoc(settingsDocRef, updated, { merge: true });

    // Also sync to legacy clinic_settings/schedule for backwards compatibility
    try {
      const legacyDocRef = doc(db, CLINIC_SETTINGS_COLLECTION, SCHEDULE_CONFIG_DOC_ID);
      await setDoc(legacyDocRef, updated, { merge: true });
    } catch (legacyErr) {
      console.warn('Could not sync to legacy clinic_settings/schedule:', legacyErr);
    }

    cachedConfig = updated;
    lastFetchTime = Date.now();

    return { success: true, config: updated };
  } catch (err: any) {
    console.error('Error saving clinic schedule config:', err);
    const friendlyError =
      err?.code === 'permission-denied' ||
      err?.message?.includes('permission') ||
      err?.message?.includes('insufficient')
        ? "You don't have permission to modify clinic settings."
        : err?.message || 'Failed to save configuration to database';
    return {
      success: false,
      config: cachedConfig || DEFAULT_CLINIC_SCHEDULE_CONFIG,
      error: friendlyError,
    };
  }
}

/**
 * Checks if the clinic is closed on a specific ISO date (YYYY-MM-DD)
 * based on workingDays and sundayOpen settings.
 */
export function isClinicClosedOnDate(
  dateStr: string,
  config?: ClinicScheduleConfig
): { isClosed: boolean; reason: string; dayName: string } {
  if (!dateStr) return { isClosed: false, reason: '', dayName: '' };

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayIndex = dateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayIndex];

  const conf = config || cachedConfig || DEFAULT_CLINIC_SCHEDULE_CONFIG;

  // Sunday check
  if (dayIndex === 0) {
    const isSunOpen = !!conf.sundayOpen || (conf.workingDays && conf.workingDays.includes('Sunday'));
    if (!isSunOpen) {
      return {
        isClosed: true,
        reason: 'sunday_closed',
        dayName: 'Sunday',
      };
    }
  }

  // Working days check
  if (conf.workingDays && Array.isArray(conf.workingDays)) {
    if (!conf.workingDays.includes(dayName)) {
      return {
        isClosed: true,
        reason: 'day_disabled',
        dayName,
      };
    }
  }

  return { isClosed: false, reason: '', dayName };
}

/**
 * Calculates clinic operating hours (opening & closing in minutes from midnight)
 * for a specific date (YYYY-MM-DD), respecting working days, Sunday open/close,
 * and weekday/Saturday schedule configs.
 */
export function getClinicOperatingHoursForDate(
  dateStr: string,
  config?: ClinicScheduleConfig
): {
  isClosed: boolean;
  openMinutes: number;
  closeMinutes: number;
  openTimeStr: string;
  closeTimeStr: string;
  reason?: string;
  dayName: string;
} {
  const conf = config || cachedConfig || DEFAULT_CLINIC_SCHEDULE_CONFIG;
  const closedCheck = isClinicClosedOnDate(dateStr, conf);
  if (closedCheck.isClosed) {
    return {
      isClosed: true,
      openMinutes: 0,
      closeMinutes: 0,
      openTimeStr: '',
      closeTimeStr: '',
      reason: closedCheck.reason,
      dayName: closedCheck.dayName,
    };
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

  let openStr = conf.weekdayOpen || '08:00 AM';
  let closeStr = conf.weekdayClose || '07:00 PM';

  if (dayOfWeek === 6) {
    // Saturday
    openStr = conf.saturdayOpen || '08:00 AM';
    closeStr = conf.saturdayClose || '05:00 PM';
  } else if (dayOfWeek === 0 && conf.sundayOpen) {
    openStr = conf.sundayOpenTime || conf.sundayOpeningTime || '09:00 AM';
    closeStr = conf.sundayCloseTime || conf.sundayClosingTime || '02:00 PM';
  }

  const openMinutes = parseTimeToMinutes(openStr) || 8 * 60;
  const closeMinutes = parseTimeToMinutes(closeStr) || 19 * 60;

  return {
    isClosed: false,
    openMinutes,
    closeMinutes,
    openTimeStr: openStr,
    closeTimeStr: closeStr,
    dayName: closedCheck.dayName,
  };
}

/**
 * Validates whether an appointment start time and duration fits completely within clinic operating hours.
 */
export function isAppointmentWithinClinicHours(
  dateStr: string,
  startTime: string,
  durationMinutes: number,
  config?: ClinicScheduleConfig
): { valid: boolean; reason?: string } {
  if (!dateStr || !startTime) {
    return { valid: false, reason: 'Missing appointment date or time.' };
  }

  const hours = getClinicOperatingHoursForDate(dateStr, config);
  if (hours.isClosed) {
    return {
      valid: false,
      reason: `Clinic is closed on ${hours.dayName} (${dateStr}).`,
    };
  }

  const startMin = parseTimeToMinutes(startTime);
  const dur = Number(durationMinutes) || 30;
  const endMin = startMin + dur;

  if (startMin < hours.openMinutes) {
    return {
      valid: false,
      reason: `Appointment start time (${startTime}) is before clinic opening time (${hours.openTimeStr}).`,
    };
  }

  if (endMin > hours.closeMinutes) {
    return {
      valid: false,
      reason: `Appointment end time exceeds clinic closing time (${hours.closeTimeStr}). The ${dur}-minute appointment cannot finish before closing.`,
    };
  }

  return { valid: true };
}

/**
 * Resolves the duration in minutes for a given service or visit reason.
 * Fallback is strictly 30 minutes if unconfigured.
 */
export function resolveServiceDuration(
  serviceOrReason?: string,
  config?: ClinicScheduleConfig
): number {
  if (!serviceOrReason) return 30;

  const durations = config?.serviceDurations || cachedConfig?.serviceDurations || DEFAULT_SERVICE_DURATIONS;

  // Direct exact match
  if (durations[serviceOrReason] !== undefined) {
    return durations[serviceOrReason];
  }

  const lower = serviceOrReason.trim().toLowerCase();

  // Root canal
  if (lower.includes('root canal')) {
    return durations['Root Canal'] || durations['Root Canals'] || 90;
  }

  // Full-mouth or complex implant procedure
  if (
    lower.includes('full-mouth') ||
    lower.includes('full mouth') ||
    lower.includes('implant-supported') ||
    (lower.includes('implant') && lower.includes('procedure'))
  ) {
    return durations['Implant-related Procedure'] || durations['Implant-Related Procedure / Full-Mouth'] || 90;
  }

  // Routine cleaning / checkup
  if (
    lower.includes('cleaning') ||
    lower.includes('checkup') ||
    lower.includes('check-up') ||
    lower.includes('preventive') ||
    lower.includes('exam')
  ) {
    return durations['General Dentistry / Cleaning'] || durations['Routine Checkup & Cleaning'] || 60;
  }

  // Dental implants consultation
  if (lower.includes('implant')) {
    return durations['Dental Implant Consultation'] || durations['Dental Implants Consultation'] || 60;
  }

  // Filling / general dentistry
  if (
    lower.includes('filling') ||
    lower.includes('cavity') ||
    lower.includes('restoration') ||
    lower.includes('general dentistry')
  ) {
    return durations['Filling'] || durations['Filling / General Dentistry'] || 60;
  }

  // Invisalign / Clear Aligners
  if (lower.includes('invisalign') || lower.includes('aligner')) {
    return durations['Invisalign / Clear Aligners Consultation'] || durations['Invisalign® / Clear Aligners'] || 60;
  }

  // Cosmetic / Whitening / Veneers
  if (
    lower.includes('cosmetic') ||
    lower.includes('whitening') ||
    lower.includes('veneer')
  ) {
    return durations['Cosmetic Consultation'] || durations['Cosmetic Dentistry / Whitening'] || 60;
  }

  // Dental Crown or Bridge
  if (lower.includes('crown') || lower.includes('bridge')) {
    return durations['Dental Crown or Bridge'] || durations['General Dentistry / Cleaning'] || 60;
  }

  // Emergency / Urgent evaluation
  if (
    lower.includes('emergency') ||
    lower.includes('urgent') ||
    lower.includes('tooth pain') ||
    lower.includes('toothache') ||
    lower.includes('ache')
  ) {
    return durations['Emergency / Urgent Evaluation'] || durations['Emergency / urgent evaluation'] || 30;
  }

  // Consultation
  if (lower.includes('consultation') || lower.includes('consult')) {
    return durations['Consultation'] || durations['General Consultation'] || 30;
  }

  // Safe fallback for unconfigured service: Unmatched service duration or 30
  return durations['Unmatched service'] || 30;
}

/**
 * Computes end time formatted string from a start time and duration in minutes.
 * E.g., ("09:00 AM", 60) -> "10:00 AM"
 * E.g., ("08:30 AM", 90) -> "10:00 AM"
 */
export function computeEndTime(startTimeStr: string, durationMinutes: number): string {
  const normalizedStart = normalizeSlotTime(startTimeStr);
  const startMinutes = parseTimeToMinutes(normalizedStart);
  const endMinutes = startMinutes + durationMinutes;
  return formatMinutesToTime(endMinutes);
}

/**
 * Checks if two half-open time intervals [start1, start1 + dur1) and [start2, start2 + dur2) overlap.
 */
export function doTimeIntervalsOverlap(
  start1Minutes: number,
  dur1Minutes: number,
  start2Minutes: number,
  dur2Minutes: number
): boolean {
  const end1 = start1Minutes + dur1Minutes;
  const end2 = start2Minutes + dur2Minutes;
  return Math.max(start1Minutes, start2Minutes) < Math.min(end1, end2);
}

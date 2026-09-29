import { DemoAppointmentSlot, PatientType } from '../types';
import { isSlotOrAppointmentExpired, getHoustonCurrentDateTime } from './clinicTime';

export interface ExtractedBookingIntent {
  isBooking: boolean;
  patientType?: PatientType;
  visitReason?: string;
  datePreference?: {
    dateStr: string;
    label: string;
    isSunday: boolean;
  };
  timePreference?: {
    targetTime?: string;
    targetHour?: number;
    period?: 'morning' | 'afternoon';
    minMinutes?: number;
    maxMinutes?: number;
    rawLabel?: string;
  };
  contactName?: string;
  contactPhone?: string;
  isCancellation?: boolean;
  isAffirmative?: boolean;
  isChangeRequest?: boolean;
  isSelectingSlotTime?: string;
}

export function parseTimeToMinutes(timeStr: string): number {
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

export function formatMinutesToTime(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${pad(hours)}:${pad(minutes)} ${meridiem}`;
}

export function formatDatePretty(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return dateStr;

  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function isSundayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return false;
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0;
}

/**
 * Standard emergency safety message when patient presents potentially life-threatening medical symptoms
 */
export const LIFE_THREATENING_EMERGENCY_GUIDANCE =
  "If you are experiencing difficulty breathing, difficulty swallowing, severe facial swelling, or uncontrolled bleeding, please seek immediate emergency medical care or call 911 right away. Dental clinics are not equipped to treat life-threatening medical emergencies.";

/**
 * Check if the patient describes potentially life-threatening emergency symptoms.
 * When true, the assistant must direct the patient to call 911 / emergency care immediately.
 */
export function isLifeThreateningEmergency(text: string): boolean {
  const lower = text.trim().toLowerCase();

  const emergencyPatterns = [
    'difficulty breathing',
    'trouble breathing',
    'hard to breathe',
    'cant breathe',
    "can't breathe",
    'cannot breathe',
    'shortness of breath',
    'gasping for air',
    'difficulty swallowing',
    'trouble swallowing',
    'hard to swallow',
    'cant swallow',
    "can't swallow",
    'cannot swallow',
    'throat swelling',
    'swelling in throat',
    'throat is swollen',
    'closing my airway',
    'airway obstruction',
    'major facial swelling',
    'severe facial swelling',
    'face is swelling',
    'swelling affecting breathing',
    'swelling affecting swallowing',
    'severe uncontrolled bleeding',
    'uncontrolled bleeding',
    'severe bleeding',
    'bleeding won\'t stop',
    'bleeding wont stop',
    'continuous bleeding',
    'heavy bleeding',
    'broken jaw',
    'jaw broken',
    'fractured jaw',
    'serious facial trauma',
    'facial trauma',
    'face trauma',
    'serious trauma',
    'loss of consciousness',
    'lost consciousness',
    'passed out',
    'blacked out',
    'unconscious',
    'head trauma',
  ];

  return emergencyPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Check if the patient has an urgent dental complaint.
 * Includes: tooth pain, severe toothache, dental pain, sudden discomfort,
 * broken/damaged tooth pain, swelling with pain, abscess, etc.
 */
export function isUrgentDentalComplaint(text: string): boolean {
  const lower = text.trim().toLowerCase();

  const urgentPatterns = [
    'tooth pain',
    'severe toothache',
    'toothache',
    'tooth ache',
    'dental pain',
    'sudden dental discomfort',
    'dental discomfort',
    'urgent discomfort',
    'severe sensitivity',
    'broken tooth',
    'damaged tooth',
    'chipped tooth',
    'cracked tooth',
    'swelling',
    'swollen gum',
    'swollen cheek',
    'swollen jaw',
    'abscess',
    'tooth is hurting',
    'teeth hurting',
    'tooth hurts',
    'teeth hurt',
    'hurting badly',
    'throbbing pain',
    'unbearable pain',
    'killing me',
    'urgent appointment',
    'urgent dental',
    'emergency dental',
    'emergency appointment',
  ];

  return urgentPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Check if the user intends to cancel or abort the booking process
 */
export function isCancellationIntent(text: string): boolean {
  const lower = text.trim().toLowerCase();
  const cancelPhrases = [
    'never mind',
    'nevermind',
    'cancel',
    'stop',
    'abort',
    "i don't want to book",
    'dont want to book',
    'do not want to book',
    'stop booking',
    'no thanks',
    'forget it',
    'leave it',
    'not now',
  ];
  return cancelPhrases.some((phrase) => lower === phrase || lower.startsWith(phrase + ' ') || lower.includes(' ' + phrase));
}

/**
 * Check if the user is answering affirmatively to confirm a booking or step
 */
export function isAffirmativeIntent(text: string): boolean {
  return isClearConfirmationIntent(text);
}

/**
 * Check if user intent is to try another phone number when patient lookup fails.
 * Recognizes conversational typed and voice responses such as:
 * - "Try another number"
 * - "Use another number"
 * - "I'll give you a different number"
 * - "Yes, another number"
 * - "Let me try a different phone number"
 * - "Yes, try another number"
 * - "Use a different number"
 * - "Let me give you another number"
 * - "different number"
 * - "another number"
 * - "try another"
 * - "try again"
 */
export function isTryAnotherNumberIntent(text: string): boolean {
  if (!text) return false;
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  // Direct exact or key phrases
  const directPhrases = [
    'try another number',
    'use another number',
    'try another',
    'another number',
    'different number',
    'different phone',
    'different phone number',
    'another phone',
    'another phone number',
    'use a different number',
    'try a different number',
    'try again',
    'another',
    'different',
    'other number',
    'new number',
    'change number',
    'enter another number',
    'let me try another number',
    'let me try a different number',
    'let me try a different phone number',
    'let me give you another number',
    'let me give you a different number',
    'i will give you a different number',
    'ill give you a different number',
    'i ll give you a different number',
    'i have another number',
  ];

  if (directPhrases.includes(clean)) {
    return true;
  }

  // Key phrase inclusions
  if (
    clean.includes('try another') ||
    clean.includes('use another') ||
    clean.includes('different number') ||
    clean.includes('another number') ||
    clean.includes('different phone') ||
    clean.includes('another phone') ||
    clean.includes('new number') ||
    clean.includes('change number') ||
    clean.includes('try again') ||
    clean.includes('other number') ||
    clean.includes('re enter') ||
    clean.includes('reenter')
  ) {
    return true;
  }

  // Affirmative with another / different / try
  if (
    (clean.includes('yes') || clean.includes('sure') || clean.includes('yeah') || clean.includes('yep') || clean.includes('ok') || clean.includes('okay')) &&
    (clean.includes('another') || clean.includes('different') || clean.includes('number') || clean.includes('try'))
  ) {
    return true;
  }

  return false;
}

/**
 * Check for clear, unambiguous patient confirmation for booking an appointment
 * Examples from prompt:
 * “Yes”, “Yes please”, “Yes, book it”, “Confirm”, “Confirm it”, “Confirm Booking”,
 * “That works”, “Book it”, “Book this appointment”, “Go ahead”, “Okay, book this”, “I’ll take that”
 */
export function isClearConfirmationIntent(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // If ambiguous (like "hmm, okay", "maybe", "i think so"), it is NOT a clear confirmation!
  if (isAmbiguousConfirmation(text)) {
    return false;
  }

  // If message contains questions, corrections, or requests to change details or ask something else, it is NOT confirmation
  if (
    lower.includes('?') ||
    lower.includes('actually') ||
    lower.includes('change') ||
    lower.includes('something else') ||
    lower.includes('tell me') ||
    lower.includes('instead')
  ) {
    return false;
  }

  // Exact or direct matches
  const directMatches = [
    'yes',
    'yep',
    'yeah',
    'yes please',
    'yes, please',
    'yes, book it',
    'yes book it',
    'yes please book it',
    'yes, please book it',
    'yes confirm',
    'yes, confirm',
    'yes that works',
    'yes, that works',
    'confirm',
    'confirm it',
    'confirm booking',
    'please confirm',
    'confirmed',
    "that's correct",
    'thats correct',
    'that works',
    'that works for me',
    'book it',
    'book this',
    'book this appointment',
    'go ahead',
    'go ahead and book',
    'go ahead and book it',
    'okay, book this',
    'okay book this',
    'ok, book this',
    'ok book this',
    'i’ll take that',
    'ill take that',
    'i will take that',
    'i’ll take this',
    'ill take this',
    'i will take this',
    'sounds good',
    'sounds good, book it',
    'looks good',
    'looks good to me',
    'perfect, book it',
    'perfect',
    'proceed',
    'correct',
    'sure',
    'ok',
    'okay',
  ];

  if (directMatches.includes(lower)) return true;

  // Pattern matches
  if (/^yes\b/i.test(lower)) return true;
  if (/^confirm\b/i.test(lower)) return true;
  if (/^book\s+(?:it|this|appointment)\b/i.test(lower)) return true;
  if (/^go\s+ahead\b/i.test(lower)) return true;
  if (/^that\s+works\b/i.test(lower)) return true;
  if (/^(?:i'll|ill|i\s+will)\s+take\s+(?:that|this|it)\b/i.test(lower)) return true;
  if (/^(?:okay|ok),\s*book\b/i.test(lower)) return true;

  return false;
}

/**
 * Check if the patient's message is hesitant or ambiguous (e.g. "Hmm, okay", "Maybe", "Not sure")
 * Section 7: Ambiguous messages should NOT automatically book. Ask: "Would you like me to confirm the appointment?"
 */
export function isAmbiguousConfirmation(text: string): boolean {
  const lower = text.trim().toLowerCase();

  const ambiguousPatterns = [
    'hmm',
    'hmmm',
    'hmm, okay',
    'hmm okay',
    'hmm ok',
    'hmm, ok',
    'maybe',
    'not sure',
    'im not sure',
    "i'm not sure",
    'let me think',
    'let me check',
    'i don\'t know',
    'i dont know',
    'idk',
    'wait a second',
    'wait a minute',
    'hold on',
    'umm',
    'ummm',
    'uh',
    'well, okay',
    'well okay',
    'well maybe',
    'i think so',
    'think so',
  ];

  return ambiguousPatterns.some((p) => lower.startsWith(p) || lower === p || lower.includes('hmm'));
}

/**
 * Check if the user says "No", cancels, or changed their mind (TEST 5)
 */
export function isNegativeOrCancellation(text: string): boolean {
  const lower = text.trim().toLowerCase();

  const cancelPatterns = [
    'no',
    'nope',
    'nah',
    'not yet',
    'do not book',
    "don't book",
    'dont book',
    'i changed my mind',
    'changed my mind',
    'cancel',
    'cancel booking',
    'cancel this',
    'never mind',
    'nevermind',
    'stop',
    'stop booking',
    'no thanks',
    'no thank you',
  ];

  if (cancelPatterns.includes(lower)) return true;
  if (/^no\b/i.test(lower) && !lower.includes('problem') && !lower.includes('worries')) return true;
  if (/^cancel\b/i.test(lower)) return true;
  return false;
}

/**
 * Check if the user wants to change an already selected detail
 * Examples from prompt:
 * “Change Details”, “I want a different time.”, “I want Tuesday instead.”,
 * “Change the reason.”, “Use a different phone number.”, “I want to come earlier.”,
 * “Can I do 11 instead?”, “Monday would be better.”, “Change it to Tuesday.”,
 * “I need a later time.”, “I need an earlier appointment.”
 */
export function isChangeRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower === 'change details' ||
    lower === 'change' ||
    lower.startsWith('change ') ||
    lower.startsWith('actually') ||
    lower.includes('instead') ||
    lower.includes('change to') ||
    lower.includes('change it to') ||
    lower.includes('change the') ||
    lower.includes('change my') ||
    lower.includes('switch to') ||
    lower.includes('different day') ||
    lower.includes('different date') ||
    lower.includes('different time') ||
    lower.includes('different reason') ||
    lower.includes('different phone') ||
    lower.includes('different number') ||
    lower.includes('different name') ||
    lower.includes('use a different') ||
    lower.includes('rather do') ||
    lower.includes('would be better') ||
    lower.includes('come earlier') ||
    lower.includes('earlier appointment') ||
    lower.includes('earlier time') ||
    lower.includes('later appointment') ||
    lower.includes('later time') ||
    lower.includes('can i do') ||
    lower.includes('could i do')
  );
}

/**
 * Extract whether visitor is New Patient or Existing Patient
 */
export function extractPatientType(text: string): PatientType | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // If question or both without correction marker, don't infer
  if (
    lower.includes('new or existing') ||
    lower.includes('existing or new') ||
    (lower.includes('new patient') &&
      lower.includes('existing patient') &&
      !lower.includes('no') &&
      !lower.includes('instead') &&
      !lower.includes('actually') &&
      !lower.includes('not'))
  ) {
    return null;
  }

  // 1. Explicit correction / negation overrides
  if (
    lower.includes("no, i'm an existing patient") ||
    lower.includes("no im an existing patient") ||
    lower.includes("no i am an existing patient") ||
    lower.includes("no, existing patient") ||
    lower.includes("no existing patient") ||
    lower.includes("no, existing") ||
    lower.includes("no existing") ||
    lower.includes("actually an existing patient") ||
    lower.includes("actually existing patient") ||
    lower.includes("not new, existing") ||
    lower.includes("not new, i'm an existing")
  ) {
    return 'existing';
  }

  if (
    lower.includes("no, i'm a new patient") ||
    lower.includes("no im a new patient") ||
    lower.includes("no i am a new patient") ||
    lower.includes("no, new patient") ||
    lower.includes("no new patient") ||
    lower.includes("no, new") ||
    lower.includes("no new") ||
    lower.includes("actually a new patient") ||
    lower.includes("actually new patient") ||
    lower.includes("not existing, new") ||
    lower.includes("not existing, i'm a new")
  ) {
    return 'new';
  }

  // 2. Existing patient expressions
  if (
    lower.includes('existing patient') ||
    lower.includes("i'm an existing patient") ||
    lower.includes("im an existing patient") ||
    lower.includes("i am an existing patient") ||
    lower.includes('already a patient') ||
    lower.includes("i'm already a patient") ||
    lower.includes("im already a patient") ||
    lower.includes("i am already a patient") ||
    lower.includes('been here before') ||
    lower.includes("i've been here before") ||
    lower.includes("ive been here before") ||
    lower.includes("i have been here before") ||
    lower.includes('been there before') ||
    lower.includes("this isn't my first visit") ||
    lower.includes("this isnt my first visit") ||
    lower.includes("this is not my first visit") ||
    lower.includes("not my first visit") ||
    lower.includes("isn't my first visit") ||
    lower.includes("isnt my first visit") ||
    lower.includes("is not my first visit") ||
    lower.includes("not my first time") ||
    lower.includes("isn't my first time") ||
    lower.includes("isnt my first time") ||
    lower.includes("is not my first time") ||
    lower.includes('current patient') ||
    lower.includes('returning patient') ||
    lower.includes('visited before') ||
    lower.includes('already visited') ||
    lower.includes('regular patient') ||
    lower.includes('prior patient') ||
    lower.includes('previous patient') ||
    lower === 'existing' ||
    lower === 'existing patient'
  ) {
    return 'existing';
  }

  // 3. New patient expressions
  if (
    lower.includes('new patient') ||
    lower.includes("i'm a new patient") ||
    lower.includes("i am a new patient") ||
    lower.includes("i'm new here") ||
    lower.includes("im new here") ||
    lower.includes("i am new here") ||
    lower.includes("i'm new") ||
    lower.includes('im new') ||
    lower.includes('i am new') ||
    lower.includes('never been here before') ||
    lower.includes('never been there before') ||
    lower.includes('never been before') ||
    lower.includes('never been') ||
    lower.includes("haven't been here before") ||
    lower.includes("haven’t been here before") ||
    lower.includes("havent been here before") ||
    lower.includes("haven't been") ||
    lower.includes("haven’t been") ||
    lower.includes("havent been") ||
    lower.includes('first visit') ||
    lower.includes('first time patient') ||
    lower.includes('first time here') ||
    lower.includes('first time') ||
    lower.includes('register as a new patient') ||
    lower.includes('sign up as a new patient') ||
    lower === 'new' ||
    lower === 'new patient'
  ) {
    return 'new';
  }

  return null;
}

/**
 * Splits text around conversational correction markers like:
 * "actually", "make that", "make it", "instead of", "rather do", "switch to", "change to",
 * "no wait", "wait no", "sorry", "i meant"
 */
export function splitCorrectionClauses(text: string): {
  hasCorrectionMarker: boolean;
  beforeMarker?: string;
  afterMarker?: string;
  desiredInsteadOf?: string;
  rejectedInsteadOf?: string;
} {
  if (!text) return { hasCorrectionMarker: false };

  // Check "[X] instead of [Y]"
  const insteadOfMatch = text.match(/^(.*?)\s+instead\s+of\s+(.*?)$/i);
  if (insteadOfMatch) {
    return {
      hasCorrectionMarker: true,
      desiredInsteadOf: insteadOfMatch[1].trim(),
      rejectedInsteadOf: insteadOfMatch[2].trim(),
    };
  }

  // Check marker like "actually", "make that", etc.
  const markerRegex = /\b(?:actually|make that|make it|change that to|change to|switch to|rather do|rather have|no wait|wait no|sorry,? i meant|i meant|not that,?)\b/i;
  const match = text.match(markerRegex);
  if (match && match.index !== undefined) {
    const before = text.slice(0, match.index).trim();
    const after = text.slice(match.index + match[0].length).trim();
    return {
      hasCorrectionMarker: true,
      beforeMarker: before,
      afterMarker: after,
    };
  }

  return { hasCorrectionMarker: false };
}

/**
 * Checks if user is expressing a flexible/indifferent time preference:
 * e.g. "any time is fine", "whenever", "whatever is available", "any time works"
 */
export function isFlexibleTimeIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('any time is fine') ||
    lower.includes('anytime is fine') ||
    lower.includes('any time works') ||
    lower.includes('anytime works') ||
    lower.includes('any time') ||
    lower.includes('anytime') ||
    lower.includes('whenever') ||
    lower.includes('whatever is available') ||
    lower.includes('whatever time') ||
    lower.includes('whatever works') ||
    lower.includes("i don't care about the time") ||
    lower.includes('dont care about the time') ||
    lower.includes('no preference') ||
    lower.includes('open schedule') ||
    lower.includes('any slot')
  );
}

/**
 * Detects if the booking is being made for a family member or someone else
 */
export function detectThirdPartyBooking(text: string): {
  isThirdParty: boolean;
  relationship?: string;
  patientName?: string;
} {
  if (!text) return { isThirdParty: false };
  const thirdPartyMatch = text.match(
    /\b(?:for|booking for|appointment for)\s+(?:my\s+)?(mom|mother|dad|father|husband|wife|son|daughter|child|kid|spouse|brother|sister|friend|grandma|grandmother|grandpa|grandfather)(?:[,\s]+([A-Za-z]+(?:\s+[A-Za-z]+)?))?/i
  );
  if (thirdPartyMatch) {
    const relationship = thirdPartyMatch[1];
    const candidateName = thirdPartyMatch[2];
    let validName: string | undefined;
    if (candidateName) {
      const v = validatePatientName(candidateName);
      if (v.isValid) validName = v.cleaned;
    }
    return {
      isThirdParty: true,
      relationship,
      patientName: validName,
    };
  }
  return { isThirdParty: false };
}

function extractVisitReasonSingle(text: string): string | null {
  const lower = text.toLowerCase();

  // Tooth pain & urgent discomfort
  if (
    lower.includes('pain') ||
    lower.includes('toothache') ||
    lower.includes('tooth ache') ||
    lower.includes('hurts') ||
    lower.includes('hurting') ||
    lower.includes('ache') ||
    lower.includes('emergency') ||
    lower.includes('urgent') ||
    lower.includes('broken tooth') ||
    lower.includes('cracked tooth') ||
    lower.includes('discomfort') ||
    lower.includes('killing me') ||
    lower.includes('abscess') ||
    lower.includes('swelling') ||
    lower.includes('swollen') ||
    lower.includes('throbbing')
  ) {
    return 'Tooth Pain / Urgent Discomfort';
  }

  // Root canal therapy (check before generic checkup/cleaning)
  if (
    lower.includes('root canal') ||
    lower.includes('root canals') ||
    lower.includes('endodontic') ||
    lower.includes('rootcanal')
  ) {
    return 'Root Canal';
  }

  // Dental implants
  if (
    lower.includes('implant denture') ||
    lower.includes('implant-supported') ||
    lower.includes('implant supported')
  ) {
    return 'Implant-Supported Dentures';
  }
  if (lower.includes('full mouth') || lower.includes('full-mouth') || lower.includes('all on 4') || lower.includes('all-on-4')) {
    return 'Full-Mouth Dental Implants';
  }
  if (
    lower.includes('implant') ||
    lower.includes('implants') ||
    lower.includes('replace missing tooth') ||
    lower.includes('replace missing') ||
    lower.includes('missing tooth') ||
    lower.includes('missing teeth')
  ) {
    return 'Dental Implants Consultation';
  }

  // Clear aligners / Invisalign
  if (
    lower.includes('invisalign') ||
    lower.includes('clear aligner') ||
    lower.includes('clear aligners') ||
    lower.includes('aligner') ||
    lower.includes('aligners') ||
    lower.includes('straighten teeth') ||
    lower.includes('straighten my teeth') ||
    lower.includes('braces')
  ) {
    return 'Invisalign® / Clear Aligners';
  }

  // Dental crowns & bridges
  if (
    lower.includes('crown') ||
    lower.includes('bridge') ||
    lower.includes('caps') ||
    lower.includes('dental crown')
  ) {
    return 'Dental Crown or Bridge';
  }

  // Routine checkup & cleaning
  if (
    lower.includes('cleaning') ||
    lower.includes('checkup') ||
    lower.includes('check up') ||
    lower.includes('check-up') ||
    lower.includes('routine') ||
    lower.includes('hygiene') ||
    lower.includes('teeth cleaning') ||
    lower.includes('teeth cleaned') ||
    lower.includes('clean my teeth') ||
    lower.includes('clean teeth') ||
    lower.includes('routine exam') ||
    lower.includes('dental cleaning')
  ) {
    return 'Routine Checkup & Cleaning';
  }

  // Cosmetic & whitening
  if (
    lower.includes('cosmetic') ||
    lower.includes('whitening') ||
    lower.includes('whiten') ||
    lower.includes('whiten teeth') ||
    lower.includes('veneer') ||
    lower.includes('veneers') ||
    lower.includes('bleaching')
  ) {
    return 'Cosmetic Dentistry / Whitening';
  }

  // Fillings
  if (lower.includes('filling') || lower.includes('cavity') || lower.includes('fillings')) {
    return 'Routine Checkup & Cleaning';
  }

  // Sedation dentistry
  if (lower.includes('sedation') || lower.includes('sleep dentistry')) {
    return 'Sedation Dentistry';
  }

  // Family & Preventive dentistry
  if (lower.includes('family dentistry')) {
    return 'Family Dentistry';
  }
  if (lower.includes('preventive') || lower.includes('preventative')) {
    return 'Preventive Dental Care';
  }

  // General consultation / exam
  if (lower.includes('consultation') || lower.includes('consult') || lower.includes('exam')) {
    return 'General Consultation';
  }

  return null;
}

/**
 * Extract general reason for visit, mapping natural descriptions to canonical services.
 * Respects conversational corrections (e.g., "I want a cleaning. Actually, I need a root canal.")
 */
export function extractVisitReason(text: string): string | null {
  if (!text) return null;

  // Check if text has a correction marker
  const split = splitCorrectionClauses(text);
  if (split.hasCorrectionMarker) {
    if (split.desiredInsteadOf) {
      const r = extractVisitReasonSingle(split.desiredInsteadOf);
      if (r) return r;
    }
    if (split.afterMarker) {
      const r = extractVisitReasonSingle(split.afterMarker);
      if (r) return r;
    }
  }

  return extractVisitReasonSingle(text);
}

/**
 * Checks whether the text is asking purely about clinic hours or operating status
 * (e.g. "Are you open Saturday?", "When do you close?", "Are you open today?")
 * rather than asking to book or check availability for an appointment.
 */
export function isHoursOrOpenQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const hasHoursKeywords =
    lower.includes('are you open') ||
    lower.includes('open today') ||
    lower.includes('open saturday') ||
    lower.includes('open sunday') ||
    lower.includes('open on saturday') ||
    lower.includes('open on sunday') ||
    lower.includes('when do you open') ||
    lower.includes('when do you close') ||
    lower.includes('what time do you close') ||
    lower.includes('what time do you open') ||
    lower.includes('what are your hours') ||
    lower.includes('office hours') ||
    lower.includes('clinic hours') ||
    lower.includes('business hours') ||
    lower.includes('operating hours');

  const hasExplicitBookingAction =
    lower.includes('book') ||
    lower.includes('schedule') ||
    lower.includes('reserve') ||
    lower.includes('make an appointment') ||
    lower.includes('take an appointment') ||
    lower.includes('available slots') ||
    lower.includes('slot for me');

  return hasHoursKeywords && !hasExplicitBookingAction;
}

/**
 * Extract preferred date from natural language dynamically relative to Houston clinic date.
 * Supports:
 * - Relative keywords ("today", "tomorrow", "yesterday", "next week", days of the week)
 * - Explicit month and day ("Sep 12", "September 12", "9/12", etc.)
 * - Direct ISO dates ("2026-09-16")
 */
function extractDatePreferenceSingle(
  text: string,
  referenceDateStr?: string
): { dateStr: string; label: string; isSunday: boolean } | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const refDateStr = referenceDateStr || getHoustonCurrentDateTime().dateStr;
  const [refY, refM, refD] = refDateStr.split('-').map(Number);
  const refDate = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));
  const refDayOfWeek = refDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  const formatIsoDate = (d: Date): string => {
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // 1. Direct ISO pattern: YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const dStr = isoMatch[1];
    return {
      dateStr: dStr,
      label: formatDatePretty(dStr),
      isSunday: isSundayDate(dStr),
    };
  }

  // 2. Explicit Month & Day patterns (e.g. "Sep 12", "September 12", "9/12", "October 5th", etc.)
  const monthNames: { [key: string]: number } = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  // Match e.g. "September 12", "Sep 12th", "Sept 16, 2026"
  const monthDayMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i
  );

  if (monthDayMatch) {
    const mStr = monthDayMatch[1].toLowerCase();
    const mNum = monthNames[mStr] || 9;
    const dayNum = parseInt(monthDayMatch[2], 10);
    const yrNum = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : refY;
    if (dayNum >= 1 && dayNum <= 31) {
      const dStr = `${yrNum}-${String(mNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return {
        dateStr: dStr,
        label: formatDatePretty(dStr),
        isSunday: isSundayDate(dStr),
      };
    }
  }

  // Match e.g. "12th of September", "16 of Sep"
  const dayMonthMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\b/i
  );
  if (dayMonthMatch) {
    const dayNum = parseInt(dayMonthMatch[1], 10);
    const mStr = dayMonthMatch[2].toLowerCase();
    const mNum = monthNames[mStr] || 9;
    if (dayNum >= 1 && dayNum <= 31) {
      const dStr = `${refY}-${String(mNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return {
        dateStr: dStr,
        label: formatDatePretty(dStr),
        isSunday: isSundayDate(dStr),
      };
    }
  }

  // Match numeric dates like "9/12", "09/16", "9-12"
  const numDateMatch = text.match(/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])(?:[\/-](\d{2,4}))?\b/);
  if (numDateMatch) {
    const mNum = parseInt(numDateMatch[1], 10);
    const dayNum = parseInt(numDateMatch[2], 10);
    let yrNum = refY;
    if (numDateMatch[3]) {
      const rawYr = parseInt(numDateMatch[3], 10);
      yrNum = rawYr < 100 ? 2000 + rawYr : rawYr;
    }
    const dStr = `${yrNum}-${String(mNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    return {
      dateStr: dStr,
      label: formatDatePretty(dStr),
      isSunday: isSundayDate(dStr),
    };
  }

  // 2.5 Day-of-month / Ordinal pattern (e.g. "Monday the 28th", "the 28th", "on the 28th", "28th")
  const dayOfMonthMatch = text.match(
    /\b(?:(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s+)?(?:the\s+)?([1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b/i
  );
  if (dayOfMonthMatch) {
    const targetDayNum = parseInt(dayOfMonthMatch[1], 10);
    let targetM = refM;
    let targetY = refY;
    if (targetDayNum < refD) {
      targetM += 1;
      if (targetM > 12) {
        targetM = 1;
        targetY += 1;
      }
    }
    const dStr = `${targetY}-${String(targetM).padStart(2, '0')}-${String(targetDayNum).padStart(2, '0')}`;
    return {
      dateStr: dStr,
      label: formatDatePretty(dStr),
      isSunday: isSundayDate(dStr),
    };
  }

  // 3. Relative date keywords: Today, Tomorrow, Yesterday, Day after tomorrow
  if (lower.includes('day after tomorrow')) {
    const dayAfter = new Date(refDate.getTime() + 48 * 60 * 60 * 1000);
    const dStr = formatIsoDate(dayAfter);
    return {
      dateStr: dStr,
      label: `Day after tomorrow (${formatDatePretty(dStr)})`,
      isSunday: isSundayDate(dStr),
    };
  }

  if (
    lower.includes('today') ||
    lower.includes('this afternoon') ||
    lower.includes('this morning') ||
    lower.includes('tonight')
  ) {
    return {
      dateStr: refDateStr,
      label: `Today (${formatDatePretty(refDateStr)})`,
      isSunday: isSundayDate(refDateStr),
    };
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(refDate.getTime() + 24 * 60 * 60 * 1000);
    const dStr = formatIsoDate(tomorrow);
    return {
      dateStr: dStr,
      label: `Tomorrow (${formatDatePretty(dStr)})`,
      isSunday: isSundayDate(dStr),
    };
  }

  if (lower.includes('yesterday')) {
    const yesterday = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
    const dStr = formatIsoDate(yesterday);
    return {
      dateStr: dStr,
      label: `Yesterday (${formatDatePretty(dStr)})`,
      isSunday: isSundayDate(dStr),
    };
  }

  // 4. "Next week" -> Monday kickoff of next week
  if (lower.includes('next week') || lower.includes('upcoming week')) {
    const daysUntilNextMonday = ((1 - refDayOfWeek + 7) % 7) || 7;
    const nextMon = new Date(refDate.getTime() + daysUntilNextMonday * 24 * 60 * 60 * 1000);
    const dStr = formatIsoDate(nextMon);
    return {
      dateStr: dStr,
      label: `${formatDatePretty(dStr)} (Next Week)`,
      isSunday: false,
    };
  }

  // 5. Named weekdays: Sunday (0), Monday (1), Tuesday (2), Wednesday (3), Thursday (4), Friday (5), Saturday (6)
  const weekdays: { [key: string]: number } = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  // Find if any weekday is mentioned in text
  for (const [dayName, targetDay] of Object.entries(weekdays)) {
    const dayRegex = new RegExp(`\\b${dayName}\\b`, 'i');
    if (dayRegex.test(text)) {
      let diff = targetDay - refDayOfWeek;
      const isNextExplicit = lower.includes(`next ${dayName}`) || lower.includes(`coming ${dayName}`);

      if (diff === 0) {
        if (isNextExplicit) {
          diff = 7;
        } else {
          diff = 0; // Today
        }
      } else if (diff < 0) {
        diff += 7; // Next occurrence
      } else if (isNextExplicit && diff < 3) {
        diff += 7;
      }

      const targetDate = new Date(refDate.getTime() + diff * 24 * 60 * 60 * 1000);
      const dStr = formatIsoDate(targetDate);
      return {
        dateStr: dStr,
        label: formatDatePretty(dStr),
        isSunday: targetDay === 0,
      };
    }
  }

  return null;
}

export function extractDatePreference(
  text: string,
  referenceDateStr?: string
): { dateStr: string; label: string; isSunday: boolean } | null {
  if (!text) return null;

  // Check if text has a correction marker
  const split = splitCorrectionClauses(text);
  if (split.hasCorrectionMarker) {
    if (split.desiredInsteadOf) {
      const d = extractDatePreferenceSingle(split.desiredInsteadOf, referenceDateStr);
      if (d) return d;
    }
    if (split.afterMarker) {
      const d = extractDatePreferenceSingle(split.afterMarker, referenceDateStr);
      if (d) return d;
    }
  }

  return extractDatePreferenceSingle(text, referenceDateStr);
}

function extractTimePreferenceSingle(text: string): {
  targetTime?: string;
  targetHour?: number;
  period?: 'morning' | 'afternoon';
  minMinutes?: number;
  maxMinutes?: number;
  rawLabel?: string;
  relative?: 'earlier' | 'later';
} | null {
  const lower = text.toLowerCase();

  // Earliest available time / first available
  if (
    lower.includes('earliest available') ||
    lower.includes('earliest time') ||
    lower.includes('the earliest available time') ||
    lower.includes('first available') ||
    lower.includes('soonest') ||
    lower.includes('as soon as possible') ||
    lower.includes('asap') ||
    lower === 'earliest'
  ) {
    return {
      relative: 'earlier',
      rawLabel: 'the earliest available time',
    };
  }

  // Relative preferences: earlier / later
  if (
    lower.includes('earlier') ||
    lower.includes('come earlier') ||
    lower.includes('bit earlier') ||
    lower.includes('a bit earlier') ||
    lower.includes('something earlier')
  ) {
    return {
      relative: 'earlier',
      rawLabel: 'earlier',
    };
  }

  if (
    lower.includes('later') ||
    lower.includes('come later') ||
    lower.includes('bit later') ||
    lower.includes('a bit later') ||
    lower.includes('something later') ||
    lower.includes('anything later')
  ) {
    return {
      relative: 'later',
      rawLabel: 'later',
    };
  }

  // First thing in the morning (8:00 AM - 9:00 AM)
  if (lower.includes('first thing in the morning') || lower.includes('first thing')) {
    return {
      minMinutes: 480, // 8:00 AM
      maxMinutes: 540, // 9:00 AM
      period: 'morning',
      rawLabel: 'first thing in the morning (8:00 AM–9:00 AM)',
    };
  }

  // Before work (8:00 AM - 9:30 AM)
  if (lower.includes('before work')) {
    return {
      minMinutes: 480,
      maxMinutes: 570,
      period: 'morning',
      rawLabel: 'before work (8:00 AM–9:30 AM)',
    };
  }

  // Early morning (8:00 AM - 10:00 AM)
  if (lower.includes('early morning')) {
    return {
      minMinutes: 480,
      maxMinutes: 600,
      period: 'morning',
      rawLabel: 'early morning (8:00 AM–10:00 AM)',
    };
  }

  // Late morning (10:30 AM - 12:00 PM)
  if (lower.includes('late morning')) {
    return {
      minMinutes: 630,
      maxMinutes: 720,
      period: 'morning',
      rawLabel: 'late morning (10:30 AM–12:00 PM)',
    };
  }

  // Around noon / lunchtime (11:30 AM - 1:00 PM)
  if (
    lower.includes('around noon') ||
    lower.includes('at noon') ||
    lower.includes('lunch hour') ||
    lower.includes('lunch time') ||
    lower.includes('lunchtime')
  ) {
    return {
      minMinutes: 690, // 11:30 AM
      maxMinutes: 780, // 1:00 PM
      targetHour: 12,
      period: 'afternoon',
      rawLabel: 'around noon (11:30 AM–1:00 PM)',
    };
  }

  // Early afternoon (12:00 PM - 2:30 PM)
  if (lower.includes('early afternoon')) {
    return {
      minMinutes: 720,
      maxMinutes: 870,
      period: 'afternoon',
      rawLabel: 'early afternoon (12:00 PM–2:30 PM)',
    };
  }

  // Late afternoon / end of day (2:30 PM - 5:00 PM)
  if (lower.includes('end of day') || lower.includes('late afternoon')) {
    return {
      minMinutes: 870, // 2:30 PM
      maxMinutes: 1020, // 5:00 PM
      period: 'afternoon',
      rawLabel: 'late afternoon (2:30 PM–5:00 PM)',
    };
  }

  // Evening / after work (4:00 PM+)
  if (lower.includes('evening') || lower.includes('after work')) {
    return {
      minMinutes: 960, // 4:00 PM
      maxMinutes: 1140, // 7:00 PM
      period: 'afternoon',
      rawLabel: 'evening / after work (4:00 PM+)',
    };
  }

  // After lunch / after 1 PM
  if (lower.includes('after lunch') || lower.includes('after 1pm') || lower.includes('after 1 pm') || lower.includes('after 1')) {
    return {
      minMinutes: 780, // 1:00 PM
      period: 'afternoon',
      rawLabel: 'after lunch (1:00 PM+)',
    };
  }

  // Anytime after 3
  if (lower.includes('after 3') || lower.includes('after 3pm') || lower.includes('after 3 pm')) {
    return {
      minMinutes: 900, // 3:00 PM
      period: 'afternoon',
      rawLabel: 'after 3:00 PM',
    };
  }

  // Anytime after 2
  if (lower.includes('after 2') || lower.includes('after 2pm') || lower.includes('after 2 pm')) {
    return {
      minMinutes: 840, // 2:00 PM
      period: 'afternoon',
      rawLabel: 'after 2:00 PM',
    };
  }

  // Helper to format 12-hr time string
  const to12h = (h: number, m: number, meridiem?: string): { targetTime: string; targetHour: number; period: 'morning' | 'afternoon'; rawLabel: string } => {
    let finalH = h;
    let ampm = meridiem ? meridiem.toUpperCase() : '';
    if (!ampm) {
      if (finalH >= 8 && finalH <= 11) ampm = 'AM';
      else if (finalH === 12 || (finalH >= 1 && finalH <= 7)) ampm = 'PM';
      else ampm = 'AM';
    }
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    const padH = finalH < 10 ? '0' + finalH : String(finalH);
    const targetTime = `${padH}:${pad(m)} ${ampm}`;
    let militaryHour = finalH;
    if (ampm === 'PM' && finalH !== 12) militaryHour += 12;
    if (ampm === 'AM' && finalH === 12) militaryHour = 0;
    const period = ampm === 'PM' ? 'afternoon' : 'morning';
    return {
      targetTime,
      targetHour: militaryHour,
      period,
      rawLabel: targetTime,
    };
  };

  // Explicit time phrase matches in text:
  // "3:30", "3:30 pm", "2:30", "1:30", "8:30", "9:30", "10:30", "11:30", "4:30"
  const halfHourMatch = lower.match(/\b(\d{1,2}):(30|00)\s*(am|pm)?\b/i);
  if (halfHourMatch) {
    const h = parseInt(halfHourMatch[1], 10);
    const m = parseInt(halfHourMatch[2], 10);
    const mer = halfHourMatch[3];
    if (h >= 1 && h <= 12) {
      return to12h(h, m, mer);
    }
  }

  // Spoken natural pattern: "at 11", "at 11 AM", "around 2 PM", "at 2", "for 10 AM", "around 9"
  const spokenTimeRegex = lower.match(/\b(?:at|around|about|by|for)\s+(1[0-2]|[1-9])(?::(00|30))?\s*(am|pm)?\b/i);
  if (spokenTimeRegex) {
    const h = parseInt(spokenTimeRegex[1], 10);
    const m = spokenTimeRegex[2] ? parseInt(spokenTimeRegex[2], 10) : 0;
    const mer = spokenTimeRegex[3];
    return to12h(h, m, mer);
  }

  // "at 2", "around 2", "2 pm", "eleven in the morning", "two in the afternoon"
  const hourKeywords = [
    {
      patterns: [
        '2 pm',
        '2pm',
        'around 2',
        'at 2',
        'at two',
        'around two',
        'two in the afternoon',
        '2 in the afternoon',
        'two pm',
        'do 2',
        '2 instead',
        'take 2',
        '2:00',
      ],
      h: 2,
      m: 0,
      mer: 'PM',
    },
    {
      patterns: [
        '1 pm',
        '1pm',
        'around 1',
        'at 1',
        'at one',
        'around one',
        'one in the afternoon',
        '1 in the afternoon',
        'one pm',
        'do 1',
        '1 instead',
        'take 1',
        '1:00',
      ],
      h: 1,
      m: 0,
      mer: 'PM',
    },
    {
      patterns: [
        '3 pm',
        '3pm',
        'around 3',
        'at 3',
        'at three',
        'around three',
        'three in the afternoon',
        '3 in the afternoon',
        'three pm',
        'do 3',
        '3 instead',
        'take 3',
        '3:00',
      ],
      h: 3,
      m: 0,
      mer: 'PM',
    },
    {
      patterns: [
        '4 pm',
        '4pm',
        'around 4',
        'at 4',
        'at four',
        'around four',
        'four in the afternoon',
        '4 in the afternoon',
        'four pm',
        'do 4',
        '4 instead',
        'take 4',
        '4:00',
      ],
      h: 4,
      m: 0,
      mer: 'PM',
    },
    {
      patterns: [
        '5 pm',
        '5pm',
        'around 5',
        'at 5',
        'at five',
        'around five',
        'five in the afternoon',
        '5 in the afternoon',
        'five pm',
        'do 5',
        '5:00',
      ],
      h: 5,
      m: 0,
      mer: 'PM',
    },
    {
      patterns: [
        '10 am',
        '10am',
        'around 10',
        'at 10',
        'at ten',
        'around ten',
        'ten in the morning',
        '10 in the morning',
        'ten am',
        'do 10',
        '10 instead',
        'take 10',
        '10:00',
      ],
      h: 10,
      m: 0,
      mer: 'AM',
    },
    {
      patterns: [
        '11 am',
        '11am',
        'around 11',
        'at 11',
        'at eleven',
        'around eleven',
        'eleven in the morning',
        '11 in the morning',
        'eleven am',
        'do 11',
        '11 instead',
        'take 11',
        '11:00',
      ],
      h: 11,
      m: 0,
      mer: 'AM',
    },
    {
      patterns: [
        '9 am',
        '9am',
        'around 9',
        'at 9',
        'at nine',
        'around nine',
        'nine in the morning',
        '9 in the morning',
        'nine am',
        'do 9',
        '9 instead',
        'take 9',
        '9:00',
      ],
      h: 9,
      m: 0,
      mer: 'AM',
    },
    {
      patterns: [
        '8:30 am',
        '8:30am',
        'around 8:30',
        'at 8:30',
        '8:30',
        'eight thirty am',
        'eight thirty',
      ],
      h: 8,
      m: 30,
      mer: 'AM',
    },
    {
      patterns: [
        '12 pm',
        '12pm',
        'around 12',
        'at 12',
        'noon',
        'at noon',
        'twelve in the afternoon',
        'twelve pm',
        '12:00',
      ],
      h: 12,
      m: 0,
      mer: 'PM',
    },
  ];

  for (const item of hourKeywords) {
    if (item.patterns.some((p) => lower.includes(p))) {
      return to12h(item.h, item.m, item.mer);
    }
  }

  // Broad morning vs afternoon
  if (lower.includes('morning') || lower.includes('am')) {
    return {
      maxMinutes: 719, // before 12:00 PM
      period: 'morning',
      rawLabel: 'morning',
    };
  }

  if (lower.includes('afternoon') || lower.includes('pm')) {
    return {
      minMinutes: 720, // 12:00 PM
      period: 'afternoon',
      rawLabel: 'afternoon',
    };
  }

  return null;
}

/**
 * Extract time preferences like "afternoon", "after lunch", "around 2", "at 11", "anytime after 3", "2 PM", "a bit later"
 * Respects conversational corrections (e.g. "I need something Saturday afternoon. Actually, morning is better.")
 */
export function extractTimePreference(text: string): {
  targetTime?: string;
  targetHour?: number;
  period?: 'morning' | 'afternoon';
  minMinutes?: number;
  maxMinutes?: number;
  rawLabel?: string;
  relative?: 'earlier' | 'later';
} | null {
  if (!text) return null;

  // Check if text has a correction marker
  const split = splitCorrectionClauses(text);
  if (split.hasCorrectionMarker) {
    if (split.desiredInsteadOf) {
      const t = extractTimePreferenceSingle(split.desiredInsteadOf);
      if (t) return t;
    }
    if (split.afterMarker) {
      const t = extractTimePreferenceSingle(split.afterMarker);
      if (t) return t;
    }
  }

  return extractTimePreferenceSingle(text);
}

/**
 * Strict validation for patient's full name.
 * Accepts ONLY alphabetic characters and normal spaces.
 * Allowed: "Sarah", "Sarah Johnson", "James D Smith"
 * Not allowed: "Sarah123", "Sarah @", "12345", "Sarah#Johnson", phone numbers, email addresses.
 */
export function validatePatientName(text: string): {
  isValid: boolean;
  cleaned: string;
  error?: string;
} {
  if (!text) {
    return {
      isValid: false,
      cleaned: '',
      error: 'Please enter your name using letters only.',
    };
  }

  const trimmed = text.trim();

  // Must contain ONLY letters and normal spaces
  const lettersAndSpacesOnly = /^[a-zA-Z]+(?:\s+[a-zA-Z]+)*$/;
  if (!lettersAndSpacesOnly.test(trimmed)) {
    return {
      isValid: false,
      cleaned: '',
      error: 'Please enter your name using letters only.',
    };
  }

  return {
    isValid: true,
    cleaned: trimmed,
  };
}

import {
  SupportedCountry,
  PhoneValidationResult,
  validateStrictPhone as validateStrictPhoneCore,
  extractSpokenPhoneNumber as extractSpokenPhoneNumberCore,
  formatDisplayPhone,
  maskPhoneNumber,
  normalizePhoneNumber,
  convertSpokenDigitsToNumbers as convertSpokenDigitsCore,
} from './phoneUtils';

export type { SupportedCountry, PhoneValidationResult };
export { formatDisplayPhone, maskPhoneNumber, normalizePhoneNumber };

/**
 * Converts spoken number words (e.g. "two eight one five five five zero one nine nine")
 * into numeric digit characters ("2815550199").
 */
export function convertSpokenDigitsToNumbers(text: string): string {
  return convertSpokenDigitsCore(text);
}

export interface ExtractedPhoneInfo {
  hasPhoneMention: boolean;
  isIncomplete: boolean;
  isValid: boolean;
  isAmbiguous?: boolean;
  digits?: string;
  e164?: string;
  country?: SupportedCountry | null;
  formatted?: string;
  masked?: string;
  error?: string;
  matchedText?: string;
}

/**
 * Extracts and normalizes spoken or typed phone numbers from natural language input.
 * Supports both Indian (+91) and US (+1) numbers. Does NOT guess incomplete or ambiguous numbers.
 */
export function extractSpokenPhoneNumber(
  text: string,
  countryHint?: SupportedCountry | null
): ExtractedPhoneInfo {
  return extractSpokenPhoneNumberCore(text, countryHint);
}

/**
 * Strict validation for phone number.
 * Accepts numeric digits, formatted US/Indian phone numbers, and spoken numbers.
 */
export function validateStrictPhone(
  text: string,
  countryHint?: SupportedCountry | null,
  fallbackToDefault = false
): PhoneValidationResult {
  return validateStrictPhoneCore(text, countryHint, fallbackToDefault);
}

/**
 * Formats a phone string for display (supports both US and India).
 */
export function formatUSPhone(digits: string): string {
  return formatDisplayPhone(digits);
}

/**
 * Validate US Phone Number (legacy lenient check)
 * Accepts normal US phone number formats:
 * (281) 946-2569, 281-946-2569, 2819462569, etc.
 */
export function validateUSPhoneNumber(text: string): {
  isValid: boolean;
  cleaned: string;
  formatted: string;
  masked: string;
  error?: string;
} {
  if (!text) {
    return { isValid: false, cleaned: '', formatted: '', masked: '', error: 'Please enter your phone number.' };
  }

  // Extract all digits
  const digits = text.replace(/\D/g, '');

  let tenDigits = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    tenDigits = digits.slice(1);
  }

  if (tenDigits.length !== 10) {
    return {
      isValid: false,
      cleaned: digits,
      formatted: '',
      masked: '',
      error: 'Please enter a valid 10-digit US phone number (e.g. (281) 946-2569).',
    };
  }

  const areaCode = tenDigits.slice(0, 3);
  const prefix = tenDigits.slice(3, 6);
  const line = tenDigits.slice(6, 10);

  // US phone number rules: area code and exchange prefix cannot start with 0 or 1
  if (areaCode[0] === '0' || areaCode[0] === '1' || prefix[0] === '0' || prefix[0] === '1') {
    return {
      isValid: false,
      cleaned: tenDigits,
      formatted: '',
      masked: '',
      error: 'Please enter a valid US phone number with a standard area code.',
    };
  }

  const formatted = `(${areaCode}) ${prefix}-${line}`;
  // Privacy masked version: e.g. (281) XXX-2569 or (281) XXX-XXXX
  const masked = `(${areaCode}) XXX-${line}`;

  return {
    isValid: true,
    cleaned: tenDigits,
    formatted,
    masked,
  };
}

/**
 * Common non-name words to avoid falsely treating as patient names
 */
const NON_NAME_KEYWORDS = new Set([
  'new patient', 'existing patient', 'returning patient', 'patient',
  'a new patient', 'an existing patient', 'a returning patient',
  'routine checkup', 'checkup', 'cleaning', 'teeth cleaning', 'dental cleaning',
  'dental implants', 'implants', 'implant', 'invisalign', 'root canal',
  'crown', 'bridge', 'whitening', 'filling', 'dentures', 'sedation',
  'tooth pain', 'pain', 'toothache', 'emergency', 'consultation',
  'tomorrow', 'today', 'yesterday', 'next week', 'afternoon', 'morning',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'houston', 'greenspoint', 'appointment', 'booking', 'schedule'
]);

function isInvalidNameCandidate(str: string): boolean {
  const lower = str.toLowerCase().trim().replace(/^(?:a|an|the)\s+/i, '');
  if (NON_NAME_KEYWORDS.has(lower)) return true;
  for (const kw of NON_NAME_KEYWORDS) {
    if (lower === kw || lower.startsWith(kw + ' ') || lower.endsWith(' ' + kw)) {
      return true;
    }
  }
  return false;
}

function toTitleCaseName(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

/**
 * Extract contact details (name and/or phone) from text.
 * Accurately recognizes natural speech variations and prevents incomplete phone guessing.
 */
export function extractContactDetails(text: string): {
  name?: string;
  phone?: {
    isValid: boolean;
    cleaned: string;
    formatted: string;
    masked: string;
  };
  hasIncompletePhone?: boolean;
  incompletePhoneError?: string;
} {
  const trimmed = text.trim();
  const phoneExtracted = extractSpokenPhoneNumber(trimmed);

  let phoneValidation: { isValid: boolean; cleaned: string; formatted: string; masked: string } | undefined;
  if (phoneExtracted.isValid && phoneExtracted.digits) {
    phoneValidation = {
      isValid: true,
      cleaned: phoneExtracted.digits,
      formatted: phoneExtracted.formatted || formatUSPhone(phoneExtracted.digits),
      masked: phoneExtracted.masked || formatUSPhone(phoneExtracted.digits),
    };
  }

  // Remove phone mentions from remainingText so numbers/digits don't interfere with name extraction
  let remainingText = trimmed;
  if (phoneExtracted.matchedText) {
    remainingText = remainingText.replace(phoneExtracted.matchedText, ' ').trim();
  }
  // Also strip any standalone digit groups or phone keywords from remainingText
  remainingText = remainingText
    .replace(/(?:my\s+)?(?:phone\s*number|phone|number|cell|mobile)(?:\s+is|\s*[:=-])?\s*[0-9\s()\-+.]*/gi, ' ')
    .replace(/\b\d{3,10}\b/g, ' ')
    .trim();

  const tryValidateAndFormatName = (candidate: string): string | undefined => {
    if (!candidate) return undefined;
    const clean = candidate.trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
    if (clean.length < 2 || isInvalidNameCandidate(clean)) return undefined;
    const val = validatePatientName(clean);
    if (val.isValid && !isInvalidNameCandidate(val.cleaned)) {
      return toTitleCaseName(val.cleaned);
    }
    return undefined;
  };

  // 1. Handle spelling correction phrases: "My name is spelled Sarah, not Sara."
  const spelledNameMatch = remainingText.match(/(?:spelled|spelt)\s+([A-Za-z]+)(?:,\s*not\s+[A-Za-z]+)?/i);
  if (spelledNameMatch && spelledNameMatch[1]) {
    const formatted = tryValidateAndFormatName(spelledNameMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 2. "You can put me down as Riya Sharma" / "Put me down as Riya Sharma" (Requirement 2)
  const putDownMatch = remainingText.match(
    /(?:you\s+can\s+)?put\s+me\s+down\s+as\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})(?=[,.\s]|$)/i
  );
  if (putDownMatch && putDownMatch[1]) {
    const formatted = tryValidateAndFormatName(putDownMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 3. "My name is Riya Sharma" / "Actually, my name is Riya Patil" / "Sorry, my name is Riya Patil" / "Name is Riya Sharma" / "Name: Riya Sharma"
  const myNameMatch = remainingText.match(
    /(?:(?:actually|sorry|no|wait)[,\s]+)?(?:my\s+name\s+is|name\s*[:=-]|this\s+is|call\s+me)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})(?=[,.\s]+(?:and|my|number|phone|cell|with|for|at|on|tomorrow|today|\d)|[,.]|$)/i
  );
  if (myNameMatch && myNameMatch[1]) {
    const formatted = tryValidateAndFormatName(myNameMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 4. "I'm Riya Sharma" / "I am Riya Sharma" / "Im Riya Sharma" (Requirement 2)
  const imNameMatch = remainingText.match(
    /(?:(?:actually|sorry|no|wait)[,\s]+)?(?:i'm|im|i\s+am)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})(?=[,.\s]+(?:and|my|number|phone|cell|with|for|at|on|tomorrow|today|\d)|[,.]|$)/i
  );
  if (imNameMatch && imNameMatch[1]) {
    const candidate = imNameMatch[1].trim();
    if (!isInvalidNameCandidate(candidate)) {
      const formatted = tryValidateAndFormatName(candidate);
      if (formatted) {
        return {
          name: formatted,
          phone: phoneValidation,
          hasIncompletePhone: phoneExtracted.isIncomplete,
          incompletePhoneError: phoneExtracted.error,
        };
      }
    }
  }

  // 5. Patient intro pattern: "I'm a new patient, Priya Sharma. I need a cleaning next Monday around 3 PM."
  const newPatientNameMatch = remainingText.match(
    /(?:i'm|im|i am)\s+(?:a\s+)?(?:new|existing|returning)?\s*patient[,\s]+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})\b/i
  );
  if (newPatientNameMatch && newPatientNameMatch[1]) {
    const formatted = tryValidateAndFormatName(newPatientNameMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 6. Family booking pattern: "for my mom, Maria Garcia" / "booking for my husband, David Smith"
  const familyNameMatch = remainingText.match(
    /(?:for|booking for)\s+(?:my\s+)?(?:mom|mother|dad|father|husband|wife|son|daughter|child|kid|spouse|friend)[,\s]+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})\b/i
  );
  if (familyNameMatch && familyNameMatch[1]) {
    const formatted = tryValidateAndFormatName(familyNameMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 7. Comma-separated: "Priya Sharma, 281-946-2569" or "Priya Sharma, I need..."
  const commaNameMatch = remainingText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:,|$)/);
  if (commaNameMatch && commaNameMatch[1]) {
    const formatted = tryValidateAndFormatName(commaNameMatch[1]);
    if (formatted) {
      return {
        name: formatted,
        phone: phoneValidation,
        hasIncompletePhone: phoneExtracted.isIncomplete,
        incompletePhoneError: phoneExtracted.error,
      };
    }
  }

  // 8. Clean name from remaining text if whole statement was a name entry
  let nameCandidate = remainingText
    .replace(/(?:and\s+)?(?:my\s+)?(?:phone|number|cell|mobile)(?:\s+is|\s*[:=-])?/gi, ' ')
    .replace(/(?:use\s+my\s+other\s+phone|other\s+phone|different\s+phone|new\s+phone|new\s+number)(?:\s+is|\s*[:=-])?/gi, ' ')
    .replace(
      /^(?:my\s+name\s+is|i\s+am|i'm|im|call\s+me|this\s+is|you\s+can\s+put\s+me\s+down\s+as|put\s+me\s+down\s+as|name\s*[:=-]|patient\s*[:=-]|contact\s*[:=-])+/i,
      ' '
    )
    .replace(/^(?:and|,)+/g, ' ')
    .replace(/(?:and|,)+$/g, ' ')
    .trim();

  if (/^[\d\s()+-.]+$/.test(nameCandidate) || nameCandidate.length < 2) {
    nameCandidate = '';
  }

  const validName = tryValidateAndFormatName(nameCandidate);

  return {
    name: validName,
    phone: phoneValidation,
    hasIncompletePhone: phoneExtracted.isIncomplete,
    incompletePhoneError: phoneExtracted.error,
  };
}

export interface DetailCorrectionResult {
  hasCorrection: boolean;
  type?: 'date' | 'time' | 'reason' | 'name' | 'phone' | 'patient_type' | 'urgent' | 'multi';
  isUrgentSwitch?: boolean;
  datePref?: ReturnType<typeof extractDatePreference>;
  timePref?: ReturnType<typeof extractTimePreference>;
  reason?: string;
  name?: string;
  phone?: ReturnType<typeof validateUSPhoneNumber>;
  patientType?: PatientType;
  rawText: string;
}

/**
 * Detects whether the patient is actively changing or correcting a detail mid-flow:
 * Examples:
 * - "Actually, make that Tuesday."
 * - "Can I come in the morning instead?"
 * - "I'd like an implant consultation instead of a cleaning."
 * - "My name is spelled Sarah, not Sara."
 * - "Use my other phone number: 281-555-0199."
 * - "Actually, I'm having severe tooth pain."
 */
export function detectDetailCorrection(text: string): DetailCorrectionResult {
  const lower = text.trim().toLowerCase();
  const rawText = text.trim();

  // If this is primarily an FAQ or pricing inquiry (e.g. "Wait, how much does a cleaning cost?", "Wait, do you take Delta?")
  // without an explicit replacement/change clause, do NOT treat it as a detail correction.
  const isPricingOrFaqQuery =
    (lower.includes('how much') ||
      lower.includes('cost') ||
      lower.includes('price') ||
      lower.includes('pricing') ||
      lower.includes('fee') ||
      lower.includes('charge') ||
      lower.includes('insurance') ||
      lower.includes('in network') ||
      lower.includes('delta') ||
      lower.includes('metlife') ||
      lower.includes('cigna') ||
      lower.includes('aetna') ||
      lower.includes('where are you') ||
      lower.includes('address') ||
      lower.includes('hours') ||
      lower.includes('open saturday') ||
      lower.includes('what is a root canal')) &&
    !lower.includes('instead') &&
    !lower.includes('change that') &&
    !lower.includes('change to') &&
    !lower.includes('switch to') &&
    !lower.includes('rather do') &&
    !lower.includes('make that');

  if (isPricingOrFaqQuery) {
    return {
      hasCorrection: false,
      rawText,
    };
  }

  const isExplicitCorrection =
    lower.includes('actually') ||
    lower.includes('instead') ||
    lower.includes('make that') ||
    lower.includes('make it') ||
    lower.includes('change to') ||
    lower.includes('switch to') ||
    lower.includes('change date') ||
    lower.includes('change time') ||
    lower.includes('change service') ||
    lower.includes('rather do') ||
    lower.includes('rather have') ||
    lower.includes('can we do') ||
    lower.includes('could we do') ||
    lower.includes('how about') ||
    lower.includes('what about') ||
    lower.includes("let's do") ||
    lower.includes('let us do') ||
    lower.includes('spelled') ||
    lower.includes('other phone') ||
    lower.includes('different phone') ||
    lower.includes('new number') ||
    lower.startsWith('wait') ||
    lower.includes('wait,') ||
    lower.includes('no wait') ||
    lower.startsWith('no,') ||
    lower.startsWith('no ') ||
    lower.startsWith('not ') ||
    lower.includes('i meant') ||
    lower.includes('sorry,') ||
    lower.includes('sorry ') ||
    lower.includes('not that') ||
    lower.includes('change that');

  const isUrgentComplaint =
    lower.includes('tooth pain') ||
    lower.includes('severe pain') ||
    lower.includes('hurts bad') ||
    lower.includes('hurting really bad') ||
    lower.includes('hurting bad') ||
    lower.includes('killing me') ||
    lower.includes('emergency') ||
    lower.includes('abscess') ||
    lower.includes('swelling') ||
    lower.includes('throbbing');

  const datePref = extractDatePreference(rawText);
  const timePref = extractTimePreference(rawText);
  const reason = extractVisitReason(rawText);
  const contact = extractContactDetails(rawText);
  const patientType = extractPatientType(rawText);

  // Check urgent switch specifically: "Actually, my tooth is hurting really bad right now. Can I come today instead?"
  if (isUrgentComplaint && (isExplicitCorrection || lower.includes('can i come') || lower.includes('today instead'))) {
    return {
      hasCorrection: true,
      type: 'urgent',
      isUrgentSwitch: true,
      reason: 'Tooth Pain / Urgent Discomfort',
      datePref: datePref || undefined,
      timePref: timePref || undefined,
      rawText,
    };
  }

  // Check name correction: "Actually, my name is Riya Patil", "Sorry, my name is Riya Patil", "My name is spelled Sarah, not Sara"
  if (
    contact.name &&
    (isExplicitCorrection ||
      lower.includes('name') ||
      lower.includes('spelled') ||
      lower.includes('spelt') ||
      lower.includes('call me') ||
      lower.includes('put me down as'))
  ) {
    return {
      hasCorrection: true,
      type: 'name',
      name: contact.name,
      rawText,
    };
  }

  // Check phone change: "My number is actually 9123456789", "Actually, my number is 9123456789", "Use my other phone..."
  if (
    contact.phone &&
    (isExplicitCorrection ||
      lower.includes('other phone') ||
      lower.includes('different phone') ||
      lower.includes('use') ||
      lower.includes('number') ||
      lower.includes('phone') ||
      lower.includes('cell') ||
      lower.includes('mobile'))
  ) {
    return {
      hasCorrection: true,
      type: 'phone',
      phone: contact.phone,
      rawText,
    };
  }

  // Check reason / service change specifically
  if (reason && (lower.includes('instead') || lower.includes('rather') || lower.includes('consultation instead') || lower.includes('can we do') || isExplicitCorrection)) {
    return {
      hasCorrection: true,
      type: (datePref || timePref) ? 'multi' : 'reason',
      reason,
      datePref: datePref || undefined,
      timePref: timePref || undefined,
      rawText,
    };
  }

  // Check date / time correction
  if (isExplicitCorrection && (datePref || timePref)) {
    return {
      hasCorrection: true,
      type: datePref && timePref ? 'multi' : datePref ? 'date' : 'time',
      datePref: datePref || undefined,
      timePref: timePref || undefined,
      reason: reason || undefined,
      rawText,
    };
  }

  if (isExplicitCorrection && patientType) {
    return {
      hasCorrection: true,
      type: 'patient_type',
      patientType,
      rawText,
    };
  }

  const hasAnyDetail = !!datePref || !!timePref || !!reason || !!contact.name || !!contact.phone || !!patientType;

  return {
    hasCorrection: isExplicitCorrection && hasAnyDetail,
    type: (datePref && timePref && reason) ? 'multi' : undefined,
    datePref: datePref || undefined,
    timePref: timePref || undefined,
    reason: reason || undefined,
    name: contact.name,
    phone: contact.phone,
    patientType: patientType || undefined,
    rawText,
  };
}

/**
 * Formats conversational slot offers matching natural human receptionist phrasing:
 * - If requested time is booked: "I don't have 2:00 PM available on Tuesday, September 15, but I do have 1:30 PM and 3:30 PM open. Would either of those work for you?"
 * - If time period requested: "For your Routine Checkup & Cleaning on Saturday, September 12, I have afternoon openings at 1:00 PM and 2:00 PM. Which time works best for you?"
 */
export function formatConversationalSlotOffer(params: {
  dateStr: string;
  requestedTimeLabel?: string;
  availableSlots: DemoAppointmentSlot[];
  serviceName?: string;
  isUrgent?: boolean;
  timePref?: ReturnType<typeof extractTimePreference>;
  patientType?: PatientType;
}): string {
  const { dateStr, requestedTimeLabel, availableSlots, serviceName, isUrgent, timePref } = params;
  const dateFormatted = formatDatePretty(dateStr);

  if (isUrgent) {
    const earliest = availableSlots[0];
    if (earliest) {
      return `I'm so sorry to hear your tooth is hurting. The earliest urgent appointment available is ${dateFormatted} at ${earliest.time}. Would you like me to book this for you?`;
    }
  }

  // Case 1: Requested specific time was not available, but alternatives exist
  if (requestedTimeLabel && availableSlots.length > 0) {
    const times = availableSlots.slice(0, 3).map((s) => s.time);
    const timesList =
      times.length === 1
        ? times[0]
        : times.length === 2
        ? `${times[0]} and ${times[1]}`
        : `${times[0]}, ${times[1]}, and ${times[2]}`;
    return `I don't have ${requestedTimeLabel} available on ${dateFormatted}, but I do have ${timesList} open. Would either of those work for you?`;
  }

  // Case 2: Time period like afternoon or morning
  if (timePref?.period && availableSlots.length > 0) {
    const periodLabel = timePref.period === 'morning' ? 'morning' : 'afternoon';
    const times = availableSlots.slice(0, 4).map((s) => s.time);
    const timesList =
      times.length === 1
        ? times[0]
        : times.length === 2
        ? `${times[0]} and ${times[1]}`
        : `${times.slice(0, -1).join(', ')}, and ${times[times.length - 1]}`;
    const serviceLabel = serviceName ? ` ${serviceName.toLowerCase()}` : ' appointment';
    return `For your${serviceLabel} on ${dateFormatted}, I have ${periodLabel} openings at ${timesList}. Which time works best for you?`;
  }

  // Case 3: Relative shifts (later / earlier)
  if (timePref?.relative && availableSlots.length > 0) {
    const times = availableSlots.slice(0, 3).map((s) => s.time);
    const timesList =
      times.length === 1
        ? times[0]
        : times.length === 2
        ? `${times[0]} and ${times[1]}`
        : `${times.slice(0, -1).join(', ')}, and ${times[times.length - 1]}`;
    const relWord = timePref.relative === 'later' ? 'Later in the day' : 'Earlier in the day';
    return `${relWord} on ${dateFormatted}, I have openings at ${timesList}. Would either of those work for you?`;
  }

  // Case 4: General available slots
  if (availableSlots.length > 0) {
    const times = availableSlots.slice(0, 4).map((s) => s.time);
    const timesList =
      times.length === 1
        ? times[0]
        : times.length === 2
        ? `${times[0]} and ${times[1]}`
        : `${times.slice(0, -1).join(', ')}, and ${times[times.length - 1]}`;
    const serviceLabel = serviceName ? ` your ${serviceName}` : '';
    return `Here are our available openings for${serviceLabel} on ${dateFormatted}: ${timesList}. Which time would you prefer?`;
  }

  return `We do not have open appointments on ${dateFormatted}. Would you like me to check an alternative date for you?`;
}

/**
 * Filter and match appointment slots from Firestore based on time preference
 */
export function filterSlotsByPreference(
  slots: DemoAppointmentSlot[],
  timePref?: ReturnType<typeof extractTimePreference>
): {
  availableSlots: DemoAppointmentSlot[];
  exactMatch?: DemoAppointmentSlot;
  filteredAvailable: DemoAppointmentSlot[];
} {
  const availableSlots = slots.filter(
    (s) => s.status === 'available' && !isSlotOrAppointmentExpired(s.date, s.time)
  );

  if (!timePref) {
    return {
      availableSlots,
      filteredAvailable: availableSlots,
    };
  }

  // Check exact time match
  if (timePref.targetTime) {
    const normalizedTarget = timePref.targetTime.toUpperCase();
    const exact = availableSlots.find((s) => s.time.toUpperCase() === normalizedTarget);
    if (exact) {
      return {
        availableSlots,
        exactMatch: exact,
        filteredAvailable: [exact],
      };
    }
  }

  // Check range / period matches
  const filtered = availableSlots.filter((slot) => {
    const slotMins = parseTimeToMinutes(slot.time);

    if (timePref.minMinutes !== undefined && slotMins < timePref.minMinutes) {
      return false;
    }
    if (timePref.maxMinutes !== undefined && slotMins > timePref.maxMinutes) {
      return false;
    }
    if (timePref.targetHour !== undefined) {
      const slotHour = Math.floor(slotMins / 60);
      // Within 1 hour of target
      if (Math.abs(slotHour - timePref.targetHour) > 1) {
        return false;
      }
    }
    return true;
  });

  return {
    availableSlots,
    filteredAvailable: filtered.length > 0 ? filtered : availableSlots,
  };
}

/**
 * Checks if a user's message is asking for the next available, earliest, or soonest appointment slot.
 */
export function isNextAvailableQuery(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  // Do not confuse relative time shift requests ("a bit earlier", "come earlier", "earlier than") with earliest appointment search
  if (
    lower.includes('bit earlier') ||
    lower.includes('come earlier') ||
    lower.includes('earlier than')
  ) {
    return false;
  }
  return (
    lower.includes('next available') ||
    lower.includes('earliest available') ||
    lower.includes('the earliest available time') ||
    lower.includes('earliest time') ||
    lower.includes('earliest appointment') ||
    lower.includes('soonest available') ||
    lower.includes('soonest appointment') ||
    lower.includes('first available') ||
    lower.includes('earliest opening') ||
    lower.includes('first opening') ||
    lower.includes('next opening') ||
    lower.includes('earliest slot') ||
    lower.includes('next slot') ||
    lower.includes('as soon as possible') ||
    lower.includes('asap') ||
    lower.includes('earliest') ||
    lower.includes('soonest') ||
    lower === 'next' ||
    lower === 'earliest' ||
    lower === 'soonest'
  );
}


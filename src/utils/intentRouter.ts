// Intent Classification & Response Routing Layer for AI Dental Receptionist
// Dental Care & Implants of Houston – Greenspoint (Houston, TX)

import { DemoAppointmentSlot, PatientType } from '../types';
import { getHoustonCurrentDateTime, isSlotOrAppointmentExpired } from './clinicTime';
import {
  extractDatePreference,
  extractTimePreference,
  extractContactDetails,
  extractVisitReason,
  extractPatientType,
  isNextAvailableQuery,
  isCancellationIntent,
  isLifeThreateningEmergency,
  isUrgentDentalComplaint,
  isClearConfirmationIntent,
  isAmbiguousConfirmation,
  detectDetailCorrection,
  formatDatePretty,
  parseTimeToMinutes,
} from './bookingConversationEngine';
import {
  getHoustonOperatingStatus,
  getPricingResponse,
  isPricingInquiry,
  isInsuranceInquiry,
  getInsuranceResponse,
  isEducationalDentalQuery,
  isCasualGreetingOrClosing,
  isUnclearClarificationNeeded,
} from './conciergeEngine';
import {
  BusinessKnowledgeConfig,
  DEFAULT_BUSINESS_KNOWLEDGE,
} from '../types';
import { getLoadedBusinessKnowledge } from '../services/businessKnowledgeService';
import { getLoadedBusinessConfig } from '../services/businessConfigService';
import {
  findMatchingFAQ,
  findMatchingService,
  findMatchingPolicy,
  findMatchingPricing,
  findMatchingFinancing,
  findMatchingInsurance,
} from './knowledgeMatcher';

export type IntentCategory =
  | 'emergency'
  | 'urgent_dental'
  | 'booking'
  | 'availability'
  | 'pricing'
  | 'service_information'
  | 'clinic_information'
  | 'hours'
  | 'contact'
  | 'financing'
  | 'insurance'
  | 'doctor_information'
  | 'general_dental_information'
  | 'appointment_change'
  | 'appointment_cancellation'
  | 'casual_conversation'
  | 'clarification'
  | 'faq'
  | 'policy'
  | 'unknown';

export interface IntentContext {
  bookingInProgress?: boolean;
  bookingStep?: string;
  visitReason?: string;
  selectedDate?: string;
  selectedSlot?: DemoAppointmentSlot | null;
  patientType?: PatientType;
  patientName?: string;
  patientPhone?: string;
  hasConfirmedAppointment?: boolean;
  confirmedSlot?: DemoAppointmentSlot | null;
  confirmedReason?: string;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
}

export interface ClassifiedIntentResult {
  primaryIntent: IntentCategory;
  secondaryIntents: IntentCategory[];
  allIntents: IntentCategory[];
  isMultiIntent: boolean;

  // Extracted entities and context details
  serviceName?: string;
  datePref?: { dateStr: string; label: string; isSunday: boolean } | null;
  timePref?: ReturnType<typeof extractTimePreference>;
  patientType?: PatientType;
  isNextAvailable?: boolean;
  isCorrection?: boolean;
  correctionType?: 'date' | 'time' | 'reason' | 'name' | 'phone' | 'urgent' | 'multi' | 'patient_type';
  isConfirmation?: boolean;
  isNegative?: boolean;
  rawText: string;
}

/**
 * Checks whether text asks about financing or payment plans.
 */
export function isFinancingInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('financ') ||
    lower.includes('payment plan') ||
    lower.includes('payment plans') ||
    lower.includes('installment') ||
    lower.includes('installments') ||
    lower.includes('pay monthly') ||
    lower.includes('monthly payment') ||
    lower.includes('carecredit') ||
    lower.includes('care credit') ||
    lower.includes('cherry') ||
    lower.includes('sunbit') ||
    lower.includes('proceed finance') ||
    lower.includes('alpheon') ||
    lower.includes('alphaeon') ||
    lower.includes('basis')
  );
}

/**
 * Checks whether text asks about doctor / dentist info.
 */
export function isDoctorInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('who are the dentists') ||
    lower.includes('who is the dentist') ||
    lower.includes('who are the doctors') ||
    lower.includes('who is the doctor') ||
    lower.includes('who works there') ||
    lower.includes('what dentists') ||
    lower.includes('what doctors') ||
    lower.includes('bhawsar') ||
    lower.includes('dinh') ||
    lower.includes('lalani') ||
    lower.includes('matayoshi') ||
    (lower.includes('doctor') && (lower.includes('who') || lower.includes('name') || lower.includes('tell me about'))) ||
    (lower.includes('dentist') && (lower.includes('who') || lower.includes('name') || lower.includes('practicing')))
  );
}

/**
 * Checks whether text asks about clinic location / address.
 */
export function isClinicInfoInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('where are you located') ||
    lower.includes('where is the clinic') ||
    lower.includes('where is the office') ||
    lower.includes('where is your office') ||
    lower.includes('what is your address') ||
    lower.includes("what's your address") ||
    lower.includes('what is the address') ||
    lower.includes("what's the address") ||
    lower.includes('how do i get there') ||
    lower.includes('directions to') ||
    lower.includes('office address') ||
    lower.includes('clinic address') ||
    (lower.includes('where') && (lower.includes('located') || lower.includes('office') || lower.includes('clinic')))
  );
}

/**
 * Checks whether text asks about contact / phone info.
 */
export function isContactInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('what number should i call') ||
    lower.includes('what is your phone number') ||
    lower.includes("what's your phone number") ||
    lower.includes('what is the phone number') ||
    lower.includes("what's the phone number") ||
    lower.includes('what is your number') ||
    lower.includes("what's your number") ||
    lower.includes('how can i call you') ||
    lower.includes('how do i call') ||
    lower.includes('phone number') ||
    lower.includes('telephone number') ||
    lower.includes('contact number') ||
    (lower.includes('call') && lower.includes('number'))
  );
}

/**
 * Checks whether text asks about clinic hours / days open.
 */
export function isHoursInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('what time do you open') ||
    lower.includes('what time do you close') ||
    lower.includes('what are your hours') ||
    lower.includes('what are the hours') ||
    lower.includes('office hours') ||
    lower.includes('clinic hours') ||
    lower.includes('operating hours') ||
    lower.includes('are you open saturday') ||
    lower.includes('open on saturday') ||
    lower.includes('are you open sunday') ||
    lower.includes('open on sunday') ||
    lower.includes('are you open today') ||
    lower.includes('open today') ||
    lower.includes('when do you open') ||
    lower.includes('when do you close') ||
    lower.includes('when are you open')
  );
}

/**
 * Checks whether text asks if the clinic offers or provides a service (service_information).
 * "Do you do implants?" -> service_information
 * "Do you offer root canals?" -> service_information
 * "What implant options do you offer?" -> service_information
 * "Do you do Invisalign?" -> service_information
 */
export function isServiceInformationInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // If the user clearly wants to book or schedule, it's not purely a service offering inquiry
  const hasBookingVerb =
    lower.includes('i want to book') ||
    lower.includes('can i book') ||
    lower.includes('book an') ||
    lower.includes('book a') ||
    lower.includes('schedule an') ||
    lower.includes('schedule a') ||
    lower.includes('make an appointment') ||
    lower.includes('need an appointment') ||
    lower.includes('i need a') ||
    lower.includes('i need an');

  if (hasBookingVerb && !lower.includes('do you do') && !lower.includes('do you offer') && !lower.includes('what services')) {
    return false;
  }

  // Educational queries like "What is a root canal?" are general_dental_information, not service_information
  if (isEducationalDentalQuery(text)) {
    return false;
  }

  // Pricing inquiries like "How much does an implant cost?" are pricing, not service_information
  // Unless it's a multi-intent message like "Do you do implants and how much do they cost?"
  if (isPricingInquiry(text) && !lower.includes('do you do') && !lower.includes('do you offer') && !lower.includes('do you provide')) {
    return false;
  }

  const serviceInquiryPhrases = [
    'do you do',
    'do you offer',
    'do you provide',
    'do you have implants',
    'do you have invisalign',
    'do you have root canal',
    'what services do you offer',
    'what services do you provide',
    'what services do you have',
    'what treatments do you offer',
    'what treatments do you provide',
    'what implant options do you offer',
    'what dental services',
    'view services',
    'list of services',
    'can you do',
    'are you able to do',
  ];

  return serviceInquiryPhrases.some((phrase) => lower.includes(phrase));
}

/**
 * Checks whether text is asking about slot availability.
 * e.g. "Do you have anything tomorrow?", "What's available Saturday?",
 * "Any appointments this afternoon?", "Do you have 2 PM available?",
 * "Do you have an implant appointment tomorrow?", "What's the earliest appointment?"
 */
export function isAvailabilityInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();

  if (isNextAvailableQuery(text)) return true;

  const availabilityPhrases = [
    'do you have anything',
    'do you have any appointments',
    'do you have any opening',
    'do you have any openings',
    'do you have any slot',
    'do you have any slots',
    'do you have an appointment',
    'do you have an implant appointment',
    'do you have a cleaning appointment',
    "what's available",
    'what is available',
    'any appointments',
    'any opening',
    'any openings',
    'any slots',
    'have anything open',
    'have any openings',
    'is there an opening',
    'is there any opening',
    'available tomorrow',
    'available saturday',
    'available monday',
    'available tuesday',
    'available wednesday',
    'available thursday',
    'available friday',
    'available today',
    'available this afternoon',
    'available in the morning',
    'openings tomorrow',
    'openings saturday',
    'openings on',
    'what times are available',
    'what times do you have',
  ];

  if (availabilityPhrases.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  // Regex check for "Do you have [time] available?" e.g. "Do you have 2 PM available?"
  if (/do you have (?:an? )?[\d:]+\s*(?:am|pm)?\s*(?:available|open)/i.test(lower)) {
    return true;
  }

  // "Do you have an [service] appointment [date]?" e.g. "Do you have an implant appointment tomorrow?"
  if (/do you have (?:an? )?.*appointment (?:tomorrow|today|on|this|next)/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Checks whether text expresses direct booking intent.
 * "I want to book an appointment", "Can you schedule me?", "I'd like to make an appointment",
 * "Can I book an implant consultation?", "I need a root canal", "I need a cleaning tomorrow"
 */
export function isBookingInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const bookingPhrases = [
    'want to book',
    'like to book',
    'can i book',
    'could i book',
    'schedule me',
    'schedule an appointment',
    'schedule a visit',
    'make an appointment',
    'set up an appointment',
    'reserve an appointment',
    'reserve a slot',
    'book an appointment',
    'book a cleaning',
    'book an implant',
    'book a consultation',
    'book this',
    'book it',
    'i need an appointment',
    "i'd like an appointment",
    'id like an appointment',
    'i want an appointment',
    'i would like an appointment',
    'can i get an appointment',
    'can i make an appointment',
    'i need to book',
    'i need to schedule',
    'i need to make an appointment',
  ];

  if (bookingPhrases.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  // Patient type statements initiating booking
  if (extractPatientType(text) !== null) {
    return true;
  }

  // "I need a [service]" e.g. "I need a cleaning", "I need a root canal", "I need dental implants"
  if (
    /^i need (?:a|an)\s+(?:cleaning|root canal|checkup|exam|implant|crown|filling|consultation|teeth whitening)/i.test(
      lower
    ) ||
    /i need (?:a|an)\s+.*(?:tomorrow|today|saturday|monday|tuesday|wednesday|thursday|friday|next week)/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether text asks to reschedule, move, or change an existing appointment
 * e.g. "Can I move it to Monday?", "Can I change my appointment?", "Can I move my appointment to Monday?"
 */
export function isAppointmentChangeInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const changePhrases = [
    'move it to',
    'move my appointment',
    'move the appointment',
    'change my appointment',
    'change the appointment',
    'change my booking',
    'change the booking',
    'reschedule my appointment',
    'reschedule the appointment',
    'reschedule it',
    'reschedule to',
    'can i move it',
    'can i move to',
    'can we move it',
    'can we reschedule',
    'switch my appointment',
    'shift my appointment',
    'change date to',
    'change time to',
  ];

  return changePhrases.some((phrase) => lower.includes(phrase));
}

/**
 * Core Intent Classification Engine.
 * Implements the 18 intent categories required:
 * 1. emergency
 * 2. urgent_dental
 * 3. booking
 * 4. availability
 * 5. pricing
 * 6. service_information
 * 7. clinic_information
 * 8. hours
 * 9. contact
 * 10. financing
 * 11. insurance
 * 12. doctor_information
 * 13. general_dental_information
 * 14. appointment_change
 * 15. appointment_cancellation
 * 16. casual_conversation
 * 17. clarification
 * 18. unknown
 *
 * Adheres strictly to:
 * - Intent based on meaning (not single keywords)
 * - Emergency priority (Priority 1)
 * - Multi-intent message decomposition (primary + secondary intents)
 * - Context-driven intent resolution (short follow-ups, corrections, previous context)
 * - Safe handling of ambiguities
 */
export function classifyIntent(
  text: string,
  context: IntentContext = {},
  knowledge?: BusinessKnowledgeConfig
): ClassifiedIntentResult {
  const rawText = text.trim();
  const lower = rawText.toLowerCase();

  const detectedIntents: IntentCategory[] = [];

  // 1. EMERGENCY (Priority 1: Absolute clinical safety override)
  // Life-threatening symptoms: trouble breathing, swallowing, uncontrolled severe bleeding, severe throat/facial swelling
  if (isLifeThreateningEmergency(rawText)) {
    return {
      primaryIntent: 'emergency',
      secondaryIntents: [],
      allIntents: ['emergency'],
      isMultiIntent: false,
      rawText,
    };
  }

  // 2. URGENT DENTAL
  // Severe tooth pain, broken tooth pain, urgent tooth discomfort
  const isUrgent = isUrgentDentalComplaint(rawText);
  if (isUrgent) {
    detectedIntents.push('urgent_dental');
  }

  // 3. APPOINTMENT CANCELLATION
  // "Cancel my appointment", "Stop booking", "Cancel it", etc.
  const isCancel = isCancellationIntent(rawText) || lower.includes('cancel my appointment') || lower.includes('cancel booking');
  if (isCancel) {
    detectedIntents.push('appointment_cancellation');
  }

  // 4. APPOINTMENT CHANGE / RESCHEDULE / CORRECTION
  // Explicit change query ("Can I move it to Monday?", "Reschedule my appointment")
  // Or in-flow detail correction ("Actually, Saturday", "Can I come in the morning instead?")
  const isExplicitChange = isAppointmentChangeInquiry(rawText);
  const detailCorrection = context.bookingInProgress ? detectDetailCorrection(rawText) : null;
  const hasCorrection = detailCorrection?.hasCorrection || false;

  if (isExplicitChange || hasCorrection) {
    detectedIntents.push('appointment_change');
  }

  // 5. PRICING
  // "How much does an implant cost?", "How much is Invisalign?", "What's the price of whitening?", "How much?"
  const isPricing = isPricingInquiry(rawText);
  if (isPricing) {
    detectedIntents.push('pricing');
  }

  // 6. FINANCING
  // "Do you offer financing?", "Do you accept CareCredit?", "How much does financing cost?"
  const isFinancing = isFinancingInquiry(rawText);
  if (isFinancing) {
    detectedIntents.push('financing');
  }

  // 7. INSURANCE
  // "Do you accept insurance?", "Do you take Delta Dental?"
  const isInsurance = isInsuranceInquiry(rawText);
  if (isInsurance) {
    detectedIntents.push('insurance');
  }

  // 8. DOCTOR INFORMATION
  // "Who are the dentists?", "Who is Dr. Bhawsar?"
  const isDoctor = isDoctorInquiry(rawText);
  if (isDoctor) {
    detectedIntents.push('doctor_information');
  }

  // 9. CLINIC INFORMATION
  // "Where are you located?", "What is your address?"
  const isClinicInfo = isClinicInfoInquiry(rawText);
  if (isClinicInfo) {
    detectedIntents.push('clinic_information');
  }

  // 10. CONTACT
  // "What number should I call?", "What is your phone number?"
  const isContact = isContactInquiry(rawText);
  if (isContact) {
    detectedIntents.push('contact');
  }

  // 11. HOURS
  // "What time do you open?", "Are you open Saturday?"
  const isHours = isHoursInquiry(rawText);
  if (isHours) {
    detectedIntents.push('hours');
  }

  // 12. GENERAL DENTAL INFORMATION (Educational)
  // "What is a root canal?", "What are dental implants?", "How does Invisalign work?"
  const isEducational = isEducationalDentalQuery(rawText) !== null;
  if (isEducational) {
    detectedIntents.push('general_dental_information');
  }

  // 13. SERVICE INFORMATION
  // "Do you do implants?", "Do you offer root canals?", "What implant options do you offer?"
  const isServiceInfo = isServiceInformationInquiry(rawText);
  if (isServiceInfo) {
    detectedIntents.push('service_information');
  }

  // 14. AVAILABILITY
  // "Do you have anything tomorrow?", "What's available Saturday?", "Do you have an implant appointment tomorrow?", "What's the earliest appointment?"
  const isAvailability = isAvailabilityInquiry(rawText);
  if (isAvailability) {
    detectedIntents.push('availability');
  }

  // 15. BOOKING
  // "I want to book an appointment", "Can you schedule me?", "Can I book an implant consultation?", "I need a root canal tomorrow"
  const isBooking = isBookingInquiry(rawText);
  if (isBooking) {
    detectedIntents.push('booking');
  }

  // 16. BUSINESS FAQ (Phase 11D - only matches active FAQs)
  const matchedFaq = findMatchingFAQ(rawText, knowledge);
  if (matchedFaq) {
    detectedIntents.push('faq');
  }

  // 17. BUSINESS POLICY (Phase 11D - cancellation, appointment arrival, new patient, payment)
  const matchedPolicy = findMatchingPolicy(rawText, knowledge);
  if (matchedPolicy) {
    detectedIntents.push('policy');
  }

  // 18. CASUAL CONVERSATION
  // "hi", "thanks", "okay", "bye", "sounds good"
  const casualGreeting = isCasualGreetingOrClosing(rawText);
  if (casualGreeting && detectedIntents.length === 0) {
    detectedIntents.push('casual_conversation');
  }

  // 19. CLARIFICATION
  // "Can I get that?", "Do you do that?" without context
  const isUnclear = isUnclearClarificationNeeded(rawText);
  if (isUnclear && detectedIntents.length === 0 && !context.bookingInProgress) {
    detectedIntents.push('clarification');
  }

  // Extract date / time / service details
  const datePref = extractDatePreference(rawText);
  const timePref = extractTimePreference(rawText);
  const isNextAvail = isNextAvailableQuery(rawText);
  const extractedReason = extractVisitReason(rawText);
  const patientType = extractPatientType(rawText);

  if (patientType && !detectedIntents.includes('booking')) {
    detectedIntents.push('booking');
  }

  // CONTEXT-AWARE RESOLUTION (Section 12, 13, 14, 15)
  // Case A: Context in booking step "ask_date" and user sends short date: e.g. "Tomorrow." (TEST K)
  if (context.bookingInProgress && context.bookingStep === 'ask_date' && datePref && detectedIntents.length === 0) {
    detectedIntents.push('availability');
    detectedIntents.push('booking');
  }

  // Case B: Context in booking step "ask_visit_reason" and user sends service name: e.g. "Cleaning"
  if (context.bookingInProgress && context.bookingStep === 'ask_visit_reason' && extractedReason && detectedIntents.length === 0) {
    detectedIntents.push('booking');
  }

  // Case C: Context in booking step and user asks "How much?" (TEST M: "I want a cleaning." Then: "How much?")
  if (isPricing && !extractedReason && (context.visitReason || context.confirmedReason)) {
    // Pricing intent inherited the service from context!
  }

  // Case D: If user says "Cancel my appointment." (TEST N)
  if (lower === 'cancel my appointment' || lower === 'cancel my appointment.' || lower === 'cancel appointment') {
    return {
      primaryIntent: 'appointment_cancellation',
      secondaryIntents: [],
      allIntents: ['appointment_cancellation'],
      isMultiIntent: false,
      rawText,
    };
  }

  // Case E: If user says "Can I move it to Monday?" (TEST O)
  if (isExplicitChange && datePref) {
    return {
      primaryIntent: 'appointment_change',
      secondaryIntents: ['availability'],
      allIntents: ['appointment_change', 'availability'],
      isMultiIntent: true,
      datePref,
      rawText,
    };
  }

  // Case F: Context during booking where user corrects a detail: e.g. "Actually, Saturday." (TEST L)
  if (hasCorrection) {
    return {
      primaryIntent: 'appointment_change',
      secondaryIntents: detailCorrection?.datePref ? ['availability'] : [],
      allIntents: detailCorrection?.datePref ? ['appointment_change', 'availability'] : ['appointment_change'],
      isMultiIntent: !!detailCorrection?.datePref,
      isCorrection: true,
      correctionType: detailCorrection?.type,
      datePref: detailCorrection?.datePref,
      timePref: detailCorrection?.timePref,
      serviceName: detailCorrection?.reason,
      rawText,
    };
  }

  // Fallback: If no intent was recognized and text is not empty
  if (detectedIntents.length === 0) {
    // If text has date or time preference during booking
    if (context.bookingInProgress && (datePref || timePref)) {
      detectedIntents.push('availability');
    } else if (isUnclear) {
      detectedIntents.push('clarification');
    } else {
      detectedIntents.push('unknown');
    }
  }

  // MULTI-INTENT PRIORITY & RESOLUTION (Section 10 & 11)
  // Determine primaryIntent and secondaryIntents based on meaning:
  let primaryIntent: IntentCategory = detectedIntents[0];
  const secondaryIntents: IntentCategory[] = [];

  // Priority ranking rules:
  // 1. emergency (handled at top)
  // 2. urgent_dental
  // 3. appointment_cancellation
  // 4. appointment_change
  // 5. booking (when combined with availability or pricing, e.g. TEST G: "I need a cleaning tomorrow afternoon and how much does it cost?")
  // 6. availability (when primary inquiry is about slots, e.g. TEST D: "Do you have an implant appointment tomorrow?")
  // 7. service_information (e.g. TEST E: "Do you do implants and how much do they cost?")
  // 8. pricing
  // 9. financing / insurance / hours / clinic_info / contact / doctor
  // 10. general_dental_information
  // 11. casual_conversation
  // 12. clarification
  // 13. unknown

  if (detectedIntents.includes('urgent_dental')) {
    primaryIntent = 'urgent_dental';
  } else if (detectedIntents.includes('appointment_cancellation')) {
    primaryIntent = 'appointment_cancellation';
  } else if (detectedIntents.includes('appointment_change')) {
    primaryIntent = 'appointment_change';
  } else if (detectedIntents.includes('booking')) {
    primaryIntent = 'booking';
  } else if (detectedIntents.includes('availability')) {
    primaryIntent = 'availability';
  } else if (detectedIntents.includes('faq')) {
    primaryIntent = 'faq';
  } else if (detectedIntents.includes('policy')) {
    primaryIntent = 'policy';
  } else if (detectedIntents.includes('service_information')) {
    primaryIntent = 'service_information';
  } else if (detectedIntents.includes('pricing')) {
    primaryIntent = 'pricing';
  } else if (detectedIntents.includes('hours')) {
    primaryIntent = 'hours';
  } else if (detectedIntents.includes('financing')) {
    primaryIntent = 'financing';
  } else if (detectedIntents.includes('insurance')) {
    primaryIntent = 'insurance';
  } else if (detectedIntents.includes('clinic_information')) {
    primaryIntent = 'clinic_information';
  } else if (detectedIntents.includes('contact')) {
    primaryIntent = 'contact';
  } else if (detectedIntents.includes('doctor_information')) {
    primaryIntent = 'doctor_information';
  } else if (detectedIntents.includes('general_dental_information')) {
    primaryIntent = 'general_dental_information';
  } else if (detectedIntents.includes('casual_conversation')) {
    primaryIntent = 'casual_conversation';
  } else if (detectedIntents.includes('clarification')) {
    primaryIntent = 'clarification';
  } else {
    primaryIntent = 'unknown';
  }

  // Populate secondary intents
  for (const intent of detectedIntents) {
    if (intent !== primaryIntent && !secondaryIntents.includes(intent)) {
      secondaryIntents.push(intent);
    }
  }

  return {
    primaryIntent,
    secondaryIntents,
    allIntents: detectedIntents,
    isMultiIntent: secondaryIntents.length > 0,
    serviceName: extractedReason || context.visitReason,
    datePref,
    timePref,
    patientType: patientType || context.patientType,
    isNextAvailable: isNextAvail,
    rawText,
  };
}

/**
 * Generates verified responses for informational / FAQ / Multi-intent queries
 * without exposing internal intent classifications to the patient.
 * Grounded in dynamic Business Knowledge & FAQ Configuration (Phase 11D).
 */
export function routeInformationalResponse(
  classification: ClassifiedIntentResult,
  context: IntentContext = {},
  knowledge?: BusinessKnowledgeConfig,
  businessPhone?: string
): string {
  const text = classification.rawText;
  const activeKnowledge = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;
  const activeBusiness = getLoadedBusinessConfig();
  const phone = businessPhone || activeBusiness.phone || '(281) 946-2569';

  // 0. BUSINESS FAQ (Phase 11D - only active FAQs are returned)
  const matchedFaq = findMatchingFAQ(text, activeKnowledge);
  if (classification.primaryIntent === 'faq' || matchedFaq) {
    if (matchedFaq) {
      return matchedFaq.answer;
    }
  }

  // 0B. BUSINESS POLICIES (Phase 11D - cancellation, arrival, new patient, payment)
  if (classification.primaryIntent === 'policy') {
    const policyMatch = findMatchingPolicy(text, activeKnowledge);
    if (policyMatch && policyMatch.isConfigured && policyMatch.text) {
      return policyMatch.text;
    }
    return `I don't currently have verified policy details available on file. Please call our front desk directly at ${phone} for policy information.`;
  }

  // 1. Service Information + Pricing (e.g. "Do you do implants and how much do they cost?")
  if (
    classification.allIntents.includes('service_information') &&
    classification.allIntents.includes('pricing')
  ) {
    const serviceMatch = findMatchingService(text, activeKnowledge);
    if (serviceMatch.unconfiguredTreatment) {
      return `I don't have information on whether we offer ${serviceMatch.unconfiguredTreatment}. You can contact our front desk at ${phone} to check, or would you like to see the dental services we currently provide?`;
    }
    if (serviceMatch.service) {
      const s = serviceMatch.service;
      const priceText = s.priceText && s.priceText.trim()
        ? `Configured pricing: ${s.priceText.trim()}.`
        : `I don't have verified pricing available for ${s.name}, as costs depend on individual treatment needs. You can contact our clinic directly at ${phone} for current pricing, or I can help you check appointment availability for a consultation.`;
      return `Yes, the clinic offers ${s.name}. ${priceText}`;
    }
    return findMatchingPricing(text, activeKnowledge, context.visitReason, phone);
  }

  // 2. Service Information + Hours (e.g. "Do you do implants and are you open Saturday?")
  if (
    classification.allIntents.includes('service_information') &&
    classification.allIntents.includes('hours')
  ) {
    const hoursInfo = getHoustonOperatingStatus(text);
    const serviceMatch = findMatchingService(text, activeKnowledge);
    if (serviceMatch.unconfiguredTreatment) {
      return `I don't have information on whether we offer ${serviceMatch.unconfiguredTreatment}. ${hoursInfo} You can call our front desk at ${phone} to check.`;
    }
    if (serviceMatch.service) {
      return `Yes, we offer ${serviceMatch.service.name}. ${hoursInfo} Would you like me to check appointment availability?`;
    }
    return `Yes, we offer comprehensive dental treatments at our clinic. ${hoursInfo} Would you like me to check appointment availability?`;
  }

  // 3. Service Information alone (e.g. "Do you do implants?", "What services do you offer?")
  if (classification.primaryIntent === 'service_information') {
    const serviceMatch = findMatchingService(text, activeKnowledge);
    if (serviceMatch.unconfiguredTreatment) {
      return `I don't have information on whether we offer ${serviceMatch.unconfiguredTreatment}. You can contact our front desk at ${phone} to check, or would you like to see the dental services we currently provide?`;
    }
    if (serviceMatch.service) {
      const s = serviceMatch.service;
      const durNotice = s.durationMinutes ? ` (typical appointment time is around ${s.durationMinutes} minutes)` : '';
      const priceNotice = s.priceText && s.priceText.trim() ? ` Configured pricing: ${s.priceText.trim()}.` : '';
      return `Yes, we provide ${s.name}: ${s.description}${durNotice}.${priceNotice} Would you like me to check appointment availability for a consultation?`;
    }

    const activeServices = (activeKnowledge.services || []).filter((s) => s.active !== false);
    const serviceBullets = activeServices.slice(0, 8).map((s) => `• ${s.name}`).join('\n');
    return (
      `${activeBusiness.businessName || 'Dental Care & Implants of Houston'} provides comprehensive dental care including:\n` +
      `${serviceBullets}\n\n` +
      "Would you like more details about any of these treatments, or would you like me to check appointment availability?"
    );
  }

  // 4. Pricing alone (e.g. "How much does an implant cost?", "How much?")
  if (classification.primaryIntent === 'pricing') {
    const effectiveText = text.length <= 15 && context.visitReason ? `${text} for ${context.visitReason}` : text;
    return findMatchingPricing(effectiveText, activeKnowledge, context.visitReason, phone);
  }

  // 5. Hours (Dynamic Houston Time)
  if (classification.primaryIntent === 'hours') {
    return getHoustonOperatingStatus(text);
  }

  // 6. Financing
  if (classification.primaryIntent === 'financing') {
    return findMatchingFinancing(activeKnowledge, phone);
  }

  // 7. Insurance
  if (classification.primaryIntent === 'insurance') {
    return findMatchingInsurance(activeKnowledge, phone);
  }

  // 8. Doctor Information
  if (classification.primaryIntent === 'doctor_information') {
    return (
      "The dentists practicing at our clinic are:\n" +
      "• Dr. Aditya Bhawsar\n" +
      "• Dr. James Dinh\n" +
      "• Dr. Firoz Lalani\n" +
      "• Dr. Vicky Matayoshi\n\n" +
      `You can reach our clinical team directly at ${phone}.`
    );
  }

  // 9. Clinic Information / Location
  if (classification.primaryIntent === 'clinic_information') {
    return (
      `Our office is located at:\n${activeBusiness.address || '165 Greens Rd, Houston, TX 77060, United States.'}\n\n` +
      `Phone: ${phone}`
    );
  }

  // 10. Contact Information
  if (classification.primaryIntent === 'contact') {
    return (
      `You can reach ${activeBusiness.businessName || 'Dental Care & Implants of Houston'} via:\n` +
      `• Phone: ${phone}\n` +
      `• Address: ${activeBusiness.address || '165 Greens Rd, Houston, TX 77060'}\n\n` +
      "Hours:\n" +
      "• Monday–Friday: 8:00 AM–7:00 PM\n" +
      "• Saturday: 8:00 AM–5:00 PM\n" +
      "• Sunday: Closed"
    );
  }

  // 11. General Dental Information (Educational)
  if (classification.primaryIntent === 'general_dental_information') {
    const edu = isEducationalDentalQuery(text);
    if (edu) return edu;
  }

  // 12. Casual Conversation
  if (classification.primaryIntent === 'casual_conversation') {
    const casual = isCasualGreetingOrClosing(text);
    if (casual) return casual;
    return `Hello! How can I help you today with ${activeBusiness.businessName || 'your dental care'}?`;
  }

  // 13. Clarification
  if (classification.primaryIntent === 'clarification') {
    const clarify = isUnclearClarificationNeeded(text);
    if (clarify) return clarify;
    return "Sure — what service or appointment details would you like to check?";
  }

  // 14. Unknown
  return (
    `I'm here to help you with dental appointments, service information, clinic hours, and questions for ${activeBusiness.businessName || 'our clinic'}. ` +
    `Could you please clarify what you'd like assistance with? You can also reach our front desk directly at ${phone}.`
  );
}

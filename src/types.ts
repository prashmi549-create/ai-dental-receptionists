export type PatientType = 'new' | 'existing';

export interface DemoPatient {
  id: string;
  fullName: string;
  phone: string;
  patientType: 'existing' | 'new';
  createdAt?: string;
  updatedAt?: string;
}

export interface Doctor {
  name: string;
  location: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: 'Restorative & Implants' | 'Cosmetic & Ortho' | 'General & Preventive' | 'Specialty & Urgent';
  description: string;
  badge?: string;
}

export interface FinancingPartner {
  name: string;
  tagline: string;
  type: string;
}

export type SlotStatus = 'available' | 'booked' | 'expired' | 'disabled';
export type SlotType = 'normal' | 'urgent';

export interface AppointmentBookingAction {
  step:
    | 'ask_patient_type'
    | 'ask_existing_phone'
    | 'ask_phone_country'
    | 'patient_lookup_failed'
    | 'ask_visit_reason'
    | 'ask_date'
    | 'show_slots'
    | 'ask_contact'
    | 'ask_phone'
    | 'review_confirmation'
    | 'change_details_options'
    | 'confirmed'
    | 'slot_taken_error';
  patientType?: PatientType;
  patientId?: string;
  visitReason?: string;
  selectedDate?: string;
  availableSlots?: DemoAppointmentSlot[];
  selectedSlot?: DemoAppointmentSlot;
  patientName?: string;
  patientPhone?: string;
  maskedPhone?: string;
  timePreferenceNote?: string;
  isLoadingSlots?: boolean;
  isReserving?: boolean;
  isUrgent?: boolean;
  urgencyNote?: string;
  isAlternativeAvailability?: boolean;
  requestedDate?: string;
  error?: string;
  duration?: number;
  endTime?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isEmergencyAlert?: boolean;
  bookingAction?: AppointmentBookingAction;
}

export interface AppointmentDemoState {
  patientType: PatientType;
  patientId?: string;
  preferredDate: string;
  preferredTime: string;
  reason: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
}

export interface DemoAppointmentSlot {
  id: string;
  date: string;
  time: string;
  status: SlotStatus;
  location: string;
  type?: SlotType;
  duration?: number;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  source?: 'automatic' | 'manual';
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  isExpired?: boolean;
  disabledAt?: string;
  disabledBy?: string;
  reEnabledAt?: string;
  reEnabledBy?: string;
  bookedAppointmentId?: string;
  parentSlotTime?: string;
}

export interface DemoAppointmentPreference {
  id?: string;
  patientType: PatientType;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  date: string;
  appointmentDate?: string;
  time: string;
  appointmentTime?: string;
  startTime?: string;
  duration?: number;
  durationMinutes?: number;
  endTime?: string;
  reason: string;
  reasonForVisit?: string;
  slotId?: string;
  type?: SlotType;
  appointmentType?: SlotType;
  isUrgent?: boolean;
  source?: 'automatic' | 'manual';
  createdAt: string;
  location: string;
  isDemo: true;
}

export interface ServiceDurationConfigItem {
  id: string;
  name: string;
  durationMinutes: number;
  category?: string;
  description?: string;
}

export interface ClinicScheduleConfig {
  id?: string;
  timezone: string;
  workingDays: string[];
  weekdayOpen: string;
  weekdayClose: string;
  weekdayOpeningTime?: string;
  weekdayClosingTime?: string;
  saturdayOpen: string;
  saturdayClose: string;
  saturdayOpeningTime?: string;
  saturdayClosingTime?: string;
  sundayOpen: boolean;
  sundayOpeningTime?: string;
  sundayClosingTime?: string;
  sundayOpenTime?: string;
  sundayCloseTime?: string;
  slotIntervalMinutes: number;
  availabilityWindowDays: number;
  urgentSlotsPerDay: number;
  urgentSlotTimes: string[];
  serviceDurations: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AvailabilityGenerationSummary {
  daysChecked: number;
  slotsCreated: number;
  existingPreserved: number;
  maintainedThrough: string;
  windowDays: number;
  timestamp: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  role: 'admin';
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminDashboardSummary {
  todayDate: string;
  todayFormatted: string;
  todayAppointments: {
    total: number;
    normal: number;
    urgent: number;
    newPatients: number;
    existingPatients: number;
    hasAppointments: boolean;
  };
  upcomingAppointments: {
    total: number;
    datesCount: number;
  };
  urgentAppointments: {
    total: number;
    today: number;
    upcoming: number;
  };
  newPatients: {
    total: number;
    today: number;
    upcoming: number;
  };
  existingPatients: {
    total: number;
    today: number;
    upcoming: number;
  };
  cancelledAppointments: {
    total: number;
  };
  urgentSlots: {
    available: number;
    booked: number;
    total: number;
    nextAvailableTime?: string;
    nextAvailableDate?: string;
  };
  availableSlots: {
    total: number;
    normal: number;
    urgent: number;
  };
  pastAppointments: {
    total: number;
  };
}

export type AppointmentFilterType =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'past'
  | 'cancelled'
  | 'urgent'
  | 'new'
  | 'existing';

export interface AdminAppointment {
  id: string;
  slotId?: string;
  patientName: string;
  patientType: PatientType;
  patientId?: string;
  phone: string;
  patientPhone?: string;
  reason: string;
  reasonForVisit?: string;
  date: string;
  appointmentDate?: string;
  time: string;
  appointmentTime?: string;
  startTime?: string;
  duration?: number;
  durationMinutes?: number;
  endTime?: string;
  appointmentType: 'normal' | 'urgent';
  type?: SlotType;
  isUrgent: boolean;
  status: 'Booked' | 'Cancelled' | string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  rescheduledAt?: string;
  rescheduledBy?: string;
  previousSlotId?: string;
  previousDate?: string;
  previousTime?: string;
  source?: 'automatic' | 'manual';
  isDemo?: boolean;
  isPast?: boolean;
}

export type NotificationType =
  | 'appointment_confirmation'
  | 'appointment_cancellation'
  | 'appointment_rescheduled'
  | 'appointment_reminder_24h'
  | 'appointment_reminder_2h';

export interface NotificationRecord {
  id?: string;
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  phone: string;
  channel: 'sms';
  type: NotificationType;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  message: string;
  scheduledFor?: string;
  createdAt: any;
  updatedAt?: any;
  cancelledAt?: any;
}

export type PatientFilterType =
  | 'all'
  | 'new'
  | 'existing'
  | 'has_upcoming'
  | 'no_upcoming';

export interface AdminPatientRecord {
  id: string;
  fullName: string;
  phone: string;
  patientType: PatientType;
  createdAt?: string;
  updatedAt?: string;
  upcomingAppointments: AdminAppointment[];
  pastAppointments: AdminAppointment[];
  cancelledAppointments: AdminAppointment[];
  totalAppointmentsCount: number;
  mostRecentOrUpcomingAppointment?: AdminAppointment;
}

export type HealthStatusLevel = 'Healthy' | 'Warning' | 'Unavailable';

export interface ComponentHealthItem {
  id: string;
  name: string;
  status: HealthStatusLevel;
  summary: string;
  details?: string;
  lastChecked?: string;
  metric?: string | number;
}

export interface SafeguardCheckItem {
  id: string;
  name: string;
  status: HealthStatusLevel;
  description: string;
  verified: boolean;
}

export interface DataIntegrityIssue {
  id: string;
  collection: string;
  recordId: string;
  issue: string;
  severity: 'warning' | 'error';
  suggestedAction?: string;
}

export interface SystemHealthReport {
  overallStatus: HealthStatusLevel;
  statusHeadline: string;
  statusMessage: string;
  timestamp: string;
  adminSession: {
    isAuthenticated: boolean;
    isAuthorizedAdmin: boolean;
    adminEmail?: string;
    authStatus: HealthStatusLevel;
    summary: string;
  };
  components: ComponentHealthItem[];
  schedulingHealth: {
    status: HealthStatusLevel;
    timezone: string;
    workingDays: string[];
    clinicHours: {
      weekday: string;
      saturday: string;
      sunday: string;
    };
    slotIntervalMinutes: number;
    availabilityWindowDays: number;
    serviceDurationsCount: number;
    notes: string[];
  };
  availabilityHealth: {
    status: HealthStatusLevel;
    totalSlots: number;
    availableSlots: number;
    pastSlotsCount: number;
    pastSlotsOfferedToPatients: boolean;
    duplicateSlotsCount: number;
    sundayAvailableSlotsCount: number;
    outOfHoursSlotsCount: number;
    malformedStatusCount: number;
    invalidTypeCount: number;
    notes: string[];
  };
  bookingSafeguards: SafeguardCheckItem[];
  notificationHealth: {
    status: HealthStatusLevel;
    pendingCount: number;
    scheduledReminderCount: number;
    cancelledReminderCount: number;
    failedCount: number;
    totalCount: number;
    smsGatewayNotice: string;
  };
  dataIntegrityIssues: DataIntegrityIssue[];
}

/**
 * Phase 11C: Business Configuration & Customization
 * Controls identity and presentation across the public receptionist and widget.
 */
export interface BusinessProfileConfig {
  businessName: string;
  receptionistName: string;
  logoUrl?: string;
  primaryAccentColor: string;
  welcomeMessage: string;
  phone: string;
  address: string;
  timezone: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_BUSINESS_CONFIG: BusinessProfileConfig = {
  businessName: 'Dental Care & Implants of Houston',
  receptionistName: 'AI Dental Receptionist',
  logoUrl: '',
  primaryAccentColor: '#2563eb',
  welcomeMessage: 'Hi! How can I help you today?',
  phone: '(281) 876-1188',
  address: '165 Greens Rd, Houston, TX 77060',
  timezone: 'America/Chicago',
};

/**
 * Phase 11D: Business Knowledge & FAQ Configuration
 * Allows Admins to manage customer-facing knowledge (Services, FAQs, Policies, Pricing, etc.)
 */
export interface BusinessKnowledgeServiceItem {
  id: string;
  name: string;
  description: string;
  durationMinutes?: number;
  active: boolean;
  category?: string;
  priceText?: string;
}

export type KnowledgeServiceItem = BusinessKnowledgeServiceItem;

export interface BusinessKnowledgeFAQItem {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  category?: string;
  keywords?: string[];
}

export type KnowledgeFAQItem = BusinessKnowledgeFAQItem;

export interface BusinessPoliciesConfig {
  cancellationPolicy?: string;
  appointmentPolicy?: string;
  arrivalPolicy?: string;
  newPatientInfo?: string;
  newPatientPolicy?: string;
  paymentPolicy?: string;
  otherPolicies?: string;
  generalPolicies?: string;
}

export interface BusinessKnowledgeConfig {
  services: BusinessKnowledgeServiceItem[];
  faqs: BusinessKnowledgeFAQItem[];
  policies: BusinessPoliciesConfig;
  pricingInfo?: string;
  pricing?: {
    pricingNotes?: string;
  };
  financingInfo?: string;
  financing?: {
    financingPartners?: string[];
    financingNotes?: string;
    insuranceAcceptedNotes?: string;
    outOfNetworkPolicy?: string;
  };
  insuranceInfo?: string;
  additionalInfo?: {
    languagesSpoken?: string[];
    parkingDirections?: string;
    doctorBios?: string;
    additionalNotes?: string;
    [key: string]: any;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_BUSINESS_KNOWLEDGE: BusinessKnowledgeConfig = {
  services: [
    {
      id: 'implants',
      name: 'Dental Implants',
      category: 'Restorative & Implants',
      description: 'Permanent, lifelike tooth replacement solutions designed to restore chewing strength, dental function, and natural aesthetics.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'implant-dentures',
      name: 'Implant-Supported Dentures',
      category: 'Restorative & Implants',
      description: 'Secure, non-slip denture alternatives anchored by durable dental implants for maximum stability and comfort.',
      durationMinutes: 90,
      active: true,
      priceText: '',
    },
    {
      id: 'full-mouth-implants',
      name: 'Full-Mouth Dental Implants',
      category: 'Restorative & Implants',
      description: 'Complete full-arch restorative implant therapy to reconstruct entire upper or lower arches of teeth with natural-looking prosthetic teeth.',
      durationMinutes: 90,
      active: true,
      priceText: '',
    },
    {
      id: 'invisalign',
      name: 'Invisalign® & Clear Aligners',
      category: 'Cosmetic & Ortho',
      description: 'Discreet, removable clear orthodontic aligners for teens and adults to straighten teeth without traditional metal brackets.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'cosmetic-dentistry',
      name: 'Cosmetic Dentistry',
      category: 'Cosmetic & Ortho',
      description: 'Tailored aesthetic dental enhancements to transform smiles with confidence, balance, and harmony.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'teeth-whitening',
      name: 'Teeth Whitening',
      category: 'Cosmetic & Ortho',
      description: 'Professional dental-grade whitening treatments designed to safely eliminate stains and significantly brighten your smile.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'crowns',
      name: 'Dental Crowns',
      category: 'Restorative & Implants',
      description: 'Custom-fitted, high-strength ceramic or porcelain caps crafted to protect and restore weakened or broken teeth.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'bridges',
      name: 'Dental Bridges',
      category: 'Restorative & Implants',
      description: 'Custom prosthetics designed to bridge the gap created by one or more missing teeth, anchored to adjacent teeth or implants.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'root-canals',
      name: 'Root Canals',
      category: 'Specialty & Urgent',
      description: 'Gentle endodontic therapy to remove infected pulp tissue, relieve pain, and preserve your natural tooth structure.',
      durationMinutes: 90,
      active: true,
      priceText: '',
    },
    {
      id: 'family-dentistry',
      name: 'Family Dentistry',
      category: 'General & Preventive',
      description: 'Comprehensive dental care for patients from teens through adults, offering gentle cleanings, exams, and routine care.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'preventive-care',
      name: 'Preventive Dental Care',
      category: 'General & Preventive',
      description: 'Routine oral examinations, professional dental hygiene cleanings, plaque removal, and proactive oral health screenings.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'general-dentistry',
      name: 'General Dentistry & Fillings',
      category: 'General & Preventive',
      description: 'Complete dental diagnostics, tooth-colored composite fillings, and ongoing oral wellness maintenance for everyday oral health.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'sedation-dentistry',
      name: 'Sedation Dentistry',
      category: 'Specialty & Urgent',
      description: 'Relaxation and comfort options for patients who experience dental anxiety or require extensive treatment procedures.',
      durationMinutes: 60,
      active: true,
      priceText: '',
    },
    {
      id: 'emergency-care',
      name: 'Emergency Dental Care',
      category: 'Specialty & Urgent',
      description: 'Prompt dental attention for severe toothaches, broken restorations, sudden dental trauma, or acute dental discomfort.',
      durationMinutes: 30,
      active: true,
      priceText: '',
    },
  ],
  faqs: [
    {
      id: 'faq-implants',
      question: 'What are dental implants and how do they work?',
      answer: 'Dental implants are medical-grade titanium posts surgically positioned into the jawbone beneath your gums. Once in place, they bond with your natural bone to provide stable support for artificial replacement teeth, bridges, or full-arch dentures.',
      active: true,
      category: 'Restorative & Implants',
    },
    {
      id: 'faq-invisalign',
      question: 'How does Invisalign clear aligner treatment work?',
      answer: 'Invisalign uses a sequence of custom-crafted, clear, removable aligners to gradually shift your teeth into proper alignment without metal brackets or wires. Aligners are typically worn 20–22 hours per day and removed for eating and brushing.',
      active: true,
      category: 'Cosmetic & Ortho',
    },
    {
      id: 'faq-root-canal',
      question: 'Is a root canal painful?',
      answer: 'Modern root canal therapy is performed with gentle local anesthesia and is comparable to getting a routine dental filling. The treatment eliminates infection inside the tooth, relieving pain rather than causing it.',
      active: true,
      category: 'Specialty & Urgent',
    },
    {
      id: 'faq-saturday',
      question: 'Are you open on Saturdays?',
      answer: 'Yes! Our Greenspoint office is open on Saturdays from 8:00 AM to 5:00 PM for scheduled appointments and dental evaluations.',
      active: true,
      category: 'Hours & Appointments',
    },
    {
      id: 'faq-insurance',
      question: 'Do you accept dental insurance?',
      answer: 'We accept most major PPO dental insurance plans. Because coverage, deductibles, and benefits vary significantly by plan, please call our front desk directly at (281) 946-2569 so our billing coordinators can verify your specific network benefits.',
      active: true,
      category: 'Financing & Insurance',
    },
    {
      id: 'faq-financing',
      question: 'Do you offer payment plans or financing options?',
      answer: 'Yes, we provide flexible financing options through trusted healthcare lenders including Cherry, CareCredit, Proceed Finance, Sunbit, Alphaeon, and Basis. Monthly installment plans are available subject to lender approval.',
      active: true,
      category: 'Financing & Insurance',
    },
    {
      id: 'faq-new-patients',
      question: 'Are you currently accepting new patients?',
      answer: 'Yes, we are delighted to welcome new patients of all ages! You can schedule an appointment directly through our online receptionist or call our new patient line at (281) 946-2569.',
      active: true,
      category: 'General & Appointments',
    },
    {
      id: 'faq-emergency',
      question: 'What should I do if I have a dental emergency?',
      answer: 'If you have an acute toothache, knocked-out tooth, or severe oral pain, we prioritize emergency dental appointments. If you are experiencing difficulty breathing or uncontrollable bleeding, please call 911 or visit the nearest emergency room immediately.',
      active: true,
      category: 'Specialty & Urgent',
    },
  ],
  policies: {
    cancellationPolicy: 'We request at least 24 hours advance notice if you need to cancel or reschedule your appointment so that we may offer the time to other patients in need of dental care.',
    appointmentPolicy: 'Please arrive 10 to 15 minutes prior to your scheduled appointment time to complete any necessary check-in or health history updates.',
    arrivalPolicy: 'Please arrive 10 to 15 minutes prior to your scheduled appointment time to complete any necessary check-in or health history updates.',
    newPatientInfo: 'New patients should bring a valid government-issued photo ID, their dental insurance card (if applicable), and a list of any current medications. Digital intake can be completed upon arrival.',
    newPatientPolicy: 'New patients should bring a valid government-issued photo ID, their dental insurance card (if applicable), and a list of any current medications. Digital intake can be completed upon arrival.',
    paymentPolicy: 'Payment or applicable copay is expected at the time services are rendered. We accept cash, major credit and debit cards, and approved third-party financing arrangements.',
    otherPolicies: 'Children and teens under the age of 18 must be accompanied by a parent or legal guardian for their dental appointments.',
    generalPolicies: 'Children and teens under the age of 18 must be accompanied by a parent or legal guardian for their dental appointments.',
  },
  pricing: {
    pricingNotes: 'Because dental treatments are personalized to each patient’s clinical evaluation and oral health needs, exact pricing is determined during your examination. We provide transparent estimates before any treatment begins.',
  },
  financing: {
    financingPartners: ['Cherry', 'CareCredit', 'Proceed Finance', 'Sunbit', 'Alphaeon', 'Basis'],
    financingNotes: 'We work with multiple flexible financing partners to make dental care affordable with low monthly payments and 0% promotional APR options.',
    insuranceAcceptedNotes: 'We accept most major PPO dental plans and Medicaid for patients under 21. Please call our office at (281) 946-2569 with your insurance details to verify benefits.',
    outOfNetworkPolicy: 'For out-of-network plans, we submit courtesy claims on your behalf to help maximize your benefits.',
  },
  pricingInfo: 'Because dental treatments are personalized to each patient’s clinical evaluation and oral health needs, exact pricing is determined during your examination. We provide transparent estimates before any treatment begins.',
  financingInfo: 'We work with multiple flexible financing partners including Cherry, CareCredit, Proceed Finance, Sunbit, Alphaeon, and Basis to make dental care affordable with low monthly payments.',
  insuranceInfo: 'We accept major PPO dental plans. Please call our office at (281) 946-2569 with your insurance details so our team can verify your benefits prior to your appointment.',
  additionalInfo: {
    languagesSpoken: ['English', 'Spanish'],
    parkingDirections: 'Free on-site parking is available for all visitors directly in front of the clinic entrance at 165 Greens Rd in Houston, TX.',
    doctorBios: 'Experienced team of dental professionals providing general, cosmetic, and implant dentistry.',
    additionalNotes: 'Our modern clinic is located near Greenspoint Mall. Sedation dentistry is available for patient comfort.',
  },
};


import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  RotateCcw,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Phone,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Check,
  Copy,
  ChevronRight,
  User,
  ExternalLink,
  Bot,
  CalendarDays,
  Settings2,
  XCircle,
  Edit3,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  Play,
  X,
  Globe,
} from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useVoiceResponse } from '../hooks/useVoiceResponse';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CLINIC_INFO, SUGGESTED_QUESTIONS } from '../data/clinicData';
import { ChatMessage, DemoAppointmentSlot, PatientType } from '../types';
import {
  sanitizePlainText,
  getLocalConciergeAnswer,
  isCasualGreetingOrClosing,
  isUnclearClarificationNeeded,
  isPricingInquiry,
  isServiceAndPricingMultiIntent,
  getPricingResponse,
  isInsuranceInquiry,
  getInsuranceResponse,
  isEducationalDentalQuery,
  isSymptomInquiry,
  getHoustonOperatingStatus,
  getMultiIntentAnswer,
} from '../utils/conciergeEngine';
import {
  getDemoAppointmentSlots,
  getDurationAwareAvailableSlots,
  reserveDemoSlot,
  findEarliestUrgentSlot,
  findEarliestNormalSlot,
  findAlternativeAppointmentSlots,
  findNextAvailableSlots,
  formatAlternativeSlotsMessage,
  isSlotOrAppointmentExpired,
} from '../services/demoSlotsService';
import { getHoustonCurrentDateTime } from '../utils/clinicTime';
import { resolveServiceDuration, computeEndTime } from '../services/scheduleConfigService';
import { ensureRollingAvailability } from '../services/availabilityGeneratorService';
import {
  createAppointmentConfirmationNotification,
  createAppointmentReminderNotifications,
} from '../services/notificationsService';
import {
  lookupDemoPatientByPhone,
  saveOrUpdatePatientProfile,
} from '../services/demoPatientsService';
import {
  SupportedCountry,
  formatDisplayPhone,
  maskPhoneNumber,
  extractSpokenPhoneNumber,
} from '../utils/phoneUtils';
import {
  parseTimeToMinutes,
  formatDatePretty,
  isSundayDate,
  isCancellationIntent,
  isAffirmativeIntent,
  isTryAnotherNumberIntent,
  isClearConfirmationIntent,
  isAmbiguousConfirmation,
  isNegativeOrCancellation,
  isChangeRequest,
  isUrgentDentalComplaint,
  isLifeThreateningEmergency,
  LIFE_THREATENING_EMERGENCY_GUIDANCE,
  extractPatientType,
  extractVisitReason,
  extractDatePreference,
  extractTimePreference,
  validateUSPhoneNumber,
  validatePatientName,
  validateStrictPhone,
  formatUSPhone,
  extractContactDetails,
  filterSlotsByPreference,
  isNextAvailableQuery,
  detectDetailCorrection,
  formatConversationalSlotOffer,
  isHoursOrOpenQuery,
} from '../utils/bookingConversationEngine';
import {
  classifyIntent,
  routeInformationalResponse,
  IntentCategory,
  ClassifiedIntentResult,
} from '../utils/intentRouter';
import {
  BusinessBrandingConfig,
  DEFAULT_BUSINESS_BRANDING,
} from '../config/businessBranding';
import {
  BusinessProfileConfig,
  DEFAULT_BUSINESS_CONFIG,
  BusinessKnowledgeConfig,
  DEFAULT_BUSINESS_KNOWLEDGE,
} from '../types';
import { subscribeToBusinessConfig } from '../services/businessConfigService';
import { subscribeToBusinessKnowledge } from '../services/businessKnowledgeService';

interface ChatReceptionistProps {
  onOpenAdminDashboard?: () => void;
  onOpenBookingModal?: () => void;
  isEmbed?: boolean;
  isWidgetPopup?: boolean;
  onCloseWidget?: () => void;
  branding?: BusinessBrandingConfig | BusinessProfileConfig;
}

const COMMON_VISIT_REASONS = [
  'Routine Checkup & Cleaning',
  'Dental Implants Consultation',
  'Invisalign® / Clear Aligners',
  'Tooth Pain / Urgent Discomfort',
  'Cosmetic Dentistry / Whitening',
  'Dental Crown or Bridge',
];

const getDynamicPresetDates = () => {
  const houstonNow = getHoustonCurrentDateTime();
  const [refY, refM, refD] = houstonNow.dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const results: { label: string; value: string }[] = [];
  let added = 0;
  for (let offset = 0; offset < 14 && added < 4; offset++) {
    const d = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000);
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const dStr = `${yr}-${mo}-${da}`;
    if (d.getUTCDay() === 0) continue; // skip Sunday

    const dayName = dayNames[d.getUTCDay()];
    const moName = monthNames[d.getUTCMonth()];
    const dayNum = d.getUTCDate();

    let label = `${dayName}, ${moName} ${dayNum}`;
    if (offset === 0) {
      label = `Today (${dayName}, ${moName} ${dayNum})`;
    } else if (offset === 1) {
      label = `Tomorrow (${dayName}, ${moName} ${dayNum})`;
    }

    results.push({ label, value: dStr });
    added++;
  }
  return results;
};

export const ChatReceptionist: React.FC<ChatReceptionistProps> = ({
  onOpenAdminDashboard,
  onOpenBookingModal,
  isEmbed = false,
  isWidgetPopup = false,
  onCloseWidget,
  branding = DEFAULT_BUSINESS_BRANDING,
}) => {
  // Dynamic business branding & profile configuration (Phase 11C)
  const [activeConfig, setActiveConfig] = useState<BusinessProfileConfig>(() => ({
    businessName: branding?.businessName || DEFAULT_BUSINESS_CONFIG.businessName,
    receptionistName: branding?.receptionistName || DEFAULT_BUSINESS_CONFIG.receptionistName,
    logoUrl: branding?.logoUrl || '',
    primaryAccentColor:
      (branding as any)?.primaryAccentColor ||
      (branding as any)?.primaryAccent ||
      DEFAULT_BUSINESS_CONFIG.primaryAccentColor,
    welcomeMessage: branding?.welcomeMessage || DEFAULT_BUSINESS_CONFIG.welcomeMessage,
    phone: branding?.phone || DEFAULT_BUSINESS_CONFIG.phone,
    address: branding?.address || DEFAULT_BUSINESS_CONFIG.address,
    timezone: (branding as any)?.timezone || DEFAULT_BUSINESS_CONFIG.timezone,
  }));

  // Synchronize in real-time with Firestore settings/business
  useEffect(() => {
    const unsubscribe = subscribeToBusinessConfig((config) => {
      setActiveConfig(config);
    });
    return () => unsubscribe();
  }, []);

  // Synchronize in real-time with Firestore settings/knowledge (Phase 11D)
  const [knowledgeConfig, setKnowledgeConfig] = useState<BusinessKnowledgeConfig>(DEFAULT_BUSINESS_KNOWLEDGE);

  useEffect(() => {
    const unsubscribe = subscribeToBusinessKnowledge((knowledge) => {
      setKnowledgeConfig(knowledge);
    });
    return () => unsubscribe();
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        activeConfig.welcomeMessage ||
        branding?.welcomeMessage ||
        "Hi! I'm here to help with appointments, services, clinic information, and general dental questions.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Update initial welcome message dynamically if user hasn't typed yet
  useEffect(() => {
    if (activeConfig.welcomeMessage) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id.startsWith('welcome')) {
          return [
            {
              ...prev[0],
              content: activeConfig.welcomeMessage,
            },
          ];
        }
        return prev;
      });
    }
  }, [activeConfig.welcomeMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // References for voice auto-submit and phone input autofocus
  const handleSendMessageRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const existingPhoneInputRef = useRef<HTMLInputElement | null>(null);

  // Voice Input (Phase 12A)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const {
    isSupported: isVoiceSupported,
    isListening,
    transcript: voiceTranscript,
    interimTranscript: voiceInterim,
    error: voiceError,
    permissionDenied: voicePermissionDenied,
    startListening,
    stopListening,
    clearError: clearVoiceError,
    simulateVoiceText,
    simulatePermissionDenied,
    simulateRecognitionFailure,
  } = useVoiceInput({
    onTranscriptChange: (text) => {
      setInput(text);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    onListeningEnd: (finalText) => {
      const clean = finalText?.trim();
      if (clean) {
        setInput('');
        setVoiceNotice(null);
        handleSendMessageRef.current?.(clean);
      } else {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    },
  });

  const handleToggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      clearVoiceError();
      setVoiceNotice(null);
      startListening();
    }
  };

  // Voice Response Output (Phase 12B)
  const {
    isSupported: isVoiceResponseSupported,
    isVoiceResponseEnabled,
    isSpeaking,
    currentMessageId: currentlySpeakingMessageId,
    error: voiceResponseError,
    toggleVoiceResponse,
    speak: speakResponse,
    stopSpeaking,
    clearError: clearVoiceResponseError,
  } = useVoiceResponse();

  const lastSpokenMsgIdRef = useRef<string | null>(null);
  const lastSpokenContentRef = useRef<string | null>(null);

  // Auto-speak newly received assistant responses when voice mode is enabled
  useEffect(() => {
    if (!isVoiceResponseEnabled) return;
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    // Do not speak intermediate slot loading states
    if (lastMsg.bookingAction?.isLoadingSlots) return;
    if (lastMsg.content.includes('Checking live Firestore availability...')) return;

    // Don't re-speak if already spoken
    if (
      lastSpokenMsgIdRef.current === lastMsg.id &&
      lastSpokenContentRef.current === lastMsg.content
    ) {
      return;
    }

    lastSpokenMsgIdRef.current = lastMsg.id;
    lastSpokenContentRef.current = lastMsg.content;

    speakResponse(lastMsg.content, lastMsg.id);
  }, [messages, isVoiceResponseEnabled, speakResponse]);

  const handleToggleVoiceResponse = () => {
    const willBeEnabled = !isVoiceResponseEnabled;
    toggleVoiceResponse();
    if (willBeEnabled) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        speakResponse(lastMsg.content, lastMsg.id);
      }
    }
  };

  // Active in-conversation booking state machine
  const [bookingState, setBookingState] = useState<{
    inProgress: boolean;
    step:
      | 'idle'
      | 'ask_patient_type'
      | 'ask_existing_phone'
      | 'ask_phone_country'
      | 'patient_lookup_failed'
      | 'ask_visit_reason'
      | 'ask_date'
      | 'show_slots'
      | 'ask_contact'
      | 'review_confirmation'
      | 'change_details_options'
      | 'confirmed';
    patientType?: PatientType;
    patientId?: string;
    visitReason?: string;
    selectedDate?: string;
    selectedSlot?: DemoAppointmentSlot;
    timePreference?: ReturnType<typeof extractTimePreference>;
    timePreferenceNote?: string;
    contactName?: string;
    contactPhone?: string;
    maskedPhone?: string;
    isUrgent?: boolean;
    slots: DemoAppointmentSlot[];
    isLoadingSlots: boolean;
    isReservingSlot: boolean;
    slotError?: string | null;
    activeMessageId?: string;
  }>({
    inProgress: false,
    step: 'idle',
    slots: [],
    isLoadingSlots: false,
    isReservingSlot: false,
    isUrgent: false,
  });

  // Local contact input fields in chat bubble
  const [inlineContactName, setInlineContactName] = useState('');
  const [inlineContactPhone, setInlineContactPhone] = useState('');
  const [inlineContactError, setInlineContactError] = useState<string | null>(null);

  // Phone country selection state (default US, auto-detects India +91)
  const [phoneCountry, setPhoneCountry] = useState<SupportedCountry>('US');

  // Existing patient phone lookup inline state
  const [inlineExistingPhone, setInlineExistingPhone] = useState('');
  const [inlineExistingPhoneError, setInlineExistingPhoneError] = useState<string | null>(null);
  const [isLookingUpPatient, setIsLookingUpPatient] = useState(false);

  // Track confirmed appointment in current session for cancellations and changes
  const [lastConfirmedAppointment, setLastConfirmedAppointment] = useState<{
    slot: DemoAppointmentSlot;
    patientName: string;
    patientPhone: string;
    visitReason: string;
    patientType: PatientType;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, bookingState.slots, bookingState.isLoadingSlots, bookingState.step]);

  // Synchronize inline inputs if bookingState has contact info
  useEffect(() => {
    if (bookingState.contactName && !inlineContactName) {
      setInlineContactName(bookingState.contactName);
    }
    if (bookingState.contactPhone && !inlineContactPhone) {
      setInlineContactPhone(bookingState.contactPhone);
    }
  }, [bookingState.contactName, bookingState.contactPhone]);

  // Maintain rolling future availability in background on startup (throttled)
  useEffect(() => {
    ensureRollingAvailability().catch((err) => {
      console.warn('Background availability check:', err);
    });
  }, []);

  // Handle slot taken conflict before confirmation (Section 5)
  const handleSlotJustTaken = async (
    slot: DemoAppointmentSlot,
    preserved: {
      patientName: string;
      patientPhone: string;
      isUrgent: boolean;
      visitReason: string;
      patientType: PatientType;
    }
  ) => {
    const { patientName, patientPhone, isUrgent, visitReason, patientType } = preserved;
    const botMsgId = 'bot-' + Date.now();

    // 1. DO NOT create appointment. Show required message:
    // “Sorry, that appointment was just taken.
    //
    // Let me check the next available option for you.”
    const conflictMsg: ChatMessage = {
      id: botMsgId,
      role: 'assistant',
      content: `Sorry, that appointment was just taken.\n\nLet me check the next available option for you.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'show_slots',
        patientType,
        patientId: bookingState.patientId,
        visitReason,
        selectedDate: slot.date,
        patientName,
        patientPhone,
        maskedPhone: formatUSPhone(patientPhone),
        isUrgent,
        isLoadingSlots: true,
      },
    };

    setMessages((prev) => [...prev, conflictMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'show_slots',
      selectedSlot: undefined,
      isReservingSlot: false,
      isLoadingSlots: true,
      patientType,
      patientId: bookingState.patientId,
      contactName: patientName,
      contactPhone: patientPhone,
      maskedPhone: formatUSPhone(patientPhone),
      visitReason,
      isUrgent,
    }));

    // 2. Use existing alternative-availability logic
    try {
      const altResult = await findAlternativeAppointmentSlots(slot.date, { isUrgent });

      if (altResult.hasAlternatives) {
        const altReply = formatAlternativeSlotsMessage(slot.date, altResult);
        const nextDate = altResult.dayGroups[0]?.date || slot.date;

        setBookingState((prev) => ({
          ...prev,
          slots: altResult.allSlots,
          selectedDate: nextDate,
          isLoadingSlots: false,
        }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  content: `That time was just taken. Let me check the next available options.\n\n${altReply}`,
                  bookingAction: {
                    step: 'show_slots',
                    patientType,
                    patientId: bookingState.patientId,
                    visitReason,
                    selectedDate: nextDate,
                    availableSlots: altResult.allSlots,
                    isLoadingSlots: false,
                    patientName,
                    patientPhone,
                    maskedPhone: formatUSPhone(patientPhone),
                    isUrgent,
                    isAlternativeAvailability: true,
                    requestedDate: slot.date,
                  },
                }
              : m
          )
        );
      } else {
        const nextResult = await findNextAvailableSlots({ isUrgent });
        if (nextResult.hasSlots) {
          const earliest = nextResult.slots[0];
          const reply = `That time was just taken. Let me check the next available options.\n\nOur next available appointment is on ${formatDatePretty(earliest.date)} at ${earliest.time}. Here are the upcoming open times:`;
          setBookingState((prev) => ({
            ...prev,
            slots: nextResult.slots,
            selectedDate: earliest.date,
            isLoadingSlots: false,
          }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    content: reply,
                    bookingAction: {
                      step: 'show_slots',
                      patientType,
                      patientId: bookingState.patientId,
                      visitReason,
                      selectedDate: earliest.date,
                      availableSlots: nextResult.slots,
                      isLoadingSlots: false,
                      patientName,
                      patientPhone,
                      maskedPhone: formatUSPhone(patientPhone),
                      isUrgent,
                      isAlternativeAvailability: true,
                    },
                  }
                : m
            )
          );
        } else {
          setBookingState((prev) => ({
            ...prev,
            step: 'ask_date',
            slots: [],
            isLoadingSlots: false,
          }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    content: `That time was just taken. Let me check the next available options. There are no other slots open on this date; please select another date:`,
                    bookingAction: {
                      step: 'ask_date',
                      patientType,
                      patientId: bookingState.patientId,
                      visitReason,
                      patientName,
                      patientPhone,
                      maskedPhone: formatUSPhone(patientPhone),
                      isUrgent,
                    },
                  }
                : m
            )
          );
        }
      }
    } catch (err) {
      console.error('Error finding alternative slots after slot taken:', err);
      setBookingState((prev) => ({ ...prev, isLoadingSlots: false }));
    }
  };

  // Execute actual Firestore atomic reservation
  const executeReservation = async (slot: DemoAppointmentSlot) => {
    if (!slot) return;

    setBookingState((prev) => ({ ...prev, isReservingSlot: true }));

    const patientName = bookingState.contactName || 'Guest Patient';
    const rawPhone = bookingState.contactPhone || '';
    const phoneVal = validateStrictPhone(rawPhone, phoneCountry, true);
    const patientPhone = phoneVal.isValid && phoneVal.e164 ? phoneVal.e164 : rawPhone;
    const isUrgent = slot.type === 'urgent' || !!bookingState.isUrgent;
    const visitReason = bookingState.visitReason || (isUrgent ? 'Tooth Pain / Urgent Discomfort' : 'Routine Checkup & Cleaning');
    const patientType = bookingState.patientType || 'new';

    try {
      // 1. Re-check the selected Firestore slot directly before reserving (Section 4)
      try {
        const slotDocRef = doc(db, 'demo_appointment_slots', slot.id);
        const slotDocSnap = await getDoc(slotDocRef);
        if (
          !slotDocSnap.exists() ||
          slotDocSnap.data()?.status !== 'available' ||
          isSlotOrAppointmentExpired(slot.date, slot.time)
        ) {
          await handleSlotJustTaken(slot, { patientName, patientPhone, isUrgent, visitReason, patientType });
          return;
        }
      } catch (checkErr) {
        console.warn('Slot pre-check exception, falling back to transaction check:', checkErr);
      }

      // 2. Perform atomic Firestore transaction / double-booking protection (Section 4)
      const duration = resolveServiceDuration(visitReason);
      const endTime = computeEndTime(slot.time, duration);

      const result = await reserveDemoSlot({
        slotId: slot.id,
        patientType,
        patientId: bookingState.patientId,
        reason: visitReason,
        reasonForVisit: visitReason,
        date: slot.date,
        appointmentDate: slot.date,
        time: slot.time,
        appointmentTime: slot.time,
        patientName,
        patientPhone,
        type: slot.type || (isUrgent ? 'urgent' : 'normal'),
        appointmentType: slot.type || (isUrgent ? 'urgent' : 'normal'),
        isUrgent,
        duration,
        durationMinutes: duration,
        endTime,
      });

      if (result.success) {
        // 1. Create or update patient profile using normalized E.164 phone
        try {
          await saveOrUpdatePatientProfile(patientName, patientPhone, patientType, phoneCountry);
        } catch (patErr) {
          console.warn('[PatientProfile] Non-fatal patient profile save error:', patErr);
        }

        // Sequence Rule (Phase 1 Notifications):
        // 1. Confirm appointment transaction successfully (completed above).
        // 2. After successful booking, create notification record.
        const appointmentId = result.appointmentId || result.slot?.id || slot.id;
        try {
          await createAppointmentConfirmationNotification({
            appointmentId,
            patientId: bookingState.patientId || null,
            patientName,
            phone: patientPhone,
            date: slot.date,
            time: slot.time,
          });

          await createAppointmentReminderNotifications({
            appointmentId,
            patientId: bookingState.patientId || null,
            patientName,
            phone: patientPhone,
            date: slot.date,
            time: slot.time,
          });
        } catch (notifErr) {
          // 3 & 4. If notification record creation fails, keep appointment confirmed.
          // Log notification error appropriately. Never roll back the appointment.
          console.error('[Notifications] Non-fatal notification creation error:', notifErr);
        }

        const confirmMsgId = 'bot-' + Date.now();
        const formattedDate = formatDatePretty(slot.date);
        const patientTypeLabel = patientType === 'existing' ? 'Existing Patient' : 'New Patient';
        const appointmentTypeLabel = isUrgent ? 'Urgent' : 'Routine';
        const timeDisplay = duration > 30 ? `${slot.time} - ${endTime} (${duration} mins)` : slot.time;

        const confirmContent = `Your appointment is confirmed!\n\n${formattedDate}\n${timeDisplay}\n\nPatient: ${patientName}\nPatient Type: ${patientTypeLabel}\nReason: ${visitReason}\nAppointment Type: ${appointmentTypeLabel}\nLocation: Greenspoint (${CLINIC_INFO.address})\n\nWe look forward to seeing you.\n\nFor questions, please contact the clinic:\nNew patients: ${CLINIC_INFO.phoneNewPatients}\nAll other callers: ${CLINIC_INFO.phoneOtherCallers}\n\nThis is an AIWebTeck concept demo and is not connected to the clinic's real scheduling system.`;

        const confirmMsg: ChatMessage = {
          id: confirmMsgId,
          role: 'assistant',
          content: confirmContent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'confirmed',
            patientType,
            patientId: bookingState.patientId,
            visitReason,
            selectedDate: slot.date,
            selectedSlot: slot,
            patientName,
            patientPhone,
            isUrgent,
          },
        };

        setMessages((prev) => [...prev, confirmMsg]);
        setLastConfirmedAppointment({
          slot,
          patientName,
          patientPhone,
          visitReason,
          patientType,
        });
        setBookingState({
          inProgress: false,
          step: 'confirmed',
          slots: [],
          isLoadingSlots: false,
          isReservingSlot: false,
          selectedSlot: slot,
          isUrgent,
        });
      } else {
        // Slot was already taken! Trigger alternative availability (Section 5)
        await handleSlotJustTaken(slot, { patientName, patientPhone, isUrgent, visitReason, patientType });
      }
    } catch (err) {
      console.error('Reservation error:', err);
      await handleSlotJustTaken(slot, { patientName, patientPhone, isUrgent, visitReason, patientType });
    }
  };

  // Helper to query and display urgent priority appointments
  const queryAndDisplayUrgentSlot = async (
    preferredDateStr?: string,
    explicitPatientType?: PatientType,
    explicitReason?: string
  ) => {
    const patientType = explicitPatientType || bookingState.patientType;
    const visitReason = explicitReason || bookingState.visitReason || 'Tooth Pain / Urgent Discomfort';
    const effectivePreferredDate = preferredDateStr || getHoustonCurrentDateTime().dateStr;

    const nextBotMsgId = 'bot-' + Date.now();
    const checkingMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: "Since you're experiencing tooth pain or urgent discomfort, I'll check the earliest urgent appointment available for you...",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'show_slots',
        patientType,
        visitReason,
        isLoadingSlots: true,
        isUrgent: true,
      },
    };

    setMessages((prev) => [...prev, checkingMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'show_slots',
      patientType,
      visitReason,
      isUrgent: true,
      isLoadingSlots: true,
      activeMessageId: nextBotMsgId,
    }));

    try {
      // 1. Search for earliest urgent slot (today first, then next business days)
      const urgentResult = await findEarliestUrgentSlot(effectivePreferredDate);

      if (urgentResult?.slot) {
        const slot = urgentResult.slot;
        const replyText = `I'm so sorry to hear your tooth is hurting. The earliest urgent appointment available is ${formatDatePretty(
          slot.date
        )} at ${slot.time}. Would you like me to book this for you?`;

        setBookingState((prev) => ({
          ...prev,
          slots: [slot],
          selectedSlot: slot,
          selectedDate: slot.date,
          isLoadingSlots: false,
          isUrgent: true,
        }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === nextBotMsgId
              ? {
                  ...m,
                  content: replyText,
                  bookingAction: {
                    step: 'show_slots',
                    patientType,
                    visitReason,
                    selectedDate: slot.date,
                    selectedSlot: slot,
                    availableSlots: [slot],
                    isUrgent: true,
                    isLoadingSlots: false,
                  },
                }
              : m
          )
        );
      } else {
        // 2. If NO urgent slots are available, clearly inform patient and offer earliest normal appointment
        const normalSlot = await findEarliestNormalSlot(effectivePreferredDate);
        if (normalSlot) {
          const replyText = `I don't currently have a reserved urgent care slot available today. The earliest appointment I can offer is ${formatDatePretty(
            normalSlot.date
          )} at ${normalSlot.time}. Would you like me to check that for you?`;

          setBookingState((prev) => ({
            ...prev,
            slots: [normalSlot],
            selectedSlot: normalSlot,
            selectedDate: normalSlot.date,
            isLoadingSlots: false,
            isUrgent: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'show_slots',
                      patientType,
                      visitReason,
                      selectedDate: normalSlot.date,
                      selectedSlot: normalSlot,
                      availableSlots: [normalSlot],
                      isLoadingSlots: false,
                    },
                  }
                : m
            )
          );
        } else {
          const replyText = `I don't currently have a reserved urgent care slot available today, and our schedule is fully booked for this date. Please call our clinic directly at ${CLINIC_INFO.phoneNewPatients} for immediate triage assistance.`;

          setBookingState((prev) => ({
            ...prev,
            slots: [],
            isLoadingSlots: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'show_slots',
                      patientType,
                      visitReason,
                      availableSlots: [],
                      isLoadingSlots: false,
                    },
                  }
                : m
            )
          );
        }
      }
    } catch (err) {
      console.error('Error finding urgent slot:', err);
      setBookingState((prev) => ({ ...prev, isLoadingSlots: false }));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === nextBotMsgId
            ? {
                ...m,
                content:
                  "I'm having trouble checking availability right now. Please try again in a moment.",
                bookingAction: {
                  step: 'ask_date',
                  patientType,
                  visitReason,
                  error: "I'm having trouble checking availability right now. Please try again in a moment.",
                },
              }
            : m
        )
      );
    }
  };

  // Helper to query and show Firestore slots with automatic alternative availability
  const queryAndDisplaySlots = async (
    dateStr: string,
    timePref?: ReturnType<typeof extractTimePreference>,
    explicitPatientType?: PatientType,
    explicitVisitReason?: string
  ) => {
    const patientType = explicitPatientType || bookingState.patientType || 'new';
    const visitReason = explicitVisitReason || bookingState.visitReason || 'Routine Checkup & Cleaning';

    // 1. Sunday check: clinic is closed on Sundays! Automatically search nearby business days.
    if (isSundayDate(dateStr)) {
      const nextBotMsgId = 'bot-' + Date.now();
      const loadingMsg: ChatMessage = {
        id: nextBotMsgId,
        role: 'assistant',
        content: `Our clinic is closed on Sundays. Checking live Firestore availability for nearby business days...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'show_slots',
          patientType,
          visitReason,
          selectedDate: dateStr,
          isLoadingSlots: true,
          isUrgent: bookingState.isUrgent,
        },
      };

      setMessages((prev) => [...prev, loadingMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'show_slots',
        patientType,
        visitReason,
        selectedDate: dateStr,
        isLoadingSlots: true,
        activeMessageId: nextBotMsgId,
      }));

      try {
        const requiredDuration = resolveServiceDuration(visitReason);
        const altResult = await findAlternativeAppointmentSlots(dateStr, {
          isUrgent: bookingState.isUrgent,
          timePref,
          requiredDurationMinutes: requiredDuration,
          serviceReason: visitReason,
        });

        const replyText = formatAlternativeSlotsMessage(dateStr, altResult, timePref);

        if (altResult.hasAlternatives) {
          setBookingState((prev) => ({
            ...prev,
            slots: altResult.allSlots,
            selectedDate: altResult.dayGroups[0]?.date || dateStr,
            isLoadingSlots: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'show_slots',
                      patientType,
                      visitReason,
                      selectedDate: altResult.dayGroups[0]?.date || dateStr,
                      availableSlots: altResult.allSlots,
                      isLoadingSlots: false,
                      isUrgent: bookingState.isUrgent,
                      isAlternativeAvailability: true,
                      requestedDate: dateStr,
                    },
                  }
                : m
            )
          );
        } else {
          setBookingState((prev) => ({
            ...prev,
            step: 'ask_date',
            slots: [],
            isLoadingSlots: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'ask_date',
                      patientType,
                      visitReason,
                    },
                  }
                : m
            )
          );
        }
      } catch (err) {
        console.error('Error finding alternative slots for Sunday:', err);
        setBookingState((prev) => ({ ...prev, isLoadingSlots: false }));
      }
      return;
    }

    // 2. Normal / non-Sunday date check
    const nextBotMsgId = 'bot-' + Date.now();
    const loadingMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: `Checking live Firestore appointment availability for ${formatDatePretty(dateStr)}...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'show_slots',
        patientType,
        visitReason,
        selectedDate: dateStr,
        isLoadingSlots: true,
        isUrgent: bookingState.isUrgent,
      },
    };

    setMessages((prev) => [...prev, loadingMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'show_slots',
      patientType,
      visitReason,
      selectedDate: dateStr,
      timePreference: timePref || prev.timePreference,
      isLoadingSlots: true,
      activeMessageId: nextBotMsgId,
    }));

    try {
      // Normal bookings must NOT use urgent slots!
      const effectiveReason = visitReason || bookingState.visitReason || 'Routine Checkup & Cleaning';
      const requiredDuration = resolveServiceDuration(effectiveReason);
      const durationSlots = await getDurationAwareAvailableSlots(dateStr, requiredDuration, bookingState.isUrgent);
      const slots = durationSlots.map((d) => d.slot);
      const { availableSlots, exactMatch, filteredAvailable } = filterSlotsByPreference(slots, timePref);

      if (availableSlots.length > 0) {
        let replyText = '';
        if (exactMatch && exactMatch.status === 'available') {
          replyText = `Yes! ${exactMatch.time} is available on ${formatDatePretty(
            dateStr
          )} for your ${effectiveReason}. Would you like me to reserve this time for you?`;
        } else if (timePref?.targetTime && (!exactMatch || exactMatch.status !== 'available')) {
          replyText = formatConversationalSlotOffer({
            dateStr,
            requestedTimeLabel: timePref.rawLabel || timePref.targetTime,
            availableSlots,
            serviceName: effectiveReason,
            isUrgent: bookingState.isUrgent,
            timePref,
            patientType,
          });
        } else if (timePref?.period && filteredAvailable.length > 0) {
          replyText = formatConversationalSlotOffer({
            dateStr,
            availableSlots: filteredAvailable,
            serviceName: effectiveReason,
            isUrgent: bookingState.isUrgent,
            timePref,
            patientType,
          });
        } else if (filteredAvailable.length > 0) {
          replyText = formatConversationalSlotOffer({
            dateStr,
            availableSlots: filteredAvailable,
            serviceName: effectiveReason,
            isUrgent: bookingState.isUrgent,
            timePref,
            patientType,
          });
        } else {
          replyText = formatConversationalSlotOffer({
            dateStr,
            requestedTimeLabel: timePref?.rawLabel,
            availableSlots,
            serviceName: effectiveReason,
            isUrgent: bookingState.isUrgent,
            timePref,
            patientType,
          });
        }

        const slotsToDisplay = filteredAvailable.length > 0 ? filteredAvailable : slots;

        setBookingState((prev) => ({
          ...prev,
          slots: slotsToDisplay,
          isLoadingSlots: false,
        }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === nextBotMsgId
              ? {
                  ...m,
                  content: replyText,
                  bookingAction: {
                    step: 'show_slots',
                    patientType,
                    visitReason: effectiveReason,
                    selectedDate: dateStr,
                    availableSlots: slotsToDisplay,
                    isLoadingSlots: false,
                    isUrgent: bookingState.isUrgent,
                  },
                }
              : m
          )
        );
      } else {
        // NO available slots on the requested date!
        // Automatically search nearby dates (previous business days -> next business days)
        const altResult = await findAlternativeAppointmentSlots(dateStr, {
          isUrgent: bookingState.isUrgent,
          timePref,
          requiredDurationMinutes: requiredDuration,
          serviceReason: effectiveReason,
        });

        const replyText = formatAlternativeSlotsMessage(dateStr, altResult, timePref);

        if (altResult.hasAlternatives) {
          setBookingState((prev) => ({
            ...prev,
            slots: altResult.allSlots,
            selectedDate: altResult.dayGroups[0]?.date || dateStr,
            isLoadingSlots: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'show_slots',
                      patientType,
                      visitReason,
                      selectedDate: altResult.dayGroups[0]?.date || dateStr,
                      availableSlots: altResult.allSlots,
                      isLoadingSlots: false,
                      isUrgent: bookingState.isUrgent,
                      isAlternativeAvailability: true,
                      requestedDate: dateStr,
                    },
                  }
                : m
            )
          );
        } else {
          setBookingState((prev) => ({
            ...prev,
            step: 'ask_date',
            slots: [],
            isLoadingSlots: false,
          }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextBotMsgId
                ? {
                    ...m,
                    content: replyText,
                    bookingAction: {
                      step: 'ask_date',
                      patientType,
                      visitReason,
                    },
                  }
                : m
            )
          );
        }
      }
    } catch (err) {
      console.error('Failed to query Firestore slots:', err);
      setBookingState((prev) => ({
        ...prev,
        isLoadingSlots: false,
        slotError: "I'm having trouble checking availability right now. Please try again in a moment.",
      }));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === nextBotMsgId
            ? {
                ...m,
                content:
                  "I'm having trouble checking availability right now. Please try again in a moment.",
                bookingAction: {
                  step: 'ask_date',
                  patientType,
                  visitReason,
                  error: "I'm having trouble checking availability right now. Please try again in a moment.",
                },
              }
            : m
        )
      );
    }
  };

  // Helper to handle "next available", "earliest", or "soonest" queries
  const handleNextAvailableRequest = async () => {
    const patientType = bookingState.patientType || 'new';
    const visitReason = bookingState.visitReason || 'Routine Checkup & Cleaning';

    const nextBotMsgId = 'bot-' + Date.now();
    const loadingMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: 'Checking live Firestore demo appointment availability for the earliest open appointments...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'show_slots',
        patientType,
        visitReason,
        isLoadingSlots: true,
        isUrgent: bookingState.isUrgent,
      },
    };

    setMessages((prev) => [...prev, loadingMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'show_slots',
      patientType,
      visitReason,
      isLoadingSlots: true,
      activeMessageId: nextBotMsgId,
    }));

    try {
      const nextResult = await findNextAvailableSlots({
        isUrgent: bookingState.isUrgent,
      });

      if (nextResult.hasSlots) {
        const earliestSlot = nextResult.slots[0];
        const replyText = `Our earliest available appointment is on ${formatDatePretty(
          earliestSlot.date
        )} at ${earliestSlot.time}. Here are the upcoming open appointments from Firestore:`;

        setBookingState((prev) => ({
          ...prev,
          slots: nextResult.slots,
          selectedDate: earliestSlot.date,
          isLoadingSlots: false,
        }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === nextBotMsgId
              ? {
                  ...m,
                  content: replyText,
                  bookingAction: {
                    step: 'show_slots',
                    patientType,
                    visitReason,
                    selectedDate: earliestSlot.date,
                    availableSlots: nextResult.slots,
                    isLoadingSlots: false,
                    isUrgent: bookingState.isUrgent,
                    isAlternativeAvailability: true,
                  },
                }
              : m
          )
        );
      } else {
        setBookingState((prev) => ({
          ...prev,
          isLoadingSlots: false,
        }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === nextBotMsgId
              ? {
                  ...m,
                  content:
                    'There are currently no upcoming available appointment slots in the system. Please suggest a date or call our clinic directly at (281) 946-2569.',
                  bookingAction: {
                    step: 'ask_date',
                    patientType,
                    visitReason,
                  },
                }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Error fetching next available slots:', err);
      setBookingState((prev) => ({ ...prev, isLoadingSlots: false }));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === nextBotMsgId
            ? {
                ...m,
                content:
                  "I'm having trouble checking availability right now. Please try again in a moment.",
              }
            : m
        )
      );
    }
  };

  // Helper to prompt for contact info once a slot is selected
  const promptForContact = (
    slot: DemoAppointmentSlot,
    patientTypeArg?: PatientType,
    visitReasonArg?: string
  ) => {
    // If patient type is not yet known, ask patient type first!
    if (!bookingState.patientType && !patientTypeArg) {
      const botMsgId = 'bot-' + Date.now();
      const promptContent = `Great! To prepare your reservation for ${formatDatePretty(slot.date)} at ${slot.time}, are you a new or existing patient?`;

      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: promptContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_patient_type',
          selectedDate: slot.date,
          selectedSlot: slot,
          isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
        },
      };

      setMessages((prev) => [...prev, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_patient_type',
        selectedDate: slot.date,
        selectedSlot: slot,
        isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
        activeMessageId: botMsgId,
      }));
      return;
    }

    const patientType = patientTypeArg || bookingState.patientType || 'new';
    const visitReason = visitReasonArg || bookingState.visitReason || (slot.type === 'urgent' ? 'Tooth Pain / Urgent Care' : 'Routine Checkup & Cleaning');

    // If contact name and valid phone are already stored, jump straight to review!
    if (bookingState.contactName && bookingState.contactPhone && validateStrictPhone(bookingState.contactPhone, phoneCountry, true).isValid) {
      promptForConfirmationReview({
        slot,
        patientType,
        visitReason,
        contactName: bookingState.contactName,
        contactPhone: bookingState.contactPhone,
        formattedPhone: formatDisplayPhone(bookingState.contactPhone),
        maskedPhone: maskPhoneNumber(bookingState.contactPhone),
      });
      return;
    }

    // If existing patient and hasn't entered their phone yet, ask for phone number
    if (patientType === 'existing') {
      const botMsgId = 'bot-' + Date.now();
      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: `Great choice: ${formatDatePretty(slot.date)} at ${slot.time}.\n\nWelcome back! Please enter your phone number so I can look up your existing demo patient profile:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_existing_phone',
          patientType: 'existing',
          visitReason,
          selectedDate: slot.date,
          selectedSlot: slot,
          isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
        },
      };

      setMessages((prev) => [...prev, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_existing_phone',
        patientType: 'existing',
        visitReason,
        selectedDate: slot.date,
        selectedSlot: slot,
        isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
        activeMessageId: botMsgId,
      }));
      return;
    }

    const botMsgId = 'bot-' + Date.now();
    let promptContent = `Great choice: ${formatDatePretty(slot.date)} at ${slot.time}.\n\n`;
    if (!bookingState.contactName) {
      promptContent += `To prepare your demo reservation, please enter your full name:`;
    } else {
      promptContent += `Thank you, ${bookingState.contactName}. Please enter your phone number:`;
    }

    const botMsg: ChatMessage = {
      id: botMsgId,
      role: 'assistant',
      content: promptContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_contact',
        patientType,
        visitReason,
        selectedDate: slot.date,
        selectedSlot: slot,
        patientName: bookingState.contactName,
        isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
      },
    };

    setMessages((prev) => [...prev, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_contact',
      patientType,
      visitReason,
      selectedDate: slot.date,
      selectedSlot: slot,
      isUrgent: slot.type === 'urgent' || !!bookingState.isUrgent,
      activeMessageId: botMsgId,
    }));
  };

  // Helper to display the concise booking review before making reservation (Section 3 & Section 9)
  const promptForConfirmationReview = (params: {
    slot: DemoAppointmentSlot;
    patientType: PatientType;
    visitReason: string;
    contactName: string;
    contactPhone: string;
    formattedPhone?: string;
    maskedPhone?: string;
    introMessage?: string;
  }) => {
    const { slot, patientType, visitReason, contactName, contactPhone } = params;
    const formattedPhone = params.formattedPhone || formatUSPhone(contactPhone);
    const botMsgId = 'bot-' + Date.now();
    const isUrgent = slot.type === 'urgent' || !!bookingState.isUrgent;
    const patientTypeLabel = patientType === 'new' ? 'New Patient' : 'Existing Patient';
    const appointmentTypeLabel = isUrgent ? 'Urgent' : 'Routine';

    const header =
      params.introMessage ||
      (isUrgent ? 'Please review your urgent appointment:' : 'Please review your appointment details:');

    const duration = resolveServiceDuration(visitReason);
    const endTime = computeEndTime(slot.time, duration);
    const timeDisplay = duration > 30 ? `${slot.time} - ${endTime} (${duration} mins)` : slot.time;

    const reviewContent = `${header}\n\nHere's your appointment:\n${patientTypeLabel}\nName: ${contactName}\nReason: ${visitReason}\nDate: ${formatDatePretty(
      slot.date
    )}\nTime: ${timeDisplay}\nDuration: ${duration} minutes\nPhone: ${formattedPhone}\nAppointment Type: ${appointmentTypeLabel}\n\nWould you like me to confirm this appointment?`;

    const botMsg: ChatMessage = {
      id: botMsgId,
      role: 'assistant',
      content: reviewContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'review_confirmation',
        patientType,
        patientId: bookingState.patientId,
        visitReason,
        selectedDate: slot.date,
        selectedSlot: slot,
        patientName: contactName,
        patientPhone: contactPhone,
        maskedPhone: formattedPhone,
        isUrgent,
        duration,
        endTime,
      },
    };

    setMessages((prev) => [...prev, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'review_confirmation',
      patientType,
      visitReason,
      selectedDate: slot.date,
      selectedSlot: slot,
      contactName,
      contactPhone,
      maskedPhone: formattedPhone,
      isUrgent,
      activeMessageId: botMsgId,
    }));
  };

  // Helper when user wants to change details before confirming (Section 6 & 8)
  const handleChangeDetailsPrompt = () => {
    const botMsg: ChatMessage = {
      id: 'bot-' + Date.now(),
      role: 'assistant',
      content:
        'Sure, what would you like to change? You can choose another date, pick a different time, or update your reason or contact details.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'change_details_options',
        patientType: bookingState.patientType,
        patientId: bookingState.patientId,
        visitReason: bookingState.visitReason,
        selectedDate: bookingState.selectedSlot?.date || bookingState.selectedDate,
        selectedSlot: bookingState.selectedSlot,
        patientName: bookingState.contactName,
        patientPhone: bookingState.contactPhone,
        maskedPhone: bookingState.maskedPhone,
        isUrgent: bookingState.isUrgent,
      },
    };
    setMessages((prev) => [...prev, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      step: 'change_details_options',
    }));
  };

  const promptForVisitReason = (patientType: PatientType = 'new') => {
    const nextBotMsgId = 'bot-' + Date.now();
    const botMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: 'What type of visit are you looking for?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_visit_reason',
        patientType,
      },
    };
    setMessages((prev) => [...prev, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_visit_reason',
      patientType,
      activeMessageId: nextBotMsgId,
    }));
  };

  const promptForDate = (patientType: PatientType = 'new', visitReason = 'Routine Checkup & Cleaning') => {
    const nextBotMsgId = 'bot-' + Date.now();
    const botMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: 'What date would you prefer? You can select an upcoming day or choose a custom date:',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_date',
        patientType,
        visitReason,
      },
    };
    setMessages((prev) => [...prev, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_date',
      visitReason,
      activeMessageId: nextBotMsgId,
    }));
  };

  // Cancel in-progress booking flow or confirmed appointment
  const handleCancelBooking = (reasonText = "I don't want to book") => {
    let cancelContent =
      'No problem at all! I have cancelled the booking process. Please let me know if you have any questions about our dental services, office hours, or anything else.';

    if (lastConfirmedAppointment) {
      cancelContent = `I have cancelled your appointment for ${formatDatePretty(
        lastConfirmedAppointment.slot.date
      )} at ${lastConfirmedAppointment.slot.time}. Please let me know if you would like to reschedule in the future!`;
      setLastConfirmedAppointment(null);
    } else if (!bookingState.inProgress) {
      cancelContent = `If you have an existing appointment with Dental Care & Implants of Houston that you would like to cancel, please call our Greenspoint clinic directly at (281) 946-2569 or provide your name and phone number so I can locate your record.`;
    }

    const botMsg: ChatMessage = {
      id: 'bot-' + Date.now(),
      role: 'assistant',
      content: cancelContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, botMsg]);
    setBookingState({
      inProgress: false,
      step: 'idle',
      slots: [],
      isLoadingSlots: false,
      isReservingSlot: false,
    });
    setInlineContactError(null);
    setInlineExistingPhone('');
    setInlineExistingPhoneError(null);
    setIsLookingUpPatient(false);
  };

  // Handle slot selection (from button click or conversational text)
  const handleSelectSlot = (slot: DemoAppointmentSlot) => {
    if (slot.status === 'booked' || bookingState.isReservingSlot) return;
    promptForContact(slot);
  };

  // Handle patient type button click
  const handleSelectPatientType = (type: PatientType) => {
    // Reset any temporary lookup error or state
    setInlineExistingPhone('');
    setInlineExistingPhoneError(null);
    setIsLookingUpPatient(false);

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: type === 'new' ? 'New Patient' : 'Existing Patient',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // If "Existing Patient" is selected:
    if (type === 'existing') {
      const nextBotMsgId = 'bot-' + (Date.now() + 1);
      const botMsg: ChatMessage = {
        id: nextBotMsgId,
        role: 'assistant',
        content: `Welcome back! Please enter your phone number so I can look up your existing demo patient profile:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_existing_phone',
          patientType: 'existing',
          visitReason: bookingState.visitReason,
          selectedDate: bookingState.selectedSlot?.date,
          selectedSlot: bookingState.selectedSlot,
          isUrgent: bookingState.isUrgent,
        },
      };

      setMessages((prev) => [...prev, userMsg, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_existing_phone',
        patientType: 'existing',
        activeMessageId: nextBotMsgId,
      }));

      setTimeout(() => {
        if (existingPhoneInputRef.current) {
          existingPhoneInputRef.current.focus();
        } else if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return;
    }

    // New Patient flow:
    // If an urgent slot was already selected, proceed straight to collecting contact info
    if (bookingState.selectedSlot) {
      const nextBotMsgId = 'bot-' + (Date.now() + 1);
      const botMsg: ChatMessage = {
        id: nextBotMsgId,
        role: 'assistant',
        content: `Got it, New Patient. To prepare your demo reservation, please enter your full name:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_contact',
          patientType: 'new',
          visitReason: bookingState.visitReason,
          selectedDate: bookingState.selectedSlot.date,
          selectedSlot: bookingState.selectedSlot,
          isUrgent: bookingState.isUrgent,
        },
      };

      setMessages((prev) => [...prev, userMsg, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_contact',
        patientType: 'new',
        activeMessageId: nextBotMsgId,
      }));
      return;
    }

    const nextBotMsgId = 'bot-' + (Date.now() + 1);
    const botMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: `Got it, New Patient. What type of visit are you looking for?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_visit_reason',
        patientType: 'new',
      },
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_visit_reason',
      patientType: 'new',
      activeMessageId: nextBotMsgId,
    }));
  };

  // Handle "Try Another Number" when an existing patient lookup fails
  const handleTryAnotherNumber = (addUserBubble = true) => {
    // 1. Keep the user in Existing Patient mode
    // 2. Clear only the failed patient lookup state (failed lookup result, previous lookup error, temporary status)
    setInlineExistingPhone('');
    setInlineExistingPhoneError(null);
    setIsLookingUpPatient(false);

    // 8. Show a short message such as:
    // "Sure. Please enter the phone number associated with your patient profile."
    const botMsgId = 'bot-' + (Date.now() + (addUserBubble ? 1 : 0));
    const botMsg: ChatMessage = {
      id: botMsgId,
      role: 'assistant',
      content: 'Sure. Please enter the phone number associated with your patient profile:',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_existing_phone',
        patientType: 'existing',
        visitReason: bookingState.visitReason,
        selectedDate: bookingState.selectedSlot?.date || bookingState.selectedDate,
        selectedSlot: bookingState.selectedSlot,
        isUrgent: bookingState.isUrgent,
      },
    };

    if (addUserBubble) {
      const userMsg: ChatMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: 'Try Another Number',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userMsg, botMsg]);
    } else {
      setMessages((prev) => [...prev, botMsg]);
    }

    // Preserve patientType = existing, conversation context, visitReason, selectedDate, selectedSlot
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_existing_phone',
      patientType: 'existing',
      activeMessageId: botMsgId,
    }));

    // Focus Existing Patient phone input automatically
    setTimeout(() => {
      if (existingPhoneInputRef.current) {
        existingPhoneInputRef.current.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
  };

  // Handle phone lookup for existing demo patients
  const handleLookupExistingPatient = async (phoneInput: string, explicitCountry?: SupportedCountry) => {
    const activeCountry = explicitCountry || phoneCountry;
    const phoneVal = validateStrictPhone(phoneInput, activeCountry, false);

    // If ambiguous: 10 digits entered with NO explicit country and cannot be deterministically resolved
    if (phoneVal.isAmbiguous) {
      // First check if an existing patient record exists in either country for these 10 digits
      const potentialMatch = await lookupDemoPatientByPhone(phoneVal.digits);
      if (potentialMatch) {
        // Found existing patient in stored records without needing to interrupt the user
        const firstName = potentialMatch.fullName.split(' ')[0] || potentialMatch.fullName;
        const matchedCountry = potentialMatch.phone.startsWith('+91') ? 'IN' : 'US';
        setPhoneCountry(matchedCountry);

        setBookingState((prev) => ({
          ...prev,
          patientType: 'existing',
          patientId: potentialMatch.id,
          contactName: potentialMatch.fullName,
          contactPhone: potentialMatch.phone,
          maskedPhone: maskPhoneNumber(potentialMatch.phone),
        }));
        setInlineContactName(potentialMatch.fullName);
        setInlineContactPhone(potentialMatch.phone);

        if (bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: 'existing',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: potentialMatch.fullName,
            contactPhone: potentialMatch.phone,
            formattedPhone: formatDisplayPhone(potentialMatch.phone),
            maskedPhone: maskPhoneNumber(potentialMatch.phone),
          });
          return;
        }

        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `Welcome back, ${firstName}! I found your existing demo patient profile. What would you like to schedule today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_visit_reason',
            patientType: 'existing',
            patientId: potentialMatch.id,
            patientName: potentialMatch.fullName,
            patientPhone: potentialMatch.phone,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          inProgress: true,
          step: 'ask_visit_reason',
          patientType: 'existing',
          patientId: potentialMatch.id,
          contactName: potentialMatch.fullName,
          contactPhone: potentialMatch.phone,
          maskedPhone: maskPhoneNumber(potentialMatch.phone),
          activeMessageId: botMsgId,
        }));
        return;
      }

      // Genuinely ambiguous and no matching record exists in either country: ask user to clarify
      const askMsgId = 'bot-' + Date.now();
      const botMsg: ChatMessage = {
        id: askMsgId,
        role: 'assistant',
        content: `I received ${phoneVal.digits}. Is that an Indian (+91) number or a US (+1) number?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_phone_country',
          patientType: 'existing',
          patientPhone: phoneVal.digits,
          selectedDate: bookingState.selectedDate,
          selectedSlot: bookingState.selectedSlot,
          visitReason: bookingState.visitReason,
          isUrgent: bookingState.isUrgent,
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_phone_country',
        contactPhone: phoneVal.digits,
        activeMessageId: askMsgId,
      }));
      return;
    }

    if (!phoneVal.isValid) {
      const errMsg = phoneVal.error || 'Please enter a valid phone number.';
      setInlineExistingPhoneError(errMsg);
      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: errMsg,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_existing_phone',
          patientType: 'existing',
          visitReason: bookingState.visitReason,
          selectedDate: bookingState.selectedDate,
          selectedSlot: bookingState.selectedSlot,
          isUrgent: bookingState.isUrgent,
          error: errMsg,
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      return;
    }

    setInlineExistingPhoneError(null);
    setIsLookingUpPatient(true);

    try {
      const matched = await lookupDemoPatientByPhone(
        phoneVal.e164 || phoneVal.digits,
        phoneVal.country || activeCountry
      );

      if (matched) {
        // Welcome them back by their name
        const firstName = matched.fullName.split(' ')[0] || matched.fullName;
        const matchedCountry = matched.phone.startsWith('+91') ? 'IN' : 'US';
        setPhoneCountry(matchedCountry);

        setBookingState((prev) => ({
          ...prev,
          patientType: 'existing',
          patientId: matched.id,
          contactName: matched.fullName,
          contactPhone: matched.phone,
          maskedPhone: maskPhoneNumber(matched.phone),
        }));
        setInlineContactName(matched.fullName);
        setInlineContactPhone(matched.phone);

        // Case A: If user had an urgent complaint or urgent slot
        if (bookingState.isUrgent || (bookingState.visitReason && isUrgentDentalComplaint(bookingState.visitReason))) {
          const targetDate = bookingState.selectedDate || getHoustonCurrentDateTime().dateStr;
          const botMsgId = 'bot-' + Date.now();
          const botMsg: ChatMessage = {
            id: botMsgId,
            role: 'assistant',
            content: `Welcome back, ${firstName}! I found your existing demo patient profile.\n\nLet me check our earliest urgent appointment for your tooth pain:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, botMsg]);
          await queryAndDisplayUrgentSlot(
            targetDate,
            'existing',
            bookingState.visitReason || 'Tooth Pain / Urgent Discomfort'
          );
          return;
        }

        // Case B: Slot was already selected earlier
        if (bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: 'existing',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: matched.fullName,
            contactPhone: matched.phone,
            formattedPhone: formatDisplayPhone(matched.phone),
            maskedPhone: maskPhoneNumber(matched.phone),
          });
          return;
        }

        // Case C: Standard flow -> Ask what they'd like to schedule today
        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `Welcome back, ${firstName}! I found your existing demo patient profile. What would you like to schedule today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_visit_reason',
            patientType: 'existing',
            patientId: matched.id,
            patientName: matched.fullName,
            patientPhone: matched.phone,
          },
        };

        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          inProgress: true,
          step: 'ask_visit_reason',
          patientType: 'existing',
          patientId: matched.id,
          contactName: matched.fullName,
          contactPhone: matched.phone,
          maskedPhone: maskPhoneNumber(matched.phone),
          activeMessageId: botMsgId,
        }));
      } else {
        // Fallback: Not found in demo records
        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `I couldn't find an existing demo patient profile with phone number ${phoneVal.formatted || phoneVal.e164}.\n\nIf this is your first visit, would you like to register as a new patient, try another number, or cancel?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'patient_lookup_failed',
            patientType: 'existing',
            patientPhone: phoneVal.e164 || phoneVal.digits,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            visitReason: bookingState.visitReason,
          },
        };

        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          step: 'patient_lookup_failed',
          patientType: 'existing',
          contactPhone: phoneVal.e164 || phoneVal.digits,
          activeMessageId: botMsgId,
        }));
      }
    } catch (err) {
      console.error('Patient lookup failed:', err);
      setInlineExistingPhoneError('Error checking records. Please try again.');
    } finally {
      setIsLookingUpPatient(false);
    }
  };

  // Handle visit reason button click
  const handleSelectVisitReason = (reason: string) => {
    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: reason,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (bookingState.selectedSlot && bookingState.contactName && bookingState.contactPhone) {
      setMessages((prev) => [...prev, userMsg]);
      setBookingState((prev) => ({
        ...prev,
        visitReason: reason,
      }));
      promptForConfirmationReview({
        slot: bookingState.selectedSlot,
        patientType: bookingState.patientType || 'new',
        visitReason: reason,
        contactName: bookingState.contactName,
        contactPhone: bookingState.contactPhone,
        formattedPhone: bookingState.maskedPhone || formatUSPhone(bookingState.contactPhone),
        introMessage: `Sure! I've updated your reason to ${reason}.\n\nHere’s your updated appointment:`,
      });
      return;
    }

    const nextBotMsgId = 'bot-' + (Date.now() + 1);
    const botMsg: ChatMessage = {
      id: nextBotMsgId,
      role: 'assistant',
      content: `Understood: ${reason}. What date would you prefer? You can select an upcoming day or choose a custom date:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bookingAction: {
        step: 'ask_date',
        patientType: bookingState.patientType,
        visitReason: reason,
      },
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setBookingState((prev) => ({
      ...prev,
      inProgress: true,
      step: 'ask_date',
      visitReason: reason,
      activeMessageId: nextBotMsgId,
    }));
  };

  // Handle date button click or datepicker change
  const handleSelectDate = async (dateStr: string) => {
    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: `Preferred Date: ${formatDatePretty(dateStr)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    await queryAndDisplaySlots(dateStr);
  };

  // Handle submit from the in-message contact inputs
  const handleSubmitInlineContact = (e: React.FormEvent) => {
    e.preventDefault();

    const nameVal = validatePatientName(inlineContactName);
    if (!nameVal.isValid) {
      setInlineContactError('Please enter your name using letters only.');
      return;
    }

    const phoneVal = validateStrictPhone(inlineContactPhone, phoneCountry, true);
    if (!phoneVal.isValid) {
      setInlineContactError(phoneVal.error || 'Please enter a valid phone number.');
      return;
    }

    setInlineContactError(null);

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: `${nameVal.cleaned}, ${phoneVal.formatted}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);

    const targetSlot = bookingState.selectedSlot;
    if (targetSlot) {
      promptForConfirmationReview({
        slot: targetSlot,
        patientType: bookingState.patientType || 'new',
        visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
        contactName: nameVal.cleaned,
        contactPhone: phoneVal.e164 || phoneVal.digits,
        formattedPhone: phoneVal.formatted,
        maskedPhone: phoneVal.masked,
      });
    }
  };

  // Conversational Detail Correction Handler (Requirement 2)
  // Handles conversational corrections at ANY stage:
  // - Date changes: "Actually, make that Tuesday."
  // - Time changes: "Can I come in the morning instead?"
  // - Reason changes: "I'd like an implant consultation instead of a cleaning."
  // Helper to answer FAQs, services, hours, or general questions while gracefully preserving booking state
  const handleGeneralOrFAQInquiry = (
    answerText: string,
    actionOverride?: ChatMessage['bookingAction']
  ) => {
    if (bookingState.inProgress) {
      let resumeText = '';
      if (bookingState.step === 'review_confirmation') {
        const slot = bookingState.selectedSlot;
        const formattedDate = bookingState.selectedDate
          ? formatDatePretty(bookingState.selectedDate)
          : slot?.date
          ? formatDatePretty(slot.date)
          : '';
        resumeText = `\n\nWhenever you're ready, we can return to your pending reservation for ${
          bookingState.visitReason || 'your visit'
        }${formattedDate ? ` on ${formattedDate}` : ''}${
          slot?.time ? ` at ${slot.time}` : ''
        }. Would you like me to confirm this appointment?`;
      } else if (bookingState.step === 'show_slots') {
        const formattedDate = bookingState.selectedDate ? formatDatePretty(bookingState.selectedDate) : '';
        resumeText = `\n\nWhenever you're ready, we can continue scheduling your appointment${
          formattedDate ? ` for ${formattedDate}` : ''
        }. Would you like to select one of the available times, or check a different day?`;
      } else if (bookingState.step === 'ask_contact') {
        if (bookingState.contactName) {
          resumeText = `\n\nWhenever you're ready, please enter your 10-digit phone number to complete your reservation:`;
        } else {
          resumeText = `\n\nWhenever you're ready, please enter your full name to continue scheduling:`;
        }
      } else if (bookingState.step === 'ask_date') {
        resumeText = `\n\nWhenever you're ready, what date would you prefer for your ${
          bookingState.visitReason || 'visit'
        }?`;
      } else if (bookingState.step === 'ask_visit_reason') {
        resumeText = `\n\nWhenever you're ready, what type of visit are you looking for?`;
      } else if (bookingState.step === 'ask_patient_type') {
        resumeText = `\n\nWhenever you're ready, are you a new patient or an existing patient?`;
      } else {
        resumeText = `\n\nWhenever you're ready, we can continue scheduling your appointment.`;
      }

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: answerText + resumeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: actionOverride || (bookingState.step !== 'idle' ? {
          step: bookingState.step,
          patientType: bookingState.patientType,
          visitReason: bookingState.visitReason,
          selectedDate: bookingState.selectedDate,
          selectedSlot: bookingState.selectedSlot,
          availableSlots: bookingState.slots,
          patientName: bookingState.contactName,
          patientPhone: bookingState.contactPhone,
          isUrgent: bookingState.isUrgent,
        } : undefined),
      };
      setMessages((prev) => [...prev, botMsg]);
      return;
    }

    const botMsg: ChatMessage = {
      id: 'bot-' + Date.now(),
      role: 'assistant',
      content: answerText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, botMsg]);
  };

  // Handles conversational corrections and changes mid-flow:
  // - Urgent complaint switch: "Actually, my tooth is hurting really bad right now. Can I come today instead?"
  // - Multi-field corrections: "Actually, change that to Saturday at 11 AM for an implant consultation instead."
  // - Date changes: "Actually, make that Tuesday"
  // - Time changes: "Can I come at 4 PM instead?"
  // - Service changes: "I'd like an implant consultation instead of a cleaning"
  // - Name corrections: "My name is spelled Sarah, not Sara."
  // - Phone changes: "Use my other phone number: 281-555-0199."
  const handleConversationalCorrection = async (
    correction: ReturnType<typeof detectDetailCorrection>
  ) => {
    // 0. Urgent complaint switch mid-flow (TEST I)
    if (correction.isUrgentSwitch || correction.type === 'urgent') {
      const urgentReason = 'Tooth Pain / Urgent Discomfort';
      const targetDate = correction.datePref?.dateStr || getHoustonCurrentDateTime().dateStr;
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        isUrgent: true,
        visitReason: urgentReason,
        selectedDate: targetDate,
      }));
      await queryAndDisplayUrgentSlot(targetDate, bookingState.patientType, urgentReason);
      return;
    }

    // 0. Patient type correction ("No, I'm an existing patient", "Actually, I'm a new patient")
    if (correction.patientType) {
      const newType = correction.patientType;
      setBookingState((prev) => ({
        ...prev,
        patientType: newType,
      }));

      if (newType === 'existing') {
        const phoneExtracted = extractSpokenPhoneNumber(correction.rawText, phoneCountry);
        if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
          setBookingState((prev) => ({
            ...prev,
            inProgress: true,
            patientType: 'existing',
          }));
          await handleLookupExistingPatient(
            phoneExtracted.e164 || phoneExtracted.digits!,
            phoneExtracted.country || undefined
          );
          return;
        }

        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `Understood! I've updated your status to Existing Patient. Please enter your 10-digit phone number so I can look up your demo record:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_existing_phone',
            patientType: 'existing',
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            isUrgent: bookingState.isUrgent,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          step: 'ask_existing_phone',
          patientType: 'existing',
          activeMessageId: botMsgId,
        }));
        return;
      } else {
        // new patient
        if (bookingState.selectedSlot && bookingState.contactName && bookingState.contactPhone) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: bookingState.contactName,
            contactPhone: bookingState.contactPhone,
            formattedPhone: formatUSPhone(bookingState.contactPhone),
            maskedPhone: formatUSPhone(bookingState.contactPhone),
            introMessage: `Got it! I've updated your status to New Patient.\n\nHere’s your updated appointment:`,
          });
          return;
        }

        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `Understood! I've updated your status to New Patient.${
            !bookingState.visitReason
              ? ' What type of visit are you looking for? (e.g. Cleaning, Consultation, Implants)'
              : !bookingState.selectedDate
              ? ` What date would you prefer for your ${bookingState.visitReason}?`
              : !bookingState.contactName
              ? ' Please enter your full name:'
              : ' Please enter your 10-digit phone number:'
          }`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: !bookingState.visitReason
              ? 'ask_visit_reason'
              : !bookingState.selectedDate
              ? 'ask_date'
              : 'ask_contact',
            patientType: 'new',
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          patientType: 'new',
          step: !bookingState.visitReason
            ? 'ask_visit_reason'
            : !bookingState.selectedDate
            ? 'ask_date'
            : prev.step,
          activeMessageId: botMsgId,
        }));
        return;
      }
    }

    // 1. Name correction ("My name is spelled Sarah, not Sara")
    if (correction.name) {
      const validName = correction.name;
      setInlineContactName(validName);
      setBookingState((prev) => ({ ...prev, contactName: validName }));

      if (
        bookingState.selectedSlot &&
        bookingState.contactPhone &&
        bookingState.contactPhone.length === 10
      ) {
        promptForConfirmationReview({
          slot: bookingState.selectedSlot,
          patientType: bookingState.patientType || 'new',
          visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
          contactName: validName,
          contactPhone: bookingState.contactPhone,
          formattedPhone: formatUSPhone(bookingState.contactPhone),
          maskedPhone: formatUSPhone(bookingState.contactPhone),
          introMessage: `Got it! I've updated your name to ${validName}.\n\nHere’s your updated appointment:`,
        });
        return;
      }

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: `Got it! I've updated your name to ${validName}.${
          !bookingState.contactPhone ? ' Please enter your 10-digit phone number:' : ''
        }`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: (bookingState.contactPhone && bookingState.step !== 'idle' ? bookingState.step : 'ask_contact') as any,
          patientType: bookingState.patientType,
          visitReason: bookingState.visitReason,
          selectedDate: bookingState.selectedDate,
          selectedSlot: bookingState.selectedSlot,
          patientName: validName,
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      return;
    }

    // 2. Phone correction ("Use my other phone number: 281-555-0199")
    if (correction.phone && correction.phone.isValid) {
      const newPhone = correction.phone.cleaned;
      const formatted = correction.phone.formatted;
      setInlineContactPhone(newPhone);
      setBookingState((prev) => ({
        ...prev,
        contactPhone: newPhone,
        maskedPhone: formatted,
      }));

      if (bookingState.selectedSlot && bookingState.contactName) {
        promptForConfirmationReview({
          slot: bookingState.selectedSlot,
          patientType: bookingState.patientType || 'new',
          visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
          contactName: bookingState.contactName,
          contactPhone: newPhone,
          formattedPhone: formatted,
          maskedPhone: formatted,
          introMessage: `Sure! I've updated your phone number to ${formatted}.\n\nHere’s your updated appointment:`,
        });
        return;
      }

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: `Sure! I've updated your phone number to ${formatted}.${
          !bookingState.contactName ? ' Please enter your full name:' : ''
        }`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
      return;
    }

    // 3. Multi-field correction, or Service/Date/Time modification (TEST F, TEST H)
    // e.g. "Actually, change that to Saturday at 11 AM for an implant consultation instead."
    const newReason = correction.reason || bookingState.visitReason || 'Routine Checkup & Cleaning';
    const newDate =
      correction.datePref?.dateStr ||
      bookingState.selectedDate ||
      bookingState.selectedSlot?.date;
    const newTimePref = correction.timePref || bookingState.timePreference;

    if (correction.reason || correction.datePref || correction.timePref) {
      const dur = resolveServiceDuration(newReason);
      setBookingState((prev) => ({
        ...prev,
        visitReason: newReason,
        selectedDate: newDate,
        timePreference: newTimePref,
      }));

      if (newDate) {
        // Query slots with duration recalculated for the updated service
        const durationSlots = await getDurationAwareAvailableSlots(
          newDate,
          dur,
          bookingState.isUrgent
        ).catch(() => []);
        const slots = durationSlots.map((d) => d.slot);
        const { availableSlots, exactMatch, filteredAvailable } = filterSlotsByPreference(
          slots,
          newTimePref
        );

        if (exactMatch && exactMatch.status === 'available') {
          // If the patient was at confirmation review with full contact info, update review directly!
          if (
            bookingState.contactName &&
            bookingState.contactPhone &&
            bookingState.contactPhone.length === 10
          ) {
            promptForConfirmationReview({
              slot: exactMatch,
              patientType: bookingState.patientType || 'new',
              visitReason: newReason,
              contactName: bookingState.contactName,
              contactPhone: bookingState.contactPhone,
              formattedPhone: formatUSPhone(bookingState.contactPhone),
              maskedPhone: formatUSPhone(bookingState.contactPhone),
              introMessage: `Sure! I've updated your appointment details:\n\nHere’s your updated appointment:`,
            });
            return;
          } else {
            promptForContact(exactMatch);
            return;
          }
        }

        // If specific requested time is not available or not specified, present available slots
        await queryAndDisplaySlots(newDate, newTimePref, bookingState.patientType, newReason);
        return;
      }

      const nextBotMsgId = 'bot-' + Date.now();
      const botMsg: ChatMessage = {
        id: nextBotMsgId,
        role: 'assistant',
        content: `Of course! I'll update your service to ${newReason}. What date would you prefer? You can select an upcoming day or choose a custom date:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_date',
          patientType: bookingState.patientType || 'new',
          visitReason: newReason,
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_date',
        visitReason: newReason,
        activeMessageId: nextBotMsgId,
      }));
      return;
    }
  };

  // Main conversational message handler
  const handleSendMessage = async (textToSendArg?: string) => {
    if (isListening) {
      stopListening();
    }
    stopSpeaking();
    setVoiceNotice(null);
    clearVoiceError();
    clearVoiceResponseError();

    const textToSend = (textToSendArg || input).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    const lower = textToSend.toLowerCase();

    // Build rich conversational context for intent classification
    const intentContext = {
      bookingInProgress: bookingState.inProgress,
      bookingStep: bookingState.step,
      visitReason: bookingState.visitReason,
      selectedDate: bookingState.selectedDate,
      selectedSlot: bookingState.selectedSlot,
      patientType: bookingState.patientType,
      patientName: bookingState.contactName,
      patientPhone: bookingState.contactPhone,
      hasConfirmedAppointment: bookingState.step === 'confirmed' || !!lastConfirmedAppointment,
      confirmedSlot: bookingState.selectedSlot || lastConfirmedAppointment?.slot,
      confirmedReason: bookingState.visitReason || lastConfirmedAppointment?.visitReason,
      lastUserMessage: messages.filter((m) => m.role === 'user').slice(-1)[0]?.content,
      lastAssistantMessage: messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content,
    };

    const classified = classifyIntent(textToSend, intentContext);

    // 1. Life-Threatening Medical Emergency Check (Highest Clinical Priority)
    // Symptoms like difficulty breathing, swallowing, uncontrolled bleeding, severe throat/facial swelling
    if (classified.primaryIntent === 'emergency') {
      const emergencyMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: LIFE_THREATENING_EMERGENCY_GUIDANCE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEmergencyAlert: true,
      };
      setMessages((prev) => [...prev, emergencyMsg]);
      return;
    }

    // 1.1 Unclear Speech / Input Fallback (Requirement 1 & TEST 5)
    const unclearInputPatterns = [
      '?',
      '???',
      '...',
      'huh',
      'what',
      'pardon',
      '[unclear]',
      '[inaudible]',
      '[muffled]',
      'inaudible',
      'unclear',
    ];
    if (unclearInputPatterns.includes(lower)) {
      if (bookingState.inProgress) {
        if (bookingState.step === 'ask_date') {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: "I didn't catch the date. Could you say it again, for example, 'next Monday'?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_date',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
        if (bookingState.step === 'show_slots') {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: "I didn't catch the time. Could you repeat it, for example, '11 AM'?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'show_slots',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              availableSlots: bookingState.slots,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
        if (bookingState.step === 'ask_existing_phone' || bookingState.step === 'ask_contact') {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: "I didn't catch the full 10-digit phone number. Could you please repeat it?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: bookingState.step,
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              selectedSlot: bookingState.selectedSlot,
              patientName: bookingState.contactName,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
      }

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: "I didn't quite catch that. Could you please repeat it?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
      return;
    }

    // 1.15 Unclear Date Phrase (TEST 5)
    const hasUnclearDatePhrase =
      lower.includes('unclear date') ||
      lower.includes('some date') ||
      lower.includes('whatever date') ||
      lower.includes('random date') ||
      lower.includes('next whatever');

    if (hasUnclearDatePhrase && !classified.datePref) {
      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: "I didn't catch the date. Could you say it again, for example, 'next Monday'?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_date',
          patientType: classified.patientType || bookingState.patientType || 'new',
          visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      setBookingState((prev) => ({
        ...prev,
        inProgress: true,
        step: 'ask_date',
        patientType: classified.patientType || prev.patientType || 'new',
        visitReason: prev.visitReason || 'Routine Checkup & Cleaning',
      }));
      return;
    }

    // 1.2 Appointment Cancellation (TEST N: "Cancel my appointment.")
    if (classified.primaryIntent === 'appointment_cancellation') {
      handleCancelBooking(textToSend);
      return;
    }

    // 1.5 Urgent Dental Complaints (toothache, dental pain, swelling, broken tooth)
    // (TEST I: "I have severe tooth pain. What's the earliest appointment?")
    if (classified.primaryIntent === 'urgent_dental') {
      const extractedDate = classified.datePref;
      const extractedPatientType = classified.patientType;
      const extractedReason = classified.serviceName || 'Tooth Pain / Urgent Discomfort';
      const targetDate = extractedDate?.dateStr || getHoustonCurrentDateTime().dateStr;

      if (extractedPatientType === 'existing') {
        const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
        if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
          setBookingState((prev) => ({
            ...prev,
            inProgress: true,
            isUrgent: true,
            visitReason: extractedReason,
            selectedDate: targetDate,
            patientType: 'existing',
          }));
          await handleLookupExistingPatient(
            phoneExtracted.e164 || phoneExtracted.digits!,
            phoneExtracted.country || undefined
          );
          return;
        }

        const botMsgId = 'bot-' + Date.now();
        const botMsg: ChatMessage = {
          id: botMsgId,
          role: 'assistant',
          content: `Welcome back. I am sorry to hear your tooth is hurting. Please enter your 10-digit phone number so I can verify your existing demo patient profile and check our earliest urgent appointment:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_existing_phone',
            patientType: 'existing',
            visitReason: extractedReason,
            selectedDate: targetDate,
            isUrgent: true,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState({
          inProgress: true,
          step: 'ask_existing_phone',
          patientType: 'existing',
          visitReason: extractedReason,
          selectedDate: targetDate,
          isUrgent: true,
          slots: [],
          isLoadingSlots: false,
          isReservingSlot: false,
          activeMessageId: botMsgId,
        });
        return;
      }

      await queryAndDisplayUrgentSlot(targetDate, extractedPatientType || undefined, extractedReason);
      return;
    }

    // 1.8 Conversational Detail Corrections (Requirement 2 & TEST L)
    // If the patient is actively changing or correcting a detail mid-flow:
    // (e.g. "Actually, make that Tuesday", "Can I come in the morning instead?",
    // "I'd like an implant consultation instead of a cleaning", "My name is spelled Sarah, not Sara",
    // "Use my other phone number: 281-555-0199")
    if (bookingState.inProgress) {
      const correction = detectDetailCorrection(textToSend);
      if (correction.hasCorrection) {
        // If at review_confirmation, affirmative confirmations like "yes" or "confirm" are not corrections
        if (bookingState.step === 'review_confirmation' && isClearConfirmationIntent(textToSend)) {
          // Proceed to review_confirmation handling below
        } else {
          await handleConversationalCorrection(correction);
          return;
        }
      }
    }

    // 1.9 Reschedule / Appointment Change Request (TEST O: "Can I move it to Monday?")
    if (classified.primaryIntent === 'appointment_change' && classified.datePref) {
      const targetDate = classified.datePref.dateStr;
      const vReason =
        bookingState.visitReason || lastConfirmedAppointment?.visitReason || 'Routine Checkup & Cleaning';
      const pType = bookingState.patientType || lastConfirmedAppointment?.patientType || 'new';
      await queryAndDisplaySlots(targetDate, classified.timePref, pType, vReason);
      return;
    }

    // 2. Check if currently in review_confirmation or change_details_options step
    if (bookingState.inProgress && (bookingState.step === 'review_confirmation' || bookingState.step === 'change_details_options')) {
      // 2A. Explicit affirmative confirmation (Section 4 & Section 7)
      if (isClearConfirmationIntent(textToSend)) {
        if (bookingState.selectedSlot) {
          await executeReservation(bookingState.selectedSlot);
        } else {
          await queryAndDisplaySlots(bookingState.selectedDate || getHoustonCurrentDateTime().dateStr);
        }
        return;
      }

      // 2B. Ambiguous responses (Section 7: "ambiguous messages should NOT automatically book")
      if (isAmbiguousConfirmation(textToSend)) {
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: 'Would you like me to go ahead and book this appointment for you?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'review_confirmation',
            patientType: bookingState.patientType,
            patientId: bookingState.patientId,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientName: bookingState.contactName,
            patientPhone: bookingState.contactPhone,
            isUrgent: bookingState.isUrgent,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // 2C. Explicit negative response or cancellation (Section 8 & Test 5)
      if (isNegativeOrCancellation(textToSend)) {
        if (lower.includes('cancel') || lower.includes('changed my mind') || lower.includes('never mind')) {
          handleCancelBooking();
        } else {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content:
              'Understood. I have not booked this appointment. Would you like to change the date, time, or other details, or did you want to cancel?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'change_details_options',
              patientType: bookingState.patientType,
              patientId: bookingState.patientId,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              selectedSlot: bookingState.selectedSlot,
              patientName: bookingState.contactName,
              patientPhone: bookingState.contactPhone,
              isUrgent: bookingState.isUrgent,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          setBookingState((prev) => ({
            ...prev,
            step: 'change_details_options',
          }));
        }
        return;
      }

      // 2D. Specific Detail Changes (Section 6 & Section 8)
      // Check for phone change
      const contactParsed = extractContactDetails(textToSend);
      const rawDigits = textToSend.replace(/\D/g, '');
      const phoneCandidate = contactParsed.phone?.cleaned || (rawDigits.length === 10 ? rawDigits : null);

      if (lower.includes('phone') || lower.includes('number') || phoneCandidate) {
        if (phoneCandidate && phoneCandidate.length === 10) {
          const formatted = formatUSPhone(phoneCandidate);
          setInlineContactPhone(phoneCandidate);
          setBookingState((prev) => ({
            ...prev,
            contactPhone: phoneCandidate,
            maskedPhone: formatted,
          }));
          if (bookingState.selectedSlot) {
            promptForConfirmationReview({
              slot: bookingState.selectedSlot,
              patientType: bookingState.patientType || 'new',
              visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
              contactName: bookingState.contactName || 'Guest Patient',
              contactPhone: phoneCandidate,
              formattedPhone: formatted,
              introMessage: `Sure! I've updated your phone number to ${formatted}.\n\nHere’s your updated appointment:`,
            });
          }
          return;
        } else {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: 'Please enter your updated 10-digit phone number:',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_contact',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              selectedSlot: bookingState.selectedSlot,
              patientName: bookingState.contactName,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
      }

      // Check for name change
      const nameMatch = textToSend.match(/(?:my name is|change my name to|name is|call me)\s+([A-Za-z\s]+)/i);
      if (nameMatch && nameMatch[1]) {
        const validated = validatePatientName(nameMatch[1].trim());
        if (validated.isValid) {
          setBookingState((prev) => ({ ...prev, contactName: validated.cleaned }));
          if (bookingState.selectedSlot && bookingState.contactPhone) {
            promptForConfirmationReview({
              slot: bookingState.selectedSlot,
              patientType: bookingState.patientType || 'new',
              visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
              contactName: validated.cleaned,
              contactPhone: bookingState.contactPhone,
              formattedPhone: formatUSPhone(bookingState.contactPhone),
              introMessage: `Sure! I've updated your name to ${validated.cleaned}.\n\nHere’s your updated appointment:`,
            });
            return;
          }
        }
      }

      // Check for reason change
      const reasonCandidate = extractVisitReason(textToSend);
      if (lower.includes('reason') || (reasonCandidate && reasonCandidate !== bookingState.visitReason)) {
        const newReason =
          reasonCandidate ||
          (lower.includes('clean')
            ? 'Teeth Cleaning'
            : lower.includes('pain')
            ? 'Tooth Pain'
            : lower.includes('implant')
            ? 'Dental Implants Consultation'
            : 'Routine Checkup & Cleaning');
        setBookingState((prev) => ({
          ...prev,
          visitReason: newReason,
        }));
        if (bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: newReason,
            contactName: bookingState.contactName || 'Guest Patient',
            contactPhone: bookingState.contactPhone || '',
            formattedPhone: bookingState.contactPhone ? formatUSPhone(bookingState.contactPhone) : undefined,
            introMessage: `Sure! I've updated your reason to ${newReason}.\n\nHere’s your updated appointment:`,
          });
        }
        return;
      }

      // Check for date change (e.g. "I want Tuesday instead", "Monday would be better", "Change it to Tuesday")
      const datePref = extractDatePreference(textToSend);
      if (datePref) {
        const newDate = datePref.dateStr;
        setBookingState((prev) => ({ ...prev, selectedDate: newDate }));
        const timePref = extractTimePreference(textToSend);
        const dur = resolveServiceDuration(bookingState.visitReason);
        const durationSlots = await getDurationAwareAvailableSlots(newDate, dur, bookingState.isUrgent).catch(() => []);
        const targetSlots = durationSlots.map((d) => d.slot);
        const matchingSlot = timePref?.targetTime
          ? targetSlots.find((s) => s.status === 'available' && s.time.toLowerCase() === timePref.targetTime?.toLowerCase())
          : targetSlots.find((s) => s.status === 'available' && s.time === bookingState.selectedSlot?.time);

        if (matchingSlot && bookingState.contactName && bookingState.contactPhone) {
          promptForConfirmationReview({
            slot: matchingSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: bookingState.contactName,
            contactPhone: bookingState.contactPhone,
            formattedPhone: formatUSPhone(bookingState.contactPhone),
            introMessage: `Sure. I found ${matchingSlot.time} available on ${formatDatePretty(newDate)}.\n\nHere’s your updated appointment:`,
          });
        } else {
          await queryAndDisplaySlots(newDate);
        }
        return;
      }

      // Check for time change (e.g. "Actually, can I do 2 PM instead?", "Can I do 11 instead?", "I want a different time", "I need an earlier appointment", "I need a later time")
      const timePref = extractTimePreference(textToSend);
      if (timePref || lower.includes('time') || lower.includes('earlier') || lower.includes('later')) {
        const curDate = bookingState.selectedDate || bookingState.selectedSlot?.date || getHoustonCurrentDateTime().dateStr;
        const dur = resolveServiceDuration(bookingState.visitReason);
        const durationSlots = await getDurationAwareAvailableSlots(curDate, dur, bookingState.isUrgent).catch(() => []);
        const slots = durationSlots.map((d) => d.slot);
        const available = slots.filter((s) => s.status === 'available');

        let matchedSlot: DemoAppointmentSlot | undefined;

        if (timePref?.targetTime) {
          matchedSlot = available.find((s) => s.time.toLowerCase() === timePref.targetTime?.toLowerCase());
        } else if (timePref?.targetHour) {
          matchedSlot = available.find((s) => {
            const h = parseTimeToMinutes(s.time);
            return Math.floor(h / 60) === timePref.targetHour;
          });
        } else if (timePref?.relative === 'earlier' && bookingState.selectedSlot) {
          const curMins = parseTimeToMinutes(bookingState.selectedSlot.time);
          const earlierSlots = available.filter((s) => parseTimeToMinutes(s.time) < curMins);
          matchedSlot = earlierSlots[earlierSlots.length - 1] || earlierSlots[0];
        } else if (timePref?.relative === 'later' && bookingState.selectedSlot) {
          const curMins = parseTimeToMinutes(bookingState.selectedSlot.time);
          const laterSlots = available.filter((s) => parseTimeToMinutes(s.time) > curMins);
          matchedSlot = laterSlots[0];
        }

        if (matchedSlot && bookingState.contactName && bookingState.contactPhone) {
          promptForConfirmationReview({
            slot: matchedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: bookingState.contactName,
            contactPhone: bookingState.contactPhone,
            formattedPhone: formatUSPhone(bookingState.contactPhone),
            introMessage: `Sure. I found ${matchedSlot.time} available.\n\nHere’s your updated appointment:`,
          });
          return;
        } else {
          // Specified time wasn't found or user just asked for different time: show available times
          await queryAndDisplaySlots(curDate);
          return;
        }
      }

      // 2E. General change request without specific detail
      if (isChangeRequest(textToSend) || lower.includes('change')) {
        handleChangeDetailsPrompt();
        return;
      }
    }

    // 2.2 Check if user is confirming an offered slot (e.g. offered urgent slot: "Would you like me to book this time?")
    if (bookingState.inProgress && bookingState.step === 'show_slots' && bookingState.selectedSlot) {
      if (
        isAffirmativeIntent(textToSend) ||
        lower.includes('book this') ||
        lower.includes('book it') ||
        lower.includes('yes please') ||
        lower === 'yes' ||
        lower === 'book'
      ) {
        handleSelectSlot(bookingState.selectedSlot);
        return;
      }
    }

    // 2.4 Handle conversational phone entry for existing patient lookup
    if (bookingState.inProgress && bookingState.step === 'ask_existing_phone') {
      if (lower === 'new' || lower === 'new patient' || lower.includes('new patient')) {
        handleSelectPatientType('new');
        return;
      }
      if (lower === 'cancel' || lower.includes('cancel') || lower === 'stop' || lower === 'exit') {
        handleCancelBooking(textToSend);
        return;
      }
      const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
      if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
        await handleLookupExistingPatient(
          phoneExtracted.e164 || phoneExtracted.digits!,
          phoneExtracted.country || undefined
        );
        return;
      }
      await handleLookupExistingPatient(textToSend);
      return;
    }

    // 2.45 Handle patient lookup failed fallback options
    if (bookingState.inProgress && bookingState.step === 'patient_lookup_failed') {
      // 1. Try Another Number Intent (voice or typed input)
      if (
        isTryAnotherNumberIntent(textToSend) ||
        isTryAnotherNumberIntent(lower) ||
        lower === 'another' ||
        lower === 'different'
      ) {
        handleTryAnotherNumber(false);
        return;
      }

      // 2. Continue as New Patient Intent
      if (
        lower === 'new' ||
        lower === 'new patient' ||
        lower.includes('new patient') ||
        lower.includes('continue as new') ||
        lower.includes('register') ||
        lower.includes('first visit')
      ) {
        handleSelectPatientType('new');
        return;
      }

      // 3. Cancel Intent
      if (
        lower === 'cancel' ||
        lower.includes('cancel') ||
        lower === 'exit' ||
        lower === 'stop' ||
        lower === 'nevermind' ||
        lower === 'never mind' ||
        lower === 'no'
      ) {
        handleCancelBooking(textToSend);
        return;
      }

      // 4. Directly entered or spoken phone number (e.g. "9876543210", "+91 9876543210", "it's 281-555-1234")
      const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
      if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
        await handleLookupExistingPatient(
          phoneExtracted.e164 || phoneExtracted.digits!,
          phoneExtracted.country || undefined
        );
        return;
      }
      const phoneCheck = validateStrictPhone(textToSend, phoneCountry, true);
      if (phoneCheck.isValid || (phoneCheck.digits && phoneCheck.digits.length >= 10)) {
        await handleLookupExistingPatient(phoneCheck.e164 || phoneCheck.digits);
        return;
      }
      const digitsOnly = textToSend.replace(/\D/g, '');
      if (digitsOnly.length >= 10 && digitsOnly.length <= 12) {
        await handleLookupExistingPatient(textToSend);
        return;
      }

      // 5. Fallback for conversational retry queries
      if (
        lower.includes('another') ||
        lower.includes('different') ||
        lower.includes('try again') ||
        lower.includes('change number')
      ) {
        handleTryAnotherNumber(false);
        return;
      }
    }

    // 2.46 Handle phone country selection step
    if (bookingState.inProgress && bookingState.step === 'ask_phone_country') {
      if (
        lower === 'india' ||
        lower.includes('india') ||
        lower === 'indian' ||
        lower.includes('+91') ||
        lower === '91' ||
        lower === 'in'
      ) {
        setPhoneCountry('IN');
        const phone = bookingState.contactPhone || '';
        await handleLookupExistingPatient(phone, 'IN');
        return;
      }

      if (
        lower === 'us' ||
        lower === 'usa' ||
        lower.includes('united states') ||
        lower.includes('america') ||
        lower.includes('+1') ||
        lower === '1'
      ) {
        setPhoneCountry('US');
        const phone = bookingState.contactPhone || '';
        await handleLookupExistingPatient(phone, 'US');
        return;
      }

      if (lower === 'cancel' || lower.includes('cancel') || lower === 'stop' || lower === 'exit') {
        handleCancelBooking(textToSend);
        return;
      }

      // If user typed a new phone number altogether
      const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
      if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
        await handleLookupExistingPatient(
          phoneExtracted.e164 || phoneExtracted.digits!,
          phoneExtracted.country || undefined
        );
        return;
      }
      await handleLookupExistingPatient(textToSend);
      return;
    }

    // ====================================================
    // INTENT-BASED RESPONSE ROUTING
    // ====================================================

    // MULTI-INTENT 1: Service Information + Pricing (TEST E: "Do you do implants and how much do they cost?")
    if (
      classified.allIntents.includes('service_information') &&
      classified.allIntents.includes('pricing')
    ) {
      const response = routeInformationalResponse(classified, intentContext);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // MULTI-INTENT 2: Service Information + Operating Hours (TEST F: "Do you do implants and are you open Saturday?")
    if (
      classified.allIntents.includes('service_information') &&
      classified.allIntents.includes('hours')
    ) {
      const response = routeInformationalResponse(classified, intentContext);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // MULTI-INTENT 3: Pricing + Booking / Availability (TEST G: "I need a cleaning tomorrow afternoon and how much does it cost?")
    if (
      classified.allIntents.includes('pricing') &&
      (classified.allIntents.includes('booking') || classified.allIntents.includes('availability'))
    ) {
      const extractedReason =
        classified.serviceName || extractVisitReason(textToSend) || 'Routine Checkup & Cleaning';
      const pricingAnswer = getPricingResponse(extractedReason);
      const targetDate = classified.datePref?.dateStr;

      if (targetDate) {
        const dur = resolveServiceDuration(extractedReason);
        const durationSlots = await getDurationAwareAvailableSlots(targetDate, dur, false);
        const slots = durationSlots.map((d) => d.slot);
        const filtered = filterSlotsByPreference(slots, classified.timePref);

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `${pricingAnswer}\n\nHere are available appointment times for ${extractedReason} on ${formatDatePretty(
            targetDate
          )}:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'show_slots',
            patientType: classified.patientType || 'new',
            visitReason: extractedReason,
            selectedDate: targetDate,
            availableSlots: filtered.availableSlots,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState({
          inProgress: true,
          step: 'show_slots',
          patientType: classified.patientType || 'new',
          visitReason: extractedReason,
          selectedDate: targetDate,
          slots: filtered.availableSlots,
          isLoadingSlots: false,
          isReservingSlot: false,
        });
        return;
      }
    }

    // INFORMATIONAL INTENTS: FAQ & Business Policies (Phase 11D)
    if (classified.primaryIntent === 'faq' || classified.primaryIntent === 'policy') {
      const response = routeInformationalResponse(classified, intentContext, knowledgeConfig, activeConfig.phone);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // INFORMATIONAL INTENTS: Pricing (TEST B: "How much does an implant cost?", TEST M: "How much?")
    if (classified.primaryIntent === 'pricing') {
      const response = routeInformationalResponse(classified, intentContext, knowledgeConfig, activeConfig.phone);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // INFORMATIONAL INTENTS: Service Information (TEST A: "Do you do implants?")
    if (classified.primaryIntent === 'service_information') {
      const response = routeInformationalResponse(classified, intentContext, knowledgeConfig, activeConfig.phone);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // INFORMATIONAL INTENTS: Clinic Info, Hours, Contact, Doctors, Insurance, Financing, Dental Info, Casual, Clarification
    if (
      classified.primaryIntent === 'hours' ||
      classified.primaryIntent === 'insurance' ||
      classified.primaryIntent === 'doctor_information' ||
      classified.primaryIntent === 'clinic_information' ||
      classified.primaryIntent === 'contact' ||
      classified.primaryIntent === 'financing' ||
      classified.primaryIntent === 'general_dental_information' ||
      classified.primaryIntent === 'casual_conversation' ||
      classified.primaryIntent === 'clarification'
    ) {
      const response = routeInformationalResponse(classified, intentContext, knowledgeConfig, activeConfig.phone);
      handleGeneralOrFAQInquiry(response);
      return;
    }

    // 3. Check for change requests when booking is in progress
    if (bookingState.inProgress && isChangeRequest(textToSend)) {
      // Check if user changed date (e.g. "Actually, Monday would be better")
      const newDatePref = extractDatePreference(textToSend);
      if (newDatePref) {
        await queryAndDisplaySlots(newDatePref.dateStr, extractTimePreference(textToSend));
        return;
      }

      // Check if user changed time (e.g. "Actually, 1 PM instead" or "Actually, 4 PM instead")
      const newTimePref = extractTimePreference(textToSend);
      if (newTimePref && bookingState.selectedDate) {
        const dur = resolveServiceDuration(bookingState.visitReason);
        const durationSlots = await getDurationAwareAvailableSlots(bookingState.selectedDate, dur, bookingState.isUrgent);
        const slots = durationSlots.map((d) => d.slot);
        const { availableSlots, exactMatch } = filterSlotsByPreference(slots, newTimePref);

        if (exactMatch && exactMatch.status === 'available') {
          // If we already have contact details, go directly to updated confirmation review
          if (bookingState.contactName && bookingState.contactPhone && bookingState.contactPhone.length === 10) {
            promptForConfirmationReview({
              slot: exactMatch,
              patientType: bookingState.patientType || 'new',
              visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
              contactName: bookingState.contactName,
              contactPhone: bookingState.contactPhone,
              formattedPhone: formatUSPhone(bookingState.contactPhone),
              maskedPhone: formatUSPhone(bookingState.contactPhone),
            });
          } else {
            promptForContact(exactMatch);
          }
          return;
        } else {
          const availTimes = availableSlots.map((s) => s.time).join(', ');
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: `${newTimePref.rawLabel || 'That time'} is not currently available on ${formatDatePretty(
              bookingState.selectedDate
            )}. Available times are: ${availTimes || 'None'}. Which time would you prefer?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'show_slots',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              availableSlots: slots,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
      }
    }

    // 4. Check if we are waiting for contact details (ask_contact)
    if (bookingState.inProgress && bookingState.step === 'ask_contact') {
      const parsedContact = extractContactDetails(textToSend);

      // Case A0-1: Incomplete or ambiguous phone number mentioned (Requirement 6 & TEST 6)
      if (parsedContact.hasIncompletePhone && !parsedContact.phone?.isValid) {
        if (parsedContact.name) {
          setInlineContactName(parsedContact.name);
          setBookingState((prev) => ({ ...prev, contactName: parsedContact.name }));
        }
        const errMsg = parsedContact.incompletePhoneError || "I didn't catch the full 10-digit phone number. Could you please repeat it?";
        const greetingPrefix = parsedContact.name ? `Thank you, ${parsedContact.name}. ` : '';
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `${greetingPrefix}${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_contact',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientName: parsedContact.name || bookingState.contactName,
            error: errMsg,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // Case A0-2: User provided both name and phone together (e.g. "Sarah Johnson 281-946-2569" or "My name is John Doe, 2819462569")
      if (parsedContact.name && parsedContact.phone?.isValid) {
        const nameCleaned = parsedContact.name;
        const phoneDigits = parsedContact.phone.cleaned;
        const phoneFormatted = parsedContact.phone.formatted;
        setInlineContactName(nameCleaned);
        setInlineContactPhone(phoneDigits);
        setBookingState((prev) => ({
          ...prev,
          contactName: nameCleaned,
          contactPhone: phoneDigits,
          maskedPhone: phoneFormatted,
        }));
        if (bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: nameCleaned,
            contactPhone: phoneDigits,
            formattedPhone: phoneFormatted,
            maskedPhone: phoneFormatted,
          });
          return;
        }
      }

      // Case A0-3: User provided name only through natural voice or typed input
      // ("My name is Riya Sharma", "I'm Riya Sharma", "This is Riya Sharma", "You can put me down as Riya Sharma")
      if (parsedContact.name && !parsedContact.phone?.isValid) {
        const validName = parsedContact.name;
        setInlineContactName(validName);
        setBookingState((prev) => ({
          ...prev,
          contactName: validName,
        }));

        if (bookingState.contactPhone && bookingState.contactPhone.length === 10 && bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: validName,
            contactPhone: bookingState.contactPhone,
            formattedPhone: formatUSPhone(bookingState.contactPhone),
            maskedPhone: formatUSPhone(bookingState.contactPhone),
          });
          return;
        }

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Thank you, ${validName}. Please enter your 10-digit phone number:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_contact',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientName: validName,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // Case A0-4: User provided phone number only ("My number is 9876543210", "Nine eight seven six five four three two one zero")
      if (parsedContact.phone?.isValid && !parsedContact.name) {
        const phoneDigits = parsedContact.phone.cleaned;
        const phoneFormatted = parsedContact.phone.formatted;
        setInlineContactPhone(phoneDigits);
        setBookingState((prev) => ({
          ...prev,
          contactPhone: phoneDigits,
          maskedPhone: phoneFormatted,
        }));

        if (bookingState.contactName && bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: bookingState.contactName,
            contactPhone: phoneDigits,
            formattedPhone: phoneFormatted,
            maskedPhone: phoneFormatted,
          });
          return;
        }

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Thank you! I've noted your phone number (${phoneFormatted}). Please enter your full name:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_contact',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientPhone: phoneDigits,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // Case A: User provided both name and phone separated by comma (e.g. "Sarah Johnson, 2819462569")
      if (textToSend.includes(',')) {
        const parts = textToSend.split(',');
        if (parts.length === 2) {
          const namePart = parts[0].trim();
          const phonePart = parts[1].trim();

          const nameVal = validatePatientName(namePart);
          if (!nameVal.isValid) {
            const botMsg: ChatMessage = {
              id: 'bot-' + Date.now(),
              role: 'assistant',
              content: 'Please enter your name using letters only.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_contact',
                patientType: bookingState.patientType,
                visitReason: bookingState.visitReason,
                selectedDate: bookingState.selectedDate,
                selectedSlot: bookingState.selectedSlot,
                error: 'Please enter your name using letters only.',
              },
            };
            setMessages((prev) => [...prev, botMsg]);
            return;
          }

          const phoneVal = validateStrictPhone(phonePart);
          if (!phoneVal.isValid) {
            const errMsg = phoneVal.error || "I didn't catch the full 10-digit phone number. Could you please repeat it?";
            const botMsg: ChatMessage = {
              id: 'bot-' + Date.now(),
              role: 'assistant',
              content: errMsg,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_contact',
                patientType: bookingState.patientType,
                visitReason: bookingState.visitReason,
                selectedDate: bookingState.selectedDate,
                selectedSlot: bookingState.selectedSlot,
                patientName: nameVal.cleaned,
                error: errMsg,
              },
            };
            setMessages((prev) => [...prev, botMsg]);
            setBookingState((prev) => ({ ...prev, contactName: nameVal.cleaned }));
            setInlineContactName(nameVal.cleaned);
            return;
          }

          // Both valid!
          setInlineContactName(nameVal.cleaned);
          setInlineContactPhone(phoneVal.digits);
          if (bookingState.selectedSlot) {
            promptForConfirmationReview({
              slot: bookingState.selectedSlot,
              patientType: bookingState.patientType || 'new',
              visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
              contactName: nameVal.cleaned,
              contactPhone: phoneVal.digits,
              formattedPhone: phoneVal.formatted,
              maskedPhone: phoneVal.formatted,
            });
            return;
          }
        }
      }

      // Case B: We do NOT have contactName yet -> this input is an attempt at full name
      if (!bookingState.contactName) {
        // Strip conversational prefix like "My name is", "I'm", "You can put me down as"
        const candidate = textToSend
          .replace(/^(?:my\s+name\s+is|i\s+am|i'm|im|this\s+is|you\s+can\s+put\s+me\s+down\s+as|put\s+me\s+down\s+as|call\s+me)\s+/i, '')
          .trim();
        const nameVal = validatePatientName(candidate);

        if (!nameVal.isValid) {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: 'Please enter your name using letters only.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_contact',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
              selectedDate: bookingState.selectedDate,
              selectedSlot: bookingState.selectedSlot,
              error: 'Please enter your name using letters only.',
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }

        // Name is accepted!
        const validName = nameVal.cleaned;
        setInlineContactName(validName);

        // Do we already have a 10-digit phone number?
        if (bookingState.contactPhone && bookingState.contactPhone.length === 10 && bookingState.selectedSlot) {
          promptForConfirmationReview({
            slot: bookingState.selectedSlot,
            patientType: bookingState.patientType || 'new',
            visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
            contactName: validName,
            contactPhone: bookingState.contactPhone,
            formattedPhone: formatUSPhone(bookingState.contactPhone),
            maskedPhone: formatUSPhone(bookingState.contactPhone),
          });
          return;
        }

        // Prompt for 10-digit phone number
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Thank you, ${validName}. Please enter your 10-digit phone number:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_contact',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientName: validName,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          contactName: validName,
        }));
        return;
      }

      // Case C: We already have contactName -> user is entering phone number
      const phoneVal = validateStrictPhone(textToSend);
      if (!phoneVal.isValid) {
        const errMsg = phoneVal.error || "I didn't catch the full 10-digit phone number. Could you please repeat it?";
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_contact',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            selectedSlot: bookingState.selectedSlot,
            patientName: bookingState.contactName,
            error: errMsg,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // Phone is exactly 10 digits and valid!
      setInlineContactPhone(phoneVal.digits);
      setBookingState((prev) => ({
        ...prev,
        contactPhone: phoneVal.digits,
        maskedPhone: phoneVal.formatted,
      }));
      if (bookingState.selectedSlot) {
        promptForConfirmationReview({
          slot: bookingState.selectedSlot,
          patientType: bookingState.patientType || 'new',
          visitReason: bookingState.visitReason || 'Routine Checkup & Cleaning',
          contactName: bookingState.contactName,
          contactPhone: phoneVal.digits,
          formattedPhone: phoneVal.formatted,
          maskedPhone: phoneVal.formatted,
        });
        return;
      }
    }

    // 5. In any active booking state, check if the user is specifying or selecting a time slot, date, or relative query
    // e.g. "Do you have anything at 2 PM?", "I'll take 2 PM", "2 PM", "What's available Monday?", "next available", etc.
    const timePref = extractTimePreference(textToSend);
    const datePref = extractDatePreference(textToSend);

    // If relative date query like "next available", "earliest available", "soonest"
    if (isNextAvailableQuery(textToSend) && !datePref) {
      await handleNextAvailableRequest();
      return;
    }

    // If date was mentioned while in booking or generally asking about a date
    if (datePref) {
      await queryAndDisplaySlots(
        datePref.dateStr,
        timePref,
        bookingState.patientType,
        bookingState.visitReason
      );
      return;
    }

    // If a time was requested and we have offered slots (from alternative search or current date)
    if (timePref && bookingState.slots && bookingState.slots.length > 0) {
      const matchingSlot = bookingState.slots.find((s) => {
        if (s.status !== 'available') return false;
        if (timePref.targetTime && s.time.toLowerCase() === timePref.targetTime.toLowerCase()) return true;
        const mins = parseTimeToMinutes(s.time);
        if (timePref.minMinutes !== undefined && timePref.maxMinutes !== undefined) {
          return mins >= timePref.minMinutes && mins <= timePref.maxMinutes;
        }
        return false;
      });

      if (matchingSlot) {
        handleSelectSlot(matchingSlot);
        return;
      }
    }

    // If only a time was requested and we already have a date selected (e.g. "Do you have anything at 2 PM?")
    if (timePref && bookingState.selectedDate) {
      const dur = resolveServiceDuration(bookingState.visitReason);
      const durationSlots = await getDurationAwareAvailableSlots(bookingState.selectedDate, dur, bookingState.isUrgent);
      const slots = durationSlots.map((d) => d.slot);
      const { availableSlots, exactMatch, filteredAvailable } = filterSlotsByPreference(slots, timePref);

      if (exactMatch && exactMatch.status === 'available') {
        promptForContact(exactMatch);
        return;
      } else if (exactMatch && exactMatch.status === 'booked') {
        const availList = availableSlots.map((s) => s.time).join(', ');
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `${exactMatch.time} on ${formatDatePretty(
            bookingState.selectedDate
          )} is currently booked. Here are the available times: ${availList || 'None'}. Which time would you prefer?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'show_slots',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            availableSlots: slots,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      } else if (filteredAvailable.length > 0) {
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Here are the openings matching ${timePref.rawLabel || 'your preference'} on ${formatDatePretty(
            bookingState.selectedDate
          )}:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'show_slots',
            patientType: bookingState.patientType,
            visitReason: bookingState.visitReason,
            selectedDate: bookingState.selectedDate,
            availableSlots: filteredAvailable,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }
    }

    // 6. Handle step-by-step responses if already in progress
    if (bookingState.inProgress) {
      if (bookingState.step === 'ask_patient_type') {
        const pType = extractPatientType(textToSend);
        if (pType) {
          if (bookingState.selectedSlot) {
            if (pType === 'existing') {
              const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
              if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
                setBookingState((prev) => ({
                  ...prev,
                  inProgress: true,
                  patientType: 'existing',
                }));
                await handleLookupExistingPatient(
                  phoneExtracted.e164 || phoneExtracted.digits!,
                  phoneExtracted.country || undefined
                );
                return;
              }
              const nextBotMsgId = 'bot-' + (Date.now() + 1);
              const botMsg: ChatMessage = {
                id: nextBotMsgId,
                role: 'assistant',
                content: `Welcome back! Please enter your 10-digit phone number so I can look up your existing demo patient profile:`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                bookingAction: {
                  step: 'ask_existing_phone',
                  patientType: 'existing',
                  visitReason: bookingState.visitReason,
                  selectedDate: bookingState.selectedSlot?.date,
                  selectedSlot: bookingState.selectedSlot,
                  isUrgent: bookingState.isUrgent,
                },
              };
              setMessages((prev) => [...prev, botMsg]);
              setBookingState((prev) => ({
                ...prev,
                step: 'ask_existing_phone',
                patientType: 'existing',
                activeMessageId: nextBotMsgId,
              }));
              return;
            } else {
              const nextBotMsgId = 'bot-' + (Date.now() + 1);
              const botMsg: ChatMessage = {
                id: nextBotMsgId,
                role: 'assistant',
                content: `Got it, New Patient. To prepare your demo reservation, please enter your full name:`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                bookingAction: {
                  step: 'ask_contact',
                  patientType: 'new',
                  visitReason: bookingState.visitReason,
                  selectedDate: bookingState.selectedSlot?.date,
                  selectedSlot: bookingState.selectedSlot,
                  isUrgent: bookingState.isUrgent,
                },
              };
              setMessages((prev) => [...prev, botMsg]);
              setBookingState((prev) => ({
                ...prev,
                step: 'ask_contact',
                patientType: 'new',
                activeMessageId: nextBotMsgId,
              }));
              return;
            }
          }

          if (pType === 'existing') {
            const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
            if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
              setBookingState((prev) => ({
                ...prev,
                inProgress: true,
                patientType: 'existing',
              }));
              await handleLookupExistingPatient(
                phoneExtracted.e164 || phoneExtracted.digits!,
                phoneExtracted.country || undefined
              );
              return;
            }
            const nextBotMsgId = 'bot-' + (Date.now() + 1);
            const botMsg: ChatMessage = {
              id: nextBotMsgId,
              role: 'assistant',
              content: `Welcome back! Please enter your 10-digit phone number so I can look up your existing demo patient profile:`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_existing_phone',
                patientType: 'existing',
                visitReason: bookingState.visitReason,
              },
            };
            setMessages((prev) => [...prev, botMsg]);
            setBookingState((prev) => ({
              ...prev,
              step: 'ask_existing_phone',
              patientType: 'existing',
              activeMessageId: nextBotMsgId,
            }));
            return;
          }

          const reason = extractVisitReason(textToSend);
          if (reason) {
            const nextBotMsg: ChatMessage = {
              id: 'bot-' + Date.now(),
              role: 'assistant',
              content: `Understood: New Patient for a ${reason}. What date would you prefer? You can select an upcoming day or choose a custom date:`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_date',
                patientType: 'new',
                visitReason: reason,
              },
            };
            setMessages((prev) => [...prev, nextBotMsg]);
            setBookingState((prev) => ({
              ...prev,
              step: 'ask_date',
              patientType: 'new',
              visitReason: reason,
            }));
            return;
          } else {
            const nextBotMsgId = 'bot-' + (Date.now() + 1);
            const botMsg: ChatMessage = {
              id: nextBotMsgId,
              role: 'assistant',
              content: `Got it, New Patient. What type of visit are you looking for? (e.g. Cleaning, Consultation, Dental Pain, Implants)`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_visit_reason',
                patientType: 'new',
              },
            };
            setMessages((prev) => [...prev, botMsg]);
            setBookingState((prev) => ({
              ...prev,
              step: 'ask_visit_reason',
              patientType: 'new',
              activeMessageId: nextBotMsgId,
            }));
            return;
          }
        }
      }

      if (bookingState.step === 'ask_visit_reason') {
        const parsedContact = extractContactDetails(textToSend);
        const reason = extractVisitReason(textToSend);
        const datePref = classified.datePref || extractDatePreference(textToSend);
        const timePref = classified.timePref || extractTimePreference(textToSend);

        if (parsedContact.name || parsedContact.phone?.isValid) {
          setBookingState((prev) => ({
            ...prev,
            contactName: parsedContact.name || prev.contactName,
            contactPhone: parsedContact.phone?.cleaned || prev.contactPhone,
            maskedPhone: parsedContact.phone?.formatted || prev.maskedPhone,
          }));
          if (parsedContact.name) setInlineContactName(parsedContact.name);
          if (parsedContact.phone?.isValid) setInlineContactPhone(parsedContact.phone.cleaned);
        }

        if (reason) {
          if (datePref) {
            await queryAndDisplaySlots(
              datePref.dateStr,
              timePref,
              bookingState.patientType,
              reason
            );
            return;
          }
          handleSelectVisitReason(reason);
          return;
        }

        if (parsedContact.name || parsedContact.phone?.isValid) {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: `Thank you${parsedContact.name ? ', ' + parsedContact.name : ''}! What type of visit would you like to schedule? (e.g. Cleaning, Consultation, Implants, Tooth Pain)`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_visit_reason',
              patientType: bookingState.patientType || 'new',
              patientName: parsedContact.name || bookingState.contactName,
              patientPhone: parsedContact.phone?.cleaned || bookingState.contactPhone,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }

        handleSelectVisitReason(textToSend);
        return;
      }

      if (bookingState.step === 'ask_date') {
        const datePref = classified.datePref || extractDatePreference(textToSend);
        if (datePref) {
          await queryAndDisplaySlots(
            datePref.dateStr,
            classified.timePref || extractTimePreference(textToSend),
            bookingState.patientType || 'new',
            bookingState.visitReason || 'Routine Checkup & Cleaning'
          );
          return;
        }

        const intentStr = classified.primaryIntent as string;
        const isGeneralInquiry =
          intentStr === 'hours' ||
          intentStr === 'pricing' ||
          intentStr === 'insurance' ||
          intentStr === 'doctor_information' ||
          intentStr === 'clinic_information' ||
          intentStr === 'contact' ||
          intentStr === 'financing' ||
          intentStr === 'appointment_cancellation' ||
          classified.isNextAvailable;

        if (!isGeneralInquiry) {
          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            role: 'assistant',
            content: "I didn't catch the date. Could you say it again, for example, 'next Monday'?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_date',
              patientType: bookingState.patientType,
              visitReason: bookingState.visitReason,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }
      }
    }

    // 6.5 Earliest appointment / Next available slot inquiry (TEST H: "What's the earliest appointment?")
    if (classified.isNextAvailable || classified.primaryIntent === 'availability' && classified.isNextAvailable) {
      await handleNextAvailableRequest();
      return;
    }

    // 7. General booking intent check & Natural Multi-Information Extraction from single message
    // (TEST 1, TEST 2, TEST 3, "What's available tomorrow?", "Do you have anything Saturday?", "What appointments do you have next week?")
    const extractedPatientType = classified.patientType || extractPatientType(textToSend);
    const extractedDate = classified.datePref || extractDatePreference(textToSend);
    const isBookingIntent =
      classified.primaryIntent === 'booking' ||
      classified.primaryIntent === 'availability' ||
      lower.includes('appointment') ||
      lower.includes('book') ||
      lower.includes('schedule') ||
      lower.includes('check availability') ||
      lower.includes('available') ||
      lower.includes('availability') ||
      lower.includes('openings') ||
      lower.includes('opening') ||
      lower.includes('anything') ||
      lower.includes('slot') ||
      lower.includes('new patient') ||
      lower.includes('existing patient') ||
      !!extractedPatientType ||
      !!extractedDate;

    if (isBookingIntent) {
      const extractedPatientType = classified.patientType || extractPatientType(textToSend);
      const extractedReason = classified.serviceName || extractVisitReason(textToSend);
      const extractedTime = classified.timePref || extractTimePreference(textToSend);

      // Case A: Date is present (TEST 3, or direct date inquiries like "What's available tomorrow?", or Compound Message TEST J)
      if (extractedDate) {
        const pType = extractedPatientType || bookingState.patientType || 'new';
        const vReason =
          extractedReason ||
          bookingState.visitReason ||
          (lower.includes('cleaning') ? 'Routine Checkup & Cleaning' : 'General Consultation');
        const parsedContact = extractContactDetails(textToSend);

        if (parsedContact.name) {
          setInlineContactName(parsedContact.name);
        }
        if (parsedContact.phone?.isValid) {
          setInlineContactPhone(parsedContact.phone.cleaned);
        }

        if (parsedContact.name || parsedContact.phone?.isValid) {
          setBookingState((prev) => ({
            ...prev,
            contactName: parsedContact.name || prev.contactName,
            contactPhone: parsedContact.phone?.cleaned || prev.contactPhone,
            maskedPhone: parsedContact.phone?.formatted || prev.maskedPhone,
          }));
        }

        // If time preference is also present, find exact match or available slots with duration
        const dur = resolveServiceDuration(vReason);
        const durationSlots = await getDurationAwareAvailableSlots(extractedDate.dateStr, dur, false);
        const slots = durationSlots.map((d) => d.slot);
        const { availableSlots, exactMatch } = filterSlotsByPreference(slots, extractedTime);

        if (exactMatch && exactMatch.status === 'available') {
          // If both name and valid phone are present, jump straight to confirmation review!
          if (parsedContact.name && parsedContact.phone?.isValid) {
            promptForConfirmationReview({
              slot: exactMatch,
              patientType: pType,
              visitReason: vReason,
              contactName: parsedContact.name,
              contactPhone: parsedContact.phone.cleaned,
              formattedPhone: parsedContact.phone.formatted,
              maskedPhone: parsedContact.phone.formatted,
            });
            return;
          }

          // If name is present, greet the user by name and ask ONLY for phone number (TEST J)
          if (parsedContact.name) {
            setBookingState({
              inProgress: true,
              step: 'ask_contact',
              patientType: pType,
              visitReason: vReason,
              selectedDate: extractedDate.dateStr,
              selectedSlot: exactMatch,
              timePreference: extractedTime,
              contactName: parsedContact.name,
              slots: availableSlots,
              isLoadingSlots: false,
              isReservingSlot: false,
            });
            const botMsg: ChatMessage = {
              id: 'bot-' + Date.now(),
              role: 'assistant',
              content: `I found ${exactMatch.time} available on ${formatDatePretty(
                extractedDate.dateStr
              )} for your ${vReason}. To reserve this appointment for ${parsedContact.name}, please enter your 10-digit phone number:`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              bookingAction: {
                step: 'ask_contact',
                patientType: pType,
                visitReason: vReason,
                selectedDate: extractedDate.dateStr,
                selectedSlot: exactMatch,
                patientName: parsedContact.name,
              },
            };
            setMessages((prev) => [...prev, botMsg]);
            return;
          }

          promptForContact(exactMatch, pType, vReason);
          return;
        }

        // If exact match was not found or no specific time requested
        await queryAndDisplaySlots(extractedDate.dateStr, extractedTime, pType, vReason);
        return;
      }

      // Case B: Patient type and visit reason are both present
      if (extractedPatientType && extractedReason) {
        if (extractedPatientType === 'existing') {
          const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
          if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
            setBookingState((prev) => ({
              ...prev,
              inProgress: true,
              patientType: 'existing',
              visitReason: extractedReason || prev.visitReason,
            }));
            await handleLookupExistingPatient(
              phoneExtracted.e164 || phoneExtracted.digits!,
              phoneExtracted.country || undefined
            );
            return;
          }

          const botMsgId = 'bot-' + Date.now();
          const botMsg: ChatMessage = {
            id: botMsgId,
            role: 'assistant',
            content: `Welcome back! Please enter your 10-digit phone number so I can look up your existing demo patient profile:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_existing_phone',
              patientType: 'existing',
              visitReason: extractedReason,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          setBookingState({
            inProgress: true,
            step: 'ask_existing_phone',
            patientType: 'existing',
            visitReason: extractedReason,
            slots: [],
            isLoadingSlots: false,
            isReservingSlot: false,
            activeMessageId: botMsgId,
          });
          return;
        }

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Welcome! As a new patient scheduling a ${extractedReason}, what date would you prefer? You can select an upcoming day or choose a custom date:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_date',
            patientType: 'new',
            visitReason: extractedReason,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState({
          inProgress: true,
          step: 'ask_date',
          patientType: 'new',
          visitReason: extractedReason,
          slots: [],
          isLoadingSlots: false,
          isReservingSlot: false,
        });
        return;
      }

      // Case C: Only patient type is present
      if (extractedPatientType) {
        if (extractedPatientType === 'existing') {
          const phoneExtracted = extractSpokenPhoneNumber(textToSend, phoneCountry);
          if (phoneExtracted.hasPhoneMention && (phoneExtracted.isValid || phoneExtracted.digits)) {
            setBookingState((prev) => ({
              ...prev,
              inProgress: true,
              patientType: 'existing',
            }));
            await handleLookupExistingPatient(
              phoneExtracted.e164 || phoneExtracted.digits!,
              phoneExtracted.country || undefined
            );
            return;
          }

          const nextBotMsgId = 'bot-' + (Date.now() + 1);
          const botMsg: ChatMessage = {
            id: nextBotMsgId,
            role: 'assistant',
            content: `Welcome back! Please enter your 10-digit phone number so I can look up your existing demo patient profile:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bookingAction: {
              step: 'ask_existing_phone',
              patientType: 'existing',
              visitReason: bookingState.visitReason,
            },
          };
          setMessages((prev) => [...prev, botMsg]);
          setBookingState((prev) => ({
            ...prev,
            inProgress: true,
            step: 'ask_existing_phone',
            patientType: 'existing',
            activeMessageId: nextBotMsgId,
          }));
          return;
        }

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `Got it, New Patient. What type of visit are you looking for? (e.g. Cleaning, Consultation, Dental Pain, Implants)`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_visit_reason',
            patientType: 'new',
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState((prev) => ({
          ...prev,
          inProgress: true,
          step: 'ask_visit_reason',
          patientType: 'new',
          slots: [],
          isLoadingSlots: false,
          isReservingSlot: false,
        }));
        return;
      }

      // Case D1: Visit reason is present but patient type is not yet known (TEST C: "Can I book an implant consultation?")
      if (extractedReason) {
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          role: 'assistant',
          content: `I would be glad to help you schedule an appointment for ${extractedReason}! First, are you a new patient or an existing patient?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bookingAction: {
            step: 'ask_patient_type',
            visitReason: extractedReason,
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        setBookingState({
          inProgress: true,
          step: 'ask_patient_type',
          visitReason: extractedReason,
          slots: [],
          isLoadingSlots: false,
          isReservingSlot: false,
        });
        return;
      }

      // Case D: General booking intent (TEST 1: "I want to book an appointment.")
      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content:
          'I would be glad to help you schedule a demo appointment! First, are you a new or existing patient?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bookingAction: {
          step: 'ask_patient_type',
        },
      };
      setMessages((prev) => [...prev, botMsg]);
      setBookingState({
        inProgress: true,
        step: 'ask_patient_type',
        slots: [],
        isLoadingSlots: false,
        isReservingSlot: false,
      });
      return;
    }

    // 8. General conversation & knowledge queries -> Call server-side chat API with local grounded fallback
    setIsLoading(true);
    try {
      const historyPayload = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('model' as const),
          text: m.content,
        }));

      let replyContent = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history: historyPayload,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            replyContent = sanitizePlainText(data.reply);
          }
        }
      } catch (err) {
        console.warn('Backend API chat unreachable, switching to local grounded engine:', err);
      }

      if (!replyContent) {
        replyContent = sanitizePlainText(getLocalConciergeAnswer(textToSend));
      }

      const isEmergencyAlert =
        lower.includes('emergency') ||
        lower.includes('swelling') ||
        lower.includes('breathe') ||
        lower.includes('bleeding') ||
        replyContent.toLowerCase().includes('cannot diagnose') ||
        replyContent.toLowerCase().includes('911');

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEmergencyAlert,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const fallbackReply = sanitizePlainText(getLocalConciergeAnswer(textToSend));
      const fallbackMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Synchronize reference for voice input auto-submit
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content:
          activeConfig.welcomeMessage ||
          branding?.welcomeMessage ||
          "Hi! I'm here to help with appointments, services, clinic information, and general dental questions.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setBookingState({
      inProgress: false,
      step: 'idle',
      slots: [],
      isLoadingSlots: false,
      isReservingSlot: false,
    });
    setInlineContactName('');
    setInlineContactPhone('');
    setInlineContactError(null);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className={`flex flex-col ${
        isWidgetPopup ? 'h-full max-h-full' : 'h-screen max-h-screen'
      } bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden w-full`}
    >
      {/* Header: Suppressed inside widget popup because ReceptionistWidget provides its own dedicated titlebar */}
      {isWidgetPopup ? null : isEmbed ? (
        /* Dedicated Public Compact Embed Header (Zero Admin Portal exposure) */
        <header className="bg-white border-b border-slate-200/80 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 z-20 shadow-2xs">
          <div className="w-full flex items-center justify-between gap-2">
            {/* Brand & Clinic Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-2xs ring-1 ring-slate-900/5 shrink-0 overflow-hidden"
                style={{ backgroundColor: activeConfig.primaryAccentColor || '#2563eb' }}
              >
                {activeConfig.logoUrl ? (
                  <img
                    src={activeConfig.logoUrl}
                    alt={activeConfig.businessName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="font-semibold text-sm sm:text-base tracking-tight text-slate-900 font-['Outfit'] truncate">
                    {activeConfig.businessName || 'Dental Care & Implants'}
                  </h1>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-slate-400" />
                    AIWebTeck Concept Demo
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate">
                  <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    Online • Ready
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="truncate">{activeConfig.receptionistName || 'AI Receptionist'}</span>
                </div>
              </div>
            </div>

            {/* Embed Header Controls: Voice Mode, Phone & New Chat */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Voice Response Toggle Button (Phase 12B) */}
              <button
                type="button"
                id="btn-toggle-voice-embed"
                onClick={handleToggleVoiceResponse}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active:scale-95 border ${
                  isVoiceResponseEnabled
                    ? 'bg-teal-50 hover:bg-teal-100/80 text-teal-800 border-teal-200/90 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80'
                }`}
                title={
                  isVoiceResponseEnabled
                    ? 'Voice responses: ON (receptionist speaks aloud). Tap to turn OFF'
                    : 'Voice responses: OFF. Tap to enable spoken voice responses'
                }
                aria-label={isVoiceResponseEnabled ? 'Disable voice responses' : 'Enable voice responses'}
              >
                {isVoiceResponseEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="text-xs">{isVoiceResponseEnabled ? 'Voice On' : 'Voice Off'}</span>
              </button>

              {isSpeaking && (
                <button
                  type="button"
                  id="btn-stop-speech-embed"
                  onClick={stopSpeaking}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-all cursor-pointer"
                  title="Stop speaking"
                  aria-label="Stop speaking"
                >
                  <Square className="w-3 h-3 text-slate-600 fill-slate-400" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              )}

              <a
                href={`tel:${(activeConfig.phone || CLINIC_INFO.phoneNewPatients).replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors border border-slate-200/80 shadow-2xs"
                title="Call Clinic Direct"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline text-xs">{activeConfig.phone || CLINIC_INFO.phoneNewPatients}</span>
              </a>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors cursor-pointer active:scale-95 border border-slate-200/80 shadow-2xs"
                title="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs">New Chat</span>
              </button>
            </div>
          </div>
        </header>
      ) : (
        /* Standalone Top Application Header */
        <header className="bg-white border-b border-slate-200/80 px-4 py-2.5 sm:px-6 sm:py-3 shrink-0 z-20 shadow-2xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            {/* Brand & Clinic Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-2xs ring-1 ring-slate-900/5 shrink-0 overflow-hidden"
                style={{ backgroundColor: activeConfig.primaryAccentColor || '#2563eb' }}
              >
                {activeConfig.logoUrl ? (
                  <img
                    src={activeConfig.logoUrl}
                    alt={activeConfig.businessName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Bot className="w-4.5 h-4.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-semibold text-sm sm:text-base tracking-tight text-slate-900 font-['Outfit'] truncate">
                    {activeConfig.receptionistName || 'AI Dental Receptionist'}
                  </h1>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-slate-400" />
                    AIWebTeck Concept Demo
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                  <span className="truncate">{activeConfig.businessName || 'Dental Care & Implants of Houston'}</span>
                  <span className="text-slate-300">•</span>
                  <span className="shrink-0">{activeConfig.address ? 'Greenspoint' : '165 Greens Rd'}</span>
                </p>
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Live Status indicator */}
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50/70 border border-teal-200/60 text-teal-800 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                <span>Online • Ready</span>
              </div>

              {/* Clinic Direct Phone */}
              <a
                href={`tel:${(activeConfig.phone || CLINIC_INFO.phoneNewPatients).replace(/[^0-9]/g, '')}`}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-colors shadow-2xs"
                title="Clinic direct phone"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>{activeConfig.phone || CLINIC_INFO.phoneNewPatients}</span>
              </a>

              {/* Voice Response Mode Toggle (Phase 12B) */}
              <button
                type="button"
                id="btn-toggle-voice-standalone"
                onClick={handleToggleVoiceResponse}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active:scale-95 border ${
                  isVoiceResponseEnabled
                    ? 'bg-teal-50 hover:bg-teal-100/80 text-teal-800 border-teal-200/90 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80'
                }`}
                title={
                  isVoiceResponseEnabled
                    ? 'Voice responses: ON (receptionist speaks answers aloud). Tap to turn OFF'
                    : 'Voice responses: OFF. Tap to enable spoken voice responses'
                }
                aria-label={isVoiceResponseEnabled ? 'Disable voice responses' : 'Enable voice responses'}
              >
                {isVoiceResponseEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
                    <span>Voice: On</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Voice: Off</span>
                  </>
                )}
              </button>

              {/* Stop speech button if currently reading aloud */}
              {isSpeaking && (
                <button
                  type="button"
                  id="btn-stop-speech-standalone"
                  onClick={stopSpeaking}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-all cursor-pointer"
                  title="Stop speaking current response"
                  aria-label="Stop speaking"
                >
                  <Square className="w-3 h-3 text-slate-600 fill-slate-400" />
                  <span>Stop</span>
                </button>
              )}

              {/* Admin Dashboard trigger (restricted staff access) */}
              {onOpenAdminDashboard && (
                <button
                  onClick={onOpenAdminDashboard}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                  title="Admin Portal (Restricted staff access)"
                >
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}

              {/* Reset conversation button */}
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Conversation Canvas */}
      <main
        className={`flex-1 flex flex-col min-h-0 overflow-hidden w-full mx-auto ${
          isWidgetPopup ? 'p-0 max-w-none' : isEmbed ? 'p-0 sm:p-2 max-w-4xl' : 'max-w-5xl p-2 sm:p-4 md:p-6'
        }`}
      >
        <div
          className={`flex-1 flex flex-col bg-white ${
            isWidgetPopup
              ? 'rounded-none border-0 shadow-none'
              : isEmbed
              ? 'rounded-none sm:rounded-2xl border-0 sm:border'
              : 'rounded-2xl sm:rounded-3xl border'
          } border-slate-200/90 shadow-xs overflow-hidden min-h-0`}
        >
          {/* Subtle Concept Demo & Safety Disclaimer Bar */}
          {!isWidgetPopup && (
            <div className="bg-slate-50/80 border-b border-slate-200/80 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] text-slate-600 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {isEmbed ? (
                    <>
                      <strong>AIWebTeck Concept Demo:</strong> Live conversational dental booking & inquiry assistant.
                    </>
                  ) : (
                    <>
                      <strong>Concept Demo:</strong> Conversational AI receptionist for Greenspoint patient inquiries & live Firestore booking.
                    </>
                  )}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 shrink-0 hidden sm:block">
                For severe dental emergencies, call 911 immediately.
              </div>
            </div>
          )}

          {/* Scrollable Message Feed */}
          <div className={`flex-1 min-h-0 overflow-y-auto ${isWidgetPopup ? 'p-3 sm:p-4 space-y-3' : 'p-4 sm:p-6 space-y-4'} bg-slate-50/40`}>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div
                      className="w-8 h-8 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs ring-2 ring-blue-500/10 overflow-hidden"
                      style={{ backgroundColor: activeConfig.primaryAccentColor || '#2563eb' }}
                    >
                      {activeConfig.logoUrl ? (
                        <img
                          src={activeConfig.logoUrl}
                          alt={activeConfig.receptionistName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[90%] sm:max-w-[78%] rounded-2xl p-4 text-sm leading-relaxed shadow-xs relative group ${
                      isUser
                        ? 'text-white rounded-tr-xs'
                        : msg.isEmergencyAlert
                        ? 'bg-rose-50 text-slate-900 border border-rose-200 rounded-tl-xs'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
                    }`}
                    style={isUser ? { backgroundColor: activeConfig.primaryAccentColor || '#2563eb' } : undefined}
                  >
                    {/* Emergency Alert Header if detected */}
                    {msg.isEmergencyAlert && !isUser && (
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700 mb-2 pb-1.5 border-b border-rose-200/60">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Clinical Safety Guidance</span>
                      </div>
                    )}

                    <div className="whitespace-pre-line break-words">
                      {msg.id.startsWith('welcome') && messages.length === 1 && !isUser ? (
                        <div className="space-y-3.5">
                          <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-sm sm:text-base text-slate-900 font-['Outfit']">
                              {activeConfig.receptionistName || 'AI Dental Receptionist'}
                            </h2>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                              Ready to Help
                            </span>
                          </div>

                          <p className="text-sm text-slate-700 leading-relaxed">
                            {msg.content || "Hi! I'm here to help with appointments, services, clinic information, and general dental questions."}
                          </p>

                          {/* Verified clinic info snippet */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span className="truncate">165 Greens Rd, Houston, TX 77060</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span className="truncate">Mon–Fri 08:00–19:00 • Sat 08:00–17:00</span>
                            </div>
                          </div>

                          {/* Quick starter suggestions */}
                          <div className="space-y-2 pt-1 border-t border-slate-100">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                              Suggested Actions
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { label: 'Book an Appointment', icon: Calendar, text: 'I want to book an appointment.' },
                                { label: 'View Services', icon: Sparkles, text: 'View Services' },
                                { label: 'I have tooth pain', icon: AlertTriangle, text: 'I have tooth pain' },
                                { label: 'New Patient Cleaning', icon: User, text: "I'm a new patient and need a cleaning next Saturday afternoon." },
                                { label: 'Are you open on Saturdays?', icon: Clock, text: 'Are you open on Saturdays?' },
                              ].map((item, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSendMessage(item.text)}
                                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-800 border border-slate-200/80 hover:border-teal-200/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                                >
                                  <item.icon className="w-3.5 h-3.5 text-teal-600" />
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* INTERACTIVE BOOKING WIDGET IN CHAT */}
                    {msg.bookingAction && (
                      <div className="mt-3 pt-3 border-t border-slate-200/80">
                        {/* Step: Ask Patient Type */}
                        {msg.bookingAction.step === 'ask_patient_type' && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">
                              Please select your patient status:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleSelectPatientType('new')}
                                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200/90 hover:border-teal-600 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-2xs"
                              >
                                <User className="w-3.5 h-3.5" />
                                <span>New Patient</span>
                              </button>
                              <button
                                onClick={() => handleSelectPatientType('existing')}
                                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-200/90 hover:border-slate-800 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-2xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                                <span>Existing Patient</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step: Ask Visit Reason */}
                        {msg.bookingAction.step === 'ask_visit_reason' && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">
                              Choose a visit reason or type your preference:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {COMMON_VISIT_REASONS.map((r) => (
                                <button
                                  key={r}
                                  onClick={() => handleSelectVisitReason(r)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-200/90 hover:border-blue-600 transition-all cursor-pointer active:scale-95 shadow-2xs"
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Step: Ask Date */}
                        {msg.bookingAction.step === 'ask_date' && (
                          <div className="space-y-2.5">
                            <p className="text-xs font-medium text-slate-500">
                              Choose an upcoming demo appointment date:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {getDynamicPresetDates().map((pd) => (
                                <button
                                  key={pd.value}
                                  onClick={() => handleSelectDate(pd.value)}
                                  className="px-3 py-2 rounded-xl text-xs font-medium bg-blue-50/70 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200/80 hover:border-blue-600 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-2xs"
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>{pd.label}</span>
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                              <span>Or pick date:</span>
                              <input
                                type="date"
                                min={getHoustonCurrentDateTime().dateStr}
                                defaultValue={getHoustonCurrentDateTime().dateStr}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleSelectDate(e.target.value);
                                  }
                                }}
                                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                              />
                            </div>
                          </div>
                        )}

                        {/* Step: Show Real Firestore Slots */}
                        {msg.bookingAction.step === 'show_slots' && (
                          <div className="space-y-3">
                            {msg.bookingAction.error && (
                              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>{msg.bookingAction.error}</span>
                              </div>
                            )}

                            {msg.bookingAction.isLoadingSlots ? (
                              <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" />
                                <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]" />
                                <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]" />
                                <span>Querying live Firestore demo slots...</span>
                              </div>
                            ) : msg.bookingAction.availableSlots && msg.bookingAction.availableSlots.length > 0 ? (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                                  <span>Select an available time slot:</span>
                                  <span className="text-[10px] text-slate-400">
                                    Greenspoint Location
                                  </span>
                                </div>
                                {(() => {
                                  const slots = msg.bookingAction.availableSlots;
                                  const slotsByDate: { [dateStr: string]: DemoAppointmentSlot[] } = {};
                                  slots.forEach((s) => {
                                    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
                                    slotsByDate[s.date].push(s);
                                  });
                                  const dateKeys = Object.keys(slotsByDate);
                                  const isMultiDate = dateKeys.length > 1;

                                  const renderSlotButton = (slot: DemoAppointmentSlot) => {
                                    const isBooked = slot.status === 'booked';
                                    const isUrgent = slot.type === 'urgent';
                                    return (
                                      <button
                                        key={slot.id}
                                        onClick={() => handleSelectSlot(slot)}
                                        disabled={isBooked || bookingState.isReservingSlot}
                                        className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                                          isBooked
                                            ? 'bg-slate-50 text-slate-400 border border-slate-200/80 cursor-not-allowed line-through opacity-60'
                                            : isUrgent
                                            ? 'bg-amber-50/70 hover:bg-amber-600 text-amber-900 hover:text-white border border-amber-200 hover:border-amber-600 shadow-2xs font-medium cursor-pointer active:scale-95'
                                            : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 shadow-2xs font-medium cursor-pointer active:scale-95'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                                          <span>{slot.time}</span>
                                        </div>
                                        {isBooked ? (
                                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 no-underline">
                                            Booked
                                          </span>
                                        ) : isUrgent ? (
                                          <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 no-underline">
                                            Urgent
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  };

                                  if (!isMultiDate) {
                                    return (
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {slots.map((slot) => renderSlotButton(slot))}
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="space-y-3">
                                      {dateKeys.map((dateKey) => (
                                        <div key={dateKey} className="space-y-1.5">
                                          <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 pt-0.5">
                                            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                            <span>{formatDatePretty(dateKey)}</span>
                                          </div>
                                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {slotsByDate[dateKey].map((slot) => renderSlotButton(slot))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}

                                <div className="flex items-center justify-between pt-1">
                                  <button
                                    onClick={() => {
                                      setBookingState((prev) => ({ ...prev, step: 'ask_date' }));
                                      const dateMsgId = 'bot-' + Date.now();
                                      setMessages((prev) => [
                                        ...prev,
                                        {
                                          id: dateMsgId,
                                          role: 'assistant',
                                          content: 'Please choose an alternate date to check available appointments:',
                                          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                          bookingAction: {
                                            step: 'ask_date',
                                            patientType: bookingState.patientType,
                                            visitReason: bookingState.visitReason,
                                          },
                                        },
                                      ]);
                                    }}
                                    className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer py-1"
                                  >
                                    <Calendar className="w-3 h-3" />
                                    <span>Check a different date</span>
                                  </button>
                                </div>

                                {msg.bookingAction.isUrgent && msg.bookingAction.selectedSlot && (
                                  <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <button
                                      onClick={() => handleSelectSlot(msg.bookingAction!.selectedSlot!)}
                                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Yes, Book {msg.bookingAction.selectedSlot.time}</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setBookingState((prev) => ({ ...prev, step: 'ask_date' }));
                                        const dateMsgId = 'bot-' + Date.now();
                                        setMessages((prev) => [
                                          ...prev,
                                          {
                                            id: dateMsgId,
                                            role: 'assistant',
                                            content: 'Please choose an alternate date to check available appointments:',
                                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                            bookingAction: {
                                              step: 'ask_date',
                                              patientType: bookingState.patientType,
                                              visitReason: bookingState.visitReason,
                                            },
                                          },
                                        ]);
                                      }}
                                      className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                                    >
                                      Check Other Dates
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 py-1">
                                No available slots for this date. Please choose another date above.
                              </div>
                            )}
                          </div>
                        )}

                        {/* Step: Ask Existing Patient Phone */}
                        {msg.bookingAction.step === 'ask_existing_phone' && (
                          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                            <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                <span>Existing Patient Verification (Demo Lookup)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPhoneCountry('US')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                                    phoneCountry === 'US'
                                      ? 'bg-blue-600 text-white shadow-2xs'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  🇺🇸 US (+1)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPhoneCountry('IN')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                                    phoneCountry === 'IN'
                                      ? 'bg-blue-600 text-white shadow-2xs'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  🇮🇳 India (+91)
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-slate-600">
                              Please enter the phone number associated with your patient profile so I can look up your record:
                            </p>

                            {(inlineExistingPhoneError || msg.bookingAction.error) && (
                              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>{inlineExistingPhoneError || msg.bookingAction.error}</span>
                              </div>
                            )}

                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleLookupExistingPatient(inlineExistingPhone);
                              }}
                              className="space-y-2"
                            >
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Phone Number <span className="text-slate-400 font-normal">({phoneCountry === 'IN' ? '10 digits or with +91' : '10 digits or with +1'})</span>
                                </label>
                                <input
                                  ref={existingPhoneInputRef}
                                  type="tel"
                                  inputMode="tel"
                                  maxLength={18}
                                  placeholder={phoneCountry === 'IN' ? 'e.g. +91 98765 43210 or 9876543210' : 'e.g. (281) 555-1234 or 2815551234'}
                                  autoFocus
                                  value={inlineExistingPhone}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.startsWith('+91') || val.startsWith('91 ') || val.startsWith('91-')) {
                                      if (phoneCountry !== 'IN') setPhoneCountry('IN');
                                    } else if (val.startsWith('+1') || val.startsWith('1 ') || val.startsWith('1-')) {
                                      if (phoneCountry !== 'US') setPhoneCountry('US');
                                    }
                                    const cleaned = val.replace(/[^0-9+\s()\-.]/g, '');
                                    if (val !== cleaned) {
                                      setInlineExistingPhoneError('Please enter numbers and phone formatting only.');
                                    } else if (inlineExistingPhoneError === 'Please enter numbers and phone formatting only.') {
                                      setInlineExistingPhoneError(null);
                                    }
                                    setInlineExistingPhone(cleaned);
                                  }}
                                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-blue-600 text-slate-800 font-mono"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="submit"
                                  disabled={isLookingUpPatient || inlineExistingPhone.trim().length === 0}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                                >
                                  {isLookingUpPatient ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      <span>Verifying Profile...</span>
                                    </>
                                  ) : (
                                    <span>Look Up Profile</span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectPatientType('new')}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                >
                                  Continue as New Patient
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelBooking()}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>

                            {/* Demo Patient Fast-Fill Chips */}
                            <div className="pt-2 border-t border-slate-200/70">
                              <p className="text-[10px] text-slate-500 mb-1.5 font-medium">
                                Quick demo test accounts:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { name: 'John Smith', phone: '+12815551234', label: 'US: (281) 555-1234' },
                                  { name: 'Sarah Jenkins', phone: '+12815555678', label: 'US: (281) 555-5678' },
                                  { name: 'Rajesh Sharma', phone: '+919876543210', label: 'IN: +91 98765 43210' },
                                  { name: 'Michael Chang', phone: '+17135551234', label: 'US: (713) 555-1234' },
                                ].map((p) => (
                                  <button
                                    key={p.phone}
                                    type="button"
                                    onClick={() => {
                                      setInlineExistingPhone(p.phone);
                                      setInlineExistingPhoneError(null);
                                      if (p.phone.startsWith('+91')) {
                                        setPhoneCountry('IN');
                                      } else if (p.phone.startsWith('+1')) {
                                        setPhoneCountry('US');
                                      }
                                      handleLookupExistingPatient(p.phone);
                                    }}
                                    className="px-2 py-1 text-[10px] rounded-md bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 cursor-pointer font-medium"
                                  >
                                    {p.name} ({p.label})
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Step: Ask Phone Country Ambiguity Resolution */}
                        {msg.bookingAction.step === 'ask_phone_country' && (
                          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-blue-600" />
                              <span>Select Country for Phone Verification</span>
                            </div>

                            <p className="text-xs text-slate-600">
                              Please select whether your phone number ({msg.bookingAction.patientPhone || bookingState.contactPhone}) is registered in India (+91) or the United States (+1):
                            </p>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setPhoneCountry('IN');
                                  handleLookupExistingPatient(msg.bookingAction!.patientPhone || bookingState.contactPhone!, 'IN');
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                              >
                                <span>🇮🇳 India (+91)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPhoneCountry('US');
                                  handleLookupExistingPatient(msg.bookingAction!.patientPhone || bookingState.contactPhone!, 'US');
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                              >
                                <span>🇺🇸 United States (+1)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelBooking()}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step: Patient Lookup Failed Fallback */}
                        {msg.bookingAction.step === 'patient_lookup_failed' && (
                          <div className="space-y-3 bg-amber-50/80 p-3.5 rounded-xl border border-amber-200">
                            <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Patient Profile Not Found</span>
                            </div>

                            <p className="text-xs text-amber-900 leading-relaxed">
                              I could not find an existing demo patient profile with that phone number. If this is your first visit, or you would like to register, you can easily continue as a new patient:
                            </p>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleSelectPatientType('new')}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                              >
                                <User className="w-3.5 h-3.5" />
                                <span>Continue as New Patient</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTryAnotherNumber(true)}
                                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-all cursor-pointer active:scale-95"
                              >
                                Try Another Number
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelBooking()}
                                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium transition-all cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step: Ask Contact Details */}
                        {msg.bookingAction.step === 'ask_contact' && (
                          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-blue-600" />
                              <span>Patient Contact Information (Demo Only)</span>
                            </div>

                            {inlineContactError && (
                              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>{inlineContactError}</span>
                              </div>
                            )}

                            <form onSubmit={handleSubmitInlineContact} className="space-y-2">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Full Name <span className="text-slate-400 font-normal">(letters only)</span>
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Sarah Johnson"
                                  value={inlineContactName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const filtered = val.replace(/[^a-zA-Z\s]/g, '');
                                    if (val !== filtered) {
                                      setInlineContactError('Please enter your name using letters only.');
                                    } else if (inlineContactError === 'Please enter your name using letters only.') {
                                      setInlineContactError(null);
                                    }
                                    setInlineContactName(filtered);
                                  }}
                                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-blue-600 text-slate-800"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Phone Number <span className="text-slate-400 font-normal">({phoneCountry === 'IN' ? 'India +91 or 10 digits' : 'US +1 or 10 digits'})</span>
                                </label>
                                <input
                                  type="tel"
                                  inputMode="tel"
                                  maxLength={18}
                                  placeholder={phoneCountry === 'IN' ? 'e.g. +91 98765 43210 or 9876543210' : 'e.g. (281) 555-1234 or 2815551234'}
                                  value={inlineContactPhone}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.startsWith('+91') || val.startsWith('91 ') || val.startsWith('91-')) {
                                      if (phoneCountry !== 'IN') setPhoneCountry('IN');
                                    } else if (val.startsWith('+1') || val.startsWith('1 ') || val.startsWith('1-')) {
                                      if (phoneCountry !== 'US') setPhoneCountry('US');
                                    }
                                    const cleaned = val.replace(/[^0-9+\s()\-.]/g, '');
                                    if (val !== cleaned) {
                                      setInlineContactError('Please enter numbers and phone formatting only.');
                                    } else if (inlineContactError === 'Please enter numbers and phone formatting only.') {
                                      setInlineContactError(null);
                                    }
                                    setInlineContactPhone(cleaned);
                                  }}
                                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-blue-600 text-slate-800 font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="submit"
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
                                >
                                  Continue to Review
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelBooking()}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                            <p className="text-[10px] text-slate-400">
                              Minimum contact info only. No SSN, insurance ID, or payment required.
                            </p>
                          </div>
                        )}

                        {/* Step: Booking Review Confirmation */}
                        {msg.bookingAction.step === 'review_confirmation' &&
                          msg.bookingAction.selectedSlot && (
                            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 text-slate-900 space-y-3.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                                  Booking Review
                                </span>
                                <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200/80 font-medium px-2 py-0.5 rounded-full">
                                  Awaiting Confirmation
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Patient
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {bookingState.patientType === 'new' ? 'New Patient' : 'Existing Patient'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Name
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {msg.bookingAction.patientName || bookingState.contactName || 'Patient'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Phone
                                  </span>
                                  <span className="font-medium text-slate-800 font-mono">
                                    {formatUSPhone(msg.bookingAction.patientPhone || bookingState.contactPhone || '') || '(281) 946-2569'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Reason
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {msg.bookingAction.visitReason || bookingState.visitReason || 'Cleaning'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Date
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {formatDatePretty(msg.bookingAction.selectedSlot.date)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Time
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {msg.bookingAction.duration && msg.bookingAction.duration > 30 && msg.bookingAction.endTime
                                      ? `${msg.bookingAction.selectedSlot.time} - ${msg.bookingAction.endTime} (${msg.bookingAction.duration} min)`
                                      : msg.bookingAction.selectedSlot.time}
                                  </span>
                                </div>
                                <div className="sm:col-span-2 pt-1 border-t border-slate-100">
                                  <span className="text-slate-400 block text-[10px] uppercase font-medium">
                                    Appointment Type
                                  </span>
                                  <span className={`font-medium ${msg.bookingAction.isUrgent || msg.bookingAction.selectedSlot.type === 'urgent' ? 'text-amber-800' : 'text-slate-800'}`}>
                                    {msg.bookingAction.isUrgent || msg.bookingAction.selectedSlot.type === 'urgent' ? 'Urgent Dental Care' : 'Standard Visit'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  onClick={() =>
                                    executeReservation(msg.bookingAction!.selectedSlot!)
                                  }
                                  disabled={bookingState.isReservingSlot}
                                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                >
                                  {bookingState.isReservingSlot ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      <span>Reserving in Firestore...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Confirm Booking</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleChangeDetailsPrompt()}
                                  disabled={bookingState.isReservingSlot}
                                  className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                >
                                  <Edit3 className="w-3 h-3 text-slate-500" />
                                  <span>Change Details</span>
                                </button>
                                <button
                                  onClick={() => handleCancelBooking()}
                                  disabled={bookingState.isReservingSlot}
                                  className="px-3 py-2 text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                        {/* Step: Change Details Options */}
                        {msg.bookingAction.step === 'change_details_options' && (
                          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 space-y-2.5">
                            <div className="text-xs font-semibold text-slate-700">
                              What would you like to update?
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                onClick={() => promptForDate(bookingState.patientType, bookingState.visitReason)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Change Date
                              </button>
                              <button
                                onClick={() =>
                                  queryAndDisplaySlots(
                                    msg.bookingAction?.selectedSlot?.date ||
                                      bookingState.selectedDate ||
                                      getHoustonCurrentDateTime().dateStr
                                  )
                                }
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Change Time
                              </button>
                              <button
                                onClick={() => promptForVisitReason(bookingState.patientType)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Change Reason
                              </button>
                              <button
                                onClick={() => {
                                  if (msg.bookingAction?.selectedSlot) {
                                    promptForContact(msg.bookingAction.selectedSlot);
                                  } else if (bookingState.selectedSlot) {
                                    promptForContact(bookingState.selectedSlot);
                                  }
                                }}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Change Contact Details
                              </button>
                              <button
                                onClick={() => handleCancelBooking()}
                                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step: Confirmed Ticket */}
                        {msg.bookingAction.step === 'confirmed' && msg.bookingAction.selectedSlot && (
                          <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 space-y-2.5">
                            <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Demo Reservation Confirmed</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white/70 p-3 rounded-xl border border-emerald-200/60">
                              <div>
                                <span className="text-slate-500 block text-[10px]">Date & Time</span>
                                <span className="font-semibold text-slate-800">
                                  {formatDatePretty(msg.bookingAction.selectedSlot.date)} at{' '}
                                  {msg.bookingAction.selectedSlot.time}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">Visit Reason</span>
                                <span className="font-semibold text-slate-800">
                                  {msg.bookingAction.visitReason || bookingState.visitReason || 'Cleaning'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">Patient</span>
                                <span className="font-semibold text-slate-800">
                                  {msg.bookingAction.patientName || bookingState.contactName || 'Guest Patient'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">Category</span>
                                <span className={`font-semibold ${msg.bookingAction.isUrgent || msg.bookingAction.selectedSlot?.type === 'urgent' ? 'text-rose-700' : 'text-slate-800'}`}>
                                  {msg.bookingAction.isUrgent || msg.bookingAction.selectedSlot?.type === 'urgent' ? 'Urgent Priority Care' : 'Standard Appointment'}
                                </span>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between gap-2 text-[11px] text-emerald-900">
                              <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                <span>Confirmation notification prepared</span>
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-900 leading-normal">
                              <strong>AIWebTeck Concept Demo Note:</strong> This slot is reserved in Firestore with double-booking protection. To schedule an official clinical appointment, call (281) 946-2569.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Timestamp & Action Tools (Speak & Copy) */}
                    <div
                      className={`flex items-center justify-between gap-2 mt-2 pt-1.5 text-[10px] ${
                        isUser ? 'text-blue-100/80' : 'text-slate-400'
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                      {!isUser && (
                        <div className="flex items-center gap-2.5">
                          {/* Speak / Stop Button for this specific message */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isSpeaking && currentlySpeakingMessageId === msg.id) {
                                stopSpeaking();
                              } else {
                                speakResponse(msg.content, msg.id);
                              }
                            }}
                            className={`flex items-center gap-1 transition-opacity cursor-pointer ${
                              isSpeaking && currentlySpeakingMessageId === msg.id
                                ? 'text-teal-700 font-semibold opacity-100'
                                : 'opacity-70 group-hover:opacity-100 hover:text-blue-600'
                            }`}
                            title={
                              isSpeaking && currentlySpeakingMessageId === msg.id
                                ? 'Stop speaking this response'
                                : 'Read response aloud (Text-to-Speech)'
                            }
                            aria-label={
                              isSpeaking && currentlySpeakingMessageId === msg.id
                                ? 'Stop speaking'
                                : 'Read response aloud'
                            }
                          >
                            {isSpeaking && currentlySpeakingMessageId === msg.id ? (
                              <>
                                <Square className="w-3 h-3 text-teal-600 fill-teal-600/40" />
                                <span className="text-teal-700 font-semibold">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3" />
                                <span>Speak</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, msg.id)}
                            className="opacity-70 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:text-slate-600 cursor-pointer"
                            title="Copy text"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking state bubble */}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs p-4 shadow-xs flex items-center gap-2 text-slate-600 text-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]" />
                  <span className="ml-1 font-medium text-slate-700">AI Receptionist typing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Conversation Starters */}
          <div className="px-3 sm:px-4 py-2 bg-slate-50/90 border-t border-slate-200/70 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0 mr-1">
                Suggested:
              </span>
              {[
                'View Services',
                'I have tooth pain',
                'I want to book an appointment.',
                "I'm a new patient and need a cleaning next Saturday afternoon.",
                'Do you have anything at 2 PM?',
                'Are you open on Saturdays?',
              ].map((starter, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(starter)}
                  disabled={isLoading}
                  className="whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-800 border border-slate-200/90 hover:border-teal-200 transition-colors shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Input & Voice Response Active Banners / Status Notices (Phase 12A & 12B) */}
          {(isListening || voiceNotice || voiceError || voicePermissionDenied || isSpeaking || voiceResponseError) && (
            <div className="px-3 sm:px-4 py-2 bg-slate-50 border-t border-slate-200/80 shrink-0 space-y-1.5">
              {/* Active Voice Response (Speaking) Indicator (Phase 12B) */}
              {isSpeaking && (
                <div
                  id="voice-speaking-indicator"
                  className="bg-sky-50/80 border border-sky-200/80 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-xs text-slate-800 shadow-2xs animate-in fade-in duration-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-600"></span>
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800 text-[12px]">
                        <Volume2 className="w-3.5 h-3.5 text-sky-600 animate-pulse shrink-0" />
                        <span>Receptionist is speaking response...</span>
                        <span className="text-[10px] bg-sky-100 text-sky-800 font-medium px-1.5 py-0.5 rounded">Speaking</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        Voice playback in progress. Tap Stop anytime to silence.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 font-medium text-xs transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
                    title="Stop speaking response"
                    aria-label="Stop speaking"
                  >
                    <Square className="w-3 h-3 text-slate-500 fill-slate-400" />
                    <span>Stop Speech</span>
                  </button>
                </div>
              )}

              {/* Voice Response Error / Unsupported Notice (Phase 12B) */}
              {voiceResponseError && (
                <div
                  id="voice-response-error"
                  className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-amber-900 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="leading-snug">{voiceResponseError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearVoiceResponseError}
                    className="p-1 text-amber-600 hover:text-amber-800 rounded hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Active Listening Indicator */}
              {isListening && (
                <div
                  id="voice-listening-indicator"
                  className="bg-teal-50/70 border border-teal-200/80 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-xs text-slate-800 shadow-2xs animate-in fade-in duration-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-600"></span>
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800 text-[12px]">
                        <span>Receptionist is listening...</span>
                        <span className="text-[10px] bg-teal-100/90 text-teal-800 font-medium px-1.5 py-0.5 rounded">Listening</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5 italic">
                        {voiceInterim || voiceTranscript || 'Speak your request now (e.g. "Are you open today?", "I need a cleaning")...'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={stopListening}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                      title="Done speaking"
                      aria-label="Done speaking"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sample Voice Simulation Chips for Testing & Non-Mic Headless/Test Environments */}
              {isListening && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] text-slate-500">
                  <span className="shrink-0 font-medium text-[10px] text-slate-400">Quick Test:</span>
                  {[
                    'Are you open today?',
                    'I need a cleaning.',
                    'Do you have anything tomorrow afternoon?',
                    'I want to book an appointment.',
                  ].map((phrase, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => simulateVoiceText(phrase)}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 hover:border-teal-200 text-[10px] transition-colors whitespace-nowrap cursor-pointer shrink-0"
                      title={`Simulate speaking: "${phrase}"`}
                    >
                      "{phrase}"
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => simulatePermissionDenied()}
                    className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap cursor-pointer shrink-0"
                    title="Simulate permission denial for testing"
                  >
                    Test Denial
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateRecognitionFailure('Simulated audio capture error for testing.')}
                    className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer shrink-0"
                    title="Simulate recognition failure for testing"
                  >
                    Test Error
                  </button>
                </div>
              )}

              {/* Permission Denied Notice */}
              {!isListening && voicePermissionDenied && (
                <div
                  id="voice-permission-error"
                  className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-amber-900 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="leading-snug">
                      <strong>Microphone access required:</strong> Microphone permissions are needed for voice input. Please enable microphone access in your browser to speak with the receptionist. Text chat remains fully available!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearVoiceError}
                    className="p-1 text-amber-600 hover:text-amber-800 rounded hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* General Speech Error Notice */}
              {!isListening && !voicePermissionDenied && voiceError && (
                <div
                  id="voice-general-error"
                  className="bg-slate-100 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-slate-700 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="leading-snug">
                      {voiceError}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearVoiceError}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Voice Input Recognized / Stopped Notice */}
              {!isListening && !voiceError && !voicePermissionDenied && voiceNotice && (
                <div
                  id="voice-success-notice"
                  className="bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-slate-700 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                      <span className="inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                    </span>
                    <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200/60 font-medium px-1.5 py-0.5 rounded shrink-0">Stopped</span>
                    <span className="truncate">{voiceNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceNotice(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                    aria-label="Dismiss notice"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 sm:p-4 bg-white border-t border-slate-200/80 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (voiceNotice) setVoiceNotice(null);
                if (voiceError) clearVoiceError();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                isListening
                  ? 'Listening to your voice... Speak now'
                  : bookingState.step === 'ask_contact'
                  ? 'Enter your name and phone number (e.g. Sarah Johnson, 281-946-2569)...'
                  : bookingState.step === 'review_confirmation'
                  ? "Type 'Confirm' to book, or tell me what to change..."
                  : bookingState.step === 'change_details_options'
                  ? 'What would you like to change? (Date, time, reason, or contact details)...'
                  : 'Type a message or tap the mic to speak...'
              }
              className={`flex-1 bg-slate-50 border rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all shadow-inner ${
                isListening ? 'border-teal-400 ring-2 ring-teal-100 bg-teal-50/20' : 'border-slate-200'
              }`}
              disabled={isLoading}
            />

            {/* Voice Input Microphone Button */}
            <button
              id="btn-voice-microphone"
              type="button"
              onClick={handleToggleVoice}
              disabled={isLoading}
              className={`${
                isWidgetPopup ? 'p-2 min-w-[38px] min-h-[38px]' : 'p-2.5 sm:p-3 min-w-[42px] min-h-[42px]'
              } rounded-xl font-medium transition-all shrink-0 cursor-pointer flex items-center justify-center relative touch-manipulation ${
                isListening
                  ? 'bg-teal-600 hover:bg-teal-700 text-white ring-2 ring-teal-200 shadow-xs'
                  : 'bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 active:scale-95 border border-slate-200/80'
              }`}
              title={isListening ? 'Listening... Tap to stop speaking' : 'Speak to receptionist (Voice input)'}
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            >
              {isListening ? (
                <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              ) : (
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 hover:text-teal-700 transition-colors" />
              )}
              {isListening && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2" aria-hidden="true">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400"></span>
                </span>
              )}
            </button>

            {/* Voice Response Speaker Toggle Button (Phase 12B) */}
            <button
              id="btn-voice-response-toggle"
              type="button"
              onClick={handleToggleVoiceResponse}
              disabled={isLoading}
              className={`${
                isWidgetPopup ? 'p-2 min-w-[38px] min-h-[38px]' : 'p-2.5 sm:p-3 min-w-[42px] min-h-[42px]'
              } rounded-xl font-semibold transition-all shrink-0 cursor-pointer flex items-center justify-center relative touch-manipulation ${
                isVoiceResponseEnabled
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs active:scale-95 ring-2 ring-teal-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 border border-slate-200/80'
              }`}
              title={
                isVoiceResponseEnabled
                  ? 'Voice response: ON (Receptionist reads answers aloud). Tap to mute'
                  : 'Voice response: OFF. Tap to enable spoken receptionist responses'
              }
              aria-label={isVoiceResponseEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            >
              {isVoiceResponseEnabled ? (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 hover:text-teal-600 transition-colors" />
              )}
            </button>

            {/* Send Button */}
            <button
              id="btn-send-message"
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white ${
                isWidgetPopup
                  ? 'px-3 py-2 text-xs min-w-[58px]'
                  : 'px-3 sm:px-5 py-2.5 sm:py-3 text-sm min-w-[65px] sm:min-w-[80px]'
              } rounded-xl font-semibold transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer`}
              style={input.trim() && !isLoading && activeConfig.primaryAccentColor ? { backgroundColor: activeConfig.primaryAccentColor } : undefined}
              title="Send message"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Bottom Footnote Strip */}
          {!isWidgetPopup && (
            <div className="bg-slate-100/70 px-3 sm:px-4 py-1.5 sm:py-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-500 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 truncate">
                <span className="truncate">{activeConfig.address || 'Greenspoint: 165 Greens Rd, Houston, TX'}</span>
                <span className="hidden md:inline text-slate-300">|</span>
                <span className="hidden md:inline">
                  Mon–Fri: 08:00–19:00, Sat: 08:00–17:00
                </span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {isEmbed
                  ? 'AIWebTeck Concept Demo • Not officially endorsed by Dental Care & Implants'
                  : 'AIWebTeck Embeddable Receptionist Architecture Demo'}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

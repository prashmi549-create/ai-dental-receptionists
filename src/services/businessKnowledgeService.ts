/**
 * Phase 11D: Business Knowledge & FAQ Configuration Service
 * Dental Care & Implants of Houston / Configurable Business Knowledge
 *
 * Manages:
 * - Customer-facing services (name, description, durationMinutes, active, pricing)
 * - Customer FAQs (question, answer, active, category)
 * - Business Policies (cancellation, appointment, new patient, payment, other)
 * - Optional Pricing notice, Financing info, Insurance info, Additional clinic info
 * - Real-time synchronization & subscription for receptionist & widget
 * - Protected Firestore persistence under settings/knowledge
 * - Client-side safe fallbacks to verified Dental Care & Implants demo defaults
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BusinessKnowledgeConfig,
  BusinessKnowledgeServiceItem,
  BusinessKnowledgeFAQItem,
  DEFAULT_BUSINESS_KNOWLEDGE,
} from '../types';

export const SETTINGS_COLLECTION = 'settings';
export const KNOWLEDGE_CONFIG_DOC_ID = 'knowledge';

let cachedBusinessKnowledge: BusinessKnowledgeConfig = { ...DEFAULT_BUSINESS_KNOWLEDGE };
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Returns the currently cached business knowledge synchronously.
 * Always returns a valid BusinessKnowledgeConfig with demo fallback.
 */
export function getLoadedBusinessKnowledge(): BusinessKnowledgeConfig {
  return cachedBusinessKnowledge;
}

/**
 * Normalizes raw Firestore document data, guaranteeing all arrays and policy fields are safe.
 */
export function normalizeBusinessKnowledge(rawData?: any): BusinessKnowledgeConfig {
  if (!rawData || typeof rawData !== 'object') {
    return { ...DEFAULT_BUSINESS_KNOWLEDGE };
  }

  // Normalize services
  const rawServices = Array.isArray(rawData.services) ? rawData.services : DEFAULT_BUSINESS_KNOWLEDGE.services;
  const services: BusinessKnowledgeServiceItem[] = rawServices
    .filter((s: any) => s && typeof s === 'object' && typeof s.name === 'string' && s.name.trim())
    .map((s: any, idx: number) => ({
      id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `service-${idx}-${Date.now()}`,
      name: String(s.name).trim(),
      description: typeof s.description === 'string' ? s.description.trim() : '',
      durationMinutes: typeof s.durationMinutes === 'number' && s.durationMinutes > 0 ? s.durationMinutes : undefined,
      active: s.active !== false,
      category: typeof s.category === 'string' ? s.category.trim() : undefined,
      priceText: typeof s.priceText === 'string' ? s.priceText.trim() : '',
    }));

  // Normalize FAQs
  const rawFaqs = Array.isArray(rawData.faqs) ? rawData.faqs : DEFAULT_BUSINESS_KNOWLEDGE.faqs;
  const faqs: BusinessKnowledgeFAQItem[] = rawFaqs
    .filter((f: any) => f && typeof f === 'object' && typeof f.question === 'string' && f.question.trim())
    .map((f: any, idx: number) => ({
      id: typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `faq-${idx}-${Date.now()}`,
      question: String(f.question).trim(),
      answer: typeof f.answer === 'string' ? f.answer.trim() : '',
      active: f.active !== false,
      category: typeof f.category === 'string' ? f.category.trim() : undefined,
      keywords: Array.isArray(f.keywords)
        ? f.keywords.filter((k: any) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
        : undefined,
    }));

  // Normalize policies
  const rawPolicies = rawData.policies && typeof rawData.policies === 'object' ? rawData.policies : {};
  const defaultPolicies = DEFAULT_BUSINESS_KNOWLEDGE.policies;
  const policies = {
    cancellationPolicy: typeof rawPolicies.cancellationPolicy === 'string'
      ? rawPolicies.cancellationPolicy.trim()
      : defaultPolicies.cancellationPolicy,
    appointmentPolicy: typeof rawPolicies.appointmentPolicy === 'string'
      ? rawPolicies.appointmentPolicy.trim()
      : defaultPolicies.appointmentPolicy,
    arrivalPolicy: typeof rawPolicies.arrivalPolicy === 'string'
      ? rawPolicies.arrivalPolicy.trim()
      : (typeof rawPolicies.appointmentPolicy === 'string' ? rawPolicies.appointmentPolicy.trim() : defaultPolicies.appointmentPolicy),
    newPatientInfo: typeof rawPolicies.newPatientInfo === 'string'
      ? rawPolicies.newPatientInfo.trim()
      : defaultPolicies.newPatientInfo,
    newPatientPolicy: typeof rawPolicies.newPatientPolicy === 'string'
      ? rawPolicies.newPatientPolicy.trim()
      : (typeof rawPolicies.newPatientInfo === 'string' ? rawPolicies.newPatientInfo.trim() : defaultPolicies.newPatientInfo),
    paymentPolicy: typeof rawPolicies.paymentPolicy === 'string'
      ? rawPolicies.paymentPolicy.trim()
      : defaultPolicies.paymentPolicy,
    otherPolicies: typeof rawPolicies.otherPolicies === 'string'
      ? rawPolicies.otherPolicies.trim()
      : defaultPolicies.otherPolicies,
    generalPolicies: typeof rawPolicies.generalPolicies === 'string'
      ? rawPolicies.generalPolicies.trim()
      : (typeof rawPolicies.otherPolicies === 'string' ? rawPolicies.otherPolicies.trim() : defaultPolicies.otherPolicies),
  };

  const pricing = rawData.pricing && typeof rawData.pricing === 'object'
    ? {
        pricingNotes: typeof rawData.pricing.pricingNotes === 'string' ? rawData.pricing.pricingNotes.trim() : '',
      }
    : undefined;

  const financing = rawData.financing && typeof rawData.financing === 'object'
    ? {
        financingPartners: Array.isArray(rawData.financing.financingPartners) ? rawData.financing.financingPartners : [],
        financingNotes: typeof rawData.financing.financingNotes === 'string' ? rawData.financing.financingNotes.trim() : '',
        insuranceAcceptedNotes: typeof rawData.financing.insuranceAcceptedNotes === 'string' ? rawData.financing.insuranceAcceptedNotes.trim() : '',
        outOfNetworkPolicy: typeof rawData.financing.outOfNetworkPolicy === 'string' ? rawData.financing.outOfNetworkPolicy.trim() : '',
      }
    : undefined;

  const additionalInfo = rawData.additionalInfo && typeof rawData.additionalInfo === 'object'
    ? {
        languagesSpoken: Array.isArray(rawData.additionalInfo.languagesSpoken) ? rawData.additionalInfo.languagesSpoken : [],
        parkingDirections: typeof rawData.additionalInfo.parkingDirections === 'string' ? rawData.additionalInfo.parkingDirections.trim() : '',
        doctorBios: typeof rawData.additionalInfo.doctorBios === 'string' ? rawData.additionalInfo.doctorBios.trim() : '',
        additionalNotes: typeof rawData.additionalInfo.additionalNotes === 'string' ? rawData.additionalInfo.additionalNotes.trim() : '',
      }
    : (typeof rawData.additionalInfo === 'string' ? { additionalNotes: rawData.additionalInfo.trim() } : undefined);

  return {
    services: services.length > 0 ? services : DEFAULT_BUSINESS_KNOWLEDGE.services,
    faqs: faqs.length > 0 ? faqs : DEFAULT_BUSINESS_KNOWLEDGE.faqs,
    policies,
    pricing,
    financing,
    pricingInfo: typeof rawData.pricingInfo === 'string'
      ? rawData.pricingInfo.trim()
      : (pricing?.pricingNotes || DEFAULT_BUSINESS_KNOWLEDGE.pricingInfo),
    financingInfo: typeof rawData.financingInfo === 'string'
      ? rawData.financingInfo.trim()
      : (financing?.financingNotes || DEFAULT_BUSINESS_KNOWLEDGE.financingInfo),
    insuranceInfo: typeof rawData.insuranceInfo === 'string'
      ? rawData.insuranceInfo.trim()
      : (financing?.insuranceAcceptedNotes || DEFAULT_BUSINESS_KNOWLEDGE.insuranceInfo),
    additionalInfo,
    updatedAt: rawData.updatedAt || undefined,
    updatedBy: rawData.updatedBy || undefined,
  };
}

/**
 * Validates a knowledge configuration before persisting to Firestore.
 */
export function validateBusinessKnowledge(
  config: Partial<BusinessKnowledgeConfig>
): { valid: boolean; error?: string; isValid: boolean; errors: string[] } {
  const fail = (msg: string) => ({ valid: false, error: msg, isValid: false, errors: [msg] });

  if (config.services) {
    if (!Array.isArray(config.services)) {
      return fail('Services must be a valid array.');
    }
    const seenNames = new Set<string>();
    for (let i = 0; i < config.services.length; i++) {
      const s = config.services[i];
      if (!s.name || !s.name.trim()) {
        return fail(`Service #${i + 1} has an empty name. Name is required.`);
      }
      if (s.name.trim().length > 120) {
        return fail(`Service "${s.name}" name exceeds maximum length of 120 characters.`);
      }
      if (s.description && s.description.length > 1500) {
        return fail(`Service "${s.name}" description exceeds 1500 characters.`);
      }
      if (s.durationMinutes !== undefined && s.durationMinutes !== null) {
        const d = Number(s.durationMinutes);
        if (isNaN(d) || d < 5 || d > 360) {
          return fail(`Service "${s.name}" duration must be between 5 and 360 minutes.`);
        }
      }
      const lower = s.name.trim().toLowerCase();
      if (seenNames.has(lower)) {
        return fail(`Duplicate service name found: "${s.name.trim()}". Service names should be unique.`);
      }
      seenNames.add(lower);
    }
  }

  if (config.faqs) {
    if (!Array.isArray(config.faqs)) {
      return fail('FAQs must be a valid array.');
    }
    const seenQuestions = new Set<string>();
    for (let i = 0; i < config.faqs.length; i++) {
      const f = config.faqs[i];
      if (!f.question || !f.question.trim()) {
        return fail(`FAQ #${i + 1} has an empty question. Question is required.`);
      }
      if (f.question.trim().length > 300) {
        return fail(`FAQ question #${i + 1} exceeds maximum length of 300 characters.`);
      }
      if (!f.answer || !f.answer.trim()) {
        return fail(`FAQ #${i + 1} has an empty answer. Answer is required.`);
      }
      if (f.answer.trim().length > 2500) {
        return fail(`FAQ #${i + 1} answer exceeds maximum length of 2500 characters.`);
      }
      const lower = f.question.trim().toLowerCase().replace(/[?!.,]/g, '');
      if (seenQuestions.has(lower)) {
        return fail(`Duplicate FAQ question found: "${f.question.trim()}".`);
      }
      seenQuestions.add(lower);
    }
  }

  if (config.policies) {
    const p = config.policies;
    if (p.cancellationPolicy && p.cancellationPolicy.length > 2500) {
      return fail('Cancellation policy text exceeds 2500 characters.');
    }
    if (p.appointmentPolicy && p.appointmentPolicy.length > 2500) {
      return fail('Appointment policy text exceeds 2500 characters.');
    }
    if (p.arrivalPolicy && p.arrivalPolicy.length > 2500) {
      return fail('Arrival policy text exceeds 2500 characters.');
    }
    if (p.newPatientInfo && p.newPatientInfo.length > 2500) {
      return fail('New patient info text exceeds 2500 characters.');
    }
    if (p.newPatientPolicy && p.newPatientPolicy.length > 2500) {
      return fail('New patient policy text exceeds 2500 characters.');
    }
    if (p.paymentPolicy && p.paymentPolicy.length > 2500) {
      return fail('Payment policy text exceeds 2500 characters.');
    }
    if (p.otherPolicies && p.otherPolicies.length > 2500) {
      return fail('Other policies text exceeds 2500 characters.');
    }
    if (p.generalPolicies && p.generalPolicies.length > 2500) {
      return fail('General policies text exceeds 2500 characters.');
    }
  }

  if (config.pricingInfo && config.pricingInfo.length > 2500) {
    return fail('Pricing info text exceeds 2500 characters.');
  }
  if (config.financingInfo && config.financingInfo.length > 2500) {
    return fail('Financing info text exceeds 2500 characters.');
  }
  if (config.insuranceInfo && config.insuranceInfo.length > 2500) {
    return fail('Insurance info text exceeds 2500 characters.');
  }

  return { valid: true, isValid: true, errors: [] };
}

/**
 * Loads current business knowledge from Firestore (settings/knowledge).
 * Falls back to DEFAULT_BUSINESS_KNOWLEDGE if missing or unavailable.
 */
export async function getBusinessKnowledge(forceRefresh = false): Promise<BusinessKnowledgeConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedBusinessKnowledge && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedBusinessKnowledge;
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, KNOWLEDGE_CONFIG_DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      cachedBusinessKnowledge = normalizeBusinessKnowledge(snap.data());
      lastFetchTime = now;
      return cachedBusinessKnowledge;
    }

    // Document does not exist yet -> use verified default demo knowledge
    cachedBusinessKnowledge = { ...DEFAULT_BUSINESS_KNOWLEDGE };
    lastFetchTime = now;
    return cachedBusinessKnowledge;
  } catch (err) {
    console.warn('[BusinessKnowledgeService] Error reading settings/knowledge, using demo defaults:', err);
    return cachedBusinessKnowledge || { ...DEFAULT_BUSINESS_KNOWLEDGE };
  }
}

/**
 * Subscribes to real-time changes in settings/knowledge.
 * Automatically updates cached config and invokes callback.
 */
export function subscribeToBusinessKnowledge(
  callback: (config: BusinessKnowledgeConfig) => void
): () => void {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, KNOWLEDGE_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const normalized = normalizeBusinessKnowledge(snapshot.data());
          cachedBusinessKnowledge = normalized;
          lastFetchTime = Date.now();
          callback(normalized);
        } else {
          // Document does not exist yet; emit default demo knowledge
          cachedBusinessKnowledge = { ...DEFAULT_BUSINESS_KNOWLEDGE };
          callback(cachedBusinessKnowledge);
        }
      },
      (error) => {
        console.warn('[BusinessKnowledgeService] Snapshot listener error, using fallback:', error);
        callback(cachedBusinessKnowledge || { ...DEFAULT_BUSINESS_KNOWLEDGE });
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[BusinessKnowledgeService] Failed to initialize snapshot listener:', err);
    callback(cachedBusinessKnowledge || { ...DEFAULT_BUSINESS_KNOWLEDGE });
    return () => {};
  }
}

/**
 * Saves business knowledge to Firestore under settings/knowledge.
 * Protected: Requires authenticated Admin with role == 'admin'.
 */
export async function saveBusinessKnowledge(
  config: BusinessKnowledgeConfig,
  adminEmail: string
): Promise<{ success: boolean; config?: BusinessKnowledgeConfig; error?: string }> {
  const validation = validateBusinessKnowledge(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, KNOWLEDGE_CONFIG_DOC_ID);
    const payload: BusinessKnowledgeConfig = {
      services: config.services.map((s) => ({
        id: s.id,
        name: s.name.trim(),
        description: s.description.trim(),
        durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : undefined,
        active: s.active !== false,
        category: s.category?.trim() || undefined,
        priceText: s.priceText?.trim() || '',
      })),
      faqs: config.faqs.map((f) => ({
        id: f.id,
        question: f.question.trim(),
        answer: f.answer.trim(),
        active: f.active !== false,
        category: f.category?.trim() || undefined,
        keywords: Array.isArray(f.keywords)
          ? f.keywords.filter((k: any) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
          : undefined,
      })),
      policies: {
        cancellationPolicy: config.policies?.cancellationPolicy?.trim() || '',
        appointmentPolicy: config.policies?.appointmentPolicy?.trim() || config.policies?.arrivalPolicy?.trim() || '',
        arrivalPolicy: config.policies?.arrivalPolicy?.trim() || config.policies?.appointmentPolicy?.trim() || '',
        newPatientInfo: config.policies?.newPatientInfo?.trim() || config.policies?.newPatientPolicy?.trim() || '',
        newPatientPolicy: config.policies?.newPatientPolicy?.trim() || config.policies?.newPatientInfo?.trim() || '',
        paymentPolicy: config.policies?.paymentPolicy?.trim() || '',
        otherPolicies: config.policies?.otherPolicies?.trim() || config.policies?.generalPolicies?.trim() || '',
        generalPolicies: config.policies?.generalPolicies?.trim() || config.policies?.otherPolicies?.trim() || '',
      },
      pricing: config.pricing,
      financing: config.financing,
      pricingInfo: config.pricingInfo?.trim() || config.pricing?.pricingNotes?.trim() || '',
      financingInfo: config.financingInfo?.trim() || config.financing?.financingNotes?.trim() || '',
      insuranceInfo: config.insuranceInfo?.trim() || config.financing?.insuranceAcceptedNotes?.trim() || '',
      additionalInfo: config.additionalInfo,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail.trim(),
    };

    await setDoc(docRef, payload, { merge: true });

    cachedBusinessKnowledge = payload;
    lastFetchTime = Date.now();

    return { success: true, config: payload };
  } catch (err: any) {
    console.error('[BusinessKnowledgeService] Failed to save settings/knowledge:', err);
    return {
      success: false,
      error: err?.message || 'Failed to save business knowledge to Firestore. Verify administrator permissions.',
    };
  }
}

/**
 * Resets business knowledge to verified Dental Care & Implants of Houston demo defaults.
 */
export async function resetBusinessKnowledgeToDefault(
  adminEmail: string
): Promise<{ success: boolean; config?: BusinessKnowledgeConfig; error?: string }> {
  return saveBusinessKnowledge(DEFAULT_BUSINESS_KNOWLEDGE, adminEmail);
}

/**
 * Phase 11D: Knowledge Matcher & Conversational Guardrails
 *
 * Provides safe, grounded matching of customer queries against configured Business Knowledge:
 * - Active FAQs (Admin-configured; inactive FAQs strictly excluded)
 * - Active Services (Admin-configured; detects unconfigured service requests)
 * - Business Policies (cancellation, appointment arrival, new patient intake, payment)
 * - Pricing (Returns configured priceText or safe unconfigured fallback; never invents prices)
 * - Financing & Insurance
 */

import {
  BusinessKnowledgeConfig,
  BusinessKnowledgeServiceItem,
  BusinessKnowledgeFAQItem,
  DEFAULT_BUSINESS_KNOWLEDGE,
} from '../types';
import { getLoadedBusinessKnowledge } from '../services/businessKnowledgeService';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'do', 'does', 'did', 'have',
  'how', 'what', 'when', 'where', 'which', 'who', 'why', 'can', 'you',
  'your', 'our', 'my', 'me', 'we', 'us', 'tell', 'about', 'there',
  'please', 'want', 'need', 'like', 'would', 'know', 'get', 'much',
]);

/**
 * Normalizes text for comparison by removing punctuation and extra whitespace.
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[?!.,;:'"()/[\]{}\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts meaningful non-stopword tokens from a string.
 */
function extractSignificantTokens(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Finds an active matching FAQ from the configured business knowledge.
 * Only searches active FAQs. Inactive FAQs are strictly ignored.
 */
export function findMatchingFAQ(
  query: string,
  knowledge?: BusinessKnowledgeConfig
): BusinessKnowledgeFAQItem | null {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;
  const activeFaqs = (activeConfig.faqs || []).filter((f) => f.active !== false);

  if (!query || activeFaqs.length === 0) return null;

  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(extractSignificantTokens(query));

  let bestMatch: BusinessKnowledgeFAQItem | null = null;
  let highestScore = 0;

  for (const faq of activeFaqs) {
    const faqQuestion = faq.question;
    const normalizedQuestion = normalizeText(faqQuestion);

    // 1. Direct or substring match
    if (normalizedQuery === normalizedQuestion) {
      return faq;
    }
    if (
      normalizedQuestion.length > 10 &&
      (normalizedQuery.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedQuery))
    ) {
      return faq;
    }

    // 2. Token overlap score
    const faqTokens = extractSignificantTokens(faqQuestion);
    if (faqTokens.length === 0) continue;

    let matchedCount = 0;
    for (const t of faqTokens) {
      if (queryTokens.has(t)) {
        matchedCount++;
      } else {
        // Check partial stem
        for (const qt of queryTokens) {
          if (t.length > 4 && qt.length > 4 && (t.startsWith(qt) || qt.startsWith(t))) {
            matchedCount += 0.8;
            break;
          }
        }
      }
    }

    const coverage = matchedCount / faqTokens.length;
    // Strong match threshold: >= 65% token coverage with at least 2 tokens, or 100% of single token
    if (coverage >= 0.65 && matchedCount >= (faqTokens.length === 1 ? 1 : 1.8)) {
      if (coverage > highestScore) {
        highestScore = coverage;
        bestMatch = faq;
      }
    }
  }

  return bestMatch;
}

export interface ServiceMatchResult {
  service: BusinessKnowledgeServiceItem | null;
  unconfiguredTreatment?: string;
  isExplicitServiceQuery: boolean;
}

/**
 * Searches configured active services for a match against the user's query.
 * Also detects if the user is asking about a specific treatment that is NOT offered.
 */
export function findMatchingService(
  query: string,
  knowledge?: BusinessKnowledgeConfig
): ServiceMatchResult {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;
  const activeServices = (activeConfig.services || []).filter((s) => s.active !== false);

  const lower = query.toLowerCase().trim();
  const normalized = normalizeText(query);

  // Check if query is asking whether a service is offered
  const isAskingIfOffered =
    lower.startsWith('do you do') ||
    lower.startsWith('do you offer') ||
    lower.startsWith('can i get') ||
    lower.startsWith('do you provide') ||
    lower.includes('do you have') ||
    lower.includes('tell me about') ||
    lower.includes('what is') ||
    lower.includes("what's");

  // Check against active services
  for (const service of activeServices) {
    const sNameNorm = normalizeText(service.name);
    const sTokens = extractSignificantTokens(service.name);

    // Direct name match or substring
    if (normalized.includes(sNameNorm) || sNameNorm.includes(normalized)) {
      return { service, isExplicitServiceQuery: true };
    }

    // Specific domain keywords for standard dental services
    if (sNameNorm.includes('implant') && lower.includes('implant')) {
      return { service, isExplicitServiceQuery: true };
    }
    if ((sNameNorm.includes('invisalign') || sNameNorm.includes('aligner')) && (lower.includes('invisalign') || lower.includes('clear aligner') || lower.includes('aligner'))) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('root canal') && lower.includes('root canal')) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('whitening') && (lower.includes('whiten') || lower.includes('bleach'))) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('crown') && lower.includes('crown')) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('bridge') && lower.includes('bridge')) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('denture') && lower.includes('denture')) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('sedation') && (lower.includes('sedation') || lower.includes('sleep dentistry'))) {
      return { service, isExplicitServiceQuery: true };
    }
    if (
      (sNameNorm.includes('cleaning') || sNameNorm.includes('preventive')) &&
      (lower.includes('cleaning') || lower.includes('clean') || lower.includes('hygiene') || lower.includes('checkup') || lower.includes('exam'))
    ) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('filling') && (lower.includes('filling') || lower.includes('cavity'))) {
      return { service, isExplicitServiceQuery: true };
    }
    if (sNameNorm.includes('emergency') && (lower.includes('emergency') || lower.includes('urgent') || lower.includes('toothache'))) {
      return { service, isExplicitServiceQuery: true };
    }

    // Significant token overlap
    const queryTokens = extractSignificantTokens(query);
    const matchesToken = sTokens.some((t) => queryTokens.includes(t));
    if (matchesToken && isAskingIfOffered) {
      return { service, isExplicitServiceQuery: true };
    }
  }

  // Detect explicit inquiries about unconfigured medical or dental treatments
  // (e.g. "Do you do acupuncture?", "Do you do Botox?", "Do you do braces?", "Do you do pet dentistry?")
  const unconfiguredPatterns = [
    /(?:do you (?:do|offer|provide|have)|can i get)\s+([^?.,!]+)/i,
    /tell me about\s+([^?.,!]+)/i,
  ];

  for (const pat of unconfiguredPatterns) {
    const match = query.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const candidateTokens = extractSignificantTokens(candidate);
      if (candidateTokens.length > 0 && !candidate.includes('appointment') && !candidate.includes('slot') && !candidate.includes('time')) {
        return {
          service: null,
          unconfiguredTreatment: candidate,
          isExplicitServiceQuery: true,
        };
      }
    }
  }

  return { service: null, isExplicitServiceQuery: false };
}

export interface PolicyMatchResult {
  policyType: 'cancellation' | 'appointment' | 'new_patient' | 'payment' | 'other' | 'general';
  text?: string;
  isConfigured: boolean;
}

/**
 * Detects policy-related questions and returns the configured policy text.
 */
export function findMatchingPolicy(
  query: string,
  knowledge?: BusinessKnowledgeConfig
): PolicyMatchResult | null {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;
  const policies = activeConfig.policies || {};
  const lower = query.toLowerCase();

  // Cancellation policy
  if (
    lower.includes('cancellation') ||
    lower.includes('cancel policy') ||
    lower.includes('cancelling policy') ||
    lower.includes('reschedule policy') ||
    (lower.includes('cancel') && (lower.includes('fee') || lower.includes('policy') || lower.includes('notice') || lower.includes('penalty')))
  ) {
    const text = policies.cancellationPolicy?.trim();
    return {
      policyType: 'cancellation',
      text,
      isConfigured: !!text,
    };
  }

  // Appointment / Check-in / Arrival policy
  if (
    lower.includes('arrival policy') ||
    lower.includes('check-in policy') ||
    lower.includes('check in policy') ||
    lower.includes('late policy') ||
    lower.includes('when should i arrive') ||
    lower.includes('how early should i arrive') ||
    lower.includes('how early do i need to be')
  ) {
    const text = policies.appointmentPolicy?.trim();
    return {
      policyType: 'appointment',
      text,
      isConfigured: !!text,
    };
  }

  // New patient policy / requirements
  if (
    (lower.includes('new patient') && (lower.includes('bring') || lower.includes('need') || lower.includes('require') || lower.includes('policy') || lower.includes('intake') || lower.includes('documents'))) ||
    lower.includes('what should i bring') ||
    lower.includes('what do i need to bring') ||
    lower.includes('first visit requirement')
  ) {
    const text = policies.newPatientInfo?.trim();
    return {
      policyType: 'new_patient',
      text,
      isConfigured: !!text,
    };
  }

  // Payment policy
  if (
    lower.includes('payment policy') ||
    lower.includes('when do i pay') ||
    lower.includes('payment methods') ||
    lower.includes('what payments do you accept') ||
    lower.includes('do you accept cash') ||
    lower.includes('do you accept credit card')
  ) {
    const text = policies.paymentPolicy?.trim();
    return {
      policyType: 'payment',
      text,
      isConfigured: !!text,
    };
  }

  // General policy inquiry
  if (lower.includes('policy') || lower.includes('policies')) {
    const combined = [
      policies.cancellationPolicy && `• Cancellation: ${policies.cancellationPolicy}`,
      policies.appointmentPolicy && `• Arrival: ${policies.appointmentPolicy}`,
      policies.newPatientInfo && `• New Patients: ${policies.newPatientInfo}`,
      policies.paymentPolicy && `• Payment: ${policies.paymentPolicy}`,
      policies.otherPolicies && `• Office: ${policies.otherPolicies}`,
    ].filter(Boolean).join('\n');

    return {
      policyType: 'general',
      text: combined || undefined,
      isConfigured: !!combined,
    };
  }

  return null;
}

/**
 * Returns grounded pricing response adhering strictly to rules:
 * - If service has configured priceText, returns the configured pricing.
 * - If no price has been configured, NEVER invent a price.
 *   States that verified pricing is not currently available and offers contact & consultation.
 */
export function findMatchingPricing(
  query: string,
  knowledge?: BusinessKnowledgeConfig,
  contextReason?: string,
  phone: string = '(281) 946-2569'
): string {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;
  const effectiveQuery = (query.length < 15 && contextReason) ? `${query} for ${contextReason}` : query;

  // Try to match specific service
  const serviceMatch = findMatchingService(effectiveQuery, activeConfig);

  if (serviceMatch.service && serviceMatch.service.priceText && serviceMatch.service.priceText.trim()) {
    return `For ${serviceMatch.service.name}, our configured pricing is ${serviceMatch.service.priceText.trim()}. Please note that exact costs may vary based on your personalized clinical evaluation. Would you like me to check appointment availability for a consultation?`;
  }

  // If asking about a specific service that has NO configured price
  if (serviceMatch.service) {
    return `I don't have verified pricing available for ${serviceMatch.service.name}. The cost can vary depending on individual dental needs and treatment plan. You can contact our clinic directly at ${phone} for current pricing, or I can help you check appointment availability for an evaluation.`;
  }

  // If general pricing inquiry with custom pricing notice configured
  if (activeConfig.pricingInfo && activeConfig.pricingInfo.trim()) {
    return `${activeConfig.pricingInfo.trim()} You can call our front desk at ${phone} for specific cost estimates, or I can help you check appointment availability for a consultation.`;
  }

  // Safe fallback (never invent price)
  return `I don't have verified pricing available. The cost can vary depending on the specific service and individual treatment needed. You can contact the clinic at ${phone} for current pricing, or I can help you check appointment availability for a consultation.`;
}

/**
 * Returns grounded financing response using configured knowledge.
 */
export function findMatchingFinancing(
  knowledge?: BusinessKnowledgeConfig,
  phone: string = '(281) 946-2569'
): string {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;

  if (activeConfig.financingInfo && activeConfig.financingInfo.trim()) {
    return `${activeConfig.financingInfo.trim()}\n\nPlease contact our front desk at ${phone} for personalized guidance or to apply for financing.`;
  }

  return (
    "We offer flexible financing options through verified lenders including Cherry, CareCredit, Proceed Finance, Sunbit, Alphaeon, and Basis. " +
    `Please contact our front desk at ${phone} for assistance with financing and monthly payment options.`
  );
}

/**
 * Returns grounded insurance response using configured knowledge.
 */
export function findMatchingInsurance(
  knowledge?: BusinessKnowledgeConfig,
  phone: string = '(281) 946-2569'
): string {
  const activeConfig = knowledge || getLoadedBusinessKnowledge() || DEFAULT_BUSINESS_KNOWLEDGE;

  if (activeConfig.insuranceInfo && activeConfig.insuranceInfo.trim()) {
    return `${activeConfig.insuranceInfo.trim()} You can contact our front desk directly at ${phone} to confirm your specific coverage.`;
  }

  return `We do not have current insurance plan details available in the receptionist. Because dental benefits and coverage networks vary, please call our front desk directly at ${phone} so our team can verify your specific coverage.`;
}

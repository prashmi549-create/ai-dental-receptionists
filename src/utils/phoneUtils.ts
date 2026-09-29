/**
 * Centralized Country-Aware Phone Number System for Dental Care & Implants Receptionist
 * 
 * Supports:
 * - INDIA: Country code +91, 10 national digits (typical mobile starts with 6, 7, 8, 9)
 * - UNITED STATES: Country code +1, 10 national digits (NANP: area code 2-9, exchange 2-9)
 *
 * Normalizes all numbers internally to E.164 (+91XXXXXXXXXX or +1XXXXXXXXXX).
 * Preserves backward compatibility with legacy 10-digit un-prefixed records.
 */

export type SupportedCountry = 'US' | 'IN';

export const DEFAULT_DEMO_COUNTRY: SupportedCountry = 'US';

export interface PhoneValidationResult {
  isValid: boolean;
  country: SupportedCountry | null;
  digits: string; // Clean numeric digits
  e164: string; // E.164 normalized format (+1XXXXXXXXXX or +91XXXXXXXXXX)
  nationalNumber: string; // 10 digits
  formatted: string; // e.g. "+1 (713) 555-1234" or "+91 98765 43210"
  masked: string; // e.g. "+1 (713) XXX-1234" or "+91 98765 XX210"
  error?: string;
  isIncomplete?: boolean;
  isAmbiguous?: boolean; // When 10 digits provided without country and cannot be deterministically resolved
}

/**
 * Converts spoken number and country words into digits / symbols.
 * Handles spoken forms such as:
 * - "plus one, seven one three, five five five, one two three four"
 * - "plus nine one, nine eight seven six five four three two one zero"
 * - "nine one, nine eight seven six five four three two one zero"
 * - "zero", "oh", "one", ...
 */
export function convertSpokenDigitsToNumbers(text: string): string {
  if (!text) return '';

  let converted = text
    .replace(/\bplus\s+one\b/gi, '+1 ')
    .replace(/\bplus\s+nine\s+one\b/gi, '+91 ')
    .replace(/\bplus\s+91\b/gi, '+91 ')
    .replace(/\bplus\s+1\b/gi, '+1 ')
    .replace(/\bdouble\s+(\w+)\b/gi, (_, word) => `${word} ${word}`)
    .replace(/\btriple\s+(\w+)\b/gi, (_, word) => `${word} ${word} ${word}`);

  const digitWordMap: Record<string, string> = {
    zero: '0',
    oh: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
  };

  converted = converted.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (match) => {
    const lower = match.toLowerCase();
    return digitWordMap[lower] !== undefined ? digitWordMap[lower] : match;
  });

  return converted;
}

/**
 * Detect explicit country from input string or conversational text.
 */
export function detectCountryFromInput(text: string): SupportedCountry | null {
  if (!text) return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Spoken or typed country names
  if (/\b(india|indian|\+91)\b/i.test(lower)) {
    return 'IN';
  }
  if (/\b(united\s+states|usa?|american|\+1)\b/i.test(lower)) {
    return 'US';
  }

  // Explicit +91
  if (/^\+?\s*91\b/.test(trimmed) || /^\+91/.test(trimmed)) {
    return 'IN';
  }

  // Explicit +1
  if (/^\+1\b/.test(trimmed) || /^\+1/.test(trimmed)) {
    return 'US';
  }

  // Standard US format clues: (XXX) XXX-XXXX or XXX-XXX-XXXX or XXX.XXX.XXXX
  if (/^\(?([2-9][0-9]{2})\)?[-.\s]+([2-9][0-9]{2})[-.\s]+([0-9]{4})$/.test(trimmed)) {
    return 'US';
  }

  // Standard Indian 5-5 format clues: XXXXX XXXXX or +91 XXXXX XXXXX
  if (/^(\+?91[\s\-.]*)?[6-9][0-9]{4}[\s\-.]+[0-9]{5}$/.test(trimmed)) {
    return 'IN';
  }

  // Pure digits check
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return 'IN';
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return 'US';
  }

  return null;
}

/**
 * Validates whether 10 national digits match Indian mobile numbering plan.
 * Indian mobile numbers start with 6, 7, 8, or 9.
 */
export function isValidIndianNationalNumber(digits: string): boolean {
  if (digits.length !== 10) return false;
  // Indian mobile numbering plan: initial digit is 6, 7, 8, or 9
  return /^[6-9][0-9]{9}$/.test(digits);
}

/**
 * Validates whether 10 national digits match US North American Numbering Plan (NANP).
 * Format: NXX-NXX-XXXX where N is 2-9 and X is 0-9.
 */
export function isValidUSNationalNumber(digits: string): boolean {
  if (digits.length !== 10) return false;
  // NANP: area code cannot start with 0 or 1, exchange code cannot start with 0 or 1
  return /^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(digits);
}

/**
 * Formats a phone number for display.
 */
export function formatDisplayPhone(phone?: string, countryHint?: SupportedCountry | null): string {
  if (!phone) return '—';
  const clean = String(phone).trim();
  if (!clean) return '—';

  const digits = clean.replace(/\D/g, '');

  // E.164 or digits starting with 91 (India)
  if (clean.startsWith('+91') || (digits.length === 12 && digits.startsWith('91')) || countryHint === 'IN') {
    const national = digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
    if (national.length === 10) {
      return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
    }
    return clean;
  }

  // E.164 or digits starting with 1 (US)
  if (clean.startsWith('+1') || (digits.length === 11 && digits.startsWith('1')) || countryHint === 'US') {
    const national = digits.startsWith('1') ? digits.slice(1) : digits.slice(-10);
    if (national.length === 10) {
      return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    }
    return clean;
  }

  // 10 digits without prefix
  if (digits.length === 10) {
    if (countryHint === 'IN') {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return clean;
}

/**
 * Formats a phone number with privacy masking.
 */
export function maskPhoneNumber(phone: string, countryHint?: SupportedCountry | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  if (phone.startsWith('+91') || (digits.length === 12 && digits.startsWith('91')) || countryHint === 'IN') {
    const national = digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
    if (national.length === 10) {
      return `+91 ${national.slice(0, 5)} XX${national.slice(7)}`;
    }
  }

  const national = digits.startsWith('1') ? digits.slice(1) : digits.slice(-10);
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) XXX-${national.slice(6)}`;
  }

  return phone;
}

/**
 * Centralized phone normalization function.
 * Normalizes any phone input into standard E.164 format (+1XXXXXXXXXX or +91XXXXXXXXXX).
 * 
 * If the input country cannot be determined safely, returns empty or provides country clarification.
 */
export function normalizePhoneNumber(
  rawPhone: string,
  countryHint?: SupportedCountry | null,
  fallbackDefault = true
): string {
  const result = validateStrictPhone(rawPhone, countryHint, fallbackDefault);
  return result.isValid ? result.e164 : '';
}

/**
 * Centralized Strict Phone Validation.
 * 
 * Handles:
 * 1. Explicit +91 and +1 international prefixes
 * 2. Formatted inputs: "+91 9876543210", "+1 7135551234", "(713) 555-1234", "713-555-1234"
 * 3. Spoken phone words ("plus nine one...", "nine one...", "two eight one...")
 * 4. Country hint from user selector
 * 5. Ambiguity handling (when 10 digits entered without country prefix)
 */
export function validateStrictPhone(
  text: string,
  countryHint?: SupportedCountry | null,
  fallbackToDefault = false
): PhoneValidationResult {
  if (!text) {
    return {
      isValid: false,
      country: null,
      digits: '',
      e164: '',
      nationalNumber: '',
      formatted: '',
      masked: '',
      error: "Please enter a valid phone number.",
    };
  }

  // Pre-process spoken words if any
  const spokenConverted = convertSpokenDigitsToNumbers(text.trim());
  const trimmed = spokenConverted.trim();

  // Detect explicit country from input string
  const detectedCountry = detectCountryFromInput(trimmed);
  const activeCountry = detectedCountry || countryHint || null;

  // Extract pure digits
  const rawDigits = trimmed.replace(/\D/g, '');

  // Reject input with random letters that aren't phone words
  const lettersOnly = trimmed.replace(/[\d\s()\-+.,]/g, '').trim();
  if (lettersOnly.length > 0 && !/(phone|number|cell|mobile|call|reach|use|india|us|usa)/i.test(lettersOnly)) {
    return {
      isValid: false,
      country: null,
      digits: rawDigits,
      e164: '',
      nationalNumber: '',
      formatted: '',
      masked: '',
      error: 'Please enter numbers only.',
    };
  }

  // Case A: Explicit India (+91 or 12 digits starting with 91)
  if (detectedCountry === 'IN' || (activeCountry === 'IN' && (rawDigits.length === 10 || rawDigits.length === 12))) {
    let national = rawDigits;
    if (rawDigits.length === 12 && rawDigits.startsWith('91')) {
      national = rawDigits.slice(2);
    } else if (rawDigits.length > 12 && rawDigits.startsWith('91')) {
      return {
        isValid: false,
        country: 'IN',
        digits: rawDigits,
        e164: '',
        nationalNumber: rawDigits.slice(2),
        formatted: '',
        masked: '',
        error: 'Indian phone numbers cannot exceed 10 digits (excluding +91).',
      };
    }

    if (national.length < 10) {
      return {
        isValid: false,
        country: 'IN',
        digits: national,
        e164: '',
        nationalNumber: national,
        formatted: '',
        masked: '',
        isIncomplete: true,
        error: `I heard ${national.length} digits. Indian phone numbers require 10 digits.`,
      };
    }

    if (national.length === 10) {
      if (!isValidIndianNationalNumber(national)) {
        // Warning or note for non-standard initial digit
        // Most Indian mobile numbers start with 6, 7, 8, or 9
      }

      const e164 = `+91${national}`;
      const formatted = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
      const masked = `+91 ${national.slice(0, 5)} XX${national.slice(7)}`;

      return {
        isValid: true,
        country: 'IN',
        digits: national,
        e164,
        nationalNumber: national,
        formatted,
        masked,
      };
    }
  }

  // Case B: Explicit US (+1 or 11 digits starting with 1)
  if (detectedCountry === 'US' || (activeCountry === 'US' && (rawDigits.length === 10 || rawDigits.length === 11))) {
    let national = rawDigits;
    if (rawDigits.length === 11 && rawDigits.startsWith('1')) {
      national = rawDigits.slice(1);
    } else if (rawDigits.length > 11 && rawDigits.startsWith('1')) {
      return {
        isValid: false,
        country: 'US',
        digits: rawDigits,
        e164: '',
        nationalNumber: rawDigits.slice(1),
        formatted: '',
        masked: '',
        error: 'US phone numbers cannot exceed 10 digits (excluding +1).',
      };
    }

    if (national.length < 10) {
      return {
        isValid: false,
        country: 'US',
        digits: national,
        e164: '',
        nationalNumber: national,
        formatted: '',
        masked: '',
        isIncomplete: true,
        error: `I heard ${national.length} digits. US phone numbers require 10 digits.`,
      };
    }

    if (national.length === 10) {
      const areaCode = national.slice(0, 3);
      const prefix = national.slice(3, 6);
      const line = national.slice(6, 10);

      // NANP validation: area code cannot start with 0 or 1
      if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
        return {
          isValid: false,
          country: 'US',
          digits: national,
          e164: '',
          nationalNumber: national,
          formatted: '',
          masked: '',
          error: 'US area codes cannot start with 0 or 1.',
        };
      }

      const e164 = `+1${national}`;
      const formatted = `+1 (${areaCode}) ${prefix}-${line}`;
      const masked = `+1 (${areaCode}) XXX-${line}`;

      return {
        isValid: true,
        country: 'US',
        digits: national,
        e164,
        nationalNumber: national,
        formatted,
        masked,
      };
    }
  }

  // Case C: Exactly 10 digits with NO country detected
  if (rawDigits.length === 10) {
    // If a country hint was supplied, use it
    if (countryHint === 'IN') {
      const e164 = `+91${rawDigits}`;
      return {
        isValid: true,
        country: 'IN',
        digits: rawDigits,
        e164,
        nationalNumber: rawDigits,
        formatted: `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`,
        masked: `+91 ${rawDigits.slice(0, 5)} XX${rawDigits.slice(7)}`,
      };
    }

    if (countryHint === 'US') {
      const areaCode = rawDigits.slice(0, 3);
      const prefix = rawDigits.slice(3, 6);
      const line = rawDigits.slice(6, 10);
      const e164 = `+1${rawDigits}`;
      return {
        isValid: true,
        country: 'US',
        digits: rawDigits,
        e164,
        nationalNumber: rawDigits,
        formatted: `+1 (${areaCode}) ${prefix}-${line}`,
        masked: `+1 (${areaCode}) XXX-${line}`,
      };
    }

    // Heuristics when no country was provided:
    // 1. If it starts with 2, 3, 4, 5: In India, mobile numbers do NOT start with 2, 3, 4, 5. In US they are valid area codes (e.g. 281, 713, 832 for Houston).
    // 2. If it starts with 713, 281, 832, 936, 409 (Houston area codes), it is safely US.
    const houstonPrefixes = ['713', '281', '832', '936', '409', '346', '979', '214', '512', '469', '682', '817', '972'];
    const prefix3 = rawDigits.slice(0, 3);
    const startsWith2345 = /^[2-5]/.test(rawDigits);

    if (houstonPrefixes.includes(prefix3) || startsWith2345) {
      const areaCode = rawDigits.slice(0, 3);
      const prefix = rawDigits.slice(3, 6);
      const line = rawDigits.slice(6, 10);
      const e164 = `+1${rawDigits}`;
      return {
        isValid: true,
        country: 'US',
        digits: rawDigits,
        e164,
        nationalNumber: rawDigits,
        formatted: `+1 (${areaCode}) ${prefix}-${line}`,
        masked: `+1 (${areaCode}) XXX-${line}`,
      };
    }

    // If starts with 9, 8, 7, 6 and could be either India or US (e.g. 9876543210):
    // If fallbackToDefault is true, resolve to default demo country
    if (fallbackToDefault) {
      // If starts with 9876543210, in Indian context this is the quintessential test number
      const inferredCountry = rawDigits.startsWith('98765') || rawDigits.startsWith('98') ? 'IN' : DEFAULT_DEMO_COUNTRY;
      const e164 = inferredCountry === 'IN' ? `+91${rawDigits}` : `+1${rawDigits}`;
      const formatted = inferredCountry === 'IN'
        ? `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`
        : `+1 (${rawDigits.slice(0, 3)}) ${rawDigits.slice(3, 6)}-${rawDigits.slice(6)}`;

      return {
        isValid: true,
        country: inferredCountry,
        digits: rawDigits,
        e164,
        nationalNumber: rawDigits,
        formatted,
        masked: inferredCountry === 'IN' ? `+91 ${rawDigits.slice(0, 5)} XX${rawDigits.slice(7)}` : `(${rawDigits.slice(0, 3)}) XXX-${rawDigits.slice(6)}`,
        isAmbiguous: true,
      };
    }

    // Otherwise mark ambiguous so the system can clarify
    return {
      isValid: false,
      isAmbiguous: true,
      country: null,
      digits: rawDigits,
      e164: '',
      nationalNumber: rawDigits,
      formatted: rawDigits,
      masked: rawDigits,
      error: 'Is that an Indian +91 number or a US +1 number?',
    };
  }

  // Case D: Incomplete or invalid length
  if (rawDigits.length > 0 && rawDigits.length < 10) {
    return {
      isValid: false,
      country: activeCountry,
      digits: rawDigits,
      e164: '',
      nationalNumber: rawDigits,
      formatted: '',
      masked: '',
      isIncomplete: true,
      error: `I heard ${rawDigits.length} digits. Please provide the full 10-digit phone number.`,
    };
  }

  if (rawDigits.length > 12) {
    return {
      isValid: false,
      country: null,
      digits: rawDigits,
      e164: '',
      nationalNumber: '',
      formatted: '',
      masked: '',
      error: 'Please enter a valid phone number (10 digits, or with +1 / +91 country code).',
    };
  }

  return {
    isValid: false,
    country: null,
    digits: rawDigits,
    e164: '',
    nationalNumber: '',
    formatted: '',
    masked: '',
    error: "I didn't catch the full phone number. Could you please repeat it?",
  };
}

/**
 * Extracts and normalizes spoken or typed phone numbers from natural language input.
 * Handles both Indian (+91) and US (+1) numbers with conversational phrases.
 */
export function extractSpokenPhoneNumber(text: string, countryHint?: SupportedCountry | null): {
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
} {
  if (!text) {
    return { hasPhoneMention: false, isIncomplete: false, isValid: false };
  }

  const trimmed = text.trim();
  const normalized = convertSpokenDigitsToNumbers(trimmed);

  // 1. Explicit phone introduction pattern:
  // e.g. "my phone number is 9876543210", "call me at +91 98765 43210", "reach me at (713) 555-1234"
  const phrasePattern = /(?:(?:my\s+)?(?:phone\s*number|phone|number|cell(?:\s*phone)?|mobile(?:\s*phone)?)(?:\s+is|\s*[:=-]|\s+actually|\s+is\s+actually)?|(?:call(?:\s+me)?\s+at|reach(?:\s+me)?\s+at|contact(?:\s+me)?\s+at)|(?:use\s+(?:my\s+)?(?:other|new|different)?\s*(?:phone|number)?(?:\s+is|\s*[:=-])?))\s*([+0-9\s()\-.]+)/i;
  const phraseMatch = normalized.match(phrasePattern);

  if (phraseMatch) {
    const rawCandidate = phraseMatch[1].trim();
    const valResult = validateStrictPhone(rawCandidate, countryHint, true);
    if (valResult.isValid) {
      return {
        hasPhoneMention: true,
        isIncomplete: false,
        isValid: true,
        isAmbiguous: valResult.isAmbiguous,
        digits: valResult.digits,
        e164: valResult.e164,
        country: valResult.country,
        formatted: valResult.formatted,
        masked: valResult.masked,
        matchedText: phraseMatch[0],
      };
    } else if (valResult.isIncomplete) {
      return {
        hasPhoneMention: true,
        isIncomplete: true,
        isValid: false,
        digits: valResult.digits,
        error: valResult.error,
        matchedText: phraseMatch[0],
      };
    }
  }

  // 2. Patient declaration pattern with phone:
  // e.g. "existing patient, 9876543210", "I'm an existing patient, 9876543210", "existing patient: +91 9876543210"
  const patientPhonePattern = /(?:existing(?:\s+patient)?|new(?:\s+patient)?|patient)(?:[,\s]+|[:=-]\s*)(?:my\s+(?:phone|number)\s+(?:is\s+)?)?([+0-9\s()\-.]+)/i;
  const patientPhoneMatch = normalized.match(patientPhonePattern);
  if (patientPhoneMatch) {
    const rawCandidate = patientPhoneMatch[1].trim();
    const candDigits = rawCandidate.replace(/\D/g, '');
    if (candDigits.length >= 10 && candDigits.length <= 12) {
      const valResult = validateStrictPhone(rawCandidate, countryHint, true);
      if (valResult.isValid) {
        return {
          hasPhoneMention: true,
          isIncomplete: false,
          isValid: true,
          isAmbiguous: valResult.isAmbiguous,
          digits: valResult.digits,
          e164: valResult.e164,
          country: valResult.country,
          formatted: valResult.formatted,
          masked: valResult.masked,
          matchedText: patientPhoneMatch[0],
        };
      }
    }
  }

  // 3. Direct match for international +91 / +1 format or standard formatted numbers
  const candidatePatterns = [
    // International +91 or +1 followed by 10 digits
    /(?:\+?\s*(?:91|1)[\s\-.]*)?\(?([0-9]{3})\)?[\s\-.]*([0-9]{3})[\s\-.]*([0-9]{4})/,
    // Indian 5-5 mobile format: +91 98765 43210 or 98765 43210
    /(?:\+?\s*91[\s\-.]*)?([6-9][0-9]{4})[\s\-.]*([0-9]{5})/,
    // Full +91 with 10 digits without separators
    /(?:\+91|91)[6-9][0-9]{9}/,
    // Full +1 with 10 digits without separators
    /(?:\+1|1)[2-9][0-9]{9}/,
    // Standalone 10 digits
    /\b([0-9]{10})\b/,
  ];

  for (const pattern of candidatePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const valResult = validateStrictPhone(match[0], countryHint, true);
      if (valResult.isValid) {
        return {
          hasPhoneMention: true,
          isIncomplete: false,
          isValid: true,
          isAmbiguous: valResult.isAmbiguous,
          digits: valResult.digits,
          e164: valResult.e164,
          country: valResult.country,
          formatted: valResult.formatted,
          masked: valResult.masked,
          matchedText: match[0],
        };
      }
    }
  }

  // 4. Overall validation on the entire text if the user only supplied a phone number
  const directVal = validateStrictPhone(normalized, countryHint, true);
  if (directVal.isValid) {
    return {
      hasPhoneMention: true,
      isIncomplete: false,
      isValid: true,
      isAmbiguous: directVal.isAmbiguous,
      digits: directVal.digits,
      e164: directVal.e164,
      country: directVal.country,
      formatted: directVal.formatted,
      masked: directVal.masked,
      matchedText: normalized,
    };
  }

  const allDigits = normalized.replace(/\D/g, '');
  const mentionsPhoneWord = /(?:phone|number|cell|mobile|digits?)/i.test(normalized);
  if (allDigits.length > 0 && mentionsPhoneWord) {
    return {
      hasPhoneMention: true,
      isIncomplete: true,
      isValid: false,
      digits: allDigits,
      error: `I heard ${allDigits.length} digits. Please provide the full 10-digit phone number.`,
    };
  }

  return { hasPhoneMention: false, isIncomplete: false, isValid: false };
}

/**
 * Checks if search query matches a patient phone number in Admin Patient Search.
 * Supports searching by:
 * - 10-digit national number (e.g. "9876543210" matches "+919876543210")
 * - 10-digit US number (e.g. "7135551234" matches "+17135551234")
 * - E.164 query or formatted substring
 */
export function isPatientPhoneMatch(query: string, storedPhone?: string): boolean {
  if (!query || !storedPhone) return false;
  const cleanQuery = query.trim().toLowerCase();
  const cleanStored = storedPhone.trim().toLowerCase();

  // Direct substring match
  if (cleanStored.includes(cleanQuery)) {
    return true;
  }

  const queryDigits = cleanQuery.replace(/\D/g, '');
  const storedDigits = cleanStored.replace(/\D/g, '');

  if (!queryDigits || !storedDigits) return false;

  // Exact digits match
  if (storedDigits === queryDigits) {
    return true;
  }

  // Query is 10 digits and matches the last 10 digits of stored number
  if (queryDigits.length === 10 && storedDigits.endsWith(queryDigits)) {
    return true;
  }

  // Stored is 10 digits and matches query
  if (storedDigits.length === 10 && queryDigits.endsWith(storedDigits)) {
    return true;
  }

  // Substring match on digits if query has at least 4 digits
  if (queryDigits.length >= 4 && storedDigits.includes(queryDigits)) {
    return true;
  }

  return false;
}

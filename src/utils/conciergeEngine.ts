// Grounded conversational engine and plain text sanitizer for the AI Dental Concierge
// Dental Care & Implants of Houston – Greenspoint (Houston, TX)
import { getHoustonCurrentDateTime, parseTimeToMinutes } from './clinicTime';
import { getLoadedClinicScheduleConfig } from '../services/scheduleConfigService';

export function sanitizePlainText(text: string): string {
  if (!text) return "";
  return text
    // Replace markdown bold/italics (**text** or *text*) with the clean text inside
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    // Convert markdown bullet markers (* item or - item) to clean • bullet characters
    .replace(/^(\s*)[*-]\s+/gm, "$1• ")
    // Remove markdown headers (# Header, ## Header, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove backticks
    .replace(/`{1,3}/g, "")
    // Remove any remaining stray asterisks
    .replace(/\*/g, "")
    // Normalize multiple excessive blank lines to clean double newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Returns clinic operating hours and current open/closed status
 * using the real current Houston Central Time (America/Chicago).
 */
export function getHoustonOperatingStatus(query?: string): string {
  const config = getLoadedClinicScheduleConfig();
  const lower = (query || '').toLowerCase().trim();

  const weekdayOpen = config.weekdayOpen || '08:00 AM';
  const weekdayClose = config.weekdayClose || '07:00 PM';
  const saturdayOpen = config.saturdayOpen || '08:00 AM';
  const saturdayClose = config.saturdayClose || '05:00 PM';
  const isSundayOpen = !!config.sundayOpen;
  const sundayOpenTime = config.sundayOpenTime || config.sundayOpeningTime || '09:00 AM';
  const sundayCloseTime = config.sundayCloseTime || config.sundayClosingTime || '02:00 PM';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const workingDays: string[] =
    config.workingDays && config.workingDays.length > 0
      ? config.workingDays
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Specific day questions: Saturday
  if (
    lower.includes('saturday') &&
    (lower.includes('open') || lower.includes('hour') || lower.includes('close'))
  ) {
    if (workingDays.includes('Saturday')) {
      return `Yes, our Greenspoint office is open on Saturday from ${saturdayOpen} to ${saturdayClose}.`;
    }
    return `No, our clinic is closed on Saturday. We are open Monday through Friday from ${weekdayOpen} to ${weekdayClose}.`;
  }

  // Specific day questions: Sunday
  if (
    lower.includes('sunday') &&
    (lower.includes('open') || lower.includes('hour') || lower.includes('close'))
  ) {
    if (isSundayOpen && workingDays.includes('Sunday')) {
      return `Yes, our Greenspoint office is open on Sunday from ${sundayOpenTime} to ${sundayCloseTime}.`;
    }
    return `No, our clinic is closed on Sunday. We are open Monday through Friday from ${weekdayOpen} to ${weekdayClose}, and Saturday from ${saturdayOpen} to ${saturdayClose}.`;
  }

  // If asking about "today", "now", "when do you close" or current status:
  const isTodayOrNow =
    lower.includes('today') ||
    lower.includes('now') ||
    lower.includes('currently') ||
    lower.includes('right now') ||
    lower.includes('when do you close') ||
    lower.includes('what time do you close') ||
    lower.includes('are you open today') ||
    lower.includes('are you guys open today');

  if (isTodayOrNow) {
    const now = getHoustonCurrentDateTime();
    const [year, month, day] = now.dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const currentMins = now.totalMinutes; // minutes since midnight
    const curDayName = dayNames[dayOfWeek];

    // Check if open today
    const isOpenToday = workingDays.includes(curDayName) && (dayOfWeek !== 0 || isSundayOpen);

    if (!isOpenToday) {
      return `We are closed today (${curDayName}). Our regular hours are Monday through Friday from ${weekdayOpen} to ${weekdayClose}, and Saturday from ${saturdayOpen} to ${saturdayClose}.`;
    }

    let openTimeStr = weekdayOpen;
    let closeTimeStr = weekdayClose;
    if (dayOfWeek === 0) {
      openTimeStr = sundayOpenTime;
      closeTimeStr = sundayCloseTime;
    } else if (dayOfWeek === 6) {
      openTimeStr = saturdayOpen;
      closeTimeStr = saturdayClose;
    }

    const openMins = parseTimeToMinutes(openTimeStr);
    const closeMins = parseTimeToMinutes(closeTimeStr);

    if (currentMins < openMins) {
      return `We open today at ${openTimeStr} and close at ${closeTimeStr}.`;
    }
    if (currentMins < closeMins) {
      return `Yes, we are open today until ${closeTimeStr}.`;
    }
    return `We are closed for the day. We reopen on our next operating day at ${weekdayOpen}.`;
  }

  // General clinic hours
  const sundayStr = isSundayOpen && workingDays.includes('Sunday')
    ? `${sundayOpenTime}–${sundayCloseTime}`
    : 'Closed';

  return `The Greenspoint office hours are:\n• Monday–Friday: ${weekdayOpen}–${weekdayClose}\n• Saturday: ${saturdayOpen}–${saturdayClose}\n• Sunday: ${sundayStr}`;
}

/**
 * Handles casual conversation messages (greetings, thanks, acknowledgments, closings)
 * naturally without immediately forcing an appointment booking.
 */
export function isCasualGreetingOrClosing(text: string): string | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.replace(/[!.,?]/g, '').trim();

  // Greetings
  if (
    clean === 'hi' ||
    clean === 'hello' ||
    clean === 'hey' ||
    clean === 'good morning' ||
    clean === 'good afternoon' ||
    clean === 'good evening' ||
    clean === 'howdy' ||
    clean === 'hi there' ||
    clean === 'hello there'
  ) {
    return "Hello! How can I help you today?";
  }

  // Gratitude
  if (
    clean === 'thanks' ||
    clean === 'thank you' ||
    clean === 'thank you so much' ||
    clean === 'thanks a lot' ||
    clean === 'thx' ||
    clean === 'appreciate it'
  ) {
    return "You're very welcome! Let me know if you need anything else.";
  }

  // Acknowledgments
  if (
    clean === 'ok' ||
    clean === 'okay' ||
    clean === 'great' ||
    clean === 'sounds good' ||
    clean === 'sounds great' ||
    clean === 'perfect' ||
    clean === 'cool' ||
    clean === 'got it' ||
    clean === 'understood' ||
    clean === 'alright'
  ) {
    return "Sounds great! Feel free to ask if you have any questions.";
  }

  // Closings
  if (
    clean === "that's all" ||
    clean === 'thats all' ||
    clean === 'that is all' ||
    clean === 'nothing else' ||
    clean === 'no thanks' ||
    clean === 'no thank you' ||
    clean === 'bye' ||
    clean === 'goodbye' ||
    clean === 'have a good day' ||
    clean === 'have a great day'
  ) {
    return "Have a wonderful day! Please feel free to reach out anytime if you need dental care.";
  }

  return null;
}

/**
 * Handles short or ambiguous queries without guessing.
 * Asks a concise clarification question.
 */
export function isUnclearClarificationNeeded(text: string): string | null {
  const lower = text.toLowerCase().trim().replace(/[!.,?]/g, '');

  if (
    lower === 'do you do that' ||
    lower === 'can you do that' ||
    lower === 'do you do this' ||
    lower === 'can you do this' ||
    lower === 'is that done there' ||
    lower === 'do you offer that'
  ) {
    return "Sure — what service are you asking about?";
  }

  if (
    lower === 'how much' ||
    lower === 'how much is it' ||
    lower === 'what does it cost' ||
    lower === 'what is the cost' ||
    lower === 'how much does it cost' ||
    lower === 'what do you charge' ||
    lower === 'how much do you charge' ||
    lower === 'price' ||
    lower === 'pricing'
  ) {
    return "What service are you asking about?";
  }

  return null;
}

/**
 * Checks if the user is asking about pricing or cost.
 * Detects pricing-related phrases before generating a generic service-description response.
 */
export function isPricingInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const pricingPhrases = [
    'how much',
    'how much does it cost',
    "what's the cost",
    'whats the cost',
    'what is the cost',
    'how expensive',
    'how much do you charge',
    'what do you charge',
    'what do you charge for',
    'how much do you charge for',
    'cost of',
    'price of',
    'price',
    'pricing',
    'prices',
    'fees',
    'fee',
    'how much is',
    'how much are',
    'how much would it cost',
    'what does it cost',
    'how much for',
    'rates',
    'quote',
  ];

  for (const phrase of pricingPhrases) {
    if (phrase === 'fee' || phrase === 'fees') {
      if (new RegExp(`\\b${phrase}\\b`, 'i').test(lower)) return true;
    } else if (lower.includes(phrase)) {
      return true;
    }
  }

  if (/\b(fee|fees|cost|costs|expensive|charge|charges)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Checks if a message contains BOTH service availability inquiry AND pricing inquiry.
 * e.g. "Do you do implants and how much do they cost?"
 */
export function isServiceAndPricingMultiIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!isPricingInquiry(text)) return false;

  const hasServiceVerb =
    lower.includes('do you do') ||
    lower.includes('do you offer') ||
    lower.includes('do you have') ||
    lower.includes('do you provide') ||
    lower.includes('can i get') ||
    lower.includes('can you do') ||
    lower.includes('are you able to') ||
    (lower.includes('and') && (lower.includes('do you') || lower.includes('can i') || lower.includes('offer')));

  return hasServiceVerb;
}

/**
 * Returns standard pricing response adhering strictly to the guidelines:
 * The clinic's verified pricing information is not available in the current application.
 * DO NOT invent or estimate a price.
 * Explain that cost can vary depending on treatment needed.
 * Provide clinic contact at (281) 946-2569 and offer consultation availability check.
 */
export function getPricingResponse(text: string = ''): string {
  const lower = text.toLowerCase().trim();

  // TEST F: "How much does it cost to get my tooth fixed?"
  // Recognize this as a pricing-related question, but because the exact service is unclear,
  // ask which service they mean or explain that pricing depends on the treatment.
  if (
    lower.includes('fix') ||
    lower.includes('tooth fixed') ||
    lower.includes('teeth fixed') ||
    lower.includes('broken tooth') ||
    lower.includes('chipped')
  ) {
    return "I don't have verified pricing available, and the cost depends on the specific treatment needed (such as a filling, crown, or root canal). Which service or issue are you asking about? I can also help you check availability for an exam and consultation, or you can call our clinic directly at (281) 946-2569.";
  }

  // TEST A: "How much does an implant cost?", "How expensive are dental implants?"
  if (lower.includes('implant')) {
    return "I don't have verified implant pricing available. The cost can vary depending on the treatment needed. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check availability for an implant consultation.";
  }

  // TEST B: "How much is Invisalign?", "What is the price of Invisalign?"
  if (lower.includes('invisalign') || lower.includes('clear aligner') || lower.includes('aligner')) {
    return "I don't have verified Invisalign pricing available. The cost can vary depending on individual alignment needs and treatment length. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check availability for an Invisalign consultation.";
  }

  // TEST E: "What's the cost of a root canal?"
  if (lower.includes('root canal')) {
    return "I don't have verified root canal pricing available. The cost can vary depending on which tooth is affected and the extent of treatment. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check appointment availability for an evaluation.";
  }

  // Teeth Whitening: "How much do you charge for whitening?"
  if (lower.includes('whiten') || lower.includes('whitening')) {
    return "I don't have verified teeth whitening pricing available. The cost can vary depending on the whitening treatment selected. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check appointment availability.";
  }

  // Routine Cleaning / Checkup: "How much is a cleaning?"
  if (lower.includes('cleaning') || lower.includes('clean') || lower.includes('checkup') || lower.includes('exam')) {
    return "I don't have verified cleaning or exam pricing available. The cost can vary depending on whether you need a routine preventative cleaning or deep periodontal care. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check appointment availability.";
  }

  // Crowns & Bridges: "What's the price of a crown?"
  if (lower.includes('crown') || lower.includes('bridge')) {
    return "I don't have verified crown or bridge pricing available. The cost can vary depending on the tooth, restoration materials, and treatment required. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check appointment availability.";
  }

  // General pricing inquiry
  return "I don't have verified pricing available. The cost can vary depending on the specific service and individual treatment needed. You can contact the clinic at (281) 946-2569 for current pricing, or I can help you check appointment availability for a consultation.";
}

/**
 * Checks if the user is asking about dental insurance.
 */
export function isInsuranceInquiry(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('insurance') ||
    lower.includes('in network') ||
    lower.includes('in-network') ||
    lower.includes('out of network') ||
    lower.includes('accept delta') ||
    lower.includes('take delta') ||
    lower.includes('metlife') ||
    lower.includes('cigna') ||
    lower.includes('aetna') ||
    lower.includes('guardian') ||
    lower.includes('united healthcare') ||
    lower.includes('humana') ||
    lower.includes('medicaid') ||
    lower.includes('medicare') ||
    lower.includes('dental plan') ||
    lower.includes('ppo') ||
    lower.includes('hmo')
  );
}

/**
 * Returns standard insurance response adhering strictly to the guidelines:
 * Do not invent accepted plans. Receptionist does not have current insurance details.
 * Offer clinic phone numbers to confirm coverage.
 */
export function getInsuranceResponse(): string {
  return "I do not have the clinic's current verified insurance details. Because dental benefit plans and coverage networks vary, please call our front desk directly at (281) 946-2569 (new patients) or (832) 648-7234 so our team can verify your specific coverage.";
}

/**
 * Answers general educational dental questions with short, accurate explanations
 * and safe clinical phrasing ("A dentist can evaluate your situation and recommend the appropriate treatment.").
 */
export function isEducationalDentalQuery(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Root canal
  if (
    lower.includes('what is a root canal') ||
    lower.includes("what's a root canal") ||
    lower.includes('explain root canal') ||
    lower.includes('how does a root canal work')
  ) {
    return "A root canal is an endodontic treatment that removes infected or damaged nerve tissue from inside a tooth, cleans and disinfects the canal, and seals it to preserve your natural tooth structure. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Dental implants
  if (
    lower.includes('what are dental implants') ||
    lower.includes('what is a dental implant') ||
    lower.includes('what are implants') ||
    lower.includes("what's a dental implant") ||
    lower.includes('how do implants work')
  ) {
    return "Dental implants are titanium posts surgically placed into the jawbone that serve as artificial roots to securely anchor replacement teeth, crowns, bridges, or dentures. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Invisalign
  if (
    lower.includes('what is invisalign') ||
    lower.includes("what's invisalign") ||
    lower.includes('what are clear aligners') ||
    lower.includes('how does invisalign work')
  ) {
    return "Invisalign uses a series of custom-made, clear, removable aligners to gently straighten teeth over time without traditional metal brackets or wires. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Dental crown
  if (
    lower.includes('what is a crown') ||
    lower.includes('what is a dental crown') ||
    lower.includes("what's a crown") ||
    lower.includes("what's a dental crown")
  ) {
    return "A dental crown is a custom-fitted cap placed over a damaged, decayed, or weakened tooth to restore its strength, shape, and appearance. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Teeth whitening
  if (
    lower.includes('what is teeth whitening') ||
    lower.includes("what's teeth whitening") ||
    lower.includes('how does teeth whitening work')
  ) {
    return "Professional teeth whitening uses safe, dental-grade bleaching agents to lift deep enamel stains and brighten the shade of your teeth. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Dental bridge
  if (
    lower.includes('what is a bridge') ||
    lower.includes('what is a dental bridge') ||
    lower.includes("what's a dental bridge")
  ) {
    return "A dental bridge is a custom restoration used to replace one or more missing teeth by anchoring an artificial tooth to neighboring natural teeth or dental implants. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  // Sedation dentistry
  if (
    lower.includes('what is sedation dentistry') ||
    lower.includes("what's sedation dentistry") ||
    lower.includes('how does sedation work')
  ) {
    return "Sedation dentistry uses safe medication to help patients remain relaxed, calm, and comfortable during dental procedures. A dentist can evaluate your situation and recommend the appropriate treatment.";
  }

  return null;
}

/**
 * Handles non-emergency symptom descriptions with safe general guidance
 * without diagnosing or prescribing.
 */
export function isSymptomInquiry(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Life-threatening signs check
  if (
    lower.includes("can't breathe") ||
    lower.includes("cannot breathe") ||
    lower.includes("breathing") ||
    lower.includes("swallowing") ||
    lower.includes("bleeding severely") ||
    lower.includes("heavy bleeding")
  ) {
    return "If you are experiencing severe swelling affecting your breathing or swallowing, heavy bleeding, or severe facial trauma, please call 911 or visit the nearest hospital emergency room immediately.\n\nFor urgent dental care during office hours, you can reach our Greenspoint clinic at (281) 946-2569 or (832) 648-7234.";
  }

  // Non-emergency symptoms
  const hasSymptom =
    lower.includes('hurts when i eat') ||
    lower.includes('hurts when eating') ||
    lower.includes('sensitive to cold') ||
    lower.includes('sensitive to hot') ||
    lower.includes('sensitivity') ||
    lower.includes('bleeding gums') ||
    lower.includes('gums bleed') ||
    lower.includes('jaw hurts') ||
    lower.includes('ache') ||
    lower.includes('bump on my gum') ||
    lower.includes('tooth hurts');

  if (hasSymptom && !lower.includes('earliest appointment') && !lower.includes('book') && !lower.includes('schedule')) {
    return "Tooth pain can have several possible causes, and a dentist would need to examine it to determine the cause. I can help you check appointment availability if you'd like.";
  }

  return null;
}

/**
 * Handles multi-intent questions (e.g. "Do you do implants and are you open Saturday?")
 */
export function getMultiIntentAnswer(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // 1. Service inquiry + Hours / Saturday inquiry
  // e.g. "Do you do implants and are you open Saturday?"
  const hasImplant = lower.includes('implant');
  const hasInvisalign = lower.includes('invisalign') || lower.includes('clear aligner');
  const hasWhitening = lower.includes('whitening') || lower.includes('whiten');
  const hasRootCanal = lower.includes('root canal');
  const hasCleaning = lower.includes('cleaning') || lower.includes('checkup');
  const hasSaturday = lower.includes('saturday');
  const hasSunday = lower.includes('sunday');
  const hasHours = lower.includes('hour') || lower.includes('open');

  if (hasImplant && hasSaturday && hasHours) {
    return "Yes, we provide dental implants, implant-supported dentures, and full-mouth dental implants. Our Greenspoint office is open on Saturday from 8:00 AM to 5:00 PM. Would you like me to check appointment availability for an implant consultation?";
  }
  if (hasWhitening && hasSaturday && hasHours) {
    return "Yes, we offer professional teeth whitening, and our Greenspoint office is open on Saturday from 8:00 AM to 5:00 PM. Would you like me to check appointment availability?";
  }
  if (hasInvisalign && hasSaturday && hasHours) {
    return "Yes, we offer Invisalign and clear aligners, and our Greenspoint office is open on Saturday from 8:00 AM to 5:00 PM. Would you like me to check appointment availability for an Invisalign consultation?";
  }
  if (hasRootCanal && hasSaturday && hasHours) {
    return "Yes, we perform gentle root canal therapy, and our Greenspoint office is open on Saturday from 8:00 AM to 5:00 PM. Would you like me to check appointment availability?";
  }
  if (hasCleaning && hasSaturday && hasHours) {
    return "Yes, we offer routine checkups and cleanings, and our Greenspoint office is open on Saturday from 8:00 AM to 5:00 PM. Would you like me to check appointment availability?";
  }

  // 2. Location + Phone inquiry
  // e.g. "Where are you located and what is your phone number?"
  const hasLocation = lower.includes('where') || lower.includes('location') || lower.includes('address');
  const hasPhone = lower.includes('phone') || lower.includes('number') || lower.includes('contact') || lower.includes('call');
  if (hasLocation && hasPhone) {
    return "Our Greenspoint office is located at 165 Greens Rd, Houston, TX 77060.\n• New Patients: (281) 946-2569\n• Other Callers: (832) 648-7234\n\nOffice Hours:\n• Monday–Friday: 8:00 AM–7:00 PM\n• Saturday: 8:00 AM–5:00 PM\n• Sunday: Closed";
  }

  // 3. Doctors + Hours inquiry
  const hasDoctors = lower.includes('doctor') || lower.includes('dentist') || lower.includes('who works');
  if (hasDoctors && hasHours) {
    return "The dentists practicing at our Greenspoint location are Dr. Aditya Bhawsar, Dr. James Dinh, Dr. Firoz Lalani, and Dr. Vicky Matayoshi. Our hours are Monday–Friday from 8:00 AM to 7:00 PM, Saturday from 8:00 AM to 5:00 PM, and we are closed on Sunday.";
  }

  // 4. Service + Pricing inquiry (TEST D: "Do you do implants and how much do they cost?")
  // Multi-intent requires BOTH service inquiry and pricing inquiry.
  // Single-intent pricing (e.g. "How much does an implant cost?") must NOT trigger this.
  if (isServiceAndPricingMultiIntent(text)) {
    if (hasImplant) {
      return "Yes, the clinic offers dental implants, including implant-supported dentures and full-mouth dental implants. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability.";
    }
    if (hasInvisalign) {
      return "Yes, the clinic offers Invisalign and clear aligners. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability for an Invisalign consultation.";
    }
    if (hasWhitening) {
      return "Yes, the clinic offers professional teeth whitening. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability.";
    }
    if (hasRootCanal) {
      return "Yes, the clinic performs root canal therapy. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability for an evaluation.";
    }
    if (hasCleaning) {
      return "Yes, the clinic provides routine checkups and cleanings. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability.";
    }
    return "Yes, we provide comprehensive dental services at our Greenspoint clinic. I don't have verified pricing available, so please contact the clinic at (281) 946-2569 for current pricing. I can also help you check appointment availability.";
  }

  return null;
}

/**
 * Main grounded local concierge engine.
 * Serves as the guaranteed source of truth and fallback.
 */
export function getLocalConciergeAnswer(userMessage: string): string {
  const query = userMessage.toLowerCase().trim();

  // 1. Casual messages (hi, thanks, okay, that's all)
  const casual = isCasualGreetingOrClosing(userMessage);
  if (casual) return casual;

  // 2. Unclear questions (do you do that?, how much?)
  const unclear = isUnclearClarificationNeeded(userMessage);
  if (unclear) return unclear;

  // 3. Multi-intent queries
  const multi = getMultiIntentAnswer(userMessage);
  if (multi) return multi;

  // 3.5. Clinical Safety Guardrails (No diagnosis, no prescribing, no pretending to be a dentist)
  if (
    query.includes('are you a dentist') ||
    query.includes('are you the dentist') ||
    query.includes('are you a doctor') ||
    query.includes('are you a nurse') ||
    query.includes('are you a hygienist')
  ) {
    return "I am an AI dental receptionist for Dental Care & Implants of Houston at Greenspoint. I assist with appointment scheduling, office hours, and clinic information. I am not a dentist or healthcare provider. Would you like to schedule an appointment with one of our licensed dentists?";
  }

  if (
    query.includes('prescribe') ||
    query.includes('prescription') ||
    query.includes('antibiotic') ||
    query.includes('painkiller') ||
    query.includes('medication should i take') ||
    query.includes('medicine should i take') ||
    query.includes('what medicine') ||
    query.includes('what drug') ||
    query.includes('can you diagnose') ||
    query.includes('diagnose me') ||
    query.includes('diagnose my') ||
    query.includes('what do i have') ||
    query.includes('do i have an abscess') ||
    query.includes('do i have a cavity')
  ) {
    return "As an AI receptionist, I cannot provide dental diagnoses, prescribe medications, or provide personalized clinical treatment decisions. A licensed dentist must evaluate your teeth and mouth in person to diagnose any conditions and determine the proper treatment. Would you like me to help you schedule an appointment with our dentists?";
  }

  // 4. Clinical safety & life-threatening medical emergency
  if (
    query.includes("can't breathe") ||
    query.includes("cannot breathe") ||
    query.includes("swallowing") ||
    query.includes("bleeding severely") ||
    query.includes("heavy bleeding")
  ) {
    return "If you are experiencing severe swelling affecting your breathing or swallowing, heavy bleeding, or severe facial trauma, please call 911 or visit the nearest hospital emergency room immediately.\n\nFor urgent dental relief during office hours, please contact the Greenspoint office directly at (281) 946-2569 or (832) 648-7234.";
  }

  // 5. Symptom inquiry (non-emergency)
  const symptomAnswer = isSymptomInquiry(userMessage);
  if (symptomAnswer) return symptomAnswer;

  // 6. Educational dental questions (What is a root canal?, What are implants?, etc.)
  const educational = isEducationalDentalQuery(userMessage);
  if (educational) return educational;

  // 7. Pricing questions (How much is a cleaning?, How much are implants?, etc.)
  if (isPricingInquiry(userMessage)) {
    return getPricingResponse(userMessage);
  }

  // 8. Insurance questions (Do you accept Delta?, What insurance do you take?, etc.)
  if (isInsuranceInquiry(userMessage)) {
    return getInsuranceResponse();
  }

  // 9. Hours / Saturday / Sunday / Open today (Dynamic Houston time)
  const isHoursRelated =
    query.includes("hour") ||
    query.includes("open") ||
    query.includes("close") ||
    query.includes("today") ||
    query.includes("saturday") ||
    query.includes("sunday");

  const hasExplicitBookingKeywords =
    query.includes("book") ||
    query.includes("schedule") ||
    query.includes("appointment") ||
    query.includes("reserve") ||
    query.includes("slot");

  if (isHoursRelated && !hasExplicitBookingKeywords) {
    return getHoustonOperatingStatus(userMessage);
  }

  // 10. Technology FAQ
  if (
    query.includes("technology") ||
    query.includes("tech") ||
    query.includes("cerec") ||
    query.includes("x-ray") ||
    query.includes("xray") ||
    query.includes("cbct") ||
    query.includes("3d imaging")
  ) {
    return "Our Greenspoint office uses modern dental technologies, including:\n• Digital X-rays\n• 3D imaging / CBCT\n• CEREC technology\n\nWe do not use or claim unverified technologies. Let me know if you would like to schedule an appointment!";
  }

  // 11. Financing FAQ
  if (
    query.includes("financ") ||
    query.includes("payment plan") ||
    query.includes("cherry") ||
    query.includes("carecredit") ||
    query.includes("proceed") ||
    query.includes("sunbit") ||
    query.includes("alpheon") ||
    query.includes("basis")
  ) {
    return "We offer flexible financing options through verified partners including:\n• Cherry\n• CareCredit\n• Proceed Finance\n• Sunbit\n• Alpheon\n• Basis\n\nFinancing terms, interest rates, and eligibility are determined directly through each lender, and I do not have those specific financing details. Please contact our front desk at (281) 946-2569 (new patients) or (832) 648-7234 for guidance.";
  }

  // 12. Doctors FAQ
  if (
    query.includes("doctor") ||
    query.includes("dentist") ||
    query.includes("who are") ||
    query.includes("provider") ||
    query.includes("staff") ||
    query.includes("team")
  ) {
    return "The dentists practicing at our Greenspoint location are:\n• Dr. Aditya Bhawsar\n• Dr. James Dinh\n• Dr. Firoz Lalani\n• Dr. Vicky Matayoshi\n\nYou can reach our team directly at (281) 946-2569.";
  }

  // 13. Location / Address / Where
  if (
    query.includes("where") ||
    query.includes("location") ||
    query.includes("address") ||
    query.includes("direction") ||
    query.includes("map")
  ) {
    return "The Greenspoint office is located at:\n165 Greens Rd, Houston, TX 77060, United States.\n\nPhone: (281) 946-2569 (new patients) or (832) 648-7234 (all other callers).";
  }

  // 14. Contact / Phone
  if (
    query.includes("contact") ||
    query.includes("phone") ||
    query.includes("call") ||
    query.includes("number") ||
    query.includes("reach")
  ) {
    return "You can reach Dental Care & Implants of Houston at the Greenspoint location via:\n• New Patients: (281) 946-2569\n• Other Callers: (832) 648-7234\n• Address: 165 Greens Rd, Houston, TX 77060\n\nHours:\n• Monday–Friday: 8:00 AM–7:00 PM\n• Saturday: 8:00 AM–5:00 PM\n• Sunday: Closed";
  }

  // 15. View Services / Catalog
  if (
    query === "view services" ||
    query.includes("view services") ||
    query.includes("what services") ||
    query.includes("what treatments") ||
    query.includes("services do you offer") ||
    query.includes("what can i get done") ||
    query.includes("treatments do you provide") ||
    query === "services" ||
    query.includes("list of services")
  ) {
    return "Dental Care & Implants of Houston provides comprehensive dental care for patients from teens through adults at our Greenspoint location.\n\nOur verified services include:\n• General Dentistry\n• Dental Implants\n• Implant-Supported Dentures\n• Full-Mouth Dental Implants\n• Cosmetic Dentistry\n• Invisalign / Clear Aligners\n• Crowns & Bridges\n• Root Canals\n• Teeth Whitening\n• Family Dentistry\n• Sedation Dentistry\n• Emergency Dental Care\n• Preventive Dental Care\n\nWould you like more details about any of these treatments, or would you like me to check appointment availability?";
  }

  // 16. Specific Services: Implants
  if (
    query.includes("implant") ||
    query.includes("implants") ||
    query.includes("full-mouth") ||
    query.includes("full mouth")
  ) {
    return "Yes, we provide dental implants, implant-supported dentures, and full-mouth dental implants to restore missing teeth and full chewing function. Would you like me to check appointment availability for an implant consultation?";
  }

  // 17. Specific Services: Invisalign
  if (query.includes("invisalign") || query.includes("clear aligner") || query.includes("aligners")) {
    return "Yes, we offer Invisalign and clear aligners for teens and adults to straighten teeth comfortably and discreetly. Would you like me to check appointment availability for an Invisalign consultation?";
  }

  // 18. Specific Services: Teeth Whitening
  if (query.includes("whiten") || query.includes("whitening") || query.includes("bleach")) {
    return "Yes, we offer professional teeth whitening to safely remove stains and brighten your smile. Would you like me to check appointment availability?";
  }

  // 19. Specific Services: Root Canals
  if (query.includes("root canal") || query.includes("endodontic")) {
    return "Yes, we provide gentle root canal therapy to relieve dental pain, eliminate infection, and save your natural tooth. Would you like me to check appointment availability?";
  }

  // 20. Specific Services: Crowns & Bridges
  if (query.includes("crown") || query.includes("bridge")) {
    return "Yes, we provide custom dental crowns and bridges crafted to protect damaged teeth or replace missing teeth with natural-looking restorations. Would you like me to check appointment availability?";
  }

  // 21. Specific Services: Cosmetic Dentistry
  if (query.includes("cosmetic")) {
    return "Yes, our cosmetic dentistry services include professional teeth whitening, cosmetic restorations, and aesthetic smile enhancements. Would you like me to check appointment availability?";
  }

  // 22. Specific Services: Sedation Dentistry
  if (query.includes("sedation") || query.includes("sleep dentistry")) {
    return "Yes, we offer sedation dentistry options to ensure a calm, relaxed, anxiety-free experience during your dental visits. Would you like me to check appointment availability?";
  }

  // 23. Specific Services: Emergency Dental Care
  if (query.includes("emergency dental") || query.includes("broken tooth")) {
    return "Yes, we provide emergency dental care during our office hours for severe toothaches, damaged restorations, and urgent dental discomfort. For immediate clinical care, call our Greenspoint office at (281) 946-2569 (new patients) or (832) 648-7234.";
  }

  // 24. Specific Services: General / Family / Preventive / Cleaning
  if (
    query.includes("family dentistry") ||
    query.includes("general dentistry") ||
    query.includes("preventive") ||
    query.includes("cleaning") ||
    query.includes("checkup") ||
    query.includes("exam")
  ) {
    return "Yes, we provide comprehensive general, family, and preventive dental care including routine cleanings, exams, and fillings for patients from teens through adults. Would you like me to check appointment availability?";
  }

  // 25. New patient onboarding
  if (query.includes("new patient") || query.includes("first visit") || query.includes("register")) {
    return "Welcome! New patients can access registration forms and clinic onboarding resources through our patient portal or directly at the front desk. To begin your care or schedule an initial consultation, call our dedicated new patient line at (281) 946-2569.";
  }

  // 26. Unknown Information Fallback (Strict compliance: do not guess, offer phone numbers)
  return "I don't have that verified information. Please contact our Greenspoint clinic directly at (281) 946-2569 (new patients) or (832) 648-7234 (all other callers) for assistance.";
}

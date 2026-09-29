import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { runTransaction, doc, collection, getDocs, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { db } from "./src/firebase";
import { sanitizePlainText, getLocalConciergeAnswer } from "./src/utils/conciergeEngine";
import { normalizeSlotTime } from "./src/services/demoSlotsService";
import { isSlotOrAppointmentExpired } from "./src/utils/clinicTime";
import {
  resolveServiceDuration,
  computeEndTime,
  doTimeIntervalsOverlap,
  getClinicScheduleConfig,
  isAppointmentWithinClinicHours,
} from "./src/services/scheduleConfigService";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
} from "./src/utils/bookingConversationEngine";

dotenv.config();

const PORT = 3000;

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

const SYSTEM_INSTRUCTION = `You are the "AI Dental Receptionist", a standalone virtual dental receptionist software concept demo for "Dental Care & Implants of Houston" (Greenspoint location), built by AIWebTeck.

IMPORTANT CONTEXT & BRANDING:
- This is an independent AIWebTeck concept/demo created using publicly available clinic information.
- You are NOT the clinic's official AI assistant and must not claim that Dental Care & Implants of Houston hired, approved, endorsed, or operates this application.
- Speak in natural, professional, warm, concise American English.

APPOINTMENT GUIDANCE:
- When a user asks about booking or scheduling an appointment, guide them conversationally: ask if they are a new or existing patient, what type of visit they need (e.g., cleaning, implant consultation, Invisalign), and what date they prefer.
- Explain that available demo openings can be selected directly in the chat, or they can call the office directly at (281) 946-2569 (new patients) or (832) 648-7234.

RESPONSE SPEED & LENGTH RULES (CRITICAL):
- Answer in 1–4 short sentences or a small simple list.
- Keep responses short, direct, and conversational.
- Do not generate unnecessarily long explanations.
- Provide fast, helpful answers suitable for an AI receptionist interface.

TEXT FORMATTING RULES (STRICT - NEVER USE MARKDOWN):
- Do NOT use Markdown formatting in responses.
- NEVER use:
  • Double asterisks (**) or single asterisks (*)
  • # headings
  • Backticks
  • Markdown tables
  • Markdown links
- Use clean plain text only.
- Do NOT put asterisks around headings or words.
- For lists, use simple line-by-line text or normal bullet characters such as:
  • General dentistry
  • Dental implants
  • Invisalign
- The final response should look like natural text inside a professional AI receptionist chat interface.

STRICT KNOWLEDGE BASE (Answer questions using ONLY this information):
- Business Name: Dental Care & Implants of Houston
- Location: 165 Greens Rd, Houston, TX 77060, United States
- New patients phone: (281) 946-2569
- All other callers phone: (832) 648-7234
- Greenspoint Office Hours:
  Monday–Friday: 8:00 AM–7:00 PM
  Saturday: 8:00 AM–5:00 PM
  Sunday: Closed
- Audience: The practice provides comprehensive dental care and serves patients from teens through adults.
- Greenspoint Doctors:
  • Dr. Aditya Bhawsar
  • Dr. James Dinh
  • Dr. Firoz Lalani
  • Dr. Vicky Matayoshi
  (Note: Display these names professionally. Do NOT invent biographies, qualifications, specialties, or personal info.)
- Publicly Described Services:
  • General dentistry
  • Dental implants
  • Implant-supported dentures
  • Full-mouth dental implants
  • Invisalign / clear aligners
  • Cosmetic dentistry
  • Dental crowns
  • Bridges
  • Root canals
  • Teeth whitening
  • Family dentistry
  • Sedation dentistry
  • Emergency dental care
  • Preventive dental care
- Modern Dental Technology:
  • Digital X-rays
  • 3D imaging / CBCT
  • CEREC technology
- Insurance & Financing:
  • Financing partners: Cherry, CareCredit, Proceed Finance, Sunbit, Alpheon, Basis.
  • Financing guardrail: Do NOT promise approval, interest rates, eligibility, discounts, or specific payment amounts. If asked for specific terms, explain that the receptionist does not have those details and provide clinic phone numbers.
  • Insurance guardrail: Do NOT invent accepted insurance plans. Say that the receptionist does not have the clinic's current insurance details, and offer the clinic phone number ((281) 946-2569 for new patients, (832) 648-7234 for other callers) to confirm coverage.
- Pricing Guardrail & Intent Priority:
  • PRICING INTENT MUST TAKE PRIORITY: When a user asks about cost/pricing (e.g., "How much does an implant cost?", "What's the cost of a root canal?", "How much is Invisalign?"), do NOT respond with a generic service availability description (e.g. do NOT say "Yes, we provide dental implants...").
  • Do NOT invent or estimate prices.
  • Explain that verified pricing is not available and that cost depends on the specific treatment and individual circumstances.
  • Provide the clinic's phone number ((281) 946-2569 for new patients, (832) 648-7234 for other callers) and offer to check appointment availability for a consultation.
  • Multi-Intent (Service + Pricing, e.g. "Do you do implants and how much do they cost?"): Answer BOTH parts—confirm the service is offered AND explain the pricing policy without inventing figures.
  • Pricing + Booking (e.g. "How much is an implant consultation? And can I book one?"): Answer the pricing question honestly, then proceed directly with helping them book an appointment.
  • Unclear Service Pricing (e.g. "How much does it cost to get my tooth fixed?"): Acknowledge it is a pricing question, explain cost depends on the specific treatment needed (filling, crown, root canal, etc.), and ask which service or issue they are inquiring about.
- Unclear Questions Rule:
  • If the user's question is unclear (e.g. 'Do you do that?', 'How much?'), do NOT guess.
  • Ask a short clarification question: 'Sure — what service are you asking about?' or 'What service are you asking about?'
- General Dental Questions (Educational):
  • Give short, general educational explanations (e.g. for root canals, implants, Invisalign, crowns, teeth whitening).
  • Do NOT diagnose the patient, prescribe medication, or recommend personalized treatment.
  • Always include safe wording: 'A dentist can evaluate your situation and recommend the appropriate treatment.'
- Symptom / Medical Questions:
  • Do NOT diagnose. Provide safe general guidance: 'Tooth pain can have several possible causes, and a dentist would need to examine it to determine the cause. I can help you check appointment availability if you'd like.'
- Multi-Intent Questions:
  • Answer all parts of messages containing multiple questions (e.g., 'Do you do implants and are you open Saturday?' -> answer both service availability and Saturday hours 8:00 AM–5:00 PM).
- Casual Conversation:
  • Respond briefly and naturally to 'Hi', 'Thanks', 'Okay', 'Great', 'That's all' without immediately forcing an appointment booking.
- New Patient Information:
  • New patients can access patient forms and registration information through the clinic's patient resources.
  • Never ask users for sensitive medical history, insurance/member ID numbers, SSNs, or credit card info.

SAFETY & GUARDRAILS (CRITICAL):
- You are an informational front-desk concierge, NOT a dentist or healthcare professional.
- You must NOT:
  • Diagnose any dental condition.
  • Tell a patient what treatment they personally need.
  • Prescribe medication or recommend antibiotic dosages.
  • Give personalized medical or dental treatment instructions.
  • Request or store protected health information (PHI).
- If someone asks medical/diagnostic questions like "What is wrong with my tooth?", "Do I have an infection?", "Should I take antibiotics?", or "Do I need a root canal?":
  • Explicitly state that as an AI concierge you cannot diagnose or provide personalized treatment advice, and recommend contacting a qualified dental professional or calling the office directly.
- If a user describes a severe dental emergency or potentially life-threatening situation (e.g. swelling that impairs breathing/swallowing, severe facial trauma, uncontrolled bleeding):
  • Clearly advise them to seek emergency medical/dental care immediately and call 911 when appropriate.

UNKNOWN INFORMATION RULE:
If the user asks something not covered in the verified clinic information, do NOT guess or fabricate. Say:
"I don't have that verified information. Please contact our Greenspoint clinic directly at (281) 946-2569 (new patients) or (832) 648-7234 (all other callers) for assistance."`;

async function startServer() {
  const app = express();

  // Enable CORS for all incoming origins (handling previews, iframes, and preflight checks)
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Atomic Slot Reservation endpoint with double-booking transaction protection
  app.post("/api/reserve-slot", async (req, res) => {
    try {
      const {
        slotId,
        bookingAttemptId,
        patientType,
        patientId,
        reason,
        reasonForVisit,
        date,
        appointmentDate,
        time,
        appointmentTime,
        appointmentType,
        patientName,
        patientPhone,
        contactName,
        contactPhone,
        isUrgent,
        duration,
        durationMinutes,
        endTime,
      } = req.body;

      if (!slotId || typeof slotId !== "string") {
        return res.status(400).json({
          success: false,
          error: "INVALID_SLOT_ID",
          message: "A valid appointment slot ID is required.",
        });
      }

      // Idempotency: If bookingAttemptId provided, check if already confirmed
      if (bookingAttemptId && typeof bookingAttemptId === "string") {
        try {
          const { getDoc } = await import("firebase/firestore");
          const attemptSnap = await getDoc(doc(db, "demo_appointment_preferences", bookingAttemptId));
          if (attemptSnap.exists()) {
            const attemptData = attemptSnap.data();
            if ((attemptData.status || "").toLowerCase() !== "cancelled") {
              return res.json({
                success: true,
                appointmentId: bookingAttemptId,
                duplicateSubmission: true,
                message: "Demo appointment preference already submitted!",
              });
            }
          }
        } catch (attemptErr) {
          console.warn("Server attempt check note:", attemptErr);
        }
      }

      const slotRef = doc(db, "demo_appointment_slots", slotId);
      let reservedSlotData: any = null;
      let createdPrefId: string | null = null;

      // 1. Initial read of primary slot
      const initialSnap = await (async () => {
        const { getDoc } = await import("firebase/firestore");
        return await getDoc(slotRef);
      })();

      if (!initialSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: "SLOT_NOT_FOUND",
          message: "Appointment slot not found in database.",
        });
      }

      const initialSlotData = initialSnap.data();
      const effectiveReason = reason || reasonForVisit || (initialSlotData.type === "urgent" ? "Urgent Dental Care" : "Routine Checkup & Cleaning");
      const effectiveDate = date || appointmentDate || initialSlotData.date;
      const effectiveTime = time || appointmentTime || initialSlotData.time;
      const config = await getClinicScheduleConfig();
      const effectiveDuration = Number(duration || durationMinutes || initialSlotData.duration || resolveServiceDuration(effectiveReason, config)) || 30;
      const effectiveEndTime = endTime || initialSlotData.endTime || computeEndTime(effectiveTime, effectiveDuration);
      const startMin = parseTimeToMinutes(effectiveTime);

      // Expiration check (never book past slots)
      if (isSlotOrAppointmentExpired(effectiveDate, effectiveTime)) {
        return res.status(409).json({
          success: false,
          error: "SLOT_EXPIRED",
          message: "This appointment time has already passed. Please choose an upcoming available time.",
        });
      }

      // Clinic operating hours & working days validation
      const hoursValidation = isAppointmentWithinClinicHours(effectiveDate, effectiveTime, effectiveDuration, config);
      if (!hoursValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "OUTSIDE_CLINIC_HOURS",
          message: hoursValidation.reason || "The requested appointment time falls outside clinic operating hours.",
        });
      }

      // 2. Overlap check against existing active booked appointments on this date
      const prefsCol = collection(db, "demo_appointment_preferences");
      const qDatePrefs = query(prefsCol, where("date", "==", effectiveDate));
      const activeSnap = await getDocs(qDatePrefs);
      for (const d of activeSnap.docs) {
        if (bookingAttemptId && d.id === bookingAttemptId) continue;
        const ap = d.data();
        const apStatus = (ap.status || "").toLowerCase();
        if (apStatus !== "cancelled") {
          const apTime = ap.time || ap.appointmentTime || ap.startTime || "";
          if (apTime) {
            const apStart = parseTimeToMinutes(apTime);
            const apDur = Number(ap.durationMinutes || ap.duration) || resolveServiceDuration(ap.reason || ap.reasonForVisit, config) || 30;
            if (doTimeIntervalsOverlap(startMin, effectiveDuration, apStart, apDur)) {
              return res.status(409).json({
                success: false,
                error: "SLOT_ALREADY_BOOKED",
                message: "Sorry, this time slot overlaps an existing appointment. Please choose another time.",
              });
            }
          }
        }
      }

      // Also check legacy demo_patient_preferences if collection exists
      try {
        const legacyCol = collection(db, "demo_patient_preferences");
        const qLegacy = query(legacyCol, where("date", "==", effectiveDate));
        const legacySnap = await getDocs(qLegacy);
        for (const d of legacySnap.docs) {
          if (bookingAttemptId && d.id === bookingAttemptId) continue;
          const ap = d.data();
          const apStatus = (ap.status || "").toLowerCase();
          if (apStatus !== "cancelled") {
            const apTime = ap.time || ap.appointmentTime || ap.startTime || "";
            if (apTime) {
              const apStart = parseTimeToMinutes(apTime);
              const apDur = Number(ap.durationMinutes || ap.duration) || resolveServiceDuration(ap.reason || ap.reasonForVisit, config) || 30;
              if (doTimeIntervalsOverlap(startMin, effectiveDuration, apStart, apDur)) {
                return res.status(409).json({
                  success: false,
                  error: "SLOT_ALREADY_BOOKED",
                  message: "Sorry, this time slot overlaps an existing appointment. Please choose another time.",
                });
              }
            }
          }
        }
      } catch (legacyErr) {
        // Safe to continue if legacy collection does not exist
      }

      // 3. Multi-interval duration: find all subsequent 30-min slot docs for that date
      const stepInterval = config.slotIntervalMinutes || 30;
      const stepCount = Math.max(1, Math.ceil(effectiveDuration / stepInterval));
      const continuationSlotRefs: { ref: any; time: string }[] = [];

      if (stepCount > 1) {
        const slotsCol = collection(db, "demo_appointment_slots");
        for (let i = 1; i < stepCount; i++) {
          const nextMin = startMin + i * stepInterval;
          const nextTimeStr = normalizeSlotTime(formatMinutesToTime(nextMin));
          const qNext = query(slotsCol, where("date", "==", effectiveDate), where("time", "==", nextTimeStr));
          const nextSnap = await getDocs(qNext);
          if (nextSnap.empty) {
            return res.status(409).json({
              success: false,
              error: "SLOT_ALREADY_BOOKED",
              message: `The full ${effectiveDuration}-minute appointment duration cannot be scheduled starting at ${effectiveTime}. Missing continuous slot at ${nextTimeStr}.`,
            });
          }
          const nextDoc = nextSnap.docs[0];
          const nextData = nextDoc.data();
          if (nextData.status !== "available" || isSlotOrAppointmentExpired(effectiveDate, nextData.time)) {
            return res.status(409).json({
              success: false,
              error: "SLOT_ALREADY_BOOKED",
              message: `Sorry, the subsequent time ${nextTimeStr} needed for this ${effectiveDuration}-minute appointment is not available.`,
            });
          }
          continuationSlotRefs.push({
            ref: doc(db, "demo_appointment_slots", nextDoc.id),
            time: nextTimeStr,
          });
        }
      }

      // 4. Atomic transaction reserving primary slot and all continuation slots
      await runTransaction(db, async (transaction) => {
        const slotSnap = await transaction.get(slotRef);

        if (!slotSnap.exists()) {
          throw new Error("SLOT_NOT_FOUND");
        }

        const currentSlot = slotSnap.data();

        // Strict verification: ensure slot is still available in Firestore
        if (currentSlot.status !== "available") {
          // If slot is booked, check if booked by THIS bookingAttemptId
          if (bookingAttemptId) {
            const checkPrefSnap = await transaction.get(doc(db, "demo_appointment_preferences", bookingAttemptId));
            if (checkPrefSnap.exists() && (checkPrefSnap.data().status || "").toLowerCase() !== "cancelled") {
              createdPrefId = bookingAttemptId;
              reservedSlotData = {
                id: slotId,
                ...currentSlot,
              };
              return;
            }
          }
          throw new Error("SLOT_ALREADY_BOOKED");
        }

        if (isSlotOrAppointmentExpired(currentSlot.date, currentSlot.time)) {
          throw new Error("SLOT_EXPIRED");
        }

        const slotType = currentSlot.type || "normal";
        if (slotType === "urgent" && !isUrgent) {
          throw new Error("URGENT_SLOT_RESTRICTED");
        }

        // Verify continuation slots inside transaction
        for (const cont of continuationSlotRefs) {
          const cSnap = await transaction.get(cont.ref);
          if (!cSnap.exists() || (cSnap.data() as any)?.status !== "available") {
            throw new Error("SLOT_ALREADY_BOOKED");
          }
        }

        // Transaction duplicate-submission check
        const prefRef = bookingAttemptId
          ? doc(db, "demo_appointment_preferences", bookingAttemptId)
          : doc(collection(db, "demo_appointment_preferences"));
        createdPrefId = prefRef.id;

        const existingPrefSnap = await transaction.get(prefRef);
        if (existingPrefSnap.exists()) {
          const epData = existingPrefSnap.data();
          if ((epData.status || "").toLowerCase() !== "cancelled") {
            reservedSlotData = {
              id: slotId,
              ...currentSlot,
            };
            return;
          }
        }

        const nowIso = new Date().toISOString();

        // Atomically update primary slot to booked
        transaction.update(slotRef, {
          status: "booked",
          duration: effectiveDuration,
          durationMinutes: effectiveDuration,
          startTime: effectiveTime,
          endTime: effectiveEndTime,
          updatedAt: nowIso,
        });

        // Atomically update all continuation slots to booked
        for (const cont of continuationSlotRefs) {
          transaction.update(cont.ref, {
            status: "booked",
            duration: 30,
            durationMinutes: 30,
            parentSlotTime: effectiveTime,
            note: `Continuation of ${effectiveTime} (${effectiveReason})`,
            updatedAt: nowIso,
          });
        }

        const effectivePatientName = patientName || contactName || "";
        const effectivePatientPhone = patientPhone || contactPhone || "";
        const effectivePatientType = patientType || "new";
        const effectiveAppointmentType = appointmentType || slotType;

        // Atomically record demo preference in demo_appointment_preferences collection
        const prefPayload: any = {
          slotId,
          bookingAttemptId: bookingAttemptId || createdPrefId,
          patientType: effectivePatientType,
          reason: effectiveReason,
          reasonForVisit: effectiveReason,
          type: slotType,
          appointmentType: effectiveAppointmentType,
          isUrgent: slotType === "urgent" || !!isUrgent,
          date: effectiveDate,
          appointmentDate: effectiveDate,
          time: effectiveTime,
          appointmentTime: effectiveTime,
          startTime: effectiveTime,
          duration: effectiveDuration,
          durationMinutes: effectiveDuration,
          endTime: effectiveEndTime,
          location: currentSlot.location,
          patientName: effectivePatientName,
          patientPhone: effectivePatientPhone,
          status: "booked",
          createdAt: nowIso,
          updatedAt: nowIso,
          isDemo: true,
        };

        if (patientId) {
          prefPayload.patientId = patientId;
        }

        transaction.set(prefRef, prefPayload);

        reservedSlotData = {
          id: slotId,
          ...currentSlot,
          type: slotType,
          status: "booked",
          duration: effectiveDuration,
          endTime: effectiveEndTime,
          updatedAt: nowIso,
        };
      });

      return res.json({
        success: true,
        appointmentId: createdPrefId || slotId,
        slot: reservedSlotData,
        message: "Demo appointment preference submitted!",
      });
    } catch (error: any) {
      if (error?.message === "SLOT_EXPIRED") {
        return res.status(409).json({
          success: false,
          error: "SLOT_EXPIRED",
          message: "This appointment time has already passed. Please choose an upcoming available time.",
        });
      }
      if (error?.message === "SLOT_ALREADY_BOOKED") {
        return res.status(409).json({
          success: false,
          error: "SLOT_ALREADY_BOOKED",
          message: "Sorry, this time slot was just booked. Please choose another available time.",
        });
      }
      if (error?.message === "URGENT_SLOT_RESTRICTED") {
        return res.status(403).json({
          success: false,
          error: "URGENT_SLOT_RESTRICTED",
          message: "Reserved urgent care slots can only be booked for urgent dental needs.",
        });
      }
      if (error?.message === "SLOT_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          error: "SLOT_NOT_FOUND",
          message: "Appointment slot not found.",
        });
      }

      console.error("Error in /api/reserve-slot:", error);
      return res.status(500).json({
        success: false,
        error: "TRANSACTION_FAILED",
        message: "Sorry, I couldn't complete that reservation right now. Please try confirming again, or select another available time.",
      });
    }
  });

  // Reset demo slots endpoint for rapid testing and demonstration cycles
  app.post("/api/reset-demo-slots", async (_req, res) => {
    try {
      const { seedDemoAppointmentSlots } = await import("./src/services/demoSlotsService");
      const seeded = await seedDemoAppointmentSlots(true);
      return res.json({ success: true, count: seeded.length });
    } catch (err: any) {
      console.error("Error resetting demo slots:", err);
      return res.status(500).json({ success: false, error: "Unable to reset demo slots right now. Please try again." });
    }
  });

  // Admin: Get all demo slots
  app.get("/api/admin/slots", async (_req, res) => {
    try {
      const { getDemoAppointmentSlots } = await import("./src/services/demoSlotsService");
      const slots = await getDemoAppointmentSlots();
      return res.json({ success: true, slots });
    } catch (err: any) {
      console.error("Error in GET /api/admin/slots:", err);
      return res.status(500).json({ success: false, error: "Unable to fetch demo slots right now." });
    }
  });

  // Admin: Update demo slot status (available <-> booked)
  app.post("/api/admin/slots/update-status", async (req, res) => {
    try {
      const { slotId, status } = req.body;
      if (!slotId || !['available', 'booked'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: "Valid slotId and status ('available' or 'booked') are required.",
        });
      }

      const slotRef = doc(db, "demo_appointment_slots", slotId);
      const nowIso = new Date().toISOString();
      await updateDoc(slotRef, {
        status,
        updatedAt: nowIso,
      });

      return res.json({ success: true, slotId, status, updatedAt: nowIso });
    } catch (err: any) {
      console.error("Error in POST /api/admin/slots/update-status:", err);
      return res.status(500).json({ success: false, error: "Unable to update slot status right now." });
    }
  });

  // Admin: Add new demo appointment slot (with duplicate prevention, operating hours & Sunday validation)
  app.post("/api/admin/slots/add", async (req, res) => {
    try {
      const { date, time, location, type } = req.body;
      if (!date || !time) {
        return res.status(400).json({
          success: false,
          error: "MISSING_FIELDS",
          message: "Date and time are required.",
        });
      }

      const { validateSlotParameters, CLINIC_LOCATION_STRING } = await import("./src/services/adminSlotsService");
      const validation = validateSlotParameters(String(date), String(time));

      if (!validation.valid || !validation.normalizedDate || !validation.normalizedTime) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_FAILED",
          message: validation.error || "Invalid slot parameters.",
        });
      }

      const normalizedDate = validation.normalizedDate;
      const normalizedTime = validation.normalizedTime;
      const normalizedLocation = (location && String(location).trim()) || CLINIC_LOCATION_STRING;
      const slotType = type === "urgent" ? "urgent" : "normal";

      // Check for duplicate slot with the same date and time
      const slotsCol = collection(db, "demo_appointment_slots");
      const q = query(slotsCol, where("date", "==", normalizedDate));
      const snap = await getDocs(q);

      const isDuplicate = snap.docs.some((docSnap) => {
        const d = docSnap.data();
        const sTime = normalizeSlotTime(d.time || "");
        return sTime.toLowerCase() === normalizedTime.toLowerCase();
      });

      if (isDuplicate) {
        return res.status(409).json({
          success: false,
          error: "DUPLICATE_SLOT",
          message: `A slot for date ${normalizedDate} and time ${normalizedTime} already exists.`,
        });
      }

      const cleanTime = normalizedTime.replace(/[^a-zA-Z0-9]/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const docId = `slot_${normalizedDate}_${cleanTime}_${randomSuffix}`;
      const nowIso = new Date().toISOString();

      const newSlot = {
        id: docId,
        date: normalizedDate,
        time: normalizedTime,
        type: slotType,
        location: normalizedLocation,
        status: "available",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, "demo_appointment_slots", docId), newSlot);

      return res.json({ success: true, slot: newSlot });
    } catch (err: any) {
      console.error("Error in POST /api/admin/slots/add:", err);
      return res.status(500).json({ success: false, error: "Unable to add appointment slot right now. Please try again." });
    }
  });

  // Admin: Edit available demo slot
  app.post("/api/admin/slots/edit", async (req, res) => {
    try {
      const { slotId, time, type } = req.body;
      if (!slotId || !time) {
        return res.status(400).json({
          success: false,
          error: "MISSING_FIELDS",
          message: "Slot ID and new time are required.",
        });
      }

      const { adminEditSlot } = await import("./src/services/adminSlotsService");
      const result = await adminEditSlot(slotId, { time, type: type === "urgent" ? "urgent" : "normal" });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error("Error in POST /api/admin/slots/edit:", err);
      return res.status(500).json({ success: false, error: "Unable to edit slot right now. Please try again." });
    }
  });

  // Admin: Disable available demo slot (soft-delete)
  app.post("/api/admin/slots/disable", async (req, res) => {
    try {
      const { slotId } = req.body;
      if (!slotId) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SLOT_ID",
          message: "Slot ID is required.",
        });
      }

      const { adminDisableSlot } = await import("./src/services/adminSlotsService");
      const result = await adminDisableSlot(slotId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error("Error in POST /api/admin/slots/disable:", err);
      return res.status(500).json({ success: false, error: "Unable to disable slot right now. Please try again." });
    }
  });

  // Admin: Delete demo appointment slot
  app.post("/api/admin/slots/delete", async (req, res) => {
    try {
      const { slotId } = req.body;
      if (!slotId) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SLOT_ID",
          message: "Slot ID is required.",
        });
      }

      const slotRef = doc(db, "demo_appointment_slots", slotId);
      await deleteDoc(slotRef);

      return res.json({ success: true, slotId });
    } catch (err: any) {
      console.error("Error in POST /api/admin/slots/delete:", err);
      return res.status(500).json({ success: false, error: "Unable to delete slot right now. Please try again." });
    }
  });

  // Chat API endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required." });
      }

      const client = getGeminiClient();

      if (!client) {
        // Fallback to knowledge-grounded local response engine
        const reply = getLocalConciergeAnswer(message);
        return res.json({ reply, source: "grounded-rules" });
      }

      // Build conversation contents for Gemini
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

      if (Array.isArray(history)) {
        for (const item of history.slice(-8)) {
          if (item.role === "user" || item.role === "model") {
            contents.push({
              role: item.role,
              parts: [{ text: item.text }],
            });
          }
        }
      }

      contents.push({
        role: "user",
        parts: [{ text: message }],
      });

      let reply = "";
      // Prioritize the fastest flash models with minimal thinking overhead and strict token limits for fast conversational replies
      const candidateConfigs = [
        {
          model: "gemini-3.1-flash-lite",
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 250,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        {
          model: "gemini-3.6-flash",
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 250,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        {
          model: "gemini-3.8-flash",
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 250,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      ];

      for (const candidate of candidateConfigs) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 4500)
          );
          const response = await Promise.race([
            client.models.generateContent({
              model: candidate.model,
              contents: contents as any,
              config: candidate.config,
            }),
            timeoutPromise,
          ]);
          if (response && response.text) {
            reply = sanitizePlainText(response.text);
            break;
          }
        } catch {
          // Continue to next candidate model seamlessly
          continue;
        }
      }

      if (!reply) {
        reply = sanitizePlainText(getLocalConciergeAnswer(message));
        return res.json({ reply, source: "grounded-rules" });
      }

      return res.json({ reply, source: "gemini" });
    } catch {
      const fallbackReply = sanitizePlainText(getLocalConciergeAnswer(req.body?.message || ""));
      return res.json({ reply: fallbackReply, source: "grounded-fallback" });
    }
  });

  // Setup Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Clock, User, CheckCircle2, Phone, AlertCircle, X, RotateCcw } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';
import { PatientType, DemoAppointmentSlot } from '../types';
import { getDemoAppointmentSlots, reserveDemoSlot } from '../services/demoSlotsService';
import { getHoustonCurrentDateTime, isSlotOrAppointmentExpired } from '../utils/clinicTime';
import { subscribeToAdminAuth } from '../services/adminAuthService';

interface AppointmentDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isSundayDate = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return false;
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0;
};

export const AppointmentDemoModal: React.FC<AppointmentDemoModalProps> = ({ isOpen, onClose }) => {
  const currentHouston = useMemo(() => getHoustonCurrentDateTime(), []);
  const [patientType, setPatientType] = useState<PatientType>('new');
  const [preferredDate, setPreferredDate] = useState(() => getHoustonCurrentDateTime().dateStr);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [reason, setReason] = useState('Routine Checkup & Cleaning');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Security guard: Ensure this modal never renders for unauthenticated or unauthorized users
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeToAdminAuth((state) => {
      setIsAuthorized(!state.loading && !!state.user && state.isAuthorized);
    });
    return () => unsubscribe();
  }, []);

  // Details captured upon successful reservation
  const [confirmedSlot, setConfirmedSlot] = useState<{
    date: string;
    time: string;
    location: string;
  } | null>(null);

  // Firestore appointment slots state
  const [slots, setSlots] = useState<DemoAppointmentSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const dynamicTestDates = useMemo(() => {
    const [hY, hM, hD] = currentHouston.dateStr.split('-').map(Number);
    const base = new Date(Date.UTC(hY, hM - 1, hD, 12, 0, 0));
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return [0, 1, 2, 3, 4].map((offset) => {
      const d = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000);
      const yr = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const da = String(d.getUTCDate()).padStart(2, '0');
      const dateStr = `${yr}-${mo}-${da}`;
      const isSun = d.getUTCDay() === 0;
      const label =
        offset === 0
          ? `Today (${monthNames[d.getUTCMonth()]} ${d.getUTCDate()})`
          : offset === 1
          ? `Tomorrow (${monthNames[d.getUTCMonth()]} ${d.getUTCDate()})`
          : `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()} (${dayNames[d.getUTCDay()]})`;
      return { dateStr, label, isSunday: isSun };
    });
  }, [currentHouston.dateStr]);

  // Suggested visit reasons (strictly general, non-diagnostic)
  const visitReasons = [
    'Routine Checkup & Cleaning',
    'Dental Implant Consultation',
    'Full-Mouth Implant Consultation',
    'Invisalign® / Clear Aligners Consultation',
    'Cosmetic Dentistry / Teeth Whitening',
    'Dental Crown or Bridge Consultation',
    'Urgent Dental Discomfort / Emergency Visit',
    'Sedation Dentistry Consultation',
    'General Dental Question / Second Opinion',
  ];

  // Helper to load or refresh slots for a specific date from Firestore
  const fetchSlots = useCallback(async (dateToFetch: string) => {
    if (!dateToFetch || isSundayDate(dateToFetch)) {
      setSlots([]);
      return;
    }

    setIsLoadingSlots(true);
    setSlotsError(null);

    try {
      const data = await getDemoAppointmentSlots(dateToFetch);
      setSlots(data);
    } catch (err) {
      console.error('Error fetching slots from Firestore:', err);
      setSlotsError('Could not load slots from database.');
      setSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  // Query Firestore slots when preferredDate changes
  useEffect(() => {
    if (!preferredDate) {
      setSlots([]);
      setSelectedSlotId('');
      setPreferredTime('');
      setBookingError(null);
      return;
    }

    setSelectedSlotId('');
    setPreferredTime('');
    setBookingError(null);

    if (isSundayDate(preferredDate)) {
      setSlots([]);
      return;
    }

    fetchSlots(preferredDate);
  }, [preferredDate, fetchSlots]);

  const isSunday = isSundayDate(preferredDate);
  const availableSlots = slots.filter((s) => s.status === 'available');
  const hasNoAvailableSlots =
    !isSunday && !isLoadingSlots && preferredDate !== '' && (slots.length === 0 || availableSlots.length === 0);

  const handleSelectSlot = (slot: DemoAppointmentSlot) => {
    if (slot.status === 'booked') return;
    setSelectedSlotId(slot.id);
    setPreferredTime(slot.time);
    setBookingError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferredDate || isSunday || !selectedSlotId || availableSlots.length === 0 || isReserving) {
      return;
    }

    setIsReserving(true);
    setBookingError(null);

    try {
      const result = await reserveDemoSlot({
        slotId: selectedSlotId,
        patientType,
        reason,
        date: preferredDate,
        time: preferredTime,
      });

      if (result.success) {
        const slotData = result.slot;
        setConfirmedSlot({
          date: slotData?.date || preferredDate,
          time: slotData?.time || preferredTime,
          location: slotData?.location || `${CLINIC_INFO.locationName}: ${CLINIC_INFO.address}, ${CLINIC_INFO.cityStateZip}`,
        });
        setIsSubmitted(true);
      } else {
        // Slot has already become booked or transaction failed
        setBookingError(
          result.message || 'Sorry, this time slot was just booked. Please choose another available time.'
        );
        // Clear selected slot
        setSelectedSlotId('');
        setPreferredTime('');
        // Immediately refresh available slots from Firestore so the UI updates
        await fetchSlots(preferredDate);
      }
    } catch (err: any) {
      console.error('Reservation submission error:', err);
      setBookingError('Sorry, this time slot was just booked. Please choose another available time.');
      setSelectedSlotId('');
      setPreferredTime('');
      await fetchSlots(preferredDate);
    } finally {
      setIsReserving(false);
    }
  };

  const handleResetDemoSlots = async () => {
    try {
      setIsLoadingSlots(true);
      const res = await fetch('/api/reset-demo-slots', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResetSuccessMessage('Demo appointment slots reset to initial state.');
        setTimeout(() => setResetSuccessMessage(null), 3500);
        setSelectedSlotId('');
        setPreferredTime('');
        setBookingError(null);
        await fetchSlots(preferredDate);
      }
    } catch (err) {
      console.error('Failed to reset demo slots:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setBookingError(null);
    onClose();
  };

  if (!isOpen || !isAuthorized) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg font-['Outfit']">
                Request an Appointment
              </h3>
              <p className="text-xs text-slate-400">
                Greenspoint Location • Dental Care & Implants of Houston
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Required Prominent Disclaimer Label */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-950 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold text-amber-900">
              Demo Appointment Request — Not Connected to Clinic Scheduling
            </strong>
            <p className="text-[11px] text-amber-800 mt-0.5">
              This interactive widget demonstrates the booking preference flow only. No personal medical history, insurance IDs, or payment info will be collected.
            </p>
          </div>
        </div>

        {/* Form Body or Submitted Screen */}
        <div className="p-6 overflow-y-auto flex-1">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Reset success notification */}
              {resetSuccessMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resetSuccessMessage}</span>
                </div>
              )}

              {/* Immediate Double-Booking Error Alert */}
              {bookingError && (
                <div
                  id="slot-booking-error-alert"
                  className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in"
                >
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-950">
                      Sorry, this time slot was just booked. Please choose another available time.
                    </p>
                    <p className="text-xs text-rose-700 mt-1">
                      Available slots have been automatically refreshed below.
                    </p>
                  </div>
                </div>
              )}

              {/* Patient Type Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Patient Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPatientType('new')}
                    className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      patientType === 'new'
                        ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-xs ring-1 ring-teal-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4 text-teal-600" />
                    <span>New Patient</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPatientType('existing')}
                    className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      patientType === 'existing'
                        ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-xs ring-1 ring-teal-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4 text-slate-500" />
                    <span>Existing Patient</span>
                  </button>
                </div>
              </div>

              {/* General Reason For Visit */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  General Reason for Visit
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                >
                  {visitReasons.map((r, i) => (
                    <option key={i} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  General consultation categories only. No clinical history required.
                </p>
              </div>

              {/* Preferred Date Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Preferred Date
                  </label>
                  <button
                    type="button"
                    onClick={handleResetDemoSlots}
                    title="Reset demo slots to initial testing state"
                    className="inline-flex items-center gap-1 text-[11px] text-teal-700 hover:text-teal-900 font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Demo Slots</span>
                  </button>
                </div>

                <input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  required
                  min={currentHouston.dateStr}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                />

                {/* Quick dynamic test date chips for easy demonstration */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] text-slate-500 font-medium">Quick dates:</span>
                  {dynamicTestDates.map((item) => (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => setPreferredDate(item.dateStr)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        preferredDate === item.dateStr
                          ? item.isSunday
                            ? 'bg-rose-700 text-white shadow-xs'
                            : 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Firestore Slots / Sunday / Empty state section */}
              <div className="space-y-3 pt-1">
                {isSunday ? (
                  /* Sunday closure message */
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-950">
                        Greenspoint office is closed on Sunday. Please choose another date.
                      </p>
                      <p className="text-xs text-rose-700 mt-1">
                        Our office hours are Monday–Friday: 08:00–19:00 and Saturday: 08:00–17:00.
                      </p>
                    </div>
                  </div>
                ) : isLoadingSlots ? (
                  /* Loading state */
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-600 flex items-center justify-center gap-2.5">
                    <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    <span>Querying Firestore for available appointment slots...</span>
                  </div>
                ) : hasNoAvailableSlots ? (
                  /* No available slots message */
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-950">
                          No appointment slots are currently available for this date. Please choose another date.
                        </p>
                      </div>
                    </div>

                    {slots.length > 0 && (
                      <div className="space-y-2 pt-1 opacity-80">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Fully Booked Slots for this Date:
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {slots.map((s) => (
                            <div
                              key={s.id}
                              className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-semibold flex items-center justify-between select-none cursor-not-allowed"
                            >
                              <span>{s.time} — Booked</span>
                              <span className="w-2 h-2 rounded-full bg-slate-300" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : slots.length > 0 ? (
                  /* Actual Firestore Appointment Slots list */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Available appointment times
                      </label>
                      <span className="text-[11px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        {availableSlots.length} available
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {slots.map((slot) => {
                        const isBooked = slot.status === 'booked';
                        const isSelected = selectedSlotId === slot.id;

                        if (isBooked) {
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              disabled
                              aria-disabled="true"
                              className="py-3 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-semibold flex items-center justify-between cursor-not-allowed select-none opacity-80"
                            >
                              <span>{slot.time} — Booked</span>
                              <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                            </button>
                          );
                        }

                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => handleSelectSlot(slot)}
                            className={`py-3 px-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-800 hover:border-teal-400 hover:bg-teal-50/40'
                            }`}
                          >
                            <span>{slot.time}</span>
                            {isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Clinic hours notice */}
              <div className="p-3.5 rounded-xl bg-slate-100/80 text-slate-600 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Greenspoint Hours: Monday–Friday: 08:00–19:00 | Saturday: 08:00–17:00 | Sunday: Closed</span>
              </div>

              {/* Form Submission Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    !preferredDate ||
                    isSunday ||
                    !selectedSlotId ||
                    availableSlots.length === 0 ||
                    isReserving
                  }
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                    !preferredDate ||
                    isSunday ||
                    !selectedSlotId ||
                    availableSlots.length === 0 ||
                    isReserving
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-gradient-to-r from-teal-700 to-cyan-800 hover:from-teal-800 hover:to-cyan-900 text-white active:scale-95 cursor-pointer'
                  }`}
                >
                  {isReserving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span>Checking Availability & Reserving...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Demo Preference</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Result Confirmation Screen */
            <div className="py-4 space-y-6 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-3">
                <h4 className="text-2xl font-bold text-slate-900 font-['Outfit']">
                  Demo appointment preference submitted!
                </h4>
                <p className="text-sm text-slate-700 max-w-md mx-auto leading-relaxed">
                  Your preferred date and time have been recorded for this demonstration.
                </p>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  This demo is not connected to the clinic's scheduling system. To book an actual appointment, please contact Dental Care & Implants of Houston directly.
                </p>
              </div>

              {/* Direct clinic phone numbers & Call button */}
              <div className="p-5 rounded-2xl bg-teal-50/90 border border-teal-200 text-center text-xs text-teal-950 space-y-4 max-w-md mx-auto">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between font-medium text-slate-700">
                    <span>New Patients:</span>
                    <a
                      href="tel:+12819462569"
                      className="font-bold text-teal-900 hover:underline flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-teal-600" />
                      (281) 946-2569
                    </a>
                  </div>
                  <div className="flex items-center justify-between font-medium text-slate-700">
                    <span>Other Callers:</span>
                    <a
                      href="tel:+18326487234"
                      className="font-bold text-slate-800 hover:underline flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      (832) 648-7234
                    </a>
                  </div>
                </div>

                <a
                  id="call-clinic-action-btn"
                  href="tel:+12819462569"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call the Clinic</span>
                </a>
              </div>

              {/* Recorded details summary */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-left text-xs space-y-2.5 max-w-md mx-auto text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Patient Type:</span>
                  <span className="font-semibold capitalize">{patientType} Patient</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Selected Reason:</span>
                  <span className="font-semibold text-right">{reason}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Selected Date:</span>
                  <span className="font-semibold">{confirmedSlot?.date || preferredDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Selected Time:</span>
                  <span className="font-semibold text-teal-800">{confirmedSlot?.time || preferredTime}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-500 font-medium shrink-0">Selected Location:</span>
                  <span className="font-semibold text-right text-[11px] text-slate-800">
                    {confirmedSlot?.location || `${CLINIC_INFO.locationName} (${CLINIC_INFO.address}, ${CLINIC_INFO.cityStateZip})`}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-amber-800 font-medium">
                  <span>Reservation Mode:</span>
                  <span className="bg-amber-100/80 px-2 py-0.5 rounded text-amber-900 font-semibold">
                    Demo Only • Not Clinic System
                  </span>
                </div>
              </div>

              <div className="flex gap-3 justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsSubmitted(false);
                    fetchSlots(preferredDate);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Change Selection
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


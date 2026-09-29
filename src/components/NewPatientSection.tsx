import React from 'react';
import { FileText, ShieldAlert, CheckCircle, Calendar, Phone, Sparkles } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';

interface NewPatientSectionProps {
  onOpenAppointmentModal: () => void;
  onAskNewPatient: () => void;
}

export const NewPatientSection: React.FC<NewPatientSectionProps> = ({
  onOpenAppointmentModal,
  onAskNewPatient,
}) => {
  return (
    <section id="new-patients-section" className="py-14 sm:py-20 bg-white border-b border-slate-200/70 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-bold uppercase tracking-wider mb-3 border border-teal-200/60">
            <span>Welcome To The Greenspoint Office</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">
            New Patient Information
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            We welcome new patients from teens through adults. Here is how your first visit and registration process works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm mb-4">
              Step 1
            </div>
            <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
              Access Patient Forms
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              New patients can access patient forms and registration documents through the clinic&apos;s patient resources or complete them in person upon arrival.
            </p>
          </div>

          <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm mb-4">
              Step 2
            </div>
            <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
              Comprehensive Examination
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              Your initial consultation includes high-resolution digital X-rays, 3D CBCT imaging if planning implants, periodontal evaluation, and oral exam.
            </p>
          </div>

          <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm mb-4">
              Step 3
            </div>
            <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
              Personalized Plan & Financing
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              Discuss clear treatment alternatives, financing plans (Cherry, CareCredit, Proceed, Sunbit, Alpheon, Basis), and convenient appointment slots.
            </p>
          </div>
        </div>

        {/* Privacy & Sensitivity Warning Box as strictly mandated */}
        <div className="bg-cyan-50/60 rounded-2xl p-6 border border-cyan-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 text-cyan-700" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 font-['Outfit']">
                Patient Privacy & Data Protection Notice
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                This web application is an informational concept demo. Never enter sensitive health information, medical histories, insurance policy ID numbers, Social Security numbers, or credit card details into online chats or demonstration forms. Real registration is completed securely through official clinic channels.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
            <button
              onClick={onAskNewPatient}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-teal-800 text-xs font-semibold border border-teal-200 shadow-2xs inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Ask Concierge</span>
            </button>
            <button
              onClick={onOpenAppointmentModal}
              className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs inline-flex items-center justify-center gap-2"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Try Demo Booking</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

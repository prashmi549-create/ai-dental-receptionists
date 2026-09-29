import React from 'react';
import { UserCheck, Sparkles, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { DOCTORS, CLINIC_INFO } from '../data/clinicData';

interface DoctorsSectionProps {
  onAskDoctor: (doctorName: string) => void;
}

export const DoctorsSection: React.FC<DoctorsSectionProps> = ({ onAskDoctor }) => {
  return (
    <section id="doctors-section" className="py-14 sm:py-20 bg-white border-b border-slate-200/70 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-bold uppercase tracking-wider mb-3 border border-teal-200/60">
            <span>Clinical Providers</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">
            Greenspoint Doctors
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            The dental team practicing at the Greenspoint office of Dental Care & Implants of Houston:
          </p>
        </div>

        {/* 4 Doctors Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DOCTORS.map((doc, idx) => (
            <div
              key={idx}
              className="bg-slate-50/60 rounded-2xl p-6 border border-slate-200 hover:border-teal-300 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-teal-700 shadow-xs mb-4 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit'] group-hover:text-teal-700 transition-colors">
                  {doc.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>{doc.location}</span>
                </div>
                <div className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-200/70">
                  <span className="font-semibold text-slate-700">Practice:</span> Dental Care & Implants of Houston
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/70 flex flex-col gap-2">
                <button
                  onClick={() => onAskDoctor(`Who is ${doc.name} at Dental Care & Implants of Houston?`)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-teal-50 text-xs font-semibold text-teal-700 border border-slate-200 hover:border-teal-300 transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Ask Concierge</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Professional Presentation Note */}
        <div className="mt-10 p-5 rounded-2xl bg-teal-50/50 border border-teal-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-teal-950">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0" />
            <span>
              To speak with our Greenspoint office or schedule a consultation with our dental team, call our front desk directly.
            </span>
          </div>
          <div className="flex items-center gap-4 shrink-0 font-bold">
            <a
              href={`tel:${CLINIC_INFO.phoneNewPatients.replace(/[^0-9]/g, '')}`}
              className="inline-flex items-center gap-1.5 text-teal-800 hover:text-teal-900"
            >
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              New: {CLINIC_INFO.phoneNewPatients}
            </a>
            <span className="text-slate-300">|</span>
            <a
              href={`tel:${CLINIC_INFO.phoneOtherCallers.replace(/[^0-9]/g, '')}`}
              className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900"
            >
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {CLINIC_INFO.phoneOtherCallers}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

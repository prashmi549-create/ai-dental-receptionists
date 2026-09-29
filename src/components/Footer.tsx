import React from 'react';
import { MapPin, Phone, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';

interface FooterProps {
  onOpenChat: () => void;
  onOpenAppointmentModal: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenChat, onOpenAppointmentModal }) => {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-14 pb-10 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-slate-800">
          {/* Clinic Information */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-white font-bold">
                DC
              </div>
              <div>
                <h3 className="text-white font-bold text-lg font-['Outfit']">
                  Dental Care & Implants of Houston
                </h3>
                <p className="text-xs text-teal-400 font-medium">Greenspoint Location</p>
              </div>
            </div>

            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              Comprehensive dental care serving patients from teens through adults, specializing in dental implants, clear aligners, cosmetic enhancements, and restorative dentistry.
            </p>

            <div className="pt-2 text-xs text-slate-300 space-y-2">
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>{CLINIC_INFO.address}, {CLINIC_INFO.cityStateZip}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>Monday–Friday: 08:00–19:00 | Saturday: 08:00–17:00</span>
              </p>
            </div>
          </div>

          {/* Direct Phone Lines */}
          <div className="lg:col-span-4 space-y-4">
            <h4 className="text-white font-bold text-sm uppercase tracking-wider font-['Outfit']">
              Direct Clinic Phone Lines
            </h4>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-slate-400 text-[11px]">New Patients Line</div>
                <a
                  href={`tel:${CLINIC_INFO.phoneNewPatients.replace(/[^0-9]/g, '')}`}
                  className="text-white font-bold text-sm hover:text-teal-400 transition-colors flex items-center gap-1.5 mt-0.5"
                >
                  <Phone className="w-3.5 h-3.5 text-teal-400" />
                  {CLINIC_INFO.phoneNewPatients}
                </a>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="text-slate-400 text-[11px]">All Other Callers</div>
                <a
                  href={`tel:${CLINIC_INFO.phoneOtherCallers.replace(/[^0-9]/g, '')}`}
                  className="text-white font-bold text-sm hover:text-teal-400 transition-colors flex items-center gap-1.5 mt-0.5"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {CLINIC_INFO.phoneOtherCallers}
                </a>
              </div>
            </div>
          </div>

          {/* Quick Concept Navigation */}
          <div className="lg:col-span-3 space-y-4">
            <h4 className="text-white font-bold text-sm uppercase tracking-wider font-['Outfit']">
              Concept Demonstration
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <button
                  onClick={onOpenChat}
                  className="hover:text-teal-300 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span>Launch AI Dental Concierge</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenAppointmentModal}
                  className="hover:text-teal-300 transition-colors"
                >
                  Request Appointment (Demo)
                </button>
              </li>
              <li>
                <a href="#services-section" className="hover:text-teal-300 transition-colors">
                  Dental Services & Implants
                </a>
              </li>
              <li>
                <a href="#doctors-section" className="hover:text-teal-300 transition-colors">
                  Greenspoint Doctors
                </a>
              </li>
              <li>
                <a href="#financing-section" className="hover:text-teal-300 transition-colors">
                  Insurance & Financing
                </a>
              </li>
              <li>
                <a href="#location-section" className="hover:text-teal-300 transition-colors">
                  Office Hours & Location
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer & AIWebTeck Label */}
        <div className="pt-8 space-y-4 text-xs text-slate-400">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 leading-relaxed text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">
              Important Concept Disclosure:
            </p>
            <p>
              This is an independent demonstration created using publicly available information from the clinic&apos;s website. Dental Care & Implants of Houston does not operate, endorse, or manage this software application. The AI assistant is intended for informational demonstration and front-desk orientation only; it does not provide dental diagnosis, medical advice, or treatment prescriptions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-[11px] text-slate-500">
            {/* Required subtle label */}
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="font-semibold text-slate-400">
                AIWebTeck — AI Dental Concierge Concept
              </span>
            </div>

            <div>
              Greenspoint Office • 165 Greens Rd, Houston, TX 77060
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

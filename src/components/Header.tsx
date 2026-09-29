import React from 'react';
import { Phone, Clock, MapPin, Sparkles, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';

interface HeaderProps {
  onOpenChat: (initialQuery?: string) => void;
  onOpenAppointmentModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenChat, onOpenAppointmentModal }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* AIWebTeck Concept Demo Disclaimer Banner */}
      <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 tracking-wide uppercase">
              AIWebTeck Concept Demo
            </span>
            <span className="text-slate-300 text-[11px] sm:text-xs">
              Independent concept created from publicly available information. Not an official clinic application.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-slate-300 text-[11px]">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" />
              165 Greens Rd, Houston, TX 77060
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              Open Mon–Fri 8a–7p, Sat 8a–5p
            </span>
          </div>
        </div>
      </div>

      {/* Main Dental Practice Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Clinic Brand & Location */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-700 via-teal-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-cyan-600/20 ring-1 ring-white/30">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.5 2 6 4.5 6 7c0 3 1.5 6.5 2.5 9.5.6 1.8 1.5 3.5 2.5 5 1-2 1.5-3.5 2-5 .7-2.1 1.7-4.8 2.5-7.5.3-.9.5-1.8.5-2C16 4.5 14.5 2 12 2z"/>
                <path d="M12 7c-1.5 0-2.5 1-2.5 2.5 0 2 1 4.5 2.5 7 1.5-2.5 2.5-5 2.5-7C14.5 8 13.5 7 12 7z" strokeWidth="1.5"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 tracking-tight text-base sm:text-lg leading-tight font-['Outfit']">
                  Dental Care & Implants of Houston
                </h1>
              </div>
              <p className="text-xs font-medium text-teal-700 flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                Greenspoint Location • 165 Greens Rd
              </p>
            </div>
          </div>

          {/* Quick Contact & Calls for Patients */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                New Patient Line
              </div>
              <a
                href={`tel:${CLINIC_INFO.phoneNewPatients.replace(/[^0-9]/g, '')}`}
                className="text-sm font-bold text-teal-700 hover:text-teal-800 transition-colors flex items-center justify-end gap-1.5"
              >
                <Phone className="w-3.5 h-3.5 text-teal-600" />
                {CLINIC_INFO.phoneNewPatients}
              </a>
            </div>

            <div className="h-8 w-px bg-slate-200"></div>

            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                All Other Callers
              </div>
              <a
                href={`tel:${CLINIC_INFO.phoneOtherCallers.replace(/[^0-9]/g, '')}`}
                className="text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-end gap-1.5"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {CLINIC_INFO.phoneOtherCallers}
              </a>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5">
            <button
              id="header-chat-concierge-btn"
              onClick={() => onOpenChat()}
              className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs sm:text-sm border border-teal-200/80 transition-all shadow-xs active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
              <span>AI Concierge</span>
            </button>

            <button
              id="header-request-appointment-btn"
              onClick={onOpenAppointmentModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white font-semibold text-xs sm:text-sm transition-all shadow-sm shadow-teal-700/20 active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Request Appointment</span>
              <span className="sm:hidden">Appointment</span>
            </button>
          </div>
        </div>

        {/* Secondary Sub-Navigation Links */}
        <div className="hidden md:flex items-center justify-between border-t border-slate-100 py-2.5 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-6">
            <a href="#services-section" className="hover:text-teal-700 transition-colors">Dental Services</a>
            <a href="#doctors-section" className="hover:text-teal-700 transition-colors">Greenspoint Dentists</a>
            <a href="#technology-section" className="hover:text-teal-700 transition-colors">Modern Technology</a>
            <a href="#financing-section" className="hover:text-teal-700 transition-colors">Insurance & Financing</a>
            <a href="#new-patients-section" className="hover:text-teal-700 transition-colors">New Patient Resources</a>
            <a href="#location-section" className="hover:text-teal-700 transition-colors">Hours & Directions</a>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Teens through Adults • Saturday Hours Available</span>
          </div>
        </div>
      </div>
    </header>
  );
};

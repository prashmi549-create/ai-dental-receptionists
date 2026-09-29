import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Clock, Navigation, ExternalLink, Calendar, ShieldCheck } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';
import { getClinicScheduleConfig, getLoadedClinicScheduleConfig } from '../services/scheduleConfigService';
import { ClinicScheduleConfig } from '../types';

interface LocationHoursSectionProps {
  onOpenAppointmentModal: () => void;
}

export const LocationHoursSection: React.FC<LocationHoursSectionProps> = ({ onOpenAppointmentModal }) => {
  const [config, setConfig] = useState<ClinicScheduleConfig>(getLoadedClinicScheduleConfig());

  useEffect(() => {
    let active = true;
    getClinicScheduleConfig().then((c) => {
      if (active) setConfig(c);
    });
    return () => {
      active = false;
    };
  }, []);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    'Dental Care & Implants of Houston 165 Greens Rd Houston TX 77060'
  )}`;

  const isSatOpen = config.workingDays ? config.workingDays.includes('Saturday') : true;
  const isSunOpen = !!config.sundayOpen && (config.workingDays ? config.workingDays.includes('Sunday') : false);

  const displayHours = [
    {
      days: 'Monday – Friday',
      time: `${config.weekdayOpen || '8:00 AM'} – ${config.weekdayClose || '7:00 PM'}`,
    },
    {
      days: 'Saturday',
      time: isSatOpen ? `${config.saturdayOpen || '8:00 AM'} – ${config.saturdayClose || '5:00 PM'}` : 'Closed',
    },
    {
      days: 'Sunday',
      time: isSunOpen
        ? `${config.sundayOpenTime || '9:00 AM'} – ${config.sundayCloseTime || '2:00 PM'}`
        : 'Closed',
    },
  ];

  return (
    <section id="location-section" className="py-14 sm:py-20 bg-slate-50/70 border-b border-slate-200/70 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/70 text-teal-800 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Greenspoint Location & Accessibility</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">
            Office Hours & Location
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            Conveniently located on Greens Rd in North Houston, offering evening hours on weekdays and Saturday appointments.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Location & Contact Information */}
          <div className="lg:col-span-5 space-y-6">
            {/* Address Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                    Greenspoint Office
                  </h3>
                  <p className="text-xs text-slate-500">Houston, Texas</p>
                </div>
              </div>

              <div className="space-y-1 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{CLINIC_INFO.name}</p>
                <p>{CLINIC_INFO.address}</p>
                <p>{CLINIC_INFO.cityStateZip}</p>
                <p className="text-slate-500 text-xs">{CLINIC_INFO.country}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                >
                  <Navigation className="w-4 h-4 text-teal-600" />
                  <span>Get Driving Directions (Google Maps)</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </div>
            </div>

            {/* Direct Phone Lines */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                    Direct Phone Numbers
                  </h3>
                  <p className="text-xs text-slate-500">Official Greenspoint Clinic Lines</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-3.5 rounded-xl bg-teal-50/50 border border-teal-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-teal-800 block">
                      New Patients
                    </span>
                    <a
                      href={`tel:${CLINIC_INFO.phoneNewPatients.replace(/[^0-9]/g, '')}`}
                      className="text-base font-bold text-teal-900 hover:underline"
                    >
                      {CLINIC_INFO.phoneNewPatients}
                    </a>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-600 text-white shadow-2xs">
                    Call Now
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block">
                      All Other Callers
                    </span>
                    <a
                      href={`tel:${CLINIC_INFO.phoneOtherCallers.replace(/[^0-9]/g, '')}`}
                      className="text-base font-bold text-slate-800 hover:underline"
                    >
                      {CLINIC_INFO.phoneOtherCallers}
                    </a>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                    Front Desk
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Office Hours & Interactive Map Preview */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            {/* Hours Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                      Greenspoint Office Hours
                    </h3>
                    <p className="text-xs text-slate-500">Convenient schedules for working families</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isSatOpen ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {isSatOpen ? 'Saturday Open' : (isSunOpen ? 'Sunday Open' : 'Weekdays Only')}
                </span>
              </div>

              <div className="divide-y divide-slate-100 text-sm">
                {displayHours.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{item.days}</span>
                    <span
                      className={`font-medium ${
                        item.time === 'Closed' ? 'text-slate-400' : 'text-teal-800'
                      }`}
                    >
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
                <span>Serving teens through adults for comprehensive care</span>
                <button
                  onClick={onOpenAppointmentModal}
                  className="font-semibold text-teal-700 hover:underline"
                >
                  Request Visit Demo →
                </button>
              </div>
            </div>

            {/* Simulated Map Visual Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs overflow-hidden relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Greenspoint Map Locator
                </span>
                <span className="text-xs text-teal-700 font-semibold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  165 Greens Rd
                </span>
              </div>

              {/* Styled clean map frame */}
              <div className="h-44 w-full rounded-2xl bg-gradient-to-tr from-slate-100 via-teal-50/40 to-slate-200 border border-slate-200 relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#0d9488_1px,transparent_1px)] [background-size:16px_16px]"></div>
                
                {/* Simulated Pins */}
                <div className="relative z-10 flex flex-col items-center animate-bounce">
                  <div className="px-3 py-1.5 rounded-xl bg-teal-800 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 ring-2 ring-white">
                    <MapPin className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Dental Care & Implants</span>
                  </div>
                  <div className="w-2.5 h-2.5 bg-teal-800 rotate-45 -mt-1.5 ring-1 ring-white"></div>
                </div>

                <div className="absolute bottom-3 right-3 z-10">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs text-xs font-semibold text-slate-800 border border-slate-200 shadow-xs hover:bg-white inline-flex items-center gap-1"
                  >
                    <span>Open in Maps</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

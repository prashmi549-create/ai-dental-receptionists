import React from 'react';
import { Sparkles, Calendar, Clock, MapPin, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import { CLINIC_INFO } from '../data/clinicData';

interface HeroProps {
  onOpenChat: (query?: string) => void;
  onOpenAppointmentModal: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenChat, onOpenAppointmentModal }) => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-teal-50/50 via-white to-slate-50/40 py-12 sm:py-16 lg:py-20 border-b border-slate-200/60">
      {/* Subtle modern background decorative shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute -top-24 right-10 w-96 h-96 rounded-full bg-cyan-200/40 blur-3xl"></div>
        <div className="absolute bottom-0 -left-20 w-80 h-80 rounded-full bg-teal-200/30 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Main Hero Copy */}
          <div className="lg:col-span-7 text-left space-y-6">
            {/* Location & Practice Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-teal-200/80 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-slate-700">
                Greenspoint Location • 165 Greens Rd, Houston, TX
              </span>
            </div>

            {/* Requested Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12] font-['Outfit']">
              Your Smile <span className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 bg-clip-text text-transparent">Starts Here</span>
            </h1>

            {/* Requested Supporting Text */}
            <p className="text-lg sm:text-xl text-slate-600 font-normal leading-relaxed max-w-2xl">
              Get quick answers about dental services, appointments, office hours, financing, and more.
            </p>

            {/* Key Clinic Assurances */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Teens through Adults</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Open Saturdays 08:00–17:00</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Digital 3D CBCT & CEREC</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              {/* Primary CTA */}
              <button
                id="hero-chat-concierge-cta"
                onClick={() => onOpenChat()}
                className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-800 hover:from-teal-700 hover:to-cyan-900 text-white font-bold text-base shadow-lg shadow-teal-700/25 transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
              >
                <Sparkles className="w-5 h-5 text-cyan-300 animate-pulse" />
                <span>Chat with AI Dental Concierge</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Secondary CTA */}
              <button
                id="hero-request-appointment-cta"
                onClick={onOpenAppointmentModal}
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-base border border-slate-300 shadow-sm transition-all hover:border-slate-400 active:scale-[0.99]"
              >
                <Calendar className="w-5 h-5 text-teal-700" />
                <span>Request an Appointment</span>
              </button>
            </div>

            {/* Disclaimer reassurance */}
            <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Independent AIWebTeck concept demo. Real patient consultations are conducted directly by clinic staff.</span>
            </p>
          </div>

          {/* Quick Interactive Concierge Card on Hero Right */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/70 border border-slate-200/90 relative">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-100/80 flex items-center justify-center text-teal-700">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-['Outfit']">
                      AI Dental Concierge
                    </h3>
                    <p className="text-xs text-slate-500">
                      Greenspoint Front-Desk Assistant
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200/80">
                  Ready to assist
                </span>
              </div>

              {/* Welcome Preview Balloon */}
              <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs sm:text-sm text-slate-700 space-y-2">
                <p className="font-semibold text-slate-900">
                  &ldquo;Hi! I&apos;m the AI Dental Concierge. I can help you find information about services, office hours, doctors, financing, new-patient information, and contacting the clinic.&rdquo;
                </p>
                <p className="text-xs text-slate-500">
                  Ask any question or tap a popular topic below to get an instant answer:
                </p>
              </div>

              {/* Instant Prompt Starters */}
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => onOpenChat('What services do you offer?')}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/80 text-xs font-medium text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-200 transition-all flex items-center justify-between group"
                >
                  <span>&ldquo;What services do you offer?&rdquo;</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                </button>
                <button
                  onClick={() => onOpenChat('Are you open on Saturday?')}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/80 text-xs font-medium text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-200 transition-all flex items-center justify-between group"
                >
                  <span>&ldquo;Are you open on Saturday?&rdquo;</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                </button>
                <button
                  onClick={() => onOpenChat('Who are the dentists at the Greenspoint location?')}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/80 text-xs font-medium text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-200 transition-all flex items-center justify-between group"
                >
                  <span>&ldquo;Who are the dentists at Greenspoint?&rdquo;</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                </button>
                <button
                  onClick={() => onOpenChat('What financing options are available?')}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/80 text-xs font-medium text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-200 transition-all flex items-center justify-between group"
                >
                  <span>&ldquo;What financing options are available?&rdquo;</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                </button>
              </div>

              {/* Bottom Quick Status */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Mon–Fri 08:00–19:00, Sat 08:00–17:00
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Houston, TX 77060
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

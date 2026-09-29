import React from 'react';
import { CreditCard, ShieldCheck, AlertCircle, Phone, Sparkles } from 'lucide-react';
import { FINANCING_PARTNERS, CLINIC_INFO } from '../data/clinicData';

interface FinancingSectionProps {
  onAskFinancing: (query: string) => void;
}

export const FinancingSection: React.FC<FinancingSectionProps> = ({ onAskFinancing }) => {
  return (
    <section id="financing-section" className="py-14 sm:py-20 bg-slate-50/70 border-b border-slate-200/70 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-100/70 text-cyan-800 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Payment Flexibility & Insurance</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">
            Insurance & Financing
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            We believe quality dental care and implant procedures should be accessible with transparent financial arrangements.
          </p>
        </div>

        {/* Two-Column Overview: Insurance Guide & Financing Partners */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* Insurance Information Card */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-7 sm:p-8 border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 font-['Outfit']">
                Dental Insurance Coverage
              </h3>
              <p className="text-slate-600 text-sm mt-3 leading-relaxed">
                Coverage for dental exams, preventive cleanings, and restorative treatments depends on each patient&apos;s individual dental plan, co-pays, deductibles, and annual maximums.
              </p>

              <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 space-y-2">
                <p className="font-semibold text-slate-900">How to confirm your benefits:</p>
                <p>
                  Because coverage details vary significantly by insurer and employer plan, coverage should be confirmed directly with our front desk prior to treatment.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <button
                onClick={() => onAskFinancing("How does dental insurance work at the Greenspoint location?")}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs sm:text-sm font-semibold border border-teal-200/70 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>Ask AI Concierge About Insurance</span>
              </button>
            </div>
          </div>

          {/* Financing Providers Cards */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 font-['Outfit']">
                    Publicly Described Financing Options
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-1">
                    The practice works with several reputable third-party healthcare financing partners:
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>

              {/* 6 Financing Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FINANCING_PARTNERS.map((partner, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-teal-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-slate-900 text-base font-['Outfit']">
                        {partner.name}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                        {partner.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {partner.tagline}
                    </p>
                  </div>
                ))}
              </div>

              {/* Strict Disclaimer Guardrail Box */}
              <div className="mt-6 p-4 rounded-2xl bg-amber-50/90 border border-amber-200/80 flex items-start gap-3 text-xs text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Important Financing Disclaimer:</p>
                  <p className="text-amber-900 leading-relaxed">
                    Financing terms, interest rates, monthly installments, credit approvals, and eligibility are determined directly by each respective financing lender. Dental Care & Implants of Houston does not guarantee approval, interest rates, or specific payment amounts.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

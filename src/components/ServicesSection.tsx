import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Cpu, ShieldCheck, ArrowRight } from 'lucide-react';
import { SERVICES, TECHNOLOGIES } from '../data/clinicData';

interface ServicesSectionProps {
  onAskService: (serviceName: string) => void;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({ onAskService }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = [
    'All',
    'Restorative & Implants',
    'Cosmetic & Ortho',
    'General & Preventive',
    'Specialty & Urgent',
  ];

  const filteredServices = selectedCategory === 'All'
    ? SERVICES
    : SERVICES.filter((s) => s.category === selectedCategory);

  return (
    <section id="services-section" className="py-14 sm:py-20 bg-slate-50/70 border-b border-slate-200/70 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/70 text-teal-800 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Comprehensive Dental Solutions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">
            Publicly Described Dental Services
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            Serving teens through adults at the Greenspoint location with gentle, modern care from routine checkups to full-arch dental implant restorations.
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
                    {service.category}
                  </span>
                  {service.badge && (
                    <span className="text-[11px] font-semibold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-200">
                      {service.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors font-['Outfit']">
                  {service.name}
                </h3>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  {service.description}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => onAskService(`Tell me about ${service.name} at Dental Care & Implants of Houston.`)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Ask AI Concierge</span>
                  <ArrowRight className="w-3 h-3 ml-0.5" />
                </button>
                <span className="text-[11px] text-slate-400">Greenspoint</span>
              </div>
            </div>
          ))}
        </div>

        {/* Modern Dental Technology Subsection */}
        <div id="technology-section" className="mt-16 bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/90 shadow-sm scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
                <Cpu className="w-4 h-4" />
                <span>Clinical Precision & Safety</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 font-['Outfit']">
                Modern Dental Technology
              </h3>
              <p className="text-slate-600 text-sm mt-1">
                The practice utilizes advanced dental equipment to provide comfortable, accurate care.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 shrink-0">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Advanced Imaging Suite</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {TECHNOLOGIES.map((tech, i) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/70">
                <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center text-teal-800 font-bold text-sm mb-3">
                  0{i + 1}
                </div>
                <h4 className="text-base font-bold text-slate-900 font-['Outfit']">
                  {tech.title}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  {tech.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

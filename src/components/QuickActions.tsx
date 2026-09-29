import React from 'react';

interface QuickActionsProps {
  onSelectAction: (actionType: string, query: string, targetSectionId?: string) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelectAction }) => {
  const actions = [
    {
      id: 'services',
      emoji: '🦷',
      title: 'Services',
      description: 'Implants, Invisalign, cosmetic & general care',
      query: 'What services do you offer?',
      targetSectionId: 'services-section',
      highlightColor: 'hover:border-teal-400 group-hover:text-teal-700',
      badge: '14+ Services',
    },
    {
      id: 'doctors',
      emoji: '👨‍⚕️',
      title: 'Doctors',
      description: 'Greenspoint dentists & clinical team',
      query: 'Who are the dentists at the Greenspoint location?',
      targetSectionId: 'doctors-section',
      highlightColor: 'hover:border-blue-400 group-hover:text-blue-700',
      badge: '4 Dentists',
    },
    {
      id: 'appointment',
      emoji: '📅',
      title: 'Request an Appointment',
      description: 'Interactive demo visit request flow',
      query: 'How can I request an appointment?',
      targetSectionId: 'appointment-demo-section',
      highlightColor: 'hover:border-emerald-400 group-hover:text-emerald-700',
      badge: 'Demo Flow',
    },
    {
      id: 'hours',
      emoji: '🕐',
      title: 'Office Hours',
      description: 'Mon–Fri 08:00–19:00, Sat 08:00–17:00',
      query: 'Are you open on Saturday? What are your hours?',
      targetSectionId: 'location-section',
      highlightColor: 'hover:border-amber-400 group-hover:text-amber-700',
      badge: 'Saturday Open',
    },
    {
      id: 'financing',
      emoji: '💳',
      title: 'Insurance & Financing',
      description: 'Cherry, CareCredit, Proceed & more',
      query: 'What financing options and insurance information are available?',
      targetSectionId: 'financing-section',
      highlightColor: 'hover:border-blue-400 group-hover:text-blue-700',
      badge: '6 Options',
    },
    {
      id: 'new-patients',
      emoji: '📋',
      title: 'New Patients',
      description: 'Registration resources & first visit guide',
      query: 'How can I become a new patient?',
      targetSectionId: 'new-patients-section',
      highlightColor: 'hover:border-teal-400 group-hover:text-teal-700',
      badge: 'Quick Guide',
    },
    {
      id: 'location',
      emoji: '📍',
      title: 'Location',
      description: '165 Greens Rd, Houston, TX 77060',
      query: 'Where is the office located?',
      targetSectionId: 'location-section',
      highlightColor: 'hover:border-teal-400 group-hover:text-teal-700',
      badge: 'Greenspoint',
    },
    {
      id: 'contact',
      emoji: '📞',
      title: 'Contact Us',
      description: 'Direct phone lines for new & existing callers',
      query: 'How can I contact the office?',
      targetSectionId: 'location-section',
      highlightColor: 'hover:border-teal-400 group-hover:text-teal-700',
      badge: 'Call Lines',
    },
    {
      id: 'emergency',
      emoji: '🚨',
      title: 'Dental Emergency',
      description: 'Urgent dental care guidelines & prompt triage',
      query: 'What should I do in a dental emergency?',
      targetSectionId: 'services-section',
      highlightColor: 'hover:border-rose-400 group-hover:text-rose-700 border-rose-200/80 bg-rose-50/30',
      badge: 'Urgent Care',
    },
  ];

  return (
    <section className="py-10 sm:py-14 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 mb-1">
              <span>Instant Concierge Topics</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-['Outfit']">
              Quick Actions
            </h2>
            <p className="text-slate-600 text-sm mt-1 max-w-xl">
              Select any quick topic below to load instant clinic answers directly inside the AI Dental Concierge.
            </p>
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            Click any button to open in assistant & jump to details
          </div>
        </div>

        {/* 9 Requested Quick Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {actions.map((act) => (
            <button
              key={act.id}
              id={`quick-action-${act.id}`}
              onClick={() => onSelectAction(act.id, act.query, act.targetSectionId)}
              className={`group text-left p-4 sm:p-5 rounded-2xl border transition-all duration-200 bg-white hover:bg-slate-50/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
                act.id === 'emergency' ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <span className="text-2xl sm:text-3xl p-2 rounded-xl bg-slate-50 border border-slate-100 group-hover:scale-105 transition-transform shrink-0">
                  {act.emoji}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700 transition-colors">
                  {act.badge}
                </span>
              </div>
              <h3 className={`text-base font-bold text-slate-900 ${act.highlightColor} transition-colors font-['Outfit']`}>
                {act.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {act.description}
              </p>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-teal-700">
                <span>Ask AI Concierge</span>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

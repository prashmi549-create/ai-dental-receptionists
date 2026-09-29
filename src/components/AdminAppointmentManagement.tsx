import React, { useState, useMemo } from 'react';
import {
  AdminAppointment,
  AppointmentFilterType,
  DemoAppointmentSlot,
} from '../types';
import {
  formatAppointmentDate,
  formatAppointmentDateFull,
  formatPhoneNumber,
  parseTimeToMinutes,
  sortAppointmentsChronologically,
} from '../services/adminAppointmentsService';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';
import {
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
} from '../utils/clinicTime';
import { computeEndTime } from '../services/scheduleConfigService';
import {
  Search,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ChevronRight,
  Filter,
  X,
  Phone,
  User,
  ShieldCheck,
  RefreshCw,
  Loader2,
  CalendarDays,
  Tag,
  ArrowUpDown,
} from 'lucide-react';

interface AdminAppointmentManagementProps {
  appointments: AdminAppointment[];
  slots: DemoAppointmentSlot[];
  adminEmail: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  activeFilter?: AppointmentFilterType;
  onFilterChange?: (filter: AppointmentFilterType) => void;
  initialFilter?: AppointmentFilterType;
  selectedAppointment?: AdminAppointment | null;
  onSelectAppointment?: (appointment: AdminAppointment | null) => void;
  onAppointmentUpdated?: () => void;
}

export const AdminAppointmentManagement: React.FC<AdminAppointmentManagementProps> = ({
  appointments,
  slots,
  adminEmail,
  isLoading = false,
  onRefresh,
  activeFilter: controlledFilter,
  onFilterChange,
  initialFilter = 'all',
  selectedAppointment: controlledAppointment,
  onSelectAppointment,
  onAppointmentUpdated,
}) => {
  // Filter and Search states
  const [internalFilter, setInternalFilter] = useState<AppointmentFilterType>(initialFilter);
  const activeFilter = controlledFilter !== undefined ? controlledFilter : internalFilter;
  const setActiveFilter = (filter: AppointmentFilterType) => {
    if (onFilterChange) {
      onFilterChange(filter);
    }
    setInternalFilter(filter);
  };

  const [searchQuery, setSearchQuery] = useState('');

  // Selected appointment for details modal
  const [internalSelectedAppointment, setInternalSelectedAppointment] =
    useState<AdminAppointment | null>(null);
  const selectedAppointment =
    controlledAppointment !== undefined ? controlledAppointment : internalSelectedAppointment;
  const setSelectedAppointment = (appt: AdminAppointment | null) => {
    if (onSelectAppointment) {
      onSelectAppointment(appt);
    }
    setInternalSelectedAppointment(appt);
  };

  // Houston clinic dynamic current date & time (America/Chicago)
  const houstonNow = useMemo(() => getHoustonCurrentDateTime(), [appointments, slots]);
  const todayDate = houstonNow.dateStr;

  // Real-time Counts for each filter category directly from actual Firestore records
  const filterCounts = useMemo(() => {
    const isCancelled = (a: AdminAppointment) =>
      a.status === 'Cancelled' || a.status?.toLowerCase() === 'cancelled';

    const isPastAppt = (a: AdminAppointment) =>
      !isCancelled(a) &&
      (a.date < todayDate ||
        (a.date === todayDate && isSlotOrAppointmentExpired(a.date, a.time, houstonNow)) ||
        !!a.isPast);

    const isUpcomingAppt = (a: AdminAppointment) =>
      !isCancelled(a) &&
      !a.isPast &&
      (a.date > todayDate ||
        (a.date === todayDate && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)));

    return {
      all: appointments.length,
      today: appointments.filter((a) => a.date === todayDate && !isCancelled(a)).length,
      upcoming: appointments.filter(isUpcomingAppt).length,
      past: appointments.filter(isPastAppt).length,
      cancelled: appointments.filter(isCancelled).length,
      urgent: appointments.filter((a) => a.isUrgent && isUpcomingAppt(a)).length,
      new: appointments.filter((a) => a.patientType === 'new' && isUpcomingAppt(a)).length,
      existing: appointments.filter((a) => a.patientType === 'existing' && isUpcomingAppt(a)).length,
    };
  }, [appointments, todayDate, houstonNow]);

  // Filtered and Sorted Appointments
  const filteredAppointments = useMemo(() => {
    const isCancelled = (a: AdminAppointment) =>
      a.status === 'Cancelled' || a.status?.toLowerCase() === 'cancelled';

    const isPastAppt = (a: AdminAppointment) =>
      !isCancelled(a) &&
      (a.date < todayDate ||
        (a.date === todayDate && isSlotOrAppointmentExpired(a.date, a.time, houstonNow)) ||
        !!a.isPast);

    const isUpcomingAppt = (a: AdminAppointment) =>
      !isCancelled(a) &&
      !a.isPast &&
      (a.date > todayDate ||
        (a.date === todayDate && !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)));

    let list: AdminAppointment[] = [];

    if (activeFilter === 'today') {
      // 4. TODAY: show appointments for the current Houston clinic date
      // Past appointment times should not be treated as active; upcoming appointments appear first; sorted chronologically
      const todayAll = appointments.filter((a) => a.date === todayDate && !isCancelled(a));
      const todayUpcoming = todayAll.filter(
        (a) => !isSlotOrAppointmentExpired(a.date, a.time, houstonNow) && !a.isPast
      );
      const todayPast = todayAll.filter(
        (a) => isSlotOrAppointmentExpired(a.date, a.time, houstonNow) || !!a.isPast
      );

      const sortedUpcoming = sortAppointmentsChronologically(todayUpcoming, 'asc');
      const sortedPast = sortAppointmentsChronologically(todayPast, 'asc');
      list = [...sortedUpcoming, ...sortedPast];
    } else if (activeFilter === 'upcoming') {
      // 5. UPCOMING: active future appointments, earliest upcoming appointment first, no cancelled
      const upcomingList = appointments.filter(isUpcomingAppt);
      list = sortAppointmentsChronologically(upcomingList, 'asc');
    } else if (activeFilter === 'past') {
      // 6. PAST: appointments whose appointment start time has already passed, historical records
      const pastList = appointments.filter(isPastAppt);
      list = sortAppointmentsChronologically(pastList, 'asc');
    } else if (activeFilter === 'cancelled') {
      // 7. CANCELLED: cancelled appointments only
      const cancelledList = appointments.filter(isCancelled);
      list = sortAppointmentsChronologically(cancelledList, 'desc');
    } else if (activeFilter === 'urgent') {
      // 13. URGENT: active urgent appointments
      const urgentList = appointments.filter((a) => a.isUrgent && isUpcomingAppt(a));
      list = sortAppointmentsChronologically(urgentList, 'asc');
    } else if (activeFilter === 'new') {
      // New Patients filter
      const newList = appointments.filter((a) => a.patientType === 'new' && isUpcomingAppt(a));
      list = sortAppointmentsChronologically(newList, 'asc');
    } else if (activeFilter === 'existing') {
      // Existing Patients filter
      const existingList = appointments.filter(
        (a) => a.patientType === 'existing' && isUpcomingAppt(a)
      );
      list = sortAppointmentsChronologically(existingList, 'asc');
    } else {
      // 'all' - 15. SORTING Default active appointment ordering:
      // 1. Today's upcoming appointments
      // 2. Nearest future appointments
      // Within each date: sort by earliest start time first.
      // Followed by today's past, earlier past, and cancelled records.
      const todayUpcoming = appointments.filter(
        (a) =>
          a.date === todayDate &&
          !isCancelled(a) &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow) &&
          !a.isPast
      );
      const futureUpcoming = appointments.filter(
        (a) => a.date > todayDate && !isCancelled(a) && !a.isPast
      );
      const todayPast = appointments.filter(
        (a) =>
          a.date === todayDate &&
          !isCancelled(a) &&
          (isSlotOrAppointmentExpired(a.date, a.time, houstonNow) || !!a.isPast)
      );
      const historicalPast = appointments.filter((a) => a.date < todayDate && !isCancelled(a));
      const cancelledRecords = appointments.filter(isCancelled);

      list = [
        ...sortAppointmentsChronologically(todayUpcoming, 'asc'),
        ...sortAppointmentsChronologically(futureUpcoming, 'asc'),
        ...sortAppointmentsChronologically(todayPast, 'asc'),
        ...sortAppointmentsChronologically(historicalPast, 'asc'),
        ...sortAppointmentsChronologically(cancelledRecords, 'desc'),
      ];
    }

    // 8. SEARCH: Patient name (case-insensitive) or Phone number (formatted or digits)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const queryDigits = query.replace(/\D/g, '');
      list = list.filter((a) => {
        const nameMatch = (a.patientName || '').toLowerCase().includes(query);
        const rawPhone = (a.patientPhone || a.phone || '').toLowerCase();
        const phoneDigits = rawPhone.replace(/\D/g, '');
        const phoneMatch =
          rawPhone.includes(query) ||
          (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));
        return nameMatch || phoneMatch;
      });
    }

    return list;
  }, [appointments, activeFilter, searchQuery, todayDate, houstonNow]);

  // Synchronize modal state if appointment was updated in real time
  const activeModalAppointment = useMemo(() => {
    if (!selectedAppointment) return null;
    return appointments.find((a) => a.id === selectedAppointment.id) || selectedAppointment;
  }, [selectedAppointment, appointments]);

  return (
    <div id="admin-appointments-management-section" className="space-y-6">
      {/* Appointments Management Header Card */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">
                Appointment Management
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-full">
                Operations View
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/80 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Centralized appointment tracking, cancellation, rescheduling, and duration management for clinic staff.
            </p>
          </div>

          {onRefresh && (
            <button
              id="btn-refresh-appointments"
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Syncing...' : 'Sync Appointments'}</span>
            </button>
          )}
        </div>

        {/* Quick Metrics Bar (Counts from actual Firestore data) */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            id="metric-today-appointments"
            onClick={() => setActiveFilter('today')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'today'
                ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Today's Schedule</span>
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900 font-['Outfit']">
                {filterCounts.today}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">appointments</span>
            </div>
          </div>

          <div
            id="metric-upcoming-appointments"
            onClick={() => setActiveFilter('upcoming')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'upcoming'
                ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Upcoming Active</span>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900 font-['Outfit']">
                {filterCounts.upcoming}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">scheduled</span>
            </div>
          </div>

          <div
            id="metric-urgent-appointments"
            onClick={() => setActiveFilter('urgent')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'urgent'
                ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Urgent Priority</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-amber-700 font-['Outfit']">
                {filterCounts.urgent}
              </span>
              <span className="text-[11px] text-amber-600 font-medium">active cases</span>
            </div>
          </div>

          <div
            id="metric-cancelled-appointments"
            onClick={() => setActiveFilter('cancelled')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'cancelled'
                ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-400/20'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Cancelled Log</span>
              <Ban className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-700 font-['Outfit']">
                {filterCounts.cancelled}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">released</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Appointment Table Container */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
        {/* Filters Toolbar & Search Box */}
        <div className="p-4 border-b border-slate-200/80 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1 sm:pb-0">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 mr-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                <span>Filters:</span>
              </span>

              {/* 1. Today */}
              <button
                id="filter-btn-today"
                type="button"
                onClick={() => setActiveFilter('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'today'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Today ({filterCounts.today})
              </button>

              {/* 2. Upcoming */}
              <button
                id="filter-btn-upcoming"
                type="button"
                onClick={() => setActiveFilter('upcoming')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'upcoming'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Upcoming ({filterCounts.upcoming})
              </button>

              {/* 3. All */}
              <button
                id="filter-btn-all"
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All ({filterCounts.all})
              </button>

              {/* 4. Past */}
              <button
                id="filter-btn-past"
                type="button"
                onClick={() => setActiveFilter('past')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'past'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Past ({filterCounts.past})
              </button>

              {/* 5. Cancelled */}
              <button
                id="filter-btn-cancelled"
                type="button"
                onClick={() => setActiveFilter('cancelled')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'cancelled'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancelled ({filterCounts.cancelled})
              </button>

              {/* 6. Urgent */}
              <button
                id="filter-btn-urgent"
                type="button"
                onClick={() => setActiveFilter('urgent')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'urgent'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Urgent ({filterCounts.urgent})
              </button>

              {/* 7. New Patients */}
              <button
                id="filter-btn-new-patients"
                type="button"
                onClick={() => setActiveFilter('new')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'new'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                New Patients ({filterCounts.new})
              </button>

              {/* 8. Existing Patients */}
              <button
                id="filter-btn-existing-patients"
                type="button"
                onClick={() => setActiveFilter('existing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeFilter === 'existing'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Existing Patients ({filterCounts.existing})
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="input-search-appointments"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient name or phone..."
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content States: Loading, Empty, or Table */}
        {isLoading ? (
          <div id="state-appointments-loading" className="p-16 text-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">Loading appointments...</p>
            <p className="text-xs text-slate-400 mt-1">Connecting to Firestore in real time</p>
          </div>
        ) : appointments.length === 0 ? (
          <div id="state-no-appointments" className="p-16 text-center text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">No appointments found.</p>
            <p className="text-xs text-slate-400 mt-1">
              Appointments booked through the AI Receptionist or Admin will appear here automatically.
            </p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div id="state-no-matching-appointments" className="p-16 text-center text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {searchQuery
                ? 'No matching appointment records.'
                : activeFilter === 'today'
                ? `No appointments scheduled for today (${formatAppointmentDate(todayDate)}).`
                : activeFilter === 'upcoming'
                ? 'No active upcoming appointments found.'
                : activeFilter === 'cancelled'
                ? 'No cancelled appointments in historical records.'
                : activeFilter === 'urgent'
                ? 'No urgent appointments currently in the schedule.'
                : activeFilter === 'past'
                ? 'No past appointments found in historical records.'
                : `No appointments found in the "${activeFilter}" view.`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery
                ? `No appointment records match "${searchQuery}". Check patient name or phone number.`
                : 'Try switching filters or adjusting your search query.'}
            </p>
            {(searchQuery || activeFilter !== 'all') && (
              <button
                id="btn-reset-filters"
                type="button"
                onClick={() => {
                  setActiveFilter('all');
                  setSearchQuery('');
                }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                Reset filters & search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Patient Full Name</th>
                  <th className="px-5 py-3.5">Phone Number</th>
                  <th className="px-5 py-3.5">Patient Type</th>
                  <th className="px-5 py-3.5">Appointment Date</th>
                  <th className="px-5 py-3.5">Time & Duration</th>
                  <th className="px-5 py-3.5">Appointment Type</th>
                  <th className="px-5 py-3.5">Priority</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAppointments.map((appt) => {
                  const isUrgent = appt.isUrgent;
                  const isExisting = appt.patientType === 'existing';
                  const isCancelled =
                    appt.status === 'Cancelled' || appt.status?.toLowerCase() === 'cancelled';
                  const isPast =
                    !isCancelled &&
                    (appt.date < todayDate ||
                      (appt.date === todayDate &&
                        isSlotOrAppointmentExpired(appt.date, appt.time, houstonNow)) ||
                      !!appt.isPast);

                  const startTime = appt.startTime || appt.time || '—';
                  const duration = appt.durationMinutes || appt.duration || 30;
                  const endTime =
                    appt.endTime ||
                    (startTime !== '—' ? computeEndTime(startTime, duration) : '');

                  return (
                    <tr
                      key={appt.id}
                      id={`appointment-row-${appt.id}`}
                      onClick={() => setSelectedAppointment(appt)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      {/* 1. Patient Full Name */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                          <span>{appt.patientName}</span>
                          {appt.patientId && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                              {appt.patientId}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Phone Number */}
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {formatPhoneNumber(appt.patientPhone || appt.phone)}
                      </td>

                      {/* 3. Patient Type */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium text-[11px] ${
                            isExisting
                              ? 'bg-teal-50 text-teal-800 border border-teal-200/70'
                              : 'bg-blue-50 text-blue-700 border border-blue-200/70'
                          }`}
                        >
                          {isExisting ? 'Existing Patient' : 'New Patient'}
                        </span>
                      </td>

                      {/* 4. Appointment Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatAppointmentDate(appt.date)}</span>
                          {appt.date === todayDate && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded-full">
                              Today
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Start Time, End Time & Duration */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{startTime}</span>
                          {endTime && endTime !== startTime && (
                            <span className="text-slate-500 font-normal">– {endTime}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {duration} min duration
                        </div>
                      </td>

                      {/* 6. Appointment Type (Reason / Service) */}
                      <td
                        className="px-5 py-3.5 max-w-xs truncate text-slate-600 font-medium"
                        title={appt.reason || appt.reasonForVisit || 'General Dental Consultation'}
                      >
                        {appt.reason || appt.reasonForVisit || 'General Dental Consultation'}
                      </td>

                      {/* 7. Priority: Normal / Urgent Indicator */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold text-[11px] ${
                            isUrgent
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isUrgent && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                          <span>{isUrgent ? 'Urgent' : 'Normal'}</span>
                        </span>
                      </td>

                      {/* 8. Status: Booked, Past, or Cancelled */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px] bg-slate-100 text-slate-600 border border-slate-200">
                            <Ban className="w-3 h-3 text-slate-400" />
                            <span>Cancelled</span>
                          </span>
                        ) : isPast ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px] bg-slate-100 text-slate-600 border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Past</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px] bg-teal-50 text-teal-800 border border-teal-200">
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                            <span>Booked</span>
                          </span>
                        )}
                      </td>

                      {/* 9. Action: Details */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAppointment(appt);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 group-hover:underline cursor-pointer"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        {!isLoading && filteredAppointments.length > 0 && (
          <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
            <span>
              Showing {filteredAppointments.length} of {appointments.length} appointments
            </span>
            <span className="text-[11px] text-slate-400">
              Times displayed in Houston Central Time (America/Chicago)
            </span>
          </div>
        )}
      </section>

      {/* Appointment Details & Management Modal (Cancel / Reschedule / Info) */}
      {activeModalAppointment && !onSelectAppointment && (
        <AppointmentDetailsModal
          appointment={activeModalAppointment}
          slots={slots}
          adminEmail={adminEmail}
          onClose={() => setSelectedAppointment(null)}
          onAppointmentUpdated={() => {
            if (onAppointmentUpdated) onAppointmentUpdated();
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};

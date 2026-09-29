import React, { useState, useMemo } from 'react';
import {
  AdminAppointment,
  AdminPatientRecord,
  PatientFilterType,
} from '../types';
import {
  filterPatients,
  formatPatientPhone,
} from '../services/adminPatientsService';
import { formatAppointmentDate } from '../services/adminAppointmentsService';
import { AdminPatientDetailsModal } from './AdminPatientDetailsModal';
import {
  Search,
  Users,
  UserCheck,
  UserPlus,
  Calendar,
  Clock,
  ChevronRight,
  Filter,
  X,
  Phone,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface AdminPatientManagementProps {
  patients: AdminPatientRecord[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSelectAppointment?: (appointment: AdminAppointment) => void;
}

export const AdminPatientManagement: React.FC<AdminPatientManagementProps> = ({
  patients,
  isLoading = false,
  error = null,
  onRefresh,
  onSelectAppointment,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<PatientFilterType>('all');
  const [selectedPatient, setSelectedPatient] = useState<AdminPatientRecord | null>(null);

  // Compute filtered patient list
  const filteredPatients = useMemo(() => {
    return filterPatients(patients, activeFilter, searchQuery);
  }, [patients, activeFilter, searchQuery]);

  // Metric counts
  const counts = useMemo(() => {
    const total = patients.length;
    const newPatients = patients.filter((p) => p.patientType === 'new').length;
    const existingPatients = patients.filter((p) => p.patientType === 'existing').length;
    const withUpcoming = patients.filter((p) => p.upcomingAppointments.length > 0).length;
    return { total, newPatients, existingPatients, withUpcoming };
  }, [patients]);

  return (
    <div id="section-admin-patient-management" className="space-y-6">
      {/* SECTION HEADER & SUMMARY METRICS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Patient Directory & Records
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {patients.length} Registered
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authorized administrator directory of registered patient profiles and visit histories.
              </p>
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer self-start sm:self-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* SUMMARY STATS BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div
            id="stat-patient-total"
            onClick={() => setActiveFilter('all')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Patients
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900 font-['Outfit']">{counts.total}</span>
              <span className="text-xs text-slate-500">profiles</span>
            </div>
          </div>

          <div
            id="stat-patient-new"
            onClick={() => setActiveFilter('new')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'new'
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              New Patients
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900 font-['Outfit']">{counts.newPatients}</span>
              <span className="text-xs text-slate-500">registered</span>
            </div>
          </div>

          <div
            id="stat-patient-existing"
            onClick={() => setActiveFilter('existing')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'existing'
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Existing Patients
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900 font-['Outfit']">{counts.existingPatients}</span>
              <span className="text-xs text-slate-500">profiles</span>
            </div>
          </div>

          <div
            id="stat-patient-upcoming"
            onClick={() => setActiveFilter('has_upcoming')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'has_upcoming'
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Active Upcoming
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900 font-['Outfit']">{counts.withUpcoming}</span>
              <span className="text-xs text-slate-500">with visits</span>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
          {/* SEARCH INPUT */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-patient-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient full name or phone number..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* FILTER BUTTONS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              id="filter-patient-all"
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({counts.total})
            </button>

            <button
              id="filter-patient-new"
              type="button"
              onClick={() => setActiveFilter('new')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === 'new'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              New Patients ({counts.newPatients})
            </button>

            <button
              id="filter-patient-existing"
              type="button"
              onClick={() => setActiveFilter('existing')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === 'existing'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Existing Patients ({counts.existingPatients})
            </button>

            <button
              id="filter-patient-has-upcoming"
              type="button"
              onClick={() => setActiveFilter('has_upcoming')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === 'has_upcoming'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Has Upcoming ({counts.withUpcoming})
            </button>

            <button
              id="filter-patient-no-upcoming"
              type="button"
              onClick={() => setActiveFilter('no_upcoming')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === 'no_upcoming'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              No Upcoming
            </button>
          </div>
        </div>
      </div>

      {/* ERROR MESSAGE IF ANY */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
              Error Loading Patients
            </h4>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1 bg-white border border-rose-300 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-50 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* PATIENT LIST TABLE / CARDS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading && patients.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Loading patient records...</p>
            <p className="text-xs text-slate-500 mt-1">
              Synchronizing with verified clinic Firestore database...
            </p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery ? 'No matching patients found' : 'No patients found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {searchQuery
                ? `No patient profiles match "${searchQuery}". Please check your search term or reset the filters.`
                : 'There are currently no patients matching the selected filter criteria.'}
            </p>
            {(searchQuery || activeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="mt-4 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Search & Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* TABLE HEADER (DESKTOP) */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-4">Patient Name & ID</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-2">Patient Type</div>
              <div className="col-span-1 text-center">Visits</div>
              <div className="col-span-2">Next / Recent Visit</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* PATIENT ROWS */}
            {filteredPatients.map((patient) => {
              const isNew = patient.patientType === 'new';
              const nextUpcoming = patient.upcomingAppointments[0];
              const recentPast = patient.pastAppointments[0];
              const displayAppt = nextUpcoming || recentPast;

              return (
                <div
                  key={patient.id}
                  id={`patient-row-${patient.id}`}
                  onClick={() => setSelectedPatient(patient)}
                  className="p-4 sm:p-5 md:px-6 md:py-4 hover:bg-blue-50/30 transition-colors cursor-pointer flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 md:items-center"
                >
                  {/* PATIENT NAME & ID */}
                  <div className="md:col-span-4 flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isNew
                          ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                          : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                      }`}
                    >
                      {isNew ? <UserPlus className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm truncate">
                          {patient.fullName}
                        </span>
                        {/* Mobile Type Badge */}
                        <span
                          className={`md:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isNew
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isNew ? 'New' : 'Existing'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono block truncate">
                        ID: {patient.id}
                      </span>
                    </div>
                  </div>

                  {/* PHONE NUMBER */}
                  <div className="md:col-span-2 flex items-center gap-1.5 text-xs text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium">{formatPatientPhone(patient.phone)}</span>
                  </div>

                  {/* PATIENT TYPE (DESKTOP) */}
                  <div className="hidden md:block md:col-span-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isNew
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isNew ? 'New Patient' : 'Existing Patient'}
                    </span>
                  </div>

                  {/* APPOINTMENT COUNT */}
                  <div className="md:col-span-1 flex md:justify-center items-center gap-1.5 text-xs">
                    <span className="md:hidden text-slate-500 font-medium">Appointments:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        patient.totalAppointmentsCount > 0
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      {patient.totalAppointmentsCount}
                    </span>
                  </div>

                  {/* NEXT / RECENT VISIT */}
                  <div className="md:col-span-2 text-xs">
                    {nextUpcoming ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 font-semibold text-emerald-700">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatAppointmentDate(nextUpcoming.date)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{nextUpcoming.startTime || nextUpcoming.time}</span>
                          {nextUpcoming.isUrgent && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                              Urgent
                            </span>
                          )}
                        </div>
                      </div>
                    ) : recentPast ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Past: {formatAppointmentDate(recentPast.date)}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block">
                          No upcoming visits
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">
                        No visits recorded
                      </span>
                    )}
                  </div>

                  {/* ACTION BUTTON */}
                  <div className="md:col-span-1 flex items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <span className="md:hidden text-xs text-blue-600 font-semibold">
                      View Patient Profile
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPatient(patient);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="View Patient Details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PATIENT DETAILS MODAL */}
      {selectedPatient && (
        <AdminPatientDetailsModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onSelectAppointment={(appt) => {
            setSelectedPatient(null);
            if (onSelectAppointment) {
              onSelectAppointment(appt);
            }
          }}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  AdminAppointment,
  AdminPatientRecord,
} from '../types';
import {
  formatPatientPhone,
} from '../services/adminPatientsService';
import {
  formatAppointmentDateFull,
} from '../services/adminAppointmentsService';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  UserCheck,
  UserPlus,
} from 'lucide-react';

interface AdminPatientDetailsModalProps {
  patient: AdminPatientRecord;
  onClose: () => void;
  onSelectAppointment?: (appointment: AdminAppointment) => void;
}

export const AdminPatientDetailsModal: React.FC<AdminPatientDetailsModalProps> = ({
  patient,
  onClose,
  onSelectAppointment,
}) => {
  const [activeAppointmentTab, setActiveAppointmentTab] = useState<
    'upcoming' | 'past' | 'cancelled'
  >('upcoming');

  const isNew = patient.patientType === 'new';

  return (
    <div
      id="modal-patient-details-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="modal-patient-details-card"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs ${
                isNew ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {isNew ? <UserPlus className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="patient-details-name"
                  className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight"
                >
                  {patient.fullName}
                </h2>
                <span
                  id="patient-details-type-badge"
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isNew
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {isNew ? 'New Patient' : 'Existing Patient'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                ID: {patient.id}
              </p>
            </div>
          </div>

          <button
            id="btn-close-patient-details"
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* PATIENT DEMOGRAPHICS / CONTACT CARD */}
          <div
            id="patient-details-contact-info"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-sm"
          >
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">
                Full Name
              </span>
              <span className="text-slate-800 font-medium">{patient.fullName}</span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">
                Phone Number
              </span>
              <a
                href={`tel:${patient.phone}`}
                className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5 text-blue-500" />
                <span>{formatPatientPhone(patient.phone)}</span>
              </a>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">
                Patient Type
              </span>
              <span className="text-slate-800 font-medium">
                {isNew ? 'New Patient' : 'Existing Patient'}
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">
                Total Appointments
              </span>
              <span className="text-slate-800 font-medium">
                {patient.totalAppointmentsCount} appointment
                {patient.totalAppointmentsCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* APPOINTMENTS TABS */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4 gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-600" />
                <span>Appointment History</span>
              </h3>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  id="tab-patient-appts-upcoming"
                  type="button"
                  onClick={() => setActiveAppointmentTab('upcoming')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeAppointmentTab === 'upcoming'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Upcoming ({patient.upcomingAppointments.length})
                </button>

                <button
                  id="tab-patient-appts-past"
                  type="button"
                  onClick={() => setActiveAppointmentTab('past')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeAppointmentTab === 'past'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Past ({patient.pastAppointments.length})
                </button>

                <button
                  id="tab-patient-appts-cancelled"
                  type="button"
                  onClick={() => setActiveAppointmentTab('cancelled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeAppointmentTab === 'cancelled'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancelled ({patient.cancelledAppointments.length})
                </button>
              </div>
            </div>

            {/* UPCOMING APPOINTMENTS LIST */}
            {activeAppointmentTab === 'upcoming' && (
              <div id="patient-upcoming-appointments-section" className="space-y-3">
                {patient.upcomingAppointments.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                    <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      No upcoming appointments
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This patient does not currently have any scheduled upcoming visits.
                    </p>
                  </div>
                ) : (
                  patient.upcomingAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/40 hover:bg-blue-50/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {formatAppointmentDateFull(appt.date)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              appt.isUrgent
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {appt.isUrgent ? 'Urgent Care' : 'Routine Visit'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Booked
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-slate-800">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            {appt.startTime || appt.time}
                            {appt.endTime ? ` – ${appt.endTime}` : ''}
                          </span>
                          {appt.durationMinutes && (
                            <span className="text-slate-500">
                              ({appt.durationMinutes} mins)
                            </span>
                          )}
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-mono text-[11px]">
                            ID: {appt.id}
                          </span>
                        </div>
                      </div>

                      {onSelectAppointment && (
                        <button
                          type="button"
                          onClick={() => onSelectAppointment(appt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer self-start sm:self-center"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PAST APPOINTMENTS LIST */}
            {activeAppointmentTab === 'past' && (
              <div id="patient-past-appointments-section" className="space-y-3">
                {patient.pastAppointments.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      No past appointment history
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      No previous completed clinic visits recorded for this patient.
                    </p>
                  </div>
                ) : (
                  patient.pastAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">
                            {formatAppointmentDateFull(appt.date)}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-200 text-slate-700">
                            Completed / Past
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                            {appt.isUrgent ? 'Urgent' : 'Routine'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {appt.startTime || appt.time}
                            {appt.endTime ? ` – ${appt.endTime}` : ''}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-mono text-[11px]">ID: {appt.id}</span>
                        </div>
                      </div>

                      {onSelectAppointment && (
                        <button
                          type="button"
                          onClick={() => onSelectAppointment(appt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer self-start sm:self-center"
                        >
                          <span>View</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* CANCELLED APPOINTMENTS LIST */}
            {activeAppointmentTab === 'cancelled' && (
              <div id="patient-cancelled-appointments-section" className="space-y-3">
                {patient.cancelledAppointments.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      No cancellations
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This patient has no cancelled appointments on record.
                    </p>
                  </div>
                ) : (
                  patient.cancelledAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">
                            {formatAppointmentDateFull(appt.date)}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            Cancelled
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                            {appt.isUrgent ? 'Urgent' : 'Routine'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {appt.startTime || appt.time}
                            {appt.endTime ? ` – ${appt.endTime}` : ''}
                          </span>
                          {appt.cancelledAt && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="text-rose-700 text-xs">
                                Cancelled on{' '}
                                {new Date(appt.cancelledAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </>
                          )}
                          <span className="text-slate-400">•</span>
                          <span className="font-mono text-[11px]">ID: {appt.id}</span>
                        </div>
                      </div>

                      {onSelectAppointment && (
                        <button
                          type="button"
                          onClick={() => onSelectAppointment(appt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer self-start sm:self-center"
                        >
                          <span>Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Authorized Administrator View • Protected Profile</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

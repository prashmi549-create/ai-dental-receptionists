import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ArrowLeft,
  LogOut,
  User,
  Users,
  UserPlus,
  UserCheck,
  AlertTriangle,
  Search,
  X,
  ChevronRight,
  Info,
  Flame,
  CalendarDays,
  Phone,
  FileText,
  Filter,
  Loader2,
  Ban,
  Settings,
  Bell,
  Sparkles,
  Activity,
  Code,
  Building2,
  BookOpen,
} from 'lucide-react';
import {
  AdminAppointment,
  AdminDashboardSummary,
  AppointmentFilterType,
  DemoAppointmentSlot,
  NotificationRecord,
  DemoPatient,
  AdminPatientRecord,
} from '../types';
import {
  subscribeToAdminData,
  fetchAdminData,
  formatAppointmentDate,
  formatAppointmentDateFull,
  formatPhoneNumber,
  sortAppointmentsChronologically,
  CLINIC_REFERENCE_TODAY,
} from '../services/adminAppointmentsService';
import {
  subscribeToNotifications,
  getAllNotifications,
} from '../services/notificationsService';
import {
  subscribeToPatients,
  buildAdminPatientRecords,
} from '../services/adminPatientsService';
import {
  deriveAppointmentDateTimeForNotification,
  getHoustonCurrentDateTime,
  isSlotOrAppointmentExpired,
} from '../utils/clinicTime';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';
import { AdminAppointmentManagement } from './AdminAppointmentManagement';
import { AdminSlotManagement } from './AdminSlotManagement';
import { AdminScheduleSettings } from './AdminScheduleSettings';
import { AdminNotificationsView } from './AdminNotificationsView';
import { AdminPatientManagement } from './AdminPatientManagement';
import { AppointmentDemoModal } from './AppointmentDemoModal';
import { AdminHealthCheck } from './AdminHealthCheck';
import { AdminEmbedCode } from './AdminEmbedCode';
import { AdminBusinessProfile } from './AdminBusinessProfile';
import { AdminBusinessKnowledge } from './AdminBusinessKnowledge';

interface DemoAdminDashboardProps {
  adminEmail: string;
  onLogout: () => void;
  onBackToWebsite: () => void;
}

export const DemoAdminDashboard: React.FC<DemoAdminDashboardProps> = ({
  adminEmail,
  onLogout,
  onBackToWebsite,
}) => {
  // Real-time data state
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [slots, setSlots] = useState<DemoAppointmentSlot[]>([]);
  const [metrics, setMetrics] = useState<AdminDashboardSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter and Search state
  const [activeFilter, setActiveFilter] = useState<AppointmentFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Details Modal state
  const [selectedAppointment, setSelectedAppointment] = useState<AdminAppointment | null>(null);
  const [isLegacyDemoModalOpen, setIsLegacyDemoModalOpen] = useState(false);

  // Active view tab: 'appointments', 'slots', 'patients', 'settings', 'notifications', 'health', 'embed', 'business', or 'knowledge'
  const [activeTab, setActiveTab] = useState<
    'appointments' | 'slots' | 'patients' | 'settings' | 'notifications' | 'health' | 'embed' | 'business' | 'knowledge'
  >('appointments');

  // Patients directory state
  const [rawPatients, setRawPatients] = useState<DemoPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  // Houston clinic dynamic current date & time (America/Chicago)
  const houstonNow = useMemo(
    () => getHoustonCurrentDateTime(),
    [appointments, slots, notifications, isRefreshing]
  );
  const todayDate = houstonNow.dateStr;

  // Active upcoming notifications count (Houston timezone awareness, excluding past/cancelled)
  const activeNotificationsCount = useMemo(() => {
    const apptMap = new Map<string, AdminAppointment>();
    appointments.forEach((a) => apptMap.set(a.id, a));
    return notifications.filter((n) => {
      const appt = n.appointmentId ? apptMap.get(n.appointmentId) : undefined;
      return deriveAppointmentDateTimeForNotification(n, appt).isUpcoming;
    }).length;
  }, [notifications, appointments]);

  // Operations Overview summary counts calculated directly from actual Firestore data
  const overviewCounts = useMemo(() => {
    const activeAppts = appointments.filter((a) => a.status !== 'Cancelled');

    // Today's appointments (booked for today)
    const todayAppts = activeAppts.filter((a) => a.date === todayDate);
    const todayNormal = todayAppts.filter((a) => !a.isUrgent).length;
    const todayUrgent = todayAppts.filter((a) => a.isUrgent).length;
    const todayNew = todayAppts.filter((a) => a.patientType === 'new').length;
    const todayExisting = todayAppts.filter((a) => a.patientType === 'existing').length;

    // Upcoming appointments (booked, after today, active/not past)
    const upcomingAppts = activeAppts.filter(
      (a) =>
        a.date > todayDate &&
        !a.isPast &&
        !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
    );
    const upcomingDates = new Set(upcomingAppts.map((a) => a.date));

    // Active urgent appointments (today active + upcoming active)
    const urgentAppts = activeAppts.filter(
      (a) =>
        a.isUrgent &&
        !a.isPast &&
        !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
    );

    // Active new patients (today active + upcoming active)
    const newPatients = activeAppts.filter(
      (a) =>
        a.patientType === 'new' &&
        !a.isPast &&
        !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
    );

    // Active existing patients (today active + upcoming active)
    const existingPatients = activeAppts.filter(
      (a) =>
        a.patientType === 'existing' &&
        !a.isPast &&
        !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
    );

    // Cancelled appointments (all historical cancellation records preserved in Firestore)
    const cancelledAppts = appointments.filter((a) => a.status === 'Cancelled');

    return {
      today: todayAppts.length,
      todayNormal,
      todayUrgent,
      todayNew,
      todayExisting,
      upcoming: upcomingAppts.length,
      upcomingDatesCount: upcomingDates.size,
      urgent: urgentAppts.length,
      urgentToday: urgentAppts.filter((a) => a.date === todayDate).length,
      urgentUpcoming: urgentAppts.filter((a) => a.date > todayDate).length,
      new: newPatients.length,
      newToday: newPatients.filter((a) => a.date === todayDate).length,
      newUpcoming: newPatients.filter((a) => a.date > todayDate).length,
      existing: existingPatients.length,
      existingToday: existingPatients.filter((a) => a.date === todayDate).length,
      existingUpcoming: existingPatients.filter((a) => a.date > todayDate).length,
      cancelled: cancelledAppts.length,
    };
  }, [appointments, todayDate, houstonNow]);

  // Nearest upcoming booked appointment indicator
  const nextAppointment = useMemo(() => {
    const activeCandidates = appointments.filter(
      (a) =>
        a.status !== 'Cancelled' &&
        !a.isPast &&
        !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
    );
    const sorted = sortAppointmentsChronologically(activeCandidates, 'asc');
    return sorted[0] || null;
  }, [appointments, houstonNow]);

  // Notification and automated reminder summary counts
  const notificationSummary = useMemo(() => {
    const pendingNotifs = notifications.filter((n) => n.status === 'pending').length;
    const sentNotifs = notifications.filter((n) => n.status === 'sent').length;
    const failedNotifs = notifications.filter((n) => n.status === 'failed').length;

    const reminders = notifications.filter(
      (n) => n.type === 'appointment_reminder_24h' || n.type === 'appointment_reminder_2h'
    );
    const pendingReminders = reminders.filter((r) => r.status === 'pending').length;
    const cancelledReminders = reminders.filter((r) => r.status === 'cancelled').length;

    return {
      pendingNotifs,
      sentNotifs,
      failedNotifs,
      totalNotifs: notifications.length,
      pendingReminders,
      cancelledReminders,
      totalReminders: reminders.length,
    };
  }, [notifications]);

  // Today's appointments (all booked for today, sorted earliest to latest)
  const todayAppointmentsList = useMemo(() => {
    const list = appointments.filter(
      (a) => a.date === todayDate && a.status !== 'Cancelled'
    );
    return sortAppointmentsChronologically(list, 'asc');
  }, [appointments, todayDate]);

  // Unified Patient Directory Records (Phase 9C: Joined with real-time appointments & sorted)
  const patientRecords = useMemo(() => {
    return buildAdminPatientRecords(rawPatients, appointments, todayDate);
  }, [rawPatients, appointments, todayDate]);

  // 1. Subscribe to Firestore real-time updates for appointments, slots, and notifications
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const unsubscribeAdmin = subscribeToAdminData(
      (data) => {
        setAppointments(data.appointments);
        setSlots(data.slots);
        setMetrics(data.summary);
        setIsLoading(false);
        setIsRefreshing(false);
        setError(null);
      },
      (errMessage) => {
        setError(errMessage);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    );

    const unsubscribeNotifs = subscribeToNotifications((notifList) => {
      setNotifications(notifList);
    });

    setPatientsLoading(true);
    const unsubscribePatients = subscribeToPatients(
      (patientList) => {
        setRawPatients(patientList);
        setPatientsLoading(false);
        setPatientsError(null);
      },
      (errMessage) => {
        setPatientsError(errMessage);
        setPatientsLoading(false);
      }
    );

    // Clean up real-time listeners when dashboard unmounts
    return () => {
      unsubscribeAdmin();
      unsubscribeNotifs();
      unsubscribePatients();
    };
  }, []);

  // 2. Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [adminData, notifData] = await Promise.all([
        fetchAdminData(),
        getAllNotifications(),
      ]);
      setAppointments(adminData.appointments);
      setSlots(adminData.slots);
      setMetrics(adminData.summary);
      setNotifications(notifData);
      setError(null);
    } catch {
      setError('Unable to load appointments right now. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 3. Compute dynamic counts for each filter category
  const filterCounts = useMemo(() => {
    return {
      all: appointments.length,
      today: appointments.filter(
        (a) =>
          a.date === todayDate &&
          !a.isPast &&
          a.status !== 'Cancelled' &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      ).length,
      upcoming: appointments.filter(
        (a) =>
          a.date > todayDate &&
          !a.isPast &&
          a.status !== 'Cancelled' &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      ).length,
      past: appointments.filter(
        (a) =>
          (!!a.isPast || isSlotOrAppointmentExpired(a.date, a.time, houstonNow)) &&
          a.status !== 'Cancelled'
      ).length,
      cancelled: appointments.filter((a) => a.status === 'Cancelled').length,
      urgent: appointments.filter(
        (a) =>
          a.isUrgent &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      ).length,
      new: appointments.filter(
        (a) =>
          a.patientType === 'new' &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      ).length,
      existing: appointments.filter(
        (a) =>
          a.patientType === 'existing' &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      ).length,
    };
  }, [appointments, todayDate, houstonNow]);

  // 4. Filter and search appointments
  const filteredAppointments = useMemo(() => {
    let list = [...appointments];

    // Apply active category filter
    if (activeFilter === 'today') {
      list = list.filter(
        (a) =>
          a.date === todayDate &&
          !a.isPast &&
          a.status !== 'Cancelled' &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      );
    } else if (activeFilter === 'upcoming') {
      list = list.filter(
        (a) =>
          a.date > todayDate &&
          !a.isPast &&
          a.status !== 'Cancelled' &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      );
    } else if (activeFilter === 'past') {
      list = list.filter(
        (a) =>
          (!!a.isPast || isSlotOrAppointmentExpired(a.date, a.time, houstonNow)) &&
          a.status !== 'Cancelled'
      );
    } else if (activeFilter === 'cancelled') {
      list = list.filter((a) => a.status === 'Cancelled');
    } else if (activeFilter === 'urgent') {
      list = list.filter(
        (a) =>
          a.isUrgent &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      );
    } else if (activeFilter === 'new') {
      list = list.filter(
        (a) =>
          a.patientType === 'new' &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      );
    } else if (activeFilter === 'existing') {
      list = list.filter(
        (a) =>
          a.patientType === 'existing' &&
          a.status !== 'Cancelled' &&
          !a.isPast &&
          !isSlotOrAppointmentExpired(a.date, a.time, houstonNow)
      );
    }

    // Apply search filter (patient name or phone number ONLY)
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

    // Chronological order: earliest date first, then earliest time first
    return sortAppointmentsChronologically(list, 'asc');
  }, [appointments, activeFilter, searchQuery, todayDate, houstonNow]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Application Header */}
      <header className="bg-white border-b border-slate-200/90 px-4 py-3 sm:px-6 shrink-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Brand & Clinic Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-semibold text-base sm:text-lg tracking-tight text-slate-900 font-['Outfit'] truncate">
                  AI Dental Receptionist
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full shrink-0">
                  Operations Console
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Dental Care & Implants of Houston • Greenspoint
              </p>
            </div>
          </div>

          {/* Admin User Info & Navigation Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap">
            {/* Authenticated Admin Email */}
            <div
              id="admin-email-display"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium"
              title="Authenticated Administrator"
            >
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="max-w-[150px] sm:max-w-[220px] truncate">{adminEmail}</span>
            </div>

            {/* Back to Patient Receptionist */}
            <button
              id="btn-return-receptionist"
              type="button"
              onClick={onBackToWebsite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer active:scale-95"
              title="Return to patient chat receptionist"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Receptionist</span>
            </button>

            {/* Logout Button (clean secondary action, not bright red) */}
            <button
              id="btn-admin-logout"
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-medium transition-colors cursor-pointer active:scale-95"
              title="Sign out of Operations Console"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Active Schedule Reference & Real-Time Sync Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/70 text-teal-700 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Clinic Schedule Local Time (Houston, TX)</p>
              <p className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                <span>{formatAppointmentDateFull(todayDate)}</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  {houstonNow.timeStr} • America/Chicago
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span className="font-medium text-[11px]">Real-time Sync Active</span>
            </div>

            <button
              id="btn-refresh-metrics"
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner if Firestore snapshot fails */}
        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load appointments right now.</p>
              <p className="text-xs text-red-700 mt-0.5">
                Check network connectivity or retry with the refresh button.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-xs underline font-semibold text-red-800 hover:text-red-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* SECTION 1: OPERATIONS OVERVIEW (6 SUMMARY CARDS + NEXT APPT & NOTIFICATIONS) */}
        <section id="section-operations-overview" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-['Outfit']">
                Daily Operations Overview
              </h2>
              <p className="text-xs text-slate-500">
                Live clinic schedule metrics computed directly from Firestore
              </p>
            </div>
          </div>

          {/* 6 Summary Cards - Visually Consistent Healthcare Palette */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5">
            {/* Card 1: Today's Appointments */}
            <div
              id="card-summary-today"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('today');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'today'
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Today
                </span>
                <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Outfit']">
                    {overviewCounts.today}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">scheduled</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Routine:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.todayNormal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Urgent:</span>
                  <span className="font-semibold text-amber-700">{overviewCounts.todayUrgent}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Upcoming Appointments */}
            <div
              id="card-summary-upcoming"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('upcoming');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'upcoming'
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Upcoming
                </span>
                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <CalendarDays className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Outfit']">
                    {overviewCounts.upcoming}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">after today</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Dates:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.upcomingDatesCount} dates</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Active booked</div>
              </div>
            </div>

            {/* Card 3: Urgent Appointments */}
            <div
              id="card-summary-urgent"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('urgent');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-amber-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'urgent'
                  ? 'border-amber-500 ring-2 ring-amber-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Urgent
                </span>
                <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-700 font-['Outfit']">
                    {overviewCounts.urgent}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">active</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Today:</span>
                  <span className="font-semibold text-amber-700">{overviewCounts.urgentToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Upcoming:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.urgentUpcoming}</span>
                </div>
              </div>
            </div>

            {/* Card 4: New Patients */}
            <div
              id="card-summary-new-patients"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('new');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-teal-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'new'
                  ? 'border-teal-500 ring-2 ring-teal-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  New Patients
                </span>
                <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                  <UserPlus className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Outfit']">
                    {overviewCounts.new}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">intakes</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Today:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.newToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Upcoming:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.newUpcoming}</span>
                </div>
              </div>
            </div>

            {/* Card 5: Existing Patients */}
            <div
              id="card-summary-existing-patients"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('existing');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'existing'
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Existing
                </span>
                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Outfit']">
                    {overviewCounts.existing}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">patients</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Today:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.existingToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Upcoming:</span>
                  <span className="font-semibold text-slate-800">{overviewCounts.existingUpcoming}</span>
                </div>
              </div>
            </div>

            {/* Card 6: Cancelled Appointments */}
            <div
              id="card-summary-cancelled"
              onClick={() => {
                setActiveTab('appointments');
                setActiveFilter('cancelled');
              }}
              className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer hover:border-slate-400 hover:shadow-xs ${
                activeTab === 'appointments' && activeFilter === 'cancelled'
                  ? 'border-slate-500 ring-2 ring-slate-500/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Cancelled
                </span>
                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                  <Ban className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-700 font-['Outfit']">
                    {overviewCounts.cancelled}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">archived</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                <span className="text-slate-500">Records preserved</span>
                <div className="text-[10px] text-slate-500 mt-0.5">Click to view log</div>
              </div>
            </div>
          </div>

          {/* Operational Status Panels: Next Appointment & Notifications/Reminders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Panel A: Next Appointment */}
            <div
              id="card-next-appointment"
              className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                      Next Appointment
                    </h3>
                  </div>
                  {nextAppointment && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      {nextAppointment.date === todayDate ? 'Today' : formatAppointmentDate(nextAppointment.date)}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  {isLoading ? (
                    <div className="py-4 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-blue-600" />
                      <span className="text-xs">Locating next appointment...</span>
                    </div>
                  ) : nextAppointment ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="text-base font-bold text-slate-900">
                            {nextAppointment.patientName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {nextAppointment.isUrgent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Urgent
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              Routine
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                            {nextAppointment.patientType === 'new' ? 'New Patient' : 'Existing Patient'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>{nextAppointment.time}</span>
                          {nextAppointment.endTime && (
                            <span className="text-slate-400 font-normal">→ {nextAppointment.endTime}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatPhoneNumber(nextAppointment.patientPhone)}</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <span className="font-semibold text-slate-700">Reason: </span>
                        <span>{nextAppointment.reason || (nextAppointment as any).serviceName || 'General dental visit'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-sm font-semibold text-slate-700">No upcoming appointments.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        There are currently no upcoming booked appointments on the clinic schedule.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {nextAppointment && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Nearest confirmed booking</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAppointment(nextAppointment)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    View Details & Actions →
                  </button>
                </div>
              )}
            </div>

            {/* Panel B: Notification & Reminder Status */}
            <div
              id="card-notification-reminder-status"
              className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                      <Bell className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                      Notification & Reminder Status
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {notificationSummary.totalNotifs} Records
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  {/* Notification Status Counts */}
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      System Notifications
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        {notificationSummary.pendingNotifs} Pending
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {notificationSummary.sentNotifs} Sent
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {notificationSummary.failedNotifs} Failed
                      </span>
                    </div>
                  </div>

                  {/* Reminder Status Counts */}
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Automated Reminders (24h & 2h)
                    </p>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-1 rounded-lg font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {notificationSummary.pendingReminders} Scheduled
                      </span>
                      <span className="px-2.5 py-1 rounded-lg font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {notificationSummary.cancelledReminders} Cancelled
                      </span>
                    </div>
                  </div>

                  {/* Provider Integration Notice */}
                  <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      Pending notifications wait for future SMS provider integration. No live SMS messages are dispatched.
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Queue & schedule log</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('notifications')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  Open Notifications View →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MAIN NAVIGATION TABS: HEALTHCARE SAAS OPERATIONS */}
        <div className="border-b border-slate-200/90 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none max-w-full">
            <button
              id="tab-view-appointments"
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'appointments'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Appointments</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                  activeTab === 'appointments' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {appointments.length}
              </span>
            </button>

            <button
              id="tab-view-slots"
              type="button"
              onClick={() => setActiveTab('slots')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'slots'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Slot Management</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                  activeTab === 'slots' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {slots.length}
              </span>
            </button>

            <button
              id="tab-view-patients"
              type="button"
              onClick={() => setActiveTab('patients')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'patients'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Patients</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                  activeTab === 'patients'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {patientRecords.length}
              </span>
            </button>

            <button
              id="tab-view-settings"
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Schedule Settings</span>
            </button>

            <button
              id="tab-view-notifications"
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'notifications'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Notifications</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                  activeTab === 'notifications'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {activeNotificationsCount}
              </span>
            </button>

            <button
              id="tab-view-health"
              type="button"
              onClick={() => setActiveTab('health')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'health'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>System Health</span>
            </button>

            <button
              id="tab-view-embed"
              type="button"
              onClick={() => setActiveTab('embed')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'embed'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Widget Embed</span>
            </button>

            <button
              id="tab-view-business"
              type="button"
              onClick={() => setActiveTab('business')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'business'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Business Profile</span>
            </button>

            <button
              id="tab-view-knowledge"
              type="button"
              onClick={() => setActiveTab('knowledge')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'knowledge'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Business Knowledge</span>
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab === 'slots' && (
              <button
                id="btn-open-legacy-demo-manager"
                type="button"
                onClick={() => setIsLegacyDemoModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100/80 text-blue-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                title="Open Simulated Availability Tester (Authorized Admin Only)"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Simulated Availability Tester</span>
              </button>
            )}

            <div className="text-xs text-slate-500">
              {activeTab === 'appointments'
                ? `${appointments.length} appointment record${appointments.length === 1 ? '' : 's'}`
                : activeTab === 'slots'
                ? `${slots.filter((s) => s.status === 'available').length} available slot${slots.filter((s) => s.status === 'available').length === 1 ? '' : 's'}`
                : activeTab === 'patients'
                ? `${patientRecords.length} registered patient profile${patientRecords.length === 1 ? '' : 's'}`
                : activeTab === 'notifications'
                ? `${activeNotificationsCount} active notification${activeNotificationsCount === 1 ? '' : 's'}`
                : activeTab === 'health'
                ? 'System diagnostics'
                : activeTab === 'embed'
                ? 'Widget snippet & preview'
                : activeTab === 'business'
                ? 'Clinic branding & profile'
                : activeTab === 'knowledge'
                ? 'Services & FAQ knowledge base'
                : 'Operating hours & durations'}
            </div>
          </div>
        </div>

        {/* CONDITIONAL CONTENT: APPOINTMENTS, SLOTS, PATIENTS, SETTINGS, HEALTH, EMBED, OR NOTIFICATIONS */}
        {activeTab === 'appointments' ? (
          <AdminAppointmentManagement
            appointments={appointments}
            slots={slots}
            adminEmail={adminEmail}
            isLoading={isLoading}
            onRefresh={handleRefresh}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            selectedAppointment={selectedAppointment}
            onSelectAppointment={setSelectedAppointment}
            onAppointmentUpdated={handleRefresh}
          />
        ) : activeTab === 'slots' ? (
          /* SECTION 2: SLOT MANAGEMENT SECTION */
          <AdminSlotManagement
            slots={slots}
            appointments={appointments}
            adminEmail={adminEmail}
            onNavigateToAppointment={(apptId) => {
              setActiveTab('appointments');
              const target = appointments.find((a) => a.id === apptId);
              if (target) {
                setSelectedAppointment(target);
              }
            }}
            onOpenScheduleSettings={() => setActiveTab('settings')}
            onRefresh={handleRefresh}
          />
        ) : activeTab === 'patients' ? (
          /* SECTION 3: PATIENT MANAGEMENT (PHASE 9C) */
          <AdminPatientManagement
            patients={patientRecords}
            isLoading={patientsLoading}
            error={patientsError}
            onRefresh={handleRefresh}
            onSelectAppointment={(appt) => {
              setSelectedAppointment(appt);
            }}
          />
        ) : activeTab === 'settings' ? (
          /* SECTION 4: CLINIC SCHEDULE SETTINGS */
          <AdminScheduleSettings
            adminEmail={adminEmail}
            onScheduleUpdated={handleRefresh}
          />
        ) : activeTab === 'health' ? (
          /* SECTION 6: SYSTEM HEALTH & DIAGNOSTICS (PHASE 10D) */
          <AdminHealthCheck
            currentAdminEmail={adminEmail}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
          />
        ) : activeTab === 'embed' ? (
          /* SECTION 7: WEBSITE EMBED CODE & INTEGRATION (PHASE 11A) */
          <AdminEmbedCode adminEmail={adminEmail} />
        ) : activeTab === 'business' ? (
          /* SECTION 8: BUSINESS PROFILE & CUSTOMIZATION (PHASE 11C) */
          <AdminBusinessProfile adminEmail={adminEmail} />
        ) : activeTab === 'knowledge' ? (
          /* SECTION 9: BUSINESS KNOWLEDGE & FAQS (PHASE 11D) */
          <AdminBusinessKnowledge adminEmail={adminEmail} />
        ) : (
          /* SECTION 5: NOTIFICATIONS & REMINDER STATUS (PHASE 6C) */
          <AdminNotificationsView
            notifications={notifications}
            appointments={appointments}
            isLoading={isLoading}
            onSelectAppointment={(appt) => {
              setSelectedAppointment(appt);
            }}
            onRefresh={handleRefresh}
          />
        )}

        {/* Schedule & Data Synchronization Notice */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">Clinic Schedule Operations:</span> Real-time appointment monitoring and schedule management synchronized with live clinic records. Administrative rescheduling and cancellations immediately release and update patient availability with verified conflict protection.
          </div>
        </div>
      </main>

      {/* Appointment Details Modal Panel */}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          slots={slots}
          adminEmail={adminEmail}
          onClose={() => setSelectedAppointment(null)}
          onAppointmentUpdated={handleRefresh}
        />
      )}

      {/* Authorized Admin Legacy Demo Appointment & Availability Tester */}
      <AppointmentDemoModal
        isOpen={isLegacyDemoModalOpen}
        onClose={() => {
          setIsLegacyDemoModalOpen(false);
          handleRefresh();
        }}
      />
    </div>
  );
};

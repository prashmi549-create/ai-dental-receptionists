import React, { useState, useMemo } from 'react';
import {
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Calendar,
  Phone,
  User,
  Ban,
  CalendarDays,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  History,
  MessageSquare,
  Info,
  ArrowRight,
  Archive,
  Sparkles,
} from 'lucide-react';
import { NotificationRecord, AdminAppointment } from '../types';
import {
  formatScheduledForDisplay,
  deriveAppointmentDateTimeForNotification,
  parseTimeToMinutes,
  getHoustonCurrentDateTime,
} from '../utils/clinicTime';
import { formatAppointmentDate } from '../services/adminAppointmentsService';

interface AdminNotificationsViewProps {
  notifications: NotificationRecord[];
  appointments: AdminAppointment[];
  isLoading?: boolean;
  onSelectAppointment?: (appointment: AdminAppointment) => void;
  onRefresh?: () => void;
}

export type NotificationViewScope = 'active' | 'history' | 'all';
type TypeFilter = 'all' | 'reminders' | 'confirmations' | 'cancellations' | 'rescheduled';
type StatusFilter = 'all' | 'pending' | 'cancelled' | 'sent';

export const AdminNotificationsView: React.FC<AdminNotificationsViewProps> = ({
  notifications,
  appointments,
  isLoading = false,
  onSelectAppointment,
  onRefresh,
}) => {
  // Primary view scope: 'active' (default upcoming only), 'history' (past & cancelled), 'all' (audit)
  const [viewScope, setViewScope] = useState<NotificationViewScope>('active');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Map appointment details by ID for fast lookup
  const appointmentMap = useMemo(() => {
    const map = new Map<string, AdminAppointment>();
    appointments.forEach((a) => {
      map.set(a.id, a);
    });
    return map;
  }, [appointments]);

  // Current Houston clinic time reference
  const currentHouston = useMemo(() => getHoustonCurrentDateTime(), []);

  // 1. Analyze every notification record relative to its appointment date/time in Houston timezone
  const analyzedNotifications = useMemo(() => {
    return notifications.map((notif) => {
      const appt = notif.appointmentId ? appointmentMap.get(notif.appointmentId) : undefined;
      const relevance = deriveAppointmentDateTimeForNotification(notif, appt);

      return {
        notif,
        appt,
        appointmentDate: relevance.dateStr,
        appointmentTime: relevance.timeStr,
        isCancelled: relevance.isCancelled,
        isUpcoming: relevance.isUpcoming,
        isToday: relevance.isToday,
      };
    });
  }, [notifications, appointmentMap]);

  // 2. Compute metrics for both active upcoming queue and historical archive
  const metrics = useMemo(() => {
    const total = notifications.length;
    const activeItems = analyzedNotifications.filter((item) => item.isUpcoming);
    const historyItems = analyzedNotifications.filter((item) => !item.isUpcoming);

    const activeReminders = activeItems.filter(
      (i) =>
        i.notif.type === 'appointment_reminder_24h' || i.notif.type === 'appointment_reminder_2h'
    );
    const activePendingReminders = activeReminders.filter((i) => i.notif.status === 'pending').length;
    const activeToday = activeItems.filter((i) => i.isToday).length;
    const activeFuture = activeItems.filter((i) => !i.isToday).length;
    const activeConfirmations = activeItems.filter(
      (i) => i.notif.type === 'appointment_confirmation'
    ).length;

    const historyPast = historyItems.filter((i) => !i.isCancelled).length;
    const historyCancelled = historyItems.filter((i) => i.isCancelled).length;

    return {
      total,
      activeCount: activeItems.length,
      historyCount: historyItems.length,
      activePendingReminders,
      activeToday,
      activeFuture,
      activeConfirmations,
      historyPast,
      historyCancelled,
    };
  }, [notifications, analyzedNotifications]);

  // 3. Filter notifications based on scope (active vs history), type, status, and search query
  const filteredAndSortedItems = useMemo(() => {
    // A. Scope filtering
    let scoped = analyzedNotifications;
    if (viewScope === 'active') {
      // Strictly upcoming and unexpired today's appointments, excluding cancelled
      scoped = analyzedNotifications.filter((item) => item.isUpcoming);
    } else if (viewScope === 'history') {
      // Past appointments or cancelled appointments
      scoped = analyzedNotifications.filter((item) => !item.isUpcoming);
    }

    // B. Type filter
    if (typeFilter !== 'all') {
      scoped = scoped.filter((item) => {
        const type = item.notif.type;
        if (typeFilter === 'reminders') {
          return type === 'appointment_reminder_24h' || type === 'appointment_reminder_2h';
        }
        if (typeFilter === 'confirmations') return type === 'appointment_confirmation';
        if (typeFilter === 'cancellations') return type === 'appointment_cancellation';
        if (typeFilter === 'rescheduled') return type === 'appointment_rescheduled';
        return true;
      });
    }

    // C. Status filter
    if (statusFilter !== 'all') {
      scoped = scoped.filter((item) => item.notif.status === statusFilter);
    }

    // D. Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      scoped = scoped.filter((item) => {
        const name = (item.notif.patientName || '').toLowerCase();
        const phone = (item.notif.phone || '').toLowerCase();
        const apptId = (item.notif.appointmentId || '').toLowerCase();
        const msg = (item.notif.message || '').toLowerCase();
        const date = (item.appointmentDate || '').toLowerCase();
        const time = (item.appointmentTime || '').toLowerCase();
        return (
          name.includes(query) ||
          phone.includes(query) ||
          apptId.includes(query) ||
          msg.includes(query) ||
          date.includes(query) ||
          time.includes(query)
        );
      });
    }

    // E. Chronological Sorting:
    // For 'active' mode: earliest upcoming appointment first (Houston local time)
    // For 'history' mode: most recent historical event first
    const sorted = [...scoped].sort((a, b) => {
      if (viewScope === 'active') {
        // Earliest appointment date first
        const dateA = a.appointmentDate || '9999-99-99';
        const dateB = b.appointmentDate || '9999-99-99';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }

        // Earliest start time first
        const timeA = parseTimeToMinutes(a.appointmentTime);
        const timeB = parseTimeToMinutes(b.appointmentTime);
        if (timeA !== timeB) {
          return timeA - timeB;
        }

        // For the same appointment, order reminders scheduled earliest first
        if (a.notif.scheduledFor && b.notif.scheduledFor) {
          return a.notif.scheduledFor.localeCompare(b.notif.scheduledFor);
        }
        if (a.notif.scheduledFor && !b.notif.scheduledFor) return -1;
        if (!a.notif.scheduledFor && b.notif.scheduledFor) return 1;

        return a.notif.id.localeCompare(b.notif.id);
      } else {
        // Historical sorting: most recent appointment date descending
        const dateA = a.appointmentDate || '0000-00-00';
        const dateB = b.appointmentDate || '0000-00-00';
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }

        const timeA = parseTimeToMinutes(a.appointmentTime);
        const timeB = parseTimeToMinutes(b.appointmentTime);
        if (timeA !== timeB) {
          return timeB - timeA;
        }

        return b.notif.id.localeCompare(a.notif.id);
      }
    });

    return sorted;
  }, [analyzedNotifications, viewScope, typeFilter, statusFilter, searchQuery]);

  // Helper for notification type badge
  const getTypeBadge = (type: NotificationRecord['type']) => {
    switch (type) {
      case 'appointment_reminder_24h':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            <span>24h Reminder</span>
          </span>
        );
      case 'appointment_reminder_2h':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            <Clock className="w-3 h-3 text-sky-600" />
            <span>2h Reminder</span>
          </span>
        );
      case 'appointment_confirmation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Confirmation</span>
          </span>
        );
      case 'appointment_cancellation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Ban className="w-3 h-3 text-rose-600" />
            <span>Cancellation</span>
          </span>
        );
      case 'appointment_rescheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <History className="w-3 h-3 text-amber-600" />
            <span>Rescheduled</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <span>{type}</span>
          </span>
        );
    }
  };

  // Helper for status badge
  const getStatusBadge = (status: NotificationRecord['status'], isCancelledAppt?: boolean) => {
    if (status === 'cancelled' || isCancelledAppt) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <Ban className="w-3 h-3 text-slate-400" />
          <span>Cancelled</span>
        </span>
      );
    }
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Pending</span>
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Sent</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Scope Controls: Active & Upcoming vs History */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Scope Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
          <button
            id="btn-notifications-scope-active"
            type="button"
            onClick={() => setViewScope('active')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewScope === 'active'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${viewScope === 'active' ? 'text-white' : 'text-blue-600'}`} />
            <span>Active & Upcoming</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                viewScope === 'active'
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {metrics.activeCount}
            </span>
          </button>

          <button
            id="btn-notifications-scope-history"
            type="button"
            onClick={() => setViewScope('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewScope === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className={`w-3.5 h-3.5 ${viewScope === 'history' ? 'text-white' : 'text-slate-500'}`} />
            <span>View History</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                viewScope === 'history'
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {metrics.historyCount}
            </span>
          </button>

          <button
            id="btn-notifications-scope-all"
            type="button"
            onClick={() => setViewScope('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewScope === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>All Records</span>
            <span className={`text-[10px] ${viewScope === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>({metrics.total})</span>
          </button>
        </div>

        {/* Status / Scope Summary Label */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-800">
              {viewScope === 'active'
                ? 'Active Notification Queue'
                : viewScope === 'history'
                ? 'Notification History Archive'
                : 'Complete Database Audit'}
            </p>
            <p className="text-[11px] text-slate-400">
              {viewScope === 'active'
                ? 'Prioritizing upcoming and today appointments'
                : 'Past appointments & cancelled records preserved in Firestore'}
            </p>
          </div>

          {onRefresh && (
            <button
              id="btn-notifications-refresh"
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Mode Explanation Banner */}
      {viewScope === 'active' ? (
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs text-blue-950 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm font-['Outfit']">
                Active & Upcoming Notifications Only
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-900 text-[10px] font-bold uppercase tracking-wider">
                Prioritized View
              </span>
            </div>
            <p className="text-blue-900/90 leading-relaxed">
              Showing active notification and reminder records for <strong>future appointments</strong> and <strong>today's upcoming start times</strong> (Houston time). Notifications for past or cancelled appointments are automatically moved to the history view to keep this active queue uncluttered.
            </p>
          </div>
          {metrics.historyCount > 0 && (
            <button
              type="button"
              onClick={() => setViewScope('history')}
              className="hidden lg:inline-flex px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <span>View History ({metrics.historyCount})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : viewScope === 'history' ? (
        <div className="bg-slate-100/90 border border-slate-200/90 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
            <Archive className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs text-slate-800 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm font-['Outfit'] text-slate-900">
                Historical Notification Archive
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                Read-Only Archive
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Displaying notification records for past appointments and cancelled appointments. <strong>All records remain permanently stored in Firestore</strong> and are never deleted or modified.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setViewScope('active')}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <span>← Return to Active</span>
          </button>
        </div>
      ) : (
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs text-blue-950 space-y-1">
            <span className="font-bold text-sm font-['Outfit']">
              Complete Notifications Audit ({metrics.total} Records)
            </span>
            <p className="text-blue-900/90 leading-relaxed">
              Viewing all notification documents currently recorded in Firestore (<code className="font-mono text-[11px] bg-blue-100/80 px-1 py-0.5 rounded">notifications</code>). All concept demo notifications remain in <strong>pending</strong> status because external SMS providers are intentionally not connected.
            </p>
          </div>
        </div>
      )}

      {/* 3. Stat Cards Adapted to Scope */}
      {viewScope === 'active' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Upcoming Notifications</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.activeCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">For upcoming visits</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Pending Reminders</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.activePendingReminders}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">24h & 2h upcoming</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Today's Remaining</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.activeToday}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Upcoming today</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Future Appointments</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.activeFuture}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Tomorrow & beyond</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Archived Records</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.historyCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Past & cancelled</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Past Appointments</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.historyPast}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Completed / expired</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Cancelled Records</p>
            <p className="text-2xl font-bold text-slate-700 font-['Outfit'] mt-1">
              {metrics.historyCancelled}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Prevented from sending</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total In Database</p>
            <p className="text-2xl font-bold text-slate-900 font-['Outfit'] mt-1">
              {metrics.total}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Clinic history log</p>
          </div>
        </div>
      )}

      {/* 4. Search and Filtering Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-notifications-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient name, phone, appointment date/time, or ID..."
              className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Status:</span>
            <select
              id="select-notifications-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs font-medium rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="sent">Sent</option>
            </select>
          </div>
        </div>

        {/* Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 mr-1.5 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Type:</span>
          </span>

          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('reminders')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              typeFilter === 'reminders'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Reminders (24h & 2h)
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter('confirmations')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              typeFilter === 'confirmations'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Confirmations
          </button>

          {viewScope !== 'active' && (
            <button
              type="button"
              onClick={() => setTypeFilter('cancellations')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                typeFilter === 'cancellations'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Cancellations
            </button>
          )}

          <button
            type="button"
            onClick={() => setTypeFilter('rescheduled')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              typeFilter === 'rescheduled'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Rescheduled
          </button>
        </div>
      </div>

      {/* 5. Notification Records List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-600 mb-2" />
            <p className="text-xs">Loading notification records...</p>
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Bell className="w-9 h-9 mx-auto text-slate-300" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">
                {viewScope === 'active'
                  ? 'No active notifications for upcoming appointments'
                  : 'No notification records match your filter'}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchQuery
                  ? 'No records match your search criteria. Try a different query.'
                  : viewScope === 'active'
                  ? 'All notifications in the database correspond to past or cancelled appointments. Click "View History" to inspect historical records.'
                  : 'No historical notifications found.'}
              </p>
            </div>
            {viewScope === 'active' && metrics.historyCount > 0 && (
              <button
                type="button"
                onClick={() => setViewScope('history')}
                className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>View Historical Notifications ({metrics.historyCount})</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Appointment & Patient</th>
                  <th className="px-5 py-3.5">Notification Type</th>
                  <th className="px-5 py-3.5">Scheduled Time</th>
                  <th className="px-5 py-3.5">Channel & Phone</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Message Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAndSortedItems.map((item) => {
                  const { notif, appt, appointmentDate, appointmentTime, isToday, isCancelled } =
                    item;
                  const isExpanded = expandedId === notif.id;

                  return (
                    <React.Fragment key={notif.id}>
                      <tr
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isExpanded ? 'bg-slate-50/40' : ''
                        }`}
                      >
                        {/* 1. Appointment & Patient */}
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{notif.patientName || appt?.patientName || 'Valued Patient'}</span>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Today
                                </span>
                              )}
                            </div>

                            {appointmentDate ? (
                              <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span className="font-medium">
                                  {formatAppointmentDate(appointmentDate)}
                                </span>
                                {appointmentTime && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="font-semibold text-slate-800">
                                      {appointmentTime}
                                    </span>
                                  </>
                                )}
                              </div>
                            ) : notif.appointmentId ? (
                              <div className="text-[10px] font-mono text-slate-400">
                                Appt: {notif.appointmentId}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* 2. Notification Type */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {getTypeBadge(notif.type)}
                        </td>

                        {/* 3. Scheduled Time */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {notif.scheduledFor ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-800 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-blue-500" />
                                <span>{formatScheduledForDisplay(notif.scheduledFor)}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {notif.type === 'appointment_reminder_24h'
                                  ? '24 hours prior to visit'
                                  : notif.type === 'appointment_reminder_2h'
                                  ? '2 hours prior to visit'
                                  : 'Scheduled delivery'}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-slate-600 font-medium">Immediate</span>
                              <div className="text-[10px] text-slate-400">
                                On booking confirmation
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 4. Channel & Phone */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <span className="font-mono text-slate-700 text-[11px] flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{notif.phone || '—'}</span>
                            </span>
                            <span className="inline-block uppercase tracking-wider text-[9px] font-bold text-slate-400">
                              SMS ({notif.channel})
                            </span>
                          </div>
                        </td>

                        {/* 5. Status */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="space-y-0.5">
                            {getStatusBadge(notif.status, isCancelled)}
                            {notif.cancelledAt && (
                              <div className="text-[10px] text-slate-400">
                                Cancelled when appt cancelled
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 6. Message Preview Action */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {appt && onSelectAppointment && (
                              <button
                                type="button"
                                onClick={() => onSelectAppointment(appt)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 transition-colors cursor-pointer"
                              >
                                View Appt
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : notif.id)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                              <span>{isExpanded ? 'Hide' : 'Message'}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Message Box */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-5 py-3">
                            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                                <span className="flex items-center gap-1 text-slate-700">
                                  <MessageSquare className="w-3 h-3 text-blue-500" />
                                  <span>SMS Content Preview (HIPAA Compliant):</span>
                                </span>
                                <span className="text-slate-400 font-mono text-[10px]">
                                  Doc ID: {notif.id}
                                </span>
                              </div>
                              <p className="text-xs text-slate-800 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                                {notif.message}
                              </p>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                                <span>No sensitive medical symptoms or diagnosis included.</span>
                                <span>
                                  Status: {notif.status} • Scheduled for:{' '}
                                  {notif.scheduledFor
                                    ? formatScheduledForDisplay(notif.scheduledFor)
                                    : 'Immediate'}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {filteredAndSortedItems.length > 0 && (
          <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
            <span>
              Showing {filteredAndSortedItems.length} of{' '}
              {viewScope === 'active'
                ? metrics.activeCount
                : viewScope === 'history'
                ? metrics.historyCount
                : metrics.total}{' '}
              {viewScope === 'active'
                ? 'upcoming active'
                : viewScope === 'history'
                ? 'historical'
                : 'total'}{' '}
              records
            </span>
            <span className="text-[11px] text-slate-400">
              {viewScope === 'active'
                ? 'Sorted earliest upcoming appointment first • America/Chicago'
                : 'Permanent records retained in Firestore • Read-only display'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

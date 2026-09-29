import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Clock,
  Database,
  Calendar,
  Bell,
  Users,
  Server,
  Lock,
  FileText,
  AlertCircle,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  SystemHealthReport,
  HealthStatusLevel,
  ComponentHealthItem,
  SafeguardCheckItem,
  DataIntegrityIssue,
} from '../types';
import { runSystemHealthCheck } from '../services/healthCheckService';

interface AdminHealthCheckProps {
  currentAdminEmail?: string | null;
  onNavigateTab?: (tab: string) => void;
}

export const AdminHealthCheck: React.FC<AdminHealthCheckProps> = ({
  currentAdminEmail,
  onNavigateTab,
}) => {
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const executeHealthCheck = useCallback(async () => {
    setIsLoading(true);
    setExecutionError(null);
    try {
      const result = await runSystemHealthCheck(currentAdminEmail);
      setReport(result);
    } catch (err: any) {
      console.error('[AdminHealthCheck] Execution error:', err);
      setExecutionError(
        err?.message || 'An unexpected error occurred while executing the diagnostic health check.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentAdminEmail]);

  useEffect(() => {
    executeHealthCheck();
  }, [executeHealthCheck]);

  const renderStatusBadge = (status: HealthStatusLevel) => {
    switch (status) {
      case 'Healthy':
        return (
          <span
            id={`status-badge-healthy-${Math.random().toString(36).substring(7)}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Healthy
          </span>
        );
      case 'Warning':
        return (
          <span
            id={`status-badge-warning-${Math.random().toString(36).substring(7)}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Warning
          </span>
        );
      case 'Unavailable':
      default:
        return (
          <span
            id={`status-badge-unavailable-${Math.random().toString(36).substring(7)}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
          >
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Unavailable
          </span>
        );
    }
  };

  const getOverallHeaderTheme = (status: HealthStatusLevel) => {
    switch (status) {
      case 'Healthy':
        return {
          containerClass: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
          icon: <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />,
          pillClass: 'bg-emerald-600 text-white',
        };
      case 'Warning':
        return {
          containerClass: 'bg-amber-50/70 border-amber-200 text-amber-950',
          icon: <AlertTriangle className="w-7 h-7 text-amber-600 shrink-0" />,
          pillClass: 'bg-amber-600 text-white',
        };
      case 'Unavailable':
      default:
        return {
          containerClass: 'bg-rose-50/70 border-rose-200 text-rose-950',
          icon: <XCircle className="w-7 h-7 text-rose-600 shrink-0" />,
          pillClass: 'bg-rose-600 text-white',
        };
    }
  };

  return (
    <div id="admin-health-check-container" className="space-y-6 pb-12">
      {/* Top Action & Sub-bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">System Health & Diagnostics</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              Operations Status
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time status of authentication, database collections, availability engine, scheduling rules, and booking safeguards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {report && (
            <span className="text-xs text-slate-500 hidden md:inline-block">
              Last run: {report.timestamp}
            </span>
          )}
          <button
            id="btn-run-health-check"
            type="button"
            onClick={executeHealthCheck}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Running Diagnostics...' : 'Run Health Check'}
          </button>
        </div>
      </div>

      {/* Catastrophic error fallback */}
      {executionError && (
        <div
          id="health-check-execution-error"
          className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900">Health Check Execution Encountered An Issue</h3>
            <p className="text-xs text-rose-700 mt-1">{executionError}</p>
            <button
              type="button"
              onClick={executeHealthCheck}
              className="mt-3 text-xs font-semibold underline text-rose-800 hover:text-rose-900"
            >
              Retry Diagnostic Run
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && !report && (
        <div className="space-y-4">
          <div className="h-28 bg-slate-100 animate-pulse rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {/* Main Report Body */}
      {report && (
        <>
          {/* SECTION 10: Overall System Status Summary */}
          {(() => {
            const theme = getOverallHeaderTheme(report.overallStatus);
            return (
              <div
                id="overall-system-status-banner"
                className={`p-6 rounded-2xl border ${theme.containerClass} transition-all shadow-xs`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {theme.icon}
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-lg font-bold">Overall System Status:</h3>
                        <span
                          id="overall-status-pill"
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${theme.pillClass}`}
                        >
                          {report.statusHeadline}
                        </span>
                      </div>
                      <p className="text-sm mt-1 opacity-90 font-medium">
                        {report.statusMessage}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs opacity-75 sm:text-right">
                    <div>Timezone: <strong className="font-semibold">{report.schedulingHealth.timezone}</strong></div>
                    <div>Checked: {report.timestamp}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SECTION 2 & 4: Admin Authorization & Session Health */}
          <div
            id="admin-auth-health-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Admin Authentication & Access Authorization
                </h3>
              </div>
              {renderStatusBadge(report.adminSession.authStatus)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Google Authentication</span>
                <div className="flex items-center gap-2 mt-1">
                  {report.adminSession.isAuthenticated ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-900">Signed In</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-bold text-rose-700">Not Authenticated</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {report.adminSession.adminEmail
                    ? report.adminSession.adminEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3')
                    : 'No active session'}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Admin Role Verification</span>
                <div className="flex items-center gap-2 mt-1">
                  {report.adminSession.isAuthorizedAdmin ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-emerald-700">Verified Admin</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-bold text-amber-800">Unverified Role</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Checked against <code className="font-mono text-[11px] text-slate-700">admins/{"{email}"}</code> (role == "admin")
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Session Status</span>
                <div className="text-sm font-semibold text-slate-800 mt-1">
                  {report.adminSession.summary}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Strict pre-render route protection active
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2 & 3: Existing System Components Grid */}
          <div id="core-components-section" className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Core System Components & Collections
                </h3>
              </div>
              <span className="text-xs font-medium text-slate-500">
                {report.components.filter((c) => c.status === 'Healthy').length} of {report.components.length} Healthy
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {report.components.map((comp) => (
                <div
                  key={comp.id}
                  id={`comp-card-${comp.id}`}
                  className="p-4 rounded-xl border border-slate-100 hover:border-slate-300 bg-white transition-all shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{comp.name}</h4>
                      {renderStatusBadge(comp.status)}
                    </div>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {comp.summary}
                    </p>
                  </div>

                  {comp.metric && (
                    <div className="mt-3 pt-2.5 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Metric</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">{comp.metric}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 5: Scheduling Settings & Operating Hours Health */}
          <div
            id="scheduling-health-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Schedule Settings & Operating Hours
                </h3>
              </div>
              {renderStatusBadge(report.schedulingHealth.status)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Clinic Timezone</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{report.schedulingHealth.timezone}</p>
                <span className="text-[11px] text-slate-500">Houston Central Time</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Weekday Hours</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{report.schedulingHealth.clinicHours.weekday}</p>
                <span className="text-[11px] text-slate-500">Monday – Friday</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Saturday Hours</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{report.schedulingHealth.clinicHours.saturday}</p>
                <span className="text-[11px] text-slate-500">Half-day operating hours</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Sunday Schedule</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{report.schedulingHealth.clinicHours.sunday}</p>
                <span className="text-[11px] text-slate-500">Closed per clinic policy</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              {report.schedulingHealth.notes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 6: Availability Engine Diagnostics */}
          <div
            id="availability-health-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Automatic Availability Engine Integrity
                </h3>
              </div>
              {renderStatusBadge(report.availabilityHealth.status)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <span className="text-xs text-slate-500 font-medium">Total Slots</span>
                <p className="text-base font-bold text-slate-900 mt-1">{report.availabilityHealth.totalSlots}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 text-center">
                <span className="text-xs text-emerald-700 font-medium">Available</span>
                <p className="text-base font-bold text-emerald-800 mt-1">{report.availabilityHealth.availableSlots}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <span className="text-xs text-slate-500 font-medium">Past/Historical</span>
                <p className="text-base font-bold text-slate-900 mt-1">{report.availabilityHealth.pastSlotsCount}</p>
                <span className="text-[10px] text-slate-400">Preserved in DB</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <span className="text-xs text-slate-500 font-medium">Duplicates</span>
                <p className={`text-base font-bold mt-1 ${report.availabilityHealth.duplicateSlotsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {report.availabilityHealth.duplicateSlotsCount}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <span className="text-xs text-slate-500 font-medium">Sunday Slots</span>
                <p className={`text-base font-bold mt-1 ${report.availabilityHealth.sundayAvailableSlotsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {report.availabilityHealth.sundayAvailableSlotsCount}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <span className="text-xs text-slate-500 font-medium">Out-of-Hours</span>
                <p className={`text-base font-bold mt-1 ${report.availabilityHealth.outOfHoursSlotsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {report.availabilityHealth.outOfHoursSlotsCount}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              {report.availabilityHealth.notes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 7: Booking Safety Safeguards (Diagnostic Display) */}
          <div
            id="booking-safeguards-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Booking Transaction Safeguards (7 Protected Protocols)
                </h3>
              </div>
              {renderStatusBadge('Healthy')}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.bookingSafeguards.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 flex items-start gap-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold uppercase">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 8: Notification Health (SMS Gateway Notice) */}
          <div
            id="notification-health-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Notifications & Reminders System Health
                </h3>
              </div>
              {renderStatusBadge(report.notificationHealth.status)}
            </div>

            {/* Clear SMS Notice */}
            <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 mb-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">SMS Provider Gateway Notice</h4>
                <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                  {report.notificationHealth.smsGatewayNotice}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Pending Records</span>
                <p className="text-base font-bold text-slate-900 mt-1">{report.notificationHealth.pendingCount}</p>
                <span className="text-[11px] text-slate-500">Stored safely in Firestore</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Scheduled Reminders</span>
                <p className="text-base font-bold text-slate-900 mt-1">{report.notificationHealth.scheduledReminderCount}</p>
                <span className="text-[11px] text-slate-500">24h & 2h reminders</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Cancelled Reminders</span>
                <p className="text-base font-bold text-slate-900 mt-1">{report.notificationHealth.cancelledReminderCount}</p>
                <span className="text-[11px] text-slate-500">Successfully silenced</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Failed Dispatches</span>
                <p className={`text-base font-bold mt-1 ${report.notificationHealth.failedCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {report.notificationHealth.failedCount}
                </p>
                <span className="text-[11px] text-slate-500">0 errors recorded</span>
              </div>
            </div>
          </div>

          {/* SECTION 9: Data Integrity Warnings */}
          <div
            id="data-integrity-section"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Data Integrity Scanner
                </h3>
              </div>
              {report.dataIntegrityIssues.length === 0
                ? renderStatusBadge('Healthy')
                : renderStatusBadge('Warning')}
            </div>

            {report.dataIntegrityIssues.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">No Data Integrity Issues Detected</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    All appointment records, slot timestamps, patient linkages, and notification references conform to system standards.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Detected {report.dataIntegrityIssues.length} potential data irregularity for administrator review. No records are deleted automatically.
                  </span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {report.dataIntegrityIssues.map((issue) => (
                    <div key={issue.id} className="p-3 bg-white hover:bg-slate-50 flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-700">{issue.collection}/{issue.recordId}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                            issue.severity === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{issue.issue}</p>
                      </div>

                      {issue.suggestedAction && (
                        <span className="text-[11px] text-blue-600 font-medium whitespace-nowrap">
                          {issue.suggestedAction}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

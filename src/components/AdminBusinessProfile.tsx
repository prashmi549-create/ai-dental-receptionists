import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Bot,
  Sparkles,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Palette,
  Phone,
  MapPin,
  Clock,
  Image as ImageIcon,
  MessageSquare,
  ShieldCheck,
  Eye,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { BusinessProfileConfig, DEFAULT_BUSINESS_CONFIG } from '../types';
import {
  getBusinessConfig,
  saveBusinessConfig,
  validateBusinessConfig,
  resetBusinessConfigToDefault,
  subscribeToBusinessConfig,
} from '../services/businessConfigService';

interface AdminBusinessProfileProps {
  adminEmail: string;
}

const PRESET_PALETTES = [
  { name: 'Medical Blue', color: '#2563eb' },
  { name: 'Emerald Care', color: '#059669' },
  { name: 'Teal Health', color: '#0d9488' },
  { name: 'Indigo Modern', color: '#4f46e5' },
  { name: 'Royal Purple', color: '#7c3aed' },
  { name: 'Rose Coral', color: '#e11d48' },
  { name: 'Slate Navy', color: '#1e293b' },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/Chicago', label: 'Central Time (US & Canada) - America/Chicago' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada) - America/New_York' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada) - America/Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) - America/Los_Angeles' },
  { value: 'America/Phoenix', label: 'Arizona - America/Phoenix' },
  { value: 'America/Anchorage', label: 'Alaska - America/Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii - Pacific/Honolulu' },
];

export const AdminBusinessProfile: React.FC<AdminBusinessProfileProps> = ({ adminEmail }) => {
  // Saved config state from Firestore
  const [savedConfig, setSavedConfig] = useState<BusinessProfileConfig>(DEFAULT_BUSINESS_CONFIG);
  // Form draft state
  const [formData, setFormData] = useState<BusinessProfileConfig>(DEFAULT_BUSINESS_CONFIG);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Load from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToBusinessConfig((config) => {
      if (isMounted) {
        setSavedConfig(config);
        setFormData(config);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Compute dirty state
  const isDirty = useMemo(() => {
    return (
      formData.businessName !== savedConfig.businessName ||
      formData.receptionistName !== savedConfig.receptionistName ||
      formData.logoUrl !== savedConfig.logoUrl ||
      formData.primaryAccentColor.toLowerCase() !== savedConfig.primaryAccentColor.toLowerCase() ||
      formData.welcomeMessage !== savedConfig.welcomeMessage ||
      formData.phone !== savedConfig.phone ||
      formData.address !== savedConfig.address ||
      formData.timezone !== savedConfig.timezone
    );
  }, [formData, savedConfig]);

  const handleFieldChange = (field: keyof BusinessProfileConfig, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (statusMessage) setStatusMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateBusinessConfig(formData);
    if (!validation.valid) {
      setStatusMessage({ type: 'error', text: validation.error || 'Please review the fields.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const res = await saveBusinessConfig(formData, adminEmail);
    setIsSaving(false);

    if (res.success) {
      setSavedConfig(res.config);
      setFormData(res.config);
      setStatusMessage({
        type: 'success',
        text: 'Business Profile successfully saved and published! Public receptionist and widget will automatically reflect these updates.',
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'Failed to save business profile to Firestore.',
      });
    }
  };

  const handleCancel = () => {
    setFormData(savedConfig);
    setStatusMessage(null);
  };

  const handleResetToDefaults = async () => {
    if (
      window.confirm(
        'Reset business profile to the default Dental Care & Implants of Houston demo settings?'
      )
    ) {
      setIsResetting(true);
      setStatusMessage(null);
      const res = await resetBusinessConfigToDefault(adminEmail);
      setIsResetting(false);
      if (res.success) {
        setSavedConfig(res.config);
        setFormData(res.config);
        setStatusMessage({
          type: 'success',
          text: 'Reset to Dental Care & Implants of Houston defaults successfully.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to reset settings.',
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs flex flex-col items-center justify-center min-h-[360px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading Business Profile...</p>
        <p className="text-xs text-slate-400 mt-1">Connecting to settings/business in Firestore</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 font-['Outfit']">
              Business Profile & Receptionist Customization
            </h2>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              Clinic Identity
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure clinic identity, receptionist name, branding colors, and contact info. Public
            visitors and the website widget automatically reflect these settings.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 font-medium">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Protected Clinic Configuration</span>
          </div>
        </div>
      </div>

      {/* Status Message Banner */}
      {statusMessage && (
        <div
          role="alert"
          className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : statusMessage.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs leading-relaxed">
            <span className="font-bold block text-sm mb-0.5">
              {statusMessage.type === 'success'
                ? 'Changes Saved'
                : statusMessage.type === 'error'
                ? 'Validation or Permission Error'
                : 'Notice'}
            </span>
            {statusMessage.text}
          </div>
        </div>
      )}

      {/* Main Grid: Form Left, Real-time Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Configuration Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          {/* Card 1: Identity & Receptionist Personality */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 font-['Outfit']">
                Business & Receptionist Identity
              </h3>
            </div>

            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Business / Clinic Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-business-name"
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => handleFieldChange('businessName', e.target.value)}
                  placeholder="e.g. Dental Care & Implants of Houston"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Displayed in header bars, browser title, and booking confirmation receipts.
                </p>
              </div>

              {/* Receptionist Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  AI Receptionist Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-receptionist-name"
                  type="text"
                  required
                  value={formData.receptionistName}
                  onChange={(e) => handleFieldChange('receptionistName', e.target.value)}
                  placeholder="e.g. AI Dental Receptionist or Emma"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  The friendly name displayed on widget titlebars and chat launcher.
                </p>
              </div>

              {/* Welcome Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Initial Welcome Message <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="input-welcome-message"
                  required
                  rows={3}
                  value={formData.welcomeMessage}
                  onChange={(e) => handleFieldChange('welcomeMessage', e.target.value)}
                  placeholder="e.g. Hi! How can I help you today?"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-medium resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  The initial conversational greeting shown when a patient opens the receptionist.
                </p>
              </div>

              {/* Logo URL (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Logo / Avatar Image URL <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-logo-url"
                    type="url"
                    value={formData.logoUrl || ''}
                    onChange={(e) => handleFieldChange('logoUrl', e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-mono"
                  />
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={() => handleFieldChange('logoUrl', '')}
                      className="px-2.5 py-2 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Replaces the default bot avatar icon with your business logo when provided.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Visual Branding & Color Scheme */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Palette className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 font-['Outfit']">
                Primary Accent Color Branding
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Primary Accent Color (Hex Code) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  {/* HTML Color Picker */}
                  <div className="relative flex items-center">
                    <input
                      id="input-color-picker"
                      type="color"
                      value={formData.primaryAccentColor}
                      onChange={(e) => handleFieldChange('primaryAccentColor', e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300 p-0.5 bg-white"
                      title="Choose custom color"
                    />
                  </div>

                  {/* Hex Text Input */}
                  <input
                    id="input-primary-accent"
                    type="text"
                    required
                    maxLength={7}
                    value={formData.primaryAccentColor}
                    onChange={(e) => handleFieldChange('primaryAccentColor', e.target.value)}
                    placeholder="#2563eb"
                    className="w-32 text-xs sm:text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 font-mono font-bold"
                  />

                  {/* Visual Color Pill preview */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                    <span
                      className="w-4 h-4 rounded-full shadow-2xs border border-white"
                      style={{ backgroundColor: formData.primaryAccentColor }}
                    />
                    <span className="font-semibold text-slate-700">Live Accent</span>
                  </div>
                </div>
              </div>

              {/* Quick Preset Palette Chips */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                  Recommended Medical & Dental Palettes:
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      onClick={() => handleFieldChange('primaryAccentColor', preset.color)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        formData.primaryAccentColor.toLowerCase() === preset.color.toLowerCase()
                          ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: preset.color }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Contact Details & Operating Location */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Phone className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 font-['Outfit']">
                Contact & Timezone Configuration
              </h3>
            </div>

            <div className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Business Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleFieldChange('phone', e.target.value)}
                  placeholder="(281) 876-1188"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-mono font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Used by the receptionist for urgent emergency escalations and top call buttons.
                </p>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Clinic Physical Address <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-address"
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => handleFieldChange('address', e.target.value)}
                  placeholder="165 Greens Rd, Houston, TX 77060"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Displayed in appointment confirmation details and footer strips.
                </p>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Operating Timezone <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    id="select-timezone"
                    value={formData.timezone}
                    onChange={(e) => handleFieldChange('timezone', e.target.value)}
                    className="w-full appearance-none text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 transition-all font-medium pr-8 cursor-pointer"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Coordinates real-time slot generation and reminder calculations.
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar (Save, Cancel, Reset) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 sticky bottom-4 z-20">
            <div className="flex items-center gap-2">
              <button
                id="btn-save-business-profile"
                type="submit"
                disabled={isSaving || !isDirty}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-95"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Firestore...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Business Profile</span>
                  </>
                )}
              </button>

              <button
                id="btn-cancel-business-profile"
                type="button"
                onClick={handleCancel}
                disabled={isSaving || !isDirty}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancel / Revert</span>
              </button>
            </div>

            <button
              id="btn-reset-demo-defaults"
              type="button"
              onClick={handleResetToDefaults}
              disabled={isSaving || isResetting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Reset to Dental Care & Implants of Houston demo defaults"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Reset to Demo Defaults</span>
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: Real-Time Live Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-100/80 rounded-2xl border border-slate-200/90 p-4 space-y-4 sticky top-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 font-['Outfit']">
                <Eye className="w-4 h-4 text-blue-600" />
                <span>Live Customization Preview</span>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                Real-Time
              </span>
            </div>

            {/* PREVIEW 1: Floating Launcher Button */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                1. Floating Widget Launcher
              </span>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-center">
                <div
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full text-white font-semibold text-xs shadow-md transition-all"
                  style={{ backgroundColor: formData.primaryAccentColor || '#2563eb' }}
                >
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    {formData.logoUrl ? (
                      <img
                        src={formData.logoUrl}
                        alt="Logo"
                        className="w-4 h-4 rounded-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <span className="font-['Outfit'] font-bold truncate max-w-[180px]">
                    Chat with {formData.receptionistName || 'AI Receptionist'}
                  </span>
                  <Sparkles className="w-3.5 h-3.5 text-white/80 shrink-0" />
                </div>
              </div>
            </div>

            {/* PREVIEW 2: Widget Popup Titlebar */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                2. Receptionist Titlebar
              </span>
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-2xs shrink-0"
                      style={{ backgroundColor: formData.primaryAccentColor || '#2563eb' }}
                    >
                      {formData.logoUrl ? (
                        <img
                          src={formData.logoUrl}
                          alt="Logo"
                          className="w-5 h-5 rounded-md object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 font-['Outfit'] truncate">
                        {formData.receptionistName || 'AI Dental Receptionist'}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Online
                        </span>
                        <span>•</span>
                        <span className="truncate">{formData.businessName || 'Business Name'}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                    {formData.phone}
                  </span>
                </div>

                {/* PREVIEW 3: Initial Greeting Bubble */}
                <div className="p-3 bg-slate-50/50 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Initial Patient Greeting
                  </span>
                  <div className="flex gap-2">
                    <div
                      className="w-6 h-6 rounded-md text-white flex items-center justify-center text-[10px] shrink-0"
                      style={{ backgroundColor: formData.primaryAccentColor || '#2563eb' }}
                    >
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl rounded-tl-xs p-2.5 text-xs text-slate-800 shadow-2xs leading-relaxed max-w-[90%] whitespace-pre-line">
                      {formData.welcomeMessage || 'Hi! How can I help you today?'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PREVIEW 4: Footer / Location Strip */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                3. Footer Address & Timezone
              </span>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate font-medium">{formData.address || 'Address'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Timezone: {formData.timezone || 'America/Chicago'}</span>
                </div>
              </div>
            </div>

            {/* Safety & Clinical Knowledge Guardrail Notice */}
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 text-[11px] text-blue-900 leading-normal space-y-1">
              <div className="font-bold flex items-center gap-1 text-blue-950">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Knowledge Safety Guardrail</span>
              </div>
              <p className="text-blue-800">
                Business configuration customizes presentation and branding identity only. Verified
                clinical services, doctor bios, and scheduling rules remain protected.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

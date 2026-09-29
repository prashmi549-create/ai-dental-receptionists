import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import {
  Bot,
  MessageSquare,
  Sparkles,
  X,
  ChevronDown,
  Phone,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { ChatReceptionist } from './ChatReceptionist';
import { BusinessBrandingConfig, DEFAULT_BUSINESS_BRANDING, getActiveBranding } from '../config/businessBranding';
import { BusinessProfileConfig, DEFAULT_BUSINESS_CONFIG } from '../types';
import { subscribeToBusinessConfig } from '../services/businessConfigService';

interface ReceptionistWidgetProps {
  branding?: BusinessBrandingConfig | BusinessProfileConfig;
  initiallyOpen?: boolean;
  onStateChange?: (isOpen: boolean) => void;
}

/**
 * Robust Error Boundary to guarantee friendly error states without exposing technical stack traces.
 */
interface ErrorBoundaryProps {
  children?: ReactNode;
  onRetry: () => void;
  key?: React.Key;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ReceptionistWidget caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-white">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base mb-1 font-['Outfit']">
            Receptionist Temporarily Unavailable
          </h3>
          <p className="text-xs text-slate-500 mb-4 max-w-xs leading-relaxed">
            We are having trouble loading the receptionist assistant right now. Please try again or call the clinic directly.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Assistant</span>
            </button>
            <a
              href="tel:2818761188"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>(281) 876-1188</span>
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ReceptionistWidget: React.FC<ReceptionistWidgetProps> = ({
  branding: propBranding,
  initiallyOpen = false,
  onStateChange,
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [errorRetryKey, setErrorRetryKey] = useState(0);
  const floatingButtonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Dynamic business profile configuration (Phase 11C)
  const [activeConfig, setActiveConfig] = useState<BusinessProfileConfig>(() => ({
    businessName: propBranding?.businessName || DEFAULT_BUSINESS_CONFIG.businessName,
    receptionistName: propBranding?.receptionistName || DEFAULT_BUSINESS_CONFIG.receptionistName,
    logoUrl: propBranding?.logoUrl || '',
    primaryAccentColor:
      (propBranding as any)?.primaryAccentColor ||
      (propBranding as any)?.primaryAccent ||
      DEFAULT_BUSINESS_CONFIG.primaryAccentColor,
    welcomeMessage: propBranding?.welcomeMessage || DEFAULT_BUSINESS_CONFIG.welcomeMessage,
    phone: propBranding?.phone || DEFAULT_BUSINESS_CONFIG.phone,
    address: propBranding?.address || DEFAULT_BUSINESS_CONFIG.address,
    timezone: (propBranding as any)?.timezone || DEFAULT_BUSINESS_CONFIG.timezone,
  }));

  // Synchronize in real-time with Firestore settings/business
  useEffect(() => {
    const unsub = subscribeToBusinessConfig((cfg) => {
      setActiveConfig(cfg);
    });
    return () => unsub();
  }, []);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Inform parent window of widget open/close state for dynamic sizing
  useEffect(() => {
    onStateChange?.(isOpen);
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'RECEPTIONIST_WIDGET_STATE',
            isOpen,
            mobile: window.innerWidth < 640,
          },
          '*'
        );
      }
    } catch {
      // ignore cross-origin restrictions
    }
  }, [isOpen, onStateChange]);

  // Accessibility: Listen for Escape key to close popup & restore focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        floatingButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleClose = () => {
    setIsOpen(false);
    floatingButtonRef.current?.focus();
  };

  const handleRetry = () => {
    setErrorRetryKey((prev) => prev + 1);
  };

  return (
    <div
      className={`w-full min-h-screen relative font-sans antialiased overflow-x-hidden ${
        isInsideIframe ? 'bg-transparent' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* 
        Standalone Direct-Visit Preview Canvas (Shown only when opened directly in a browser tab)
        Provides context for Test B & direct testing without obscuring the floating widget.
      */}
      {!isInsideIframe && (
        <div className="min-h-screen flex flex-col justify-between p-6 sm:p-12 max-w-4xl mx-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap pb-5 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-2xs overflow-hidden"
                style={{ backgroundColor: activeConfig.primaryAccentColor || '#2563eb' }}
              >
                {activeConfig.logoUrl ? (
                  <img
                    src={activeConfig.logoUrl}
                    alt={activeConfig.businessName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{activeConfig.businessName ? activeConfig.businessName.charAt(0).toUpperCase() : 'D'}</span>
                )}
              </div>
              <div>
                <span className="font-semibold text-slate-900 text-sm font-['Outfit'] block">
                  {activeConfig.businessName}
                </span>
                <span className="text-[11px] text-slate-500">
                  {activeConfig.address || 'Greenspoint: 165 Greens Rd, Houston, TX'} • {activeConfig.phone || '(281) 876-1188'}
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200/70 px-3 py-1 rounded-full">
              <Sparkles className="w-3 h-3 text-teal-600" />
              Website Widget Preview
            </span>
          </div>

          {/* Centered Explanatory Notice */}
          <div className="my-auto py-12 text-center max-w-lg mx-auto space-y-3.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-medium">
              <Bot className="w-3.5 h-3.5 text-teal-600" />
              <span>AI Dental Receptionist Widget</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 font-['Outfit'] tracking-tight">
              Floating Website Widget Mode
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              This preview simulates how the AI Dental Receptionist sits on a clinic website. Click the launcher button in the bottom-right corner to open the conversational scheduling popup.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
                style={activeConfig.primaryAccentColor ? { backgroundColor: activeConfig.primaryAccentColor } : undefined}
              >
                <Bot className="w-4 h-4" />
                <span>Open Receptionist Chat</span>
              </button>
            </div>
          </div>

          {/* Bottom Attribution */}
          <div className="pt-5 border-t border-slate-200/80 text-center text-xs text-slate-400">
            AIWebTeck Concept Demo • Built for {activeConfig.businessName} • All appointments persist directly to Firestore
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        1. FLOATING RECEPTIONIST BUTTON (FIXED BOTTOM-RIGHT)
        - Remains fixed in bottom-right corner
        - Clean rounded/circular appearance
        - Modern subtle hover elevation (no aggressive animations)
        - Uses primary business accent color
        - Shows calm steady online dot (no constant pulsing/flashing)
        - Compact and accessible
        ========================================================================
      */}
      <aside
        aria-label="AI Receptionist launcher"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center justify-end pointer-events-auto"
      >
        <button
          ref={floatingButtonRef}
          id="btn-floating-receptionist"
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-controls="receptionist-widget-popup"
          aria-label={isOpen ? 'Close AI Receptionist chat' : 'Chat with AI Receptionist'}
          className={`group flex items-center gap-2.5 transition-all duration-200 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blue-400/50 ${
            isOpen
              ? 'w-11 h-11 rounded-full p-0 justify-center bg-slate-800 hover:bg-slate-900 text-white shadow-md'
              : 'w-12 h-12 sm:w-auto p-0 sm:px-4 sm:py-2.5 rounded-full justify-center text-white shadow-md hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5'
          }`}
          style={
            !isOpen && activeConfig.primaryAccentColor
              ? { backgroundColor: activeConfig.primaryAccentColor }
              : !isOpen
              ? { backgroundColor: '#2563eb' }
              : undefined
          }
        >
          {isOpen ? (
            <X className="w-5 h-5 text-white" />
          ) : (
            <>
              {/* Avatar / Bot Icon */}
              <div className="relative flex items-center justify-center">
                <div className="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {activeConfig.logoUrl ? (
                    <img
                      src={activeConfig.logoUrl}
                      alt={activeConfig.receptionistName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
                {/* Calm, steady online status indicator (no aggressive flashing) */}
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>

              {/* Small Desktop Label */}
              <span className="hidden sm:inline font-['Outfit'] tracking-wide text-xs font-semibold whitespace-nowrap">
                Chat with AI Receptionist
              </span>
            </>
          )}
        </button>
      </aside>

      {/* 
        ========================================================================
        2. POPUP RECEPTIONIST PANEL (DESKTOP & RESPONSIVE MOBILE)
        - Desktop: ~400-420px wide, ~640-660px tall
        - Mobile: Full width safe area panel
        - Clean white surface with subtle borders & soft shadow
        - Preserves state when minimized
        ========================================================================
      */}
      <div
        ref={popupRef}
        id="receptionist-widget-popup"
        role="dialog"
        aria-modal="false"
        aria-label={`${activeConfig.receptionistName} - ${activeConfig.businessName}`}
        className={`fixed z-50 transition-all duration-200 ease-out flex flex-col bg-white overflow-hidden border border-slate-200/90 ${
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none scale-[0.98]'
        } 
        /* Mobile: Adaptive viewport-safe container */
        inset-x-3 bottom-3 top-3 sm:inset-auto sm:bottom-20 sm:right-6 md:bottom-22 md:right-6
        sm:w-[400px] md:w-[415px] sm:max-w-[calc(100vw-2rem)]
        sm:h-[620px] md:h-[650px] sm:max-h-[calc(100vh-6.5rem)]
        rounded-2xl sm:rounded-3xl`}
        style={{
          boxShadow: '0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
        }}
      >
        {/* Compact Popup Header */}
        <div className="bg-white border-b border-slate-200/80 px-3.5 py-2.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 shrink-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-2xs ring-1 ring-slate-900/5 shrink-0 overflow-hidden"
              style={{ backgroundColor: activeConfig.primaryAccentColor || '#2563eb' }}
            >
              {activeConfig.logoUrl ? (
                <img
                  src={activeConfig.logoUrl}
                  alt={activeConfig.businessName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-xs sm:text-sm tracking-tight text-slate-900 font-['Outfit'] truncate">
                {activeConfig.receptionistName} • {activeConfig.businessName}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                <span className="inline-flex items-center gap-1 text-teal-700 font-medium shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  Online • Ready
                </span>
                <span className="text-slate-300">•</span>
                <span className="truncate text-slate-500">{activeConfig.phone || '(281) 876-1188'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Direct Phone Dial */}
            {activeConfig.phone && (
              <a
                href={`tel:${activeConfig.phone.replace(/[^0-9]/g, '')}`}
                className="p-1.5 rounded-xl text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                title={`Call ${activeConfig.phone}`}
                aria-label={`Call ${activeConfig.phone}`}
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Close Button */}
            <button
              id="btn-close-widget-popup"
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer active:scale-95"
              title="Close chat"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embedded AI Receptionist Core with State Preservation */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <WidgetErrorBoundary key={errorRetryKey} onRetry={handleRetry}>
            <ChatReceptionist
              isEmbed={true}
              isWidgetPopup={true}
              onCloseWidget={handleClose}
              branding={activeConfig}
            />
          </WidgetErrorBoundary>
        </div>

        {/* Minimal Micro-Footnote Strip */}
        <div className="bg-slate-50/90 border-t border-slate-200/70 px-3 py-1 text-[10px] text-slate-400 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 truncate">
            <ShieldCheck className="w-3 h-3 text-teal-600 shrink-0" />
            <span className="truncate">
              AIWebTeck Assistant • {activeConfig.businessName}
            </span>
          </div>
          <span className="shrink-0 text-slate-400">ESC to close</span>
        </div>
      </div>
    </div>
  );
};

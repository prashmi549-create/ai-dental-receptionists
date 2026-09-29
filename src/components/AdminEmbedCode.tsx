import React, { useState, useMemo, useEffect } from 'react';
import {
  Code,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Laptop,
  ShieldCheck,
  Sparkles,
  Info,
  CheckCircle2,
  Sliders,
  Layers,
  Globe,
  RefreshCw,
  Bot,
  Palette,
  FileText,
} from 'lucide-react';
import {
  DEFAULT_BUSINESS_BRANDING,
  getActiveBranding,
} from '../config/businessBranding';
import {
  BusinessProfileConfig,
  DEFAULT_BUSINESS_CONFIG,
} from '../types';
import { subscribeToBusinessConfig } from '../services/businessConfigService';

interface AdminEmbedCodeProps {
  adminEmail: string;
}

export const AdminEmbedCode: React.FC<AdminEmbedCodeProps> = ({ adminEmail }) => {
  const [copied, setCopied] = useState(false);
  const [embedType, setEmbedType] = useState<'widget' | 'inline'>('widget');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [heightPx, setHeightPx] = useState(700);
  const [previewKey, setPreviewKey] = useState(0);

  // Dynamic business configuration
  const [businessConfig, setBusinessConfig] = useState<BusinessProfileConfig>(() => ({
    businessName: getActiveBranding().businessName || DEFAULT_BUSINESS_CONFIG.businessName,
    receptionistName: getActiveBranding().receptionistName || DEFAULT_BUSINESS_CONFIG.receptionistName,
    logoUrl: getActiveBranding().logoUrl || '',
    primaryAccentColor: (getActiveBranding() as any).primaryAccentColor || DEFAULT_BUSINESS_CONFIG.primaryAccentColor,
    welcomeMessage: getActiveBranding().welcomeMessage || DEFAULT_BUSINESS_CONFIG.welcomeMessage,
    phone: getActiveBranding().phone || DEFAULT_BUSINESS_CONFIG.phone,
    address: getActiveBranding().address || DEFAULT_BUSINESS_CONFIG.address,
    timezone: (getActiveBranding() as any).timezone || DEFAULT_BUSINESS_CONFIG.timezone,
  }));

  useEffect(() => {
    const unsub = subscribeToBusinessConfig((cfg) => {
      setBusinessConfig(cfg);
    });
    return () => unsub();
  }, []);

  const branding = businessConfig;

  // Compute the live published embed URLs dynamically
  const baseEmbedUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/+$/, '') || '';
    return `${origin}${pathname}?embed=true`;
  }, []);

  const widgetEmbedUrl = useMemo(() => {
    return `${baseEmbedUrl}&widget=true`;
  }, [baseEmbedUrl]);

  const inlineEmbedUrl = useMemo(() => {
    return `${baseEmbedUrl}`;
  }, [baseEmbedUrl]);

  const [widgetFormat, setWidgetFormat] = useState<'smart' | 'script' | 'pure-iframe'>('smart');

  const currentPreviewUrl = embedType === 'widget' ? widgetEmbedUrl : inlineEmbedUrl;

  const scriptTagUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/widget.js`;
  }, []);

  // Generate the actual installation snippet for the business
  const generatedSnippet = useMemo(() => {
    const bizName = businessConfig.businessName || 'Business';
    const recName = businessConfig.receptionistName || 'AI Receptionist';
    if (embedType === 'widget') {
      if (widgetFormat === 'script') {
        return `<!-- ${bizName} - ${recName} Floating Widget (1-Line Script) -->
<script src="${scriptTagUrl}" async></script>`;
      }

      if (widgetFormat === 'smart') {
        return `<!-- ${bizName} - ${recName} Floating Widget -->
<iframe
  id="ai-receptionist-widget"
  src="${widgetEmbedUrl}"
  title="Chat with ${recName}"
  style="position: fixed; bottom: 16px; right: 16px; width: 340px; height: 75px; border: none; z-index: 999999; background: transparent; transition: width 0.25s ease, height 0.25s ease;"
  allow="clipboard-write; microphone"
></iframe>
<script>
  window.addEventListener('message', function(e) {
    var f = document.getElementById('ai-receptionist-widget');
    if (!f || !e.data || e.data.type !== 'RECEPTIONIST_WIDGET_STATE') return;
    if (e.data.isOpen) {
      var isMobile = window.innerWidth < 640;
      f.style.width = isMobile ? 'calc(100vw - 20px)' : '440px';
      f.style.height = isMobile ? 'calc(100vh - 20px)' : '720px';
    } else {
      f.style.width = '340px';
      f.style.height = '75px';
    }
  });
</script>`;
      }

      return `<!-- ${bizName} - ${recName} Floating Widget (Pure Iframe) -->
<iframe
  id="ai-receptionist-widget"
  src="${widgetEmbedUrl}"
  title="Chat with ${recName}"
  style="position: fixed; bottom: 16px; right: 16px; width: 440px; height: 720px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); border: none; z-index: 999999; background: transparent;"
  allow="clipboard-write; microphone"
></iframe>`;
    }

    return `<!-- ${bizName} - ${recName} Inline Frame -->
<iframe
  src="${inlineEmbedUrl}"
  title="${recName}"
  width="100%"
  height="${heightPx}"
  frameborder="0"
  style="border: none; max-width: 100%; border-radius: 16px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08);"
  allow="clipboard-write; microphone"
></iframe>`;
  }, [embedType, widgetFormat, widgetEmbedUrl, inlineEmbedUrl, scriptTagUrl, heightPx, businessConfig]);

  const handleCopy = () => {
    if (!generatedSnippet) return;
    navigator.clipboard.writeText(generatedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRefreshPreview = () => {
    setPreviewKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Bot className="w-3.5 h-3.5" />
                Embeddable Receptionist Widget
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Public & Isolated
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-['Outfit']">
              Website Embed Widget & Integration
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Embed the AI Dental Receptionist as a client-facing website widget or inline frame into an existing business website (WordPress, Squarespace, Wix, Webflow, or custom HTML). Visitors can click the floating button, converse with the AI, and complete live bookings without leaving the client website.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              id="link-open-embed-test"
              href={currentPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>Test Widget in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Live URL Pill */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap bg-slate-50 p-3 rounded-xl border">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500 shrink-0">Live Published URL:</span>
            <code className="text-xs font-mono font-semibold text-blue-700 truncate bg-white px-2 py-0.5 rounded border border-slate-200">
              {currentPreviewUrl || 'Generating...'}
            </code>
          </div>
          <span className="text-[11px] text-slate-400">
            Mode: <code className="font-mono text-slate-600 font-semibold">{embedType === 'widget' ? '?embed=true&widget=true' : '?embed=true'}</code>
          </span>
        </div>
      </div>

      {/* Snippet Generator & Customizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Embed Code & Customizer Options */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customizer Settings Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 font-['Outfit']">
                  Embed Mode & Options
                </h3>
              </div>
              <span className="text-xs text-slate-400">Generates instant HTML</span>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block font-semibold text-slate-700 text-xs mb-2">
                Choose Embed Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEmbedType('widget')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    embedType === 'widget'
                      ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs mb-1 font-['Outfit']">
                    <span>Floating Receptionist Widget</span>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                      Floating Popup
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Floating button at bottom-right corner. Opens popup chat upon click. Non-intrusive for website visitors.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEmbedType('inline')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    embedType === 'inline'
                      ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs mb-1 font-['Outfit']">
                    <span>Inline Container Frame</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                      Inline Frame
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Dedicated standalone frame embedded directly inside a content column or booking page section.
                  </p>
                </button>
              </div>
            </div>

            {/* Format Selector for Widget vs Height Selector for Inline */}
            {embedType === 'widget' ? (
              <div className="text-xs pt-1">
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Floating Widget Installation Format
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWidgetFormat('script')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      widgetFormat === 'script'
                        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold font-['Outfit']">1-Line Script Tag</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1 py-0.5 rounded">Easiest</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      One tag to drop anywhere before &lt;/body&gt;. Auto-manages popup launcher.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWidgetFormat('smart')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      widgetFormat === 'smart'
                        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold font-['Outfit'] mb-0.5">
                      Smart Iframe &amp; Script
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      Transparent corner frame that expands on click via postMessage listener.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWidgetFormat('pure-iframe')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      widgetFormat === 'pure-iframe'
                        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold font-['Outfit'] mb-0.5">
                      Pure Floating Iframe
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      Fixed corner iframe without javascript. Ideal for strict CMS environments.
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs pt-1">
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Inline Frame Container Height
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[600, 700, 800].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHeightPx(h)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                        heightPx === h
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {h}px {h === 700 ? '(Recommended)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Configuration Layer Foundation Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 font-['Outfit']">
                  Business Branding &amp; Embed Configuration
                </h3>
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold">Active & Configured</span>
            </div>

            <p className="text-xs text-slate-500">
              Clean configuration structure supporting client clinic custom branding with safe, reliable defaults.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">businessName</span>
                <span className="font-semibold text-slate-800">{branding.businessName}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">receptionistName</span>
                <span className="font-semibold text-slate-800">{branding.receptionistName}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">primaryAccentColor</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-slate-300"
                    style={{ backgroundColor: branding.primaryAccentColor || '#2563eb' }}
                  />
                  <span className="font-mono font-semibold text-slate-800">
                    {branding.primaryAccentColor || '#2563eb'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">phone & address</span>
                <span className="font-semibold text-slate-800">
                  {branding.phone || 'None'} {branding.address ? `(${branding.address})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Code Snippet Box */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-sm text-white">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  Copyable Installation Snippet
                </span>
              </div>
              <button
                id="btn-copy-embed-snippet"
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            <pre className="text-xs font-mono text-slate-200 bg-slate-950/80 p-4 rounded-xl overflow-x-auto border border-slate-800/80 leading-relaxed">
              {generatedSnippet}
            </pre>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
              <span>Standard HTML5 iframe • Zero external script dependencies required</span>
              <span>Width: 100% • Height: {heightPx}px</span>
            </div>
          </div>

          {/* Quick Platform Guides */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Platform Installation Instructions</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-800">WordPress</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Add a <strong>Custom HTML</strong> block in Gutenberg, Elementor, or your theme footer, paste the snippet, and update.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-800">Squarespace & Wix</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Insert an <strong>Embed / Code</strong> block, select HTML embed mode, paste the snippet, and publish your site.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-800">Custom HTML</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Paste the snippet directly before the closing <code>&lt;/body&gt;</code> tag or inside your desired layout container.
                </p>
              </div>
            </div>
          </div>

          {/* Security & Isolation Callout */}
          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 space-y-1 leading-relaxed">
              <p className="font-bold">Strict Security & Administrative Isolation:</p>
              <p>
                In Embed Mode (<code className="font-mono text-[11px] font-semibold">?embed=true&widget=true</code>), the interface renders <strong>only the customer-facing AI Receptionist</strong>. Administrative routes, Google login prompts, slot management, patient directories, schedule configurations, and diagnostic tools are strictly isolated.
              </p>
              <p className="text-[11px] text-emerald-800">
                Bookings made through the widget are processed with duration-aware overlap checks and ACID transaction guarantees on Firestore.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Embed Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Live Interactive Preview
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              <div className="flex items-center gap-1.5">
                {/* Device width toggle */}
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      previewDevice === 'desktop'
                        ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Simulate desktop / wide container"
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Desktop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      previewDevice === 'mobile'
                        ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Simulate mobile / narrow column"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile (375px)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshPreview}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Reload preview"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Container simulator */}
            <div className="bg-slate-100 rounded-xl p-2 sm:p-3 flex justify-center items-start overflow-hidden min-h-[550px]">
              <div
                style={{
                  width: previewDevice === 'mobile' ? '375px' : '100%',
                  height: '600px',
                  maxWidth: '100%',
                  transition: 'width 0.25s ease-in-out',
                }}
                className="bg-white overflow-hidden rounded-2xl shadow-md border border-slate-300/80 flex flex-col"
              >
                {/* Mock Browser Header for simulation */}
                <div className="bg-slate-200/80 border-b border-slate-300/80 px-3 py-1.5 flex items-center gap-2 text-[10px] text-slate-600 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex-1 text-center font-mono text-[9px] text-slate-500 truncate bg-white/70 py-0.5 px-2 rounded">
                    yourclinicwebsite.com
                  </div>
                </div>

                {/* Actual live Iframe in embed mode */}
                <iframe
                  key={previewKey}
                  src={currentPreviewUrl}
                  title="Live Receptionist Embed Preview"
                  className="w-full flex-1 border-0"
                  allow="clipboard-write"
                />
              </div>
            </div>

            <div className="mt-2 text-center">
              <span className="text-[11px] text-slate-400">
                Simulating embedded widget at {previewDevice === 'mobile' ? '375px mobile width' : '100% desktop width'}.
              </span>
            </div>
          </div>

          {/* Concept Demo Attribution Notice */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-slate-700">Demonstration Disclosure:</span>
              <p>
                The embed code retains the required <span className="font-semibold text-slate-700">"AIWebTeck Concept Demo"</span> attribution tag. It is intended for testing and demonstration on client staging pages, and does not imply official endorsement or formal partnership with Dental Care & Implants of Houston.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

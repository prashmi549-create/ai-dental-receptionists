/**
 * Phase 11B: Business Branding Configuration Layer
 *
 * Provides a clean configuration foundation for the AI Receptionist and Widget
 * without hard-coding to one clinic or requiring a rewrite of the receptionist engine.
 */

export interface BusinessBrandingConfig {
  businessName: string;
  receptionistName: string;
  primaryAccent: string;
  primaryAccentColor?: string;
  logoUrl?: string;
  welcomeMessage: string;
  clinicTagline?: string;
  phone?: string;
  address?: string;
  timezone?: string;
  operatingHoursSummary?: string;
}

/**
 * Default branding configuration using Dental Care & Implants of Houston demo values.
 */
export const DEFAULT_BUSINESS_BRANDING: BusinessBrandingConfig = {
  businessName: 'Dental Care & Implants of Houston',
  receptionistName: 'AI Dental Receptionist',
  primaryAccent: '#2563eb', // Clean medical blue
  primaryAccentColor: '#2563eb',
  logoUrl: '',
  welcomeMessage: 'Hi! How can I help you today?',
  clinicTagline: 'Greenspoint • Houston, TX',
  phone: '(281) 876-1188',
  address: '165 Greens Rd, Houston, TX 77060',
  timezone: 'America/Chicago',
  operatingHoursSummary: 'Mon–Fri: 08:00–19:00, Sat: 08:00–17:00',
};

/**
 * Storage key for persisting custom preview branding in Admin session
 */
const BRANDING_STORAGE_KEY = 'dental_receptionist_branding_v1';

/**
 * Loads current business branding, optionally merging from query params or localStorage
 */
export const getActiveBranding = (): BusinessBrandingConfig => {
  if (typeof window === 'undefined') return { ...DEFAULT_BUSINESS_BRANDING };

  try {
    // Check URL parameters for runtime overrides
    const searchParams = new URLSearchParams(window.location.search);
    const paramBizName = searchParams.get('bizName') || searchParams.get('businessName');
    const paramRecName = searchParams.get('recName') || searchParams.get('receptionistName');
    const paramWelcome = searchParams.get('welcome') || searchParams.get('welcomeMessage');
    const paramAccent = searchParams.get('accent') || searchParams.get('primaryAccent');

    // Check localStorage for saved admin customizations
    let savedConfig: Partial<BusinessBrandingConfig> = {};
    const stored = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (stored) {
      try {
        savedConfig = JSON.parse(stored);
      } catch {
        // ignore parse error
      }
    }

    const result = {
      ...DEFAULT_BUSINESS_BRANDING,
      ...savedConfig,
      ...(paramBizName ? { businessName: paramBizName } : {}),
      ...(paramRecName ? { receptionistName: paramRecName } : {}),
      ...(paramWelcome ? { welcomeMessage: paramWelcome } : {}),
      ...(paramAccent ? { primaryAccent: paramAccent, primaryAccentColor: paramAccent } : {}),
    };
    if (!result.primaryAccentColor) {
      result.primaryAccentColor = result.primaryAccent;
    }
    return result;
  } catch {
    return { ...DEFAULT_BUSINESS_BRANDING };
  }
};

/**
 * Saves branding customization for admin demonstration
 */
export const saveActiveBranding = (config: Partial<BusinessBrandingConfig>): void => {
  if (typeof window === 'undefined') return;
  try {
    const current = getActiveBranding();
    const updated = { ...current, ...config };
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage access might be restricted in some iframes
  }
};

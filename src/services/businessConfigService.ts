/**
 * Phase 11C: Business Configuration Service
 * Dental Care & Implants of Houston / Configurable Business Profile
 *
 * Manages:
 * - Business identity (businessName, receptionistName, logoUrl)
 * - Accent color branding (primaryAccentColor)
 * - Conversational greeting (welcomeMessage)
 * - Contact & local info (phone, address, timezone)
 * - Protected Firestore persistence under settings/business
 * - Client-side safe fallbacks to verified Dental Care & Implants demo defaults
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { BusinessProfileConfig, DEFAULT_BUSINESS_CONFIG } from '../types';
import { saveActiveBranding } from '../config/businessBranding';

export const SETTINGS_COLLECTION = 'settings';
export const BUSINESS_CONFIG_DOC_ID = 'business';

let cachedBusinessConfig: BusinessProfileConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Returns the currently cached business profile configuration synchronously.
 * Always returns a valid BusinessProfileConfig with demo fallback.
 */
export function getLoadedBusinessConfig(): BusinessProfileConfig {
  return cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG };
}

/**
 * Validates a partial or full business configuration before saving.
 */
export function validateBusinessConfig(
  config: Partial<BusinessProfileConfig>
): { valid: boolean; error?: string } {
  if (config.businessName !== undefined) {
    const trimmed = config.businessName.trim();
    if (!trimmed) {
      return { valid: false, error: 'Business name is required.' };
    }
    if (trimmed.length < 2) {
      return { valid: false, error: 'Business name must be at least 2 characters long.' };
    }
    if (trimmed.length > 100) {
      return { valid: false, error: 'Business name must not exceed 100 characters.' };
    }
  }

  if (config.receptionistName !== undefined) {
    const trimmed = config.receptionistName.trim();
    if (!trimmed) {
      return { valid: false, error: 'Receptionist name is required.' };
    }
    if (trimmed.length < 2) {
      return { valid: false, error: 'Receptionist name must be at least 2 characters long.' };
    }
    if (trimmed.length > 60) {
      return { valid: false, error: 'Receptionist name must not exceed 60 characters.' };
    }
  }

  if (config.welcomeMessage !== undefined) {
    const trimmed = config.welcomeMessage.trim();
    if (!trimmed) {
      return { valid: false, error: 'Welcome message is required.' };
    }
    if (trimmed.length < 5) {
      return { valid: false, error: 'Welcome message must be at least 5 characters long.' };
    }
    if (trimmed.length > 500) {
      return { valid: false, error: 'Welcome message must not exceed 500 characters.' };
    }
  }

  if (config.phone !== undefined) {
    const trimmed = config.phone.trim();
    if (!trimmed) {
      return { valid: false, error: 'Business phone number is required.' };
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 10) {
      return { valid: false, error: 'Business phone number must have at least 10 digits.' };
    }
  }

  if (config.primaryAccentColor !== undefined) {
    const hex = config.primaryAccentColor.trim();
    const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    if (!hexRegex.test(hex)) {
      return { valid: false, error: 'Accent color must be a valid hex code (e.g., #2563eb).' };
    }
  }

  if (config.logoUrl !== undefined && config.logoUrl.trim()) {
    const url = config.logoUrl.trim();
    const isHttp = /^https?:\/\//i.test(url);
    const isData = /^data:image\//i.test(url);
    const isRelative = url.startsWith('/');
    if (!isHttp && !isData && !isRelative) {
      return { valid: false, error: 'Logo URL must start with http://, https://, or be a valid image path.' };
    }
  }

  if (config.timezone !== undefined) {
    const tz = config.timezone.trim();
    if (!tz) {
      return { valid: false, error: 'Timezone is required.' };
    }
  }

  return { valid: true };
}

/**
 * Normalizes raw Firestore document data, guaranteeing no null/undefined properties.
 */
export function normalizeBusinessConfig(rawData?: any): BusinessProfileConfig {
  if (!rawData || typeof rawData !== 'object') {
    return { ...DEFAULT_BUSINESS_CONFIG };
  }

  return {
    businessName: typeof rawData.businessName === 'string' && rawData.businessName.trim()
      ? rawData.businessName.trim()
      : DEFAULT_BUSINESS_CONFIG.businessName,
    receptionistName: typeof rawData.receptionistName === 'string' && rawData.receptionistName.trim()
      ? rawData.receptionistName.trim()
      : DEFAULT_BUSINESS_CONFIG.receptionistName,
    logoUrl: typeof rawData.logoUrl === 'string' ? rawData.logoUrl.trim() : DEFAULT_BUSINESS_CONFIG.logoUrl,
    primaryAccentColor: typeof rawData.primaryAccentColor === 'string' && /^#[0-9A-Fa-f]{3,6}$/.test(rawData.primaryAccentColor.trim())
      ? rawData.primaryAccentColor.trim()
      : DEFAULT_BUSINESS_CONFIG.primaryAccentColor,
    welcomeMessage: typeof rawData.welcomeMessage === 'string' && rawData.welcomeMessage.trim()
      ? rawData.welcomeMessage.trim()
      : DEFAULT_BUSINESS_CONFIG.welcomeMessage,
    phone: typeof rawData.phone === 'string' && rawData.phone.trim()
      ? rawData.phone.trim()
      : DEFAULT_BUSINESS_CONFIG.phone,
    address: typeof rawData.address === 'string' && rawData.address.trim()
      ? rawData.address.trim()
      : DEFAULT_BUSINESS_CONFIG.address,
    timezone: typeof rawData.timezone === 'string' && rawData.timezone.trim()
      ? rawData.timezone.trim()
      : DEFAULT_BUSINESS_CONFIG.timezone,
    updatedAt: rawData.updatedAt || undefined,
    updatedBy: rawData.updatedBy || undefined,
  };
}

/**
 * Loads current business configuration from Firestore (settings/business).
 * Falls back to DEFAULT_BUSINESS_CONFIG if missing or unavailable.
 */
export async function getBusinessConfig(forceRefresh = false): Promise<BusinessProfileConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedBusinessConfig && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedBusinessConfig;
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, BUSINESS_CONFIG_DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const normalized = normalizeBusinessConfig(snap.data());
      cachedBusinessConfig = normalized;
      lastFetchTime = now;
      // Sync with localStorage branding layer for seamless compatibility
      saveActiveBranding({
        businessName: normalized.businessName,
        receptionistName: normalized.receptionistName,
        primaryAccent: normalized.primaryAccentColor,
        logoUrl: normalized.logoUrl,
        welcomeMessage: normalized.welcomeMessage,
        phone: normalized.phone,
        address: normalized.address,
      });
      return normalized;
    }

    // If document doesn't exist yet, return safe demo defaults
    cachedBusinessConfig = { ...DEFAULT_BUSINESS_CONFIG };
    lastFetchTime = now;
    return cachedBusinessConfig;
  } catch (err) {
    console.warn('Could not load settings/business from Firestore, using default fallback:', err);
    return cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG };
  }
}

/**
 * Subscribes to real-time changes in settings/business.
 * Notifies callback immediately and on every update.
 */
export function subscribeToBusinessConfig(
  callback: (config: BusinessProfileConfig) => void
): () => void {
  // Fire callback immediately with cached or default config
  callback(cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG });

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, BUSINESS_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const normalized = normalizeBusinessConfig(snapshot.data());
          cachedBusinessConfig = normalized;
          lastFetchTime = Date.now();
          saveActiveBranding({
            businessName: normalized.businessName,
            receptionistName: normalized.receptionistName,
            primaryAccent: normalized.primaryAccentColor,
            logoUrl: normalized.logoUrl,
            welcomeMessage: normalized.welcomeMessage,
            phone: normalized.phone,
            address: normalized.address,
          });
          callback(normalized);
        } else {
          callback(cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG });
        }
      },
      (error) => {
        console.warn('Real-time subscription to settings/business error:', error);
        callback(cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG });
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to attach snapshot listener to settings/business:', err);
    return () => {};
  }
}

/**
 * Saves business configuration to Firestore in settings/business.
 * Protected: Only authenticated admins can write (enforced by Firestore rules).
 */
export async function saveBusinessConfig(
  config: Partial<BusinessProfileConfig>,
  adminEmail?: string
): Promise<{ success: boolean; config: BusinessProfileConfig; error?: string }> {
  // 1. Validate
  const validation = validateBusinessConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      config: cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG },
      error: validation.error,
    };
  }

  try {
    const current = await getBusinessConfig(true);
    const updated: BusinessProfileConfig = {
      ...current,
      ...config,
      businessName: config.businessName?.trim() || current.businessName,
      receptionistName: config.receptionistName?.trim() || current.receptionistName,
      logoUrl: config.logoUrl !== undefined ? config.logoUrl.trim() : current.logoUrl,
      primaryAccentColor: config.primaryAccentColor?.trim() || current.primaryAccentColor,
      welcomeMessage: config.welcomeMessage?.trim() || current.welcomeMessage,
      phone: config.phone?.trim() || current.phone,
      address: config.address?.trim() || current.address,
      timezone: config.timezone?.trim() || current.timezone,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail || 'admin',
    };

    const docRef = doc(db, SETTINGS_COLLECTION, BUSINESS_CONFIG_DOC_ID);
    await setDoc(docRef, updated, { merge: true });

    cachedBusinessConfig = updated;
    lastFetchTime = Date.now();

    // Sync with localStorage branding layer
    saveActiveBranding({
      businessName: updated.businessName,
      receptionistName: updated.receptionistName,
      primaryAccent: updated.primaryAccentColor,
      logoUrl: updated.logoUrl,
      welcomeMessage: updated.welcomeMessage,
      phone: updated.phone,
      address: updated.address,
    });

    return { success: true, config: updated };
  } catch (err: any) {
    console.error('Error saving business config:', err);
    const friendlyError =
      err?.code === 'permission-denied' ||
      err?.message?.includes('permission') ||
      err?.message?.includes('insufficient')
        ? "Permission denied: Only authorized administrators can update business profile settings."
        : err?.message || 'Failed to save business profile to Firestore';
    return {
      success: false,
      config: cachedBusinessConfig || { ...DEFAULT_BUSINESS_CONFIG },
      error: friendlyError,
    };
  }
}

/**
 * Resets the business configuration to the Dental Care & Implants of Houston demo defaults.
 */
export async function resetBusinessConfigToDefault(
  adminEmail?: string
): Promise<{ success: boolean; config: BusinessProfileConfig; error?: string }> {
  return saveBusinessConfig(DEFAULT_BUSINESS_CONFIG, adminEmail);
}

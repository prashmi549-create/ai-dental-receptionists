import React, { useState, useEffect } from 'react';
import { ChatReceptionist } from './components/ChatReceptionist';
import { ReceptionistWidget } from './components/ReceptionistWidget';
import { AdminPortal } from './components/AdminPortal';

/**
 * Validates whether a given URL hash or pathname represents an administrative or demo manager route.
 * Strictly gates all admin, slot management, appointment management, patient, settings,
 * notifications, and legacy demo manager routes behind administrator authentication.
 */
export const isAnyAdminRoute = (hash: string, pathname = ''): boolean => {
  const check = (str: string) => {
    if (!str) return false;
    const clean = str.toLowerCase().trim().replace(/^#\/?/, '').replace(/^\//, '');
    if (!clean) return false;

    const adminKeywords = [
      'admin',
      'demo',
      'demo-manager',
      'demo-appointment-manager',
      'appointment-manager',
      'manager',
      'slots',
      'slot-management',
      'appointments',
      'patients',
      'settings',
      'schedule-settings',
      'notifications',
      'reminders',
      'availability',
      'simulated-availability',
    ];

    return adminKeywords.some(
      (keyword) => clean === keyword || clean.startsWith(`${keyword}/`) || clean.startsWith(`${keyword}?`)
    );
  };

  return check(hash) || check(pathname);
};

export const isAdminRoute = (hash: string): boolean => {
  return isAnyAdminRoute(hash, typeof window !== 'undefined' ? window.location.pathname : '');
};

/**
 * Detects if Embed Mode is active via query parameter (?embed=true, ?embed=1) or hash (#/embed, #/?embed=true).
 */
export const isEmbedMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (
      searchParams.get('embed') === 'true' ||
      searchParams.get('embed') === '1' ||
      searchParams.get('widget') === 'true' ||
      searchParams.get('launcher') === 'true'
    ) {
      return true;
    }
    const hash = window.location.hash || '';
    if (
      hash.startsWith('#/embed') ||
      hash === '#embed' ||
      hash.startsWith('#/widget') ||
      hash === '#widget'
    ) {
      return true;
    }
    const hashQuestionIdx = hash.indexOf('?');
    if (hashQuestionIdx !== -1) {
      const hashParams = new URLSearchParams(hash.substring(hashQuestionIdx));
      if (
        hashParams.get('embed') === 'true' ||
        hashParams.get('embed') === '1' ||
        hashParams.get('widget') === 'true' ||
        hashParams.get('launcher') === 'true'
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

export default function App() {
  const [embedActive, setEmbedActive] = useState<boolean>(() => isEmbedMode());
  const [currentView, setCurrentView] = useState<'receptionist' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      // In Embed Mode, Admin is NEVER activated
      if (!isEmbedMode() && isAnyAdminRoute(window.location.hash, window.location.pathname)) {
        return 'admin';
      }
    }
    return 'receptionist';
  });

  useEffect(() => {
    const handleNavigation = () => {
      const embed = isEmbedMode();
      setEmbedActive(embed);

      if (embed) {
        // Strict Admin Separation: In Embed Mode, never render Admin UI
        setCurrentView('receptionist');
        return;
      }

      const isTargetingAdmin = isAnyAdminRoute(window.location.hash, window.location.pathname);
      if (isTargetingAdmin) {
        // Canonicalize hash to #/admin so downstream always targets the current Admin Dashboard
        if (window.location.hash !== '#/admin') {
          window.location.hash = '#/admin';
        }
        setCurrentView('admin');
      } else {
        setCurrentView('receptionist');
      }
    };

    // Check initial route on mount
    handleNavigation();

    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    return () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  const handleOpenAdmin = () => {
    if (embedActive) return; // Disallowed in Embed Mode
    setCurrentView('admin');
    window.location.hash = '#/admin';
  };

  const handleBackToReceptionist = () => {
    setCurrentView('receptionist');
    window.location.hash = '';
    if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.origin + '/');
    }
  };

  // Embed Mode: strictly customer-facing receptionist, zero admin access
  if (embedActive) {
    let isWidget = false;
    let initiallyOpen = false;
    if (typeof window !== 'undefined') {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        isWidget = searchParams.get('widget') === 'true' || searchParams.get('launcher') === 'true';
        initiallyOpen = searchParams.get('open') === 'true' || searchParams.get('popup') === 'open';
      } catch {
        // ignore fallback
      }
    }

    if (isWidget) {
      return <ReceptionistWidget initiallyOpen={initiallyOpen} />;
    }

    // Default for ?embed=true is the clean embedded receptionist experience (Phase 11A)
    return <ChatReceptionist isEmbed={true} />;
  }

  if (currentView === 'admin') {
    return <AdminPortal onBackToReceptionist={handleBackToReceptionist} />;
  }

  // Public receptionist canvas: older Demo Appointment Manager is strictly excluded from public view
  return (
    <ChatReceptionist
      onOpenAdminDashboard={handleOpenAdmin}
      isEmbed={false}
    />
  );
}


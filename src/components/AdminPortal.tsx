import React, { useState, useEffect } from 'react';
import { subscribeToAdminAuth, signOutAdmin, AdminAuthState } from '../services/adminAuthService';
import { AdminLogin } from './AdminLogin';
import { DemoAdminDashboard } from './DemoAdminDashboard';
import { Loader2, ShieldCheck } from 'lucide-react';

interface AdminPortalProps {
  onBackToReceptionist: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onBackToReceptionist }) => {
  const [authState, setAuthState] = useState<AdminAuthState>({
    loading: true,
    user: null,
    isAuthorized: false,
    adminData: null,
    authError: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeToAdminAuth((state) => {
      setAuthState(state);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOutAdmin();
    setAuthState({
      loading: false,
      user: null,
      isAuthorized: false,
      adminData: null,
      authError: null,
    });
  };

  // 1. Loading State
  if (authState.loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs mb-4">
          <ShieldCheck className="w-6 h-6 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-slate-800 font-['Outfit']">
          AI Dental Receptionist
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          <span>Verifying administrator authorization...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated OR Unauthorized Account State
  // If user is not logged in or their Google account is not an authorized admin
  if (!authState.user || !authState.isAuthorized) {
    return (
      <AdminLogin
        authenticatedUser={authState.user}
        authError={authState.authError}
        onSignOut={handleLogout}
        onSuccess={() => {
          // Handled automatically via subscribeToAdminAuth state listener
        }}
        onBackToReceptionist={onBackToReceptionist}
      />
    );
  }

  // 3. Authenticated & Authorized Admin State
  return (
    <DemoAdminDashboard
      adminEmail={authState.user.email || ''}
      onLogout={handleLogout}
      onBackToWebsite={onBackToReceptionist}
    />
  );
};

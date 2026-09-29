import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AdminUser } from '../types';

export const ADMINS_COLLECTION = 'admins';

export interface AdminAuthState {
  loading: boolean;
  user: User | null;
  isAuthorized: boolean;
  adminData?: AdminUser | null;
  authError?: string | null;
}

/**
 * Verify whether an authenticated Google user's email exists in the Firestore `admins` collection
 * under document ID `admins/{authenticatedEmail}` with `role: "admin"`.
 *
 * Rules:
 * - Admin documents are created manually in Firebase Console by the project owner.
 * - If matching document with role === "admin" exists, access is granted.
 * - Otherwise, access is strictly denied.
 */
export async function verifyAdminAuthorization(
  userEmail: string | null | undefined
): Promise<{ isAuthorized: boolean; adminData?: AdminUser; error?: string }> {
  if (!userEmail) {
    return {
      isAuthorized: false,
      error: 'No email address found for this Google account.',
    };
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  const rawEmail = userEmail.trim();

  try {
    // 1. Check admins/{normalizedEmail}
    const adminDocRef = doc(db, ADMINS_COLLECTION, normalizedEmail);
    const snap = await getDoc(adminDocRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data && data.role === 'admin') {
        return {
          isAuthorized: true,
          adminData: {
            uid: normalizedEmail,
            email: normalizedEmail,
            role: 'admin',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          },
        };
      }
    }

    // 2. If raw email has different casing, check raw email document ID
    if (rawEmail !== normalizedEmail) {
      const rawDocRef = doc(db, ADMINS_COLLECTION, rawEmail);
      const rawSnap = await getDoc(rawDocRef);

      if (rawSnap.exists()) {
        const data = rawSnap.data();
        if (data && data.role === 'admin') {
          return {
            isAuthorized: true,
            adminData: {
              uid: rawEmail,
              email: rawEmail,
              role: 'admin',
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            },
          };
        }
      }
    }

    return {
      isAuthorized: false,
      error:
        'Admin access denied. This Google account is authenticated, but it is not authorized to access the Admin interface.',
    };
  } catch (error: any) {
    console.error('Error verifying admin authorization in Firestore admins/{email}:', error);
    return {
      isAuthorized: false,
      error:
        'Admin access denied. This Google account is authenticated, but it is not authorized to access the Admin interface.',
    };
  }
}

/**
 * Sign in an administrator via Firebase Authentication using the Google provider.
 */
export async function signInWithGoogle(): Promise<{
  success: boolean;
  user?: User;
  isAuthorized?: boolean;
  error?: string;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    const credential = await signInWithPopup(auth, provider);
    const user = credential.user;

    if (!user || !user.email) {
      return {
        success: false,
        error: 'No email address found for this Google account.',
      };
    }

    // Verify role in Firestore admins/{authenticatedEmail}
    const { isAuthorized, error } = await verifyAdminAuthorization(user.email);

    if (!isAuthorized) {
      return {
        success: false,
        user,
        isAuthorized: false,
        error:
          error ||
          'Admin access denied. This Google account is authenticated, but it is not authorized to access the Admin interface.',
      };
    }

    return {
      success: true,
      user,
      isAuthorized: true,
    };
  } catch (err: any) {
    console.error('Google sign-in error:', err);

    if (err.code === 'auth/popup-closed-by-user') {
      return {
        success: false,
        error: 'Google sign-in was closed before completing.',
      };
    }
    if (err.code === 'auth/popup-blocked') {
      return {
        success: false,
        error:
          'The sign-in popup was blocked by your browser. Please allow popups for this site.',
      };
    }
    if (err.code === 'auth/cancelled-popup-request') {
      return {
        success: false,
        error: 'Sign-in was cancelled.',
      };
    }

    return {
      success: false,
      error: err?.message || 'Google sign-in failed. Please try again.',
    };
  }
}

/**
 * Sign out of Firebase Authentication
 */
export async function signOutAdmin(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (err) {
    console.error('Error signing out admin:', err);
  }
}

/**
 * Hook or helper to subscribe to auth state changes with admin verification
 */
export function subscribeToAdminAuth(callback: (state: AdminAuthState) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({
        loading: false,
        user: null,
        isAuthorized: false,
        adminData: null,
        authError: null,
      });
      return;
    }

    // Verify admin role in Firestore admins/{email}
    const { isAuthorized, adminData, error } = await verifyAdminAuthorization(user.email);

    callback({
      loading: false,
      user,
      isAuthorized,
      adminData: adminData || null,
      authError: isAuthorized ? null : error || null,
    });
  });
}

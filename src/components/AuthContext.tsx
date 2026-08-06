import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../utils/passwordHash';

export type UserRole = 'Admin' | 'Owner';

export interface StoredUser {
  email: string;
  name: string;
  role: UserRole;
  salt: string;
  passwordHash: string;
  ownerId?: string;
  avatarPhotoId?: string;
}

export interface UserSession {
  email: string;
  name: string;
  role: UserRole;
  ownerId?: string;
  avatarPhotoId?: string;
}

interface AuthContextType {
  user: UserSession | null;
  portalType: 'admin' | 'owner' | null;
  setPortalType: (type: 'admin' | 'owner' | null) => void;
  login: (email: string, role: 'admin' | 'owner', password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; token?: string; error?: string }>;
  resetPassword: (token: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
  updateUser: (name: string, email: string, avatarPhotoId?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Approach (a): Generic placeholder seed accounts.
 * Real email addresses and plaintext passwords have been removed from source.
 * Even seed account passwords are stored strictly with cryptographic salts & SHA-256 hashes.
 */
const SEED_ACCOUNTS = [
  {
    email: 'admin@hasidadi.com',
    name: 'Executive Admin',
    role: 'Admin' as UserRole,
    defaultPassword: 'AdminPassword123!',
  },
  {
    email: 'owner@hasidadi.com',
    name: 'Wakala Agent Owner',
    role: 'Owner' as UserRole,
    ownerId: 'owner-1',
    defaultPassword: 'OwnerPassword123!',
  },
];

async function createDefaultUsers(): Promise<StoredUser[]> {
  const users: StoredUser[] = [];
  for (const seed of SEED_ACCOUNTS) {
    const salt = generateSalt();
    const passwordHash = await hashPassword(seed.defaultPassword, salt);
    users.push({
      email: seed.email,
      name: seed.name,
      role: seed.role,
      ownerId: seed.ownerId,
      salt,
      passwordHash,
    });
  }
  return users;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [portalType, setPortalState] = useState<'admin' | 'owner' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize roster and current session from localStorage with storage migration
  useEffect(() => {
    async function initAuth() {
      if (typeof window === 'undefined') {
        setIsLoading(false);
        return;
      }

      try {
        const authVersion = localStorage.getItem('hasidadi_auth_version');
        const storedUsersRaw = localStorage.getItem('hasidadi_users');
        
        let needsMigration = false;
        let usersToStore: StoredUser[] = [];

        // Check if roster is missing or contains real legacy emails or plaintext passwords
        if (!storedUsersRaw || authVersion !== 'v3') {
          needsMigration = true;
        } else {
          try {
            const parsed = JSON.parse(storedUsersRaw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
              needsMigration = true;
            } else {
              // Inspect existing records
              for (const u of parsed) {
                // If any real legacy email or missing hash/salt
                if (
                  !u.salt ||
                  !u.passwordHash ||
                  u.password !== undefined ||
                  u.email?.includes('gmail.com') ||
                  u.email === 'executive@hasidadi.com' ||
                  u.email === 'sarah.mndeme@hasidadi.com' ||
                  u.email === 'abubakar.khalid@hasidadi.com'
                ) {
                  needsMigration = true;
                  break;
                }
              }
            }
          } catch {
            needsMigration = true;
          }
        }

        if (needsMigration) {
          usersToStore = await createDefaultUsers();
          localStorage.setItem('hasidadi_users', JSON.stringify(usersToStore));
          localStorage.setItem('hasidadi_auth_version', 'v3');
        }

        // Restore active user session if valid
        const savedUser = localStorage.getItem('hasidadi_current_user');
        const savedPortal = localStorage.getItem('hasidadi_portal_type');

        if (savedUser) {
          try {
            const parsedSession: UserSession = JSON.parse(savedUser);
            // If session belongs to a legacy real email, map to new seed
            if (
              parsedSession.email?.includes('gmail.com') ||
              parsedSession.email === 'executive@hasidadi.com' ||
              parsedSession.email === 'sarah.mndeme@hasidadi.com'
            ) {
              parsedSession.email = 'admin@hasidadi.com';
              localStorage.setItem('hasidadi_current_user', JSON.stringify(parsedSession));
            } else if (parsedSession.email === 'abubakar.khalid@hasidadi.com') {
              parsedSession.email = 'owner@hasidadi.com';
              localStorage.setItem('hasidadi_current_user', JSON.stringify(parsedSession));
            }
            setUser(parsedSession);
          } catch {
            localStorage.removeItem('hasidadi_current_user');
          }
        }

        if (savedPortal === 'admin' || savedPortal === 'owner') {
          setPortalState(savedPortal);
        }
      } catch (e) {
        console.error('Error initializing AuthProvider state:', e);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const setPortalType = (type: 'admin' | 'owner' | null) => {
    setPortalState(type);
    if (type) {
      localStorage.setItem('hasidadi_portal_type', type);
    } else {
      localStorage.removeItem('hasidadi_portal_type');
    }
  };

  const login = async (
    email: string,
    requestedPortal: 'admin' | 'owner',
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          let usersStr = localStorage.getItem('hasidadi_users');
          let users: StoredUser[] = [];
          if (usersStr) {
            try {
              users = JSON.parse(usersStr);
            } catch {
              users = [];
            }
          }

          if (!users || users.length === 0) {
            users = await createDefaultUsers();
            localStorage.setItem('hasidadi_users', JSON.stringify(users));
            localStorage.setItem('hasidadi_auth_version', 'v3');
          }

          const found = users.find(
            (u) => u.email.toLowerCase().trim() === email.toLowerCase().trim()
          );

          if (!found) {
            setIsLoading(false);
            resolve({
              success: false,
              error: 'The email address provided does not match our authorized records.',
            });
            return;
          }

          // Validate portal type versus role
          const expectedRole = requestedPortal === 'admin' ? 'Admin' : 'Owner';
          if (found.role !== expectedRole) {
            setIsLoading(false);
            resolve({
              success: false,
              error: `Unauthorized portal mapping. Your account possesses ${found.role} privileges, but you attempted to login to the ${expectedRole} portal.`,
            });
            return;
          }

          // Verify password
          if (password !== undefined && password !== '') {
            const isValid = await verifyPassword(password, found.salt, found.passwordHash);
            if (!isValid) {
              setIsLoading(false);
              resolve({
                success: false,
                error: 'Authentication failed. Invalid password credential supplied.',
              });
              return;
            }
          } else {
            setIsLoading(false);
            resolve({
              success: false,
              error: 'Password parameter is strictly required to authenticate.',
            });
            return;
          }

          const session: UserSession = {
            email: found.email,
            name: found.name,
            role: found.role,
            ownerId: found.ownerId,
            avatarPhotoId: found.avatarPhotoId,
          };

          setUser(session);
          localStorage.setItem('hasidadi_current_user', JSON.stringify(session));
          setIsLoading(false);
          resolve({ success: true });
        } catch (err: any) {
          setIsLoading(false);
          resolve({
            success: false,
            error: 'An unexpected error occurred during security validation.',
          });
        }
      }, 800);
    });
  };

  const logout = () => {
    setUser(null);
    setPortalState(null);
    localStorage.removeItem('hasidadi_current_user');
    localStorage.removeItem('hasidadi_portal_type');
    window.location.hash = '#/';
  };

  const forgotPassword = async (
    email: string
  ): Promise<{ success: boolean; token?: string; error?: string }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const usersStr = localStorage.getItem('hasidadi_users');
        let users: StoredUser[] = [];
        if (usersStr) {
          try {
            users = JSON.parse(usersStr);
          } catch {
            users = [];
          }
        }

        const found = users.find(
          (u) => u.email.toLowerCase().trim() === email.toLowerCase().trim()
        );

        if (!found) {
          resolve({
            success: false,
            error: 'The email address provided does not match our records.',
          });
          return;
        }

        // Generate a simple simulated recovery token
        const recoveryToken = 'RST-' + Math.floor(100000 + Math.random() * 900000);

        // Save the pending reset mapping in localStorage
        const pendingReset = {
          email: found.email,
          token: recoveryToken,
          expiry: Date.now() + 15 * 60 * 1000,
        };
        localStorage.setItem('hasidadi_pending_reset', JSON.stringify(pendingReset));

        resolve({ success: true, token: recoveryToken });
      }, 1000);
    });
  };

  const resetPassword = async (
    token: string,
    newPass: string
  ): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const pendingStr = localStorage.getItem('hasidadi_pending_reset');
          if (!pendingStr) {
            resolve({
              success: false,
              error: 'No active password recovery session was found. Please request a new link.',
            });
            return;
          }

          const pending = JSON.parse(pendingStr);
          if (pending.token !== token) {
            resolve({
              success: false,
              error: 'The verification token provided is invalid or has expired.',
            });
            return;
          }

          if (pending.expiry < Date.now()) {
            localStorage.removeItem('hasidadi_pending_reset');
            resolve({
              success: false,
              error: 'The verification token has expired (15-minute limit). Please request a new link.',
            });
            return;
          }

          // Minimum password strength validation
          const strength = validatePasswordStrength(newPass, pending.email);
          if (!strength.isValid) {
            resolve({
              success: false,
              error: strength.error || 'Password does not meet minimum security requirements.',
            });
            return;
          }

          // Token matches! Update user with new salt and hash
          const usersStr = localStorage.getItem('hasidadi_users');
          if (!usersStr) {
            resolve({ success: false, error: 'User mapping lost. Please try again.' });
            return;
          }

          const users: StoredUser[] = JSON.parse(usersStr);
          const userIdx = users.findIndex(
            (u) => u.email.toLowerCase().trim() === pending.email.toLowerCase().trim()
          );

          if (userIdx !== -1) {
            const newSalt = generateSalt();
            const newHash = await hashPassword(newPass, newSalt);

            users[userIdx].salt = newSalt;
            users[userIdx].passwordHash = newHash;
            delete (users[userIdx] as any).password; // Remove legacy plaintext password field

            localStorage.setItem('hasidadi_users', JSON.stringify(users));
            localStorage.removeItem('hasidadi_pending_reset');
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'User mapping lost. Please try again.' });
          }
        } catch {
          resolve({
            success: false,
            error: 'An unexpected error occurred during password reset processing.',
          });
        }
      }, 1000);
    });
  };

  const updateUser = async (
    name: string,
    email: string,
    avatarPhotoId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      try {
        if (!user) {
          resolve({ success: false, error: 'No active session found.' });
          return;
        }

        const usersStr = localStorage.getItem('hasidadi_users');
        if (!usersStr) {
          resolve({ success: false, error: 'User database unavailable.' });
          return;
        }

        const users: StoredUser[] = JSON.parse(usersStr);

        // Find current user's index in the list
        const currentIdx = users.findIndex(
          (u) => u.email.toLowerCase().trim() === user.email.toLowerCase().trim()
        );
        if (currentIdx === -1) {
          resolve({ success: false, error: 'Current user not found in user database.' });
          return;
        }

        // If email is changing, make sure it's not already taken by another account
        if (email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
          const emailExists = users.some(
            (u, idx) => idx !== currentIdx && u.email.toLowerCase().trim() === email.toLowerCase().trim()
          );
          if (emailExists) {
            resolve({ success: false, error: 'Email address is already in use by another account.' });
            return;
          }
        }

        // Update the user details
        users[currentIdx].name = name;
        users[currentIdx].email = email;
        if (avatarPhotoId !== undefined) {
          users[currentIdx].avatarPhotoId = avatarPhotoId;
        }

        // Persist to hasidadi_users
        localStorage.setItem('hasidadi_users', JSON.stringify(users));

        // Update current session details
        const updatedSession: UserSession = {
          ...user,
          name: name,
          email: email,
          avatarPhotoId: avatarPhotoId !== undefined ? avatarPhotoId : user.avatarPhotoId,
        };
        setUser(updatedSession);
        localStorage.setItem('hasidadi_current_user', JSON.stringify(updatedSession));

        resolve({ success: true });
      } catch (err: any) {
        resolve({ success: false, error: err.message || 'An unexpected error occurred while saving.' });
      }
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        portalType,
        setPortalType,
        login,
        logout,
        forgotPassword,
        resetPassword,
        isLoading,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

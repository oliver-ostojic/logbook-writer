import { AuthUser } from '../authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  name: string;
  crewId?: string; // Required for CREW self-registration
  inviteCode?: string; // Required for MATE/CAPTAIN registration
  role?: 'CREW' | 'MATE' | 'CAPTAIN' | 'ADMIN';
  storeId?: number;
}

export interface CreateInviteCodeRequest {
  targetRole: 'CAPTAIN' | 'MATE';
  storeId: number;
  expiresInDays?: number;
}

export interface InviteCode {
  id: string;
  code: string;
  targetRole: 'CAPTAIN' | 'MATE';
  store: { id: number; name: string };
  createdBy: { id: string; name: string; role: string };
  usedBy?: { id: string; name: string; role: string } | null;
  usedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired?: boolean;
  isUsed?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthError {
  error: string;
}

/**
 * Login with username and password
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important: include cookies
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Logout failed');
  }
}

/**
 * Register a new user
 * CREW: Self-register with crewId
 * Others: Requires authentication
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  return response.json();
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<AuthResponse | null> {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 401) {
    return null; // Not authenticated
  }

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Failed to get user');
  }

  return response.json();
}

/**
 * Change password for current user
 */
export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  const response = await fetch(`${API_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Failed to change password');
  }
}

/**
 * Create an invite code for CAPTAIN or MATE registration
 * - ADMIN can create codes for CAPTAIN (any store)
 * - CAPTAIN can create codes for MATE (their store only)
 */
export async function createInviteCode(data: CreateInviteCodeRequest): Promise<{ inviteCode: InviteCode }> {
  const response = await fetch(`${API_URL}/auth/invite-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Failed to create invite code');
  }

  return response.json();
}

/**
 * Get list of invite codes (CAPTAIN sees their own, ADMIN sees all)
 */
export async function getInviteCodes(): Promise<{ inviteCodes: InviteCode[] }> {
  const response = await fetch(`${API_URL}/auth/invite-codes`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Failed to get invite codes');
  }

  return response.json();
}

/**
 * Delete an unused invite code
 */
export async function deleteInviteCode(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/invite-codes/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new Error(error.error || 'Failed to delete invite code');
  }
}

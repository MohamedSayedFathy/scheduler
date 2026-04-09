import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { type UserRole } from '@scheduler/types';

/**
 * Server-side auth helpers.
 *
 * Use these in tRPC procedures, server components, and API routes.
 * They wrap Clerk's auth() and add our RBAC + tenant logic.
 */

export type AuthSession = {
  userId: string;
  clerkOrgId: string;
  clerkUserId: string;
  role: UserRole;
};

/**
 * Get the current authenticated session with tenant context.
 * Throws if the user is not authenticated or has no active org.
 */
export async function getAuthSession(): Promise<AuthSession> {
  const session = await auth();

  if (!session.userId) {
    throw new Error('Unauthorized: not signed in');
  }

  if (!session.orgId) {
    throw new Error('Unauthorized: no active organization');
  }

  const role = extractRole(session.orgRole);

  return {
    userId: session.userId,
    clerkOrgId: session.orgId,
    clerkUserId: session.userId,
    role,
  };
}

/**
 * Get the current user's profile from Clerk.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  return currentUser();
}

/**
 * Map Clerk org role strings to our UserRole enum.
 *
 * Clerk org roles are stored as "org:admin", "org:member", etc.
 * We use custom roles: "org:university_admin", "org:lecturer", "org:student".
 * Super admins are identified by a separate system-level role.
 */
function extractRole(clerkOrgRole: string | null | undefined): UserRole {
  switch (clerkOrgRole) {
    case 'org:admin':
    case 'org:university_admin':
      return 'university_admin';
    case 'org:lecturer':
      return 'lecturer';
    case 'org:student':
    case 'org:member':
      return 'student';
    default:
      return 'student';
  }
}

/**
 * Assert that the current user has one of the allowed roles.
 * Throws an error if the role check fails.
 */
export function assertRole(session: AuthSession, allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(session.role)) {
    throw new Error(
      `Forbidden: role '${session.role}' is not authorized. Required: ${allowedRoles.join(', ')}`,
    );
  }
}

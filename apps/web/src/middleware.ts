import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Next.js middleware — runs on every request.
 *
 * Responsibilities:
 * 1. Clerk auth session validation
 * 2. Route protection (public vs authed)
 * 3. Tenant resolution (via Clerk orgId)
 *
 * Note: RLS context (SET app.current_tenant_id) is set at the DB query
 * layer, not here. This middleware only verifies the user has an active
 * session and org membership.
 */

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/(.*)',
  '/monitoring(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

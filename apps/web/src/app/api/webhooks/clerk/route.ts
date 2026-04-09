import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { env } from '@/env';

type ClerkWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

/**
 * Clerk webhook handler.
 *
 * Syncs Clerk organization + user events to our database.
 * Clerk sends webhooks via Svix, so we verify the signature.
 *
 * Events handled:
 * - organization.created   → create tenant record
 * - organization.updated   → update tenant record
 * - organizationMembership.created  → create user record
 * - organizationMembership.updated  → update user role
 * - organizationMembership.deleted  → soft-delete user
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 });
  }

  const body = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // TODO: Handle events — wire to DB operations in Phase M2
  switch (event.type) {
    case 'organization.created':
      // Create tenant record in our DB
      console.info('[Clerk Webhook] organization.created', event.data);
      break;
    case 'organization.updated':
      console.info('[Clerk Webhook] organization.updated', event.data);
      break;
    case 'organizationMembership.created':
      console.info('[Clerk Webhook] organizationMembership.created', event.data);
      break;
    case 'organizationMembership.updated':
      console.info('[Clerk Webhook] organizationMembership.updated', event.data);
      break;
    case 'organizationMembership.deleted':
      console.info('[Clerk Webhook] organizationMembership.deleted', event.data);
      break;
    default:
      console.info(`[Clerk Webhook] Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { EngineSolveResultSchema } from '@scheduler/types';

import { env } from '@/env';
import { db } from '@/lib/db';
import { generatedSchedules, scheduleEntries } from '@/lib/db/schema';

export async function POST(req: Request) {
  const signature =
    req.headers.get('x-engine-signature') ?? req.headers.get('X-Engine-Signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }

  const body = await req.text();

  const expectedSignature = crypto
    .createHmac('sha256', env.ENGINE_HMAC_SECRET)
    .update(body)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const parsed = EngineSolveResultSchema.safeParse(JSON.parse(body));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = parsed.data;

  const dbStatus =
    result.status === 'solved'
      ? ('solved' as const)
      : result.status === 'infeasible'
        ? ('infeasible' as const)
        : ('failed' as const);

  await db
    .update(generatedSchedules)
    .set({
      status: dbStatus,
      solverStats: JSON.stringify(result.stats),
      errorMessage: result.errorMessage ?? null,
      generatedAt: dbStatus === 'solved' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(generatedSchedules.id, result.scheduleId));

  if (dbStatus === 'solved' && result.entries.length > 0) {
    const rows: { scheduleId: string; sessionId: string; roomId: string; timeSlotId: string }[] = [];

    for (const entry of result.entries) {
      const baseSessionId = entry.sessionId.replace(/_w\d+_f\d+$/, '').replace(/_\d+$/, '');

      for (const tsId of entry.timeSlotIds) {
        rows.push({
          scheduleId: result.scheduleId,
          sessionId: baseSessionId,
          roomId: entry.roomId,
          timeSlotId: tsId,
        });
      }
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(scheduleEntries).values(rows.slice(i, i + BATCH_SIZE));
    }

    console.info(
      `[Engine Webhook] Inserted ${rows.length} schedule entries for ${result.scheduleId}`,
    );
  }

  return NextResponse.json({ received: true });
}

import type { Metadata } from 'next';

import { TimeSlotsClient } from '@/components/time-slots/time-slots-client';

export const metadata: Metadata = { title: 'Time Slots' };

export default function TimeSlotsPage() {
  return <TimeSlotsClient />;
}

import type { Metadata } from 'next';

import { RoomsClient } from '@/components/rooms/rooms-client';

export const metadata: Metadata = { title: 'Rooms' };

export default function RoomsPage() {
  return <RoomsClient />;
}

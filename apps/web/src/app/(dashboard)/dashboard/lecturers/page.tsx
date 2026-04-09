import type { Metadata } from 'next';

import { LecturersClient } from '@/components/lecturers/lecturers-client';

export const metadata: Metadata = { title: 'Lecturers' };

export default function LecturersPage() {
  return <LecturersClient />;
}

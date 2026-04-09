import type { Metadata } from 'next';

import { CoursesClient } from '@/components/courses/courses-client';

export const metadata: Metadata = { title: 'Courses' };

export default function CoursesPage() {
  return <CoursesClient />;
}

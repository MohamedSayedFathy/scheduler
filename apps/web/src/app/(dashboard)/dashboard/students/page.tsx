import type { Metadata } from 'next';

import { StudentGroupsClient } from '@/components/student-groups/student-groups-client';

export const metadata: Metadata = { title: 'Student Groups' };

export default function StudentsPage() {
  return <StudentGroupsClient />;
}

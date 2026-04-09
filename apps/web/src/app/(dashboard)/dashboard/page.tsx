import type { Metadata } from 'next';

import { OverviewClient } from '@/components/dashboard/overview-client';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
  return <OverviewClient />;
}

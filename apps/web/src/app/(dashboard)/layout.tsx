import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session.userId) {
    redirect('/sign-in');
  }

  if (!session.orgId) {
    redirect('/create-org');
  }

  return <DashboardShell>{children}</DashboardShell>;
}

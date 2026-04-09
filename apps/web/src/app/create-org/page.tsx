'use client';

import { CreateOrganization } from '@clerk/nextjs';

export default function CreateOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create Your University</h1>
        <p className="text-muted-foreground">
          Create an organization to start managing your schedules.
        </p>
        <div className="flex justify-center">
          <CreateOrganization
            afterCreateOrganizationUrl="/dashboard"
            skipInvitationScreen
          />
        </div>
      </div>
    </div>
  );
}

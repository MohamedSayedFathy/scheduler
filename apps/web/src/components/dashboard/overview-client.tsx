'use client';

import Link from 'next/link';
import {
  BookOpen,
  Building2,
  Calendar,
  Clock,
  Plus,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatsCard } from '@/components/dashboard/stats-card';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/trpc/client';

export function OverviewClient() {
  const { data, isLoading } = api.overview.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your scheduling data" />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Rooms"
          value={data?.roomCount ?? 0}
          icon={Building2}
          description="Total rooms configured"
        />
        <StatsCard
          title="Courses"
          value={data?.courseCount ?? 0}
          icon={BookOpen}
          description="Total courses registered"
        />
        <StatsCard
          title="Student Groups"
          value={data?.studentGroupCount ?? 0}
          icon={Users}
          description="Total student groups"
        />
        <StatsCard
          title="Time Slots"
          value={data?.timeSlotCount ?? 0}
          icon={Clock}
          description="Weekly time slots"
        />
      </div>

      {data?.latestSchedule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Latest Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-medium">{data.latestSchedule.name}</span>
              <StatusBadge status={data.latestSchedule.status} type="schedule" />
            </div>
            <p className="text-sm text-muted-foreground">
              Created{' '}
              {new Date(data.latestSchedule.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/rooms">
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/courses">
              <Plus className="mr-2 h-4 w-4" />
              Add Course
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/schedules">
              <Calendar className="mr-2 h-4 w-4" />
              New Schedule
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

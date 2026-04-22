'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, Eye, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/trpc/client';

type Schedule = {
  id: string;
  name: string | null;
  status: 'pending' | 'solving' | 'solved' | 'infeasible' | 'failed';
  solverStats: string | null;
  errorMessage: string | null;
  createdAt: Date;
  generatedAt: Date | null;
};

function parseSolverStats(raw: string | null): { wallTime?: number; objectiveScore?: number } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { wallTime?: number; objectiveScore?: number };
  } catch {
    return null;
  }
}

function formatSolverTime(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(1)}s`;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return new Date(date).toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export default function SchedulesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const utils = api.useUtils();

  // Poll while any schedule is pending/solving
  const { data: schedules, isLoading } = api.schedules.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some(
        (s: Schedule) => s.status === 'pending' || s.status === 'solving',
      );
      return hasPending ? 5000 : false;
    },
  });

  const generateMutation = api.schedules.generate.useMutation({
    onSuccess: (result) => {
      toast({ title: 'Schedule generation started', description: 'The solver is working on your timetable.' });
      utils.schedules.list.invalidate();
      setGenerateDialogOpen(false);
      setScheduleName('');
      router.push(`/dashboard/schedules/${result.scheduleId}`);
    },
    onError: (error) => {
      toast({
        title: 'Failed to generate schedule',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createEmptyMutation = api.schedules.createEmpty.useMutation({
    onSuccess: (result) => {
      utils.schedules.list.invalidate();
      setGenerateDialogOpen(false);
      setScheduleName('');
      router.push(`/dashboard/schedules/${result.scheduleId}`);
    },
    onError: (error) => {
      toast({
        title: 'Failed to create schedule',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  function handleStartEmpty() {
    createEmptyMutation.mutate({ name: scheduleName.trim() || undefined });
  }

  function handleGenerate() {
    generateMutation.mutate({
      name: scheduleName.trim() || undefined,
    });
  }

  const columns: ColumnDef<Schedule>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name ?? 'Untitled Schedule'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ScheduleStatusBadge status={row.original.status} />
          {row.original.status === 'solving' && (
            <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatRelativeDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'solverTime',
      header: 'Solver Time',
      cell: ({ row }) => {
        const stats = parseSolverStats(row.original.solverStats);
        if (!stats?.wallTime) return <span className="text-muted-foreground">-</span>;
        return <span className="text-sm">{formatSolverTime(stats.wallTime)}</span>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/schedules/${row.original.id}`)}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteTarget(row.original.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Schedules" description="Generate and manage timetable schedules">
        <Button onClick={() => setGenerateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate New Schedule
        </Button>
      </PageHeader>

      {schedules && schedules.length > 0 ? (
        <DataTable
          columns={columns}
          data={schedules}
          searchKey="name"
          searchPlaceholder="Search schedules..."
        />
      ) : (
        <EmptyState
          icon={Calendar}
          title="No schedules yet"
          description="Generate your first timetable! The scheduling engine will find an optimal assignment of sessions to rooms and time slots."
          action={{
            label: 'Generate New Schedule',
            onClick: () => setGenerateDialogOpen(true),
          }}
        />
      )}

      {/* Generate Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate New Schedule</DialogTitle>
            <DialogDescription>
              The scheduling engine will generate an optimal timetable based on your current courses,
              rooms, time slots, and constraints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="schedule-name" className="text-sm font-medium">
                Schedule Name (optional)
              </label>
              <Input
                id="schedule-name"
                placeholder="e.g., Fall 2024 Timetable"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setGenerateDialogOpen(false)}
              disabled={generateMutation.isPending || createEmptyMutation.isPending}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleStartEmpty}
                disabled={generateMutation.isPending || createEmptyMutation.isPending}
              >
                {createEmptyMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Start empty (manual)
              </Button>
              <Button onClick={handleGenerate} disabled={generateMutation.isPending || createEmptyMutation.isPending}>
                {generateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Generate
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Schedule"
        description="Are you sure you want to delete this schedule? This action cannot be undone."
        destructive
        onConfirm={() => {
          // Note: no delete mutation in the router, so we just close for now
          setDeleteTarget(null);
          toast({ title: 'Delete not implemented', description: 'Schedule deletion is not yet available.' });
        }}
      />
    </div>
  );
}

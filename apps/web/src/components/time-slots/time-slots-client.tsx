'use client';

import { useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { BulkCreateForm } from '@/components/time-slots/bulk-create-form';
import { WeeklyGrid } from '@/components/time-slots/weekly-grid';
import { api } from '@/lib/trpc/client';

export function TimeSlotsClient() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: slots, isLoading } = api.timeSlots.list.useQuery();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const bulkCreateMutation = api.timeSlots.bulkCreate.useMutation({
    onSuccess: (created) => {
      utils.timeSlots.list.invalidate();
      setGenerateOpen(false);
      toast({
        title: 'Time slots generated',
        description: `${created.length} slot${created.length === 1 ? '' : 's'} created successfully.`,
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteAllMutation = api.timeSlots.deleteAll.useMutation({
    onSuccess: (deleted) => {
      utils.timeSlots.list.invalidate();
      setClearAllOpen(false);
      toast({
        title: 'All slots cleared',
        description: `${deleted.length} slot${deleted.length === 1 ? '' : 's'} removed.`,
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-5 w-72" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <Skeleton className="h-[480px] w-full rounded-lg" />
      </div>
    );
  }

  const data = slots ?? [];
  const hasSlots = data.length > 0;

  // Count unique dates that have at least one slot
  const uniqueDateCount = new Set(data.map((s) => s.date)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Slots"
        description="Configure the time slots available for scheduling across your academic calendar."
      >
        {hasSlots && (
          <Button
            variant="outline"
            onClick={() => setClearAllOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear all
          </Button>
        )}
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate slots
        </Button>
      </PageHeader>

      {hasSlots && (
        <p className="text-sm text-muted-foreground">
          {data.length} slot{data.length !== 1 ? 's' : ''} configured across{' '}
          {uniqueDateCount} date{uniqueDateCount !== 1 ? 's' : ''}.
        </p>
      )}

      {hasSlots ? (
        <WeeklyGrid slots={data} allSlots={data} />
      ) : (
        <EmptyState
          icon={Clock}
          title="No time slots yet"
          description="Generate a schedule template to define when classes can be scheduled."
          action={{ label: 'Generate slots', onClick: () => setGenerateOpen(true) }}
        />
      )}

      <BulkCreateForm
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onSubmit={(values) => bulkCreateMutation.mutate(values)}
        loading={bulkCreateMutation.isPending}
      />

      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear all time slots"
        description={`This will permanently delete all ${data.length} time slot${data.length !== 1 ? 's' : ''} for your organisation. Existing schedules that reference these slots may be affected. This cannot be undone.`}
        onConfirm={() => deleteAllMutation.mutate()}
        loading={deleteAllMutation.isPending}
        destructive
      />
    </div>
  );
}

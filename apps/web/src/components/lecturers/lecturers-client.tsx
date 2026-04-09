'use client';

import { useMemo, useState } from 'react';
import { GraduationCap, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { type LecturerRow, getColumns } from '@/components/lecturers/columns';
import { LecturerForm } from '@/components/lecturers/lecturer-form';
import { AvailabilityManager } from '@/components/lecturers/availability-manager';
import { api } from '@/lib/trpc/client';

export function LecturersClient() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: lecturers, isLoading } = api.lecturers.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLecturer, setEditingLecturer] = useState<LecturerRow | null>(null);
  const [deletingLecturer, setDeletingLecturer] = useState<LecturerRow | null>(null);
  const [availabilityLecturer, setAvailabilityLecturer] = useState<LecturerRow | null>(null);

  const deleteMutation = api.lecturers.delete.useMutation({
    onSuccess: () => {
      utils.lecturers.list.invalidate();
      setDeletingLecturer(null);
      toast({
        title: 'Lecturer deleted',
        description: 'The lecturer has been removed successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const columns = useMemo(
    () =>
      getColumns({
        onEdit: (lecturer) => setEditingLecturer(lecturer),
        onDelete: (lecturer) => setDeletingLecturer(lecturer),
        onManageAvailability: (lecturer) => setAvailabilityLecturer(lecturer),
      }),
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data: LecturerRow[] = (lecturers ?? []).map((l) => ({
    id: l.id,
    email: l.email,
    firstName: l.firstName,
    lastName: l.lastName,
    role: l.role,
    createdAt: l.createdAt,
  }));

  const availabilityLecturerName = availabilityLecturer
    ? [availabilityLecturer.firstName, availabilityLecturer.lastName].filter(Boolean).join(' ') ||
      availabilityLecturer.email
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lecturers"
        description="Manage lecturers and their teaching availability"
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lecturer
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No lecturers yet"
          description="Add your first lecturer to start assigning them to courses and sessions."
          action={{ label: 'Add Lecturer', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          searchKey="email"
          searchPlaceholder="Search by email..."
        />
      )}

      {/* Create form */}
      <LecturerForm open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit form */}
      <LecturerForm
        open={!!editingLecturer}
        onOpenChange={(open) => {
          if (!open) setEditingLecturer(null);
        }}
        defaultValues={editingLecturer ?? undefined}
      />

      {/* Availability management sheet */}
      <Sheet
        open={!!availabilityLecturer}
        onOpenChange={(open) => {
          if (!open) setAvailabilityLecturer(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Availability — {availabilityLecturerName}</SheetTitle>
            <SheetDescription>
              Lecturers are available by default. Add recurring day or specific date exceptions
              below.
            </SheetDescription>
          </SheetHeader>
          {availabilityLecturer && (
            <AvailabilityManager userId={availabilityLecturer.id} />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingLecturer}
        onOpenChange={(open) => {
          if (!open) setDeletingLecturer(null);
        }}
        title="Delete Lecturer"
        description={`Are you sure you want to delete "${
          [deletingLecturer?.firstName, deletingLecturer?.lastName].filter(Boolean).join(' ') ||
          deletingLecturer?.email
        }"? This action cannot be undone.`}
        onConfirm={() => {
          if (deletingLecturer) {
            deleteMutation.mutate({ id: deletingLecturer.id });
          }
        }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}

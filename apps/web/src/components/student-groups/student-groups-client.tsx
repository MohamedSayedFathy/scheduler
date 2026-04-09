'use client';

import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { type StudentGroupRow, getColumns } from '@/components/student-groups/columns';
import { StudentGroupForm } from '@/components/student-groups/student-group-form';
import { api } from '@/lib/trpc/client';

export function StudentGroupsClient() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: groups, isLoading } = api.studentGroups.list.useQuery();

  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroupRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<StudentGroupRow | null>(null);

  const createMutation = api.studentGroups.create.useMutation({
    onSuccess: () => {
      utils.studentGroups.list.invalidate();
      setFormOpen(false);
      toast({
        title: 'Group created',
        description: 'The student group has been created successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.studentGroups.update.useMutation({
    onSuccess: () => {
      utils.studentGroups.list.invalidate();
      setEditingGroup(null);
      toast({
        title: 'Group updated',
        description: 'The student group has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.studentGroups.delete.useMutation({
    onSuccess: () => {
      utils.studentGroups.list.invalidate();
      setDeletingGroup(null);
      toast({
        title: 'Group deleted',
        description: 'The student group has been deleted successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const columns = useMemo(
    () =>
      getColumns({
        onEdit: (group) => setEditingGroup(group),
        onDelete: (group) => setDeletingGroup(group),
      }),
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data: StudentGroupRow[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    year: g.year,
    size: g.size,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Groups"
        description="Manage student groups and course enrollments"
      >
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No student groups yet"
          description="Create your first student group to start organizing enrollments."
          action={{ label: 'Add Group', onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          searchKey="name"
          searchPlaceholder="Search groups..."
        />
      )}

      <StudentGroupForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        loading={createMutation.isPending}
      />

      <StudentGroupForm
        open={!!editingGroup}
        onOpenChange={(open) => {
          if (!open) setEditingGroup(null);
        }}
        defaultValues={editingGroup ?? undefined}
        onSubmit={(values) => {
          if (editingGroup) {
            updateMutation.mutate({ id: editingGroup.id, data: values });
          }
        }}
        loading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(open) => {
          if (!open) setDeletingGroup(null);
        }}
        title="Delete Student Group"
        description={`Are you sure you want to delete "${deletingGroup?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deletingGroup) {
            deleteMutation.mutate({ id: deletingGroup.id });
          }
        }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Building2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { type RoomRow, getColumns } from '@/components/rooms/columns';
import { RoomForm } from '@/components/rooms/room-form';
import { api } from '@/lib/trpc/client';

export function RoomsClient() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: rooms, isLoading } = api.rooms.list.useQuery();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<RoomRow | null>(null);

  const createMutation = api.rooms.create.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      setFormOpen(false);
      toast({ title: 'Room created', description: 'The room has been created successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.rooms.update.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      setEditingRoom(null);
      toast({ title: 'Room updated', description: 'The room has been updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.rooms.delete.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      setDeletingRoom(null);
      toast({ title: 'Room deleted', description: 'The room has been deleted successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const columns = useMemo(
    () =>
      getColumns({
        onEdit: (room) => setEditingRoom(room),
        onDelete: (room) => setDeletingRoom(room),
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
          <Skeleton className="h-10 w-28" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data: RoomRow[] = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    building: r.building,
    capacity: r.capacity,
    roomType: r.roomType,
    equipment: r.equipment,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms" description="Manage lecture halls, labs, and tutorial rooms">
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No rooms yet"
          description="Create your first room to start building your schedule."
          action={{ label: 'Add Room', onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          searchKey="name"
          searchPlaceholder="Search rooms..."
        />
      )}

      <RoomForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        loading={createMutation.isPending}
      />

      <RoomForm
        open={!!editingRoom}
        onOpenChange={(open) => {
          if (!open) setEditingRoom(null);
        }}
        defaultValues={editingRoom ?? undefined}
        onSubmit={(values) => {
          if (editingRoom) {
            updateMutation.mutate({ id: editingRoom.id, data: values });
          }
        }}
        loading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deletingRoom}
        onOpenChange={(open) => {
          if (!open) setDeletingRoom(null);
        }}
        title="Delete Room"
        description={`Are you sure you want to delete "${deletingRoom?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deletingRoom) {
            deleteMutation.mutate({ id: deletingRoom.id });
          }
        }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}

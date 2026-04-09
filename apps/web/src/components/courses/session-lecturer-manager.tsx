'use client';

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { type SessionLecturer } from '@/components/courses/columns';
import { api } from '@/lib/trpc/client';

interface AvailableLecturer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface SessionLecturerManagerProps {
  sessionId: string;
  assignedLecturers: SessionLecturer[];
  availableLecturers: AvailableLecturer[];
  onMutationSuccess: () => void;
}

function getLecturerLabel(lecturer: AvailableLecturer): string {
  const name = [lecturer.firstName, lecturer.lastName].filter(Boolean).join(' ');
  return name.length > 0 ? name : lecturer.email;
}

export function SessionLecturerManager({
  sessionId,
  assignedLecturers,
  availableLecturers,
  onMutationSuccess,
}: SessionLecturerManagerProps) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const addMutation = api.courses.addSessionLecturer.useMutation({
    onSuccess: () => {
      setSelectedUserId('');
      onMutationSuccess();
      toast({ title: 'Lecturer assigned', description: 'Lecturer has been assigned to the session.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeMutation = api.courses.removeSessionLecturer.useMutation({
    onSuccess: () => {
      onMutationSuccess();
      toast({ title: 'Lecturer removed', description: 'Lecturer has been removed from the session.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const assignedUserIds = new Set(assignedLecturers.map((l) => l.userId));

  const unassignedLecturers = availableLecturers.filter(
    (l) => !assignedUserIds.has(l.id),
  );

  function handleAdd() {
    if (!selectedUserId) return;
    addMutation.mutate({ sessionId, userId: selectedUserId });
  }

  return (
    <div className="mt-2 space-y-2">
      {assignedLecturers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {assignedLecturers.map((assignment) => {
            const lecturer = availableLecturers.find((l) => l.id === assignment.userId);
            const label = lecturer ? getLecturerLabel(lecturer) : assignment.userId;
            const isRemoving =
              removeMutation.isPending &&
              removeMutation.variables?.userId === assignment.userId;

            return (
              <Badge
                key={assignment.id}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                <span>{label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() =>
                    removeMutation.mutate({ sessionId, userId: assignment.userId })
                  }
                  disabled={isRemoving}
                  className="ml-0.5 rounded-sm opacity-60 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                >
                  {isRemoving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No lecturers assigned.</p>
      )}

      {unassignedLecturers.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={selectedUserId}
            onValueChange={setSelectedUserId}
            disabled={addMutation.isPending}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Assign lecturer..." />
            </SelectTrigger>
            <SelectContent>
              {unassignedLecturers.map((lecturer) => (
                <SelectItem key={lecturer.id} value={lecturer.id}>
                  {getLecturerLabel(lecturer)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={handleAdd}
            disabled={!selectedUserId || addMutation.isPending}
            aria-label="Assign selected lecturer"
          >
            {addMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

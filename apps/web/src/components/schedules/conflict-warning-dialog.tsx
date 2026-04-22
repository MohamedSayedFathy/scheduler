'use client';

import { AlertTriangle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { type Conflict, type ConflictKind } from '@/lib/schedules/conflicts';

const kindLabels: Record<ConflictKind, string> = {
  room_double_booking: 'Room double-booking',
  lecturer_double_booking: 'Lecturer double-booking',
  student_group_double_booking: 'Student group double-booking',
  room_capacity: 'Room capacity exceeded',
  room_type_mismatch: 'Room type mismatch',
  lecturer_unavailable: 'Lecturer unavailable',
};

interface ConflictWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: Conflict[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConflictWarningDialog({
  open,
  onOpenChange,
  conflicts,
  onConfirm,
  onCancel,
}: ConflictWarningDialogProps) {
  function handleCancel() {
    onCancel();
    onOpenChange(false);
  }

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Conflicts detected
          </AlertDialogTitle>
          <AlertDialogDescription>
            This move introduces {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}.
            You can proceed anyway or cancel to keep the current arrangement.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-64 overflow-y-auto space-y-2 my-2">
          {conflicts.map((conflict, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
            >
              <Badge variant="destructive" className="shrink-0 mt-0.5 text-xs">
                {kindLabels[conflict.kind]}
              </Badge>
              <p className="text-sm text-foreground">{conflict.message}</p>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Proceed anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

'use client';

import { CalendarCheck, CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type MoveScope = 'this_week' | 'all_weeks';

interface MoveScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: MoveScope) => void;
}

export function MoveScopeDialog({ open, onOpenChange, onSelect }: MoveScopeDialogProps) {
  function handleSelect(scope: MoveScope) {
    onSelect(scope);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply change to</DialogTitle>
          <DialogDescription>
            Choose whether to move this session for the selected week only, or apply the change
            across all 17 weeks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <Button
            variant="outline"
            className="h-24 flex-col gap-2"
            onClick={() => handleSelect('this_week')}
          >
            <CalendarCheck className="h-6 w-6" />
            <span className="text-sm font-medium">This week only</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex-col gap-2"
            onClick={() => handleSelect('all_weeks')}
          >
            <CalendarDays className="h-6 w-6" />
            <span className="text-sm font-medium">All 17 weeks</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { CalendarArrowDown, CalendarArrowUp, CalendarCheck, CalendarDays } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type Scope = 'this' | 'future' | 'past' | 'all';

export interface ScopePreview {
  scope: Scope;
  entryCount: number;
  newConflictCount: number;
}

interface ScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'move' | 'delete' | 'add';
  previews: ScopePreview[];
  onSelect: (scope: Scope) => void;
}

const scopeConfig: Record<Scope, { label: string; Icon: React.ElementType }> = {
  this: { label: 'This week only', Icon: CalendarCheck },
  future: { label: 'This and future', Icon: CalendarArrowUp },
  past: { label: 'This and past', Icon: CalendarArrowDown },
  all: { label: 'All weeks', Icon: CalendarDays },
};


function getRecommendedScope(previews: ScopePreview[]): Scope | null {
  if (previews.length === 0) return null;
  const sorted = [...previews].sort((a, b) => {
    if (a.newConflictCount !== b.newConflictCount) return a.newConflictCount - b.newConflictCount;
    return a.entryCount - b.entryCount;
  });
  const best = sorted[0];
  const second = sorted[1];
  if (!best) return null;
  if (!second) return best.scope;
  if (best.newConflictCount === second.newConflictCount && best.entryCount === second.entryCount) return null;
  return best.scope;
}

export function MoveScopeDialog({ open, onOpenChange, mode, previews, onSelect }: ScopeDialogProps) {
  const recommended = getRecommendedScope(previews);

  function handleSelect(scope: Scope) {
    onSelect(scope);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'move' ? 'Move session' : mode === 'delete' ? 'Delete session' : 'Add to weeks'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {previews.map((preview) => {
            const { label, Icon } = scopeConfig[preview.scope];
            const hasConflicts = preview.newConflictCount > 0;
            const isRecommended = recommended === preview.scope;

            return (
              <Button
                key={preview.scope}
                variant="outline"
                className={`relative h-28 flex-col gap-1.5 items-center justify-center ${mode === 'delete' && hasConflicts ? 'border-destructive/50' : ''}`}
                onClick={() => handleSelect(preview.scope)}
              >
                {isRecommended && (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 right-2 text-[10px] px-1 py-0 h-4"
                  >
                    Recommended
                  </Badge>
                )}
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">{label}</span>
                <span
                  className={`text-xs ${hasConflicts ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {preview.entryCount} {preview.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
                  {preview.newConflictCount === 0
                    ? 'no new conflicts'
                    : `+${preview.newConflictCount} new conflict${preview.newConflictCount === 1 ? '' : 's'}`}
                </span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

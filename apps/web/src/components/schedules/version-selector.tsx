'use client';

import { useState } from 'react';
import { ChevronDown, History, Loader2, Save } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';

interface VersionSelectorProps {
  scheduleId: string;
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function VersionSelector({ scheduleId }: VersionSelectorProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: versions, isLoading } = api.schedules.listVersions.useQuery({ scheduleId });

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [restoreVersionId, setRestoreVersionId] = useState<string | null>(null);
  const [versionName, setVersionName] = useState('');
  const [nameError, setNameError] = useState('');

  const saveVersion = api.schedules.saveVersion.useMutation({
    onSuccess: () => {
      utils.schedules.listVersions.invalidate({ scheduleId });
      setSaveDialogOpen(false);
      setVersionName('');
      toast({ title: 'Version saved', description: 'Current schedule saved as a version.' });
    },
    onError: (error) => {
      toast({ title: 'Failed to save version', description: error.message, variant: 'destructive' });
    },
  });

  const restoreVersion = api.schedules.restoreVersion.useMutation({
    onSuccess: () => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      utils.schedules.listVersions.invalidate({ scheduleId });
      setRestoreVersionId(null);
      toast({ title: 'Version restored', description: 'Schedule restored to the selected version.' });
    },
    onError: (error) => {
      toast({ title: 'Failed to restore version', description: error.message, variant: 'destructive' });
    },
  });

  function handleSaveSubmit() {
    const trimmed = versionName.trim();
    if (!trimmed) {
      setNameError('Version name is required');
      return;
    }
    if (trimmed.length > 255) {
      setNameError('Version name must be at most 255 characters');
      return;
    }
    setNameError('');
    saveVersion.mutate({ scheduleId, name: trimmed });
  }

  function handleRestoreConfirm() {
    if (!restoreVersionId) return;
    restoreVersion.mutate({ versionId: restoreVersionId });
  }

  const restoreTarget = versions?.find((v) => v.id === restoreVersionId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            <History className="mr-2 h-4 w-4" />
            Versions
            {(versions?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {versions?.length}
              </Badge>
            )}
            <ChevronDown className="ml-2 h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {versions && versions.length > 0 ? (
            <>
              {versions.map((version) => (
                <DropdownMenuItem
                  key={version.id}
                  onClick={() => setRestoreVersionId(version.id)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{version.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(version.createdAt)}
                    </p>
                  </div>
                  {version.conflictCount > 0 && (
                    <Badge variant="destructive" className="shrink-0 text-xs px-1.5">
                      {version.conflictCount}
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">No saved versions yet</div>
          )}
          <DropdownMenuItem
            onClick={() => setSaveDialogOpen(true)}
            className="cursor-pointer"
          >
            <Save className="mr-2 h-4 w-4" />
            Save current as version...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save version dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save version</DialogTitle>
            <DialogDescription>
              Give this version a name so you can restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="version-name">Version name</Label>
            <Input
              id="version-name"
              placeholder="e.g. After manual tweaks"
              value={versionName}
              onChange={(e) => {
                setVersionName(e.target.value);
                if (nameError) setNameError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSubmit(); }}
              autoFocus
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaveDialogOpen(false); setVersionName(''); setNameError(''); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubmit} disabled={saveVersion.isPending}>
              {saveVersion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation dialog */}
      <AlertDialog open={!!restoreVersionId} onOpenChange={(open) => { if (!open) setRestoreVersionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version</AlertDialogTitle>
            <AlertDialogDescription>
              Restore &quot;{restoreTarget?.name}&quot;? All current unsaved changes will be overwritten.
              {restoreTarget && restoreTarget.conflictCount > 0 && (
                <span className="block mt-1 text-destructive">
                  This version had {restoreTarget.conflictCount} conflict{restoreTarget.conflictCount !== 1 ? 's' : ''}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

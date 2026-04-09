import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ScheduleStatus = 'pending' | 'solving' | 'solved' | 'infeasible' | 'failed';
type ConstraintSeverity = 'hard' | 'soft';

const scheduleStatusConfig: Record<ScheduleStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-secondary text-secondary-foreground' },
  solving: { label: 'Solving', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  solved: { label: 'Solved', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  infeasible: { label: 'Infeasible', className: 'bg-destructive text-destructive-foreground' },
  failed: { label: 'Failed', className: 'bg-destructive text-destructive-foreground' },
};

const constraintSeverityConfig: Record<ConstraintSeverity, { label: string; className: string }> = {
  hard: { label: 'Hard', className: 'bg-destructive text-destructive-foreground' },
  soft: { label: 'Soft', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
};

interface ScheduleStatusBadgeProps {
  status: ScheduleStatus;
}

export function ScheduleStatusBadge({ status }: ScheduleStatusBadgeProps) {
  const config = scheduleStatusConfig[status];
  return (
    <Badge variant="outline" className={cn('border-transparent', config.className)}>
      {config.label}
    </Badge>
  );
}

interface ConstraintSeverityBadgeProps {
  severity: ConstraintSeverity;
}

export function ConstraintSeverityBadge({ severity }: ConstraintSeverityBadgeProps) {
  const config = constraintSeverityConfig[severity];
  return (
    <Badge variant="outline" className={cn('border-transparent', config.className)}>
      {config.label}
    </Badge>
  );
}

interface StatusBadgeProps {
  status: string;
  type?: 'schedule' | 'constraint';
}

export function StatusBadge({ status, type = 'schedule' }: StatusBadgeProps) {
  if (type === 'constraint') {
    return <ConstraintSeverityBadge severity={status as ConstraintSeverity} />;
  }
  return <ScheduleStatusBadge status={status as ScheduleStatus} />;
}

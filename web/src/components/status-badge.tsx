import { cn } from 'cn';
import { STATUS } from '@/lib/format';
import type { StatusNota } from '@/lib/tipos';

const CLASSES: Record<StatusNota, string> = {
  DRAFT: 'text-status-draft border-status-draft/40',
  READY: 'text-status-ready border-status-ready/40',
  SUBMITTING: 'text-status-processing border-status-processing/40',
  PROCESSING: 'text-status-processing border-status-processing/40',
  AUTHORIZED: 'text-status-authorized border-status-authorized/40',
  REJECTED: 'text-status-rejected border-status-rejected/40',
  CANCELLATION_REQUESTED: 'text-status-processing border-status-processing/40',
  CANCELLED: 'text-status-cancelled border-status-cancelled/40 line-through decoration-1',
  CANCELLATION_ERROR: 'text-status-rejected border-status-rejected/40',
};

export function StatusBadge({ status, className }: { status: StatusNota; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-2 text-xs font-semibold whitespace-nowrap', CLASSES[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS[status].rotulo}
    </span>
  );
}

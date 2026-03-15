import { UserPlus } from '@solar-icons/react';
import { Button, Card } from '@/shared/components/ui';

interface FriendInviteFormProps {
  title: string;
  description: string;
  inputLabel: string;
  placeholder: string;
  submitLabel: string;
  targetUserId: string;
  isSubmitting: boolean;
  onTargetUserIdChange: (value: string) => void;
  onSubmit: () => void;
}

export function FriendInviteForm({
  title,
  description,
  inputLabel,
  placeholder,
  submitLabel,
  targetUserId,
  isSubmitting,
  onTargetUserIdChange,
  onSubmit,
}: FriendInviteFormProps) {
  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">{title}</p>
        <h2 className="text-xl font-semibold text-text-primary">{submitLabel}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          {inputLabel}
        </span>
        <input
          value={targetUserId}
          onChange={(event) => onTargetUserIdChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-2xl border border-border/70 bg-surface/65 px-4 text-sm text-text-primary outline-none transition focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || targetUserId.trim().length === 0}
          className="min-w-44"
        >
          <UserPlus size={18} />
          {submitLabel}
        </Button>
      </div>
    </Card>
  );
}

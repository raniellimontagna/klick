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
    <Card className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</h2>
        <p className="text-sm text-text-secondary">{description}</p>
      </header>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{inputLabel}</span>
        <input
          value={targetUserId}
          onChange={(event) => onTargetUserIdChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-border/70 bg-surface/65 px-3 text-sm text-text-primary outline-none transition focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/35"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <Button onClick={onSubmit} disabled={isSubmitting || targetUserId.trim().length === 0} className="h-11">
        <UserPlus size={18} />
        {submitLabel}
      </Button>
    </Card>
  );
}

import { Button, Card } from '@/shared/components/ui';

interface InviteItem {
  id: string;
  userLabel: string;
  createdAt: string;
}

interface InviteAction {
  label: string;
  onClick: (inviteId: string) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
}

interface FriendInvitesListProps {
  title: string;
  emptyLabel: string;
  invites: InviteItem[];
  actions: InviteAction[];
  isSubmitting: boolean;
}

export function FriendInvitesList({
  title,
  emptyLabel,
  invites,
  actions,
  isSubmitting,
}: FriendInvitesListProps) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h2>
        <span className="surface-base rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
          {invites.length}
        </span>
      </div>

      {invites.length === 0 ? (
        <p className="surface-base rounded-[1.5rem] px-4 py-4 text-sm text-text-secondary">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-3">
          {invites.map((invite) => (
            <li key={invite.id} className="surface-base rounded-[1.5rem] px-4 py-4">
              <p className="text-sm font-semibold text-text-primary">{invite.userLabel}</p>
              <p className="mt-1 text-xs text-text-muted">{invite.createdAt}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Button
                    key={`${invite.id}-${action.label}`}
                    size="sm"
                    variant={action.variant ?? 'secondary'}
                    onClick={() => action.onClick(invite.id)}
                    disabled={isSubmitting}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

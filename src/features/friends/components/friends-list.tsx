import { UserCross } from '@solar-icons/react';
import { Button, Card } from '@/shared/components/ui';

interface FriendItem {
  userId: string;
  userLabel: string;
  since: string;
}

interface FriendsListProps {
  title: string;
  emptyLabel: string;
  removeLabel: string;
  friends: FriendItem[];
  isSubmitting: boolean;
  onRemove: (friendUserId: string) => void;
}

export function FriendsList({
  title,
  emptyLabel,
  removeLabel,
  friends,
  isSubmitting,
  onRemove,
}: FriendsListProps) {
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</h2>

      {friends.length === 0 ? (
        <p className="rounded-xl border border-border/70 bg-surface/65 p-4 text-sm text-text-secondary">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {friends.map((friend) => (
            <li key={friend.userId} className="rounded-xl border border-border/70 bg-surface/65 p-4">
              <p className="text-sm font-semibold text-text-primary">{friend.userLabel}</p>
              <p className="mt-1 text-xs text-text-muted">{friend.since}</p>
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(friend.userId)}
                  disabled={isSubmitting}
                >
                  <UserCross size={14} />
                  {removeLabel}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

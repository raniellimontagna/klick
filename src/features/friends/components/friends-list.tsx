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
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h2>
        <span className="surface-base rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
          {friends.length}
        </span>
      </div>

      {friends.length === 0 ? (
        <p className="surface-base rounded-[1.5rem] px-4 py-4 text-sm text-text-secondary">
          {emptyLabel}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {friends.map((friend) => (
            <li key={friend.userId} className="surface-base rounded-[1.5rem] px-4 py-4">
              <p className="text-sm font-semibold text-text-primary">{friend.userLabel}</p>
              <p className="mt-1 text-xs text-text-muted">{friend.since}</p>
              <div className="mt-4">
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

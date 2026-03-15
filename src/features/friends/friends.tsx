import { User } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/shared';
import { Card } from '@/shared/components/ui';
import { fadeIn } from '@/shared/lib';
import { FriendInviteForm, FriendInvitesList, FriendsList } from './components';
import { useFriends } from './hooks/use-friends';

export function Friends() {
  const {
    t,
    user,
    isConfigured,
    isAuthenticated,
    canManageFriends,
    targetUserId,
    setTargetUserId,
    feedback,
    isLoading,
    isSubmitting,
    incomingInvites,
    outgoingInvites,
    friendsWithCounterpart,
    resolveUserLabel,
    formatDateTime,
    handleSendInvite,
    handleAcceptInvite,
    handleRejectInvite,
    handleCancelInvite,
    handleRemoveFriend,
  } = useFriends();

  const incomingInviteItems = incomingInvites.map((invite) => ({
    id: invite.id,
    userLabel: resolveUserLabel(invite.senderId),
    createdAt: `${t.socialHub.friends.labels.invitedAt}: ${formatDateTime(invite.createdAt)}`,
  }));

  const outgoingInviteItems = outgoingInvites.map((invite) => ({
    id: invite.id,
    userLabel: resolveUserLabel(invite.receiverId),
    createdAt: `${t.socialHub.friends.labels.invitedAt}: ${formatDateTime(invite.createdAt)}`,
  }));

  const friendItems = friendsWithCounterpart.map(({ friendship, counterpartId }) => ({
    userId: counterpartId,
    userLabel: resolveUserLabel(counterpartId),
    since: `${t.socialHub.friends.labels.friendsSince}: ${formatDateTime(friendship.createdAt)}`,
  }));

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={t.navigation.friends}
        description={t.pages.friends.description}
        icon={<User size={32} />}
      />

      {feedback && (
        <output
          className={`block rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
          aria-live="polite"
        >
          {feedback.text}
        </output>
      )}

      {!isConfigured && (
        <Card className="space-y-2 text-sm text-warning">
          <p className="font-semibold">{t.socialHub.friends.notConfiguredTitle}</p>
          <p className="text-text-secondary">{t.socialHub.friends.notConfiguredDescription}</p>
        </Card>
      )}

      {isConfigured && !isAuthenticated && (
        <Card className="space-y-2 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">{t.socialHub.friends.loginRequiredTitle}</p>
          <p>{t.socialHub.friends.loginRequiredDescription}</p>
        </Card>
      )}

      {canManageFriends && user && (
        <div className="space-y-4">
          <FriendInviteForm
            title={t.socialHub.friends.invite.title}
            description={t.socialHub.friends.invite.description}
            inputLabel={t.socialHub.friends.invite.inputLabel}
            placeholder={t.socialHub.friends.invite.placeholder}
            submitLabel={t.socialHub.friends.actions.sendInvite}
            targetUserId={targetUserId}
            isSubmitting={isSubmitting}
            onTargetUserIdChange={setTargetUserId}
            onSubmit={() => void handleSendInvite()}
          />

          {isLoading && (
            <Card className="text-sm text-text-secondary">{t.socialHub.friends.labels.loading}</Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <FriendInvitesList
              title={t.socialHub.friends.incoming.title}
              emptyLabel={t.socialHub.friends.incoming.empty}
              invites={incomingInviteItems}
              isSubmitting={isSubmitting}
              actions={[
                {
                  label: t.socialHub.friends.actions.accept,
                  variant: 'success',
                  onClick: (inviteId) => void handleAcceptInvite(inviteId),
                },
                {
                  label: t.socialHub.friends.actions.reject,
                  variant: 'ghost',
                  onClick: (inviteId) => void handleRejectInvite(inviteId),
                },
              ]}
            />

            <FriendInvitesList
              title={t.socialHub.friends.outgoing.title}
              emptyLabel={t.socialHub.friends.outgoing.empty}
              invites={outgoingInviteItems}
              isSubmitting={isSubmitting}
              actions={[
                {
                  label: t.socialHub.friends.actions.cancel,
                  variant: 'ghost',
                  onClick: (inviteId) => void handleCancelInvite(inviteId),
                },
              ]}
            />
          </div>

          <FriendsList
            title={t.socialHub.friends.list.title}
            emptyLabel={t.socialHub.friends.list.empty}
            removeLabel={t.socialHub.friends.actions.removeFriend}
            friends={friendItems}
            isSubmitting={isSubmitting}
            onRemove={(friendUserId) => void handleRemoveFriend(friendUserId)}
          />
        </div>
      )}
    </motion.div>
  );
}

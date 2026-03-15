import { User } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/shared';
import { Card } from '@/shared/components/ui';
import { fadeIn } from '@/shared/lib';
import { FriendInviteForm, FriendInvitesList, FriendsList } from './components';
import { useFriends } from './hooks/use-friends';

function SocialSummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="text-2xl font-black tracking-tight text-text-primary">{value}</p>
      <p className="text-sm leading-relaxed text-text-secondary">{helper}</p>
    </Card>
  );
}

function SettingsShortcut({ label }: { label: string }) {
  return (
    <Link
      to="/settings"
      className="surface-interactive inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-text-primary"
    >
      {label}
    </Link>
  );
}

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
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="app-shell-page space-y-6"
    >
      <PageHeader
        title={t.navigation.friends}
        description={t.pages.friends.description}
        icon={<User size={32} />}
      />

      {feedback ? (
        <output
          className={`block rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'feedback-success text-success'
              : 'feedback-danger text-danger'
          }`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
        >
          {feedback.text}
        </output>
      ) : null}

      {!isConfigured ? (
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              {t.navigation.friends}
            </p>
            <h2 className="text-xl font-semibold text-text-primary">
              {t.socialHub.friends.notConfiguredTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {t.socialHub.friends.notConfiguredDescription}
            </p>
          </div>
          <SettingsShortcut label={t.navigation.settings} />
        </Card>
      ) : null}

      {isConfigured && !isAuthenticated ? (
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              {t.navigation.friends}
            </p>
            <h2 className="text-xl font-semibold text-text-primary">
              {t.socialHub.friends.loginRequiredTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {t.socialHub.friends.loginRequiredDescription}
            </p>
          </div>
          <SettingsShortcut label={t.navigation.settings} />
        </Card>
      ) : null}

      {canManageFriends && user ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SocialSummaryCard
              label={t.socialHub.friends.incoming.title}
              value={String(incomingInvites.length)}
              helper={t.socialHub.friends.incoming.empty}
            />
            <SocialSummaryCard
              label={t.socialHub.friends.outgoing.title}
              value={String(outgoingInvites.length)}
              helper={t.socialHub.friends.outgoing.empty}
            />
            <SocialSummaryCard
              label={t.socialHub.friends.list.title}
              value={String(friendItems.length)}
              helper={t.socialHub.friends.list.empty}
            />
            <SocialSummaryCard
              label={t.settings.cloudSync.connectedAs}
              value={user.displayName ?? user.email ?? user.id}
              helper={user.email ?? user.id}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
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

            <div className="surface-base rounded-[1.5rem] px-5 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                {t.socialHub.friends.labels.loading}
              </p>
              <p className="mt-2 text-base font-semibold text-text-primary">
                {t.socialHub.friends.actions.sendInvite}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {isLoading ? t.socialHub.friends.labels.loading : t.pages.friends.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
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
      ) : null}
    </motion.div>
  );
}

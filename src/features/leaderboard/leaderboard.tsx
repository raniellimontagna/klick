import { ChartSquare } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/shared';
import { Button, Card } from '@/shared/components/ui';
import { fadeIn, formatTime } from '@/shared/lib';
import { LeaderboardPeriodSwitch, LeaderboardTable } from './components';
import { useLeaderboard } from './hooks/use-leaderboard';

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
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

export function Leaderboard() {
  const {
    t,
    user,
    isConfigured,
    isAuthenticated,
    canLoadLeaderboard,
    period,
    setPeriod,
    periodKey,
    entries,
    currentUserEntry,
    feedback,
    isLoading,
    isSyncing,
    resolveUserLabel,
    formatPeriodKey,
    refreshLeaderboard,
  } = useLeaderboard();

  const rows = entries.map((entry, index) => ({
    id: entry.id,
    rank: index + 1,
    userLabel: resolveUserLabel(entry),
    isCurrentUser: Boolean(user && entry.userId === user.id),
    bestSingleMs: entry.bestSingleMs,
    bestAo5Ms: entry.bestAo5Ms,
    bestAo12Ms: entry.bestAo12Ms,
    consistencyScore: entry.consistencyScore,
    solveCount: entry.solveCount,
  }));

  const currentUserRank = rows.find((row) => row.isCurrentUser)?.rank ?? null;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="app-shell-page space-y-6"
    >
      <PageHeader
        title={t.navigation.leaderboard}
        description={t.pages.leaderboard.description}
        icon={<ChartSquare size={32} />}
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
              {t.navigation.leaderboard}
            </p>
            <h2 className="text-xl font-semibold text-text-primary">
              {t.socialHub.leaderboard.notConfiguredTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {t.socialHub.leaderboard.notConfiguredDescription}
            </p>
          </div>
          <SettingsShortcut label={t.navigation.settings} />
        </Card>
      ) : null}

      {isConfigured && !isAuthenticated ? (
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              {t.navigation.leaderboard}
            </p>
            <h2 className="text-xl font-semibold text-text-primary">
              {t.socialHub.leaderboard.loginRequiredTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {t.socialHub.leaderboard.loginRequiredDescription}
            </p>
          </div>
          <SettingsShortcut label={t.navigation.settings} />
        </Card>
      ) : null}

      {canLoadLeaderboard ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label={t.socialHub.leaderboard.period.title}
              value={formatPeriodKey(periodKey)}
              helper={t.socialHub.leaderboard.labels.periodKey}
            />
            <SummaryCard
              label={t.socialHub.leaderboard.table.title}
              value={String(rows.length)}
              helper={t.socialHub.leaderboard.labels.visibilityNote}
            />
            <SummaryCard
              label={t.socialHub.leaderboard.table.columns.rank}
              value={currentUserRank ? `#${currentUserRank}` : '--'}
              helper={t.socialHub.leaderboard.labels.you}
            />
            <SummaryCard
              label={t.socialHub.leaderboard.labels.solveCount}
              value={String(currentUserEntry?.solveCount ?? 0)}
              helper={t.socialHub.leaderboard.labels.yourSnapshot}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <LeaderboardPeriodSwitch
              title={t.socialHub.leaderboard.period.title}
              subtitle={`${t.socialHub.leaderboard.labels.periodKey}: ${formatPeriodKey(periodKey)}`}
              period={period}
              weeklyLabel={t.socialHub.leaderboard.period.weekly}
              monthlyLabel={t.socialHub.leaderboard.period.monthly}
              isLoading={isLoading}
              onPeriodChange={(nextPeriod) => setPeriod(nextPeriod)}
            />

            <Card className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                    {t.socialHub.leaderboard.labels.yourSnapshot}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text-primary">
                    {currentUserEntry
                      ? resolveUserLabel(currentUserEntry)
                      : t.socialHub.leaderboard.table.empty}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {t.socialHub.leaderboard.labels.visibilityNote}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => void refreshLeaderboard()}
                  disabled={isLoading}
                >
                  {isSyncing
                    ? t.socialHub.leaderboard.actions.syncing
                    : t.socialHub.leaderboard.actions.refresh}
                </Button>
              </div>

              {isLoading ? (
                <p className="surface-base rounded-[1.5rem] px-4 py-4 text-sm text-text-secondary">
                  {t.socialHub.leaderboard.labels.loading}
                </p>
              ) : currentUserEntry ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.socialHub.leaderboard.table.columns.rank}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-text-primary">
                      {currentUserRank ? `#${currentUserRank}` : '--'}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.socialHub.leaderboard.table.columns.single}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-text-primary">
                      {currentUserEntry.bestSingleMs === null
                        ? '--'
                        : formatTime(currentUserEntry.bestSingleMs)}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.socialHub.leaderboard.labels.solveCount}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-text-primary">
                      {currentUserEntry.solveCount}
                    </p>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>

          <LeaderboardTable
            title={t.socialHub.leaderboard.table.title}
            emptyLabel={t.socialHub.leaderboard.table.empty}
            rankLabel={t.socialHub.leaderboard.table.columns.rank}
            userLabel={t.socialHub.leaderboard.table.columns.user}
            singleLabel={t.socialHub.leaderboard.table.columns.single}
            ao5Label={t.socialHub.leaderboard.table.columns.ao5}
            ao12Label={t.socialHub.leaderboard.table.columns.ao12}
            consistencyLabel={t.socialHub.leaderboard.table.columns.consistency}
            solvesLabel={t.socialHub.leaderboard.table.columns.solves}
            rows={rows}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

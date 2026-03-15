import { ChartSquare } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/shared';
import { Button, Card } from '@/shared/components/ui';
import { fadeIn } from '@/shared/lib';
import { LeaderboardPeriodSwitch, LeaderboardTable } from './components';
import { useLeaderboard } from './hooks/use-leaderboard';

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

  const rows = entries.map((entry) => ({
    id: entry.id,
    userLabel: resolveUserLabel(entry),
    isCurrentUser: Boolean(user && entry.userId === user.id),
    bestSingleMs: entry.bestSingleMs,
    bestAo5Ms: entry.bestAo5Ms,
    bestAo12Ms: entry.bestAo12Ms,
    consistencyScore: entry.consistencyScore,
    solveCount: entry.solveCount,
  }));

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={t.navigation.leaderboard}
        description={t.pages.leaderboard.description}
        icon={<ChartSquare size={32} />}
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
          <p className="font-semibold">{t.socialHub.leaderboard.notConfiguredTitle}</p>
          <p className="text-text-secondary">{t.socialHub.leaderboard.notConfiguredDescription}</p>
        </Card>
      )}

      {isConfigured && !isAuthenticated && (
        <Card className="space-y-2 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">{t.socialHub.leaderboard.loginRequiredTitle}</p>
          <p>{t.socialHub.leaderboard.loginRequiredDescription}</p>
        </Card>
      )}

      {canLoadLeaderboard && (
        <div className="space-y-4">
          <LeaderboardPeriodSwitch
            title={t.socialHub.leaderboard.period.title}
            subtitle={`${t.socialHub.leaderboard.labels.periodKey}: ${formatPeriodKey(periodKey)}`}
            period={period}
            weeklyLabel={t.socialHub.leaderboard.period.weekly}
            monthlyLabel={t.socialHub.leaderboard.period.monthly}
            isLoading={isLoading}
            onPeriodChange={(nextPeriod) => setPeriod(nextPeriod)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void refreshLeaderboard()} disabled={isLoading}>
              {isSyncing ? t.socialHub.leaderboard.actions.syncing : t.socialHub.leaderboard.actions.refresh}
            </Button>
            <p className="text-xs text-text-muted">{t.socialHub.leaderboard.labels.visibilityNote}</p>
          </div>

          {currentUserEntry && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
                {t.socialHub.leaderboard.labels.yourSnapshot}
              </h2>
              <p className="text-sm text-text-secondary">
                {t.socialHub.leaderboard.labels.solveCount}: {currentUserEntry.solveCount}
              </p>
            </Card>
          )}

          {isLoading && (
            <Card className="text-sm text-text-secondary">{t.socialHub.leaderboard.labels.loading}</Card>
          )}

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
      )}
    </motion.div>
  );
}

import { Bolt, ClockCircle, Stopwatch, Target } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Penalty, TimerState } from '@/shared/types';

interface HomeTimerPanelProps {
  state: TimerState;
  timeMs: number;
  inspectionTimeLeft: number;
  inspectionDuration: number;
  isNewBest: boolean;
  lastPenalty: Penalty;
}

function getStatusLabel(
  state: TimerState,
  isNewBest: boolean,
  penalty: Penalty,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
) {
  if (state === 'inspection') {
    return strings.homeRevamp.timer.inspectionLabel;
  }

  if (state === 'running') {
    return strings.homeRevamp.timer.runningLabel;
  }

  if (state === 'stopped' && isNewBest) {
    return strings.homeRevamp.timer.personalBest;
  }

  if (state === 'stopped' && penalty === '+2') {
    return strings.homeRevamp.timer.plusTwoApplied;
  }

  if (state === 'stopped' && penalty === 'DNF') {
    return strings.homeRevamp.timer.dnfApplied;
  }

  return strings.timer.ready;
}

export function HomeTimerPanel({
  state,
  timeMs,
  inspectionTimeLeft,
  inspectionDuration,
  isNewBest,
  lastPenalty,
}: HomeTimerPanelProps) {
  const { t } = useI18nStore();
  const isInspection = state === 'inspection';

  const progressPercent = Math.max(
    0,
    Math.min(100, (inspectionTimeLeft / Math.max(inspectionDuration, 1)) * 100),
  );

  const statusLabel = getStatusLabel(state, isNewBest, lastPenalty, t);

  const timerToneClass =
    state === 'running'
      ? 'text-accent'
      : state === 'inspection'
        ? 'text-warning'
        : state === 'stopped' && lastPenalty === 'DNF'
          ? 'text-danger'
          : 'text-text-primary';

  return (
    <section
      data-onboarding="timer"
      className="surface-panel relative overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-primary)_26%,transparent)_0%,color-mix(in_srgb,var(--color-surface)_88%,transparent)_52%,color-mix(in_srgb,var(--color-background)_95%,transparent)_100%)] p-5 sm:p-8"
      aria-label={t.homeRevamp.timer.sectionLabel}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(57,255,136,0.08),transparent_30%,transparent_70%,rgba(124,77,255,0.2))]" />

      <div className="relative z-10 flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
            <Stopwatch size={16} />
            {statusLabel}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
              {t.homeRevamp.timer.modeLabel}
            </p>
            <p className="text-sm font-semibold text-text-secondary">{t.homeRevamp.timer.spaceHint}</p>
          </div>
        </div>

        <div className="space-y-5">
          <motion.div
            key={`${state}-${Math.floor(timeMs / 100)}`}
            animate={{ scale: state === 'running' ? 1.03 : 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className={`font-mono text-center text-6xl font-black tracking-tight tabular-nums sm:text-7xl lg:text-8xl ${timerToneClass}`}
            role="timer"
            aria-valuenow={timeMs}
          >
            {formatTime(timeMs)}
          </motion.div>

          {isInspection && (
            <div className="space-y-3 rounded-2xl border border-warning/35 bg-warning/15 p-4">
              <div className="flex items-center justify-between text-warning">
                <div className="inline-flex items-center gap-2 text-sm font-semibold">
                  <ClockCircle size={18} />
                  {t.homeRevamp.timer.inspectionCountdown}
                </div>
                <span className="font-mono text-xl font-black tabular-nums">
                  {Math.ceil(inspectionTimeLeft)}s
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-warning/25">
                <div
                  className="h-full rounded-full bg-warning transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/75 bg-surface/65 p-4">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-text-muted">
              {t.homeRevamp.timer.finishLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Target size={16} />
              {t.homeRevamp.timer.finishHint}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/12 p-4">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-accent">
              {t.homeRevamp.timer.feedbackLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
              <Bolt size={16} />
              {isNewBest ? t.homeRevamp.timer.personalBest : t.homeRevamp.timer.feedbackHint}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

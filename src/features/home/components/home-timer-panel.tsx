import type { ReactNode } from 'react';
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
  actions: ReactNode;
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
  actions,
}: HomeTimerPanelProps) {
  const { t } = useI18nStore();
  const isInspection = state === 'inspection';

  const progressPercent = Math.max(
    0,
    Math.min(100, (inspectionTimeLeft / Math.max(inspectionDuration, 1)) * 100),
  );

  const statusLabel = getStatusLabel(state, isNewBest, lastPenalty, t);
  const stateHint =
    state === 'running' ? t.homeRevamp.timer.finishHint : t.homeRevamp.timer.spaceHint;

  const timerToneClass =
    state === 'running'
      ? 'text-accent'
      : state === 'inspection'
        ? 'text-warning'
        : state === 'stopped' && lastPenalty === 'DNF'
          ? 'text-danger'
          : 'text-text-primary';

  const statusClass =
    state === 'running'
      ? 'border-accent/35 bg-accent/14 text-accent'
      : state === 'inspection'
        ? 'border-warning/35 bg-warning/14 text-warning'
        : state === 'stopped' && lastPenalty === 'DNF'
          ? 'border-danger/35 bg-danger/14 text-danger'
          : 'border-border/80 bg-surface/75 text-text-secondary';

  return (
    <section
      data-onboarding="timer"
      className="surface-panel relative overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-primary)_18%,transparent)_0%,transparent_52%),linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_94%,var(--color-background-elevated)_6%),color-mix(in_srgb,var(--color-background-elevated)_96%,transparent))] p-4 sm:p-6"
      aria-label={t.homeRevamp.timer.sectionLabel}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(122,111,240,0.12),transparent_34%,transparent_68%,rgba(61,207,142,0.08))]" />

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
              <Stopwatch size={14} />
              {t.homeRevamp.badge}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary sm:text-sm">{stateHint}</p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass}`}
          >
            <Stopwatch size={16} />
            {statusLabel}
          </div>
        </div>

        <div className="space-y-3">
          <motion.div
            animate={{ scale: state === 'running' ? 1.03 : 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className={`font-mono text-center text-[clamp(3.8rem,17vw,6.4rem)] font-black tracking-[-0.06em] tabular-nums ${timerToneClass}`}
            role="timer"
            aria-valuenow={timeMs}
          >
            {formatTime(timeMs)}
          </motion.div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-text-muted">
            <span className="rounded-full border border-border/80 bg-surface/70 px-3 py-1 font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {t.homeRevamp.timer.modeLabel}
            </span>
            <kbd className="rounded-xl border border-border/75 bg-surface/78 px-2.5 py-1 font-mono font-semibold text-text-primary">
              Space
            </kbd>
          </div>

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

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/75 bg-surface/62 p-3">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-text-muted">
              {t.homeRevamp.timer.finishLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Target size={16} />
              {t.homeRevamp.timer.finishHint}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/12 p-3">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-accent">
              {t.homeRevamp.timer.feedbackLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
              <Bolt size={16} />
              {isNewBest ? t.homeRevamp.timer.personalBest : t.homeRevamp.timer.feedbackHint}
            </p>
          </div>
        </div>

        <div>{actions}</div>
      </div>
    </section>
  );
}

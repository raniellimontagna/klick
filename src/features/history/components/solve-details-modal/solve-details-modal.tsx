import {
  AddCircle,
  CalendarMinimalistic,
  ClockCircle,
  CloseCircle,
  Copy,
  DangerTriangle,
} from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { solveCubeState } from '@/features/home/lib/scramble/cube-solver';
import { CubeVisualizer } from '@/shared/components/cube-visualizer';
import { Button, Modal } from '@/shared/components/ui';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSolveDetailsModal } from './use-solve-details-modal';

interface SolveDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  solveId: string | null;
  solveNumber: number;
}

export const SolveDetailsModal: React.FC<SolveDetailsModalProps> = ({
  isOpen,
  onClose,
  solveId,
  solveNumber,
}: SolveDetailsModalProps): React.ReactElement | null => {
  const { t } = useI18nStore();
  const { getActiveSession } = useSessionsStore();

  const session = getActiveSession();
  const solve = session?.solves.find((currentSolve) => currentSolve.id === solveId) ?? null;

  const { copied, copyScramble, formatFullDate, isMobile, penaltyInfo, togglePenalty } =
    useSolveDetailsModal(solve);

  const cubeState = useMemo(() => {
    if (!solve?.scramble) return null;
    try {
      return solveCubeState(solve.scramble);
    } catch (e) {
      console.error('Failed to solve cube state', e);
      return null;
    }
  }, [solve?.scramble]);

  if (!solve) return null;

  const dialogContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border/80 md:hidden" aria-hidden="true" />

        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              {t.solveTable.details.solveNumber} #{solveNumber}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-text-primary sm:text-2xl">
              {t.solveTable.details.title}
            </h2>
            <span className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <CalendarMinimalistic size={14} aria-hidden="true" />
              {formatFullDate(solve.createdAt)}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="surface-interactive flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-text-secondary hover:text-text-primary"
            aria-label={t.actions.close || 'Fechar'}
          >
            <CloseCircle size={20} />
          </button>
        </header>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(18rem,0.78fr)]">
          <section className="space-y-4" aria-label="Visualização e scramble">
            <div className="surface-base flex min-h-[15rem] flex-col items-center justify-center rounded-[1.75rem] p-4 sm:p-5">
              {cubeState ? (
                <CubeVisualizer
                  config={{
                    faces: [
                      { label: 'U', colors: cubeState.U },
                      { label: 'F', colors: cubeState.F },
                      { label: 'R', colors: cubeState.R },
                      { label: 'D', colors: cubeState.D },
                      { label: 'L', colors: cubeState.L },
                      { label: 'B', colors: cubeState.B },
                    ],
                  }}
                  className="border-none bg-transparent p-0"
                />
              ) : (
                <span className="text-sm text-text-muted">
                  {t.solveTable.details.visualizationUnavailable}
                </span>
              )}
            </div>

            <div className="surface-base rounded-[1.5rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {t.solveTable.details.scramble}
                </p>
                <button
                  type="button"
                  onClick={copyScramble}
                  className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-surface/72 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-hover/70 hover:text-text-primary"
                >
                  <Copy size={12} />
                  {copied ? t.scramble.copySuccess : t.scramble.copy}
                </button>
              </div>

              <p className="mt-3 break-words font-mono text-sm leading-relaxed text-text-primary sm:text-base">
                {solve.scramble}
              </p>
            </div>
          </section>

          <section className="space-y-4" aria-label="Tempo e penalidades">
            <div className="surface-panel rounded-[1.75rem] p-5 text-center sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {t.solveTable.details.finalTime}
              </p>

              <div className="mt-4 flex items-center justify-center gap-2">
                <p
                  className={`font-mono text-[3rem] font-black tracking-[-0.07em] sm:text-[4rem] ${
                    solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                  }`}
                >
                  {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                </p>
                {solve.penalty === '+2' ? (
                  <span className="rounded-full border border-warning/30 bg-warning/12 px-2 py-1 text-xs font-bold text-warning">
                    +2
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button
                  onClick={() => togglePenalty('+2')}
                  variant={solve.penalty === '+2' ? 'warning' : 'secondary'}
                  className="justify-center font-semibold"
                >
                  <AddCircle size={16} />
                  +2
                </Button>
                <Button
                  onClick={() => togglePenalty('DNF')}
                  variant={solve.penalty === 'DNF' ? 'danger' : 'secondary'}
                  className="justify-center font-semibold"
                >
                  <DangerTriangle size={16} />
                  DNF
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="surface-base rounded-[1.35rem] p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <ClockCircle size={16} aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {t.solveTable.details.baseTime}
                  </span>
                </div>
                <p className="mt-3 font-mono text-xl font-black tracking-[-0.04em] text-text-primary">
                  {formatTime(solve.timeMs)}
                </p>
              </div>

              <output
                className={`surface-base block rounded-[1.35rem] border p-4 ${penaltyInfo.bgColor} ${penaltyInfo.borderColor}`}
              >
                <div className="flex items-center gap-2 text-text-muted">
                  <DangerTriangle size={16} aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {t.solveTable.details.penalty}
                  </span>
                </div>
                <p className={`mt-3 text-xl font-black tracking-tight ${penaltyInfo.color}`}>
                  {penaltyInfo.label}
                </p>
              </output>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    if (typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <AnimatePresence>
        {isOpen ? (
          <div
            className="fixed inset-0 z-1200 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={`${t.solveTable.details.title} #${solveNumber}`}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/62 backdrop-blur-[2px]"
            />

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-0 bottom-0 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
            >
              <div className="surface-overlay max-h-[86vh] overflow-hidden rounded-[2rem]">
                {dialogContent}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>,
      document.body,
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      ariaLabel={`${t.solveTable.details.title} #${solveNumber}`}
      containerClassName="max-w-4xl p-4 xl:p-6"
      className="max-h-[86vh]"
    >
      {dialogContent}
    </Modal>
  );
};

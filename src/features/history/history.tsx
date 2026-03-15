import { History as HistoryIcon } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { PageHeader } from '@/shared';
import { fadeIn } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { Solve } from '@/shared/types';
import { HistoryCharts } from './components/history-charts/history-charts';
import { SolveDetailsModal } from './components/solve-details-modal/solve-details-modal';
import { SolveTable } from './components/solve-table/solve-table';
import { SummaryCards } from './components/summary-cards/summary-cards';

export function History() {
  const { t } = useI18nStore();
  const { getActiveSession } = useSessionsStore();
  const [selectedSolve, setSelectedSolve] = useState<Solve | null>(null);
  const [selectedSolveNumber, setSelectedSolveNumber] = useState(0);

  const session = getActiveSession();
  const solves = session?.solves || [];

  const handleViewDetails = (solve: Solve) => {
    if (!session) return;

    const solveIndex = session.solves.findIndex((s) => s.id === solve.id);
    if (solveIndex === -1) return;

    const solveNumber = session.solves.length - solveIndex;
    setSelectedSolveNumber(solveNumber);
    setSelectedSolve(solve);
  };

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="app-shell-page app-shell-page-wide space-y-5"
    >
      <PageHeader
        title={t.navigation.history}
        description={t.pages.history.description}
        icon={<HistoryIcon size={32} />}
      />

      <div className="space-y-5">
        <section className="space-y-5">
          <SummaryCards solves={solves} />

          <section className="surface-panel rounded-3xl p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {t.history.sessionProgress}
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                  {t.history.chartTitle}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">{t.history.chartDescription}</p>
              </div>
            </div>

            <div className="mt-5">
              <HistoryCharts solves={solves} />
            </div>
          </section>
        </section>

        <SolveTable onViewDetails={handleViewDetails} />
      </div>

      <SolveDetailsModal
        isOpen={selectedSolve !== null}
        onClose={() => setSelectedSolve(null)}
        solveId={selectedSolve?.id || null}
        solveNumber={selectedSolveNumber}
      />
    </motion.div>
  );
}

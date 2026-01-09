import { motion } from 'framer-motion';
import { History as HistoryIcon } from 'lucide-react';
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
      className="mx-auto w-full max-w-6xl space-y-8"
    >
      <PageHeader
        title={t.navigation.history}
        description={t.pages.history.description}
        icon={<HistoryIcon className="w-8 h-8" />}
      />

      <div className="space-y-8">
        <section>
          <SummaryCards solves={solves} />
        </section>

        <section className="glass p-6 rounded-xl border border-white/5">
          <h3 className="text-lg font-bold text-text-primary mb-4">{t.history.sessionProgress}</h3>
          <HistoryCharts solves={solves} />
        </section>

        <section>
          <SolveTable onViewDetails={handleViewDetails} />
        </section>
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

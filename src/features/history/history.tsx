import { motion } from 'framer-motion';
import { useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { PageHeader } from '@/shared';
import { SolveTable } from './components/solve-table/solve-table';
import { SolveDetailsModal } from './components/solve-details-modal/solve-details-modal';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { fadeIn } from '@/shared/lib';
import type { Solve } from '@/commons/types';

export function History() {
  const { t } = useI18nStore();
  const { getActiveSession } = useSessionsStore();
  const [selectedSolve, setSelectedSolve] = useState<Solve | null>(null);
  const [selectedSolveNumber, setSelectedSolveNumber] = useState(0);

  const handleViewDetails = (solve: Solve) => {
    const session = getActiveSession();
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
      className="mx-auto w-full max-w-6xl"
    >
      <PageHeader
        title={t.navigation.history}
        description={t.pages.history.description}
        icon={<HistoryIcon className="w-8 h-8" />}
      />

      <SolveTable onViewDetails={handleViewDetails} />

      <SolveDetailsModal
        isOpen={selectedSolve !== null}
        onClose={() => setSelectedSolve(null)}
        solve={selectedSolve}
        solveNumber={selectedSolveNumber}
      />
    </motion.div>
  );
}

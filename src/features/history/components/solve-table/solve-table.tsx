import { TrashBin2 } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ConfirmDialog } from '@/shared';
import { Button } from '@/shared/components/ui';
import { fadeIn, formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { Solve } from '@/shared/types';

type FilterOption = 'all' | 'last5' | 'last12' | 'last50' | 'last100';

interface SolveTableProps {
  onViewDetails?: (solve: Solve) => void;
}

export const SolveTable: React.FC<SolveTableProps> = ({
  onViewDetails,
}: SolveTableProps): React.ReactElement => {
  const { t } = useI18nStore();
  const { getActiveSession, deleteSolve } = useSessionsStore();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [deleteConfirmSolve, setDeleteConfirmSolve] = useState<Solve | null>(null);

  const session = getActiveSession();
  const allSolves = session?.solves || [];

  const getFilteredSolves = (): Solve[] => {
    const reversed = [...allSolves].reverse();
    switch (filter) {
      case 'last5':
        return reversed.slice(0, 5);
      case 'last12':
        return reversed.slice(0, 12);
      case 'last50':
        return reversed.slice(0, 50);
      case 'last100':
        return reversed.slice(0, 100);
      default:
        return reversed;
    }
  };

  const filteredSolves = getFilteredSolves();

  const handleDelete = (e: React.MouseEvent, solve: Solve): void => {
    e.stopPropagation();
    setDeleteConfirmSolve(solve);
  };

  const confirmDelete = (): void => {
    if (deleteConfirmSolve) {
      deleteSolve(deleteConfirmSolve.id);
      setDeleteConfirmSolve(null);
    }
  };

  const formatDate = (dateInput: Date | string): string => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (allSolves.length === 0) {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="glass rounded-xl p-12 text-center"
      >
        <p className="text-text-muted text-lg">{t.solveTable.empty}</p>
      </motion.div>
    );
  }

  return (
    <>
      <section className="space-y-4" aria-labelledby="solve-table-title">
        {/* Header & Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 id="solve-table-title" className="text-xl font-bold text-text-primary px-2">
            {t.solveTable.title}
          </h2>
          <div className="flex items-center gap-3 bg-surface p-1 rounded-lg border border-white/5 w-full sm:w-auto">
            <label
              htmlFor="solve-filter"
              className="text-sm text-text-muted pl-2 whitespace-nowrap"
            >
              {t.solveTable.filter.label}:
            </label>
            <select
              id="solve-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterOption)}
              className="bg-transparent text-text-primary py-1 px-2 rounded focus:outline-none focus:bg-white/5 text-sm w-full sm:w-auto"
            >
              <option value="all" className="bg-surface">
                {t.solveTable.filter.all}
              </option>
              <option value="last5" className="bg-surface">
                {t.solveTable.filter.last5}
              </option>
              <option value="last12" className="bg-surface">
                {t.solveTable.filter.last12}
              </option>
              <option value="last50" className="bg-surface">
                {t.solveTable.filter.last50}
              </option>
              <option value="last100" className="bg-surface">
                {t.solveTable.filter.last100}
              </option>
            </select>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block glass rounded-xl overflow-hidden border border-white/5">
          <table className="w-full">
            <caption className="sr-only">{t.solveTable.title}</caption>
            <thead className="bg-surface/50 border-b border-white/5">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {t.solveTable.columns.number}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {t.solveTable.columns.time}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {t.solveTable.columns.scramble}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {t.solveTable.columns.date}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-right text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {t.solveTable.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSolves.map((solve) => {
                const solveNumber = allSolves.length - allSolves.indexOf(solve);
                return (
                  <tr
                    key={solve.id}
                    onClick={() => onViewDetails?.(solve)}
                    className="hover:bg-white/5 transition-colors cursor-pointer group"
                    tabIndex={0}
                    aria-label={`Ver detalhes da resolução #${solveNumber}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onViewDetails?.(solve);
                      }
                    }}
                  >
                    <td className="px-6 py-4 text-sm text-text-secondary">#{solveNumber}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-lg font-mono font-bold tracking-tight ${
                            solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                          }`}
                        >
                          {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                        </span>
                        {solve.penalty === '+2' && (
                          <span className="text-xs font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">
                            +2
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted font-mono max-w-xs truncate opacity-70 group-hover:opacity-100 transition-opacity">
                      {solve.scramble}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {formatDate(solve.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        onClick={(e) => handleDelete(e, solve)}
                        variant="ghost"
                        size="icon"
                        className="text-text-muted hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                        title={t.actions.delete}
                        aria-label={t.actions.delete}
                      >
                        <TrashBin2 size={18} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List View */}
        <ul className="md:hidden space-y-3" aria-label="Lista de resoluções">
          <AnimatePresence>
            {filteredSolves.map((solve) => {
              const solveNumber = allSolves.length - allSolves.indexOf(solve);
              return (
                <motion.li
                  key={solve.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => onViewDetails?.(solve)}
                  className="bg-surface/50 border border-white/5 rounded-xl p-4 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs text-text-muted font-mono mb-1">
                        #{solveNumber} • {formatDate(solve.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-2xl font-mono font-bold tracking-tight ${
                            solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                          }`}
                        >
                          {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                        </span>
                        {solve.penalty === '+2' && (
                          <span className="text-xs font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">
                            +2
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={(e) => handleDelete(e, solve)}
                      variant="ghost"
                      size="icon"
                      className="text-text-muted -mr-2 -mt-2 h-8 w-8"
                      aria-label={t.actions.delete}
                    >
                      <TrashBin2 size={16} />
                    </Button>
                  </div>
                  <div className="text-xs text-text-tertiary font-mono truncate bg-background/50 p-2 rounded border border-white/5">
                    {solve.scramble}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </section>

      <ConfirmDialog
        isOpen={deleteConfirmSolve !== null}
        onClose={() => setDeleteConfirmSolve(null)}
        onConfirm={confirmDelete}
        title={t.solveTable.deleteConfirm.title}
        message={t.solveTable.deleteConfirm.message}
        confirmText={t.actions.delete}
        cancelText={t.actions.cancel}
        variant="danger"
      />
    </>
  );
};

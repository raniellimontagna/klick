import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Eye } from 'lucide-react';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { useSessionsStore } from '@/shared/store/stores/sessionsStore';
import { ConfirmDialog } from '@/shared';
import { Button } from '@/shared/components/ui';
import { fadeIn, formatTime } from '@/shared/lib';
import type { Solve } from '@/commons/types';

type FilterOption = 'all' | 'last5' | 'last12' | 'last50' | 'last100';

interface SolveTableProps {
  onViewDetails?: (solve: Solve) => void;
}

export function SolveTable({ onViewDetails }: SolveTableProps) {
  const { t } = useI18nStore();
  const { getActiveSession, deleteSolve } = useSessionsStore();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [deleteConfirmSolve, setDeleteConfirmSolve] = useState<Solve | null>(null);

  const session = getActiveSession();
  const allSolves = session?.solves || [];

  const getFilteredSolves = () => {
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

  const handleDelete = (solve: Solve) => {
    setDeleteConfirmSolve(solve);
  };

  const confirmDelete = () => {
    if (deleteConfirmSolve) {
      deleteSolve(deleteConfirmSolve.id);
      setDeleteConfirmSolve(null);
    }
  };

  const getPenaltyDisplay = (solve: Solve) => {
    if (solve.penalty === 'DNF') return 'DNF';
    if (solve.penalty === '+2') return '+2';
    return '-';
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
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
        className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700"
      >
        <p className="text-gray-400">{t.solveTable.empty}</p>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-4 sm:p-6 border-b border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-white">{t.solveTable.title}</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="filter" className="text-sm text-gray-400">
              {t.solveTable.filter.label}:
            </label>
            <select
              id="filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterOption)}
              className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="all">{t.solveTable.filter.all}</option>
              <option value="last5">{t.solveTable.filter.last5}</option>
              <option value="last12">{t.solveTable.filter.last12}</option>
              <option value="last50">{t.solveTable.filter.last50}</option>
              <option value="last100">{t.solveTable.filter.last100}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.number}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.time}
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.scramble}
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.date}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.penalty}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t.solveTable.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredSolves.map((solve) => {
                const solveNumber = allSolves.length - allSolves.indexOf(solve);
                return (
                  <tr key={solve.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300">#{solveNumber}</td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-white">
                      {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-400 max-w-xs truncate">
                      {solve.scramble}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-400">
                      {formatDate(solve.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-medium ${solve.penalty === 'DNF'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : solve.penalty === '+2'
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            : 'bg-gray-700 text-gray-400'
                          }`}
                      >
                        {getPenaltyDisplay(solve)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => onViewDetails?.(solve)}
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-white hover:bg-gray-700 focus-visible:ring-offset-gray-900"
                          title={t.actions.viewDetails}
                        >
                          <Eye size={16} />
                        </Button>
                        <Button
                          onClick={() => handleDelete(solve)}
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus-visible:ring-red-500 focus-visible:ring-offset-gray-900"
                          title={t.actions.delete}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

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
}

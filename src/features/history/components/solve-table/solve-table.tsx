import { TrashBin2 } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmDialog } from '@/shared';
import { Button } from '@/shared/components/ui';
import { fadeIn, formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';
import { useSolveTable } from './use-solve-table';

interface SolveTableProps {
  onViewDetails?: (solve: Solve) => void;
}

export const SolveTable: React.FC<SolveTableProps> = ({
  onViewDetails,
}: SolveTableProps): React.ReactElement => {
  const { t } = useI18nStore();
  const {
    allSolves,
    confirmDelete,
    deleteConfirmSolve,
    filter,
    filterOptions,
    formatDate,
    handleDeleteRequest,
    setDeleteConfirmSolve,
    setFilter,
    solveRows,
  } = useSolveTable();

  if (allSolves.length === 0) {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="surface-panel rounded-3xl p-12 text-center"
      >
        <p className="text-text-muted text-lg">{t.solveTable.empty}</p>
      </motion.div>
    );
  }

  return (
    <>
      <section className="space-y-4" aria-labelledby="solve-table-title">
        <div className="surface-panel sticky top-0 z-10 rounded-3xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="solve-table-title" className="text-xl font-black tracking-tight text-text-primary">
                {t.solveTable.title}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {t.solveTable.summary
                  .replace('{visible}', String(solveRows.length))
                  .replace('{total}', String(allSolves.length))}
              </p>
            </div>

            <div className="min-w-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {t.solveTable.filter.label}
              </p>
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex min-w-max rounded-full border border-border/75 bg-surface/70 p-1">
                  {filterOptions.map((option) => {
                    const isActive = filter === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilter(option.value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition-colors ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
                        }`}
                        aria-pressed={isActive}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-panel hidden overflow-hidden rounded-3xl lg:block">
          <table className="w-full">
            <caption className="sr-only">{t.solveTable.title}</caption>
            <thead className="border-b border-border/70 bg-surface/68">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
                >
                  {t.solveTable.columns.number}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
                >
                  {t.solveTable.columns.time}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
                >
                  {t.solveTable.columns.scramble}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
                >
                  {t.solveTable.columns.date}
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
                >
                  {t.solveTable.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {solveRows.map(({ solve, solveNumber }) => {
                return (
                  <tr
                    key={solve.id}
                    onClick={() => onViewDetails?.(solve)}
                    className="group cursor-pointer transition-colors hover:bg-surface-hover/55"
                    tabIndex={0}
                    aria-label={`Ver detalhes da resolução #${solveNumber}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onViewDetails?.(solve);
                      }
                    }}
                  >
                    <td className="px-6 py-5 text-sm text-text-secondary">#{solveNumber}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-mono text-lg font-black tracking-[-0.04em] ${
                            solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                          }`}
                        >
                          {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                        </span>
                        {solve.penalty === '+2' && (
                          <span className="rounded border border-warning/35 bg-warning/15 px-1.5 py-0.5 text-xs font-bold text-warning">
                            +2
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p
                        className="max-w-md truncate font-mono text-sm text-text-secondary opacity-80 transition-opacity group-hover:opacity-100"
                        title={solve.scramble}
                      >
                        {solve.scramble}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {formatDate(solve.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRequest(solve);
                        }}
                        variant="ghost"
                        size="icon"
                        className="text-text-muted opacity-0 transition-all hover:bg-danger/12 hover:text-danger focus:opacity-100 group-hover:opacity-100"
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

        <ul className="space-y-3 lg:hidden" aria-label="Lista de resoluções">
          <AnimatePresence>
            {solveRows.map(({ solve, solveNumber }) => {
              return (
                <motion.li
                  key={solve.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="surface-panel rounded-[1.5rem] p-4"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onViewDetails?.(solve)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                            <span className="font-mono">#{solveNumber}</span>
                            <span aria-hidden="true">•</span>
                            <span>{formatDate(solve.createdAt)}</span>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <span
                              className={`font-mono text-[2rem] font-black tracking-[-0.05em] ${
                                solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                              }`}
                            >
                              {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                            </span>
                            {solve.penalty === '+2' && (
                              <span className="rounded-md border border-warning/35 bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">
                                +2
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="rounded-full border border-border/70 bg-surface/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                          {t.solveTable.details.title}
                        </span>
                      </div>

                      <div className="mt-4 rounded-2xl border border-border/75 bg-surface/60 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                          {t.solveTable.columns.scramble}
                        </p>
                        <p className="mt-2 break-words font-mono text-xs leading-relaxed text-text-secondary">
                          {solve.scramble}
                        </p>
                      </div>
                    </button>

                    <Button
                      onClick={() => handleDeleteRequest(solve)}
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-9 w-9 shrink-0 text-text-muted hover:bg-danger/12 hover:text-danger"
                      aria-label={t.actions.delete}
                    >
                      <TrashBin2 size={16} />
                    </Button>
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

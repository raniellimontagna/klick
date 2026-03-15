import { useCallback, useMemo, useState } from 'react';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { Solve } from '@/shared/types';

type FilterOption = 'all' | 'last5' | 'last12' | 'last50' | 'last100';

function getFilterLabel(
  filter: FilterOption,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
): string {
  switch (filter) {
    case 'last5':
      return strings.solveTable.filter.last5;
    case 'last12':
      return strings.solveTable.filter.last12;
    case 'last50':
      return strings.solveTable.filter.last50;
    case 'last100':
      return strings.solveTable.filter.last100;
    default:
      return strings.solveTable.filter.all;
  }
}

export function useSolveTable() {
  const { t, language } = useI18nStore();
  const { getActiveSession, deleteSolve } = useSessionsStore();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [deleteConfirmSolve, setDeleteConfirmSolve] = useState<Solve | null>(null);

  const session = getActiveSession();
  const allSolves = session?.solves ?? [];

  const filterOptions = useMemo(
    () =>
      (['all', 'last5', 'last12', 'last50', 'last100'] as const).map((value) => ({
        label: getFilterLabel(value, t),
        value,
      })),
    [t],
  );

  const solveRows = useMemo(() => {
    const reversed = allSolves
      .map((solve, index) => ({
        solve,
        solveNumber: index + 1,
      }))
      .reverse();

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
  }, [allSolves, filter]);

  const formatDate = useCallback(
    (dateInput: Date | string): string => {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

      return new Intl.DateTimeFormat(language, {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
      }).format(date);
    },
    [language],
  );

  const handleDeleteRequest = useCallback((solve: Solve) => {
    setDeleteConfirmSolve(solve);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmSolve) {
      return;
    }

    deleteSolve(deleteConfirmSolve.id);
    setDeleteConfirmSolve(null);
  }, [deleteConfirmSolve, deleteSolve]);

  return {
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
  };
}

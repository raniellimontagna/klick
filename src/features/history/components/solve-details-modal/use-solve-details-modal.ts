import { useCallback, useState } from 'react';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { Penalty, Solve } from '@/shared/types';

interface PenaltyInfo {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export function useSolveDetailsModal(solve: Solve | null) {
  const { t, language } = useI18nStore();
  const { updateSolvePenalty } = useSessionsStore();
  const [copied, setCopied] = useState(false);

  const togglePenalty = useCallback(
    (penalty: Penalty) => {
      if (!solve) return;

      if (solve.penalty === penalty) {
        updateSolvePenalty(solve.id, 'NONE');
      } else {
        updateSolvePenalty(solve.id, penalty);
      }
    },
    [solve, updateSolvePenalty],
  );

  const copyScramble = useCallback(() => {
    if (!solve) return;

    navigator.clipboard.writeText(solve.scramble);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [solve]);

  const formatFullDate = useCallback(
    (isoString: string) => {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(language, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
    },
    [language],
  );

  const getPenaltyInfo = useCallback((): PenaltyInfo => {
    if (!solve) {
      return {
        label: t.penalties.none,
        color: 'text-gray-400',
        bgColor: 'bg-gray-700',
        borderColor: 'border-gray-600',
      };
    }

    if (solve.penalty === 'DNF') {
      return {
        label: t.penalties.dnf,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        borderColor: 'border-red-500/30',
      };
    }

    if (solve.penalty === '+2') {
      return {
        label: t.penalties.plus2,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        borderColor: 'border-yellow-500/30',
      };
    }

    return {
      label: t.penalties.none,
      color: 'text-gray-400',
      bgColor: 'bg-gray-700',
      borderColor: 'border-gray-600',
    };
  }, [solve, t.penalties]);

  return {
    copied,
    copyScramble,
    formatFullDate,
    penaltyInfo: getPenaltyInfo(),
    togglePenalty,
  };
}

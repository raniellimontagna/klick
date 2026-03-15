import { useCallback, useState } from 'react';
import { useMediaQuery } from '@/shared/hooks';
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
  const isMobile = useMediaQuery('(max-width: 767px)');
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
    if (!solve || typeof navigator === 'undefined' || !navigator.clipboard) return;

    navigator.clipboard.writeText(solve.scramble);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [solve]);

  const formatFullDate = useCallback(
    (dateInput: Date | string) => {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
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
        color: 'text-text-muted',
        bgColor: 'bg-white/5',
        borderColor: 'border-white/10',
      };
    }

    if (solve.penalty === 'DNF') {
      return {
        label: t.penalties.dnf,
        color: 'text-danger',
        bgColor: 'bg-danger/12',
        borderColor: 'border-danger/30',
      };
    }

    if (solve.penalty === '+2') {
      return {
        label: t.penalties.plus2,
        color: 'text-warning',
        bgColor: 'bg-warning/12',
        borderColor: 'border-warning/30',
      };
    }

    return {
      label: t.penalties.none,
      color: 'text-text-muted',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    };
  }, [solve, t.penalties]);

  return {
    copied,
    copyScramble,
    formatFullDate,
    isMobile,
    penaltyInfo: getPenaltyInfo(),
    togglePenalty,
  };
}

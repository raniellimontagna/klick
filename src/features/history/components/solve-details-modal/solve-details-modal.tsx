import { X, Copy, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { Button, Modal, Card } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';
import { formatTime } from '@/shared/lib';
import { useSolveDetailsModal } from './use-solve-details-modal';
import type { Solve } from '@/commons/types';

interface SolveDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  solve: Solve | null;
  solveNumber: number;
}

export function SolveDetailsModal({ isOpen, onClose, solve, solveNumber }: SolveDetailsModalProps) {
  const { t } = useI18nStore();
  const { copied, copyScramble, formatFullDate, penaltyInfo } = useSolveDetailsModal(solve);

  if (!solve) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      ariaLabel={`${t.solveTable.details.title} #${solveNumber}`}
      containerClassName="p-4 max-w-2xl"
      className="flex flex-col max-h-[85vh]"
    >
      <div className="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
        <h2 className="text-2xl font-bold text-white">
          {t.solveTable.details.title} #{solveNumber}
        </h2>
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <X size={24} />
        </Button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        <Card variant="overlay" padding="none" className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="text-primary" size={24} />
            <h3 className="text-lg font-bold text-white">{t.solveTable.details.time}</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold font-mono text-white">
                {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
              </span>
              {solve.penalty === '+2' && (
                <span className="text-lg text-gray-400">
                  ({formatTime(solve.timeMs)} + 2s)
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card variant="overlay" padding="none" className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className={penaltyInfo.color} size={24} />
            <h3 className="text-lg font-bold text-white">{t.solveTable.details.penalty}</h3>
          </div>
          <span
            className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium border ${penaltyInfo.bgColor
              } ${penaltyInfo.color} ${penaltyInfo.borderColor}`}
          >
            {penaltyInfo.label}
          </span>
        </Card>

        <Card variant="overlay" padding="none" className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">
              {t.solveTable.details.scramble}
            </h3>
            <Button
              onClick={copyScramble}
              variant="secondary"
              size="sm"
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white border-none text-sm"
            >
              <Copy size={16} />
              {copied ? t.scramble.copySuccess : t.scramble.copy}
            </Button>
          </div>
          <p className="text-gray-300 font-mono text-sm sm:text-base leading-relaxed wrap-break-word">
            {solve.scramble}
          </p>
        </Card>

        <Card variant="overlay" padding="none" className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="text-gray-400" size={24} />
            <h3 className="text-lg font-bold text-white">{t.solveTable.details.date}</h3>
          </div>
          <p className="text-gray-300 text-sm">{formatFullDate(solve.createdAt)}</p>
        </Card>
      </div>

      <div className="p-6 border-t border-gray-700 shrink-0">
        <Button
          onClick={onClose}
          variant="secondary"
          className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white border-none font-medium"
        >
          {t.actions.close}
        </Button>
      </div>
    </Modal>
  );
}

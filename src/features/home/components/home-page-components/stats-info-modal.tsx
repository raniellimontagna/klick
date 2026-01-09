import { Award, Target, TrendingUp, Trophy, X } from 'lucide-react';
import { Button, Modal } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';

interface StatsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'single' | 'ao5' | 'ao12' | 'bestAo5' | 'bestAo12';
}

export function StatsInfoModal({ isOpen, onClose }: StatsInfoModalProps) {
  const { t } = useI18nStore();

  const sections = [
    {
      id: 'single',
      icon: Target,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      data: t.stats.info.single,
    },
    {
      id: 'ao5',
      icon: TrendingUp,
      color: 'text-text-muted',
      bgColor: 'bg-white/5',
      data: t.stats.info.ao5,
    },
    {
      id: 'ao12',
      icon: TrendingUp,
      color: 'text-text-muted',
      bgColor: 'bg-white/5',
      data: t.stats.info.ao12,
    },
    {
      id: 'bestAo5',
      icon: Award,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      data: t.stats.info.bestAo5,
    },
    {
      id: 'bestAo12',
      icon: Trophy,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      data: t.stats.info.bestAo12,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      ariaLabel={t.stats.info.title}
      containerClassName="p-4"
      className="flex flex-col max-h-[85vh]"
    >
      <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
        <h2 className="text-2xl font-bold text-text-primary">{t.stats.info.title}</h2>
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="text-text-secondary hover:text-text-primary hover:bg-white/10"
        >
          <X size={24} />
        </Button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              className={`rounded-xl p-5 ${section.bgColor} border border-white/5`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`${section.color}`}>
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-text-primary">{section.data.title}</h3>
              </div>

              <p className="text-text-secondary mb-3 leading-relaxed">{section.data.description}</p>

              <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                <p className="text-sm text-text-muted font-mono whitespace-pre-line">
                  <span className="text-accent font-semibold">Exemplo:</span>
                  {'\n'}
                  {section.data.example}
                </p>
              </div>

              {'rule' in section.data && section.data.rule && (
                <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-sm text-yellow-200">
                    <span className="font-semibold">⚠️ Regra:</span> {section.data.rule}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-xl p-5 bg-red-500/10 border border-red-500/30">
          <h3 className="text-lg font-bold text-text-primary mb-4">
            {t.stats.info.penalties.title}
          </h3>
          <div className="space-y-3">
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
              <p className="text-text-secondary text-sm">{t.stats.info.penalties.plus2}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
              <p className="text-text-secondary text-sm">{t.stats.info.penalties.dnf}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/10 shrink-0">
        <Button onClick={onClose} className="w-full px-4 py-3 font-medium">
          {t.actions.close}
        </Button>
      </div>
    </Modal>
  );
}

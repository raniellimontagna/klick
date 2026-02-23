import { CloseCircle, CupFirst, GraphUp, MedalRibbon, Target } from '@solar-icons/react';
import { Button, Modal } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';

interface StatsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'single' | 'ao5' | 'ao12' | 'bestAo5' | 'bestAo12';
}

export const StatsInfoModal: React.FC<StatsInfoModalProps> = ({
  isOpen,
  onClose,
}: StatsInfoModalProps): React.ReactElement | null => {
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
      icon: GraphUp,
      color: 'text-text-muted',
      bgColor: 'bg-white/5',
      data: t.stats.info.ao5,
    },
    {
      id: 'ao12',
      icon: GraphUp,
      color: 'text-text-muted',
      bgColor: 'bg-white/5',
      data: t.stats.info.ao12,
    },
    {
      id: 'bestAo5',
      icon: MedalRibbon,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      data: t.stats.info.bestAo5,
    },
    {
      id: 'bestAo12',
      icon: CupFirst,
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
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <h2 className="text-2xl font-bold text-text-primary">{t.stats.info.title}</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-text-secondary hover:text-text-primary hover:bg-white/10 -mr-2 -mt-2"
            aria-label={t.actions.close}
          >
            <CloseCircle size={24} />
          </Button>
        </header>

        {/* Content */}
        <section className="overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article
                key={section.id}
                className={`rounded-xl p-5 ${section.bgColor} border border-white/5`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`${section.color}`} aria-hidden="true">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">{section.data.title}</h3>
                </div>

                <p className="text-text-secondary mb-4 leading-relaxed">
                  {section.data.description}
                </p>

                <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                  <header className="text-[10px] font-black uppercase tracking-widest text-accent mb-2">
                    Exemplo
                  </header>
                  <p className="text-sm text-text-muted font-mono whitespace-pre-line leading-relaxed">
                    {section.data.example}
                  </p>
                </div>

                {'rule' in section.data && section.data.rule && (
                  <div className="mt-4 bg-warning/10 border border-warning/20 rounded-lg p-3 flex gap-3">
                    <span className="shrink-0" aria-hidden="true">
                      ⚠️
                    </span>
                    <p className="text-sm text-warning/90 leading-snug">
                      <span className="font-bold uppercase text-[10px] tracking-wider block mb-0.5">
                        Regra
                      </span>
                      {section.data.rule}
                    </p>
                  </div>
                )}
              </article>
            );
          })}

          <article className="rounded-xl p-5 bg-danger/10 border border-danger/20">
            <h3 className="text-lg font-bold text-text-primary mb-4">
              {t.stats.info.penalties.title}
            </h3>
            <div className="space-y-3">
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-text-secondary text-sm leading-relaxed">
                  {t.stats.info.penalties.plus2}
                </p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-text-secondary text-sm leading-relaxed">
                  {t.stats.info.penalties.dnf}
                </p>
              </div>
            </div>
          </article>
        </section>

        {/* Footer */}
        <footer className="p-6 border-t border-white/10 shrink-0">
          <Button
            onClick={onClose}
            className="w-full py-4 font-bold uppercase tracking-wider text-sm"
          >
            {t.actions.close}
          </Button>
        </footer>
      </div>
    </Modal>
  );
};

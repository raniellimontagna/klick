import { motion } from 'framer-motion';
import { Dumbbell } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, PageHeader } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn, slideUp, staggerContainer } from '@/shared/lib';
import { TrainingCaseCard } from './components/training-case-card';
import { trainingCases, trainingCategories } from './lib/training-data/cases';
import type { TrainingCategory } from './lib/training-data/types';

export function Training() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<TrainingCategory>('pll');

  const categoryCases = useMemo(
    () => trainingCases.filter((trainingCase) => trainingCase.category === activeCategory),
    [activeCategory],
  );

  const categoryContent = t.training.categories[activeCategory];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={t.training.title}
        description={t.pages.training.description}
        icon={<Dumbbell className="w-8 h-8" />}
      />

      <motion.div variants={slideUp} initial="initial" animate="animate">
        <div className="flex flex-wrap gap-2">
          {trainingCategories.map((category) => (
            <Button
              key={category}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveCategory(category)}
              className={cn(
                'rounded-full border transition-all',
                activeCategory === category
                  ? 'border-primary bg-primary/15 text-primary shadow-sm'
                  : 'border-border text-text-secondary hover:text-text-primary hover:border-primary/40',
              )}
            >
              <span className="font-medium tracking-wide uppercase text-xs">
                {t.training.categories[category].label}
              </span>
            </Button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={slideUp} initial="initial" animate="animate">
        <Card variant="surface" className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">{categoryContent.label}</h2>
          <p className="text-sm text-text-secondary">{categoryContent.description}</p>
          <p className="text-xs text-text-tertiary">{t.training.description}</p>
        </Card>
      </motion.div>

      <motion.div
        key={activeCategory}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-4 lg:grid-cols-2"
      >
        {categoryCases.map((trainingCase) => (
          <motion.div key={trainingCase.id} variants={slideUp}>
            <TrainingCaseCard trainingCase={trainingCase} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import { Card } from '@/shared/components/ui';
import { cn, scale } from '@/shared/lib';

type StatCardVariant = 'primary' | 'secondary' | 'accent';

interface StatCardProps {
  label: string;
  value: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  variant?: StatCardVariant;
  className?: string;
}

const variantClasses: Record<StatCardVariant, string> = {
  primary: 'bg-primary/20 border-primary/40',
  secondary: '',
  accent: 'bg-accent/20 border-accent/40',
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  variant = 'secondary',
  className,
}: StatCardProps): React.ReactElement => {
  return (
    <motion.li
      variants={scale}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Card
        variant="surface"
        padding="none"
        className={cn(
          'p-3 sm:p-4 transition-all bg-white/5 backdrop-blur-sm border-white/5 hover:border-white/10 group h-full',
          variantClasses[variant],
          className,
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {Icon && (
            <Icon
              size={16}
              className="text-text-muted group-hover:text-primary transition-colors sm:w-5 sm:h-5"
            />
          )}
          <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-text-muted">
            {label}
          </h3>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums tracking-tight">
          {value}
        </p>
      </Card>
    </motion.li>
  );
};

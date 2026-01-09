import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/shared/components/ui';
import { cn, scale, } from '@/shared/lib';

type StatCardVariant = 'primary' | 'secondary' | 'accent';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  variant?: StatCardVariant;
}

const variantClasses: Record<StatCardVariant, string> = {
  primary: 'bg-primary/20 border-primary/40',
  secondary: '',
  accent: 'bg-accent/20 border-accent/40',
};

export function StatCard({ label, value, icon: Icon, variant = 'secondary' }: StatCardProps) {
  return (
    <motion.div
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
          'p-3 sm:p-4 transition-all bg-gray-800',
          variantClasses[variant],
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon size={16} className="text-gray-400 sm:w-5 sm:h-5" />}
          <h3 className="text-xs sm:text-sm font-medium text-gray-400">{label}</h3>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{value}</p>
      </Card>
    </motion.div>
  );
}

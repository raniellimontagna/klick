import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export const RouteLoader = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, rotate: [0, 360] }}
          transition={{
            duration: 0.5,
            rotate: { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' },
          }}
          className="relative"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg border-2 border-primary/40 shadow-lg shadow-primary/20" />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
          >
            <Loader2 className="w-8 h-8 text-primary" />
          </motion.div>
        </motion.div>

        {/* Loading text with animated dots */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-1"
        >
          <span className="text-sm text-text-secondary font-medium">Carregando</span>
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
            className="text-sm text-text-secondary"
          >
            ...
          </motion.span>
        </motion.div>

        {/* Optional progress bar */}
        <div className="w-48 h-1 bg-surface rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
          />
        </div>
      </div>
    </div>
  );
};

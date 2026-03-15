import { Refresh } from '@solar-icons/react';
import { motion } from 'framer-motion';

interface RouteLoaderProps {
  fullscreen?: boolean;
}

export const RouteLoader = ({ fullscreen = false }: RouteLoaderProps) => {
  return (
    <div
      className={`flex w-full items-center justify-center ${
        fullscreen
          ? 'min-h-screen bg-background px-6 supports-[height:100dvh]:min-h-dvh'
          : 'min-h-[18rem] flex-1 px-4 py-10'
      }`}
    >
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
          <div className="h-16 w-16 rounded-xl border-2 border-primary/40 bg-linear-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/20" />
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
            <Refresh size={32} className="text-primary" />
          </motion.div>
        </motion.div>

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

        <div className="h-1 w-48 overflow-hidden rounded-full bg-surface">
          <motion.div
            className="h-full bg-linear-to-r from-primary to-accent"
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

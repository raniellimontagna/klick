import { motion } from 'framer-motion';
import { ArrowRight, RotateCw, RotateCcw } from 'lucide-react';

interface AlgorithmMoveProps {
    move: string;
    description?: string;
    compact?: boolean;
}

export function AlgorithmMove({ move, description, compact = false }: AlgorithmMoveProps) {
    const isClockwise = !move.includes("'");
    const is180 = move.includes('2');

    if (compact) {
        return (
            <div className="flex items-center gap-1">
                <code className="text-xs font-mono font-bold text-primary">{move}</code>
                {is180 ? (
                    <div className="flex">
                        <RotateCw className="w-3 h-3 text-primary" />
                        <RotateCw className="w-3 h-3 text-primary -ml-1.5" />
                    </div>
                ) : isClockwise ? (
                    <RotateCw className="w-3 h-3 text-primary" />
                ) : (
                    <RotateCcw className="w-3 h-3 text-primary" />
                )}
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-border"
        >
            <div className="flex items-center gap-1">
                <code className="text-sm font-mono font-bold text-primary">{move}</code>
                {is180 ? (
                    <div className="flex">
                        <RotateCw className="w-4 h-4 text-primary" />
                        <RotateCw className="w-4 h-4 text-primary -ml-2" />
                    </div>
                ) : isClockwise ? (
                    <RotateCw className="w-4 h-4 text-primary" />
                ) : (
                    <RotateCcw className="w-4 h-4 text-primary" />
                )}
            </div>
            {description && (
                <>
                    <ArrowRight className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary">{description}</span>
                </>
            )}
        </motion.div>
    );
}

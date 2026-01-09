import { motion } from 'framer-motion';
import type { CubeVisualizationConfig } from './types';
import { CubeFace } from './CubeFace';
import { AlgorithmMove } from './AlgorithmMove';

interface CubeVisualizerProps {
    config: CubeVisualizationConfig;
    className?: string;
}

export function CubeVisualizer({ config, className = '' }: CubeVisualizerProps) {
    const {
        title,
        subtitle,
        icon,
        gradient = 'from-blue-500/10 to-purple-500/10',
        faces = [],
        algorithms = [],
        tip,
        content,
    } = config;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-linear-to-br ${gradient} rounded-xl p-4 border border-primary/20 ${className}`}
        >
            <div className="flex flex-col items-center gap-4">
                {/* Header */}
                {(title || subtitle) && (
                    <div className="text-center">
                        {title && (
                            <div className="text-2xl font-bold mb-2">
                                {icon && <span className="mr-2">{icon}</span>}
                                {title}
                            </div>
                        )}
                        {subtitle && <div className="text-sm text-text-secondary">{subtitle}</div>}
                    </div>
                )}

                {/* Custom content */}
                {content}

                {/* Cube faces */}
                {faces.length > 0 && (
                    <div className="flex gap-4 items-center justify-center flex-wrap">
                        {faces.map((face) => (
                            <CubeFace
                                key={`${face.label}-${face.colors.join('-')}`}
                                colors={face.colors}
                                label={face.label}
                            />
                        ))}
                    </div>
                )}

                {/* Algorithms */}
                {algorithms.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
                        {algorithms.map((alg) => (
                            <AlgorithmMove
                                key={`${alg.move}-${alg.description || ''}`}
                                move={alg.move}
                                description={alg.description}
                            />
                        ))}
                    </div>
                )}

                {/* Tip */}
                {tip && (
                    <div className="text-xs text-center text-text-secondary max-w-sm bg-surface/50 rounded-lg p-2 border border-border">
                        💡 {tip}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

import type { CubeColor } from './types';

interface CubeFaceProps {
    colors: CubeColor[];
    label?: string;
    size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
} as const;

export function CubeFace({ colors, label, size = 'md' }: CubeFaceProps) {
    if (colors.length !== 9) {
        console.warn('CubeFace requires exactly 9 colors');
        return null;
    }

    return (
        <div className="flex flex-col items-center gap-1">
            {label && <div className="text-xs text-text-secondary font-semibold">{label}</div>}
            <div className="grid grid-cols-3 gap-0.5 bg-border p-1 rounded">
                {colors.map((color, index) => (
                    <div
                        key={`${label}-${index}-${color}`}
                        className={`${SIZES[size]} rounded-sm border border-border`}
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>
        </div>
    );
}

import { motion, useMotionValue, useTransform } from 'framer-motion';
import { forwardRef, useEffect, useState } from 'react';
import { cn } from '@/shared/lib';


export type RangeSliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onChange: (value: number) => void;
};

export const RangeSlider = forwardRef<HTMLInputElement, RangeSliderProps>(function RangeSlider(
  { className, min = 0, max = 100, step = 1, value, onChange, ...props },
  ref,
) {
  const [isInteracting, setIsInteracting] = useState(false);
  const internalValue = (Number(value) - Number(min)) / (Number(max) - Number(min));

  const progressX = useMotionValue(0);
  const progressWidth = useTransform(progressX, (v) => `${v * 100}%`);
  const thumbX = useTransform(progressX, (v) => `calc(${v * 100}% - 10px)`);


  useEffect(() => {
    progressX.set(internalValue);
  }, [internalValue, progressX]);

  return (
    <div className={cn('relative flex-1 flex items-center group', className)}>
      {/* Track */}
      <div className="relative w-full h-2 rounded-full bg-border">
        {/* Progress */}
        <motion.div
          className="absolute h-full rounded-full bg-primary"
          style={{ width: progressWidth }}
        />
      </div>

      {/* Thumb */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-primary shadow-md"
        style={{
          left: thumbX,
        }}
        animate={{
          scale: isInteracting ? 1.2 : 1,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />

      {/* Hidden native input for accessibility and functionality */}
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={() => setIsInteracting(true)}
        onMouseUp={() => setIsInteracting(false)}
        onTouchStart={() => setIsInteracting(true)}
        onTouchEnd={() => setIsInteracting(false)}
        className="absolute w-full h-full opacity-0 cursor-pointer"
        {...props}
      />
    </div>
  );
});


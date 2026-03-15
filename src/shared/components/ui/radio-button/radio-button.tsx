import { createContext, forwardRef, useContext } from 'react';
import { cn } from '@/shared/lib';

type RadioGroupContextValue = {
  name: string;
  selectedValue: string;
  onChange: (value: string) => void;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

type RadioGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
};

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { name, value, onValueChange, children, className, ...props },
  ref,
) {
  const contextValue: RadioGroupContextValue = {
    name,
    selectedValue: value,
    onChange: onValueChange,
  };

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div
        ref={ref}
        role="radiogroup"
        className={cn('flex items-center gap-3', className)}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
});

type RadioButtonProps = {
  value: string;
  children: React.ReactNode;
};

export function RadioButton({ value, children }: RadioButtonProps) {
  const context = useContext(RadioGroupContext);

  if (!context) {
    throw new Error('RadioButton must be used within a RadioGroup');
  }

  const { name, selectedValue, onChange } = context;
  const isChecked = selectedValue === value;

  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-1 py-1 text-sm text-text-secondary transition-colors hover:text-text-primary">
      <input
        type="radio"
        name={name}
        value={value}
        checked={isChecked}
        onChange={(e) => onChange(e.target.value)}
        className="h-4 w-4 border-border bg-background-elevated text-primary focus:ring-primary focus:ring-offset-background"
      />
      <span className={cn(isChecked && 'text-text-primary')}>{children}</span>
    </label>
  );
}

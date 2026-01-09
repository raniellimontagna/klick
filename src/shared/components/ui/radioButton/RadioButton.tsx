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
            <div ref={ref} role="radiogroup" className={cn('flex items-center gap-3', className)} {...props}>
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
        <label className="flex items-center gap-2 cursor-pointer">
            <input
                type="radio"
                name={name}
                value={value}
                checked={isChecked}
                onChange={(e) => onChange(e.target.value)}
                className="w-4 h-4 text-primary bg-surface border-border focus:ring-primary focus:ring-offset-surface"
            />
            <span className="text-sm text-text-secondary">{children}</span>
        </label>
    );
}

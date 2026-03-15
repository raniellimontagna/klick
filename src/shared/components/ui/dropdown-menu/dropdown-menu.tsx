import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { AltArrowDown } from '@solar-icons/react';
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[1000] min-w-[180px] overflow-hidden rounded-2xl p-1.5',
        'surface-panel border border-border/75 bg-surface/95 backdrop-blur-xl shadow-2xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none transition-colors',
      'text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary',
      'focus:bg-surface-hover/80 focus:text-text-primary',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-xl py-2.5 pl-8 pr-3 text-sm outline-none transition-colors',
      'text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary',
      'focus:bg-surface-hover/80 focus:text-text-primary',
      'data-[state=checked]:bg-primary/14 data-[state=checked]:text-primary',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <div className="h-2 w-2 rounded-full bg-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-muted',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('my-1 h-px bg-border/70', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

// Custom Trigger Button with Glassmorphism
interface DropdownMenuTriggerButtonProps {
  icon?: ReactNode;
  label: ReactNode;
  isOpen?: boolean;
  className?: string;
  contentClassName?: string;
  labelClassName?: string;
  chevronClassName?: string;
  hideChevron?: boolean;
}

const DropdownMenuTriggerButton = forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerButtonProps & ComponentPropsWithoutRef<'button'>
>(
  (
    {
      icon,
      label,
      isOpen,
      className,
      contentClassName,
      labelClassName,
      chevronClassName,
      hideChevron = false,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'glass-button inline-flex h-11 min-w-0 max-w-full items-center gap-2.5 rounded-2xl border border-border/75 px-3 text-sm font-semibold text-text-primary transition-all sm:px-4',
        'whitespace-nowrap shadow-[var(--klick-shadow-soft)]',
        'hover:border-border-strong/75 hover:bg-surface-hover/70',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        className,
      )}
      {...props}
    >
      <span className={cn('flex min-w-0 flex-1 items-center gap-2.5', contentClassName)}>
        {icon && <span className="shrink-0 text-primary">{icon}</span>}
        <span className={cn('min-w-0 truncate whitespace-nowrap', labelClassName)}>{label}</span>
      </span>
      {!hideChevron && (
        <AltArrowDown
          size={16}
          className={cn(
            'shrink-0 text-text-muted transition-transform duration-200',
            isOpen && 'rotate-180',
            chevronClassName,
          )}
        />
      )}
    </button>
  ),
);
DropdownMenuTriggerButton.displayName = 'DropdownMenuTriggerButton';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTriggerButton,
};

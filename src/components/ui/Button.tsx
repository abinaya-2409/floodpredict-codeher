import React from 'react';

/**
 * The one button in the application.
 *
 * There were 52 buttons before this, each with its own bespoke class string -
 * three different heights, four paddings, and selected states that borrowed
 * the severity palette. Variants here are semantic, so a caller picks what a
 * button *means* rather than what it should look like.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  // The single affirmative action in a view.
  primary:
    'bg-accent text-on-accent border-transparent hover:bg-accent-soft active:bg-accent-deep shadow-sm',
  // Everything else that is still a real action.
  secondary:
    'bg-surface-2 text-fg-soft border-line hover:bg-surface-3 hover:text-fg hover:border-line-strong',
  // Toolbar toggles and tertiary controls: no chrome until touched.
  ghost: 'bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-fg',
  // Destructive or evacuation-grade actions only.
  danger: 'bg-danger/12 text-danger border-danger/35 hover:bg-danger/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-mini',
  md: 'h-9 px-3.5 gap-2 text-xs',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Renders the pressed state and sets aria-pressed for toggles. */
  active?: boolean;
  /** Pill shape, for filter and toggle rows. */
  pill?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  active = false,
  pill = false,
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // A toggle must announce its state, not just look different.
      aria-pressed={rest.onClick && active !== undefined ? active : undefined}
      className={[
        'inline-flex items-center justify-center border font-semibold whitespace-nowrap',
        'transition-colors cursor-pointer select-none',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        pill ? 'rounded-full' : 'rounded-control',
        SIZES[size],
        active
          ? 'bg-accent/18 text-accent border-accent/50'
          : VARIANTS[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

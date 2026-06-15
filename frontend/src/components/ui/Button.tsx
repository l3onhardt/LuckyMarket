import React from 'react';
import clsx from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    const variantClasses = {
      primary: 'fluid-glass-button',
      secondary: 'bg-white/10 hover:bg-white/20 text-white border border-white/20',
      success: 'outcome-yes',
      ghost: 'bg-transparent hover:bg-white/10 text-white',
    };

    const sizeClasses = {
      sm: 'button-sm px-3 py-1.5 text-sm',
      md: 'button-md px-4 py-2 text-base',
      lg: 'button-lg px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        className={clsx(
          'rounded-xl font-medium transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

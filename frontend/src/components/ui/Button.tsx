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
      sm: 'button-sm min-h-[40px] px-4 text-sm',
      md: 'button-md min-h-[48px] px-5 text-base',
      lg: 'button-lg min-h-[52px] px-6 text-lg',
    };

    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
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

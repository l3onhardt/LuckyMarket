import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`fluid-input ${className}`}
          {...props}
        />
        {error && (
          <span className="text-sm text-red-400">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

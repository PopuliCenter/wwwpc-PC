import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { fieldClass } from './fieldStyles';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Optional leading icon (e.g. a lucide icon node) rendered inside the field. */
  leadingIcon?: ReactNode;
  /** Optional trailing element (e.g. a clickable show/hide password button). */
  trailingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leadingIcon, trailingIcon, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          {leadingIcon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`${fieldClass({ invalid: Boolean(error) })} block ${leadingIcon ? 'pl-10' : ''} ${
              trailingIcon ? 'pr-10' : ''
            } ${className}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {trailingIcon && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
              {trailingIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger-fg" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-sm text-gray-600">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

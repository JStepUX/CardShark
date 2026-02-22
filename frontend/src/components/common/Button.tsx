import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'toolbar';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  active?: boolean;
  pill?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-stone-700 text-stone-200 hover:bg-stone-600',
  destructive: 'bg-red-700 text-white hover:bg-red-600',
  ghost: 'bg-transparent text-gray-400 hover:text-white',
  outline: 'bg-transparent border border-stone-600 text-stone-300 hover:bg-stone-800',
  toolbar: 'bg-stone-700 text-stone-300 hover:bg-stone-600',
};

const toolbarActiveStyle = 'bg-blue-600 text-white hover:bg-blue-700';

const labelSizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3 py-1.5 text-sm gap-2',
  lg: 'px-4 py-2 text-sm gap-2',
};

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  sm: 'p-1',
  md: 'p-1.5',
  lg: 'p-2',
};

const iconSizeMap: Record<ButtonSize, string> = {
  sm: '[&>svg]:w-4 [&>svg]:h-4',
  md: '[&>svg]:w-[18px] [&>svg]:h-[18px]',
  lg: '[&>svg]:w-5 [&>svg]:h-5',
};

const Button: React.FC<ButtonProps> = ({
  children,
  type = 'button',
  className = '',
  variant = 'primary',
  size = 'md',
  icon,
  active,
  pill,
  fullWidth,
  disabled,
  ...props
}) => {
  const isIconOnly = icon && !children;

  const base = 'inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed';
  const shape = pill ? 'rounded-full' : 'rounded-lg';
  const width = fullWidth ? 'w-full' : '';
  const variantClass = (variant === 'toolbar' && active) ? toolbarActiveStyle : variantStyles[variant];
  const sizeClass = isIconOnly ? iconOnlySizeStyles[size] : labelSizeStyles[size];
  const iconSize = icon ? iconSizeMap[size] : '';

  const combinedClassName = [base, shape, width, variantClass, sizeClass, iconSize, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled}
      className={combinedClassName}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
};

export default Button;

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) => {
  const baseStyles = 'font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-md transition-colors duration-150 ease-in-out';

  const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500',
    secondary: 'bg-stone-200 hover:bg-stone-300 text-gray-800 focus:ring-gray-400',
    destructive: 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500',
    outline: 'border border-gray-300 hover:bg-stone-100 text-gray-700 focus:ring-blue-500',
    ghost: 'hover:bg-stone-100 text-gray-700 focus:ring-blue-500',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const combinedClassName = `
    ${baseStyles}
    ${variantStyles[variant]}
    ${sizeStyles[size]}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
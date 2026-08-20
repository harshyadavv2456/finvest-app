import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', text }) => {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };

  return (
    <div className="flex flex-col justify-center items-center py-4">
      <div className="relative">
        <div className={`animate-spin rounded-full ${sizeClasses[size]} border-green-500/30 border-t-green-500`}></div>
        <div className={`absolute inset-0 animate-spin rounded-full ${sizeClasses[size]} border-transparent border-t-green-500`} style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
      </div>
      {text && (
        <p className="mt-3 text-sm text-gray-400 animate-pulse">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;

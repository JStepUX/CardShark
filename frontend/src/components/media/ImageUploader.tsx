import React, { useCallback, useState } from 'react';
import { Upload, FileWarning } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

interface ImageUploaderProps {
    onFileSelect: (file: File) => void;
    acceptedTypes?: string[];
    maxSizeMB?: number;
    label?: string;
    className?: string;
    isLoading?: boolean;
    error?: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    onFileSelect,
    acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    maxSizeMB = 10,
    label = 'Upload Image',
    className = '',
    isLoading = false,
    error = null
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const validateFile = (file: File): boolean => {
        // Check type
        if (!acceptedTypes.some(type => file.type.match(type.replace('*', '.*')))) {
            setLocalError(`Invalid file type. Accepted: ${acceptedTypes.join(', ')}`);
            return false;
        }

        // Check size
        if (file.size > maxSizeMB * 1024 * 1024) {
            setLocalError(`File too large. Maximum size: ${maxSizeMB}MB`);
            return false;
        }

        setLocalError(null);
        return true;
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        if (isLoading) return;

        const file = e.dataTransfer.files[0];
        if (file && validateFile(file)) {
            onFileSelect(file);
        }
    }, [isLoading, onFileSelect, acceptedTypes, maxSizeMB]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!isLoading) {
            setIsDragOver(true);
        }
    }, [isLoading]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && validateFile(file)) {
            onFileSelect(file);
        }
        // Reset value so same file can be selected again if needed
        e.target.value = '';
    };

    const displayError = error || localError;

    return (
        <div className={`w-full ${className}`}>
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
          relative group cursor-pointer
          border-2 border-dashed rounded-xl p-8
          flex flex-col items-center justify-center gap-4
          transition-all duration-200
          ${isDragOver
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-stone-700 hover:border-blue-500/50 hover:bg-stone-800/50'
                    }
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
          ${displayError ? 'border-red-500/50 bg-red-900/10' : ''}
        `}
            >
                <input
                    type="file"
                    accept={acceptedTypes.join(',')}
                    onChange={handleFileInput}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {isLoading ? (
                    <LoadingSpinner size={32} />
                ) : (
                    <>
                        <div className={`
              p-4 rounded-full 
              ${isDragOver ? 'bg-blue-500 text-white' : 'bg-stone-800 text-stone-400 group-hover:text-blue-400'}
              transition-colors duration-200
            `}>
                            <Upload size={24} />
                        </div>

                        <div className="text-center space-y-1">
                            <p className="font-medium text-stone-200">
                                {isDragOver ? 'Drop file here' : label}
                            </p>
                            <p className="text-xs text-stone-500">
                                Supports: {acceptedTypes.map(t => t.split('/')[1]).join(', ')} (Max {maxSizeMB}MB)
                            </p>
                        </div>
                    </>
                )}
            </div>

            {displayError && (
                <div className="mt-2 flex items-center gap-2 text-sm text-red-400 animate-in slide-in-from-top-1">
                    <FileWarning size={14} />
                    <span>{displayError}</span>
                </div>
            )}
        </div>
    );
};

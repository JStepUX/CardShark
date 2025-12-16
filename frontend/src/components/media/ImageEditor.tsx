import React, { useState, useRef, useEffect } from 'react';
import { Save, X, RotateCw, RefreshCw } from 'lucide-react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import LoadingSpinner from '../common/LoadingSpinner';

export interface ImageEditorProps {
    imageUrl: string;
    aspectRatio?: number;
    onSave: (croppedImageData: string) => void;
    onCancel: () => void;
    className?: string;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
    imageUrl,
    aspectRatio,
    onSave,
    onCancel,
    className = ''
}) => {
    const cropperRef = useRef<ReactCropperElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState<number>(500);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Resize logic to keep the cropper within the viewport
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const containerWidth = containerRef.current.clientWidth;
                const viewportHeight = window.innerHeight;
                const maxHeight = Math.min(viewportHeight * 0.6, 600);

                // Default to square calculation if no aspect ratio
                const ratio = aspectRatio || 1;

                let calculatedHeight: number;
                if (ratio > 1) {
                    // Landscape
                    calculatedHeight = containerWidth / ratio;
                } else {
                    // Portrait or Square
                    calculatedHeight = Math.min(containerWidth / ratio, maxHeight);
                }

                setContainerHeight(Math.max(calculatedHeight, 300)); // Min height 300px
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, [aspectRatio]);

    const handleSave = () => {
        if (cropperRef.current?.cropper) {
            const croppedCanvas = cropperRef.current.cropper.getCroppedCanvas({
                maxWidth: 2048,
                maxHeight: 2048,
                fillColor: '#000',
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (croppedCanvas) {
                onSave(croppedCanvas.toDataURL('image/png'));
            }
        }
    };

    const handleRotate = () => {
        cropperRef.current?.cropper.rotate(90);
    };

    const handleReset = () => {
        cropperRef.current?.cropper.reset();
    };

    return (
        <div className={`flex flex-col gap-4 w-full ${className}`}>
            {/* Cropper Container */}
            <div
                ref={containerRef}
                className="relative w-full bg-black rounded-xl overflow-hidden shadow-lg border border-stone-800"
                style={{ height: `${containerHeight}px` }}
            >
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-stone-900/50">
                        <LoadingSpinner size={32} />
                    </div>
                )}

                <Cropper
                    ref={cropperRef}
                    src={imageUrl}
                    style={{ height: '100%', width: '100%' }}
                    aspectRatio={aspectRatio}
                    guides={true}
                    viewMode={1}
                    dragMode="move"
                    responsive={true}
                    checkOrientation={false} // Performance optimization
                    ready={() => setIsLoading(false)}
                />
            </div>

            {/* Controls */}
            <div className="flex justify-between items-center bg-stone-900/50 p-2 rounded-lg border border-stone-800">
                <div className="flex gap-2">
                    <button
                        onClick={handleRotate}
                        className="p-2 hover:bg-stone-700 rounded-lg text-stone-400 hover:text-white transition-colors tooltip-trigger"
                        title="Rotate 90°"
                    >
                        <RotateCw size={18} />
                    </button>
                    <button
                        onClick={handleReset}
                        className="p-2 hover:bg-stone-700 rounded-lg text-stone-400 hover:text-white transition-colors"
                        title="Reset"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-stone-800 rounded-lg text-stone-300 transition-colors"
                    >
                        <X size={18} />
                        <span>Cancel</span>
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all"
                    >
                        <Save size={18} />
                        <span>Save Changes</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

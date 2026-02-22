import React, { useState, useRef, useEffect } from 'react';
import { Save, X, RotateCw, RefreshCw } from 'lucide-react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import LoadingSpinner from '../common/LoadingSpinner';
import Button from '../common/Button';

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
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCw size={18} />}
                        onClick={handleRotate}
                        title="Rotate 90°"
                        className="tooltip-trigger"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw size={18} />}
                        onClick={handleReset}
                        title="Reset"
                    />
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="md"
                        icon={<X size={18} />}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        icon={<Save size={18} />}
                        onClick={handleSave}
                        className="px-6 shadow-lg hover:shadow-blue-500/20"
                    >
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>
    );
};

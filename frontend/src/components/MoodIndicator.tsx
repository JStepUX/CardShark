import React from 'react';
import { EmotionState, emotionColors } from '../hooks/useEmotionDetection';

interface MoodIndicatorProps {
  emotion: EmotionState;
  size?: number;
  showLabel?: boolean;
}

const MoodIndicator: React.FC<MoodIndicatorProps> = ({ 
  emotion, 
  size = 24, 
  showLabel = false 
}) => {
  // Get the emotion color
  const emotionColor = emotionColors[emotion.primary as keyof typeof emotionColors] || 
                      emotionColors.neutral;
  
  // Use intensity to blend between base and intense colors
  const blendFactor = emotion.intensity / 100;
  
  // Blend colors (directly in hexadecimal format for simplicity and visibility)
  const getBlendedColor = () => {
    // Pure 100% saturated colors for maximum visibility
    const baseColor = emotionColor.base;
    const intenseColor = emotionColor.intense;
    
    // Blend the colors based on intensity
    return blendFactor >= 0.5 ? intenseColor : baseColor;
  };

  return (
    <div className="flex items-center gap-2">
      <div 
        className="rounded-full border border-white/20 flex items-center justify-center"
        style={{ 
          width: size, 
          height: size,
          backgroundColor: getBlendedColor(),
          // Add a pulsing effect based on intensity
          boxShadow: `0 0 ${Math.round(emotion.intensity / 10)}px ${Math.round(emotion.intensity / 20)}px ${getBlendedColor()}`
        }}
      >
        {/* Optionally show the intensity as a percentage */}
        {size >= 30 && (
          <span className="text-[10px] text-white font-bold">
            {Math.round(emotion.intensity)}
          </span>
        )}
      </div>
      
      {/* Show emotion label only if requested */}
      {showLabel && (
        <span className="text-xs text-gray-300 capitalize">{emotion.primary}</span>
      )}
    </div>
  );
};

export default MoodIndicator;

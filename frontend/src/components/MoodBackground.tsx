import React, { useEffect, useState, useRef } from 'react';
import { EmotionState, emotionColors } from '../hooks/useEmotionDetection';

interface MoodBackgroundProps {
  emotion: EmotionState;
  backgroundUrl?: string | null;
  transparency: number; // 0-100
  fadeLevel: number; // 0-100
  children: React.ReactNode;
}

const MoodBackground: React.FC<MoodBackgroundProps> = ({
  emotion,
  backgroundUrl,
  transparency,
  fadeLevel,
  children
}) => {
  const [currentColor, setCurrentColor] = useState('rgba(28, 25, 23, 1)'); // Default background
  const animationRef = useRef<number>(0);
  const targetColorRef = useRef<string>(currentColor);

  // Generate color based on emotion
  useEffect(() => {
    // Get base and intense colors for the emotion
    const emotionColor = emotionColors[emotion.primary as keyof typeof emotionColors] || 
                          emotionColors.neutral;
    
    // Use intensity to blend between base and intense colors
    const blendFactor = emotion.intensity / 100;
    
    // Start with base color values
    const baseColor = hexToRgb(emotionColor.base);
    const intenseColor = hexToRgb(emotionColor.intense);
    
    if (!baseColor || !intenseColor) return;
    
    // EXTREME color enhancements for testing visibility
    // Boost saturation dramatically and use pure colors
    const saturationBoost = 2.0; // Doubled from previous 1.5
    const r = Math.min(255, Math.round((baseColor.r * (1 - blendFactor) + intenseColor.r * blendFactor) * saturationBoost));
    const g = Math.min(255, Math.round((baseColor.g * (1 - blendFactor) + intenseColor.g * blendFactor) * saturationBoost));
    const b = Math.min(255, Math.round((baseColor.b * (1 - blendFactor) + intenseColor.b * blendFactor) * saturationBoost));
    
    // Maximum opacity for testing
    const opacity = 0.85; // Almost completely opaque for testing
    
    // Set the target color
    targetColorRef.current = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    
    // Start the color transition animation if not already running
    if (!animationRef.current) {
      animateColorTransition();
    }
  }, [emotion]);

  // Smooth color transition animation
  const animateColorTransition = () => {
    const currentRgba = parseRgba(currentColor);
    const targetRgba = parseRgba(targetColorRef.current);
    
    if (!currentRgba || !targetRgba) {
      animationRef.current = 0;
      return;
    }
    
    // Calculate new color values with faster easing for quicker transitions
    const easingFactor = 0.15; // Increased from 0.05
    const newR = currentRgba.r + (targetRgba.r - currentRgba.r) * easingFactor;
    const newG = currentRgba.g + (targetRgba.g - currentRgba.g) * easingFactor;
    const newB = currentRgba.b + (targetRgba.b - currentRgba.b) * easingFactor;
    const newA = currentRgba.a + (targetRgba.a - currentRgba.a) * easingFactor;
    
    // Update current color
    const newColor = `rgba(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)}, ${newA.toFixed(4)})`;
    setCurrentColor(newColor);
    
    // Continue animation if we haven't reached the target
    const isComplete = Math.abs(newR - targetRgba.r) < 0.5 && 
                       Math.abs(newG - targetRgba.g) < 0.5 && 
                       Math.abs(newB - targetRgba.b) < 0.5 && 
                       Math.abs(newA - targetRgba.a) < 0.01;
                       
    if (!isComplete) {
      animationRef.current = requestAnimationFrame(animateColorTransition);
    } else {
      animationRef.current = 0;
    }
  };
  
  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Dark background base layer - LIGHTER for testing */}
      <div className="absolute inset-0 bg-stone-800"></div>
      
      {/* Background image layer (if provided) */}
      {backgroundUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
          style={{
            backgroundImage: `url(${backgroundUrl})`,
            filter: `blur(${fadeLevel / 3}px)`,
            opacity: 1 - transparency / 100
          }}
        />
      )}
      
      {/* Emotional color overlay with MAXIMUM visibility for testing */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          backgroundColor: currentColor,
          // Use a simple solid color for maximum visibility during testing
          backgroundImage: 'none',
          mixBlendMode: 'normal', // Normal blend mode for pure colors
          opacity: 1.0 // Full opacity
        }}
      />
      
      {/* Semi-transparent UI overlay that content will be placed on */}
      <div 
        className="absolute inset-0" 
        style={{
          backgroundColor: `rgba(28, 25, 23, ${1 - transparency / 100})`,
          // backdropFilter: `blur(${fadeLevel / 3}px)`, // Removed backdropFilter from UI overlay
          zIndex: 5 // Ensure this is above the color layer but below content
        }}      />
      
      {/* Content - ensure highest z-index */}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};

// Helper functions for color conversion
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function parseRgba(rgba: string) {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
  return match ? {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : 1
  } : null;
}

export default MoodBackground;
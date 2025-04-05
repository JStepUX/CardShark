// hooks/useEmotionDetection.ts
import { useState, useEffect } from 'react';
import { Message } from '../types/messages';

// Emotion interface with intensity
export interface EmotionState {
  primary: string;
  secondary?: string;
  intensity: number; // 0-100
  valence: number; // -100 to 100 (negative to positive)
  arousal: number; // 0-100 (calm to excited)
}

// Color mapping for different emotions
export const emotionColors = {
  happy: { base: '#4ade80', intense: '#16a34a' },
  sad: { base: '#60a5fa', intense: '#2563eb' },
  angry: { base: '#f87171', intense: '#dc2626' },
  scared: { base: '#a78bfa', intense: '#7c3aed' },
  disgusted: { base: '#84cc16', intense: '#65a30d' },
  surprised: { base: '#facc15', intense: '#ca8a04' },
  neutral: { base: '#94a3b8', intense: '#64748b' },
  loving: { base: '#fb7185', intense: '#e11d48' },
  curious: { base: '#38bdf8', intense: '#0284c7' },
  confused: { base: '#c084fc', intense: '#9333ea' },
  anxious: { base: '#fbbf24', intense: '#d97706' }
};

export function useEmotionDetection(messages: Message[], characterName?: string) {
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>({
    primary: 'neutral',
    intensity: 50,
    valence: 0,
    arousal: 50
  });

  // Detect emotions from message content
  useEffect(() => {
    // Only process if there are messages and we know the character's name
    if (!messages.length || !characterName) return;

    // Get the most recent assistant message
    const recentMessages = [...messages].reverse();
    const lastCharacterMessage = recentMessages.find(
      msg => msg.role === 'assistant'
    );

    if (!lastCharacterMessage) return;

    // Simple emotion detection from content
    // In a real implementation, you could use a more sophisticated sentiment analysis
    // or explicitly ask the LLM to include emotion data in responses
    detectEmotion(lastCharacterMessage.content).then(emotion => {
      // Only update if the emotion changed significantly
      if (
        emotion.primary !== currentEmotion.primary ||
        Math.abs(emotion.intensity - currentEmotion.intensity) > 10
      ) {
        // Smooth transition to new emotion
        setCurrentEmotion(prev => ({
          ...emotion,
          // Blend slightly with previous emotion for smoother transitions
          intensity: (prev.intensity * 0.3) + (emotion.intensity * 0.7),
          valence: (prev.valence * 0.3) + (emotion.valence * 0.7),
          arousal: (prev.arousal * 0.3) + (emotion.arousal * 0.7)
        }));
      }
    });
  }, [messages, characterName, currentEmotion.primary, currentEmotion.intensity]); // Added dependencies to prevent stale closures

  // Emotion detection function - in production this could use a more sophisticated approach
  const detectEmotion = async (content: string): Promise<EmotionState> => {
    // Check for explicit emotion indicators
    const lowerContent = content.toLowerCase();
    
    // Enhanced keyword matching with more terms and contextual patterns
    const emotionPatterns = {
      happy: ['happy', 'joy', 'delighted', 'pleased', 'smile', 'grin', 'laugh', 'chuckle', 'giggle',
              'playful', 'cheerful', 'bright', 'warm', 'warmly', 'glad', 'enjoying', 'amused', 'bliss',
              'pleasant', 'elated', 'gleeful', 'beaming', 'radiant', 'sparkling'],
      sad: ['sad', 'upset', 'disappointed', 'sorrow', 'cry', 'tears', 'sigh', 'frown', 'downcast',
            'gloomy', 'melancholy', 'depressed', 'miserable', 'somber', 'unhappy', 'hurt', 'heartbroken',
            'regret', 'grief', 'mourn', 'teary'],
      angry: ['angry', 'mad', 'furious', 'irritated', 'rage', 'glare', 'annoyed', 'frustrated',
              'agitated', 'hostile', 'bitter', 'resentful', 'incensed', 'indignant', 'seething',
              'livid', 'enraged', 'snapped', 'scowl', 'fuming', 'growl'],
      scared: ['scared', 'afraid', 'fearful', 'terrified', 'tremble', 'shiver', 'cower', 'dread',
               'panic', 'horrified', 'frightened', 'anxious', 'worried', 'threatened', 'spooked',
               'startled', 'alarmed', 'unnerved', 'timid'],
      disgusted: ['disgusted', 'repulsed', 'revolted', 'gross', 'nauseated', 'offended', 'appalled',
                  'sickened', 'distaste', 'aversion', 'loathe', 'detest', 'repugnant', 'yuck', 'ew'],
      surprised: ['surprised', 'shocked', 'astonished', 'gasp', 'amazed', 'stunned', 'startled',
                  'bewildered', 'disbelief', 'jaw dropped', 'eyes wide', 'blinked', 'wide-eyed'],
      loving: ['love', 'adore', 'fond', 'affection', 'care', 'tender', 'sweet', 'cherish', 'devoted',
               'gentle', 'intimate', 'compassion', 'passionate', 'infatuated', 'enchanted', 'embraced',
               'caressed', 'admire', 'longing', 'desire'],
      curious: ['curious', 'interested', 'intrigued', 'wonder', 'fascinated', 'inquisitive', 'piqued',
                'exploring', 'questioning', 'speculating', 'pondering', 'inquiring', 'puzzling',
                'captivated', 'investigating', 'drawn to'],
      confused: ['confused', 'puzzled', 'perplexed', 'uncertain', 'baffled', 'disoriented', 'lost',
                 'mystified', 'unsure', 'doubtful', 'bemused', 'hesitant', 'clueless', 'ambivalent',
                 'conflicted', 'dazed', 'muddled'],
      anxious: ['anxious', 'nervous', 'worried', 'uneasy', 'tense', 'distressed', 'apprehensive',
                'fretting', 'concerned', 'troubled', 'restless', 'agitated', 'stressed', 'jittery',
                'uncomfortable', 'fidgeting', 'pacing']
    };

    // Check for sentence patterns that indicate emotions
    const emotionalPatterns = [
      { pattern: /smil(e|es|ed|ing)\s+warmly/i, emotion: 'happy', weight: 2 },
      { pattern: /eyes\s+sparkling/i, emotion: 'happy', weight: 2 },
      { pattern: /grin(s|ned|ning)\s+playfully/i, emotion: 'happy', weight: 2 },
      { pattern: /thank\s+you/i, emotion: 'happy', weight: 1 },
      { pattern: /blush(es|ed|ing)/i, emotion: 'loving', weight: 1.5 },
      { pattern: /tear(s)?\s+(well|welling|form)/i, emotion: 'sad', weight: 2 },
      { pattern: /voice\s+(soft|gentle|warm)/i, emotion: 'loving', weight: 1 },
      { pattern: /eyes\s+(narrow|narrowed|narrowing)/i, emotion: 'angry', weight: 1.5 },
    ];

    // Initialize emotion counts
    let emotionCounts: Record<string, number> = {};
    Object.keys(emotionPatterns).forEach(emotion => {
      emotionCounts[emotion] = 0;
    });

    // Count keyword matches
    Object.entries(emotionPatterns).forEach(([emotion, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) {
          emotionCounts[emotion] += 1;
        }
      });
    });

    // Add weights from pattern matches
    emotionalPatterns.forEach(({pattern, emotion, weight}) => {
      if (pattern.test(content)) {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + weight * 3;
      }
    });

    // Find primary emotion
    let primary = 'neutral';
    let maxCount = 0;
    
    Object.entries(emotionCounts).forEach(([emotion, count]) => {
      if (count > maxCount) {
        maxCount = count;
        primary = emotion;
      }
    });

    // If no emotions detected, default to neutral
    if (maxCount === 0) {
      primary = 'neutral';
    }

    // Calculate intensity based on detected patterns (more sensitive scale)
    const intensity = Math.min(100, Math.max(40, maxCount * 15 + 40));

    // Calculate valence (positive/negative) and arousal (active/passive)
    const valenceMap: Record<string, number> = {
      happy: 80, sad: -70, angry: -50, scared: -60,
      disgusted: -40, surprised: 30, neutral: 0,
      loving: 90, curious: 40, confused: -20, anxious: -30
    };

    const arousalMap: Record<string, number> = {
      happy: 60, sad: 20, angry: 80, scared: 70,
      disgusted: 50, surprised: 70, neutral: 30,
      loving: 50, curious: 60, confused: 40, anxious: 70
    };

    return {
      primary,
      intensity,
      valence: valenceMap[primary] || 0,
      arousal: arousalMap[primary] || 50
    };
  };

  return { currentEmotion };
}
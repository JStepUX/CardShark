import React from 'react';
import MoodBackground from '../MoodBackground';
import { useEmotionDetection } from '../../hooks/useEmotionDetection';
import { Message } from '../../types/messages';
import { BackgroundSettings } from './ChatBackgroundSettings';

interface ChatBackgroundLayerProps {
  backgroundSettings: BackgroundSettings;
  messages: Message[];
  characterName: string;
}

const ChatBackgroundLayer: React.FC<ChatBackgroundLayerProps> = ({
  backgroundSettings,
  messages,
  characterName,
}) => {
  // Use the emotion detection hook
  const { currentEmotion: emotion } = useEmotionDetection(messages, characterName);

  return (
    <div className="absolute inset-0 z-0">
      {backgroundSettings.moodEnabled ? (
        <MoodBackground
          emotion={emotion}
          backgroundUrl={backgroundSettings.background?.url}
          transparency={backgroundSettings.transparency}
          fadeLevel={backgroundSettings.fadeLevel}
        >
          <></>
        </MoodBackground>
      ) : backgroundSettings.background?.url ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
          style={{
            backgroundImage: `url(${backgroundSettings.background.url})`,
            opacity: 1 - (backgroundSettings.transparency / 100),
            filter: `blur(${backgroundSettings.fadeLevel / 3}px)`,
          }}
        />
      ) : null}
    </div>
  );
};

export default ChatBackgroundLayer;

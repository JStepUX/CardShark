import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { VariableSizeList as List } from 'react-window';
import { Message, UserProfile } from '../types/messages';
import ChatBubble from './chat/ChatBubble';
import ThoughtBubble from './ThoughtBubble';

interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
}

export interface VirtualChatListRef {
  scrollToBottom: () => void;
}

interface VirtualChatListProps {
  messages: Message[];
  characterName: string;
  currentUser?: UserProfile;
  isGenerating: boolean;
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;
  onTryAgain: (message: Message) => void;
  onContinue: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onContentChange: (messageId: string, newContent: string) => void;
  onStop: (message: Message) => (() => void) | undefined;
  isFirstMessage: (messageId: string) => boolean;
  onRegenerateGreeting: () => void;
  isRegeneratingGreeting: boolean;
  onNextVariation: (messageId: string) => void;
  onPrevVariation: (messageId: string) => void;
  height?: number;
}

const VirtualChatList = forwardRef<VirtualChatListRef, VirtualChatListProps>(({ 
  messages, 
  characterName,
  currentUser,
  isGenerating,
  generatingId,
  reasoningSettings,
  onTryAgain,
  onContinue,
  onDelete,
  onContentChange,
  onStop,
  isFirstMessage,
  onRegenerateGreeting,
  isRegeneratingGreeting,
  onNextVariation,
  onPrevVariation,
  height = 600
}, ref) => {
  const listRef = useRef<List>(null);

  // Expose scroll methods via ref
  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (listRef.current && messages.length > 0) {
        listRef.current.scrollToItem(messages.length - 1, "end");
      }
    }
  }), [messages.length]);
 // Calculate dynamic item height based on content for better performance
 const getItemSize = (index: number): number => {
   const message = messages[index];
   if (!message) return 180; // Default fallback
   
   // Base height for message structure
   let baseHeight = 120;
   
   // Add height based on content length (consider different character widths)
   const contentLength = message.content?.length || 0;
   const averageCharWidth = 8; // More realistic average
   const containerWidth = 600; // Approximate container width
   const charsPerLine = Math.floor(containerWidth / averageCharWidth);
   const estimatedLines = Math.ceil(contentLength / charsPerLine);
   const contentHeight = Math.max(1, estimatedLines) * 24; // 24px per line
   
   // Add extra height for thinking messages
   if (message.role === 'thinking' && reasoningSettings.visible) {
     baseHeight += 40; // Extra space for thinking bubble styling
   }
   
   // Add extra height for assistant messages with controls
   if (message.role === 'assistant') {
     baseHeight += 30; // Space for action buttons
   }
   
   return Math.min(baseHeight + contentHeight, 800); // Cap at 800px max
 };

  const Row = useMemo(() => {
    return ({ index, style }: { index: number; style: React.CSSProperties }) => {      const message = messages[index];
      return (        <div style={style} className="px-4">
          <React.Fragment key={message.id}>{message.role === 'thinking' && reasoningSettings.visible ? (
              <ThoughtBubble
                message={message}
                isGenerating={message.status === 'streaming'}
                onContentChange={(newContent) => onContentChange(message.id, newContent)}
                onDelete={() => onDelete(message.id)}
                characterName={characterName}
              />
            ) : null}
            {message.role !== 'thinking' && (
              <ChatBubble
                message={message}
                characterName={characterName}
                currentUser={currentUser}
                isGenerating={isGenerating && generatingId === message.id}
                onTryAgain={() => onTryAgain(message)}
                onContinue={() => onContinue(message)}
                onDelete={() => onDelete(message.id)}
                onContentChange={(newContent) => onContentChange(message.id, newContent)}
                onStop={onStop(message)}
                isFirstMessage={isFirstMessage(message.id)}
                onRegenerateGreeting={onRegenerateGreeting}
                isRegeneratingGreeting={isRegeneratingGreeting && isFirstMessage(message.id)}
                onNextVariation={() => onNextVariation(message.id)}
                onPrevVariation={() => onPrevVariation(message.id)}
              />
            )}
          </React.Fragment>
        </div>
      );
    };
  }, [
    messages, 
    characterName, 
    currentUser, 
    isGenerating, 
    generatingId, 
    reasoningSettings,
    onTryAgain,
    onContinue,
    onDelete,
    onContentChange,
    onStop,
    isFirstMessage,
    onRegenerateGreeting,
    isRegeneratingGreeting,
    onNextVariation,
    onPrevVariation
  ]);  return (
    <List
      ref={listRef}
      height={height}
      width="100%"
      itemCount={messages.length}
      itemSize={getItemSize} // Use dynamic sizing for better performance      overscanCount={3} // Reduced for better performance
      className=""
    >
      {Row}
    </List>
  );
});

VirtualChatList.displayName = 'VirtualChatList';

export default VirtualChatList;

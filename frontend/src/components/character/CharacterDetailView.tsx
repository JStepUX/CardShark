/**
 * @file CharacterDetailView.tsx
 * @description Tabbed container for character-scoped views at /character/:uuid.
 * Tabs: Chat (default), Info, Greetings, Lore.
 * Loads character data by UUID if not already in context (direct URL navigation).
 */
import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, FileText, MessageSquare, Book, Save, Loader2 } from 'lucide-react';
import { useCharacter } from '../../contexts/CharacterContext';
import { ChatProvider } from '../../contexts/ChatContext';
import { useAPIConfig } from '../../contexts/APIConfigContext';
import { ImageHandlerProvider } from '../../contexts/ImageHandlerContext';
import HighlightStylesUpdater from '../tiptap/HighlightStylesUpdater';
import LoadingSpinner from '../common/LoadingSpinner';

// Lazy load tab content
const ChatView = lazy(() => import('../chat/ChatView'));
const CharacterInfoView = lazy(() => import('./CharacterInfoView'));
const MessagesView = lazy(() => import('../MessagesView'));
const LoreView = lazy(() => import('../LoreView'));

const TABS = [
  { id: 'chat', label: 'Chat', Icon: MessageCircle },
  { id: 'info', label: 'Info', Icon: FileText },
  { id: 'greetings', label: 'Greetings', Icon: MessageSquare },
  { id: 'lore', label: 'Lore', Icon: Book },
] as const;

type TabId = typeof TABS[number]['id'];

const CharacterDetailView: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    characterData,
    setCharacterData,
    setImageUrl,
    isLoading: contextLoading,
    setIsLoading,
    hasUnsavedChanges,
    saveCharacter,
    isGeneratingThinFrame,
  } = useCharacter();
  const { apiConfig } = useAPIConfig();

  const [loadError, setLoadError] = useState<string | null>(null);

  // Tab from URL param, default to 'chat'
  const activeTab = (searchParams.get('tab') as TabId) || 'chat';
  const setActiveTab = useCallback((tab: TabId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'chat') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Check if current character matches the URL UUID
  const currentUuid = characterData?.data?.character_uuid;
  const needsLoad = uuid && currentUuid !== uuid;

  // Load character data by UUID if not already loaded
  useEffect(() => {
    if (!needsLoad || !uuid) return;

    let cancelled = false;

    const loadCharacter = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        // Fetch metadata
        const metaRes = await fetch(`/api/character/${uuid}`);
        if (!metaRes.ok) {
          throw new Error(metaRes.status === 404
            ? 'Character not found'
            : `Failed to load character (${metaRes.status})`);
        }
        const metaJson = await metaRes.json();
        const metadata = metaJson.data || metaJson;

        // Fetch image
        const imgRes = await fetch(`/api/character-image/${uuid}`);
        if (cancelled) return;

        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const newImageUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setCharacterData(metadata);
            setImageUrl(newImageUrl);
          }
        } else {
          // Character loaded but image failed — still show data
          if (!cancelled) {
            setCharacterData(metadata);
            setImageUrl(undefined);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load character');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadCharacter();
    return () => { cancelled = true; };
  }, [uuid, needsLoad, setCharacterData, setImageUrl, setIsLoading]);

  const characterName = characterData?.data?.name || 'Character';

  // Read session param for history navigation (load specific chat session)
  const sessionId = searchParams.get('session');
  // Read folder param for back navigation (Gallery → Folder → Character → back)
  const fromFolder = searchParams.get('folder');
  const backTo = fromFolder ? `/gallery?folder=${encodeURIComponent(fromFolder)}` : '/gallery';

  // Render tab content
  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        return (
          <ChatProvider initialSessionId={sessionId || undefined}>
            <HighlightStylesUpdater />
            <ChatView />
          </ChatProvider>
        );
      case 'info':
        return (
          <ImageHandlerProvider>
            <CharacterInfoView />
          </ImageHandlerProvider>
        );
      case 'greetings':
        return <MessagesView />;
      case 'lore':
        return <LoreView />;
      default:
        return null;
    }
  }, [activeTab, sessionId]);

  // Loading state
  if (contextLoading && needsLoad) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading character..." />
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-red-400">{loadError}</p>
        <button
          onClick={() => navigate(backTo)}
          className="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: back arrow + character name + tabs */}
      <div className="flex-none bg-stone-900 border-b border-stone-700">
        <div className="flex items-center gap-3 px-4 pt-3 pb-0">
          <button
            onClick={() => navigate(backTo)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
            title={fromFolder ? `Back to ${fromFolder}` : 'Back to Gallery'}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-white truncate">{characterName}</h1>

          {/* Character-level Save button — always visible, subtle outline when clean, filled when dirty */}
          <button
            onClick={() => saveCharacter(apiConfig ? (apiConfig as unknown as Record<string, unknown>) : undefined)}
            disabled={isGeneratingThinFrame}
            className={`ml-auto flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isGeneratingThinFrame
                ? 'bg-green-800 text-white cursor-wait'
                : hasUnsavedChanges
                  ? 'bg-green-700 text-white hover:bg-green-600'
                  : 'border border-orange-700 text-orange-500 hover:text-orange-400 hover:border-orange-600'
            }`}
            title={isGeneratingThinFrame ? "Generating character profile..." : "Save character"}
          >
            {isGeneratingThinFrame ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-4 mt-2">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:border-stone-600'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner size="lg" text="Loading..." />
          </div>
        }>
          {tabContent}
        </Suspense>
      </div>
    </div>
  );
};

export default CharacterDetailView;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, UserPlus, MessageSquare, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { useCharacter } from '../../contexts/CharacterContext';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import CharacterAssignDialog from './CharacterAssignDialog';
import { toast } from 'sonner';
import Button from '../common/Button';

interface ChatHistoryItem {
    chat_session_uuid: string;
    title: string | null;
    message_count: number;
    last_message_time: string | null;
    start_time: string;
    character_uuid: string;
    character_name: string | null;
    character_thumbnail: string | null;
}

/**
 * ChatHistoryView - Displays recent chats across all characters
 * Allows loading, deleting, and reassigning chats to different characters
 */
const ChatHistoryView: React.FC = () => {
    const navigate = useNavigate();
    const { setCharacterData, setImageUrl } = useCharacter();

    const [historyItems, setHistoryItems] = useState<ChatHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<ChatHistoryItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Assign dialog state
    const [assignTarget, setAssignTarget] = useState<ChatHistoryItem | null>(null);

    const loadHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiService.getChatHistory(50);
            if (response?.data) {
                setHistoryItems(response.data);
            } else {
                setHistoryItems([]);
            }
        } catch (err) {
            console.error('Failed to load chat history:', err);
            setError('Failed to load chat history. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Format date/time for display
    const formatDateTime = (dateString: string | null): string => {
        if (!dateString) return 'Unknown';

        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Today - show time
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    // Get thumbnail URL - prefer UUID-based endpoint for reliability
    const getThumbnailUrl = (item: ChatHistoryItem): string => {
        // Prefer UUID-based image loading (more reliable)
        if (item.character_uuid) {
            return `/api/character-image/${item.character_uuid}`;
        }
        // Fallback to path-based if no UUID
        if (item.character_thumbnail) {
            const encodedPath = encodeURIComponent(item.character_thumbnail.replace(/\\/g, '/'));
            return `/api/character-image/${encodedPath}`;
        }
        return '';
    };

    // Handle clicking on a chat row to load it
    const handleLoadChat = async (item: ChatHistoryItem) => {
        try {
            // Check if the character exists using the correct endpoint
            const charResponse = await fetch(`/api/character/${item.character_uuid}`);

            if (!charResponse.ok) {
                // Character not found - this is an orphaned chat
                console.warn('Character not found for chat, opening assignment dialog');
                toast.warning(`Character "${item.character_name || 'Unknown'}" not found. Please assign this chat to a character.`);
                setAssignTarget(item);
                return;
            }

            const charData = await charResponse.json();
            const metadata = charData.data || charData;
            setCharacterData(metadata);

            // Load character image
            const imageResponse = await fetch(`/api/character-image/${item.character_uuid}`);
            if (imageResponse.ok) {
                const blob = await imageResponse.blob();
                const imageUrl = URL.createObjectURL(blob);
                setImageUrl(imageUrl);
            }

            // Navigate to character detail view with session param
            navigate(`/character/${item.character_uuid}?session=${item.chat_session_uuid}`);
        } catch (err) {
            console.error('Failed to load chat:', err);
            toast.error('Failed to load this chat');
        }
    };

    // Handle delete button click
    const handleDeleteClick = (e: React.MouseEvent, item: ChatHistoryItem) => {
        e.stopPropagation();
        setDeleteTarget(item);
    };

    // Confirm delete
    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            await apiService.deleteChatById(deleteTarget.chat_session_uuid);
            setHistoryItems(prev => prev.filter(item => item.chat_session_uuid !== deleteTarget.chat_session_uuid));
            toast.success('Chat deleted successfully');
        } catch (err) {
            console.error('Failed to delete chat:', err);
            toast.error('Failed to delete chat');
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    // Handle assign button click
    const handleAssignClick = (e: React.MouseEvent, item: ChatHistoryItem) => {
        e.stopPropagation();
        setAssignTarget(item);
    };

    // Handle character assignment
    const handleAssignComplete = (updatedItem: ChatHistoryItem) => {
        // Update local state immediately for responsiveness
        setHistoryItems(prev => prev.map(item =>
            item.chat_session_uuid === updatedItem.chat_session_uuid ? updatedItem : item
        ));
        setAssignTarget(null);
        toast.success('Chat reassigned successfully');
        // Auto-refresh to ensure thumbnail and other data is current
        loadHistory();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-4">
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <p>{error}</p>
                <Button
                    variant="primary"
                    onClick={loadHistory}
                >
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-8 pb-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-orange-500" />
                        Chat History
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw className="w-5 h-5" />}
                        onClick={loadHistory}
                        title="Refresh"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-8">
                {historyItems.length === 0 ? (
                    <div className="text-center text-stone-400 py-12">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>No chat history found</p>
                        <p className="text-sm mt-2">Start chatting with a character to see history here</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {historyItems.map((item) => (
                            <div
                                key={item.chat_session_uuid}
                                onClick={() => handleLoadChat(item)}
                                className="flex items-center gap-4 p-3 bg-stone-800/50 hover:bg-stone-700/70 rounded-lg cursor-pointer transition-colors group border border-stone-700/50"
                            >
                                {/* Character Thumbnail */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-700 flex-shrink-0">
                                    {item.character_uuid ? (
                                        <img
                                            src={getThumbnailUrl(item)}
                                            alt={item.character_name || 'Character'}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-stone-500">
                                            <MessageSquare className="w-6 h-6" />
                                        </div>
                                    )}
                                </div>

                                {/* Chat Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate">
                                            {item.title || 'Untitled Chat'}
                                        </span>
                                        <span className="text-xs text-stone-500 flex-shrink-0">
                                            with {item.character_name || 'Unknown Character'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-stone-400 mt-1">
                                        <span className="flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" />
                                            {item.message_count} messages
                                        </span>
                                        <span>{formatDateTime(item.last_message_time || item.start_time)}</span>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={<UserPlus className="w-4 h-4" />}
                                        onClick={(e) => handleAssignClick(e, item)}
                                        title="Assign to different character"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={<Trash2 className="w-4 h-4" />}
                                        onClick={(e) => handleDeleteClick(e, item)}
                                        title="Delete chat"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Delete Confirmation Dialog */}
                <DeleteConfirmationDialog
                    isOpen={deleteTarget !== null}
                    onCancel={() => setDeleteTarget(null)}
                    onConfirm={handleConfirmDelete}
                    title="Delete Chat"
                    description={`Are you sure you want to delete this chat? This action cannot be undone.`}
                    itemName={deleteTarget?.title || 'Untitled Chat'}
                    isDeleting={isDeleting}
                />

                {/* Character Assign Dialog */}
                {assignTarget && (
                    <CharacterAssignDialog
                        isOpen={true}
                        onClose={() => setAssignTarget(null)}
                        chatItem={assignTarget}
                        onAssignComplete={handleAssignComplete}
                    />
                )}
            </div>
        </div>
    );
};

export default ChatHistoryView;

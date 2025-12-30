/**
 * @file RoomContext.tsx
 * @description Context for managing room card data in the Room Editor.
 * This is analogous to CharacterContext but for room cards.
 * @dependencies roomApi
 * @consumers RoomEditor
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { RoomCard, UpdateRoomRequest } from '../types/room';
import { roomApi } from '../api/roomApi';

interface RoomContextType {
    roomData: RoomCard | null;
    setRoomData: React.Dispatch<React.SetStateAction<RoomCard | null>>;
    isLoading: boolean;
    error: string | null;
    isSaving: boolean;
    saveRoom: () => Promise<boolean>;
    roomUuid: string;
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
    saveStatus: 'idle' | 'success' | 'error';
}

const RoomContext = createContext<RoomContextType | null>(null);

/**
 * Hook to access room context
 * @throws Error if used outside of RoomProvider
 */
export function useRoom() {
    const ctx = useContext(RoomContext);
    if (!ctx) {
        throw new Error('useRoom must be used within a RoomProvider');
    }
    return ctx;
}

interface RoomProviderProps {
    roomUuid: string;
    children: React.ReactNode;
}

/**
 * Provider component for room editing context.
 * Handles loading, saving, and state management for room cards.
 */
export function RoomProvider({ roomUuid, children }: RoomProviderProps) {
    const [roomData, setRoomData] = useState<RoomCard | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // Ref to track if initial load has completed
    const initialLoadComplete = useRef(false);

    // Load room data on mount or when roomUuid changes
    useEffect(() => {
        async function loadRoom() {
            if (!roomUuid) {
                setError('No room UUID provided');
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                setError(null);
                const card = await roomApi.getRoom(roomUuid);
                setRoomData(card);
                initialLoadComplete.current = true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load room');
            } finally {
                setIsLoading(false);
            }
        }

        loadRoom();
    }, [roomUuid]);

    // Track changes after initial load
    useEffect(() => {
        if (!initialLoadComplete.current || !roomData) return;

        // Use a short delay to batch multiple rapid changes
        const timer = setTimeout(() => {
            setHasUnsavedChanges(true);
        }, 500);

        return () => clearTimeout(timer);
    }, [roomData]);

    // Save room data
    const saveRoom = useCallback(async (): Promise<boolean> => {
        if (!roomData) return false;

        try {
            setIsSaving(true);
            setSaveStatus('idle');
            setError(null);

            const updateRequest: UpdateRoomRequest = {
                name: roomData.data.name,
                description: roomData.data.description,
                first_mes: roomData.data.first_mes,
                system_prompt: roomData.data.system_prompt,
                character_book: roomData.data.character_book,
                tags: roomData.data.tags,
                npcs: roomData.data.extensions.room_data.npcs,
            };

            await roomApi.updateRoom(roomUuid, updateRequest);

            setSaveStatus('success');
            setHasUnsavedChanges(false);

            // Reset success status after 2 seconds
            setTimeout(() => setSaveStatus('idle'), 2000);

            return true;
        } catch (err) {
            setSaveStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to save room');
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [roomData, roomUuid]);

    const value: RoomContextType = {
        roomData,
        setRoomData,
        isLoading,
        error,
        isSaving,
        saveRoom,
        roomUuid,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        saveStatus,
    };

    return (
        <RoomContext.Provider value={value}>
            {children}
        </RoomContext.Provider>
    );
}

export default RoomContext;

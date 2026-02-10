// frontend/src/components/world/EditorHeader.tsx
// Breadcrumb header for the world editor with back, save, and dirty indicator.

import { ArrowLeft, Save, ChevronRight } from 'lucide-react';

interface EditorHeaderProps {
    worldName: string;
    worldDescription?: string;
    roomName?: string;
    editorView: 'world' | 'room';
    isDirty: boolean;
    onBack: () => void;
    onSave: () => void;
    onNavigateToWorld?: () => void;
}

export function EditorHeader({
    worldName,
    worldDescription,
    roomName,
    editorView,
    isDirty,
    onBack,
    onSave,
    onNavigateToWorld,
}: EditorHeaderProps) {
    return (
        <div className="bg-[#141414] border-b border-[#2a2a2a] px-3 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2 shrink-0 z-30 relative">
            <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                <button
                    onClick={editorView === 'room' && onNavigateToWorld ? onNavigateToWorld : onBack}
                    className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors shrink-0"
                    title={editorView === 'room' ? 'Back to world grid' : 'Go back'}
                >
                    <ArrowLeft size={20} className="text-gray-400" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm md:text-base font-medium">
                        {editorView === 'room' ? (
                            <>
                                <button
                                    onClick={onNavigateToWorld}
                                    className="text-gray-400 hover:text-white transition-colors truncate max-w-[200px]"
                                >
                                    {worldName}
                                </button>
                                <ChevronRight size={14} className="text-gray-600 shrink-0" />
                                <span className="truncate">{roomName || 'Untitled Room'}</span>
                            </>
                        ) : (
                            <span className="truncate">{worldName}</span>
                        )}
                    </div>
                    {editorView === 'world' && worldDescription && (
                        <p className="text-xs md:text-sm text-gray-500 truncate hidden sm:block">{worldDescription}</p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {isDirty && (
                    <span className="text-xs text-yellow-500 mr-2">Unsaved</span>
                )}
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                    <Save size={16} />
                    <span className="text-sm">Save</span>
                </button>
            </div>
        </div>
    );
}

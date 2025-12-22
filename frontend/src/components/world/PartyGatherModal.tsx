/**
 * @file PartyGatherModal.tsx
 * @description Modal prompt when navigating with an active NPC
 * @inspiration "You must gather your party before venturing forth..." - Baldur's Gate
 */
import { X } from 'lucide-react';

interface PartyGatherModalProps {
    npcName: string;
    destinationRoomName: string;
    onBringAlong: () => void;
    onLeaveHere: () => void;
    onClose: () => void;
}

export function PartyGatherModal({
    npcName,
    destinationRoomName,
    onBringAlong,
    onLeaveHere,
    onClose
}: PartyGatherModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-purple-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4">
                {/* Header */}
                <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">
                        Gather Your Party
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6">
                    <p className="text-gray-300 text-center italic mb-2">
                        "You must gather your party before venturing forth..."
                    </p>
                    <p className="text-gray-400 text-center mt-4">
                        Bring <span className="text-purple-400 font-semibold">{npcName}</span> with you to{' '}
                        <span className="text-blue-400 font-semibold">{destinationRoomName}</span>?
                    </p>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-800 px-6 py-4 flex gap-3">
                    <button
                        onClick={onLeaveHere}
                        className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        Stay Here
                    </button>
                    <button
                        onClick={onBringAlong}
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-semibold"
                    >
                        Come Along
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PartyGatherModal;

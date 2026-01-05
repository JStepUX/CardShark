/**
 * @file PartyGatherModal.tsx
 * @description Modal prompt when navigating with an active NPC
 * @inspiration "You must gather your party before venturing forth..." - Baldur's Gate
 */
import { Dialog } from '../common/Dialog';

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
        <Dialog
            isOpen={true}
            onClose={onClose}
            title="Gather Your Party"
            showHeaderCloseButton={true}
            className="max-w-md w-full border border-purple-500/30"
            backgroundColor="bg-[#1a1a1a]"
            borderColor="border-gray-800"
            backdropClassName="bg-black/70 backdrop-blur-sm"
            buttons={[
                {
                    label: 'Stay Here',
                    onClick: onLeaveHere,
                    variant: 'secondary',
                    className: 'flex-1 bg-stone-700 hover:bg-stone-600'
                },
                {
                    label: 'Come Along',
                    onClick: onBringAlong,
                    variant: 'primary',
                    className: 'flex-1 bg-purple-600 hover:bg-purple-700 font-semibold'
                }
            ]}
        >
            <p className="text-gray-300 text-center italic mb-2">
                "You must gather your party before venturing forth..."
            </p>
            <p className="text-gray-400 text-center mt-4">
                Bring <span className="text-purple-400 font-semibold">{npcName}</span> with you to{' '}
                <span className="text-blue-400 font-semibold">{destinationRoomName}</span>?
            </p>
        </Dialog>
    );
}

export default PartyGatherModal;

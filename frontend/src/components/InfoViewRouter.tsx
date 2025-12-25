import React from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useNavigate } from 'react-router-dom';
import CharacterInfoView from './character/CharacterInfoView';
import WorldEditor from '../views/WorldEditor';

/**
 * Smart router that renders the appropriate view based on card type
 * - For world cards: renders WorldEditor (build view)
 * - For character cards: renders CharacterInfoView (basic info & greetings)
 */
const InfoViewRouter: React.FC = () => {
    const { characterData } = useCharacter();
    const navigate = useNavigate();

    // Check if this is a world card
    const isWorldCard = characterData?.data?.extensions?.card_type === 'world';
    const worldId = characterData?.data?.character_uuid;

    if (isWorldCard && worldId) {
        return (
            <WorldEditor
                worldId={worldId}
                onBack={() => navigate('/gallery')}
            />
        );
    }

    // Default to character info view
    return <CharacterInfoView />;
};

export default InfoViewRouter;

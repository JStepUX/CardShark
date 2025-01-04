import React, { useMemo } from 'react';
import { CharacterData } from '../contexts/CharacterContext';

interface TokenCounterProps {
  characterData: CharacterData | null;
}

// Simple GPT-3 style token counting (approximate)
const countTokens = (text: string | undefined): number => {
  if (!text) return 0;
  // Split on whitespace and punctuation
  const tokens = text.toLowerCase()
    .replace(/[^\w\s']|'(?!\w)|'(?=$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length;
};

// Individual field token counts - returns [fieldName, count] pairs
export const getFieldTokenCounts = (characterData: CharacterData | null): [string, number][] => {
  if (!characterData?.data) return [];
  
  const fields = [
    'name',
    'description', 
    'scenario',
    'personality',
    'mes_example',
    'system_prompt'
  ] as const;

  return fields.map(field => [
    field,
    countTokens(characterData.data[field])
  ]);
};

const TokenCounter: React.FC<TokenCounterProps> = ({ characterData }) => {
  const totalTokens = useMemo(() => {
    if (!characterData?.data) return 0;

    const fields = [
      'name',
      'description', 
      'scenario',
      'personality',
      'mes_example',
      'system_prompt',
      'first_mes'
    ] as const;

    // Debug logging for each field
    const fieldCounts = fields.reduce((counts, field) => {
      const text = characterData.data[field] || '';
      const tokens = countTokens(text);
      console.log(`Field ${field}: "${text}" = ${tokens} tokens`);
      counts[field] = tokens;
      return counts;
    }, {} as Record<string, number>);

    console.log('Token counts per field:', fieldCounts);
    const total = Object.values(fieldCounts).reduce((sum, count) => sum + count, 0);
    console.log('Total tokens:', total);

    return total;
  }, [characterData]);

  return (
    <div className="flex justify-center items-center text-sm text-orange-600 mt-2 mb-4">
      {totalTokens ? (
        <div>
          <span>{totalTokens.toLocaleString()} Total Tokens</span>
        </div>
      ) : (
        'No character data'
      )}
    </div>
  );
};

export default TokenCounter;
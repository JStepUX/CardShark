/**
 * Substitutes special variables in text content
 * 
 * @param text Text containing variables like {{user}} and {{char}}
 * @param userName User name to replace {{user}} with
 * @param characterName Character name to replace {{char}} with
 * @returns Text with variables substituted
 */
export const substituteVariables = (
  text: string,
  userName?: string | null,
  characterName?: string | null
): string => {
  if (!text) return text;
  
  let processedText = text;
  
  if (userName) {
    processedText = processedText.replace(/\{\{user\}\}/gi, userName);
  }
  
  if (characterName) {
    processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
  }
  
  return processedText;
};

/**
 * Substitutes special variables in text content
 * 
 * @param text Text containing variables like {{user}} and {{char}}
 * @param userName User name or UserProfile object to replace {{user}} with
 * @param characterName Character name to replace {{char}} with
 * @returns Text with variables substituted
 */
export const substituteVariables = (
  text: string,
  userName?: any | null,
  characterName?: string | null
): string => {
  if (!text) return text;
  
  let processedText = text;
  
  if (userName) {
    // Handle userName as either string or UserProfile object
    const userNameStr = typeof userName === 'object' && userName !== null && userName.name
      ? userName.name 
      : typeof userName === 'string' 
        ? userName 
        : 'User';
    processedText = processedText.replace(/\{\{user\}\}/gi, userNameStr);
  }
  
  if (characterName) {
    processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
  }
  
  return processedText;
};

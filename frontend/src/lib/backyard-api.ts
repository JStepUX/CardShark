export async function parseBackyardUrl(url: string) {
  // Extract character ID from URL
  const match = url.match(/character\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('Invalid Backyard.ai URL');
  return match[1];
}

export async function fetchBackyardCharacter(characterId: string) {
  const response = await fetch(`https://backyard.ai/_next/data/[build-id]/hub/character/${characterId}.json`);
  if (!response.ok) throw new Error('Character not found');
  
  const data = await response.json();
  return data?.pageProps?.trpcState?.json?.queries?.[0]?.state?.data?.character;
}
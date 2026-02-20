/**
 * KoboldAI saved-story JSON → CardShark JSONL converter
 *
 * Detects KoboldAI save format and converts to the native JSONL chat format
 * so the existing backend import endpoint handles it without changes.
 */

interface KoboldSave {
  gamestarted: boolean;
  prompt: string;
  actions: Record<string, string>;
  actions_metadata?: Record<string, { 'Alternative Text'?: string[] }>;
  savedsettings?: {
    chatopponent?: string;
    chatname?: string;
  };
}

/**
 * Returns true if `content` looks like a KoboldAI saved-story JSON file.
 * Checks for the three distinguishing top-level fields.
 */
export function isKoboldFormat(content: string): boolean {
  try {
    const data = JSON.parse(content);
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.gamestarted === 'boolean' &&
      typeof data.prompt === 'string' &&
      typeof data.actions === 'object' &&
      data.actions !== null
    );
  } catch {
    return false;
  }
}

/**
 * Convert a KoboldAI saved-story JSON string into a JSONL string
 * matching CardShark's native chat import format.
 */
export function convertKoboldToJsonl(content: string): string {
  const data: KoboldSave = JSON.parse(content);

  const charName = data.savedsettings?.chatopponent || 'Character';
  const userName = data.savedsettings?.chatname || 'User';

  // Collect messages: prompt → first assistant message, then actions in order
  const messages: Array<{
    role: 'user' | 'assistant';
    name: string;
    content: string;
    swipes?: string[];
  }> = [];

  // --- Prompt = greeting / first assistant message ---
  const promptText = stripKoboldBoundary(data.prompt, true);
  if (promptText) {
    const { role, text } = detectRole(promptText, userName, charName);
    messages.push({
      role,
      name: role === 'user' ? userName : charName,
      content: text,
    });
  }

  // --- Actions (numerically-keyed object, sorted) ---
  const actionKeys = Object.keys(data.actions)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  const lastKey = actionKeys.length > 0 ? actionKeys[actionKeys.length - 1] : -1;

  for (const key of actionKeys) {
    let raw = data.actions[String(key)];
    if (!raw) continue;

    // Strip leading newline KoboldAI adds between actions
    if (raw.startsWith('\n')) raw = raw.slice(1);
    // Strip trailing \n*** on last action
    if (key === lastKey) raw = stripKoboldBoundary(raw, false);

    const { role, text } = detectRole(raw, userName, charName);

    // Check for alternative swipes in metadata
    let swipes: string[] | undefined;
    const meta = data.actions_metadata?.[String(key)];
    if (meta?.['Alternative Text'] && meta['Alternative Text'].length > 0) {
      swipes = meta['Alternative Text'];
    }

    messages.push({
      role,
      name: role === 'user' ? userName : charName,
      content: text,
      ...(swipes ? { swipes } : {}),
    });
  }

  // --- Generate sequential timestamps (now - N*60s) ---
  const nowMs = Date.now();
  const startMs = nowMs - messages.length * 60_000;

  // --- Build JSONL lines ---
  const lines: string[] = [];

  // Metadata line
  const createDate = new Date(startMs);
  lines.push(
    JSON.stringify({
      user_name: userName,
      character_name: charName,
      create_date: formatCreateDate(createDate),
      chat_metadata: {},
    })
  );

  // Message lines
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = new Date(startMs + i * 60_000);

    const line: Record<string, unknown> = {
      name: msg.name,
      is_user: msg.role === 'user',
      is_system: false,
      send_date: formatSendDate(ts),
      mes: msg.content,
      extra: {},
    };

    if (msg.swipes && msg.swipes.length > 0) {
      line.swipes = msg.swipes;
      line.swipe_id = 0;
    }

    lines.push(JSON.stringify(line));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Detect role from "{Name}: " prefix at start of text. */
function detectRole(
  text: string,
  userName: string,
  charName: string
): { role: 'user' | 'assistant'; text: string } {
  const userPrefix = `${userName}: `;
  const charPrefix = `${charName}: `;

  if (text.startsWith(userPrefix)) {
    return { role: 'user', text: text.slice(userPrefix.length) };
  }
  if (text.startsWith(charPrefix)) {
    return { role: 'assistant', text: text.slice(charPrefix.length) };
  }
  // No prefix → default to assistant (greeting / narration)
  return { role: 'assistant', text };
}

/** Strip leading \n and/or trailing \n*** boundary markers KoboldAI uses. */
function stripKoboldBoundary(text: string, isPrompt: boolean): string {
  let result = text;
  // Leading newlines
  while (result.startsWith('\n')) result = result.slice(1);
  // Trailing \n*** (story boundary)
  if (result.endsWith('\n***')) result = result.slice(0, -4);
  if (isPrompt && result.endsWith('***')) result = result.slice(0, -3);
  return result.trim();
}

/** Format like "2025-12-31@15h12m05s" */
function formatCreateDate(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` +
    `@${pad(dt.getHours())}h${pad(dt.getMinutes())}m${pad(dt.getSeconds())}s`
  );
}

/** Format like "December 31, 2025 3:12PM" matching CardShark's JSONL convention. */
function formatSendDate(dt: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[dt.getMonth()];
  const day = dt.getDate();
  const year = dt.getFullYear();
  let hour = dt.getHours() % 12;
  if (hour === 0) hour = 12;
  const minute = String(dt.getMinutes()).padStart(2, '0');
  const ampm = dt.getHours() >= 12 ? 'PM' : 'AM';
  return `${month} ${day}, ${year} ${hour}:${minute}${ampm}`;
}

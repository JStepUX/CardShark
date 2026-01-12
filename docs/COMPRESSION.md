# Context Compression & Management

As your stories grow, the amount of information sent to the AI increases. Eventually, this can exceed the AI's "context window" (its memory capacity), causing it to forget the beginning of the story or become slow and expensive to run.

CardShark uses an intelligent **Compression & Context Management** system to keep your conversations coherent, fast, and focused on the current scene.

## How it Works

When compression is enabled, CardShark performs two main actions: **Summarization** and **Field Expiration**.

### 1. Smart Summarization
Instead of just "cutting off" the beginning of your chat, CardShark asks a secondary AI process to summarize the older parts of your story into a concise narrative.

- **The Window**: The last **10 messages** are always kept verbatim. This ensures the immediate conversation flow remains natural.
- **The Summary**: Messages older than that are condensed into a narrative that preserves key plot events, character emotional states, and established facts.
- **Efficiency**: To save time, summaries are cached. The system only re-summarizes once you've added about 20 new messages.

### 2. Context Management Levels
You can control how aggressively CardShark manages your context through the **Context Mgt.** dropdown in the Side Panel.

| Level | Best For... | What happens? |
| :--- | :--- | :--- |
| **No Compression** | Short chats / Large AI models | Everything is sent exactly as-is. High accuracy, but uses the most memory. |
| **Chat Only** | Most long-term stories | Summarizes old messages but keeps all character details (Persona, Description, etc.) persistent. |
| **Chat + Dialogue** | Saving extra space | Summarizes chat AND hides the character's "Example Dialogue" once the chat is 5+ messages deep. |
| **Aggressive** | Maximum efficiency | Summarizes chat AND hides the "Scenario" and "First Message" instructions after 3 messages to maximize room for the current scene. |

---

## Field Expiration (The "Fading" Effect)
Under higher compression levels, certain parts of the character card "expire." This is because once you are 10 or 20 messages into a story, the AI usually doesn't need to be reminded of the initial "Setting" or the "Greeting" message anymore—it's already living in that world.

- **Scenario & First Message**: Expire after **3 messages** on `Aggressive`.
- **Example Dialogue**: Expires after **5 messages** on `Chat + Dialogue` or higher.
- **Persona & Description**: These are **Permanent** and are never removed, ensuring the character stays true to themselves.

---

## Pro Tips for Long Stories

### Use Session Notes
If there is a vital piece of information (like a secret item you found or a specific promise made) that the AI **must** remember verbatim, write it down in the **Session Notes** (found in the Side Panel). Notes are always sent to the AI and are never summarized or expired.

### Watch the Token Counter
The token counter at the bottom of the Side Panel shows you exactly how much space you are using. If it turns red, it's time to increase your Compression Level.

### When to use "No Compression"
If the AI seems to be confusing names or forgetting very recent details from just 15 messages ago, try switching to **No Compression** to see if the full history helps it regain its bearings.

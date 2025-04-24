# Prompts
## World Card System
When the user enters the world via the "Play Here" button in the world room details page, the LLM should generate a starting message ("first_mes") based on the current location's description and events.
The prompt solicitation for this first message will be handled with the existing prompt handler system. (See prompt_handler.py, prompt_handler.tsx, promptTypes, promptSchemas, etc.) All communication with the backend LLM will be handled in accordance with api configs to include the transmission those settings in each prompt. Similar to the Generate button in MessagesView, we will be asking for a new first_mes with every room that takes into consideration the following:
- The Room Name
- The Room Description
- The Room Events
- The Room NPCs
- The Context that occurred before the user arrived in this room, if applicable

Here's an example of the "prompt" portion of the payload:
```json
{
  ...other settings...
  "memory":"{{room.name}}, {{room.description}}, {{room.events}}, {{room.context}}",
  "npcs":[
    {
      "name": "{{npc.name}}",
      "description": "{{npc.description}}",
      "path": "{{npc.path}}",
    }
  ]
  "prompt": "Narrator, please generate an introductory message for this room based on current memory and recent events. NPCs present may be mentioned, but please keep the focus on the room and its events as you do not yet have the entire context for each given NPC character."
}
```

## NPC Prompt
When the user clicks on an NPC in the world view, the LLM should generate a message based on the NPC's description and events. The action represents "summoning" that full character into context within the understood current room.

The prompt solicitation for this message will be handled with the existing prompt handler system. (See prompt_handler.py, prompt_handler.tsx, promptTypes, promptSchemas, etc.) All communication with the backend LLM will be handled in accordance with api configs to include the transmission those settings in each prompt. Similar to the flow of interactions in ChatView, we will be asking for a new message introduction message that takes into consideration the following:
- The NPC v2 PNG Metadata:
    - {{characterdata.name}}
    - {{characterdata.description}}
    - {{characterdata.personality}}
    - {{characterdata.example_mes}}
    - {{characterdata.first_mes}} (as an example of character's tone and personality)
- The Context that occurred before the user arrived in this room, if applicable

Here's an example of the "prompt" portion of the payload:
```json
{
  ...other settings...
  "memory":"{{characterdata.name}}, {{characterdata.description}}, {{characterdata.personality}}, {{characterdata.example_mes}}, {{characterdata.first_mes}}",
  "prompt": "Narrator, you now inhabit the role of {{characterdata.name}}, please respond to the presence of {{user}} while remaining in the context of {{room.name}}."
}
```

## NPC Prompt ({{user}} has used programmatic game mechanics to initiate combat)
When the user clicks on an NPC in the world view, the LLM should generate a message based on the NPC's description and events. The action represents "summoning" that full character into context **as being attacked by {{user}}**.

The prompt solicitation for this message will be handled with the existing prompt handler system. (See prompt_handler.py, prompt_handler.tsx, promptTypes, promptSchemas, etc.) All communication with the backend LLM will be handled in accordance with api configs to include the transmission those settings in each prompt. Similar to the flow of interactions in ChatView, we will be asking for a new message introduction message that takes into consideration the following:
- The NPC v2 PNG Metadata:
    - {{characterdata.name}}
    - {{characterdata.description}}
    - {{characterdata.personality}}
    - {{characterdata.example_mes}}
    - {{characterdata.first_mes}} (as an example of character's tone and personality)
- The Context that occurred before the user arrived in this room, if applicable

Here's an example of the "prompt" portion of the payload:
```json
{
  ...other settings...
  "memory":"{{characterdata.name}}, {{characterdata.description}}, {{characterdata.personality}}, {{characterdata.example_mes}}, {{characterdata.first_mes}}",
  "prompt": "Narrator, you now inhabit the role of {{characterdata.name}}. You, {{characterdata.name}}, are being attacked by {{user}}! Please respond to {{user}}'s attack while remaining in the context of {{room.name}}. {{user}}'s attack type is {{game.attack_type}}."
}
```


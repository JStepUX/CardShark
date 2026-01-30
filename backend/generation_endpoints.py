"""
@file generation_endpoints.py
@description Endpoints for LLM text generation including chat responses, greetings,
             impersonation, and room content generation.
@dependencies fastapi, api_handler
@consumers main.py
"""
import traceback
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.log_manager import LogManager
from backend.api_handler import ApiHandler

# Create router
router = APIRouter(
    prefix="/api",
    tags=["generation"]
)

# Initialize handlers (will be set from main.py via setup function)
_logger: LogManager = None
_api_handler: ApiHandler = None


def setup_generation_router(logger: LogManager, api_handler: ApiHandler):
    """Initialize the generation router with required dependencies."""
    global _logger, _api_handler
    _logger = logger
    _api_handler = api_handler


@router.post("/generate")
async def generate(request: Request):
    """Generate a chat response using the LLM API with streaming."""
    try:
        _logger.log_step("Received generation request at /api/generate")
        # Parse the request JSON
        request_data = await request.json()

        # Use the ApiHandler to stream the response
        return StreamingResponse(
            _api_handler.stream_generate(request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        _logger.log_error(f"Error in /api/generate endpoint: {str(e)}")
        _logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Generation failed: {str(e)}"}
        )


@router.post("/generate-greeting")
async def generate_greeting(request: Request):
    """Generate a greeting using the LLM API without streaming."""
    try:
        _logger.log_step("Received greeting generation request")
        # Parse the request JSON
        request_data = await request.json()

        # Extract character data and API config
        character_data = request_data.get('character_data')
        api_config = request_data.get('api_config')

        if not character_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Character data is required"}
            )

        if not api_config:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API configuration is required"}
            )

        # Extract character fields for context
        data = character_data.get('data', {})
        name = data.get('name', 'Character')
        personality = data.get('personality', '')
        description = data.get('description', '')
        scenario = data.get('scenario', '')
        first_mes = data.get('first_mes', '')

        # Construct detailed context
        context_parts = []
        if description:
            context_parts.append(f"Description: {description}")
        if personality:
            context_parts.append(f"Personality: {personality}")
        if scenario:
            context_parts.append(f"Scenario: {scenario}")

        character_context = "\n\n".join(context_parts)

        # Get existing system prompt if any
        system_prompt = data.get('system_prompt', '')

        # Combine system prompt and character context
        full_memory = ""
        if system_prompt:
            full_memory += system_prompt + "\n\n"
        if character_context:
            full_memory += "Character Data:\n" + character_context

        # Construct generation instruction
        # Get internal prompt template from request or use default
        prompt_template = request_data.get('prompt_template')

        # Check for custom_prompt (used by combat narratives and other custom generation)
        custom_prompt = request_data.get('custom_prompt')

        if custom_prompt:
            # Use custom prompt as the instruction
            generation_instruction = custom_prompt
        elif prompt_template:
            # Use provided template
            generation_instruction = prompt_template.replace('{{char}}', name)
        else:
            # Default instruction for greeting generation
            generation_instruction = f"#Generate an alternate first message for {name}. ##Only requirements: - Establish the world: Where are we? What does it feel like here? - Establish {name}'s presence (not bio): How do they occupy this space? Everything else (tone, structure, acknowledging/ignoring {{{{user}}}}, dialogue/action/interiority, length) is your choice. ##Choose what best serves this character in this moment. ##Goal: Create a scene unique to {name} speaking only for {name}"

        # Stream the response using ApiHandler
        # Use system_instruction for the generation directive (goes into system context)
        # Use prompt as just the turn marker (what the model continues from)
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "system_instruction": generation_instruction,
                "prompt": f"\n{name}:",
                "memory": full_memory,
                "stop_sequence": ["User:", "Human:", "</s>", f"\n{name}:", "{{user}}:"],
                "character_data": character_data,
                "quiet": True
            }
        }

        return StreamingResponse(
            _api_handler.stream_generate(stream_request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        _logger.log_error(f"Error generating greeting: {str(e)}")
        _logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to generate greeting: {str(e)}"}
        )


@router.post("/generate-impersonate")
async def generate_impersonate(request: Request):
    """Generate a response as the user ({{user}}) using the LLM API with streaming.

    This endpoint allows the AI to 'impersonate' the user, generating a response
    on their behalf based on the conversation context. If the user has provided
    a partial message, the AI will continue from where they left off.
    """
    try:
        _logger.log_step("Received impersonate generation request")
        # Parse the request JSON
        request_data = await request.json()

        # Extract required fields
        character_data = request_data.get('character_data')
        api_config = request_data.get('api_config')
        messages = request_data.get('messages', [])  # Chat history
        partial_message = request_data.get('partial_message', '')  # User's partial input
        user_name = request_data.get('user_name', 'User')
        prompt_template = request_data.get('prompt_template')

        if not character_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Character data is required"}
            )

        if not api_config:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API configuration is required"}
            )

        # Extract character fields for context
        data = character_data.get('data', {})
        char_name = data.get('name', 'Character')
        personality = data.get('personality', '')
        description = data.get('description', '')
        scenario = data.get('scenario', '')

        # Construct character context
        context_parts = []
        if description:
            context_parts.append(f"Description: {description}")
        if personality:
            context_parts.append(f"Personality: {personality}")
        if scenario:
            context_parts.append(f"Scenario: {scenario}")

        character_context = "\n\n".join(context_parts)

        # Get existing system prompt if any
        system_prompt = data.get('system_prompt', '')

        # Build memory context
        full_memory = ""
        if system_prompt:
            full_memory += system_prompt + "\n\n"
        if character_context:
            full_memory += "Character Data:\n" + character_context

        # Build conversation history for context
        chat_history = ""
        for msg in messages[-10:]:  # Use last 10 messages for context
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if role == 'assistant':
                chat_history += f"{char_name}: {content}\n\n"
            elif role == 'user':
                chat_history += f"{user_name}: {content}\n\n"

        # Construct the impersonation instruction (goes into system context)
        if prompt_template:
            # Use provided template
            generation_instruction = prompt_template.replace('{{char}}', char_name).replace('{{user}}', user_name)
        else:
            # Default instruction
            generation_instruction = f"You are now speaking as {user_name}, responding to {char_name}. Based on the conversation so far, write a natural response that {user_name} might give. Stay true to any established personality or traits for {user_name}. Write in first person as {user_name}."

        # Build the prompt (conversation history + turn marker)
        prompt = f"## Recent Conversation:\n{chat_history}"

        if partial_message and partial_message.strip():
            prompt += f"\n## Continue this message from {user_name} (write ONLY the continuation, do not repeat what's already written):\n{user_name}: {partial_message}"
        else:
            prompt += f"\n## Write a response as {user_name}:\n{user_name}:"

        # Stream the response using ApiHandler
        # Use system_instruction for the generation directive (goes into system context)
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "system_instruction": generation_instruction,
                "prompt": prompt,
                "memory": full_memory,
                "stop_sequence": [f"{char_name}:", "</s>", "\n\n"],
                "character_data": character_data,
                "quiet": True
            }
        }

        return StreamingResponse(
            _api_handler.stream_generate(stream_request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        _logger.log_error(f"Error generating impersonate response: {str(e)}")
        _logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to generate impersonate response: {str(e)}"}
        )


@router.post("/generate-room-content")
async def generate_room_content(request: Request):
    """Generate room description or introduction text using the LLM API with streaming.

    This endpoint generates content for room fields (description or introduction) based on
    world context, room context, and optional user guidance.
    """
    try:
        _logger.log_step("Received room content generation request")
        request_data = await request.json()

        # Extract required fields
        api_config = request_data.get('api_config')
        world_context = request_data.get('world_context', {})  # World name, description, etc.
        room_context = request_data.get('room_context', {})    # Room name, existing content
        field_type = request_data.get('field_type', 'description')  # 'description' or 'introduction'
        existing_text = request_data.get('existing_text', '')  # Current text to continue from
        user_prompt = request_data.get('user_prompt', '')      # Optional user guidance

        if not api_config:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API configuration is required"}
            )

        # Build context from world and room data
        world_name = world_context.get('name', 'Unknown World')
        world_description = world_context.get('description', '')
        room_name = room_context.get('name', 'Unknown Room')
        room_description = room_context.get('description', '')
        room_npcs = room_context.get('npcs', [])

        # Build memory context
        memory_parts = []
        memory_parts.append(f"## World: {world_name}")
        if world_description:
            memory_parts.append(f"World Description: {world_description}")
        memory_parts.append(f"\n## Room: {room_name}")
        if room_description and field_type == 'introduction':
            memory_parts.append(f"Room Description: {room_description}")
        if room_npcs:
            npc_names = [npc.get('name', 'Unknown NPC') for npc in room_npcs]
            memory_parts.append(f"NPCs present: {', '.join(npc_names)}")

        full_memory = "\n".join(memory_parts)

        # Build generation instruction based on field type
        if field_type == 'introduction':
            base_instruction = f"""You are a creative writer helping to craft an introduction scene for a room in a story/roleplay world.

The room is "{room_name}" in the world "{world_name}".

Write an evocative introduction that:
- Sets the scene and atmosphere
- Describes what the player sees, hears, and feels upon entering
- Hints at the room's purpose or history
- Creates immersion without being overly verbose

Write in second person perspective (e.g., "You enter...", "You see...").
Keep it to 2-4 paragraphs unless the user requests otherwise."""
        else:  # description
            base_instruction = f"""You are a creative writer helping to craft a room description for a story/roleplay world.

The room is "{room_name}" in the world "{world_name}".

Write a detailed description that:
- Captures the physical layout and key features
- Establishes the atmosphere and mood
- Notes important objects or points of interest
- Can be referenced by AI for roleplay context

Write in a neutral, informative tone that provides context without being a narrative.
Keep it to 2-4 paragraphs unless the user requests otherwise."""

        # Add user guidance if provided
        if user_prompt:
            generation_instruction = f"{base_instruction}\n\nUser guidance: {user_prompt}"
        else:
            generation_instruction = base_instruction

        # Build the prompt
        if existing_text and existing_text.strip():
            prompt = f"## Continue this {field_type} (write ONLY the continuation, do not repeat what's already written):\n\n{existing_text}"
        else:
            prompt = f"## Write the {field_type}:\n\n"

        # Stream the response
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "system_instruction": generation_instruction,
                "prompt": prompt,
                "memory": full_memory,
                "stop_sequence": ["</s>", "[END]", "---"],
                "quiet": True
            }
        }

        return StreamingResponse(
            _api_handler.stream_generate(stream_request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        _logger.log_error(f"Error generating room content: {str(e)}")
        _logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to generate room content: {str(e)}"}
        )

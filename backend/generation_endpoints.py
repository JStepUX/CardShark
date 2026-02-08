"""
@file generation_endpoints.py
@description Endpoints for LLM text generation including chat responses, greetings,
             impersonation, room content generation, and NPC thin frame generation.
@dependencies fastapi, api_handler
@consumers main.py
"""
import asyncio
import json
import re
import traceback
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.log_manager import LogManager
from backend.api_handler import ApiHandler

# Thin frame generation timeout (30 seconds)
THIN_FRAME_TIMEOUT_SECONDS = 30

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

        # Extract character data, API config, and optional partial message
        character_data = request_data.get('character_data')
        api_config = request_data.get('api_config')
        partial_message = request_data.get('partial_message', '')

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

        # Build prompt: if partial_message provided, continue from it; otherwise bare turn marker
        if partial_message and partial_message.strip():
            prompt = f"\n{name}: {partial_message}"
            # Augment instruction to continue from the seed text
            generation_instruction += f"\n\nIMPORTANT: The greeting has already been started as shown below. Continue naturally from where it left off. Do NOT repeat the beginning text. Write ONLY the continuation."
        else:
            prompt = f"\n{name}:"

        # Stream the response using ApiHandler
        # Use system_instruction for the generation directive (goes into system context)
        # Use prompt as just the turn marker (what the model continues from)
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "system_instruction": generation_instruction,
                "prompt": prompt,
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


def _create_fallback_thin_frame(name: str, description: str, personality: str) -> dict:
    """Create a fallback thin frame by truncating description/personality.

    Used when LLM generation fails or times out.
    Extracts first 2 sentences from description for archetype/appearance.
    """
    # Extract first 2 sentences from description
    sentences = re.split(r'(?<=[.!?])\s+', description.strip()) if description else []
    first_two = ' '.join(sentences[:2]) if sentences else ''

    # Extract first sentence from personality for traits
    personality_first = ''
    if personality:
        match = re.match(r'^[^.!?]+[.!?]', personality.strip())
        personality_first = match.group(0) if match else personality[:100]

    return {
        "version": 1,
        "generated_at": int(asyncio.get_event_loop().time() * 1000) if asyncio.get_event_loop().is_running() else 0,
        "archetype": name or "unknown character",
        "key_traits": [personality_first] if personality_first else [],
        "speaking_style": "natural",
        "motivation": "",
        "appearance_hook": first_two if first_two else "no distinctive features",
        "fallback": True  # Marker that this was generated via fallback
    }


def _parse_thin_frame_response(response_text: str, name: str) -> dict:
    """Parse LLM response into thin frame structure.

    Expects JSON with: archetype, key_traits, speaking_style, motivation, appearance_hook
    Falls back to text extraction if JSON parsing fails.
    """
    import time

    # Try to extract JSON from the response
    # LLM might wrap it in markdown code blocks
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
    if json_match:
        response_text = json_match.group(1)

    # Also try to find raw JSON object
    if not json_match:
        json_match = re.search(r'\{[^{}]*"archetype"[^{}]*\}', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)

    try:
        data = json.loads(response_text)

        # Validate and normalize the response
        return {
            "version": 1,
            "generated_at": int(time.time() * 1000),
            "archetype": str(data.get("archetype", name))[:50],
            "key_traits": [str(t)[:50] for t in data.get("key_traits", [])[:3]],
            "speaking_style": str(data.get("speaking_style", "natural"))[:100],
            "motivation": str(data.get("motivation", ""))[:200],
            "appearance_hook": str(data.get("appearance_hook", ""))[:200],
        }
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        _logger.log_warning(f"Failed to parse thin frame JSON: {e}")
        # Return None to trigger fallback
        return None


@router.post("/context/generate-thin-frame")
async def generate_thin_frame(request: Request):
    """Generate a portable NPC thin frame for context-efficient conversations.

    Thin frames capture essential NPC identity in a compact format that survives
    context limitations without losing character identity through truncation.

    Request body:
    - character_data: Full character card data (name, description, personality)
    - api_config: LLM API configuration

    Response:
    - success: boolean
    - thin_frame: NPCThinFrame object (version, generated_at, archetype, key_traits, etc.)
    - fallback_used: boolean - true if LLM failed and truncation was used

    Timeout: 30 seconds, then falls back to truncation-based frame.
    """
    try:
        _logger.log_step("Received thin frame generation request")
        request_data = await request.json()

        # Extract required fields
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

        # Extract character fields
        data = character_data.get('data', character_data)  # Handle both nested and flat structure
        name = data.get('name', 'Unknown')
        description = data.get('description', '')
        personality = data.get('personality', '')

        if not description and not personality:
            # No content to generate from - return minimal frame
            return JSONResponse(content={
                "success": True,
                "thin_frame": _create_fallback_thin_frame(name, '', ''),
                "fallback_used": True,
                "reason": "No description or personality to analyze"
            })

        # Build the generation prompt
        generation_instruction = """You are analyzing a character to extract their core identity traits.
Output ONLY a JSON object with these exact fields:
{
  "archetype": "2-3 word character type (e.g., 'gruff blacksmith', 'mysterious sage')",
  "key_traits": ["trait1", "trait2", "trait3"],
  "speaking_style": "how they talk (e.g., 'formal, archaic', 'casual, uses slang')",
  "motivation": "what drives them in one sentence",
  "appearance_hook": "their most memorable visual detail"
}

Rules:
- archetype: Maximum 3 words, captures their role/demeanor
- key_traits: Exactly 3 personality traits, one word each
- speaking_style: How they speak, not what they say
- motivation: Their primary goal or drive
- appearance_hook: One distinctive physical feature or look

Output ONLY the JSON object, no other text."""

        character_context = f"""Character: {name}

Description:
{description[:1500] if description else 'No description provided.'}

Personality:
{personality[:1500] if personality else 'No personality provided.'}"""

        # Prepare the generation request
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "system_instruction": generation_instruction,
                "prompt": f"{character_context}\n\nJSON:",
                "memory": "",
                "stop_sequence": ["</s>", "\n\n\n", "```\n\n"],
                "quiet": True,
                "max_tokens": 300  # Thin frames should be concise
            }
        }

        # Collect the streamed response with timeout
        collected_response = []
        try:
            async def collect_stream():
                async for chunk in _api_handler.stream_generate(stream_request_data):
                    if isinstance(chunk, bytes):
                        chunk = chunk.decode('utf-8')
                    # Handle SSE format
                    if chunk.startswith('data: '):
                        chunk = chunk[6:]
                    if chunk.strip() and chunk.strip() != '[DONE]':
                        collected_response.append(chunk)

            # Run with timeout
            await asyncio.wait_for(collect_stream(), timeout=THIN_FRAME_TIMEOUT_SECONDS)

        except asyncio.TimeoutError:
            _logger.log_warning(f"Thin frame generation timed out after {THIN_FRAME_TIMEOUT_SECONDS}s, using fallback")
            return JSONResponse(content={
                "success": True,
                "thin_frame": _create_fallback_thin_frame(name, description, personality),
                "fallback_used": True,
                "reason": "Generation timed out"
            })
        except Exception as stream_error:
            _logger.log_error(f"Error during thin frame stream: {stream_error}")
            return JSONResponse(content={
                "success": True,
                "thin_frame": _create_fallback_thin_frame(name, description, personality),
                "fallback_used": True,
                "reason": f"Stream error: {str(stream_error)}"
            })

        # Parse the collected response
        full_response = ''.join(collected_response)
        _logger.log_step(f"Thin frame raw response: {full_response[:500]}")

        thin_frame = _parse_thin_frame_response(full_response, name)

        if thin_frame is None:
            _logger.log_warning("Failed to parse thin frame response, using fallback")
            return JSONResponse(content={
                "success": True,
                "thin_frame": _create_fallback_thin_frame(name, description, personality),
                "fallback_used": True,
                "reason": "Failed to parse LLM response"
            })

        return JSONResponse(content={
            "success": True,
            "thin_frame": thin_frame,
            "fallback_used": False
        })

    except Exception as e:
        _logger.log_error(f"Error generating thin frame: {str(e)}")
        _logger.log_error(traceback.format_exc())

        # Even on error, try to return a fallback frame
        try:
            character_data = (await request.json()).get('character_data', {})
            data = character_data.get('data', character_data)
            return JSONResponse(content={
                "success": True,
                "thin_frame": _create_fallback_thin_frame(
                    data.get('name', 'Unknown'),
                    data.get('description', ''),
                    data.get('personality', '')
                ),
                "fallback_used": True,
                "reason": f"Error: {str(e)}"
            })
        except:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": f"Failed to generate thin frame: {str(e)}"}
            )

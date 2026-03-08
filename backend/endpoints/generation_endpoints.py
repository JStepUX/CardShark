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

        # Extract character name for instruction resolution
        data = character_data.get('data', {})
        name = data.get('name', 'Character')

        # Construct generation instruction
        prompt_template = request_data.get('prompt_template')
        custom_prompt = request_data.get('custom_prompt')

        if custom_prompt:
            generation_instruction = custom_prompt
        elif prompt_template:
            generation_instruction = prompt_template.replace('{{char}}', name)
        else:
            generation_instruction = f"#Generate an alternate first message for {name}. ##Only requirements: - Establish the world: Where are we? What does it feel like here? - Establish {name}'s presence (not bio): How do they occupy this space? Everything else (tone, structure, acknowledging/ignoring {{{{user}}}}, dialogue/action/interiority, length) is your choice. ##Choose what best serves this character in this moment. ##Goal: Create a scene unique to {name} speaking only for {name}"

        # Augment instruction for partial message continuation
        if partial_message and partial_message.strip():
            generation_instruction += "\n\nIMPORTANT: The greeting has already been started as shown below. Continue naturally from where it left off. Do NOT repeat the beginning text. Write ONLY the continuation."

        from backend.kobold_prompt_builder import is_kobold_provider
        from backend.services.prompt_assembly_service import PromptAssemblyService
        is_kobold = is_kobold_provider(api_config)
        assembler = PromptAssemblyService(_logger)

        result = assembler.assemble_greeting(
            character_data=character_data,
            generation_instruction=generation_instruction,
            partial_message=partial_message,
            is_kobold=is_kobold,
        )

        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "prompt": result.prompt,
                "memory": result.memory,
                "stop_sequence": result.stop_sequences,
                "_pre_assembled": True,
                "quiet": True,
            }
        }

        _logger.log_step(
            f"Greeting assembly complete: "
            f"prompt={len(result.prompt)} chars, memory={len(result.memory)} chars"
        )

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
        user_persona = request_data.get('user_persona', '')
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

        # Extract character name for instruction resolution
        data = character_data.get('data', {})
        char_name = data.get('name', 'Character')

        # Construct the impersonation instruction
        if prompt_template:
            generation_instruction = prompt_template.replace('{{char}}', char_name).replace('{{user}}', user_name)
        else:
            generation_instruction = (
                f"You are now speaking as {user_name}, responding to {char_name}. "
                f"Based on the conversation so far, write a natural response that "
                f"{user_name} might give. Stay true to any established personality "
                f"or traits for {user_name}. Write in first person as {user_name}."
            )

        from backend.kobold_prompt_builder import is_kobold_provider
        from backend.services.prompt_assembly_service import PromptAssemblyService
        is_kobold = is_kobold_provider(api_config)
        assembler = PromptAssemblyService(_logger)

        result = assembler.assemble_impersonate(
            character_data=character_data,
            messages=messages,
            generation_instruction=generation_instruction,
            partial_message=partial_message,
            user_name=user_name,
            user_persona=user_persona,
            is_kobold=is_kobold,
        )

        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "prompt": result.prompt,
                "memory": result.memory,
                "stop_sequence": result.stop_sequences,
                "_pre_assembled": True,
                "quiet": True,
            }
        }

        _logger.log_step(
            f"Impersonate assembly complete: "
            f"prompt={len(result.prompt)} chars, memory={len(result.memory)} chars"
        )

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
        world_context = request_data.get('world_context', {})
        room_context = request_data.get('room_context', {})
        field_type = request_data.get('field_type', 'description')
        existing_text = request_data.get('existing_text', '')
        user_prompt = request_data.get('user_prompt', '')

        if not api_config:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API configuration is required"}
            )

        from backend.kobold_prompt_builder import is_kobold_provider
        from backend.services.prompt_assembly_service import PromptAssemblyService
        is_kobold = is_kobold_provider(api_config)
        assembler = PromptAssemblyService(_logger)

        result = assembler.assemble_room_content(
            world_context=world_context,
            room_context=room_context,
            field_type=field_type,
            existing_text=existing_text,
            user_prompt=user_prompt,
            is_kobold=is_kobold,
        )

        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "prompt": result.prompt,
                "memory": result.memory,
                "stop_sequence": result.stop_sequences,
                "_pre_assembled": True,
                "quiet": True,
            }
        }

        _logger.log_step(
            f"Room content assembly complete: "
            f"prompt={len(result.prompt)} chars, memory={len(result.memory)} chars"
        )

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

        from backend.kobold_prompt_builder import is_kobold_provider
        from backend.services.prompt_assembly_service import PromptAssemblyService
        is_kobold = is_kobold_provider(api_config)
        assembler = PromptAssemblyService(_logger)

        result = assembler.assemble_thin_frame(
            character_data=character_data,
            is_kobold=is_kobold,
        )

        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "prompt": result.prompt,
                "memory": result.memory,
                "stop_sequence": result.stop_sequences,
                "_pre_assembled": True,
                "quiet": True,
                "max_tokens": 300,
            }
        }

        _logger.log_step(
            f"Thin frame assembly complete: "
            f"prompt={len(result.prompt)} chars, memory={len(result.memory)} chars"
        )

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

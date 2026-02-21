"""
@file health_endpoints.py
@description Health check and LLM status monitoring endpoints.
@dependencies fastapi, httpx
@consumers main.py
"""
import time
from fastapi import APIRouter, Request

from backend.log_manager import LogManager
from backend.settings_manager import SettingsManager
from backend.response_models import (
    HealthCheckResponse,
    STANDARD_RESPONSES
)

# Create router
router = APIRouter(
    prefix="/api",
    tags=["health"],
    responses=STANDARD_RESPONSES
)

# Module-level dependencies (will be set from main.py via setup function)
_logger: LogManager = None
_settings_manager: SettingsManager = None
_version: str = "0.1.0"


def setup_health_router(logger: LogManager, settings_manager: SettingsManager, version: str):
    """Initialize the health router with required dependencies."""
    global _logger, _settings_manager, _version
    _logger = logger
    _settings_manager = settings_manager
    _version = version


@router.get("/health", response_model=HealthCheckResponse)
async def health_check(request: Request):
    """Health check endpoint with standardized response.

    Note: This endpoint does NOT return LLM status to avoid interfering with
    the separate /api/llm-status endpoint which fetches live model information.
    It does not make external API calls to ensure fast, reliable responses.
    """
    start_time = time.time()

    # Calculate response latency
    latency_ms = round((time.time() - start_time) * 1000, 2)

    return HealthCheckResponse(
        status="healthy",
        version=_version,
        latency_ms=latency_ms,
        llm=None  # Don't return LLM status here - use /api/llm-status instead
    )


@router.get("/llm-status")
async def get_llm_status(request: Request):
    """Get live LLM provider status including actual loaded model.

    This endpoint makes external API calls to fetch the currently loaded model
    from KoboldCPP and other providers. It should be called periodically by the
    frontend, not during critical startup paths.

    Returns:
        dict: LLM status with configured provider and live model info
    """
    import asyncio
    import httpx

    llm_status = {
        "configured": False,
        "provider": None,
        "model": None,
        "model_source": "none",  # "settings", "live", or "none"
        "max_context_length": None
    }

    try:
        # Get the active API from settings
        all_settings = _settings_manager.settings
        active_api_id = all_settings.get("activeApiId")
        apis = all_settings.get("apis", {})

        if active_api_id and active_api_id in apis:
            active_api = apis[active_api_id]
            provider = active_api.get("provider", "")

            if provider and active_api.get("enabled", False):
                llm_status["configured"] = True
                llm_status["provider"] = provider

                # Get model name from settings first
                model_name = active_api.get("model") or active_api.get("model_info", {}).get("name")

                # For KoboldCPP, try to fetch actual loaded model and context length
                if provider.lower() == "koboldcpp" and active_api.get("url"):
                    try:
                        async with httpx.AsyncClient(timeout=2.0) as client:
                            kobold_url = active_api["url"].rstrip("/")
                            # Fetch model info and true context length concurrently
                            model_task = client.get(f"{kobold_url}/api/v1/model")
                            ctx_task = client.get(f"{kobold_url}/api/extra/true_max_context_length")
                            results = await asyncio.gather(model_task, ctx_task, return_exceptions=True)

                            # Parse model response
                            if not isinstance(results[0], Exception) and results[0].status_code == 200:
                                model_data = results[0].json()
                                live_model = model_data.get("result")
                                if live_model:
                                    model_name = live_model
                                    llm_status["model_source"] = "live"

                            # Parse context length response
                            if not isinstance(results[1], Exception) and results[1].status_code == 200:
                                ctx_data = results[1].json()
                                ctx_value = ctx_data.get("value")
                                if isinstance(ctx_value, int) and ctx_value > 0:
                                    llm_status["max_context_length"] = ctx_value
                    except Exception as e:
                        _logger.log_debug(f"Could not fetch live info from KoboldCPP: {e}")
                        # Fall back to settings values

                if model_name:
                    llm_status["model"] = model_name
                    if llm_status["model_source"] == "none":
                        llm_status["model_source"] = "settings"
                else:
                    llm_status["model"] = "unknown"

    except Exception as e:
        _logger.log_warning(f"Error getting LLM status: {e}")

    return llm_status

"""
Router registry for all API endpoint modules.

Centralizes router imports so main.py can register them in a loop
instead of maintaining 22+ individual import/include_router lines.
"""

# --- Endpoints with setup functions ---
from .health_endpoints import router as health_router, setup_health_router
from .generation_endpoints import router as generation_router, setup_generation_router
from .file_upload_endpoints import router as file_upload_router, setup_file_upload_router

# --- Standard endpoints (no setup needed) ---
from .background_endpoints import router as background_router
from .character_endpoints import router as character_router
from .character_image_endpoints import router as character_image_router
from .chat_endpoints import router as chat_session_router
from .content_filter_endpoints import router as content_filter_router
from .gallery_endpoints import router as gallery_router
from .lore_endpoints import router as lore_router
from .npc_room_assignment_endpoints import router as npc_room_assignment_router
from .room_endpoints import router as room_router
from .room_card_serve_endpoints import router as room_card_serve_router
from .settings_endpoints import router as settings_router
from .template_endpoints import router as template_router
from .user_endpoints import router as user_router
from .world_asset_endpoints import router as world_asset_router

# --- Endpoints already in this directory ---
from .adventure_log_endpoints import router as adventure_log_router
from .room_card_endpoints import router as room_card_crud_router
from .world_card_endpoints_v2 import router as world_card_crud_router
from .world_progress_endpoints import router as world_progress_router

ALL_ROUTERS = [
    health_router,
    chat_session_router,
    room_card_serve_router,
    room_card_crud_router,
    world_card_crud_router,
    world_progress_router,
    adventure_log_router,
    character_router,
    user_router,
    settings_router,
    template_router,
    lore_router,
    room_router,
    npc_room_assignment_router,
    world_asset_router,
    gallery_router,
    character_image_router,
    background_router,
    generation_router,
    file_upload_router,
    content_filter_router,
]

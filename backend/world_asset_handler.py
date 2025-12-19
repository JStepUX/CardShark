import os
import shutil
from pathlib import Path
from typing import List, Optional
import uuid
import logging

from backend.log_manager import LogManager

class WorldAssetHandler:
    """
    Manages assets for World Cards (Room images, backgrounds, etc.)
    stored in `world_assets/{world_uuid}/`.
    """

    def __init__(self, logger: LogManager, base_path: str = "world_assets"):
        self.logger = logger
        self.base_path = Path(base_path)
        self._ensure_base_directory()

    def _ensure_base_directory(self):
        """Ensures the base world_assets directory exists."""
        if not self.base_path.exists():
            self.base_path.mkdir(parents=True, exist_ok=True)
            self.logger.log_info(f"Created world assets directory: {self.base_path}")

    def _get_world_dir(self, world_uuid: str) -> Path:
        """Gets the directory for a specific world's assets."""
        return self.base_path / world_uuid

    def ensure_world_directory(self, world_uuid: str) -> Path:
        """Ensures the asset directory for a specific world exists."""
        world_dir = self._get_world_dir(world_uuid)
        if not world_dir.exists():
            world_dir.mkdir(parents=True, exist_ok=True)
            self.logger.log_info(f"Created asset directory for world: {world_uuid}")
        return world_dir

    def save_asset(self, world_uuid: str, file_data: bytes, filename: str) -> str:
        """
        Saves an asset file for a world.
        Returns the relative path to the asset (e.g., "world_uuid/filename.png").
        """
        world_dir = self.ensure_world_directory(world_uuid)
        
        # Sanitize filename or generate a safe one if needed? 
        # For now assume filename is reasonably safe or we want to preserve it.
        # But to be safe against collisions or weird chars, maybe we should just use it?
        # Let's trust the caller to provide a good filename or we could UUID it.
        # But room images usually want to be referenced by something.
        
        target_path = world_dir / filename
        
        with open(target_path, "wb") as f:
            f.write(file_data)
            
        self.logger.log_step(f"Saved asset: {target_path}")
        
        # Return path relative to world_assets base for storage in DB/JSON
        return f"{world_uuid}/{filename}"

    def get_asset_path(self, asset_relative_path: str) -> Optional[Path]:
        """
        Resolves a relative asset path to an absolute system path.
        """
        full_path = self.base_path / asset_relative_path
        if full_path.exists() and full_path.is_file():
            return full_path
        return None

    def list_assets(self, world_uuid: str) -> List[str]:
        """Lists all assets for a given world."""
        world_dir = self._get_world_dir(world_uuid)
        if not world_dir.exists():
            return []
            
        return [f.name for f in world_dir.iterdir() if f.is_file()]

    def delete_asset(self, asset_relative_path: str) -> bool:
        """Deletes a specific asset."""
        full_path = self.base_path / asset_relative_path
        if full_path.exists():
            try:
                os.remove(full_path)
                self.logger.log_info(f"Deleted asset: {full_path}")
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to delete asset {full_path}: {e}")
                return False
        return False
        
    def delete_world_assets(self, world_uuid: str) -> bool:
        """Deletes all assets for a world (e.g. on world deletion)."""
        world_dir = self._get_world_dir(world_uuid)
        if world_dir.exists():
            try:
                shutil.rmtree(world_dir)
                self.logger.log_info(f"Deleted all assets for world: {world_uuid}")
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to delete assets for world {world_uuid}: {e}")
                return False
        return False










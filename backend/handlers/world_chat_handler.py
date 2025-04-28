"""
Handler for world card chat functionality.
This module provides functionality for managing chat sessions for world cards.
"""
import os
import json
from pathlib import Path
import time
import uuid

class WorldCardChatHandler:
    """Handles operations related to world card chat sessions."""
    
    def __init__(self, logger):
        """Initialize with dependencies.
        
        Args:
            logger: The logger instance to use
        """
        self.logger = logger
    
    def _get_chat_dir(self, world_name):
        """Gets the directory path for a world's chat files.
        
        Args:
            world_name: The name of the world
            
        Returns:
            Path: The path to the chat directory for this world
        """
        chat_dir = Path("worlds") / world_name / "chats"
        chat_dir.mkdir(parents=True, exist_ok=True)
        return chat_dir
    
    def load_latest_chat(self, world_name):
        """Gets the most recently updated chat for a world.
        
        Args:
            world_name: The name of the world
            
        Returns:
            dict: The chat data or None if no chats found
        """
        chat_dir = self._get_chat_dir(world_name)
        
        # Find all chat files
        chat_files = list(chat_dir.glob("*.json"))
        
        if not chat_files:
            self.logger.log_step(f"No chat files found for world '{world_name}'")
            return None
        
        # Sort by modification time (newest first)
        chat_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        
        # Load the most recent chat
        try:
            latest_chat_file = chat_files[0]
            self.logger.log_step(f"Loading latest chat from {latest_chat_file}")
            
            with open(latest_chat_file, 'r', encoding='utf-8') as f:
                chat_data = json.load(f)
                
            # Ensure metadata has chat_id
            if "metadata" not in chat_data:
                chat_data["metadata"] = {}
            
            if "chat_id" not in chat_data["metadata"]:
                chat_id = latest_chat_file.stem
                chat_data["metadata"]["chat_id"] = chat_id
                
            return chat_data
        except Exception as e:
            self.logger.log_error(f"Error loading latest chat: {str(e)}")
            return None
    
    def save_chat(self, world_name, chat_id, chat_data):
        """Saves a chat session for a world.
        
        Args:
            world_name: The name of the world
            chat_id: The ID of the chat
            chat_data: The chat data to save
            
        Returns:
            bool: True if successful, False otherwise
        """
        chat_dir = self._get_chat_dir(world_name)
        
        # Ensure chat_id is valid
        safe_chat_id = chat_id.replace('/', '_').replace('\\', '_')
        
        # Make sure chat data has metadata with chat_id
        if "metadata" not in chat_data:
            chat_data["metadata"] = {}
        
        chat_data["metadata"]["chat_id"] = safe_chat_id
        chat_data["metadata"]["updated_at"] = time.time()
        
        # Save to file
        try:
            chat_file = chat_dir / f"{safe_chat_id}.json"
            self.logger.log_step(f"Saving chat to {chat_file}")
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, ensure_ascii=False, indent=2)
                
            return True
        except Exception as e:
            self.logger.log_error(f"Error saving chat: {str(e)}")
            return False
    
    def get_chat(self, world_name, chat_id):
        """Gets a specific chat by ID.
        
        Args:
            world_name: The name of the world
            chat_id: The ID of the chat to get
            
        Returns:
            dict: The chat data or None if not found
        """
        chat_dir = self._get_chat_dir(world_name)
        
        # Ensure chat_id is valid
        safe_chat_id = chat_id.replace('/', '_').replace('\\', '_')
        
        chat_file = chat_dir / f"{safe_chat_id}.json"
        
        if not chat_file.exists():
            return None
        
        try:
            with open(chat_file, 'r', encoding='utf-8') as f:
                chat_data = json.load(f)
            
            return chat_data
        except Exception as e:
            self.logger.log_error(f"Error loading chat {chat_id}: {str(e)}")
            return None
    
    def create_chat(self, world_name, title="", location_id=""):
        """Creates a new chat session for a world.
        
        Args:
            world_name: The name of the world
            title: Optional title for the chat
            location_id: Optional location ID to associate with the chat
            
        Returns:
            dict: The newly created chat data
        """
        chat_id = f"chat_{uuid.uuid4().hex[:8]}"
        
        chat_data = {
            "messages": [],
            "metadata": {
                "chat_id": chat_id,
                "world_name": world_name,
                "title": title or f"Chat {time.strftime('%Y-%m-%d')}",
                "location_id": location_id,
                "created_at": time.time(),
                "updated_at": time.time()
            }
        }
        
        # Save the new chat
        success = self.save_chat(world_name, chat_id, chat_data)
        
        if not success:
            raise Exception("Failed to save new chat")
        
        return chat_data
    
    def list_chats(self, world_name):
        """Lists all chats for a world.
        
        Args:
            world_name: The name of the world
            
        Returns:
            list: List of chat metadata
        """
        chat_dir = self._get_chat_dir(world_name)
        
        # Find all chat files
        chat_files = list(chat_dir.glob("*.json"))
        
        if not chat_files:
            return []
        
        # Sort by modification time (newest first)
        chat_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        
        # Extract metadata from each chat
        result = []
        for chat_file in chat_files:
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    chat_data = json.load(f)
                
                metadata = chat_data.get("metadata", {})
                metadata["message_count"] = len(chat_data.get("messages", []))
                
                # Use filename as chat_id if not in metadata
                if "chat_id" not in metadata:
                    metadata["chat_id"] = chat_file.stem
                
                result.append(metadata)
            except Exception as e:
                self.logger.log_error(f"Error loading chat metadata for {chat_file}: {str(e)}")
        
        return result
    
    def delete_chat(self, world_name, chat_id):
        """Deletes a chat session.
        
        Args:
            world_name: The name of the world
            chat_id: The ID of the chat to delete
            
        Returns:
            bool: True if successful, False if not found
        """
        chat_dir = self._get_chat_dir(world_name)
        
        # Ensure chat_id is valid
        safe_chat_id = chat_id.replace('/', '_').replace('\\', '_')
        
        chat_file = chat_dir / f"{safe_chat_id}.json"
        
        if not chat_file.exists():
            return False
        
        try:
            chat_file.unlink()
            return True
        except Exception as e:
            self.logger.log_error(f"Error deleting chat {chat_id}: {str(e)}")
            return False
"""
WorldCardChatHandler - Handles chat sessions for world cards
"""

import os
import json
from pathlib import Path
import uuid
import time
from typing import Dict, List, Any, Optional
from backend.errors import CardSharkError, ErrorType, ErrorMessages
import traceback
import re
from datetime import datetime
from backend.log_manager import LogManager

class WorldCardChatHandler:
    """Handles chat sessions for world cards."""

    def __init__(self, logger: LogManager, worlds_path=None):
        self.logger = logger
        self.chats_base_dir = worlds_path if worlds_path else Path("./worlds")
        self.logger.log_step(f"WorldCardChatHandler initialized with chats base directory: {self.chats_base_dir}")
        # Ensure the base directory exists
        self.chats_base_dir.mkdir(parents=True, exist_ok=True)
    
    def get_world_chats_dir(self, world_name: str) -> Path:
        """Get the directory path for a specific world's chats."""
        return self.chats_base_dir / world_name / "chats"
    
    def ensure_chats_dir(self, world_name: str) -> Path:
        """Ensure the chats directory exists for a world."""
        chats_dir = self.get_world_chats_dir(world_name)
        chats_dir.mkdir(parents=True, exist_ok=True)
        return chats_dir
    
    def list_chats(self, world_name: str) -> List[Dict[str, Any]]:
        """List available chat sessions for a world."""
        try:
            chats_dir = self.get_world_chats_dir(world_name)
            if not chats_dir.exists():
                self.logger.log_step(f"No chats directory found for world '{world_name}', creating it")
                self.ensure_chats_dir(world_name)
                return []
                
            chats = []
            for chat_file in chats_dir.glob("*.json"):
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        chat_data = json.load(f)
                        
                    chats.append({
                        "id": chat_data.get("id", chat_file.stem),
                        "title": chat_data.get("title", "Untitled Chat"),
                        "created": chat_data.get("created", ""),
                        "updated": chat_data.get("updated", ""),
                        "message_count": len(chat_data.get("messages", [])),
                        "participants": chat_data.get("participants", []),
                        "location_id": chat_data.get("location_id", "")
                    })
                except Exception as e:
                    self.logger.log_error(f"Error loading chat file {chat_file}: {str(e)}")
                    # Skip invalid files
            
            # Sort by updated time, newest first
            chats.sort(key=lambda x: x.get("updated", ""), reverse=True)
            return chats
            
        except Exception as e:
            self.logger.log_error(f"Error listing chats for world '{world_name}': {str(e)}")
            return []
    
    def create_chat(self, world_name: str, title: str, location_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a new chat session for a world."""
        try:
            chats_dir = self.ensure_chats_dir(world_name)
            
            # Generate a unique chat ID
            chat_id = f"chat_{uuid.uuid4().hex[:8]}"
            timestamp = datetime.now().isoformat()
            
            # Create the chat data structure
            chat_data = {
                "id": chat_id,
                "title": title,
                "created": timestamp,
                "updated": timestamp,
                "messages": [],
                "participants": [],
                "location_id": location_id or ""
            }
            
            # Save to file
            chat_path = chats_dir / f"{chat_id}.json"
            with open(chat_path, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, indent=2)
                
            self.logger.log_step(f"Created new chat '{title}' (ID: {chat_id}) for world '{world_name}'")
            return chat_data
            
        except Exception as e:
            self.logger.log_error(f"Error creating chat for world '{world_name}': {str(e)}")
            raise ValueError(f"Failed to create chat: {str(e)}")
    
    def get_chat(self, world_name: str, chat_id: str) -> Dict[str, Any]:
        """Get a specific chat session."""
        try:
            chats_dir = self.get_world_chats_dir(world_name)
            chat_path = chats_dir / f"{chat_id}.json"
            
            if not chat_path.exists():
                self.logger.log_warning(f"Chat with ID '{chat_id}' not found for world '{world_name}'")
                raise ValueError(f"Chat not found: {chat_id}")
                
            with open(chat_path, 'r', encoding='utf-8') as f:
                chat_data = json.load(f)
                
            return chat_data
            
        except ValueError:
            # Re-raise ValueError for specific errors
            raise
        except Exception as e:
            self.logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
            raise ValueError(f"Failed to get chat: {str(e)}")
    
    def add_message(self, world_name: str, chat_id: str, sender: str, content: str, 
                  character_id: Optional[str] = None, is_user: bool = False) -> Dict[str, Any]:
        """Add a message to an existing chat session."""
        try:
            # Get the current chat data
            chat_data = self.get_chat(world_name, chat_id)
            
            # Create the message
            timestamp = datetime.now().isoformat()
            message = {
                "id": f"msg_{uuid.uuid4().hex[:8]}",
                "timestamp": timestamp,
                "sender": sender,
                "content": content,
                "character_id": character_id,
                "is_user": is_user
            }
            
            # Add to messages list
            chat_data["messages"].append(message)
            
            # Update metadata
            chat_data["updated"] = timestamp
            
            # Add to participants if not already there
            if sender not in chat_data["participants"]:
                chat_data["participants"].append(sender)
            
            # Save the updated chat
            chats_dir = self.get_world_chats_dir(world_name)
            chat_path = chats_dir / f"{chat_id}.json"
            with open(chat_path, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, indent=2)
                
            self.logger.log_step(f"Added message from '{sender}' to chat '{chat_id}' in world '{world_name}'")
            return chat_data
            
        except ValueError:
            # Re-raise ValueError for specific errors
            raise
        except Exception as e:
            self.logger.log_error(f"Error adding message to chat '{chat_id}' in world '{world_name}': {str(e)}")
            raise ValueError(f"Failed to add message: {str(e)}")
    
    def delete_chat(self, world_name: str, chat_id: str) -> bool:
        """Delete a chat session."""
        try:
            chats_dir = self.get_world_chats_dir(world_name)
            chat_path = chats_dir / f"{chat_id}.json"
            
            if not chat_path.exists():
                self.logger.log_warning(f"Chat with ID '{chat_id}' not found for deletion in world '{world_name}'")
                return False
                
            # Delete the file
            chat_path.unlink()
            self.logger.log_step(f"Deleted chat '{chat_id}' from world '{world_name}'")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error deleting chat '{chat_id}' from world '{world_name}': {str(e)}")
            return False
            
    def load_latest_chat(self, world_name: str) -> Optional[Dict[str, Any]]:
        """Load the latest chat session for a world."""
        try:
            chats = self.list_chats(world_name)
            if not chats:
                self.logger.log_step(f"No chats found for world '{world_name}'")
                return None
                
            # Get the most recent chat (list_chats already sorts by updated time)
            latest_chat_info = chats[0]
            chat_id = latest_chat_info["id"]
            
            # Load the full chat data
            return self.get_chat(world_name, chat_id)
            
        except Exception as e:
            self.logger.log_error(f"Error loading latest chat for world '{world_name}': {str(e)}")
            traceback.print_exc()  # Print full traceback for debugging
            raise ValueError(f"Failed to load latest chat: {str(e)}")

    def save_chat(self, world_name: str, chat_id: str, chat_data: Dict[str, Any]) -> bool:
        """Save a chat session for a world."""
        try:
            if not chat_data:
                raise ValueError("No chat data provided")
                
            # Use the provided chat_id instead of extracting from metadata
            if not chat_id:
                chat_id = f"chat_{uuid.uuid4().hex[:8]}"
            
            # Ensure chat_id is in metadata
            if "metadata" not in chat_data:
                chat_data["metadata"] = {}
            chat_data["metadata"]["chat_id"] = chat_id
                
            # Prepare the chat format for storage
            formatted_chat = {
                "id": chat_id,
                "title": chat_data.get("metadata", {}).get("title", f"Chat {datetime.now().strftime('%Y-%m-%d')}"),
                "created": chat_data.get("metadata", {}).get("created_at", datetime.now().isoformat()),
                "updated": datetime.now().isoformat(),
                "messages": chat_data.get("messages", []),
                "participants": list(set([msg.get("role") for msg in chat_data.get("messages", []) if msg.get("role")])),
                "location_id": chat_data.get("metadata", {}).get("location_id", ""),
                "metadata": chat_data.get("metadata", {})
            }
            
            # Ensure the chat directory exists
            chats_dir = self.ensure_chats_dir(world_name)
            
            # Save to file
            chat_path = chats_dir / f"{chat_id}.json"
            with open(chat_path, 'w', encoding='utf-8') as f:
                json.dump(formatted_chat, f, indent=2)
                
            self.logger.log_step(f"Saved chat '{chat_id}' for world '{world_name}' with {len(formatted_chat['messages'])} messages")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
            traceback.print_exc()  # Print full traceback for debugging
            raise ValueError(f"Failed to save chat: {str(e)}")
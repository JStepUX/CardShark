#!/usr/bin/env python3
"""
Test the simplified character indexing service that uses database-first approach
with directory patching on page load.
"""

import pytest
import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.services.character_indexing_service import CharacterIndexingService

class MockCharacterService:
    """Mock character service for testing"""
    
    def get_all_characters(self):
        # Simulate returning characters from database
        return []
    
    def _get_character_dirs(self):
        # Return the actual characters directory
        return [str(Path(__file__).parent / "characters")]
    
    def get_character_by_path(self, file_path):
        return None
    
    def count_all_characters(self):
        return 0
    
    class png_handler:
        @staticmethod
        def read_metadata(file_path):
            return {"data": {"name": "Test Character"}}

class MockSettingsManager:
    """Mock settings manager for testing"""
    pass

class MockLogger:
    """Mock logger for testing"""
    
    def log_info(self, message):
        print(f"ℹ️  {message}")
    
    def log_warning(self, message):
        print(f"⚠️  {message}")
    
    def log_error(self, message):
        print(f"❌ {message}")

@pytest.fixture
def mock_services():
    """Fixture providing mock services for testing"""
    character_service = MockCharacterService()
    settings_manager = MockSettingsManager()
    logger = MockLogger()
    return character_service, settings_manager, logger

@pytest.fixture
def indexing_service(mock_services):
    """Fixture providing a CharacterIndexingService instance"""
    character_service, settings_manager, logger = mock_services
    return CharacterIndexingService(character_service, settings_manager, logger)

@pytest.mark.asyncio
async def test_indexing_service_creation(indexing_service):
    """Test that the indexing service can be created successfully"""
    assert indexing_service is not None
    assert hasattr(indexing_service, 'get_indexing_status')
    assert hasattr(indexing_service, 'get_characters_with_directory_sync')

@pytest.mark.asyncio
async def test_get_indexing_status(indexing_service):
    """Test getting indexing status"""
    status = await indexing_service.get_indexing_status()
    assert status is not None
    assert isinstance(status, dict)

@pytest.mark.asyncio
async def test_get_characters_with_directory_sync(indexing_service):
    """Test loading characters with directory sync"""
    characters = await indexing_service.get_characters_with_directory_sync()
    assert characters is not None
    assert isinstance(characters, list)
    # With mock service, we expect 0 characters
    assert len(characters) == 0

@pytest.mark.asyncio
async def test_indexing_smoke(indexing_service):
    """Smoke test for the complete indexing workflow"""
    # Test indexing status
    status = await indexing_service.get_indexing_status()
    assert "total_characters" in status or status is not None
    
    # Test directory sync
    chars = await indexing_service.get_characters_with_directory_sync()
    assert chars == []

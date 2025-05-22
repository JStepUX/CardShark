import pytest
from sqlalchemy.orm import Session
from unittest.mock import MagicMock

from backend.services import world_service
from backend import schemas as pydantic_models
from backend import sql_models

def test_create_world_success():
    """Test successful creation of a world."""
    mock_db = MagicMock(spec=Session)
    world_create_data = pydantic_models.WorldCreate(name="Test World", description="A world for testing")

    # Mock the database commit and refresh operations
    mock_db.add.return_value = None
    mock_db.commit.return_value = None
    mock_db.refresh.return_value = None

    # Mock the return value of the SQL model instance after it's added to the session
    # This simulates the ORM behavior where the instance gets attributes like uuid populated
    def side_effect_add(instance):
        if isinstance(instance, sql_models.World):
            instance.uuid = "test-uuid-123" # Simulate UUID generation
            instance.id = 1 # Simulate ID generation
            # Ensure all fields from WorldCreate are present
            instance.name = world_create_data.name
            instance.description = world_create_data.description
            instance.world_card_image_url = None # Default or expected value
            instance.rooms = [] # Default or expected value
            instance.characters = [] # Default or expected value
            instance.lore = [] # Default or expected value
            instance.world_chats = [] # Default or expected value


    mock_db.add.side_effect = side_effect_add

    created_world = world_service.create_world(db=mock_db, world=world_create_data)

    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once_with(mock_db.add.call_args[0][0]) # assert refresh was called with the world instance

    assert created_world is not None
    assert created_world.name == world_create_data.name
    assert created_world.description == world_create_data.description
    assert hasattr(created_world, 'uuid') # Check if uuid is set (simulated)
    assert created_world.uuid == "test-uuid-123"

def test_create_world_empty_name():
    """Test world creation with an empty name (if allowed, or expect error if not)."""
    mock_db = MagicMock(spec=Session)
    # Assuming empty name might be handled by validation or DB constraints
    # For this test, we'll assume the service attempts to create it.
    world_create_data = pydantic_models.WorldCreate(name="", description="Test empty name")

    def side_effect_add(instance):
        if isinstance(instance, sql_models.World):
            instance.uuid = "test-uuid-456"
            instance.id = 2
            instance.name = world_create_data.name
            instance.description = world_create_data.description
            instance.world_card_image_url = None
            instance.rooms = []
            instance.characters = []
            instance.lore = []
            instance.world_chats = []


    mock_db.add.side_effect = side_effect_add

    created_world = world_service.create_world(db=mock_db, world=world_create_data)

    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()

    assert created_world is not None
    assert created_world.name == ""
    assert created_world.uuid == "test-uuid-456"

def test_create_world_db_error_on_add(caplog):
    """Test world creation when database add operation fails."""
    mock_db = MagicMock(spec=Session)
    world_create_data = pydantic_models.WorldCreate(name="Error World", description="Test DB error")

    mock_db.add.side_effect = Exception("DB Add Error")
    mock_db.commit.return_value = None # Should not be called if add fails and is not caught
    mock_db.refresh.return_value = None # Should not be called

    with pytest.raises(Exception, match="DB Add Error"):
        world_service.create_world(db=mock_db, world=world_create_data)

    mock_db.add.assert_called_once()
    mock_db.commit.assert_not_called()
    mock_db.refresh.assert_not_called()

def test_create_world_db_error_on_commit(caplog):
    """Test world creation when database commit operation fails."""
    mock_db = MagicMock(spec=Session)
    world_create_data = pydantic_models.WorldCreate(name="Commit Fail World", description="Test DB commit error")

    mock_db.add.return_value = None
    mock_db.commit.side_effect = Exception("DB Commit Error")
    mock_db.refresh.return_value = None # Should not be called

    with pytest.raises(Exception, match="DB Commit Error"):
        world_service.create_world(db=mock_db, world=world_create_data)

    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_not_called()
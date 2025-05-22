import pytest
import json
import os
import uuid
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch, call

from backend.world_state_manager import WorldStateManager

# Helper to create a dummy logger
def create_mock_logger():
    logger = MagicMock()
    logger.log_error = MagicMock()
    logger.log_warning = MagicMock()
    logger.log_step = MagicMock()
    return logger

@pytest.fixture
def mock_logger():
    return create_mock_logger()

@pytest.fixture
def world_state_manager(tmp_path, mock_logger):
    # Patch the base directory to use tmp_path for tests
    with patch('backend.world_state_manager.__file__', new_callable=MagicMock(return_value=str(tmp_path / "dummy_module" / "dummy_backend_file.py"))):
        # This makes worlds_base_dir = tmp_path / "worlds"
        # (tmp_path / "dummy_module" / "dummy_backend_file.py").parent.parent -> tmp_path
        manager = WorldStateManager(logger=mock_logger)
        # Explicitly set worlds_base_dir to tmp_path / "worlds" for clarity and control in tests
        manager.worlds_base_dir = tmp_path / "worlds"
        manager.worlds_base_dir.mkdir(parents=True, exist_ok=True) # Ensure base dir exists
        return manager

@pytest.fixture
def test_world_name():
    return "test_world"

@pytest.fixture
def test_world_dir(world_state_manager, test_world_name):
    # This uses the manager's _get_world_dir which includes sanitization
    return world_state_manager._get_world_dir(test_world_name)

class TestWorldStateManager:

    def test_init(self, tmp_path, mock_logger):
        # Path needs to simulate being two levels down from the desired "project root" (tmp_path in this case)
        # So, dummy_backend_file.py is inside a dummy_module directory, which is inside tmp_path.
        # Path(__file__).parent.parent should then resolve to tmp_path.
        # Then (tmp_path / "worlds") is the target.
        with patch('backend.world_state_manager.__file__', new_callable=MagicMock(return_value=str(tmp_path / "dummy_module" / "dummy_backend_file.py"))):
            manager = WorldStateManager(logger=mock_logger)
            # Expected: (tmp_path / "dummy_module" / "dummy_backend_file.py").parent.parent / "worlds"
            # which simplifies to tmp_path / "worlds"
            assert manager.worlds_base_dir == tmp_path / "worlds"
            assert manager.logger == mock_logger

    def test_get_world_dir(self, world_state_manager, test_world_name, tmp_path):
        expected_path = tmp_path / "worlds" / test_world_name
        assert world_state_manager._get_world_dir(test_world_name) == expected_path

    def test_get_world_dir_sanitization(self, world_state_manager, tmp_path):
        invalid_name = "../another/world!@#"
        # re.sub(r'[^\w\-]+', '_', "../another/world!@#") results in "_another_world_"
        # because ".." -> "_", "/" -> "_", "another" -> "another", "/" -> "_", "world" -> "world", "!@#" -> "_"
        sanitized_name = "_another_world_"
        expected_path = tmp_path / "worlds" / sanitized_name
        assert world_state_manager._get_world_dir(invalid_name) == expected_path

    def test_get_world_dir_invalid_name_empty_after_sanitize(self, world_state_manager):
        with pytest.raises(ValueError, match="Invalid world name provided."):
            world_state_manager._get_world_dir("") # Only an empty input sanitizes to empty

    def test_get_world_state_path(self, world_state_manager, test_world_name, test_world_dir):
        expected_path = test_world_dir / "world_state.json"
        assert world_state_manager._get_world_state_path(test_world_name) == expected_path

    def test_get_world_metadata_path(self, world_state_manager, test_world_name, test_world_dir):
        expected_path = test_world_dir / "metadata.json"
        assert world_state_manager._get_world_metadata_path(test_world_name) == expected_path

    def test_validate_world_state_valid(self, world_state_manager):
        state = {"metadata": {}, "other_data": "value"}
        assert world_state_manager._validate_world_state(state) is True

    def test_validate_world_state_missing_metadata(self, world_state_manager, mock_logger):
        state = {"other_data": "value"}
        assert world_state_manager._validate_world_state(state) is False
        mock_logger.log_error.assert_called_once_with("World state validation failed: missing required field 'metadata'")

    def test_validate_world_state_file_valid(self, world_state_manager, tmp_path):
        valid_state = {"metadata": {}}
        file_path = tmp_path / "valid_state.json"
        with open(file_path, "w") as f:
            json.dump(valid_state, f)
        
        assert world_state_manager._validate_world_state_file(file_path) is True

    def test_validate_world_state_file_invalid_json(self, world_state_manager, tmp_path, mock_logger):
        file_path = tmp_path / "invalid_json.json"
        with open(file_path, "w") as f:
            f.write("this is not json")
        
        assert world_state_manager._validate_world_state_file(file_path) is False
        mock_logger.log_error.assert_called_once_with(f"World state file validation failed: invalid JSON in {file_path}")

    def test_validate_world_state_file_missing_field(self, world_state_manager, tmp_path, mock_logger):
        invalid_state = {"data": "no_metadata"}
        file_path = tmp_path / "missing_field.json"
        with open(file_path, "w") as f:
            json.dump(invalid_state, f)
        
        assert world_state_manager._validate_world_state_file(file_path) is False
        mock_logger.log_error.assert_called_with("World state validation failed: missing required field 'metadata'") # Called by _validate_world_state

    def test_validate_world_state_file_generic_exception(self, world_state_manager, tmp_path, mock_logger):
        file_path = tmp_path / "error.json"
        # Create a scenario that might cause a generic error, e.g., by mocking open to raise an unexpected error
        with patch('builtins.open', side_effect=OSError("Disk full")):
            assert world_state_manager._validate_world_state_file(file_path) is False
        mock_logger.log_error.assert_called_with("World state file validation failed: Disk full")

    @patch('backend.world_state_manager.os.replace')
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_state_success_new_file(self, mock_uuid, mock_os_replace, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid.return_value = "test-uuid"
        state_to_save = {"data": "my_world_data"}
        
        # Ensure _validate_world_state_file returns True for the temp file
        world_state_manager._validate_world_state_file = MagicMock(return_value=True)

        result = world_state_manager.save_world_state(test_world_name, state_to_save)
        assert result is True

        # Check directory structure
        assert (test_world_dir / "images" / "backgrounds").exists()
        assert (test_world_dir / "images" / "objects").exists()
        assert (test_world_dir / "chats").exists()
        assert (test_world_dir / "events").exists()

        state_file = test_world_dir / "world_state.json"
        temp_file_path = test_world_dir / "world_state.test-uuid.tmp"
        
        mock_os_replace.assert_called_once_with(temp_file_path, state_file)
        
        # Check content of the temporary file, as os.replace is mocked
        assert temp_file_path.exists()
        with open(temp_file_path, "r") as f:
            saved_state = json.load(f)
        
        assert saved_state["data"] == "my_world_data"
        assert "metadata" in saved_state
        assert saved_state["metadata"]["version"] == "1.0"
        assert "last_modified" in saved_state["metadata"]
        
        mock_logger.log_step.assert_any_call(f"World state for '{test_world_name}' saved to {state_file}")
        world_state_manager._validate_world_state_file.assert_called_once_with(temp_file_path)


    @patch('backend.world_state_manager.os.replace')
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_state_success_existing_file_backup(self, mock_uuid, mock_os_replace, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid_values = ["backup-uuid", "temp-uuid"]
        mock_uuid.side_effect = mock_uuid_values # First for backup, second for temp file

        # Create an existing state file
        state_file = test_world_dir / "world_state.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        initial_state = {"metadata": {"version": "0.5"}, "initial_data": "old"}
        with open(state_file, "w") as f:
            json.dump(initial_state, f)

        state_to_save = {"data": "updated_data", "metadata": {"custom_meta": "value"}}
        
        world_state_manager._validate_world_state_file = MagicMock(return_value=True)

        result = world_state_manager.save_world_state(test_world_name, state_to_save)
        assert result is True

        # SUT call order for uuid.uuid4(): 1. temp_file, 2. backup_file
        actual_temp_file_uuid = mock_uuid_values[0]
        actual_backup_file_uuid = mock_uuid_values[1]

        temp_file_path = test_world_dir / f"world_state.{actual_temp_file_uuid}.tmp"
        backup_file_path = test_world_dir / f"world_state.backup.{actual_backup_file_uuid}.json"

        expected_calls = [
            call(state_file, backup_file_path), # Backup creation
            call(temp_file_path, state_file)    # Atomic replace
        ]
        mock_os_replace.assert_has_calls(expected_calls)
        
        # Check content of the temporary file, as os.replace is mocked
        assert temp_file_path.exists()
        with open(temp_file_path, "r") as f:
            saved_state = json.load(f)
        
        assert saved_state["data"] == "updated_data"
        assert saved_state["metadata"]["custom_meta"] == "value"
        assert saved_state["metadata"]["version"] == "1.0" # Version added if not present
        assert "last_modified" in saved_state["metadata"]

        mock_logger.log_step.assert_any_call(f"Created backup of world state at {backup_file_path}")
        mock_logger.log_step.assert_any_call(f"World state for '{test_world_name}' saved to {state_file}")
        world_state_manager._validate_world_state_file.assert_called_once_with(temp_file_path)

    @patch('backend.world_state_manager.os.replace')
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_state_validation_fails(self, mock_uuid, mock_os_replace, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid.return_value = "test-uuid"
        state_to_save = {"invalid_data_no_metadata": True} # This will fail validation

        # Mock _validate_world_state_file to return False
        world_state_manager._validate_world_state_file = MagicMock(return_value=False)
        
        temp_file_path = test_world_dir / "world_state.test-uuid.tmp"

        result = world_state_manager.save_world_state(test_world_name, state_to_save)
        assert result is False
        
        mock_logger.log_error.assert_called_with("Failed to save world state: World state validation failed")
        assert not (test_world_dir / "world_state.json").exists() # Should not have been created/replaced
        assert not temp_file_path.exists() # Temp file should be cleaned up
        mock_os_replace.assert_not_called() # os.replace should not be called if validation fails

    @patch('backend.world_state_manager.os.replace', side_effect=OSError("Disk write error"))
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_state_os_replace_error(self, mock_uuid, mock_os_replace_error, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid.return_value = "test-uuid"
        state_to_save = {"metadata": {}, "data": "some_data"}
        
        world_state_manager._validate_world_state_file = MagicMock(return_value=True)
        temp_file_path = test_world_dir / "world_state.test-uuid.tmp"

        result = world_state_manager.save_world_state(test_world_name, state_to_save)
        assert result is False
        
        mock_logger.log_error.assert_called_with("Failed to save world state: Disk write error")
        assert not (test_world_dir / "world_state.json").exists()
        assert not temp_file_path.exists() # Temp file should be cleaned up

    def test_save_world_state_mkdir_exception(self, world_state_manager, test_world_name, mock_logger):
        state_to_save = {"metadata": {}, "data": "some_data"}
        
        # Mock Path.mkdir to raise an exception
        with patch.object(Path, 'mkdir', side_effect=OSError("Permission denied")):
            result = world_state_manager.save_world_state(test_world_name, state_to_save)
            assert result is False
        
        mock_logger.log_error.assert_any_call(f"Error saving world state for '{test_world_name}': Permission denied")


    def test_load_world_state_success(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        state_file = test_world_dir / "world_state.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        expected_state = {"metadata": {"version": "1.0"}, "data": "my_world_data"}
        with open(state_file, "w") as f:
            json.dump(expected_state, f)

        # Mock _validate_world_state to return True
        world_state_manager._validate_world_state = MagicMock(return_value=True)

        loaded_state = world_state_manager.load_world_state(test_world_name)
        assert loaded_state == expected_state
        mock_logger.log_step.assert_called_once_with(f"World state for '{test_world_name}' loaded successfully from {state_file}")
        world_state_manager._validate_world_state.assert_called_once_with(expected_state)

    def test_load_world_state_file_not_found(self, world_state_manager, test_world_name, mock_logger):
        state_file = world_state_manager._get_world_state_path(test_world_name)
        loaded_state = world_state_manager.load_world_state(test_world_name)
        assert loaded_state == {}
        mock_logger.log_warning.assert_called_once_with(f"World state file not found for '{test_world_name}' at {state_file}")

    def test_load_world_state_invalid_json(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        state_file = test_world_dir / "world_state.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        with open(state_file, "w") as f:
            f.write("this is not json")

        # Mock recovery to return an empty dict to isolate this test
        world_state_manager._recover_world_state = MagicMock(return_value={"recovered": False})

        loaded_state = world_state_manager.load_world_state(test_world_name)
        assert loaded_state == {"recovered": False}
        mock_logger.log_error.assert_called_once_with(f"Invalid JSON in world state file for '{test_world_name}'")
        world_state_manager._recover_world_state.assert_called_once_with(test_world_name)

    def test_load_world_state_validation_fails_triggers_recovery(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        state_file = test_world_dir / "world_state.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        invalid_state = {"no_metadata_here": True}
        with open(state_file, "w") as f:
            json.dump(invalid_state, f)

        # Mock _validate_world_state to return False
        world_state_manager._validate_world_state = MagicMock(return_value=False)
        # Mock recovery
        recovered_data = {"metadata": {}, "recovered_data": True}
        world_state_manager._recover_world_state = MagicMock(return_value=recovered_data)

        loaded_state = world_state_manager.load_world_state(test_world_name)
        assert loaded_state == recovered_data
        mock_logger.log_warning.assert_called_once_with(f"World state validation failed for '{test_world_name}', attempting to recover")
        world_state_manager._validate_world_state.assert_called_once_with(invalid_state)
        world_state_manager._recover_world_state.assert_called_once_with(test_world_name)

    def test_load_world_state_generic_exception(self, world_state_manager, test_world_name, mock_logger):
        # Mock _get_world_state_path to raise an error or open to raise an error
        with patch.object(world_state_manager, '_get_world_state_path', side_effect=OSError("Cannot access path")):
            loaded_state = world_state_manager.load_world_state(test_world_name)
            assert loaded_state == {}
        mock_logger.log_error.assert_any_call(f"Error loading world state for '{test_world_name}': Cannot access path")

    def test_recover_world_state_success(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        test_world_dir.mkdir(parents=True, exist_ok=True)
        
        # Create backup files
        backup1_state = {"metadata": {}, "data": "backup1_data"}
        backup2_state = {"metadata": {}, "data": "backup2_data_newer"} # This one is newer
        
        backup1_file = test_world_dir / "world_state.backup.uuid1.json"
        backup2_file = test_world_dir / "world_state.backup.uuid2.json"

        with open(backup1_file, "w") as f: json.dump(backup1_state, f)
        # Make backup2 newer by touching it after creation or setting mtime
        with open(backup2_file, "w") as f: json.dump(backup2_state, f)
        os.utime(backup1_file, (100, 100)) # Older timestamp
        os.utime(backup2_file, (200, 200)) # Newer timestamp

        # Mock _validate_world_state to accept valid states
        world_state_manager._validate_world_state = MagicMock(return_value=True)

        recovered_state = world_state_manager._recover_world_state(test_world_name)
        assert recovered_state == backup2_state # Should load the newest valid backup
        mock_logger.log_step.assert_called_once_with(f"Successfully recovered world state for '{test_world_name}' from {backup2_file}")

    def test_recover_world_state_one_valid_one_invalid_backup(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        test_world_dir.mkdir(parents=True, exist_ok=True)
        
        valid_backup_state = {"metadata": {}, "data": "valid_backup"}
        invalid_backup_state = {"no_metadata": "invalid"} # Will fail validation
        
        valid_backup_file = test_world_dir / "world_state.backup.valid.json"
        invalid_backup_file = test_world_dir / "world_state.backup.invalid.json"

        with open(valid_backup_file, "w") as f: json.dump(valid_backup_state, f)
        with open(invalid_backup_file, "w") as f: json.dump(invalid_backup_state, f)
        
        # Make invalid_backup_file newer
        os.utime(valid_backup_file, (100, 100))
        os.utime(invalid_backup_file, (200, 200))

        # _validate_world_state should return True for valid_backup_state, False for invalid_backup_state
        def mock_validate_side_effect(state):
            return "metadata" in state
        world_state_manager._validate_world_state = MagicMock(side_effect=mock_validate_side_effect)

        recovered_state = world_state_manager._recover_world_state(test_world_name)
        assert recovered_state == valid_backup_state
        mock_logger.log_step.assert_called_once_with(f"Successfully recovered world state for '{test_world_name}' from {valid_backup_file}")
        # Ensure it tried the newer invalid one first
        assert world_state_manager._validate_world_state.call_args_list[0] == call(invalid_backup_state)
        assert world_state_manager._validate_world_state.call_args_list[1] == call(valid_backup_state)


    def test_recover_world_state_no_backups(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        test_world_dir.mkdir(parents=True, exist_ok=True) # Ensure dir exists but no backups
        
        recovered_state = world_state_manager._recover_world_state(test_world_name)
        assert recovered_state == {}
        mock_logger.log_warning.assert_called_once_with(f"No backup files found for '{test_world_name}'")

    def test_recover_world_state_all_backups_invalid(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        test_world_dir.mkdir(parents=True, exist_ok=True)
        
        backup1_state = {"no_metadata1": True}
        backup2_state = {"no_metadata2": True}
        
        backup1_file = test_world_dir / "world_state.backup.uuid1.json"
        backup2_file = test_world_dir / "world_state.backup.uuid2.json"

        with open(backup1_file, "w") as f: json.dump(backup1_state, f)
        with open(backup2_file, "w") as f: json.dump(backup2_state, f)
        os.utime(backup1_file, (100, 100))
        os.utime(backup2_file, (200, 200))

        world_state_manager._validate_world_state = MagicMock(return_value=False) # All fail validation

        recovered_state = world_state_manager._recover_world_state(test_world_name)
        assert recovered_state == {}
        mock_logger.log_error.assert_called_once_with(f"Failed to recover world state for '{test_world_name}' from any backup")

    def test_recover_world_state_glob_exception(self, world_state_manager, test_world_name, mock_logger):
        with patch.object(Path, 'glob', side_effect=OSError("Glob error")):
            recovered_state = world_state_manager._recover_world_state(test_world_name)
            assert recovered_state == {}
        mock_logger.log_error.assert_any_call(f"Error recovering world state for '{test_world_name}': Glob error")

    @patch('backend.world_state_manager.os.replace')
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_metadata_success_new_file(self, mock_uuid, mock_os_replace, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid.return_value = "meta-uuid"
        metadata_to_save = {"author": "test_author", "description": "A test world."}
        
        result = world_state_manager.save_world_metadata(test_world_name, metadata_to_save)
        assert result is True

        assert test_world_dir.exists() # Should be created if not already

        metadata_file = test_world_dir / "metadata.json"
        temp_file_path = test_world_dir / "metadata.meta-uuid.tmp"
        
        mock_os_replace.assert_called_once_with(temp_file_path, metadata_file)
        
        # Check content of the temporary file, as os.replace is mocked
        assert temp_file_path.exists()
        with open(temp_file_path, "r") as f:
            saved_metadata = json.load(f)
        
        assert saved_metadata["author"] == "test_author"
        assert saved_metadata["description"] == "A test world."
        assert saved_metadata["version"] == "1.0"
        assert "last_modified" in saved_metadata
        
        mock_logger.log_step.assert_called_once_with(f"World metadata for '{test_world_name}' saved to {metadata_file}")

    @patch('backend.world_state_manager.os.replace')
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_metadata_success_existing_file_backup(self, mock_uuid, mock_os_replace, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid_values = ["backup-meta-uuid", "temp-meta-uuid"]
        mock_uuid.side_effect = mock_uuid_values

        metadata_file = test_world_dir / "metadata.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        initial_metadata = {"version": "0.5", "initial_author": "old_author"}
        with open(metadata_file, "w") as f:
            json.dump(initial_metadata, f)

        metadata_to_save = {"author": "new_author", "description": "Updated description."}
        
        result = world_state_manager.save_world_metadata(test_world_name, metadata_to_save)
        assert result is True

        # SUT call order for uuid.uuid4(): 1. temp_file, 2. backup_file
        actual_temp_file_uuid = mock_uuid_values[0]
        actual_backup_file_uuid = mock_uuid_values[1]

        temp_file_path = test_world_dir / f"metadata.{actual_temp_file_uuid}.tmp"
        backup_file_path = test_world_dir / f"metadata.backup.{actual_backup_file_uuid}.json"

        expected_calls = [
            call(metadata_file, backup_file_path),
            call(temp_file_path, metadata_file)
        ]
        mock_os_replace.assert_has_calls(expected_calls)
        
        # Check content of the temporary file, as os.replace is mocked
        assert temp_file_path.exists()
        with open(temp_file_path, "r") as f:
            saved_metadata = json.load(f)
        
        assert saved_metadata["author"] == "new_author"
        assert saved_metadata["version"] == "1.0" # Version updated/added
        assert "last_modified" in saved_metadata

        mock_logger.log_step.assert_any_call(f"World metadata for '{test_world_name}' saved to {metadata_file}")


    @patch('backend.world_state_manager.os.replace', side_effect=OSError("Disk write error for metadata"))
    @patch('backend.world_state_manager.uuid.uuid4')
    def test_save_world_metadata_os_replace_error(self, mock_uuid, mock_os_replace_error, world_state_manager, test_world_name, test_world_dir, mock_logger):
        mock_uuid.return_value = "meta-fail-uuid"
        metadata_to_save = {"author": "test"}
        
        temp_file_path = test_world_dir / "metadata.meta-fail-uuid.tmp"

        result = world_state_manager.save_world_metadata(test_world_name, metadata_to_save)
        assert result is False
        
        mock_logger.log_error.assert_called_with("Failed to save world metadata: Disk write error for metadata")
        assert not (test_world_dir / "metadata.json").exists()
        assert not temp_file_path.exists() # Temp file should be cleaned up

    def test_save_world_metadata_mkdir_exception(self, world_state_manager, test_world_name, mock_logger):
        metadata_to_save = {"author": "test"}
        with patch.object(Path, 'mkdir', side_effect=OSError("Permission denied for metadata")):
            result = world_state_manager.save_world_metadata(test_world_name, metadata_to_save)
            assert result is False
        mock_logger.log_error.assert_any_call(f"Error saving world metadata for '{test_world_name}': Permission denied for metadata")


    def test_load_world_metadata_success(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        metadata_file = test_world_dir / "metadata.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        expected_metadata = {"version": "1.0", "author": "test_author"}
        with open(metadata_file, "w") as f:
            json.dump(expected_metadata, f)

        loaded_metadata = world_state_manager.load_world_metadata(test_world_name)
        assert loaded_metadata == expected_metadata
        mock_logger.log_step.assert_called_once_with(f"World metadata for '{test_world_name}' loaded successfully")

    def test_load_world_metadata_file_not_found(self, world_state_manager, test_world_name, mock_logger):
        metadata_file = world_state_manager._get_world_metadata_path(test_world_name)
        loaded_metadata = world_state_manager.load_world_metadata(test_world_name)
        assert loaded_metadata == {}
        mock_logger.log_warning.assert_called_once_with(f"World metadata file not found for '{test_world_name}' at {metadata_file}")

    def test_load_world_metadata_invalid_json(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        metadata_file = test_world_dir / "metadata.json"
        test_world_dir.mkdir(parents=True, exist_ok=True)
        with open(metadata_file, "w") as f:
            f.write("this is not json metadata")

        loaded_metadata = world_state_manager.load_world_metadata(test_world_name)
        assert loaded_metadata == {}
        mock_logger.log_error.assert_any_call(f"Error loading world metadata for '{test_world_name}': Expecting value: line 1 column 1 (char 0)") # Error from json.load

    def test_load_world_metadata_generic_exception(self, world_state_manager, test_world_name, mock_logger):
        with patch.object(world_state_manager, '_get_world_metadata_path', side_effect=OSError("Cannot access metadata path")):
            loaded_metadata = world_state_manager.load_world_metadata(test_world_name)
            assert loaded_metadata == {}
        mock_logger.log_error.assert_any_call(f"Error loading world metadata for '{test_world_name}': Cannot access metadata path")

    def test_get_world_list_empty(self, world_state_manager, mock_logger):
        # Ensure worlds_base_dir is empty or only contains files
        for item in world_state_manager.worlds_base_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
        
        worlds = world_state_manager.get_world_list()
        assert worlds == []
        # mkdir is called inside get_world_list to ensure base dir exists
        assert world_state_manager.worlds_base_dir.exists()

    def test_get_world_list_with_worlds(self, world_state_manager, tmp_path):
        world1_name = "world1"
        world1_dir = world_state_manager.worlds_base_dir / world1_name
        world1_dir.mkdir(parents=True, exist_ok=True)
        world1_metadata = {"author": "author1", "version": "1.0", "last_modified": 123}
        with open(world1_dir / "metadata.json", "w") as f:
            json.dump(world1_metadata, f)
        
        world1_state = {"metadata": {"description": "state_desc1", "last_modified": 456}} # state's last_modified should take precedence if key exists
        with open(world1_dir / "world_state.json", "w") as f:
            json.dump(world1_state, f)


        world2_name = "world2"
        world2_dir = world_state_manager.worlds_base_dir / world2_name
        world2_dir.mkdir(parents=True, exist_ok=True)
        world2_metadata = {"author": "author2", "version": "1.1"}
        with open(world2_dir / "metadata.json", "w") as f:
            json.dump(world2_metadata, f)
        # No world_state.json for world2

        world3_name = "world3_no_meta"
        world3_dir = world_state_manager.worlds_base_dir / world3_name
        world3_dir.mkdir(parents=True, exist_ok=True)
        # No metadata.json for world3

        # Add a file that is not a directory to ensure it's skipped
        (world_state_manager.worlds_base_dir / "not_a_world.txt").touch()

        worlds = world_state_manager.get_world_list()
        
        assert len(worlds) == 3
        worlds_by_name = {w["name"]: w for w in worlds}

        assert world1_name in worlds_by_name
        w1_info = worlds_by_name[world1_name]
        assert w1_info["author"] == "author1"
        assert w1_info["version"] == "1.0"
        assert w1_info["description"] == "state_desc1" # From state metadata
        assert w1_info["last_modified"] == 456 # From state metadata, as it's processed later

        assert world2_name in worlds_by_name
        w2_info = worlds_by_name[world2_name]
        assert w2_info["author"] == "author2"
        assert w2_info["version"] == "1.1"
        assert "description" not in w2_info # No state file

        assert world3_name in worlds_by_name
        w3_info = worlds_by_name[world3_name]
        assert "author" not in w3_info # No metadata file

    def test_get_world_list_corrupted_json(self, world_state_manager, tmp_path, mock_logger):
        world_name = "corrupted_world"
        world_dir = world_state_manager.worlds_base_dir / world_name
        world_dir.mkdir(parents=True, exist_ok=True)
        
        with open(world_dir / "metadata.json", "w") as f:
            f.write("invalid json")
        with open(world_dir / "world_state.json", "w") as f:
            f.write("also invalid json")

        worlds = world_state_manager.get_world_list()
        assert len(worlds) == 1
        assert worlds[0]["name"] == world_name
        # Other fields might be missing or default due to parse errors, which is acceptable
        # The main thing is it doesn't crash and still lists the world directory.
        # No specific log check here as it's a silent pass in the code.

    def test_get_world_list_iterdir_exception(self, world_state_manager, mock_logger):
        with patch.object(Path, 'iterdir', side_effect=OSError("Cannot list directory")):
            worlds = world_state_manager.get_world_list()
            assert worlds == []
        mock_logger.log_error.assert_any_call("Error getting world list: Cannot list directory")

    @patch('shutil.rmtree') # shutil is imported locally in the method
    def test_delete_world_success(self, mock_rmtree, world_state_manager, test_world_name, test_world_dir, mock_logger):
        # Make the directory appear to exist
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True):
            
            result = world_state_manager.delete_world(test_world_name)
            assert result is True
            mock_rmtree.assert_called_once_with(test_world_dir)
            mock_logger.log_step.assert_called_once_with(f"World '{test_world_name}' deleted successfully from {test_world_dir}")

    def test_delete_world_not_found(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        # Make the directory appear not to exist
        with patch.object(Path, 'exists', return_value=False):
            result = world_state_manager.delete_world(test_world_name)
            assert result is False
            mock_logger.log_warning.assert_called_once_with(f"World directory not found for '{test_world_name}' at {test_world_dir}")

    def test_delete_world_not_a_directory(self, world_state_manager, test_world_name, test_world_dir, mock_logger):
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=False): # It exists but is not a dir
            result = world_state_manager.delete_world(test_world_name)
            assert result is False
            mock_logger.log_warning.assert_called_once_with(f"World directory not found for '{test_world_name}' at {test_world_dir}")


    @patch('shutil.rmtree', side_effect=OSError("Deletion failed")) # shutil is imported locally
    def test_delete_world_rmtree_exception(self, mock_rmtree_error, world_state_manager, test_world_name, test_world_dir, mock_logger):
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True):
            
            result = world_state_manager.delete_world(test_world_name)
            assert result is False
            mock_rmtree_error.assert_called_once_with(test_world_dir)
            mock_logger.log_error.assert_any_call(f"Error deleting world '{test_world_name}': Deletion failed")
# backend/tests/test_batch_converter.py
import pytest
from pathlib import Path
import json
import io
import base64 
from unittest.mock import MagicMock, call, mock_open

# Modules to test
from backend import batch_converter
from PIL import Image 

# Helper to create a dummy image bytes
def create_dummy_image_bytes(format="PNG"):
    img = Image.new('RGB', (60, 30), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format=format) 
    img_byte_arr = img_byte_arr.getvalue()
    return img_byte_arr

@pytest.fixture(autouse=True)
def mock_dependencies(mocker):
    """Mocks dependencies used in batch_converter.py"""
    mocker.patch('backend.batch_converter.LogManager', return_value=MagicMock())
    mocker.patch('backend.batch_converter.PngMetadataHandler', return_value=MagicMock())
    mocker.patch('backend.batch_converter.CharacterValidator', return_value=MagicMock())

    batch_converter.logger = batch_converter.LogManager()
    batch_converter.png_handler = batch_converter.PngMetadataHandler(batch_converter.logger)
    batch_converter.validator = batch_converter.CharacterValidator(batch_converter.logger)

    mocker.patch('builtins.open', new_callable=mock_open)
    
    default_mock_img = MagicMock(spec=Image.Image)
    default_mock_img.format = "PNG" 
    default_mock_img.convert = MagicMock(return_value=default_mock_img)
    default_mock_img.save = MagicMock() 
    default_mock_img.__enter__ = MagicMock(return_value=default_mock_img) 
    default_mock_img.__exit__ = MagicMock(return_value=None)
    mocker.patch('PIL.Image.open', return_value=default_mock_img) 
    
    mocker.patch('json.load', return_value={})
    mocker.patch('json.dumps', return_value="{}")
    mocker.patch('base64.b64encode', return_value=b"e30=") 
    mocker.patch('sys.exit', side_effect=SystemExit) 
    mocker.patch('builtins.print')
    mocker.patch('builtins.input') 
    mocker.patch('argparse.ArgumentParser.parse_known_args')

@pytest.fixture
def temp_char_dir(tmp_path):
    char_dir = tmp_path / "TestChar"
    char_dir.mkdir()
    return char_dir

# Tests for process_character_directory
def test_process_character_directory_success(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.jpg"
    png_path = temp_char_dir / f"{char_name}.png"

    def mock_glob_side_effect(instance_path, pattern_arg): 
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return [] 
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect, autospec=True)
    
    mock_json_data = {"data": {"name": char_name, "description": "A test character."}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data

    mock_img_obj_for_this_test = MagicMock(spec=Image.Image) 
    mock_img_obj_for_this_test.format = "JPEG" 
    mock_img_obj_for_this_test.convert = MagicMock(return_value=mock_img_obj_for_this_test)
    mock_img_obj_for_this_test.save = MagicMock() 
    mock_img_obj_for_this_test.__enter__ = MagicMock(return_value=mock_img_obj_for_this_test) 
    mock_img_obj_for_this_test.__exit__ = MagicMock(return_value=None)      
    pil_image_open_mock = mocker.patch('PIL.Image.open', return_value=mock_img_obj_for_this_test)
    
    dummy_png_bytes = create_dummy_image_bytes()
    batch_converter.png_handler.write_metadata.return_value = dummy_png_bytes
    
    mock_open_instance = mock_open()
    mocker.patch('builtins.open', mock_open_instance)

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "success"
    pil_image_open_mock.assert_called_once_with(image_path) 
    mock_img_obj_for_this_test.convert.assert_called_once_with("RGBA") 
    batch_converter.png_handler.write_metadata.assert_called_once()
    mock_open_instance.assert_any_call(png_path, "wb")
    mock_open_instance().write.assert_called_once_with(dummy_png_bytes)

def test_process_character_directory_success_png_image_no_conversion(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.png" 
    png_path = temp_char_dir / f"{char_name}.png"

    def mock_glob_side_effect_png(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return []
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return [image_path]
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_png, autospec=True)
    
    mock_json_data = {"data": {"name": char_name, "description": "A test character."}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data

    mock_img_obj_local = MagicMock(spec=Image.Image)
    mock_img_obj_local.format = "PNG" 
    mock_img_obj_local.convert = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__enter__ = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_local)
    
    dummy_png_bytes = create_dummy_image_bytes()
    batch_converter.png_handler.write_metadata.return_value = dummy_png_bytes
    
    mock_open_instance = mock_open()
    mocker.patch('builtins.open', mock_open_instance)

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "success"
    batch_converter.logger.log_step.assert_any_call(f"Processed {char_name} successfully: {png_path}")
    mock_img_obj_local.convert.assert_not_called() 
    batch_converter.png_handler.write_metadata.assert_called_once()
    mock_open_instance.assert_any_call(png_path, "wb")
    mock_open_instance().write.assert_called_once_with(dummy_png_bytes)

def test_process_character_directory_skip_no_json(mocker, temp_char_dir):
    char_name = "TestChar"
    image_path = temp_char_dir / "image1.jpg"
    def mock_glob_side_effect_no_json(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return []
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_no_json, autospec=True)

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "skipped"
    batch_converter.logger.log_warning.assert_called_once_with(f"Skipping {char_name}: Missing JSON or image file")

def test_process_character_directory_skip_no_image(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    def mock_glob_side_effect_no_image(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return []
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_no_image, autospec=True)

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "skipped"
    batch_converter.logger.log_warning.assert_called_once_with(f"Skipping {char_name}: Missing JSON or image file")

def test_process_character_directory_name_mismatch_warning(mocker, temp_char_dir):
    dir_actual_name = "TestCharDirName" 
    metadata_char_name = "TestCharMetadataName" 
    
    mock_char_dir_obj = MagicMock(spec=Path)
    mock_char_dir_obj.name = dir_actual_name
    
    json_file_mock = MagicMock(spec=Path)
    json_file_mock.name = f"v2Import_{dir_actual_name}.json"
    
    image_file_mock = MagicMock(spec=Path)
    image_file_mock.name = "image1.jpg"

    def truediv_side_effect(self_obj, other): 
        new_mock = MagicMock(spec=Path)
        new_mock.name = str(other) 
        new_mock.__str__.return_value = f"{self_obj}/{other}" 
        return new_mock
    mock_char_dir_obj.__truediv__ = truediv_side_effect 
    
    def glob_side_effect(pattern):
        if pattern == "*.json": return [json_file_mock]
        if pattern == "*.jpg": return [image_file_mock]
        if pattern == "*.jpeg": return []
        if pattern == "*.png": return []
        return []
    mock_char_dir_obj.glob.side_effect = glob_side_effect
    
    mock_json_data_raw = {"name": metadata_char_name, "description": "A test character."} 
    mock_json_data_normalized = {"data": {"name": metadata_char_name, "description": "A test character."}}
    mocker.patch('json.load', return_value=mock_json_data_raw)
    batch_converter.validator.normalize.return_value = mock_json_data_normalized

    mock_img_obj_local = MagicMock(spec=Image.Image)
    mock_img_obj_local.format = "JPEG"
    mock_img_obj_local.convert = MagicMock(return_value=mock_img_obj_local)
    mock_img_obj_local.__enter__ = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_local)
    
    batch_converter.png_handler.write_metadata.return_value = create_dummy_image_bytes()
    mocker.patch('builtins.open', mock_open())

    result = batch_converter.process_character_directory(mock_char_dir_obj, quiet_mode=True)

    assert result == "success" 
    batch_converter.logger.log_warning.assert_any_call(
        f"Character name mismatch in {mock_char_dir_obj}: "
        f"Directory: {dir_actual_name}, Metadata: {metadata_char_name}"
    )

def test_process_character_directory_prioritize_v2import_json(mocker, temp_char_dir):
    char_name = "TestChar"
    v2_json_path = temp_char_dir / f"v2Import_{char_name}.json"
    other_json_path = temp_char_dir / "other.json"
    image_path = temp_char_dir / "image1.jpg"

    def mock_glob_side_effect_v2import(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [other_json_path, v2_json_path]
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_v2import, autospec=True)

    v2_data_content = {"data": {"name": char_name, "source": "v2Import"}}

    mock_open_instance = mock_open()
    mocker.patch('builtins.open', mock_open_instance)
    
    mocker.patch('json.load', return_value=v2_data_content) 

    batch_converter.validator.normalize.return_value = v2_data_content 
    mock_img_obj_local = MagicMock(spec=Image.Image) 
    mock_img_obj_local.format = "JPEG"
    mock_img_obj_local.convert = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__enter__ = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_local)
    batch_converter.png_handler.write_metadata.return_value = create_dummy_image_bytes()

    batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    mock_open_instance.assert_any_call(v2_json_path, "r", encoding="utf-8")
    json.load.assert_called_once()
    batch_converter.validator.normalize.assert_called_once_with(v2_data_content)


def test_process_character_directory_prioritize_image1_jpg(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image1_jpg_path = temp_char_dir / "image1.jpg"
    other_image_path = temp_char_dir / "other.jpg"

    def mock_glob_side_effect_image1(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return [other_image_path, image1_jpg_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_image1, autospec=True)

    mock_json_data = {"data": {"name": char_name}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data
    
    mock_pil_image_local = MagicMock(spec=Image.Image, format="JPEG")
    mock_pil_image_local.convert = MagicMock(return_value=mock_pil_image_local)
    mock_pil_image_local.__enter__ = MagicMock(return_value=mock_pil_image_local) 
    mock_pil_image_local.__exit__ = MagicMock(return_value=None)      
    mock_img_open = mocker.patch('PIL.Image.open', return_value=mock_pil_image_local) 
    batch_converter.png_handler.write_metadata.return_value = create_dummy_image_bytes()
    mocker.patch('builtins.open', mock_open())

    batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    mock_img_open.assert_called_once_with(image1_jpg_path)


def test_process_character_directory_png_handler_fails_alternative_succeeds(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.png"
    png_path = temp_char_dir / f"{char_name}.png"

    def mock_glob_side_effect_alt_succeeds(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return []
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return [image_path]
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_alt_succeeds, autospec=True)
    
    mock_json_data = {"data": {"name": char_name}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data

    mock_img_obj_for_alt_path = MagicMock(spec=Image.Image, format="PNG")
    mock_img_obj_for_alt_path.convert = MagicMock(return_value=mock_img_obj_for_alt_path)
    mock_img_obj_for_alt_path.save = MagicMock() 
    mock_img_obj_for_alt_path.__enter__ = MagicMock(return_value=mock_img_obj_for_alt_path) 
    mock_img_obj_for_alt_path.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_for_alt_path) 
    
    batch_converter.png_handler.write_metadata.side_effect = Exception("PNG Handler Failed")
    
    mock_png_info_instance = MagicMock()
    mocker.patch('PIL.PngImagePlugin.PngInfo', return_value=mock_png_info_instance)
    mock_b64encode_global = mocker.patch('base64.b64encode', return_value=b'encoded_metadata')
    mocker.patch('json.dumps', return_value='{"data": {"name": "TestChar"}}')

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "success"
    batch_converter.logger.log_step.assert_any_call("Attempting alternative approach for PNG metadata")
    batch_converter.logger.log_step.assert_any_call(f"Processed {char_name} using alternative method: {png_path}")
    
    json.dumps.assert_called_once_with(mock_json_data)
    mock_b64encode_global.assert_called_once_with('{"data": {"name": "TestChar"}}'.encode('utf-8'))
    mock_png_info_instance.add_text.assert_called_once_with('chara', 'encoded_metadata')
    mock_img_obj_for_alt_path.save.assert_any_call(png_path, "PNG", pnginfo=mock_png_info_instance)


def test_process_character_directory_all_handlers_fail(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.png"

    def mock_glob_side_effect_all_fail(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return []
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return [image_path]
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_all_fail, autospec=True)
    
    mock_json_data = {"data": {"name": char_name}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data

    mock_img_obj_for_fail_path = MagicMock(spec=Image.Image, format="PNG")
    mock_img_obj_for_fail_path.convert = MagicMock(return_value=mock_img_obj_for_fail_path)
    
    save_call_count = 0
    def custom_save_side_effect(target_path_or_buffer, format=None, pnginfo=None, **kwargs):
        nonlocal save_call_count
        save_call_count += 1
        if isinstance(target_path_or_buffer, io.BytesIO) and save_call_count == 1: # First call (buffer)
            # This call should happen inside the first try block for png_handler
            return None 
        elif pnginfo is not None: # This identifies the call from the alternative method
            raise Exception("Alternative Save Failed")
        return None # Should not be reached if logic is correct
    mock_img_obj_for_fail_path.save = MagicMock(side_effect=custom_save_side_effect)
     
    mock_img_obj_for_fail_path.__enter__ = MagicMock(return_value=mock_img_obj_for_fail_path) 
    mock_img_obj_for_fail_path.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_for_fail_path) 
    
    batch_converter.png_handler.write_metadata.side_effect = Exception("PNG Handler Failed")
    mocker.patch('PIL.PngImagePlugin.PngInfo', return_value=MagicMock())

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "failed" 
    
    logged_errors = [c.args[0] for c in batch_converter.logger.log_error.call_args_list]
    assert "PNG metadata error: PNG Handler Failed" in logged_errors
    assert "Alternative method also failed: Alternative Save Failed" in logged_errors


def test_process_character_directory_json_load_fails(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.jpg"

    def mock_glob_side_effect_json_fail(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_json_fail, autospec=True)
    
    mocker.patch('json.load', side_effect=json.JSONDecodeError("Error", "doc", 0))
    mocker.patch('builtins.open', mock_open())

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "failed"
    batch_converter.logger.log_error.assert_any_call(f"Error processing {char_name}: Error: line 1 column 1 (char 0)")


def test_process_character_directory_image_open_fails(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.jpg"

    def mock_glob_side_effect_img_open_fail(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_img_open_fail, autospec=True)
    
    mock_json_data = {"data": {"name": char_name}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data
    mocker.patch('builtins.open', mock_open())
    mocker.patch('PIL.Image.open', side_effect=FileNotFoundError("Cannot open image")) 

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=True)

    assert result == "failed"
    batch_converter.logger.log_error.assert_any_call(f"Error processing {char_name}: Cannot open image")

def test_process_character_directory_quiet_mode_false_prints_output(mocker, temp_char_dir):
    char_name = "TestChar"
    json_path = temp_char_dir / f"v2Import_{char_name}.json"
    image_path = temp_char_dir / "image1.jpg" 
    png_path = temp_char_dir / f"{char_name}.png"

    def mock_glob_side_effect_quiet_false(instance_path, pattern_arg):
        if instance_path == temp_char_dir:
            if pattern_arg == "*.json": return [json_path]
            if pattern_arg == "*.jpg": return [image_path]
            if pattern_arg == "*.jpeg": return []
            if pattern_arg == "*.png": return []
        return []
    mocker.patch('pathlib.Path.glob', side_effect=mock_glob_side_effect_quiet_false, autospec=True)
    
    mock_json_data = {"data": {"name": char_name}}
    mocker.patch('json.load', return_value=mock_json_data)
    batch_converter.validator.normalize.return_value = mock_json_data

    mock_img_obj_local = MagicMock(spec=Image.Image, format="JPEG") 
    mock_img_obj_local.convert = MagicMock(return_value=mock_img_obj_local)
    mock_img_obj_local.__enter__ = MagicMock(return_value=mock_img_obj_local) 
    mock_img_obj_local.__exit__ = MagicMock(return_value=None)      
    mocker.patch('PIL.Image.open', return_value=mock_img_obj_local) 
    
    batch_converter.png_handler.write_metadata.return_value = create_dummy_image_bytes()
    mocker.patch('builtins.open', mock_open())
    mock_print = mocker.patch('builtins.print')

    result = batch_converter.process_character_directory(temp_char_dir, quiet_mode=False)

    assert result == "success"
    mock_print.assert_any_call(f"Converting {image_path.name} to PNG format")
    mock_print.assert_any_call(f"Processed {char_name} successfully: {png_path}")

@pytest.fixture
def temp_backup_dir(tmp_path):
    backup_dir = tmp_path / "backup"
    backup_dir.mkdir()
    return backup_dir

def test_process_subdirectories_no_dirs(mocker, temp_backup_dir):
    def mock_iterdir_side_effect_no_dirs(instance_path):
        if instance_path == temp_backup_dir:
            return iter([])
        return iter([]) 
    mocker.patch('pathlib.Path.iterdir', side_effect=mock_iterdir_side_effect_no_dirs, autospec=True)
    mock_print = mocker.patch('builtins.print')

    batch_converter.process_subdirectories(temp_backup_dir, quiet_mode=False)

    batch_converter.logger.log_step.assert_any_call(f"Starting batch processing in: {temp_backup_dir}")
    summary_msg = "Processing complete: 0 successful, 0 skipped, 0 failed out of 0 directories"
    batch_converter.logger.log_step.assert_any_call(summary_msg)
    mock_print.assert_any_call("\n" + summary_msg)

def test_process_subdirectories_multiple_dirs(mocker, temp_backup_dir):
    mock_char_dir1 = MagicMock(spec=Path)
    mock_char_dir1.is_dir.return_value = True
    mock_char_dir1.name = "Char1"

    mock_char_dir2 = MagicMock(spec=Path)
    mock_char_dir2.is_dir.return_value = True
    mock_char_dir2.name = "Char2"

    mock_char_dir3 = MagicMock(spec=Path)
    mock_char_dir3.is_dir.return_value = True
    mock_char_dir3.name = "Char3"
    
    mock_file = MagicMock(spec=Path)
    mock_file.is_dir.return_value = False 

    def mock_iterdir_side_effect_multiple(instance_path):
        if instance_path == temp_backup_dir:
            return iter([mock_char_dir1, mock_file, mock_char_dir2, mock_char_dir3])
        return iter([])
    mocker.patch('pathlib.Path.iterdir', side_effect=mock_iterdir_side_effect_multiple, autospec=True)
    
    mock_process_char_dir = mocker.patch('backend.batch_converter.process_character_directory', 
                                         side_effect=["success", "skipped", "failed"])
    mock_print = mocker.patch('builtins.print')

    batch_converter.process_subdirectories(temp_backup_dir, quiet_mode=False)

    assert mock_process_char_dir.call_count == 3
    mock_process_char_dir.assert_any_call(mock_char_dir1, False)
    mock_process_char_dir.assert_any_call(mock_char_dir2, False)
    mock_process_char_dir.assert_any_call(mock_char_dir3, False)

    summary_msg = "Processing complete: 1 successful, 1 skipped, 1 failed out of 3 directories"
    batch_converter.logger.log_step.assert_any_call(summary_msg)
    mock_print.assert_any_call("\n" + summary_msg)

def test_process_subdirectories_exception_in_processing(mocker, temp_backup_dir):
    mock_char_dir1 = MagicMock(spec=Path, name="Char1Path")
    mock_char_dir1.is_dir.return_value = True
    mock_char_dir1.name = "Char1" 

    def mock_iterdir_side_effect_exception(instance_path):
        if instance_path == temp_backup_dir:
            return iter([mock_char_dir1])
        return iter([])
    mocker.patch('pathlib.Path.iterdir', side_effect=mock_iterdir_side_effect_exception, autospec=True)
    
    mock_process_char_dir = mocker.patch('backend.batch_converter.process_character_directory', 
                                         side_effect=Exception("Big error!"))
    mock_print = mocker.patch('builtins.print')
    mocker.patch('traceback.format_exc', return_value="Traceback details")

    batch_converter.process_subdirectories(temp_backup_dir, quiet_mode=False)

    mock_process_char_dir.assert_called_once_with(mock_char_dir1, False)
    batch_converter.logger.log_error.assert_any_call(f"Error processing Char1: Big error!")
    batch_converter.logger.log_error.assert_any_call("Traceback details")
    mock_print.assert_any_call(f"Error processing Char1: Big error!")
    
    summary_msg = "Processing complete: 0 successful, 0 skipped, 1 failed out of 1 directories"
    batch_converter.logger.log_step.assert_any_call(summary_msg)
    mock_print.assert_any_call("\n" + summary_msg)

def test_main_batch_mode_no_backup_dir(mocker):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = None 
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', False, create=True) 
    mock_print = mocker.patch('builtins.print')
    mocked_builtins_input = mocker.patch('builtins.input') 

    with pytest.raises(SystemExit):
        batch_converter.main()

    mock_print.assert_any_call("Error: Backup directory (-b/--backup-dir) is required in batch mode")
    batch_converter.sys.exit.assert_called_once_with(1) 
    mocked_builtins_input.assert_not_called() 

def test_main_batch_mode_no_backup_dir_exe_mode(mocker):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = None
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', True, create=True) 
    mock_print = mocker.patch('builtins.print')
    mocked_builtins_input = mocker.patch('builtins.input')
    
    with pytest.raises(SystemExit):
        batch_converter.main()

    mock_print.assert_any_call("Error: Backup directory (-b/--backup-dir) is required in batch mode")
    mocked_builtins_input.assert_called_once_with("Press Enter to exit...")
    batch_converter.sys.exit.assert_called_once_with(1) 

def test_main_backup_dir_not_exists(mocker):
    backup_dir_path_str = "/fake/backup"
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = backup_dir_path_str
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', False, create=True)
    
    mock_path_obj = MagicMock(spec=Path)
    mock_path_obj.exists.return_value = False 
    mock_path_obj.__str__.return_value = backup_dir_path_str 
    mocker.patch('backend.batch_converter.Path', return_value=mock_path_obj)
    
    mock_print = mocker.patch('builtins.print')
    
    with pytest.raises(SystemExit): 
        batch_converter.main()
    
    expected_error_print = f"Error: Backup directory not found: {backup_dir_path_str}"
    mock_print.assert_any_call(expected_error_print)
    batch_converter.logger.log_error.assert_any_call(expected_error_print)
    batch_converter.sys.exit.assert_called_once_with(1)

def test_main_backup_dir_is_file(mocker):
    backup_dir_path_str = "/fake/backup/file.txt"
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = backup_dir_path_str
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', False, create=True)
    
    mock_path_obj = MagicMock(spec=Path)
    mock_path_obj.exists.return_value = True
    mock_path_obj.is_dir.return_value = False 
    mock_path_obj.__str__.return_value = backup_dir_path_str
    mocker.patch('backend.batch_converter.Path', return_value=mock_path_obj)
    
    mock_print = mocker.patch('builtins.print')
    
    with pytest.raises(SystemExit):
        batch_converter.main()
    
    expected_error_print = f"Error: Backup directory not found: {backup_dir_path_str}" 
    mock_print.assert_any_call(expected_error_print)
    batch_converter.logger.log_error.assert_any_call(expected_error_print)
    batch_converter.sys.exit.assert_called_once_with(1)


def test_main_successful_run_dev_mode(mocker, temp_backup_dir):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = str(temp_backup_dir)
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', False, create=True) 
    
    def path_side_effect(p_str):
        if p_str == str(temp_backup_dir):
            return temp_backup_dir
        generic_path_mock = MagicMock(spec=Path)
        generic_path_mock.exists.return_value = False 
        return generic_path_mock

    mocker.patch('backend.batch_converter.Path', side_effect=path_side_effect)

    mock_process_subdirs = mocker.patch('backend.batch_converter.process_subdirectories')
    mock_print = mocker.patch('builtins.print')
    mocked_builtins_input = mocker.patch('builtins.input') 

    batch_converter.main()

    mock_print.assert_any_call("\n====================================")
    mock_print.assert_any_call("CardShark Batch Character Converter")
    mock_print.assert_any_call("====================================\n")
    mock_print.assert_any_call("Running in development mode")
    mock_print.assert_any_call(f"Processing directory: {temp_backup_dir}\n") 
    
    mock_process_subdirs.assert_called_once_with(temp_backup_dir, False)
    mocked_builtins_input.assert_not_called() 
    batch_converter.sys.exit.assert_not_called()


def test_main_successful_run_exe_mode_quiet(mocker, temp_backup_dir):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = str(temp_backup_dir)
    mock_args.quiet = True 
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', True, create=True) 
    
    def path_side_effect(p_str):
        if p_str == str(temp_backup_dir):
            return temp_backup_dir
        generic_path_mock = MagicMock(spec=Path)
        generic_path_mock.exists.return_value = False
        return generic_path_mock
    mocker.patch('backend.batch_converter.Path', side_effect=path_side_effect)

    mock_process_subdirs = mocker.patch('backend.batch_converter.process_subdirectories')
    mock_print = mocker.patch('builtins.print')
    mocked_builtins_input = mocker.patch('builtins.input')

    batch_converter.main()

    assert not any("CardShark Batch Character Converter" in call_args[0][0] for call_args in mock_print.call_args_list if call_args[0])

    mock_process_subdirs.assert_called_once_with(temp_backup_dir, True) 
    mocked_builtins_input.assert_not_called() 
    batch_converter.sys.exit.assert_not_called()

def test_main_successful_run_exe_mode_verbose_pause(mocker, temp_backup_dir):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = str(temp_backup_dir)
    mock_args.quiet = False 
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', True, create=True) 
    
    def path_side_effect(p_str):
        if p_str == str(temp_backup_dir):
            return temp_backup_dir
        generic_path_mock = MagicMock(spec=Path)
        generic_path_mock.exists.return_value = False
        return generic_path_mock
    mocker.patch('backend.batch_converter.Path', side_effect=path_side_effect)

    mock_process_subdirs = mocker.patch('backend.batch_converter.process_subdirectories')
    mock_print = mocker.patch('builtins.print')
    mocked_builtins_input = mocker.patch('builtins.input')

    batch_converter.main()

    mock_print.assert_any_call("Running in executable mode")
    mock_process_subdirs.assert_called_once_with(temp_backup_dir, False) 
    mocked_builtins_input.assert_called_once_with("\nProcessing complete. Press Enter to exit...") 
    batch_converter.sys.exit.assert_not_called()


def test_main_not_batch_mode_and_not_main_dunder(mocker):
    mock_args = MagicMock()
    mock_args.batch = False 
    mock_args.backup_dir = "/some/path" 
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    
    mock_process_subdirs = mocker.patch('backend.batch_converter.process_subdirectories')
    
    mocker.patch.object(batch_converter, '__name__', "backend.batch_converter_module")
    batch_converter.main()
    mocker.patch.object(batch_converter, '__name__', "__main__") 

    mock_process_subdirs.assert_not_called() 
    batch_converter.sys.exit.assert_not_called()


def test_main_general_exception_handling(mocker, temp_backup_dir):
    mock_args = MagicMock()
    mock_args.batch = True
    mock_args.backup_dir = str(temp_backup_dir)
    mock_args.quiet = False
    mocker.patch('argparse.ArgumentParser.parse_known_args', return_value=(mock_args, []))
    mocker.patch('sys.frozen', False, create=True)
    
    def path_side_effect(p_str):
        if p_str == str(temp_backup_dir):
            return temp_backup_dir
        generic_path_mock = MagicMock(spec=Path)
        generic_path_mock.exists.return_value = False
        return generic_path_mock
    mocker.patch('backend.batch_converter.Path', side_effect=path_side_effect)

    mocker.patch('backend.batch_converter.process_subdirectories', side_effect=Exception("Unexpected Main Error"))
    mock_print = mocker.patch('builtins.print')
    mocker.patch('traceback.format_exc', return_value="Main Traceback")

    with pytest.raises(SystemExit):
        batch_converter.main()

    error_msg = "An unexpected error occurred: Unexpected Main Error"
    mock_print.assert_any_call(error_msg)
    batch_converter.logger.log_error.assert_any_call(error_msg)
    batch_converter.logger.log_error.assert_any_call("Main Traceback")
    batch_converter.sys.exit.assert_called_once_with(1)

def test_main_guard_calls_main(mocker):
    pass

import unittest
import shutil
import os
from pathlib import Path
from backend.png_metadata_handler import PngMetadataHandler
from PIL import Image

class MockLogger:
    def log_step(self, msg):
        print(f"STEP: {msg}")
    def log_warning(self, msg):
        print(f"WARN: {msg}")
    def log_error(self, msg):
        print(f"ERR: {msg}")

class TestPngMetadataHandler(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path("test_png_handler")
        self.test_dir.mkdir(exist_ok=True)
        self.handler = PngMetadataHandler(MockLogger())
        
    def tearDown(self):
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)

    def test_write_metadata_to_png_existing(self):
        # Create a dummy PNG
        img_path = self.test_dir / "test.png"
        img = Image.new('RGB', (100, 100), color='red')
        img.save(img_path)
        
        metadata = {"data": {"name": "Test Char"}}
        
        self.handler.write_metadata_to_png(img_path, metadata)
        
        # Verify metadata
        read_meta = self.handler.read_metadata(img_path)
        self.assertEqual(read_meta.get("data", {}).get("name"), "Test Char")

    def test_write_metadata_to_png_new(self):
        img_path = self.test_dir / "new.png"
        metadata = {"data": {"name": "New Char"}}
        
        self.handler.write_metadata_to_png(img_path, metadata, create_if_not_exists=True)
        
        self.assertTrue(img_path.exists())
        read_meta = self.handler.read_metadata(img_path)
        self.assertEqual(read_meta.get("data", {}).get("name"), "New Char")

    def test_write_metadata_to_png_missing_fail(self):
        img_path = self.test_dir / "missing.png"
        metadata = {"data": {"name": "Missing"}}
        
        with self.assertRaises(FileNotFoundError):
            self.handler.write_metadata_to_png(img_path, metadata, create_if_not_exists=False)

if __name__ == '__main__':
    unittest.main()

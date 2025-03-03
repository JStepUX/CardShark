#!/usr/bin/env python3
"""
CardShark Batch Character Converter

This file should be placed in the backend directory.

This script processes a directory of character backups, converting JSON metadata and 
JPG images into character card PNGs with embedded metadata.

Works with both development mode and PyInstaller executable mode.

Usage:
    python -m backend.batch_converter -b /path/to/backup/directory [-q]
    
    OR when using as executable:
    
    CardShark.exe -batch -b /path/to/backup/directory [-q]
"""

import argparse
import sys
import os
import json
import traceback
from pathlib import Path
from PIL import Image, PngImagePlugin
import io

# Import other CardShark components - these are already in the backend package
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.character_validator import CharacterValidator

# Initialize components
logger = LogManager()
png_handler = PngMetadataHandler(logger)
validator = CharacterValidator(logger)

def process_subdirectories(backup_dir: Path, quiet_mode: bool):
    """Process all subdirectories within the backup_dir."""
    logger.log_step(f"Starting batch processing in: {backup_dir}")
    
    # Count statistics
    total_dirs = 0
    successful = 0
    skipped = 0
    failed = 0
    
    for char_dir in backup_dir.iterdir():
        if char_dir.is_dir():
            total_dirs += 1
            try:
                result = process_character_directory(char_dir, quiet_mode)
                if result == "success":
                    successful += 1
                elif result == "skipped":
                    skipped += 1
                else:
                    failed += 1
            except Exception as e:
                failed += 1
                if not quiet_mode:
                    print(f"Error processing {char_dir.name}: {e}")
                logger.log_error(f"Error processing {char_dir.name}: {e}")
                logger.log_error(traceback.format_exc())
    
    # Show summary
    summary = f"Processing complete: {successful} successful, {skipped} skipped, {failed} failed out of {total_dirs} directories"
    logger.log_step(summary)
    if not quiet_mode:
        print("\n" + summary)

def process_character_directory(char_dir: Path, quiet_mode: bool) -> str:
    """
    Process a single character directory.
    
    Returns:
        str: "success", "skipped", or "failed"
    """
    char_name = char_dir.name
    
    # Check for required files - both JSON metadata and an image are needed
    json_files = list(char_dir.glob("*.json"))
    image_files = list(char_dir.glob("*.jpg")) + list(char_dir.glob("*.jpeg")) + list(char_dir.glob("*.png"))
    
    if not json_files or not image_files:
        if not quiet_mode:
            print(f"Skipping {char_name}: Missing JSON or image file")
        logger.log_warning(f"Skipping {char_name}: Missing JSON or image file")
        return "skipped"
    
    # Prioritize files if multiple exist
    json_path = next((f for f in json_files if f.name.startswith(f"v2Import_{char_name}")), json_files[0])
    image_path = next((f for f in image_files if f.name == "image1.jpg"), image_files[0])
    
    # Output PNG path
    png_path = char_dir / f"{char_name}.png"
    
    try:
        # Load and validate metadata
        with open(json_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        
        # Use CharacterValidator to ensure proper structure
        validated_metadata = validator.normalize(metadata)
        
        # Verify character name matches directory
        if validated_metadata.get("data", {}).get("name", "") != char_name:
            logger.log_warning(f"Character name mismatch in {char_dir}: "
                              f"Directory: {char_name}, Metadata: {validated_metadata.get('data', {}).get('name', '(none)')}")
        
        # Load and convert image
        with Image.open(image_path) as img:
            # Convert image to PNG format in memory
            if img.format != "PNG":
                if not quiet_mode:
                    print(f"Converting {image_path.name} to PNG format")
                img = img.convert("RGBA")
            
            # Create a BytesIO object for the PNG
            img_buffer = io.BytesIO()
            img.save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()
            
            # Write metadata to PNG
            try:
                # Write metadata to PNG
                updated_png_bytes = png_handler.write_metadata(img_bytes, validated_metadata)
                
                # Save final PNG
                with open(png_path, "wb") as f:
                    f.write(updated_png_bytes)
                
                if not quiet_mode:
                    print(f"Processed {char_name} successfully: {png_path}")
                logger.log_step(f"Processed {char_name} successfully: {png_path}")
                return "success"
                
            except Exception as png_error:
                logger.log_error(f"PNG metadata error: {png_error}")
                logger.log_error(traceback.format_exc())
                
                # Alternative approach using PngInfo directly
                try:
                    logger.log_step("Attempting alternative approach for PNG metadata")
                    
                    # Convert metadata to base64
                    import base64
                    json_str = json.dumps(validated_metadata)
                    base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
                    
                    # Create PNG info object
                    png_info = PngImagePlugin.PngInfo()
                    png_info.add_text('chara', base64_str)
                    
                    # Save directly with metadata
                    img.save(png_path, "PNG", pnginfo=png_info)
                    
                    if not quiet_mode:
                        print(f"Processed {char_name} using alternative method: {png_path}")
                    logger.log_step(f"Processed {char_name} using alternative method: {png_path}")
                    return "success"
                    
                except Exception as alt_error:
                    logger.log_error(f"Alternative method also failed: {alt_error}")
                    logger.log_error(traceback.format_exc())
                    return "failed"
    
    except Exception as e:
        if not quiet_mode:
            print(f"Error processing {char_name}: {e}")
        logger.log_error(f"Error processing {char_name}: {e}")
        logger.log_error(traceback.format_exc())
        return "failed"

def main():
    """Main entry point for the script."""
    # Determine if running as executable or script
    is_exe = getattr(sys, 'frozen', False)
    
    # Configure argument parser
    parser = argparse.ArgumentParser(description="CardShark - Batch Character Card Generator")
    
    # Add batch mode flag for all running modes
    parser.add_argument("-batch", "--batch", action="store_true", help="Run in batch processing mode")
    parser.add_argument("-b", "--backup-dir", type=str, help="Path to backup directory")
    parser.add_argument("-q", "--quiet", action="store_true", help="Run in quiet mode (minimal output)")
    
    # Parse only known args to avoid conflicts when called from main.py
    args, unknown = parser.parse_known_args()
    
    # Check if batch mode is enabled
    batch_mode = args.batch
    
    # Skip batch processing if batch mode is not enabled
    if not batch_mode and not __name__ == "__main__":
        # Just ignore and let the regular CardShark executable run
        return
    
    # Verify backup directory is provided when in batch mode
    if not args.backup_dir:
        print("Error: Backup directory (-b/--backup-dir) is required in batch mode")
        if not args.quiet and is_exe:
            input("Press Enter to exit...")
        sys.exit(1)
    
    backup_directory = Path(args.backup_dir)
    quiet_mode = args.quiet
    
    # Display startup banner
    if not quiet_mode:
        print("\n====================================")
        print("CardShark Batch Character Converter")
        print("====================================\n")
        if is_exe:
            print("Running in executable mode")
        else:
            print("Running in development mode")
        print(f"Processing directory: {backup_directory}\n")
    
    try:
        if backup_directory.exists() and backup_directory.is_dir():
            process_subdirectories(backup_directory, quiet_mode)
        else:
            error_msg = f"Error: Backup directory not found: {backup_directory}"
            print(error_msg)
            logger.log_error(error_msg)
            if not quiet_mode and is_exe:
                input("Press Enter to exit...")
            sys.exit(1)
    except Exception as e:
        error_msg = f"An unexpected error occurred: {e}"
        print(error_msg)
        logger.log_error(error_msg)
        logger.log_error(traceback.format_exc())
        if not quiet_mode and is_exe:
            input("Press Enter to exit...")
        sys.exit(1)
    
    # Add pause at the end in exe mode for user to see results
    if not quiet_mode and is_exe:
        input("\nProcessing complete. Press Enter to exit...")

if __name__ == "__main__":
    main()
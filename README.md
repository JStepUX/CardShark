# CardShark

CardShark is a powerful PNG-based Character Card Metadata Editor designed for seamless integration with open-source LLM frontends like Silly Tavern and Backyard.ai. It provides a comprehensive suite of tools for managing character card metadata, with a focus on the V2 specification.

## Features

### Core Functionality

- **PNG Metadata Management**
  - Import (Load) V2 Spec from Chara EXIF field
  - Export (Save) V2 Spec to Chara EXIF field
  - Preserve original image quality during metadata operations

### Character Data Management

- **Field Mapping**
  - Automatic mapping of V2 Spec Character Card JSON to application fields
  - Visual editing interface for character attributes
  - Support for comprehensive character metadata

### Lore Management

- **Character Book (V2) / Lore Items**
  - TreeView interface for managing lore entries
  - Bulk import via TSV files
  - Add, edit, and delete individual lore items
  - Duplicate detection and highlighting
  - Undo functionality for deletions

### Data Import/Export

- **TSV Import**
  - Two-column format support
  - First column: Triggering keywords
  - Second column: Content instructions
  - Bulk import capabilities

### System Management

- **Automatic Cleanup**
  - Log file management
  - Cache clearing
  - Memory optimization
  - State reset on new loads

## Requirements

- Python 3.x
- Pillow (PIL)
- tkinter/ttkbootstrap
- ExifTool

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/cardshark.git
cd cardshark
```

2. Install required dependencies:

```bash
pip install -r requirements.txt
```

3. Ensure ExifTool is installed and accessible in your system PATH

## Usage

1. Launch the application:

```bash
python cardshark.py
```

2. Basic Operations:
   - Click "Load PNG" to import a character card
   - Edit character data in the appropriate fields
   - Manage lore items in the Lore tab
   - Click "Save PNG" to export your changes

### Importing Lore Items

1. Prepare a TSV file with two columns:

   - Column 1: Keywords (comma-separated if multiple)
   - Column 2: Content/instructions

2. In the Lore tab:
   - Click "Import TSV"
   - Select your TSV file
   - Review imported items in the treeview

### Managing Lore Items

- **Add**: Create new lore entries
- **Edit**: Modify existing entries
- **Delete**: Remove unwanted entries (with undo capability)
- **Import**: Bulk import from TSV files

## Project Structure

```
cardshark/
├── cardshark.py         # Main application
├── constants.py         # Configuration constants
├── json_handler.py      # JSON processing
├── log_manager.py       # Logging functionality
├── lore_manager.py      # Lore management
├── png_handler.py       # PNG file operations
├── url_handler.py       # URL import functionality
├── v2_handler.py        # V2 spec handling
└── .ExifTool_config    # ExifTool configuration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- ExifTool for metadata management
- ttkbootstrap for the modern UI
- The open-source AI community

## Support

For issues and feature requests, please use the GitHub issues tracker.

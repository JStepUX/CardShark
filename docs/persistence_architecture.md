# CardShark Persistence Architecture

This document provides a comprehensive overview of CardShark's persistence architecture, designed to serve as a reference for both human developers and AI assistants working on the project. It ties together the domain-specific persistence strategies into a cohesive whole.

## Architecture Overview

CardShark employs a domain-driven approach to data persistence, where each domain has its dedicated storage mechanism and patterns. This architecture promotes:

1. **Separation of concerns**: Each domain manages its own data independently
2. **Domain-specific optimizations**: Storage formats and patterns optimized for each data type
3. **Clear boundaries**: Well-defined interfaces between different data domains
4. **Consistent patterns**: Common persistence patterns applied across domains

## Core Persistence Principles

These principles apply across all persistence domains in CardShark:

### 1. Data Integrity

- All write operations use atomic patterns to prevent corruption
- Critical operations include verification steps
- Backup mechanisms protect against data loss
- All data formats include validation schemas

### 2. Performance Optimization

- Debounced writes prevent excessive I/O operations
- Read operations are optimized with appropriate caching
- Batch operations are used for bulk data changes
- Save operations prioritize critical state changes

### 3. Error Recovery

- All persistence operations include robust error handling
- Automatic recovery mechanisms for common failure scenarios
- Detailed logging for troubleshooting
- Fallback strategies when primary persistence fails

### 4. Versioning

- All data formats include explicit version information
- Migration paths for evolving schemas
- Backward compatibility with older data formats
- Forward compatibility where possible

## Domain-Specific Persistence

### Characters

Characters are stored as PNG files with embedded JSON metadata:

- **Primary storage**: PNG files in user-selected directory
- **Format**: Character Card format specification
- **Key files**: Individual PNG files with metadata
- **Handlers**: `character_endpoints.py`, `png_metadata_handler.py`
- **Detailed spec**: See Character Card format specification

### Chats

Chat history is stored as JSONL files organized by character:

- **Primary storage**: `/chats/{characterName}/` directories with JSONL files
- **Format**: JSONL with metadata header and message entries
- **Key handlers**: `chat_handler.py`, `chat_endpoints.py`
- **Detailed strategy**: See `chat_persistence_strategy.md`

### Worlds

World data uses a hierarchical structure with JSON state files:

- **Primary storage**: `/worlds/{worldName}/` directories
- **Format**: JSON for state, PNG for images, JSONL for chats
- **Key handlers**: `world_state_manager.py`, `world_endpoints.py`
- **Detailed strategy**: See `world_persistence_strategy.md`

### Settings

Application settings use a central JSON configuration file:

- **Primary storage**: `settings.json` in root directory
- **Format**: Structured JSON configuration
- **Key handlers**: `settings_manager.py`, `settings_endpoints.py`
- **Access patterns**: Read on startup, updated on changes

### Templates

Templates for prompts and interactions are stored as JSON files:

- **Primary storage**: `/templates/` directory
- **Format**: JSON with template definitions
- **Key handlers**: `template_handler.py`, `template_endpoints.py`
- **Organization**: Built-in (read-only) and custom templates

### Users

User profiles are stored as PNG files with metadata:

- **Primary storage**: `/users/` directory
- **Format**: PNG files with embedded JSON metadata
- **Key handlers**: `user_endpoints.py`
- **Access patterns**: On-demand loading when selected

## Common Implementation Patterns

### Atomic File Operations

All domains implement atomic file operations following this pattern:

```python
def atomic_write(target_path, data):
    # Create temporary file with unique name
    temp_path = target_path.with_name(f"{target_path.stem}.{uuid.uuid4()}.tmp")
    
    try:
        # Write data to temporary file
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
            
        # Ensure data is fully written to disk
        f.flush()
        os.fsync(f.fileno())
        
        # Atomic replace
        os.replace(temp_path, target_path)
        return True
    except Exception as e:
        logger.error(f"Write failed: {str(e)}")
        if temp_path.exists():
            temp_path.unlink()
        return False
```

### Validation Patterns

Data validation follows this general pattern:

```python
def validate_data(data, schema_version):
    try:
        # Get appropriate schema for version
        schema = get_schema_for_version(schema_version)
        
        # Validate against schema
        validate_against_schema(data, schema)
        
        # Additional domain-specific validation
        domain_specific_validation(data)
        
        return True, None
    except ValidationError as e:
        return False, f"Validation error: {str(e)}"
```

### Debounced Save Operations

Performance optimization with debounced saves:

```python
class DebouncedSaver:
    def __init__(self, save_func, delay_ms=500):
        self.save_func = save_func
        self.delay_ms = delay_ms
        self.timer = None
        self.pending_data = None
        
    def schedule_save(self, data):
        self.pending_data = data
        
        # Cancel existing timer if any
        if self.timer:
            self.timer.cancel()
            
        # Schedule new save
        self.timer = threading.Timer(
            self.delay_ms / 1000.0, 
            self._execute_save
        )
        self.timer.daemon = True
        self.timer.start()
        
    def _execute_save(self):
        if self.pending_data is not None:
            self.save_func(self.pending_data)
            self.pending_data = None
```

## Cross-Domain Interactions

Different persistence domains interact in structured ways:

1. **Characters → Chats**: Character IDs link to chat directories
2. **Characters → Worlds**: Character cards can generate worlds
3. **Worlds → Characters**: Worlds reference character UUIDs for NPCs
4. **Templates → Chats**: Templates are applied in chat contexts
5. **Settings → All Domains**: Settings configure all persistence behaviors

## Service Layer

Each storage domain has a corresponding service layer that abstracts implementation details:

### Backend Services

- **Settings Manager**: Handles application settings
- **PNG Metadata Handler**: Manages PNG metadata operations
- **Chat Handler**: Coordinates chat persistence
- **World State Manager**: Manages world state persistence
- **Template Handler**: Handles template loading and saving

### Frontend Services

- **ChatStorage**: Manages chat operations from frontend
- **WorldService**: Handles world operations
- **TemplateService**: Manages template operations
- **SettingsService**: Coordinates settings operations

## API Layer

The API layer provides consistent endpoints for each persistence domain:

- **GET endpoints**: Read operations with appropriate caching
- **POST endpoints**: Create/update operations with validation
- **DELETE endpoints**: Remove operations with confirmation
- **PATCH endpoints**: Partial updates for large data structures

## Future Enhancements

Planned improvements to the persistence architecture:

1. **Database Migration**: For higher scalability in high-volume domains
2. **Distributed Storage**: For multi-device synchronization
3. **Conflict Resolution**: For collaborative editing scenarios
4. **Compression Strategies**: For reducing storage footprint
5. **Encryption Options**: For sensitive data

## Troubleshooting Guide

Common persistence issues and their solutions:

### General Issues

- **Missing Files**: Check file permissions and directory existence
- **Corruption**: Use validation utilities and recover from backups
- **Performance**: Implement appropriate caching and optimize save frequency
- **Synchronization**: Verify frontend and backend state consistency

### Domain-Specific Issues

- **Character Card Problems**: Check PNG metadata integrity
- **Chat History Issues**: Validate JSONL format and structure
- **World State Errors**: Verify JSON schema compliance
- **Settings Conflicts**: Check for concurrent modifications

This architecture provides a comprehensive approach to persistence in CardShark, ensuring reliable data storage while maintaining performance and scalability across all domains.
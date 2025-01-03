from enum import Enum
from typing import Optional

class ErrorType(Enum):
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    INVALID_FORMAT = "INVALID_FORMAT"  
    PROCESSING_ERROR = "PROCESSING_ERROR"
    METADATA_ERROR = "METADATA_ERROR"

class ErrorMessages:
    FILE_NOT_FOUND = "File not found: {path}"
    NO_METADATA = "No character data found in PNG"
    PROCESSING_FAILED = "Failed to process file: {error}"
    INVALID_FORMAT = "Invalid file format: {format}"
    INVALID_JSON = "Invalid JSON structure: {error}"

class CardSharkError(Exception):
    def __init__(self, message: str, error_type: ErrorType):
        self.message = message
        self.error_type = error_type
        super().__init__(self.message)

    @classmethod
    def file_not_found(cls, path: str) -> "CardSharkError":
        return cls(ErrorMessages.FILE_NOT_FOUND.format(path=path), ErrorType.FILE_NOT_FOUND)

    @classmethod
    def no_metadata(cls) -> "CardSharkError":
        return cls(ErrorMessages.NO_METADATA, ErrorType.METADATA_ERROR)

    @classmethod
    def processing_failed(cls, error: str) -> "CardSharkError":
        return cls(ErrorMessages.PROCESSING_FAILED.format(error=error), ErrorType.PROCESSING_ERROR)

    @classmethod
    def invalid_format(cls, format: str) -> "CardSharkError":
        return cls(ErrorMessages.INVALID_FORMAT.format(format=format), ErrorType.INVALID_FORMAT)
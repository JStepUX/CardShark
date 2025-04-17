# backend/worldcards/errors.py
from backend.errors import CardSharkError, ErrorType, ErrorMessages

class WorldCardError(CardSharkError):
    """
    Specialized error for world card operations, using new error types/messages as needed.
    """
    @classmethod
    def world_not_found(cls, world_name: str) -> "WorldCardError":
        return cls(ErrorMessages.WORLD_NOT_FOUND.format(world_name=world_name), ErrorType.WORLD_NOT_FOUND)

    @classmethod
    def state_invalid(cls, error: str) -> "WorldCardError":
        return cls(ErrorMessages.WORLD_STATE_INVALID.format(error=error), ErrorType.WORLD_STATE_INVALID)

    @classmethod
    def location_extraction_failed(cls, error: str) -> "WorldCardError":
        return cls(ErrorMessages.LOCATION_EXTRACTION_FAILED.format(error=error), ErrorType.LOCATION_EXTRACTION_FAILED)

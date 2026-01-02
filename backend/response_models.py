# backend/response_models.py
# Standardized response models for FastAPI endpoints following best practices

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Generic, TypeVar, Union
from datetime import datetime
import traceback

# Generic type for data payloads
DataT = TypeVar('DataT')

class BaseResponse(BaseModel):
    """Base response model with standard success/error fields."""
    success: bool = True
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None,
        }

class ErrorResponse(BaseResponse):
    """Standard error response model."""
    success: bool = False
    error: str
    error_code: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class SuccessResponse(BaseResponse):
    """Standard success response model."""
    success: bool = True

class DataResponse(BaseResponse, Generic[DataT]):
    """Generic response model with typed data payload."""
    success: bool = True
    data: DataT

class ListResponse(BaseResponse, Generic[DataT]):
    """Standard response for list endpoints with pagination info."""
    success: bool = True
    data: List[DataT]
    total: int
    page: Optional[int] = None
    page_size: Optional[int] = None
    has_next: Optional[bool] = None
    has_previous: Optional[bool] = None

class ValidationErrorResponse(ErrorResponse):
    """Response for validation errors with field details."""
    error_code: str = "VALIDATION_ERROR"
    field_errors: Optional[Dict[str, List[str]]] = None

class NotFoundResponse(ErrorResponse):
    """Standard 404 response."""
    error_code: str = "NOT_FOUND"

class ConflictResponse(ErrorResponse):
    """Standard 409 response for conflicts."""
    error_code: str = "CONFLICT"

class InternalServerErrorResponse(ErrorResponse):
    """Standard 500 response."""
    error_code: str = "INTERNAL_SERVER_ERROR"

# Health check response
class LLMStatus(BaseModel):
    """LLM provider status information."""
    configured: bool = False
    provider: Optional[str] = None
    model: Optional[str] = None

class HealthCheckResponse(BaseResponse):
    """Health check endpoint response."""
    status: str = "healthy"
    version: Optional[str] = None
    uptime: Optional[str] = None
    database_status: Optional[str] = None
    latency_ms: Optional[float] = None
    llm: Optional[LLMStatus] = None

# API test connection response
class ConnectionTestResponse(BaseResponse):
    """API connection test response."""
    provider: str
    status: str  # "connected", "failed", "timeout"
    response_time_ms: Optional[int] = None
    model_info: Optional[Dict[str, Any]] = None

# Model listing responses
class ModelInfo(BaseModel):
    """Information about an AI model."""
    id: str
    name: str
    description: Optional[str] = None
    context_length: Optional[int] = None
    max_tokens: Optional[int] = None
    model_class: Optional[str] = None
    is_gated: Optional[bool] = None
    available_on_current_plan: Optional[bool] = None

class ModelsListResponse(DataResponse[List[ModelInfo]]):
    """Response for model listing endpoints."""
    provider: str

# File operation responses
class FileUploadResponse(DataResponse[Dict[str, str]]):
    """Response for file upload operations."""
    file_path: str
    file_size: int
    mime_type: Optional[str] = None

class FileDeleteResponse(SuccessResponse):
    """Response for file deletion operations."""
    file_path: str

# Template responses
class TemplateInfo(BaseModel):
    """Template information model."""
    id: str
    name: str
    description: Optional[str] = None
    is_built_in: bool = False
    is_editable: bool = True
    user_format: str
    assistant_format: str
    system_format: Optional[str] = None
    memory_format: Optional[str] = None
    stop_sequences: Optional[List[str]] = None
    detection_patterns: Optional[List[str]] = None

class TemplateListResponse(DataResponse[List[TemplateInfo]]):
    """Response for template listing."""
    pass

class TemplateSaveResponse(DataResponse[TemplateInfo]):
    """Response for template save operations."""
    pass

# Settings responses
class SettingsResponse(DataResponse[Dict[str, Any]]):
    """Response for settings operations."""
    pass

# Content filter responses
class FilterRuleInfo(BaseModel):
    """Content filter rule information."""
    id: str
    pattern: str
    action: str
    enabled: bool = True
    description: Optional[str] = None

class ContentFilterResponse(DataResponse[List[FilterRuleInfo]]):
    """Response for content filter operations."""
    pass

# Utility functions for creating standardized responses
def create_error_response(
    error: str,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    exception: Optional[Exception] = None
) -> ErrorResponse:
    """Create a standardized error response."""
    response_data = {
        "error": error,
        "error_code": error_code,
        "details": details
    }
    
    # Add traceback to details in development mode
    if exception and details is not None:
        details["traceback"] = traceback.format_exc()
    
    return ErrorResponse(**response_data)

def create_success_response(message: Optional[str] = None) -> SuccessResponse:
    """Create a standardized success response."""
    return SuccessResponse(message=message)

def create_data_response(data: Any, message: Optional[str] = None) -> DataResponse:
    """Create a standardized data response."""
    return DataResponse(data=data, message=message)

def create_list_response(
    data: List[Any],
    total: int,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    message: Optional[str] = None
) -> ListResponse:
    """Create a standardized list response with pagination."""
    has_next = None
    has_previous = None
    
    if page is not None and page_size is not None:
        has_next = (page * page_size) < total
        has_previous = page > 1
    
    return ListResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        has_next=has_next,
        has_previous=has_previous,
        message=message
    )

# Standard HTTP status responses for OpenAPI documentation
STANDARD_RESPONSES = {
    400: {"model": ValidationErrorResponse, "description": "Validation Error"},
    401: {"model": ErrorResponse, "description": "Unauthorized"},
    403: {"model": ErrorResponse, "description": "Forbidden"},
    404: {"model": NotFoundResponse, "description": "Not Found"},
    409: {"model": ConflictResponse, "description": "Conflict"},
    422: {"model": ValidationErrorResponse, "description": "Unprocessable Entity"},
    500: {"model": InternalServerErrorResponse, "description": "Internal Server Error"},
}

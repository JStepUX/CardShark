# backend/error_handlers.py
# Standardized error handling utilities for FastAPI endpoints

from fastapi import HTTPException, Request
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from pydantic import ValidationError
from typing import Optional, Dict, Any, Callable
import logging
import traceback
from datetime import datetime

from backend.response_models import (
    ErrorResponse, 
    ValidationErrorResponse, 
    NotFoundResponse,
    ConflictResponse,
    InternalServerErrorResponse,
    create_error_response
)

# Configure logger for error handling
error_logger = logging.getLogger("CardShark.ErrorHandler")

class CardSharkException(Exception):
    """Base exception for CardShark application."""
    def __init__(self, message: str, error_code: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

class ValidationException(CardSharkException):
    """Exception for validation errors."""
    def __init__(self, message: str, field_errors: Optional[Dict[str, list]] = None):
        super().__init__(message, "VALIDATION_ERROR")
        self.field_errors = field_errors or {}

class NotFoundException(CardSharkException):
    """Exception for not found errors."""
    def __init__(self, message: str, resource_type: Optional[str] = None, resource_id: Optional[str] = None):
        super().__init__(message, "NOT_FOUND")
        if resource_type:
            self.details["resource_type"] = resource_type
        if resource_id:
            self.details["resource_id"] = resource_id

class ConflictException(CardSharkException):
    """Exception for conflict errors."""
    def __init__(self, message: str, conflicting_resource: Optional[str] = None):
        super().__init__(message, "CONFLICT")
        if conflicting_resource:
            self.details["conflicting_resource"] = conflicting_resource

class DatabaseException(CardSharkException):
    """Exception for database-related errors."""
    def __init__(self, message: str, operation: Optional[str] = None):
        super().__init__(message, "DATABASE_ERROR")
        if operation:
            self.details["operation"] = operation

class ExternalServiceException(CardSharkException):
    """Exception for external service errors."""
    def __init__(self, message: str, service: Optional[str] = None, status_code: Optional[int] = None):
        super().__init__(message, "EXTERNAL_SERVICE_ERROR")
        if service:
            self.details["service"] = service
        if status_code:
            self.details["status_code"] = status_code

class ConfigurationException(CardSharkException):
    """Exception for configuration-related errors."""
    def __init__(self, message: str, config_key: Optional[str] = None):
        super().__init__(message, "CONFIGURATION_ERROR")
        if config_key:
            self.details["config_key"] = config_key

class APIException(CardSharkException):
    """Exception for API-related errors."""
    def __init__(self, message: str, endpoint: Optional[str] = None, status_code: Optional[int] = None):
        super().__init__(message, "API_ERROR")
        if endpoint:
            self.details["endpoint"] = endpoint
        if status_code:
            self.details["status_code"] = status_code

def handle_database_error(e: SQLAlchemyError, operation: str = "database operation") -> HTTPException:
    """Handle SQLAlchemy database errors."""
    error_logger.error(f"Database error during {operation}: {str(e)}")
    error_logger.error(traceback.format_exc())
    
    if isinstance(e, IntegrityError):
        return HTTPException(
            status_code=409,
            detail=f"Data integrity violation during {operation}"
        )
    
    return HTTPException(
        status_code=500,
        detail=f"Database error during {operation}"
    )

def handle_validation_error(e: ValidationError) -> HTTPException:
    """Handle Pydantic validation errors."""
    field_errors = {}
    for error in e.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        if field not in field_errors:
            field_errors[field] = []
        field_errors[field].append(error["msg"])
    
    error_logger.warning(f"Validation error: {field_errors}")
    
    response = ValidationErrorResponse(
        error="Validation failed",
        field_errors=field_errors
    )
    
    return HTTPException(status_code=422, detail=response.dict())

def handle_cardshark_exception(e: CardSharkException) -> HTTPException:
    """Handle custom CardShark exceptions."""
    status_map = {
        "VALIDATION_ERROR": 422,
        "NOT_FOUND": 404,
        "CONFLICT": 409,
        "DATABASE_ERROR": 500,
        "EXTERNAL_SERVICE_ERROR": 502,
        "CONFIGURATION_ERROR": 500,
        "API_ERROR": 500,
    }
    
    status_code = status_map.get(e.error_code, 500)
    
    error_logger.error(f"CardShark exception [{e.error_code}]: {e.message}")
    if e.details:
        error_logger.error(f"Exception details: {e.details}")
    
    response_data = {
        "error": e.message,
        "error_code": e.error_code,
        "details": e.details
    }
    
    return HTTPException(status_code=status_code, detail=response_data)

def handle_generic_exception(e: Exception, operation: str = "operation") -> HTTPException:
    """Handle generic exceptions."""
    error_logger.error(f"Unexpected error during {operation}: {str(e)}")
    error_logger.error(traceback.format_exc())
    
    return HTTPException(
        status_code=500,
        detail=f"An unexpected error occurred during {operation}"
    )

def error_handler_wrapper(operation: str = "operation"):
    """Decorator for standardized error handling in endpoint functions."""
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except HTTPException:
                # Re-raise HTTP exceptions as-is
                raise
            except CardSharkException as e:
                raise handle_cardshark_exception(e)
            except ValidationError as e:
                raise handle_validation_error(e)
            except SQLAlchemyError as e:
                raise handle_database_error(e, operation)
            except Exception as e:
                raise handle_generic_exception(e, operation)
        return wrapper
    return decorator

async def async_error_handler_wrapper(operation: str = "operation"):
    """Async decorator for standardized error handling in endpoint functions."""
    def decorator(func: Callable) -> Callable:
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except HTTPException:
                # Re-raise HTTP exceptions as-is
                raise
            except CardSharkException as e:
                raise handle_cardshark_exception(e)
            except ValidationError as e:
                raise handle_validation_error(e)
            except SQLAlchemyError as e:
                raise handle_database_error(e, operation)
            except Exception as e:
                raise handle_generic_exception(e, operation)
        return wrapper
    return decorator

# Exception handlers for FastAPI app
async def cardshark_exception_handler(request: Request, exc: CardSharkException) -> JSONResponse:
    """Global exception handler for CardShark exceptions."""
    status_map = {
        "VALIDATION_ERROR": 422,
        "NOT_FOUND": 404,
        "CONFLICT": 409,
        "DATABASE_ERROR": 500,
        "EXTERNAL_SERVICE_ERROR": 502,
        "CONFIGURATION_ERROR": 500,
        "API_ERROR": 500,
    }
    
    status_code = status_map.get(exc.error_code, 500)
    
    response = ErrorResponse(
        error=exc.message,
        error_code=exc.error_code,
        details=exc.details
    )
    
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode='json'),
        media_type="application/json"
    )

async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Global exception handler for validation errors."""
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        if field not in field_errors:
            field_errors[field] = []
        field_errors[field].append(error["msg"])
    
    response = ValidationErrorResponse(
        error="Validation failed",
        field_errors=field_errors
    )
    
    return JSONResponse(
        status_code=422,
        content=response.model_dump(mode='json'),
        media_type="application/json"
    )

async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Global exception handler for SQLAlchemy errors."""
    error_logger.error(f"Database error: {str(exc)}")
    error_logger.error(traceback.format_exc())
    
    if isinstance(exc, IntegrityError):
        response = ConflictResponse(error="Data integrity violation")
        status_code = 409
    else:
        response = InternalServerErrorResponse(error="Database error occurred")
        status_code = 500
    
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode='json'),
        media_type="application/json"
    )

async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler for unhandled exceptions."""
    error_logger.error(f"Unhandled exception: {str(exc)}")
    error_logger.error(traceback.format_exc())
    
    response = InternalServerErrorResponse(
        error="An unexpected error occurred"
    )
    
    return JSONResponse(
        status_code=500,
        content=response.model_dump(mode='json'),
        media_type="application/json"
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Global exception handler for HTTP exceptions to ensure consistent JSON response."""
    # If detail is already a dict (potentially from our helper functions), use it directly if possible,
    # but we should wrap it in our standard ErrorResponse if it's not one already.
    # However, if it's a dict, it might be { "error": "...", "error_code": "..." } from handle_cardshark_exception.
    
    if isinstance(exc.detail, dict):
        # Check if it matches our structure
        if "error" in exc.detail:
             return JSONResponse(
                status_code=exc.status_code,
                content=exc.detail, # Assume it's already JSON-serializable if it came from our helpers
                media_type="application/json"
            )
        else:
             # Wrap arbitrary dict
             response = ErrorResponse(
                error="HTTP Error",
                details=exc.detail,
                success=False
             )
    else:
        # Wrap string detail
        response = ErrorResponse(
            error=str(exc.detail),
            error_code=f"HTTP_{exc.status_code}",
            success=False
        )
        
    return JSONResponse(
        status_code=exc.status_code, 
        content=response.model_dump(mode='json'),
        media_type="application/json"
    )

# Helper functions for common error responses
def not_found_error(resource: str, identifier: str = "") -> HTTPException:
    """Create a standardized 404 error."""
    message = f"{resource} not found"
    if identifier:
        message += f": {identifier}"
    
    raise NotFoundException(message, resource_type=resource, resource_id=identifier)

def validation_error(message: str, field_errors: Optional[Dict[str, list]] = None) -> HTTPException:
    """Create a standardized validation error."""
    raise ValidationException(message, field_errors)

def conflict_error(message: str, resource: Optional[str] = None) -> HTTPException:
    """Create a standardized conflict error."""
    raise ConflictException(message, resource)

def database_error(message: str, operation: Optional[str] = None) -> HTTPException:
    """Create a standardized database error."""
    raise DatabaseException(message, operation)

def external_service_error(message: str, service: Optional[str] = None, status_code: Optional[int] = None) -> HTTPException:
    """Create a standardized external service error."""
    raise ExternalServiceException(message, service, status_code)

def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(CardSharkException, cardshark_exception_handler)
    app.add_exception_handler(ValidationError, validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler) # Register HTTP exception handler
    app.add_exception_handler(Exception, generic_exception_handler)

def handle_generic_error(e: Exception, operation: str = "operation") -> HTTPException:
    """Handle generic errors - alias for handle_generic_exception."""
    return handle_generic_exception(e, operation)

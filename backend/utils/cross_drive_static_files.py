"""
@file cross_drive_static_files.py
@description Custom StaticFiles implementation to handle cross-drive paths on Windows.
@dependencies starlette, anyio
@consumers main.py
"""
import os
import anyio
from starlette.staticfiles import StaticFiles as StarletteStaticFiles
from starlette.types import Scope, Receive, Send
from fastapi import Request
from fastapi.responses import HTMLResponse, PlainTextResponse


class CrossDriveStaticFiles(StarletteStaticFiles):
    """
    Extend StaticFiles to handle cross-drive paths on Windows.

    This is necessary because the standard StaticFiles implementation performs
    path containment checks that fail when the static directory and requested
    files are on different drives.
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle a request and return a response."""
        assert scope["type"] == "http"
        request = Request(scope)
        path = request.path_params.get("path", "")
        response = await self.get_response(path, scope)
        await response(scope, receive, send)

    async def get_response(self, path: str, scope: Scope):
        """Get a response for a given path."""
        if path.startswith("/"):
            path = path[1:]

        try:
            full_path, stat_result = await anyio.to_thread.run_sync(
                self.safe_lookup_path, path
            )
            return self.file_response(full_path, stat_result, scope)
        except (FileNotFoundError, PermissionError):
            return self.not_found(scope)

    def not_found(self, scope: Scope):
        """Return a 404 Not Found response."""
        if self.html:
            return HTMLResponse(content="Not Found", status_code=404)
        return PlainTextResponse(content="Not Found", status_code=404)

    def safe_lookup_path(self, path: str):
        """Modified lookup path that handles cross-drive paths."""
        try:
            full_path = os.path.join(self.directory, path)

            # Skip the path containment check if paths are on different drives
            if os.path.splitdrive(full_path)[0] != os.path.splitdrive(self.directory)[0]:
                if not os.path.exists(full_path):
                    raise FileNotFoundError()
            else:
                # If same drive, perform the normal security check
                if not os.path.exists(full_path):
                    raise FileNotFoundError()
                if os.path.commonpath([full_path, self.directory]) != self.directory:
                    raise PermissionError()

            stat_result = os.stat(full_path)
            if stat_result.st_mode & 0o100000 == 0:
                raise FileNotFoundError()

            return full_path, stat_result
        except (FileNotFoundError, PermissionError) as exc:
            raise exc

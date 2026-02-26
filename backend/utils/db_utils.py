"""Reusable database session utilities."""

import contextlib
from typing import Callable, Optional


def get_session_context(db_session_generator: Callable, logger=None):
    """
    Reusable context manager for database sessions.
    Handles both generator (get_db) and factory (SessionLocal) patterns.

    Args:
        db_session_generator: Callable that returns either a generator or a Session
        logger: Optional LogManager instance for error logging

    Returns:
        A context manager that yields a database session

    Usage:
        with get_session_context(self.db_session_generator, self.logger) as db:
            db.query(...)
    """
    @contextlib.contextmanager
    def _ctx():
        session = db_session_generator()
        if hasattr(session, '__next__') or hasattr(session, 'send'):
            try:
                yield next(session)
            finally:
                try:
                    next(session)
                except StopIteration:
                    pass
                except Exception as e:
                    if logger:
                        logger.log_error(f"Error closing session generator: {e}")
        else:
            try:
                yield session
            finally:
                session.close()
    return _ctx()

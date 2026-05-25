"""Shared helper: apply per-user filter to a query if user_id is set."""

from sqlalchemy import Select


def apply_user_filter(query: Select, user_id: int | None):
    """Add WHERE user_id = X clause to a query, only if user_id is not None."""
    if user_id is not None:
        # Import inline to avoid circular dependency at module level
        from ..models.listening_history import ListeningHistory
        return query.where(ListeningHistory.user_id == user_id)
    return query

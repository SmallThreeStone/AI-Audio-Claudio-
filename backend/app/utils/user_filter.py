"""Shared helper: apply per-user filter to a query if user_id is set."""

from sqlalchemy import Select


def apply_user_filter(query: Select, user_id: int | None, model: type):
    """Add WHERE user_id = X clause to a query, only if user_id is not None.

    Usage:
        from ..models.listening_history import ListeningHistory
        q = apply_user_filter(select(func.count()).select_from(ListeningHistory), uid, ListeningHistory)
    """
    if user_id is not None:
        return query.where(model.user_id == user_id)
    return query

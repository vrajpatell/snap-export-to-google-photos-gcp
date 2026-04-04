from __future__ import annotations

import time
from collections.abc import Callable
from functools import wraps
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")


def with_backoff(
    retries: int = 4,
    initial_delay: float = 0.5,
    multiplier: float = 2.0,
    retry_exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @wraps(func)
        def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
            delay = initial_delay
            last_exc: Exception | None = None
            for _ in range(retries):
                try:
                    return func(*args, **kwargs)
                except retry_exceptions as exc:
                    last_exc = exc
                    time.sleep(delay)
                    delay *= multiplier
            if last_exc is None:
                raise RuntimeError("retry failed without exception")
            raise last_exc

        return wrapped

    return decorator

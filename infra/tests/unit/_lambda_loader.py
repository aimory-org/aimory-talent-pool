"""
Utility for loading Lambda app.py modules in tests.

All Lambda handlers are named ``app.py``, so a naive ``import app`` will
always return the first one found on sys.path (whichever Lambda dir was
prepended last).  This helper explicitly manages sys.path and sys.modules
so each test file can import its own Lambda cleanly.

Usage in a test file::

    from _lambda_loader import load as _load_lambda

    def _reload_app():
        return _load_lambda("modules/api/lambda_src/get_talent")
"""

import os
import sys

_INFRA_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "../.."))


def load(lambda_rel_path: str):
    """Import (or re-import) a Lambda's ``app.py``.

    Args:
        lambda_rel_path: Path relative to the infra root.
            e.g. ``"modules/api/lambda_src/get_talent"``

    Returns:
        The freshly-loaded ``app`` module.
    """
    full_dir = os.path.normpath(os.path.join(_INFRA_ROOT, lambda_rel_path))

    # Make this Lambda's directory the first entry on sys.path so the
    # correct app.py is found when we clear sys.modules below.
    if full_dir in sys.path:
        sys.path.remove(full_dir)
    sys.path.insert(0, full_dir)

    # Evict any cached module so Python performs a fresh file lookup.
    sys.modules.pop("app", None)

    import app  # noqa: PLC0415  (import not at top of file — intentional)

    return app

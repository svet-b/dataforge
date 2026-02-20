from __future__ import annotations

from cuid2 import Cuid

_generate_cuid16 = Cuid(length=16).generate


def generate_cuid() -> str:
    return _generate_cuid16()

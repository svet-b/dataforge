from __future__ import annotations

from nanoid import generate

ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
ID_LENGTH = 12


def generate_id() -> str:
    return generate(ALPHANUMERIC, ID_LENGTH)

import re

from app.ids import generate_id


ID_PATTERN = re.compile(r"^[a-zA-Z0-9]{12}$")


def test_generate_id_uses_12_char_alphanumeric() -> None:
    generated = generate_id()
    assert ID_PATTERN.match(generated) is not None

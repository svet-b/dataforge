import pytest

from app.engine.cte_parser import extract_ctes


def test_no_ctes_returns_empty() -> None:
    result = extract_ctes("SELECT 1 AS x")
    assert result == []


def test_single_cte() -> None:
    sql = """
    WITH totals AS (
        SELECT meter_id, SUM(energy_kwh) AS total
        FROM raw_data
        GROUP BY meter_id
    )
    SELECT * FROM totals
    """
    result = extract_ctes(sql)
    assert len(result) == 1
    assert result[0].name == "totals"
    assert result[0].ordinal == 0
    assert "SELECT * FROM totals LIMIT 100" in result[0].prefix_sql
    assert result[0].prefix_sql.upper().startswith("WITH")


def test_multiple_ctes_in_order() -> None:
    sql = """
    WITH step1 AS (
        SELECT id, value FROM source
    ),
    step2 AS (
        SELECT id, value * 2 AS doubled FROM step1
    ),
    step3 AS (
        SELECT id, doubled + 1 AS result FROM step2
    )
    SELECT * FROM step3
    """
    result = extract_ctes(sql)
    assert len(result) == 3
    assert [c.name for c in result] == ["step1", "step2", "step3"]
    assert [c.ordinal for c in result] == [0, 1, 2]

    # step1 prefix should only reference step1
    assert "step1" in result[0].prefix_sql
    assert "step2" not in result[0].prefix_sql

    # step2 prefix should include step1 and step2
    assert "step1" in result[1].prefix_sql
    assert "step2" in result[1].prefix_sql
    assert "step3" not in result[1].prefix_sql

    # step3 prefix should include all three
    assert "step1" in result[2].prefix_sql
    assert "step2" in result[2].prefix_sql
    assert "step3" in result[2].prefix_sql


def test_nested_subquery_inside_cte() -> None:
    sql = """
    WITH filtered AS (
        SELECT * FROM source WHERE id IN (SELECT id FROM other WHERE active = true)
    )
    SELECT * FROM filtered
    """
    result = extract_ctes(sql)
    assert len(result) == 1
    assert result[0].name == "filtered"


def test_invalid_sql_raises_value_error() -> None:
    with pytest.raises(ValueError, match="Failed to parse SQL"):
        extract_ctes("NOT VALID SQL !!! {{{}}")

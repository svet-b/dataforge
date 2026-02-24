from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Logging
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite:///data/dataforge.db"

    # Storage
    data_dir: str = "/data"
    max_run_history: int = 20

    # AMMP Data API
    ammp_data_api_key: str = ""

    # LLM (used in later stages)
    llm_model: str = "claude-sonnet-4-6"
    anthropic_api_key: str = ""

    # Execution (used in later stages)
    execution_max_memory_mb: int = 4096
    execution_timeout_seconds: int = 300
    preview_cache_ttl: int = 300

    model_config = {"env_file": ".env"}


settings = Settings()

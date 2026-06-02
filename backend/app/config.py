from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict

import yaml
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]


class OpenAlexConfig(BaseModel):
    api_key: str = ""
    base_url: str = "https://api.openalex.org"
    timeout_seconds: int = 20
    max_retries: int = 3
    requests_per_second: int = 5
    max_referenced_works_per_paper: int = 60


class DirectionConfig(BaseModel):
    max_depth: int = 3
    limits_by_depth: Dict[int, int] = Field(default_factory=lambda: {1: 10, 2: 5, 3: 2})


class GraphConfig(BaseModel):
    predecessor: DirectionConfig = Field(default_factory=DirectionConfig)
    successor: DirectionConfig = Field(default_factory=DirectionConfig)
    sort_by: str = "cited_by_count"


class CacheConfig(BaseModel):
    enabled: bool = True
    ttl_seconds: int = 86400


class AppConfig(BaseModel):
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_port: int = 5173


class Settings(BaseModel):
    openalex: OpenAlexConfig = Field(default_factory=OpenAlexConfig)
    graph: GraphConfig = Field(default_factory=GraphConfig)
    cache: CacheConfig = Field(default_factory=CacheConfig)
    app: AppConfig = Field(default_factory=AppConfig)


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


@lru_cache
def get_settings() -> Settings:
    config_path = ROOT / "config.yml"
    fallback_path = ROOT / "config.example.yml"
    data = _load_yaml(config_path) or _load_yaml(fallback_path)
    return Settings.model_validate(data)

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class UsageState(BaseModel):
    limit: Optional[int] = None
    remaining: Optional[int] = None
    credits_used: Optional[int] = None
    reset_seconds: Optional[int] = None
    source: Literal["headers", "rate-limit", "unknown"] = "unknown"
    error: Optional[str] = None


class Paper(BaseModel):
    id: str
    openalex_id: str
    title: str
    authors: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    journal: Optional[str] = None
    cited_by_count: int = 0
    doi: Optional[str] = None
    url: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    abstract: Optional[str] = None
    level: int = 0
    direction: Literal["target", "predecessor", "successor", "keyword"] = "target"
    reference_overlap: float = 0.0
    local_cocitation: float = 0.0
    keyword_overlap: float = 0.0
    citation_score: float = 0.0
    author_overlap: float = 0.0
    layout_score: float = 0.0


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str


class YearKeywords(BaseModel):
    year: int
    keywords: List[str]


class LevelKeywords(BaseModel):
    level: int
    keywords: List[str]


class DirectionKeywords(BaseModel):
    direction: Literal["target", "predecessor", "successor"]
    level: int
    label: str
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    keywords: List[str]


class GraphResponse(BaseModel):
    target: Paper
    nodes: List[Paper]
    edges: List[GraphEdge]
    year_keywords: List[YearKeywords]
    level_keywords: List[LevelKeywords]
    direction_keyword_groups: List[DirectionKeywords]
    usage: UsageState


class GraphRequest(BaseModel):
    doi: str
    predecessor_max_depth: Optional[int] = None
    successor_max_depth: Optional[int] = None
    predecessor_limits_by_depth: Optional[Dict[int, int]] = None
    successor_limits_by_depth: Optional[Dict[int, int]] = None


class SearchResponse(BaseModel):
    results: List[Paper]
    usage: UsageState


class HealthResponse(BaseModel):
    status: str
    api_key_configured: bool

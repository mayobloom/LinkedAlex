from __future__ import annotations

import logging
import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .logging import configure_logging
from .models import GraphRequest, GraphResponse, HealthResponse, SearchResponse
from .openalex import GraphBuilder, OpenAlexClient, paper_from_work


configure_logging()
logger = logging.getLogger("linkedalex.api")
settings = get_settings()
client = OpenAlexClient(settings)
app = FastAPI(title="LinkedAlex API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    api_key = settings.openalex.api_key
    return HealthResponse(status="ok", api_key_configured=bool(api_key and api_key != "YOUR_OPENALEX_API_KEY"))


@app.get("/api/usage")
async def usage():
    logger.info("usage_check started")
    state = await client.rate_limit()
    logger.info(
        "usage_check completed remaining=%s credits_used=%s source=%s error=%s",
        state.remaining,
        state.credits_used,
        state.source,
        state.error,
    )
    return state


@app.post("/api/graph", response_model=GraphResponse)
async def graph(request: GraphRequest) -> GraphResponse:
    started = time.perf_counter()
    logger.info("graph started doi=%s", request.doi)
    builder = GraphBuilder(client, settings, request)
    try:
        target, nodes, edges, year_keywords, level_keywords, direction_keyword_groups = await builder.build(request.doi)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(
                status_code=400,
                detail="Please enter a valid DOI. No OpenAlex work was found for this input.",
            ) from exc
        raise
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    logger.info(
        "graph completed doi=%s nodes=%s edges=%s year_keyword_groups=%s direction_keyword_groups=%s remaining=%s elapsed_ms=%s",
        request.doi,
        len(nodes),
        len(edges),
        len(year_keywords),
        len(direction_keyword_groups),
        client.usage.remaining,
        elapsed_ms,
    )
    return GraphResponse(
        target=target,
        nodes=nodes,
        edges=edges,
        year_keywords=year_keywords,
        level_keywords=level_keywords,
        direction_keyword_groups=direction_keyword_groups,
        usage=client.usage,
    )


@app.get("/api/search", response_model=SearchResponse)
async def search(
    keywords: list[str] = Query(default=[]),
    mode: str = Query(default="or", pattern="^(or|and)$"),
    limit: int = Query(default=20, ge=0, le=100),
) -> SearchResponse:
    started = time.perf_counter()
    cleaned = [keyword.strip() for keyword in keywords if keyword.strip()]
    logger.info("keyword_search started keywords=%s mode=%s", cleaned, mode)
    works = await client.search_keywords(cleaned, mode, limit=limit) if cleaned and limit > 0 else []
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    logger.info(
        "keyword_search completed keywords=%s mode=%s limit=%s results=%s remaining=%s elapsed_ms=%s",
        cleaned,
        mode,
        limit,
        len(works),
        client.usage.remaining,
        elapsed_ms,
    )
    return SearchResponse(
        results=[paper_from_work(work, 0, "target") for work in works],
        usage=client.usage,
    )

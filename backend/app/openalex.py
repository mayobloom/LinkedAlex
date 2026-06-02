from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

import httpx
from diskcache import Cache
from fastapi import HTTPException

from .config import ROOT, Settings
from .models import DirectionKeywords, GraphEdge, GraphRequest, LevelKeywords, Paper, UsageState, YearKeywords


DOI_PREFIX = re.compile(r"^https?://(dx\.)?doi\.org/", re.IGNORECASE)
logger = logging.getLogger("linkedalex.openalex")


def normalize_doi(doi: str) -> str:
    cleaned = DOI_PREFIX.sub("", doi.strip())
    return cleaned.lower()


def short_openalex_id(openalex_id: str) -> str:
    return openalex_id.rstrip("/").split("/")[-1]


def chunks(items: List[str], size: int) -> Iterable[List[str]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def reconstruct_abstract(index: Optional[Dict[str, List[int]]]) -> Optional[str]:
    if not index:
        return None
    positions: Dict[int, str] = {}
    for word, indexes in index.items():
        for position in indexes:
            positions[position] = word
    return " ".join(positions[i] for i in sorted(positions))


def paper_from_work(work: Dict[str, Any], level: int, direction: str) -> Paper:
    authorships = work.get("authorships") or []
    authors = [
        item.get("author", {}).get("display_name")
        for item in authorships
        if item.get("author", {}).get("display_name")
    ]
    primary_location = work.get("primary_location") or {}
    source = primary_location.get("source") or {}
    concepts = work.get("concepts") or []
    keywords = work.get("keywords") or []
    keyword_names = [
        item.get("display_name") or item.get("keyword")
        for item in [*keywords, *concepts]
        if item.get("display_name") or item.get("keyword")
    ]
    openalex_id = work.get("id") or ""
    return Paper(
        id=short_openalex_id(openalex_id),
        openalex_id=openalex_id,
        title=work.get("title") or "Untitled",
        authors=authors[:12],
        year=work.get("publication_year"),
        journal=source.get("display_name"),
        cited_by_count=work.get("cited_by_count") or 0,
        doi=work.get("doi"),
        url=primary_location.get("landing_page_url") or work.get("doi") or openalex_id,
        keywords=list(dict.fromkeys(keyword_names))[:8],
        abstract=reconstruct_abstract(work.get("abstract_inverted_index")),
        level=level,
        direction=direction,  # type: ignore[arg-type]
    )


def is_valid_predecessor(parent_work: Dict[str, Any], predecessor_work: Dict[str, Any]) -> bool:
    parent_year = parent_work.get("publication_year")
    predecessor_year = predecessor_work.get("publication_year")
    if parent_year is None or predecessor_year is None:
        return True
    return predecessor_year <= parent_year


def is_valid_successor(parent_work: Dict[str, Any], successor_work: Dict[str, Any]) -> bool:
    parent_year = parent_work.get("publication_year")
    successor_year = successor_work.get("publication_year")
    if parent_year is None or successor_year is None:
        return True
    return successor_year >= parent_year


def reference_ids(work: Dict[str, Any]) -> set[str]:
    return {short_openalex_id(item) for item in work.get("referenced_works") or [] if item}


def author_ids(work: Dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for authorship in work.get("authorships") or []:
        author_id = (authorship.get("author") or {}).get("id")
        if author_id:
            ids.add(short_openalex_id(author_id))
    return ids


def keyword_set(paper: Paper) -> set[str]:
    return {keyword.strip().lower() for keyword in paper.keywords if keyword.strip()}


class OpenAlexClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.cache = Cache(str(ROOT / ".cache" / "openalex"))
        self._usage = UsageState()
        self._lock = asyncio.Lock()
        rps = max(settings.openalex.requests_per_second, 1)
        self._min_interval = 1 / rps
        self._last_request = 0.0

    @property
    def usage(self) -> UsageState:
        return self._usage

    def _headers_to_usage(self, headers: httpx.Headers) -> None:
        def parse_int(name: str) -> Optional[int]:
            value = headers.get(name)
            if value is None:
                return None
            try:
                return int(float(value))
            except ValueError:
                return None

        limit = parse_int("X-RateLimit-Limit")
        remaining = parse_int("X-RateLimit-Remaining")
        used = parse_int("X-RateLimit-Credits-Used")
        reset = parse_int("X-RateLimit-Reset")
        if limit is None and remaining is None:
            return
        self._usage = UsageState(
            limit=limit,
            remaining=remaining,
            credits_used=used,
            reset_seconds=reset,
            source="headers",
        )

    async def _wait_for_rate_limit(self) -> None:
        async with self._lock:
            now = asyncio.get_running_loop().time()
            wait = self._min_interval - (now - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = asyncio.get_running_loop().time()

    async def request(self, path: str, params: Optional[Dict[str, Any]] = None, use_cache: bool = True) -> Dict[str, Any]:
        params = dict(params or {})
        api_key = self.settings.openalex.api_key
        if api_key and api_key != "YOUR_OPENALEX_API_KEY":
            params["api_key"] = api_key

        url = f"{self.settings.openalex.base_url.rstrip('/')}/{path.lstrip('/')}"
        cache_key = (url, tuple(sorted(params.items())))
        if self.settings.cache.enabled and use_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.info("cache_hit path=%s", path)
                return cached

        timeout = self.settings.openalex.timeout_seconds
        last_error: Optional[Exception] = None
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(self.settings.openalex.max_retries + 1):
                await self._wait_for_rate_limit()
                started = time.perf_counter()
                try:
                    response = await client.get(url, params=params)
                    self._headers_to_usage(response.headers)
                    elapsed_ms = round((time.perf_counter() - started) * 1000)
                    logger.info(
                        "request path=%s status=%s remaining=%s credits_used=%s elapsed_ms=%s attempt=%s",
                        path,
                        response.status_code,
                        self._usage.remaining,
                        self._usage.credits_used,
                        elapsed_ms,
                        attempt + 1,
                    )
                    if response.status_code == 429 and attempt < self.settings.openalex.max_retries:
                        await asyncio.sleep(2**attempt)
                        continue
                    if 400 <= response.status_code < 500:
                        raise HTTPException(
                            status_code=response.status_code,
                            detail=f"OpenAlex request failed with status {response.status_code}",
                        )
                    response.raise_for_status()
                    payload = response.json()
                    if self.settings.cache.enabled and use_cache:
                        self.cache.set(cache_key, payload, expire=self.settings.cache.ttl_seconds)
                    return payload
                except HTTPException as exc:
                    last_error = exc
                    logger.warning(
                        "request_failed path=%s attempt=%s status=%s detail=%s",
                        path,
                        attempt + 1,
                        exc.status_code,
                        exc.detail,
                    )
                    raise exc
                except Exception as exc:  # noqa: BLE001
                    last_error = exc
                    logger.warning("request_failed path=%s attempt=%s error_type=%s", path, attempt + 1, type(exc).__name__)
                    if attempt < self.settings.openalex.max_retries:
                        await asyncio.sleep(2**attempt)

        error_type = type(last_error).__name__ if last_error else "UnknownError"
        raise HTTPException(status_code=502, detail=f"OpenAlex request failed: {error_type}")

    async def rate_limit(self) -> UsageState:
        try:
            data = await self.request("/rate-limit", use_cache=False)
            state = data.get("rate_limit") or {}
            usage = UsageState(
                limit=state.get("credits_limit"),
                remaining=state.get("credits_remaining"),
                credits_used=state.get("credits_used"),
                reset_seconds=state.get("resets_in_seconds"),
                source="rate-limit",
            )
            self._usage = usage
            return usage
        except Exception as exc:  # noqa: BLE001
            self._usage = UsageState(error=str(exc), source="unknown")
            return self._usage

    async def work_by_doi(self, doi: str) -> Dict[str, Any]:
        return await self.request(f"/works/doi:{quote(normalize_doi(doi), safe='')}")

    async def works_by_openalex_ids(self, openalex_ids: List[str]) -> List[Dict[str, Any]]:
        works: List[Dict[str, Any]] = []
        ids = [short_openalex_id(openalex_id) for openalex_id in openalex_ids]
        for chunk in chunks(ids, 50):
            data = await self.request(
                "/works",
                {
                    "filter": f"ids.openalex:{'|'.join(chunk)}",
                    "per-page": len(chunk),
                },
            )
            works.extend(data.get("results") or [])
        return works

    async def successors(self, work_id: str, limit: int) -> List[Dict[str, Any]]:
        data = await self.request(
            "/works",
            {
                "filter": f"cites:{short_openalex_id(work_id)}",
                "sort": "cited_by_count:desc",
                "per-page": limit,
            },
        )
        return data.get("results") or []

    async def search_keywords(self, keywords: List[str], mode: str, limit: int = 20) -> List[Dict[str, Any]]:
        if mode == "and":
            query = " ".join(keywords)
            data = await self.request(
                "/works",
                {
                    "search": query,
                    "filter": "type:article",
                    "sort": "cited_by_count:desc",
                    "per-page": limit,
                },
            )
            return data.get("results") or []

        by_id: Dict[str, Dict[str, Any]] = {}
        per_keyword_limit = max(5, min(limit, 10))
        for keyword in keywords:
            data = await self.request(
                "/works",
                {
                    "search": keyword,
                    "filter": "type:article",
                    "sort": "cited_by_count:desc",
                    "per-page": per_keyword_limit,
                },
            )
            for work in data.get("results") or []:
                by_id[work.get("id") or ""] = work
        return sorted(by_id.values(), key=lambda item: item.get("cited_by_count") or 0, reverse=True)[:limit]


class GraphBuilder:
    def __init__(self, client: OpenAlexClient, settings: Settings, request: GraphRequest) -> None:
        self.client = client
        self.settings = settings
        self.request = request
        self.nodes: Dict[str, Paper] = {}
        self.works: Dict[str, Dict[str, Any]] = {}
        self.edges: Dict[str, GraphEdge] = {}
        self._visited_predecessors: set[Tuple[str, int]] = set()
        self._visited_successors: set[Tuple[str, int]] = set()

    def _max_depth(self, direction: str) -> int:
        requested = (
            self.request.predecessor_max_depth
            if direction == "predecessor"
            else self.request.successor_max_depth
        )
        fallback = (
            self.settings.graph.predecessor.max_depth
            if direction == "predecessor"
            else self.settings.graph.successor.max_depth
        )
        return max(0, min(requested if requested is not None else fallback, 3))

    def _limit_for_depth(self, direction: str, depth: int) -> int:
        requested = (
            self.request.predecessor_limits_by_depth
            if direction == "predecessor"
            else self.request.successor_limits_by_depth
        )
        fallback = (
            self.settings.graph.predecessor.limits_by_depth
            if direction == "predecessor"
            else self.settings.graph.successor.limits_by_depth
        )
        value = (requested or {}).get(depth, fallback.get(depth, 0))
        return max(0, min(value, 50))

    async def build(
        self,
        doi: str,
    ) -> Tuple[Paper, List[Paper], List[GraphEdge], List[YearKeywords], List[LevelKeywords], List[DirectionKeywords]]:
        target_work = await self.client.work_by_doi(doi)
        target = paper_from_work(target_work, 0, "target")
        self.nodes[target.id] = target
        self.works[target.id] = target_work

        await self._expand_predecessors(target_work, target.id, 1)
        await self._expand_successors(target_work, target.id, 1)

        self._add_intra_graph_edges()
        self._score_nodes(target.id)
        nodes = sorted(self.nodes.values(), key=lambda item: (item.year or 9999, item.level, item.title))
        return (
            target,
            nodes,
            list(self.edges.values()),
            self._year_keywords(nodes),
            self._level_keywords(nodes),
            self._direction_keywords(nodes),
        )

    async def _expand_predecessors(self, work: Dict[str, Any], citing_node_id: str, depth: int) -> None:
        if depth > self._max_depth("predecessor"):
            return
        work_key = short_openalex_id(work.get("id") or "")
        if (work_key, depth) in self._visited_predecessors:
            return
        self._visited_predecessors.add((work_key, depth))

        refs = work.get("referenced_works") or []
        original_ref_count = len(refs)
        refs = refs[: self.settings.openalex.max_referenced_works_per_paper]
        papers = await self.client.works_by_openalex_ids(refs)
        fetched_count = len(papers)
        invalid_year_count = sum(1 for item in papers if not is_valid_predecessor(work, item))
        papers = [item for item in papers if is_valid_predecessor(work, item)]
        limit = self._limit_for_depth("predecessor", depth)
        papers = sorted(papers, key=lambda item: item.get("cited_by_count") or 0, reverse=True)[:limit]
        logger.info(
            "expand direction=predecessor parent=%s depth=%s references=%s fetched=%s invalid_year=%s selected=%s",
            citing_node_id,
            depth,
            original_ref_count,
            fetched_count,
            invalid_year_count,
            len(papers),
        )

        for predecessor_work in papers:
            paper = paper_from_work(predecessor_work, depth, "predecessor")
            self.nodes.setdefault(paper.id, paper)
            self.works.setdefault(paper.id, predecessor_work)
            self._add_edge(citing_node_id, paper.id)
            await self._expand_predecessors(predecessor_work, paper.id, depth + 1)

    async def _expand_successors(self, work: Dict[str, Any], cited_node_id: str, depth: int) -> None:
        if depth > self._max_depth("successor"):
            return
        work_key = short_openalex_id(work.get("id") or "")
        if (work_key, depth) in self._visited_successors:
            return
        self._visited_successors.add((work_key, depth))

        limit = self._limit_for_depth("successor", depth)
        request_limit = min(max(limit * 2, limit), 50)
        successors = await self.client.successors(work.get("id") or "", request_limit)
        invalid_year_count = sum(1 for item in successors if not is_valid_successor(work, item))
        successors = [item for item in successors if is_valid_successor(work, item)][:limit]
        logger.info(
            "expand direction=successor parent=%s depth=%s requested=%s invalid_year=%s selected=%s",
            cited_node_id,
            depth,
            request_limit,
            invalid_year_count,
            len(successors),
        )
        for successor_work in successors:
            paper = paper_from_work(successor_work, depth, "successor")
            self.nodes.setdefault(paper.id, paper)
            self.works.setdefault(paper.id, successor_work)
            self._add_edge(paper.id, cited_node_id)
            await self._expand_successors(successor_work, paper.id, depth + 1)

    def _add_edge(self, citing_id: str, cited_id: str) -> None:
        edge_id = f"{citing_id}->{cited_id}"
        self.edges.setdefault(edge_id, GraphEdge(id=edge_id, source=citing_id, target=cited_id))

    def _add_intra_graph_edges(self) -> None:
        node_ids = set(self.nodes)
        added = 0
        for citing_id, work in self.works.items():
            for cited_id in reference_ids(work):
                if cited_id in node_ids and cited_id != citing_id:
                    before = len(self.edges)
                    self._add_edge(citing_id, cited_id)
                    added += len(self.edges) - before
        logger.info("intra_graph_edges added=%s total=%s", added, len(self.edges))

    def _score_nodes(self, target_id: str) -> None:
        target = self.nodes[target_id]
        target_work = self.works[target_id]
        target_refs = reference_ids(target_work)
        target_keywords = keyword_set(target)
        target_authors = author_ids(target_work)
        max_citations = max((node.cited_by_count for node in self.nodes.values()), default=0)

        successors = [
            (node_id, reference_ids(work))
            for node_id, work in self.works.items()
            if self.nodes[node_id].direction == "successor"
        ]
        successor_count = max(len(successors), 1)

        for node_id, paper in self.nodes.items():
            if node_id == target_id:
                paper.reference_overlap = 1.0
                paper.local_cocitation = 1.0
                paper.keyword_overlap = 1.0
                paper.citation_score = 1.0 if max_citations else 0.0
                paper.author_overlap = 1.0
                paper.layout_score = 1.0
                continue

            work = self.works[node_id]
            refs = reference_ids(work)
            keywords = keyword_set(paper)
            authors = author_ids(work)

            paper.reference_overlap = round(len(target_refs & refs) / len(target_refs), 4) if target_refs else 0.0
            paper.local_cocitation = round(
                sum(1 for _, successor_refs in successors if target_id in successor_refs and node_id in successor_refs) / successor_count,
                4,
            )
            paper.keyword_overlap = round(len(target_keywords & keywords) / len(target_keywords | keywords), 4) if target_keywords or keywords else 0.0
            paper.citation_score = round(math.log1p(paper.cited_by_count) / math.log1p(max_citations), 4) if max_citations else 0.0
            paper.author_overlap = 1.0 if target_authors & authors else 0.0
            paper.layout_score = round(
                0.40 * paper.reference_overlap
                + 0.25 * paper.local_cocitation
                + 0.20 * paper.keyword_overlap
                + 0.10 * paper.citation_score
                + 0.05 * paper.author_overlap,
                4,
            )

    def _year_keywords(self, nodes: Iterable[Paper]) -> List[YearKeywords]:
        grouped: Dict[int, Counter[str]] = {}
        for node in nodes:
            if node.year is None:
                continue
            grouped.setdefault(node.year, Counter()).update(node.keywords)
        return [
            YearKeywords(year=year, keywords=[word for word, _ in counter.most_common(5)])
            for year, counter in sorted(grouped.items())
        ]

    def _level_keywords(self, nodes: Iterable[Paper]) -> List[LevelKeywords]:
        grouped: Dict[int, Counter[str]] = {}
        for node in nodes:
            grouped.setdefault(node.level, Counter()).update(node.keywords)
        return [
            LevelKeywords(level=level, keywords=[word for word, _ in counter.most_common(10)])
            for level, counter in sorted(grouped.items())
        ]

    def _direction_keywords(self, nodes: Iterable[Paper]) -> List[DirectionKeywords]:
        grouped: Dict[Tuple[str, int], List[Paper]] = {}
        for node in nodes:
            grouped.setdefault((node.direction, node.level), []).append(node)

        order = {"target": 0, "predecessor": 1, "successor": 2}
        labels = {
            "target": "Target paper",
            "predecessor": "Earlier cited papers",
            "successor": "Later citing papers",
        }
        results: List[DirectionKeywords] = []
        for (direction, level), papers in sorted(grouped.items(), key=lambda item: (order[item[0][0]], item[0][1])):
            years = [paper.year for paper in papers if paper.year is not None]
            counter: Counter[str] = Counter()
            for paper in papers:
                counter.update(paper.keywords)
            results.append(
                DirectionKeywords(
                    direction=direction,  # type: ignore[arg-type]
                    level=level,
                    label=f"{labels[direction]} · step {level}" if level else labels[direction],
                    year_min=min(years) if years else None,
                    year_max=max(years) if years else None,
                    keywords=[word for word, _ in counter.most_common(10)],
                )
            )
        return results

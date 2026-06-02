export type UsageState = {
  limit: number | null;
  remaining: number | null;
  credits_used: number | null;
  reset_seconds: number | null;
  source: 'headers' | 'rate-limit' | 'unknown';
  error?: string | null;
};

export type Paper = {
  id: string;
  openalex_id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  cited_by_count: number;
  doi: string | null;
  url: string | null;
  keywords: string[];
  abstract: string | null;
  level: number;
  direction: 'target' | 'predecessor' | 'successor' | 'keyword';
  reference_overlap: number;
  local_cocitation: number;
  keyword_overlap: number;
  citation_score: number;
  author_overlap: number;
  layout_score: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type KeywordGroup = {
  direction: 'target' | 'predecessor' | 'successor';
  level: number;
  label: string;
  year_min: number | null;
  year_max: number | null;
  keywords: string[];
};

export type GraphResponse = {
  target: Paper;
  nodes: Paper[];
  edges: GraphEdge[];
  year_keywords: Array<{ year: number; keywords: string[] }>;
  level_keywords: Array<{ level: number; keywords: string[] }>;
  direction_keyword_groups: KeywordGroup[];
  usage: UsageState;
};

export type GraphSettings = {
  predecessorMaxDepth: number;
  successorMaxDepth: number;
  predecessorLimitsByDepth: Record<number, number>;
  successorLimitsByDepth: Record<number, number>;
};

export type SearchResponse = {
  results: Paper[];
  usage: UsageState;
};

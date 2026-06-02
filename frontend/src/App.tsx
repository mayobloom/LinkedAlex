import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchGraph, fetchUsage } from './api/client';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GraphSettingsPanel } from './components/GraphSettingsPanel';
import { GraphView } from './components/GraphView';
import { KeywordPanel } from './components/KeywordPanel';
import { KeywordSearch } from './components/KeywordSearch';
import { PaperPanel } from './components/PaperPanel';
import { SearchBar } from './components/SearchBar';
import { UsageBar } from './components/UsageBar';
import type { GraphResponse, GraphSettings, Paper } from './types/api';

const defaultGraphSettings: GraphSettings = {
  predecessorMaxDepth: 2,
  successorMaxDepth: 2,
  predecessorLimitsByDepth: { 1: 10, 2: 5, 3: 2 },
  successorLimitsByDepth: { 1: 10, 2: 5, 3: 2 },
};

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onOpenSettings?: () => void;
  paperForGraph?: Paper;
};

function maxPapersForDirection(limits: Record<number, number>, maxDepth: number) {
  let total = 0;
  let product = 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    product *= limits[depth] ?? 0;
    total += product;
  }
  return total;
}

function maxDisplayedPapers(settings: GraphSettings) {
  return (
    1 +
    maxPapersForDirection(settings.predecessorLimitsByDepth, settings.predecessorMaxDepth) +
    maxPapersForDirection(settings.successorLimitsByDepth, settings.successorMaxDepth)
  );
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function topValues(values: Array<string | null>, limit = 10) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const cleaned = value?.trim();
    if (!cleaned) return;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function countPapersWithKeyword(papers: Paper[], keyword: string) {
  const target = normalizeValue(keyword);
  return papers.filter((paper) => paper.keywords.some((paperKeyword) => normalizeValue(paperKeyword) === target)).length;
}

function replaceGraphMessage(paper: Paper, settings: GraphSettings) {
  return (
    <>
      This will call OpenAlex to build a citation graph and may consume API credits.
      {'\n'}
      The <strong><u>current</u></strong> graph and selected keyword search context <strong><u>will be replaced</u></strong>.
      {'\n\n'}
      <strong>[Search Parameters]</strong>
      {'\n'}
      Title: {paper.title}
      {'\n'}
      Predecessor depth: {settings.predecessorMaxDepth}
      {'\n'}
      Successor depth: {settings.successorMaxDepth}
      {'\n'}
      Max displayed papers: {maxDisplayedPapers(settings)}
      {(settings.predecessorMaxDepth === 3 || settings.successorMaxDepth === 3) && (
        <>
          {'\n'}
          Depth 3 may take longer and consume more credits.
        </>
      )}
      {'\n'}
      Continue?
    </>
  );
}

export function App() {
  const [doi, setDoi] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [highlightKeywords, setHighlightKeywords] = useState<string[]>([]);
  const [highlightMode, setHighlightMode] = useState<'or' | 'and'>('or');
  const [keywordMode, setKeywordMode] = useState<'or' | 'and'>('or');
  const [keywordLimit, setKeywordLimit] = useState(20);
  const [graphSettings, setGraphSettings] = useState<GraphSettings>(defaultGraphSettings);
  const [graphSettingsOpen, setGraphSettingsOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [panelHistory, setPanelHistory] = useState<Paper[]>([]);
  const [panelIndex, setPanelIndex] = useState(-1);

  useQuery({
    queryKey: ['usage'],
    queryFn: fetchUsage,
  });

  const graphMutation = useMutation({
    mutationFn: fetchGraph,
    onSuccess: (data) => {
      setGraph(data);
      setSelectedPaper(data.target);
      setPanelHistory([data.target]);
      setPanelIndex(0);
    },
  });

  useEffect(() => {
    document.title = graph ? `${graph.target.title} · LinkedAlex` : 'LinkedAlex';
  }, [graph]);

  function toggleKeyword(keyword: string) {
    setSelectedKeywords((current) =>
      current.includes(keyword) ? current.filter((item) => item !== keyword) : [...current, keyword],
    );
  }

  function toggleHighlightKeyword(keyword: string) {
    setHighlightKeywords((current) =>
      current.includes(keyword) ? current.filter((item) => item !== keyword) : [...current, keyword],
    );
  }

  function openPaper(paper: Paper) {
    setSelectedPaper(paper);
    setPanelHistory((current) => {
      if (panelIndex >= 0 && current[panelIndex]?.id === paper.id) {
        return current;
      }
      const previous = panelIndex >= 0 ? current.slice(0, panelIndex + 1) : current;
      const next = [...previous, paper];
      setPanelIndex(next.length - 1);
      return next;
    });
  }

  function navigatePanel(offset: -1 | 1) {
    const nextIndex = panelIndex + offset;
    const nextPaper = panelHistory[nextIndex];
    if (!nextPaper) return;
    setPanelIndex(nextIndex);
    setSelectedPaper(nextPaper);
  }

  function submitGraphSearch() {
    const hasDepthThree = graphSettings.predecessorMaxDepth === 3 || graphSettings.successorMaxDepth === 3;
    setPendingConfirm({
      title: 'Build citation graph',
      message: (
        <>
          This will call OpenAlex to build a citation graph and may consume API credits.
          {'\n\n'}
          <strong>[Search Parameters]</strong>
          {'\n'}
          Predecessor depth: {graphSettings.predecessorMaxDepth}
          {'\n'}
          Successor depth: {graphSettings.successorMaxDepth}
          {'\n'}
          Max displayed papers: {maxDisplayedPapers(graphSettings)}
          {hasDepthThree && (
            <>
              {'\n'}
              Depth 3 may take longer and consume more credits.
            </>
          )}
        </>
      ),
      onConfirm: () => graphMutation.mutate({ doi, settings: graphSettings }),
    });
  }

  function buildGraphFromPaper(paper: Paper) {
    if (!paper.doi) return;
    setPendingConfirm({
      title: 'Replace current graph',
      message: replaceGraphMessage(paper, graphSettings),
      onOpenSettings: () => setGraphSettingsOpen(true),
      paperForGraph: paper,
      onConfirm: () => {
        setDoi(paper.doi!);
        setSelectedKeywords([]);
        graphMutation.mutate({ doi: paper.doi!, settings: graphSettings });
      },
    });
  }

  useEffect(() => {
    if (!pendingConfirm?.paperForGraph) return;
    const paper = pendingConfirm.paperForGraph;
    setPendingConfirm((current) =>
      current?.paperForGraph ? { ...current, message: replaceGraphMessage(paper, graphSettings) } : current,
    );
  }, [graphSettings, pendingConfirm?.paperForGraph]);

  function requestConfirmation(confirm: PendingConfirm) {
    setPendingConfirm(confirm);
  }

  const keywordGroups =
    graph?.direction_keyword_groups.map((group) => {
      const groupPapers = graph.nodes.filter((paper) => paper.direction === group.direction && paper.level === group.level);
      return {
        label: group.label,
        yearRange:
          group.year_min && group.year_max
            ? `(${group.year_min}${group.year_min === group.year_max ? '' : `~${group.year_max}`})`
            : null,
        keywords: group.keywords
          .map((keyword) => ({ label: keyword, count: countPapersWithKeyword(groupPapers, keyword) }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      };
    }) ?? [];

  const journalGroups =
    graph?.direction_keyword_groups
      .map((group) => ({
        label: group.label,
        yearRange:
          group.year_min && group.year_max
            ? `(${group.year_min}${group.year_min === group.year_max ? '' : `~${group.year_max}`})`
            : null,
        keywords: topValues(
          graph.nodes
            .filter((paper) => paper.direction === group.direction && paper.level === group.level)
            .map((paper) => paper.journal),
        ),
      }))
      .filter((group) => group.keywords.length > 0) ?? [];

  return (
    <div className="app">
      <UsageBar />
      <main>
        <header className="topbar">
          <div>
            <div className="brand-title">
              <img src="/linkedalex-icon.svg" alt="" aria-hidden="true" />
              <h1>LinkedAlex</h1>
            </div>
            <p>Explore predecessor and successor papers by citation links, keywords, and relevance.</p>
          </div>
          <div className="search-area">
            <SearchBar
              value={doi}
              loading={graphMutation.isPending}
              onChange={setDoi}
              onSubmit={submitGraphSearch}
              onOpenSettings={() => setGraphSettingsOpen((current) => !current)}
            />
            {graphSettingsOpen && (
              <GraphSettingsPanel
                settings={graphSettings}
                onChange={setGraphSettings}
                onDismiss={() => setGraphSettingsOpen(false)}
              />
            )}
          </div>
        </header>

        {graphMutation.error && <p className="error">{graphMutation.error.message}</p>}

        <GraphView
          graph={graph}
          loading={graphMutation.isPending}
          selectedPaperId={selectedPaper?.id ?? null}
          highlightKeywords={highlightKeywords}
          highlightMode={highlightMode}
          onHighlightModeChange={setHighlightMode}
          onSelect={openPaper}
          onKeyword={toggleHighlightKeyword}
        />

        <div className="lower-grid">
          <div className="context-column">
            <KeywordPanel
              title="Context keywords"
              groups={keywordGroups}
              selectedKeywords={selectedKeywords}
              onKeyword={toggleKeyword}
            />
            <KeywordPanel title="Context journals" groups={journalGroups} />
          </div>
          <KeywordSearch
            keywords={selectedKeywords}
            mode={keywordMode}
            limit={keywordLimit}
            onModeChange={setKeywordMode}
            onLimitChange={setKeywordLimit}
            onRemoveKeyword={toggleKeyword}
            onSelectPaper={openPaper}
            onRequestConfirmation={requestConfirmation}
          />
        </div>
      </main>
      <footer className="app-footer">
        <span>
          Data provided by{' '}
          <a href="https://openalex.org" target="_blank" rel="noreferrer">
            OpenAlex
          </a>
          .
        </span>
        <span>LinkedAlex is released under the MIT License.</span>
        <span>OpenAlex data is CC0.</span>
        <span>Contact: GitHub Issues</span>
      </footer>
      <PaperPanel
        paper={selectedPaper}
        loading={graphMutation.isPending}
        canGoBack={panelIndex > 0}
        canGoForward={panelIndex >= 0 && panelIndex < panelHistory.length - 1}
        onBack={() => navigatePanel(-1)}
        onForward={() => navigatePanel(1)}
        onClose={() => setSelectedPaper(null)}
        onBuildGraph={buildGraphFromPaper}
      />
      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          onOpenSettings={pendingConfirm.onOpenSettings}
          onDismiss={() => setPendingConfirm(null)}
          onConfirm={() => {
            const action = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            action();
          }}
        />
      )}
    </div>
  );
}

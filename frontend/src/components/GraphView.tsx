import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { ChevronLeft, ChevronRight, Download, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GraphResponse, Paper } from '../types/api';

type PaperNodeData = Paper & {
  onSelect: (paper: Paper) => void;
  highlight: 'selected' | 'linked-predecessor' | 'linked-successor' | null;
  keywordGlow: boolean;
};

function PaperNode({ data }: NodeProps<Node<PaperNodeData>>) {
  const highlightClass = data.highlight ? ` ${data.highlight}` : '';
  const keywordClass = data.keywordGlow ? ' keyword-glow' : '';

  return (
    <button className={`paper-node ${data.direction}${highlightClass}${keywordClass}`} type="button" onClick={() => data.onSelect(data)}>
      <Handle className="paper-node-handle" type="target" position={Position.Left} />
      <Handle className="paper-node-handle" type="source" position={Position.Right} />
      <strong>{data.year ?? 'n.d.'}</strong>
      <span>{data.title}</span>
      <small>{data.cited_by_count.toLocaleString()} cites</small>
    </button>
  );
}

const nodeTypes = { paper: PaperNode };

function CenterLineEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps) {
  return (
    <BaseEdge
      id={id}
      path={`M ${sourceX},${sourceY} L ${targetX},${targetY}`}
      markerEnd={markerEnd}
      style={style}
    />
  );
}

const edgeTypes = { centerLine: CenterLineEdge };

type ExportFormat = 'json' | 'csv';

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
};

type Props = {
  graph: GraphResponse | null;
  loading: boolean;
  selectedPaperId: string | null;
  highlightKeywords: string[];
  highlightMode: 'or' | 'and';
  onHighlightModeChange: (mode: 'or' | 'and') => void;
  onSelect: (paper: Paper) => void;
  onKeyword: (keyword: string) => void;
};

function buildHighlightMap(graph: GraphResponse, selectedPaperId: string | null) {
  const highlights = new Map<string, PaperNodeData['highlight']>();
  if (!selectedPaperId) return highlights;
  highlights.set(selectedPaperId, 'selected');

  graph.edges.forEach((edge) => {
    if (edge.source === selectedPaperId) {
      highlights.set(edge.target, 'linked-predecessor');
    }
    if (edge.target === selectedPaperId) {
      highlights.set(edge.source, 'linked-successor');
    }
  });

  highlights.set(selectedPaperId, 'selected');
  return highlights;
}

function normalizedKeywordSet(keywords: string[]) {
  return new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean));
}

function hasKeywordGlow(paper: Paper, selectedKeywords: Set<string>, mode: 'or' | 'and') {
  if (!selectedKeywords.size) return false;
  const paperKeywords = new Set(paper.keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean));
  if (mode === 'and') {
    return [...selectedKeywords].every((keyword) => paperKeywords.has(keyword));
  }
  return [...selectedKeywords].some((keyword) => paperKeywords.has(keyword));
}

function buildNodes(
  graph: GraphResponse,
  selectedPaperId: string | null,
  highlightKeywords: string[],
  highlightMode: 'or' | 'and',
  onSelect: (paper: Paper) => void,
): Node<PaperNodeData>[] {
  const centerX = 700;
  const centerY = 320;
  const nodeWidth = 230;
  const nodeHeight = 104;
  const gap = 34;
  const grouped = {
    predecessor: graph.nodes.filter((paper) => paper.direction === 'predecessor'),
    successor: graph.nodes.filter((paper) => paper.direction === 'successor'),
  };
  const layoutItems: Array<{ paper: Paper; x: number; y: number; fixed: boolean }> = [];

  graph.nodes
    .filter((paper) => paper.direction === 'target')
    .forEach((paper) => layoutItems.push({ paper, x: centerX, y: centerY, fixed: true }));

  (Object.entries(grouped) as Array<['predecessor' | 'successor', Paper[]]>).forEach(([direction, papers]) => {
    const side = direction === 'predecessor' ? -1 : 1;
    const sorted = [...papers].sort((a, b) => (b.layout_score ?? 0) - (a.layout_score ?? 0));

    sorted.forEach((paper, index) => {
      const score = Math.max(0, Math.min(paper.layout_score ?? 0, 1));
      const depth = Math.max(paper.level, 1);
      const radius = 190 + depth * 72 + (1 - score) * 150;
      const spread = Math.min(1.35, Math.max(0.65, sorted.length * 0.08));
      const slot = sorted.length <= 1 ? 0 : index / (sorted.length - 1) - 0.5;
      const angle = slot * spread;
      layoutItems.push({
        paper,
        x: centerX + side * (radius * Math.cos(angle)),
        y: centerY + radius * Math.sin(angle),
        fixed: false,
      });
    });
  });

  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let i = 0; i < layoutItems.length; i += 1) {
      for (let j = i + 1; j < layoutItems.length; j += 1) {
        const a = layoutItems[i];
        const b = layoutItems[j];
        const minX = nodeWidth + gap;
        const minY = nodeHeight + gap;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue;

        const distance = Math.hypot(dx, dy) || 1;
        const push = Math.min(42, Math.max(overlapX, overlapY) * 0.18 + 4);
        const pushX = (dx / distance) * push;
        const pushY = (dy / distance) * push;

        if (!a.fixed) {
          a.x -= pushX;
          a.y -= pushY;
        }
        if (!b.fixed) {
          b.x += pushX;
          b.y += pushY;
        }
      }
    }

    layoutItems.forEach((item) => {
      if (item.fixed) return;
      if (item.paper.direction === 'predecessor') {
        item.x = Math.min(item.x, centerX - 190);
      }
      if (item.paper.direction === 'successor') {
        item.x = Math.max(item.x, centerX + 190);
      }
    });
  }

  const positions = new Map(layoutItems.map((item) => [item.paper.id, { x: item.x, y: item.y }]));
  const highlights = buildHighlightMap(graph, selectedPaperId);
  const selectedKeywords = normalizedKeywordSet(highlightKeywords);

  return graph.nodes.map((paper) => {
    const position = positions.get(paper.id) ?? { x: centerX, y: centerY };

    return {
      id: paper.id,
      type: 'paper',
      position,
      data: { ...paper, onSelect, highlight: highlights.get(paper.id) ?? null, keywordGlow: hasKeywordGlow(paper, selectedKeywords, highlightMode) },
    };
  });
}

function edgeHighlightClass(edge: GraphResponse['edges'][number], selectedPaperId: string | null) {
  if (!selectedPaperId) return '';
  if (edge.source === selectedPaperId) return ' citation-edge-linked-predecessor';
  if (edge.target === selectedPaperId) return ' citation-edge-linked-successor';
  return ' citation-edge-muted';
}

function buildEdges(graph: GraphResponse, selectedPaperId: string | null): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'centerLine',
    className: `citation-edge${edgeHighlightClass(edge, selectedPaperId)}`,
    focusable: false,
    selectable: false,
  }));
}

function exportRows(graph: GraphResponse) {
  return graph.nodes.map((paper) => ({
    TITLE: paper.title,
    AUTHORS: paper.authors,
    YEAR: paper.year,
    JOURNAL: paper.journal,
    CITATIONS: paper.cited_by_count,
    DOI: paper.doi,
    KEYWORDS: paper.keywords,
    ABSTRACT: paper.abstract,
  }));
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function graphExportPayload(graph: GraphResponse, format: ExportFormat) {
  const rows = exportRows(graph);
  if (format === 'json') {
    return {
      mimeType: 'application/json',
      extension: 'json',
      content: JSON.stringify(rows, null, 2),
    };
  }

  const headers = ['TITLE', 'AUTHORS', 'YEAR', 'JOURNAL', 'CITATIONS', 'DOI', 'KEYWORDS', 'ABSTRACT'];
  const csvBody = [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(','))].join(
    '\n',
  );

  return {
    mimeType: 'text/csv',
    extension: 'csv',
    content: `\uFEFF${csvBody}`,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveGraphExport(graph: GraphResponse, format: ExportFormat) {
  const payload = graphExportPayload(graph, format);
  const filename = `linkedalex-graph-${new Date().toISOString().slice(0, 10)}.${payload.extension}`;
  const blob = new Blob([payload.content], { type: `${payload.mimeType};charset=utf-8` });
  const browserWindow = window as WindowWithSavePicker;

  if (browserWindow.showSaveFilePicker) {
    const handle = await browserWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: format === 'json' ? 'JSON file' : 'CSV file',
          accept: { [payload.mimeType]: [`.${payload.extension}`] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  downloadBlob(blob, filename);
}

export function GraphView({
  graph,
  loading,
  selectedPaperId,
  highlightKeywords,
  highlightMode,
  onHighlightModeChange,
  onSelect,
  onKeyword,
}: Props) {
  const [yearKeywordsOpen, setYearKeywordsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const selectedKeywords = normalizedKeywordSet(highlightKeywords);

  function handleExport(format: ExportFormat) {
    if (!graph) return;
    setExportOpen(false);
    void saveGraphExport(graph, format).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to export graph papers.', error);
    });
  }

  useEffect(() => {
    if (!settingsOpen && !exportOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as globalThis.Node)) {
        setSettingsOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target as globalThis.Node)) {
        setExportOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [settingsOpen, exportOpen]);

  if (!graph) {
    return (
      <section className="graph-empty">
        <h2>{loading ? 'Building citation graph...' : 'Enter a DOI to map citation context.'}</h2>
      </section>
    );
  }

  const nodes = buildNodes(graph, selectedPaperId, highlightKeywords, highlightMode, onSelect);
  const edges = buildEdges(graph, selectedPaperId);

  return (
    <section className="graph-section">
      {loading && <div className="graph-loading">Updating citation graph...</div>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => onSelect(node.data)}
        fitView
        minZoom={0.25}
        maxZoom={1.5}
        nodesDraggable={false}
        edgesFocusable={false}
      >
        <Background gap={24} size={1} />
        <Controls position="top-right" showInteractive={false} />
      </ReactFlow>
      <button
        className={`year-keywords-toggle ${yearKeywordsOpen ? 'open' : ''}`}
        type="button"
        onClick={() => setYearKeywordsOpen((current) => !current)}
        aria-label={yearKeywordsOpen ? 'Hide year keywords' : 'Show year keywords'}
      >
        {yearKeywordsOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className={`year-keywords-settings-anchor ${yearKeywordsOpen ? 'open' : ''}`} ref={settingsRef}>
        <button
          className="year-keywords-settings-button"
          type="button"
          onClick={() => setSettingsOpen((current) => !current)}
          aria-label="Year keyword highlight settings"
        >
          <Settings size={15} />
        </button>
        {settingsOpen && (
          <div className="year-keywords-settings-popover">
            <strong>Highlight condition</strong>
            <div className="mode-control compact-mode" role="group" aria-label="Keyword highlight condition">
              <button className={highlightMode === 'or' ? 'active' : ''} type="button" onClick={() => onHighlightModeChange('or')}>
                OR
              </button>
              <button className={highlightMode === 'and' ? 'active' : ''} type="button" onClick={() => onHighlightModeChange('and')}>
                AND
              </button>
            </div>
          </div>
        )}
      </div>
      <div className={`year-keywords ${yearKeywordsOpen ? 'open' : 'closed'}`}>
        {[...graph.year_keywords].sort((a, b) => b.year - a.year).map((group) => (
          <div key={group.year}>
            <strong>{group.year}</strong>
            {group.keywords.map((keyword) => (
              <button
                className={selectedKeywords.has(keyword.trim().toLowerCase()) ? 'selected' : ''}
                key={keyword}
                type="button"
                onClick={() => onKeyword(keyword)}
              >
                {keyword}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className={`graph-export-anchor ${yearKeywordsOpen ? 'open' : ''}`} ref={exportRef}>
        <button
          className="graph-export-button"
          type="button"
          onClick={() => setExportOpen((current) => !current)}
          aria-label="Export graph papers"
          title="Export graph papers"
        >
          <Download size={17} />
        </button>
        {exportOpen && (
          <div className="graph-export-popover">
            <strong>Export papers</strong>
            <button
              type="button"
              onClick={() => handleExport('json')}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
            >
              CSV
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

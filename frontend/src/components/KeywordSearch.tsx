import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Settings, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { searchKeywords } from '../api/client';
import type { Paper } from '../types/api';

type Props = {
  keywords: string[];
  mode: 'or' | 'and';
  limit: number;
  onModeChange: (mode: 'or' | 'and') => void;
  onLimitChange: (limit: number) => void;
  onRemoveKeyword: (keyword: string) => void;
  onSelectPaper: (paper: Paper) => void;
  onRequestConfirmation: (confirm: { title: string; message: string; onConfirm: () => void }) => void;
};

export function KeywordSearch({
  keywords,
  mode,
  limit,
  onModeChange,
  onLimitChange,
  onRemoveKeyword,
  onSelectPaper,
  onRequestConfirmation,
}: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftLimit, setDraftLimit] = useState(limit);
  const mutation = useMutation({
    mutationFn: () => searchKeywords(keywords, mode, limit),
  });

  function openSettings() {
    setDraftLimit(limit);
    setSettingsOpen((current) => !current);
  }

  function saveSettings() {
    onLimitChange(draftLimit);
    setSettingsOpen(false);
  }

  useEffect(() => {
    if (!settingsOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [settingsOpen]);

  function runSearch() {
    if (!keywords.length || limit <= 0 || mutation.isPending) return;
    const requestCount = mode === 'or' ? keywords.length : 1;
    onRequestConfirmation({
      title: 'Search keyword papers',
      message: `This search will call OpenAlex ${requestCount} time(s) with a result limit of ${limit}. Actual credit usage may be higher.`,
      onConfirm: () => mutation.mutate(),
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  }

  return (
    <section className="search-results" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="search-results-header">
        <h2>Keyword search</h2>
        <button
          className="icon-button compact"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openSettings();
          }}
          aria-label="Keyword search settings"
        >
          <Settings size={16} />
        </button>
        <div className="mode-control" role="group" aria-label="Search condition">
          <button className={mode === 'or' ? 'active' : ''} type="button" onClick={() => onModeChange('or')}>
            OR
          </button>
          <button className={mode === 'and' ? 'active' : ''} type="button" onClick={() => onModeChange('and')}>
            AND
          </button>
        </div>
        <button className="search-action" type="button" disabled={!keywords.length || limit <= 0 || mutation.isPending} onClick={runSearch}>
          {mutation.isPending ? 'Searching' : 'Search'}
        </button>
      </div>

      <div className="keyword-settings-anchor">
        {settingsOpen && (
        <div className="settings-popover keyword-settings-popover" ref={popoverRef} onPointerDown={(event) => event.stopPropagation()}>
          <div className="settings-popover-header">
            <h2>Keyword search settings</h2>
          </div>
          <label className="range-field">
            <span>Results per search</span>
            <input
              className={draftLimit > 30 ? 'warning-range' : ''}
              type="range"
              min="0"
              max="100"
              step="5"
              value={draftLimit}
              onChange={(event) => setDraftLimit(Number(event.target.value))}
            />
            <strong>{draftLimit}</strong>
          </label>
          {draftLimit > 30 && <p className="settings-warning">More than 30 results may consume more OpenAlex credits per search.</p>}
          <div className="settings-actions">
            <button type="button" onClick={() => setSettingsOpen(false)}>
              Dismiss
            </button>
            <button className="primary" type="button" onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="selected-keywords">
        {keywords.length ? (
          keywords.map((keyword) => (
            <button key={keyword} type="button" onClick={() => onRemoveKeyword(keyword)}>
              {keyword}
              <X size={13} />
            </button>
          ))
        ) : (
          <p className="muted">Select keywords from the left panel.</p>
        )}
      </div>

      {mutation.isPending && <p className="muted">Searching...</p>}
      {mutation.error && <p className="error">{mutation.error.message}</p>}
      {mutation.data?.results.map((paper) => (
        <article className="result-row" key={paper.id}>
          <div>
            <button className="result-title" type="button" onClick={() => onSelectPaper({ ...paper, direction: 'keyword' })}>
              {paper.title}
            </button>
            <p>
              {paper.year ?? 'Unknown'} · {paper.cited_by_count.toLocaleString()} citations
            </p>
          </div>
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noreferrer" aria-label={`Open ${paper.title}`}>
              <ExternalLink size={16} />
            </a>
          )}
        </article>
      ))}
    </section>
  );
}

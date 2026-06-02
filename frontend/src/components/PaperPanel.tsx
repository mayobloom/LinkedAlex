import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react';
import type { Paper } from '../types/api';

type Props = {
  paper: Paper | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onClose: () => void;
  onBuildGraph: (paper: Paper) => void;
};

export function PaperPanel({
  paper,
  loading,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onClose,
  onBuildGraph,
}: Props) {
  const label = paper?.direction === 'keyword' ? 'keyword-related' : paper?.direction;

  return (
    <aside className={`paper-panel ${paper ? 'open' : ''}`}>
      {paper && (
        <>
          <div className="panel-nav">
            <button className="icon-button" type="button" onClick={onBack} disabled={!canGoBack} aria-label="Previous paper">
              <ArrowLeft size={17} />
            </button>
            <button className="icon-button" type="button" onClick={onForward} disabled={!canGoForward} aria-label="Next paper">
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="panel-header">
            <div>
              <div className={`direction-pill ${paper.direction}`}>{label}</div>
              <h2>{paper.title}</h2>
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close panel">
              <X size={18} />
            </button>
          </div>

          <dl className="paper-meta">
            <div>
              <dt>Authors</dt>
              <dd>{paper.authors.length ? paper.authors.join(', ') : 'Unknown'}</dd>
            </div>
            <div>
              <dt>Year / Journal</dt>
              <dd>
                {paper.year ?? 'Unknown'}
                {paper.journal ? ` · ${paper.journal}` : ''}
              </dd>
            </div>
            <div>
              <dt>Citations</dt>
              <dd>{paper.cited_by_count.toLocaleString()}</dd>
            </div>
            <div>
              <dt>DOI</dt>
              <dd>{paper.doi ?? 'Unknown'}</dd>
            </div>
          </dl>

          {paper.url && (
            <a className="paper-link" href={paper.url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open paper
            </a>
          )}

          <section className="panel-section">
            <h3>Keywords</h3>
            <div className="keyword-list">
              {paper.keywords.length ? (
                paper.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)
              ) : (
                <span>No keywords available.</span>
              )}
            </div>
          </section>

          <section className="panel-section">
            <h3>Abstract</h3>
            <p className="abstract">{paper.abstract ?? 'No abstract available.'}</p>
          </section>

          <button className="panel-build-button" type="button" disabled={loading || !paper.doi} onClick={() => onBuildGraph(paper)}>
            {loading ? (
              <span className="loading-label">
                Loading
                <span className="loading-spinner" aria-hidden />
              </span>
            ) : (
              'Search / Build Graph'
            )}
          </button>
        </>
      )}
    </aside>
  );
}

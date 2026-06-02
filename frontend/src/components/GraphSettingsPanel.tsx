import { useEffect, useRef, useState } from 'react';
import type { GraphSettings } from '../types/api';

type Props = {
  settings: GraphSettings;
  onChange: (settings: GraphSettings) => void;
  onDismiss: () => void;
};

const recommendedLimits: Record<number, number> = {
  1: 10,
  2: 5,
  3: 2,
};

function updateLimit(settings: GraphSettings, direction: 'predecessor' | 'successor', depth: number, value: number) {
  const key = direction === 'predecessor' ? 'predecessorLimitsByDepth' : 'successorLimitsByDepth';
  return {
    ...settings,
    [key]: {
      ...settings[key],
      [depth]: value,
    },
  };
}

function maxPapersForDirection(limits: Record<number, number>, maxDepth: number) {
  let total = 0;
  let product = 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    product *= limits[depth] ?? 0;
    total += product;
  }
  return total;
}

export function GraphSettingsPanel({ settings, onChange, onDismiss }: Props) {
  const popoverRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(settings);
  const hasDepthWarning = draft.predecessorMaxDepth === 3 || draft.successorMaxDepth === 3;
  const predecessorSteps = [1, 2, 3].filter((depth) => depth <= draft.predecessorMaxDepth);
  const successorSteps = [1, 2, 3].filter((depth) => depth <= draft.successorMaxDepth);
  const hasLimitWarning = [1, 2, 3].some(
    (depth) =>
      (draft.predecessorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth] ||
      (draft.successorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth],
  );
  const maxDisplayedPapers =
    1 +
    maxPapersForDirection(draft.predecessorLimitsByDepth, draft.predecessorMaxDepth) +
    maxPapersForDirection(draft.successorLimitsByDepth, draft.successorMaxDepth);

  function save() {
    onChange(draft);
    onDismiss();
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onDismiss();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onDismiss]);

  return (
    <section className="settings-popover graph-settings-popover" ref={popoverRef} onPointerDown={(event) => event.stopPropagation()}>
      <div className="settings-popover-header">
        <h2>Graph settings</h2>
      </div>
      <div className="settings-grid">
        <label className="range-field">
          <span>Predecessor depth</span>
          <input
            className={draft.predecessorMaxDepth === 3 ? 'warning-range' : ''}
            type="range"
            min="0"
            max="3"
            step="1"
            value={draft.predecessorMaxDepth}
            onChange={(event) => setDraft({ ...draft, predecessorMaxDepth: Number(event.target.value) })}
          />
          <strong>{draft.predecessorMaxDepth}</strong>
        </label>
        <label className="range-field">
          <span>Successor depth</span>
          <input
            className={draft.successorMaxDepth === 3 ? 'warning-range' : ''}
            type="range"
            min="0"
            max="3"
            step="1"
            value={draft.successorMaxDepth}
            onChange={(event) => setDraft({ ...draft, successorMaxDepth: Number(event.target.value) })}
          />
          <strong>{draft.successorMaxDepth}</strong>
        </label>
      </div>

      {hasDepthWarning && <p className="settings-warning">Depth 3 may consume more OpenAlex credits and take longer.</p>}

      <div className="limit-grid">
        <div>
          <h3>
            Predecessor papers per step
            <span>(papers shown at each step, selected by citation count)</span>
          </h3>
          {predecessorSteps.length ? (
            predecessorSteps.map((depth) => (
              <label key={depth}>
                <span>
                  Step {depth}
                  {(draft.predecessorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth] && (
                    <span className="warning-icon" aria-label="Warning" title="Above recommended limit">
                      !
                    </span>
                  )}
                </span>
                <input
                  className={(draft.predecessorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth] ? 'warning-input' : ''}
                  type="number"
                  min="0"
                  max="50"
                  value={draft.predecessorLimitsByDepth[depth] ?? 0}
                  onChange={(event) => setDraft(updateLimit(draft, 'predecessor', depth, Number(event.target.value)))}
                />
              </label>
            ))
          ) : (
            <p className="muted compact">No predecessor expansion.</p>
          )}
        </div>
        <div>
          <h3>
            Successor papers per step
            <span>(papers shown at each step, selected by citation count)</span>
          </h3>
          {successorSteps.length ? (
            successorSteps.map((depth) => (
              <label key={depth}>
                <span>
                  Step {depth}
                  {(draft.successorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth] && (
                    <span className="warning-icon" aria-label="Warning" title="Above recommended limit">
                      !
                    </span>
                  )}
                </span>
                <input
                  className={(draft.successorLimitsByDepth[depth] ?? 0) > recommendedLimits[depth] ? 'warning-input' : ''}
                  type="number"
                  min="0"
                  max="50"
                  value={draft.successorLimitsByDepth[depth] ?? 0}
                  onChange={(event) => setDraft(updateLimit(draft, 'successor', depth, Number(event.target.value)))}
                />
              </label>
            ))
          ) : (
            <p className="muted compact">No successor expansion.</p>
          )}
        </div>
      </div>
      <div className="settings-actions">
        <span className="max-paper-count">Max displayed papers: {maxDisplayedPapers}</span>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
        <button className="primary" type="button" onClick={save}>
          Save
        </button>
      </div>
      {hasLimitWarning && (
        <p className="settings-warning limit-warning">
          High step values may consume more OpenAlex credits and take longer.
        </p>
      )}
    </section>
  );
}

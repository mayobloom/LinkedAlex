export type ContextValue = {
  label: string;
  count: number;
};

type Props = {
  title: string;
  groups: Array<{ label: string; yearRange: string | null; keywords: ContextValue[] }>;
  selectedKeywords?: string[];
  onKeyword?: (keyword: string) => void;
};

function ContextChipLabel({ item }: { item: ContextValue }) {
  return (
    <>
      <span className="context-value-label">{item.label}</span>
      <span className="context-value-count">| {item.count}</span>
    </>
  );
}

export function KeywordPanel({ title, groups, selectedKeywords = [], onKeyword }: Props) {
  return (
    <section className="keyword-panel">
      <h2>{title}</h2>
      <div className="keyword-groups">
        {groups.map((group) => (
          <div className="keyword-group" key={group.label}>
            <h3>
              {group.label}
              {group.yearRange && <span>{group.yearRange}</span>}
            </h3>
            <div className="keyword-list">
              {group.keywords.map((item) => (
                onKeyword ? (
                  <button
                    className={selectedKeywords.includes(item.label) ? 'selected' : ''}
                    key={item.label}
                    type="button"
                    onClick={() => onKeyword(item.label)}
                  >
                    <ContextChipLabel item={item} />
                  </button>
                ) : (
                  <span key={item.label}>
                    <ContextChipLabel item={item} />
                  </span>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

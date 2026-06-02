import { Search, Settings } from 'lucide-react';
import type { FormEvent } from 'react';

type Props = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
};

export function SearchBar({ value, loading, onChange, onSubmit, onOpenSettings }: Props) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="search-row" onSubmit={handleSubmit}>
      <Search size={18} aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter a DOI here"
        aria-label="DOI"
      />
      <button
        className="settings-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenSettings();
        }}
        aria-label="Graph settings"
      >
        <Settings size={17} />
      </button>
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? (
          <span className="loading-label">
            Loading
            <span className="loading-spinner" aria-hidden />
          </span>
        ) : (
          'Search / Build Graph'
        )}
      </button>
    </form>
  );
}

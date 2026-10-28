import { Loader2, Search, X } from 'lucide-react';

// Search box with a clear button. Enter submits immediately, Esc clears.
export default function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Поиск',
  loading = false,
  autoFocus = false,
  className = '',
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
      <input
        className="input input-search"
        type="text"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit?.(value);
          } else if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
            onSubmit?.('');
          }
        }}
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-lava" />
      ) : (
        value && (
          <button
            type="button"
            className="search-clear"
            aria-label="Очистить"
            onClick={() => {
              onChange('');
              onSubmit?.('');
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )
      )}
    </div>
  );
}

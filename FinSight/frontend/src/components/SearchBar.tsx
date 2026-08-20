import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = "Search for a company..." }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    onSearch(value);
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-bloomberg-text-muted" />
      </div>
        <input
          type="text"
          value={query}
        onChange={handleChange}
          placeholder={placeholder}
        className="block w-full pl-10 pr-10 py-2.5 bg-bloomberg-dark border border-bloomberg-border rounded-lg text-bloomberg-text placeholder-bloomberg-text-muted focus:outline-none focus:ring-2 focus:ring-bloomberg-accent focus:border-transparent"
        />
        {query && (
          <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-bloomberg-text-muted hover:text-bloomberg-text"
          >
          <X className="h-5 w-5" />
          </button>
        )}
    </div>
  );
}

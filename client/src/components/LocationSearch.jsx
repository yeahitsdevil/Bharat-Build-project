import { useState } from 'react';

export default function LocationSearch({ onSearch, loading }) {
  const [value, setValue] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const query = value.trim();
    if (query) onSearch(query);
  };

  return (
    <form className="location-search" onSubmit={submit}>
      <span className="location-search-icon">⌖</span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search a city or exact address"
        aria-label="Search a city or address"
        maxLength={180}
      />
      <button disabled={loading}>{loading ? 'Locating…' : 'Search location'}</button>
    </form>
  );
}

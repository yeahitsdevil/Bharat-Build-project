const options = [1, 2, 5, 10, 25, 50];

export default function RadiusControl({ value, onChange }) {
  return (
    <div className="radius-control" aria-label="Search radius">
      <span className="radius-label">Range</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((km) => <option key={km} value={km}>{km} km</option>)}
      </select>
    </div>
  );
}

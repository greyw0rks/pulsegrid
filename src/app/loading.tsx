export default function Loading() {
  return (
    <div className="page shell" aria-busy="true" aria-label="Loading monitoring overview">
      <div className="skeleton loading-title" />
      <div className="summary-grid loading-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="summary-cell skeleton" key={index} />)}
      </div>
      <div className="skeleton loading-panel" />
    </div>
  );
}

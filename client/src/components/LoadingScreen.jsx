export default function LoadingScreen({ message = 'Finding places around you…' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-orbit"><span className="loading-dot" /></div>
      <div className="loading-brand">roamly</div>
      <p>{message}</p>
    </div>
  );
}

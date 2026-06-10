export default function LoadingState({
  title = "Loading...",
  message = "Please wait while the protocol record loads.",
  className = "",
  label = "Loading content",
}) {
  return (
    <div
      className={`loading-state ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="loading-state__spinner" aria-hidden="true" />
      <h1 className="loading-state__title">{title}</h1>
      <p className="loading-state__message">{message}</p>
    </div>
  );
}

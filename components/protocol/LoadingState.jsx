export default function LoadingState({
  title = "Loading...",
  message = "Please wait while the protocol record loads.",
  className = "",
}) {
  return (
    <div className={`loading-state ${className}`.trim()}>
      <div className="loading-state__spinner" aria-hidden="true" />
      <h1 className="loading-state__title">{title}</h1>
      <p className="loading-state__message">{message}</p>
    </div>
  );
}

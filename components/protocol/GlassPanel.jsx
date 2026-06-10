export default function GlassPanel({
  children,
  className = "",
  title,
  subtitle,
  as: Tag = "div",
}) {
  return (
    <Tag className={`glass-panel ${className}`.trim()}>
      {title && <h2 className="glass-panel__title">{title}</h2>}
      {subtitle && <p className="glass-panel__subtitle">{subtitle}</p>}
      {children}
    </Tag>
  );
}

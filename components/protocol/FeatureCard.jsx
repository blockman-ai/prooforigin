export default function FeatureCard({ step, title, description, accent = "cyan" }) {
  return (
    <article className={`feature-card feature-card--${accent}`}>
      <span className="feature-card__step">{step}</span>
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__body">{description}</p>
    </article>
  );
}

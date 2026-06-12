const PLANS = [
  {
    name: "Free",
    price: "$0",
    features: ["1 Trust Pass", "Voice Anchor", "Basic Trust History"],
  },
  {
    name: "Plus",
    price: "$9.99/month",
    features: ["10 Trust Passes", "TrustDNA Timeline", "Extended Expiration"],
    featured: true,
  },
  {
    name: "Professional",
    price: "$29/month",
    features: [
      "Unlimited Trust Passes",
      "Wallet Anchor Ready",
      "Advanced Verification History",
    ],
  },
  {
    name: "Business",
    price: "$99/month",
    features: [
      "Team Trust Passes",
      "Organization Verification",
      "Audit Trail",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    features: [
      "API Access",
      "Private Trust Infrastructure",
      "Bitcoin Anchor Scheduling",
    ],
  },
];

export default function TrustPricingTeaser() {
  return (
    <section className="trust-pricing" aria-label="ProofOrigin trust plans preview">
      <header className="trust-pricing__header">
        <p className="trust-pricing__eyebrow">ProofOrigin Trust</p>
        <h3 className="trust-pricing__title">Plans for every stage of trust</h3>
        <p className="trust-pricing__subtitle">
          Pricing outline only — no payment integration in this release.
        </p>
      </header>
      <ul className="trust-pricing__grid">
        {PLANS.map((plan) => (
          <li
            key={plan.name}
            className={`trust-pricing__card ${plan.featured ? "trust-pricing__card--featured" : ""}`.trim()}
          >
            <p className="trust-pricing__name">{plan.name}</p>
            <p className="trust-pricing__price">{plan.price}</p>
            <ul className="trust-pricing__features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function QrPlaceholder() {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const row = Math.floor(index / 8);
    const col = index % 8;
    const filled =
      (row < 3 && col < 3) ||
      (row < 3 && col > 4) ||
      (row > 4 && col < 3) ||
      (index % 5 === 0 || index % 7 === 2);
    return filled;
  });

  return (
    <div className="identity-qr trust-qr" aria-hidden="true">
      {cells.map((filled, index) => (
        <span
          key={index}
          className={`identity-qr__cell ${filled ? "identity-qr__cell--on" : ""}`.trim()}
        />
      ))}
    </div>
  );
}

export function bindCanvasTap(canvas, handler) {
  if (!canvas) return () => {};

  function onPointerDown(event) {
    event.preventDefault();
    handler(event);
  }

  canvas.addEventListener("pointerdown", onPointerDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
  };
}

export function bindCanvasPointer(canvas, handler) {
  if (!canvas) return () => {};

  function onPointerDown(event) {
    event.preventDefault();
    handler(event.clientX, event.clientY);
  }

  canvas.addEventListener("pointerdown", onPointerDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
  };
}

export function loadBestScore(key) {
  if (typeof window === "undefined") return 0;
  const saved = localStorage.getItem(key);
  return saved ? Number(saved) : 0;
}

export function saveBestScore(key, score, best) {
  if (score > best) {
    localStorage.setItem(key, String(score));
    return score;
  }
  return best;
}

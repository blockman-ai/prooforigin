"use client";

import { useState } from "react";

const cards = [
  {
    title: "Cyber DOG Portrait",
    type: "AI",
    image: "🤖🐶",
    clue: "Stylized synthetic lighting and fantasy detail.",
  },
  {
    title: "Phone Camera Selfie",
    type: "REAL",
    image: "📸",
    clue: "Natural camera-style capture.",
  },
  {
    title: "AI Influencer Post",
    type: "AI",
    image: "👤✨",
    clue: "Over-polished facial symmetry and synthetic texture.",
  },
  {
    title: "Street Photo",
    type: "REAL",
    image: "🏙️",
    clue: "Ordinary real-world scene.",
  },
  {
    title: "Fake Screenshot",
    type: "AI",
    image: "🧾🤖",
    clue: "Generated-looking text and layout inconsistencies.",
  },
];

export default function DogSwipePage() {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState("Swipe or tap your guess.");

  const card = cards[index % cards.length];

  function guess(choice) {
    const correct = choice === card.type;

    if (correct) {
      const bonus = 100 + streak * 25;
      setScore(score + 1);
      setBoost(boost + bonus);
      setStreak(streak + 1);
      setMessage(`Correct! +${bonus} BOOST`);
    } else {
      setStreak(0);
      setMessage(`Wrong. It was ${card.type}.`);
    }

    setIndex(index + 1);
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">BOOST Arcade • Real or AI</div>

        <h1>DOG BOOST Swipe</h1>

        <p>Guess if the media is real or AI-generated. Build streaks. Earn BOOST.</p>

        <div className="swipe-card">
          <div className="swipe-image">{card.image}</div>

          <h2>{card.title}</h2>

          <p>{card.clue}</p>
        </div>

        <div className="swipe-actions">
          <button onClick={() => guess("AI")} className="secondary">
            ← AI
          </button>

          <button onClick={() => guess("REAL")} className="primary">
            Real →
          </button>
        </div>

        <p className="swipe-message">{message}</p>

        <div className="game-stats compact-stats">
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>

          <div>
            <span>Streak</span>
            <strong>{streak}</strong>
          </div>

          <div>
            <span>BOOST</span>
            <strong>{boost}</strong>
          </div>

          <div>
            <span>Mode</span>
            <strong>SWIPE</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

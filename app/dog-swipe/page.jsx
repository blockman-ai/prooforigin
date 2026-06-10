"use client";

import { useEffect, useState } from "react";
import { loadBestScore, saveBestScore } from "../lib/gameTouch";

const cards = [
  {
    title: "Cyber DOG Portrait",
    category: "SYNTHETIC",
    image: "🤖🐶",
    clue: "Stylized lighting and fantasy detail — often seen in generated art.",
  },
  {
    title: "Phone Camera Selfie",
    category: "CAPTURE",
    image: "📸",
    clue: "Typical camera-style capture with natural imperfections.",
  },
  {
    title: "AI Influencer Post",
    category: "SYNTHETIC",
    image: "👤✨",
    clue: "Over-polished symmetry and synthetic-looking texture.",
  },
  {
    title: "Street Photo",
    category: "CAPTURE",
    image: "🏙️",
    clue: "Ordinary real-world scene with ambient lighting.",
  },
  {
    title: "Fake Screenshot",
    category: "SYNTHETIC",
    image: "🧾🤖",
    clue: "Generated-looking text and layout inconsistencies.",
  },
];

export default function DogSwipePage() {
  const [status, setStatus] = useState("ready");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [message, setMessage] = useState("");

  const card = cards[index % cards.length];
  const roundComplete = index >= cards.length;

  useEffect(() => {
    setBest(loadBestScore("dogswipe_best"));
  }, []);

  function startRound() {
    setIndex(0);
    setScore(0);
    setBoost(0);
    setStreak(0);
    setMessage("");
    setStatus("playing");
  }

  function finishRound(finalScore, finalBoost) {
    setStatus("gameover");
    setBest((prev) => saveBestScore("dogswipe_best", finalScore, prev));
    setMessage(`Round complete — ${finalScore}/${cards.length} correct.`);
  }

  function guess(choice) {
    if (status !== "playing" || roundComplete) return;

    const correct = choice === card.category;
    const nextIndex = index + 1;

    if (correct) {
      const bonus = 100 + streak * 25;
      const nextScore = score + 1;
      const nextBoost = boost + bonus;
      const nextStreak = streak + 1;

      setScore(nextScore);
      setBoost(nextBoost);
      setStreak(nextStreak);
      setMessage(`Good read! +${bonus} BOOST`);

      if (nextIndex >= cards.length) {
        finishRound(nextScore, nextBoost);
      }
    } else {
      setStreak(0);
      setMessage(
        `Not quite — sample labeled ${card.category.toLowerCase()} in this drill.`
      );

      if (nextIndex >= cards.length) {
        finishRound(score, boost);
      }
    }

    setIndex(nextIndex);
  }

  return (
    <main className="page">
      <section className="hero game-hero">
        <div className="badge">BOOST Arcade • Signal Drill</div>

        <h1>DOG BOOST Swipe</h1>

        <p>
          Practice spotting likely synthetic vs camera-capture samples. Arcade
          guesses only — not a Proof-of-Origin evaluation.
        </p>

        {status === "ready" && (
          <div className="swipe-card swipe-card--intro">
            <h2>Signal Drill</h2>
            <p>
              You will see {cards.length} sample cards. Pick whether each looks
              more synthetic or more like a camera capture.
            </p>
            <button className="primary" type="button" onClick={startRound}>
              Start Drill
            </button>
          </div>
        )}

        {status === "playing" && !roundComplete && (
          <>
            <div className="swipe-progress">
              Card {index + 1} of {cards.length}
            </div>

            <div className="swipe-card">
              <div className="swipe-image">{card.image}</div>
              <h2>{card.title}</h2>
              <p>{card.clue}</p>
            </div>

            <div className="swipe-actions">
              <button
                type="button"
                onClick={() => guess("SYNTHETIC")}
                className="secondary swipe-btn"
              >
                ← Likely Synthetic
              </button>

              <button
                type="button"
                onClick={() => guess("CAPTURE")}
                className="primary swipe-btn"
              >
                Likely Capture →
              </button>
            </div>
          </>
        )}

        {status === "gameover" && (
          <div className="swipe-card swipe-card--intro">
            <h2>Drill Complete</h2>
            <p>{message}</p>
            <p>
              Score: {score}/{cards.length}
            </p>
            <p>BOOST collected: {boost}</p>
            <p>Best score: {best}</p>
            <button className="primary" type="button" onClick={startRound}>
              Play Again
            </button>
          </div>
        )}

        {message && status === "playing" && (
          <p className="swipe-message">{message}</p>
        )}

        <div className="game-stats compact-stats">
          <div>
            <span>Score</span>
            <strong>
              {status === "ready" ? 0 : score}/{cards.length}
            </strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{best}</strong>
          </div>
          <div>
            <span>Streak</span>
            <strong>{streak}</strong>
          </div>
          <div>
            <span>BOOST</span>
            <strong>{boost}</strong>
          </div>
        </div>

        <a className="game-back-link" href="/">
          ← Back to ProofOrigin
        </a>
      </section>
    </main>
  );
}

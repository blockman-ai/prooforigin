"use client";

import { useEffect, useRef, useState } from "react";
import { bindCanvasTap, loadBestScore, saveBestScore } from "../lib/gameTouch";

function drawHudPanel(ctx, x, y, width, height, radius) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
}

export default function DogGamePage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [status, setStatus] = useState("ready");

  function startGame() {
    setScore(0);
    setStatus("playing");
  }

  useEffect(() => {
    setBest(loadBestScore("dogboost_best"));
  }, []);

  useEffect(() => {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId;
    let frame = 0;
    let currentScore = 0;

    const dog = {
      x: 70,
      y: 200,
      size: 34,
      velocity: 0,
    };

    let coins = [];
    let bots = [];
    let stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 1,
    }));

    function jump() {
      dog.velocity = -7.8;
    }

    gameRef.current = { jump };

    function endGame() {
      setStatus("gameover");
      setBest((prev) => saveBestScore("dogboost_best", currentScore, prev));
      cancelAnimationFrame(animationId);
    }

    function drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#061923");
      gradient.addColorStop(0.5, "#07111f");
      gradient.addColorStop(1, "#02050a");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      stars.forEach((star) => {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        star.x -= 0.3;
        if (star.x < 0) star.x = canvas.width;
      });

      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(305, 70, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(294, 60, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHud() {
      drawHudPanel(ctx, 14, 12, 190, 42, 14);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 16px Arial";
      ctx.fillText(`DOG BOOST: ${currentScore}`, 26, 39);
    }

    function drawDog() {
      ctx.font = "34px Arial";
      ctx.fillText("🐶", dog.x, dog.y);
    }

    function drawCoin(coin) {
      ctx.font = "26px Arial";
      ctx.fillText("🟡", coin.x, coin.y);
    }

    function drawBot(bot) {
      ctx.font = "34px Arial";
      ctx.fillText("🤖", bot.x, bot.y);
    }

    function collide(a, b, range = 32) {
      return Math.abs(a.x - b.x) < range && Math.abs(a.y - b.y) < range;
    }

    function loop() {
      drawBackground();
      drawHud();

      dog.velocity += 0.38;
      dog.y += dog.velocity;

      if (dog.y > canvas.height - 20 || dog.y < 25) {
        endGame();
        return;
      }

      if (frame % 85 === 0) {
        coins.push({
          x: canvas.width + 20,
          y: 70 + Math.random() * 270,
        });
      }

      if (frame % 135 === 0) {
        bots.push({
          x: canvas.width + 30,
          y: 75 + Math.random() * 270,
        });
      }

      coins = coins
        .map((coin) => ({ ...coin, x: coin.x - 3.2 }))
        .filter((coin) => coin.x > -40);

      bots = bots
        .map((bot) => ({ ...bot, x: bot.x - 4.1 }))
        .filter((bot) => bot.x > -50);

      coins.forEach((coin) => {
        drawCoin(coin);

        if (collide(dog, coin, 34)) {
          currentScore += 10;
          setScore(currentScore);
          coin.x = -999;
        }
      });

      bots.forEach((bot) => {
        drawBot(bot);

        if (collide(dog, bot, 32)) {
          endGame();
          return;
        }
      });

      drawDog();

      frame++;
      animationId = requestAnimationFrame(loop);
    }

    const unbindTap = bindCanvasTap(canvas, jump);

    loop();

    return () => {
      cancelAnimationFrame(animationId);
      unbindTap();
      gameRef.current = null;
    };
  }, [status]);

  function handleTap() {
    if (status === "playing" && gameRef.current) {
      gameRef.current.jump();
    }
  }

  return (
    <main className="page">
      <section className="hero game-hero">
        <div className="badge">BOOST Arcade • Flight</div>

        <h1>DOG BOOST Flight</h1>

        <p>
          Tap to stay aloft, collect coins, and dodge bots. Arcade practice —
          not a media verification outcome.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={360}
            height={430}
            className="dog-canvas dog-canvas--tall"
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>Ready to Fly</h2>
              <p>Tap to rise. Avoid the top, bottom, and bots.</p>
              <button className="primary" type="button" onClick={startGame}>
                Start Flight
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Flight Over</h2>
              <p>Score: {score}</p>
              <p>Best: {best}</p>
              <button className="primary" type="button" onClick={startGame}>
                Fly Again
              </button>
            </div>
          )}
        </div>

        <div className="game-stats compact-stats">
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{best}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{status === "playing" ? "LIVE" : "READY"}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>FLIGHT</strong>
          </div>
        </div>

        {status === "playing" && (
          <button
            className="primary game-touch-btn"
            type="button"
            onClick={handleTap}
          >
            Tap to Boost
          </button>
        )}

        <a className="game-back-link" href="/">
          ← Back to ProofOrigin
        </a>
      </section>
    </main>
  );
}

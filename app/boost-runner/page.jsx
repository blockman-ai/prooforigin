"use client";

import { useEffect, useRef, useState } from "react";

export default function BoostRunnerPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  const [status, setStatus] = useState("ready");
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    const savedBest = localStorage.getItem("boostrunner_best");
    if (savedBest) setBest(Number(savedBest));
  }, []);

  function startGame() {
    setScore(0);
    setBoost(0);
    setStatus("playing");
  }

  function jump() {
    if (gameRef.current) gameRef.current.jump();
  }

  useEffect(() => {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let animationId;
    let currentScore = 0;
    let currentBoost = 0;
    let gameSpeed = 4;

    const dog = {
      x: 52,
      y: 285,
      width: 34,
      height: 34,
      vy: 0,
      grounded: true,
    };

    let bots = [];
    let coins = [];
    let particles = [];

    function endGame() {
      setStatus("gameover");

      if (currentScore > best) {
        localStorage.setItem("boostrunner_best", String(currentScore));
        setBest(currentScore);
      }

      cancelAnimationFrame(animationId);
    }

    function dogJump() {
      if (dog.grounded) {
        dog.vy = -11;
        dog.grounded = false;
      }
    }

    gameRef.current = { jump: dogJump };

    function drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#061923");
      gradient.addColorStop(0.55, "#07111f");
      gradient.addColorStop(1, "#02050a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(305, 70, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,229,255,0.08)";
      for (let i = 0; i < canvas.width; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i - (frame % 28), 0);
        ctx.lineTo(i - (frame % 28), canvas.height);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(0,229,255,0.18)";
      ctx.fillRect(0, 320, canvas.width, 4);
    }

    function drawDog() {
      ctx.font = "34px Arial";
      ctx.fillText("🐶", dog.x, dog.y + dog.height);
    }

    function drawBot(bot) {
      ctx.font = "32px Arial";
      ctx.fillText("🤖", bot.x, bot.y + bot.height);
    }

    function drawCoin(coin) {
      ctx.font = "25px Arial";
      ctx.fillText("🟡", coin.x, coin.y + coin.size);
    }

    function drawHud() {
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(10, 10, 150, 38);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`SCORE ${currentScore}`, 18, 26);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`BOOST ${currentBoost}`, 18, 43);
    }

    function rectsCollide(a, b) {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    function loop() {
      drawBackground();

      dog.vy += 0.55;
      dog.y += dog.vy;

      if (dog.y >= 285) {
        dog.y = 285;
        dog.vy = 0;
        dog.grounded = true;
      }

      if (frame % 95 === 0) {
        bots.push({
          x: canvas.width + 20,
          y: 286,
          width: 32,
          height: 32,
        });
      }

      if (frame % 75 === 0) {
        coins.push({
          x: canvas.width + 30,
          y: 205 + Math.random() * 55,
          width: 25,
          height: 25,
          size: 25,
        });
      }

      bots = bots
        .map((bot) => ({ ...bot, x: bot.x - gameSpeed }))
        .filter((bot) => bot.x > -60);

      coins = coins
        .map((coin) => ({ ...coin, x: coin.x - gameSpeed }))
        .filter((coin) => coin.x > -60);

      bots.forEach((bot) => {
        drawBot(bot);
        if (rectsCollide(dog, bot)) endGame();
      });

      coins.forEach((coin) => {
        drawCoin(coin);
        if (rectsCollide(dog, coin)) {
          currentBoost += 100;
          currentScore += 100;
          setBoost(currentBoost);
          setScore(currentScore);
          coin.x = -999;

          particles.push({
            x: coin.x,
            y: coin.y,
            life: 20,
          });
        }
      });

      particles = particles
        .map((p) => ({ ...p, y: p.y - 1, life: p.life - 1 }))
        .filter((p) => p.life > 0);

      particles.forEach((p) => {
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 15px Arial";
        ctx.fillText("+100", p.x, p.y);
      });

      currentScore += 1;
      if (frame % 10 === 0) setScore(currentScore);

      gameSpeed = Math.min(8.5, 4 + currentScore / 900);

      drawDog();
      drawHud();

      frame++;
      animationId = requestAnimationFrame(loop);
    }

    window.addEventListener("click", dogJump);
    window.addEventListener("touchstart", dogJump);

    loop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("click", dogJump);
      window.removeEventListener("touchstart", dogJump);
    };
  }, [status, best]);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">BOOST Arcade • BOOST Runner</div>

        <h1>BOOST Runner</h1>

        <p>Jump over AI bots. Collect BOOST coins. Chase the Bitcoin moon.</p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="dog-canvas"
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>BOOST Runner</h2>
              <p>Tap to jump. Avoid AI bots. Collect BOOST.</p>
              <button className="primary" onClick={startGame}>
                Start Game
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Game Over</h2>
              <p>Score: {score}</p>
              <p>BOOST Earned: {boost}</p>
              <button className="primary" onClick={startGame}>
                Play Again
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
            <span>BOOST</span>
            <strong>{boost}</strong>
          </div>

          <div>
            <span>Mode</span>
            <strong>RUN</strong>
          </div>
        </div>

        <button className="primary" onClick={jump} style={{ marginTop: 22 }}>
          Tap / Jump
        </button>
      </section>
    </main>
  );
}

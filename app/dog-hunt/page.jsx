"use client";

import { useEffect, useRef, useState } from "react";

const GAME_WIDTH = 360;
const GAME_HEIGHT = 430;
const ROUND_TIME = 45;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export default function DogHuntPage() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const targetsRef = useRef([]);
  const particlesRef = useRef([]);
  const gameRef = useRef({
    score: 0,
    boost: 0,
    combo: 1,
    timeLeft: ROUND_TIME,
    frame: 0,
    running: false,
  });

  const [status, setStatus] = useState("ready");
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [combo, setCombo] = useState(1);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);

  useEffect(() => {
    const savedBest = localStorage.getItem("doghunt_best");
    if (savedBest) setBest(Number(savedBest));
  }, []);

  function spawnTarget() {
    const side = Math.random() > 0.5 ? "left" : "right";
    const speed = randomBetween(1.8, 3.8) + gameRef.current.score / 2500;

    targetsRef.current.push({
      id: crypto.randomUUID(),
      x: side === "left" ? -50 : GAME_WIDTH + 50,
      y: randomBetween(80, 300),
      vx: side === "left" ? speed : -speed,
      vy: randomBetween(-0.5, 0.5),
      size: randomBetween(30, 42),
      type: Math.random() > 0.75 ? "deepfake" : "bot",
      wobble: randomBetween(0, Math.PI * 2),
    });
  }

  function startGame() {
    gameRef.current = {
      score: 0,
      boost: 0,
      combo: 1,
      timeLeft: ROUND_TIME,
      frame: 0,
      running: true,
    };

    targetsRef.current = [];
    particlesRef.current = [];

    setScore(0);
    setBoost(0);
    setCombo(1);
    setTimeLeft(ROUND_TIME);
    setStatus("playing");
  }

  function endGame() {
    gameRef.current.running = false;
    setStatus("gameover");

    if (gameRef.current.score > best) {
      localStorage.setItem("doghunt_best", String(gameRef.current.score));
      setBest(gameRef.current.score);
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }

  function shoot(clientX, clientY) {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    let hit = false;

    targetsRef.current = targetsRef.current.filter((target) => {
      const dx = x - target.x;
      const dy = y - target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < target.size) {
        hit = true;

        const base = target.type === "deepfake" ? 300 : 100;
        const earned = base * gameRef.current.combo;

        gameRef.current.score += earned;
        gameRef.current.boost += earned;
        gameRef.current.combo = Math.min(10, gameRef.current.combo + 1);

        setScore(gameRef.current.score);
        setBoost(gameRef.current.boost);
        setCombo(gameRef.current.combo);

        for (let i = 0; i < 18; i++) {
          particlesRef.current.push({
            x: target.x,
            y: target.y,
            vx: randomBetween(-3, 3),
            vy: randomBetween(-3, 3),
            life: randomBetween(16, 32),
            color: target.type === "deepfake" ? "#ff4d4d" : "#ffcc00",
          });
        }

        return false;
      }

      return true;
    });

    if (!hit) {
      gameRef.current.combo = 1;
      setCombo(1);

      particlesRef.current.push({
        x,
        y,
        vx: 0,
        vy: -1,
        life: 16,
        color: "#ffffff",
        miss: true,
      });
    }
  }

  useEffect(() => {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastSecond = Date.now();

    function drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      gradient.addColorStop(0, "#071f2b");
      gradient.addColorStop(0.48, "#07111f");
      gradient.addColorStop(1, "#02050a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(295, 65, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,229,255,0.07)";
      for (let i = 0; i < GAME_WIDTH; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i - (gameRef.current.frame % 28), 0);
        ctx.lineTo(i - (gameRef.current.frame % 28), GAME_HEIGHT);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(0,229,255,0.08)";
      ctx.fillRect(0, 330, GAME_WIDTH, 2);

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 360, GAME_WIDTH, 70);
    }

    function drawHud() {
      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.roundRect(10, 10, 170, 52, 14);
      ctx.fill();

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`SCORE ${gameRef.current.score}`, 20, 30);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`BOOST ${gameRef.current.boost}`, 20, 48);

      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.roundRect(230, 10, 116, 52, 14);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`TIME ${gameRef.current.timeLeft}s`, 244, 30);

      ctx.fillStyle = "#ff4d4d";
      ctx.fillText(`COMBO x${gameRef.current.combo}`, 244, 48);
    }

    function drawTarget(target) {
      target.wobble += 0.08;
      const y = target.y + Math.sin(target.wobble) * 5;

      ctx.save();
      ctx.translate(target.x, y);

      ctx.shadowBlur = 18;
      ctx.shadowColor = target.type === "deepfake" ? "#ff4d4d" : "#00e5ff";

      ctx.fillStyle =
        target.type === "deepfake"
          ? "rgba(255,77,77,0.22)"
          : "rgba(0,229,255,0.22)";

      ctx.beginPath();
      ctx.arc(0, 0, target.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${target.size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(target.type === "deepfake" ? "👾" : "🤖", 0, 2);

      ctx.restore();
    }

    function drawParticles() {
      particlesRef.current.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 32);

        if (p.miss) {
          ctx.font = "bold 16px Arial";
          ctx.fillText("MISS", p.x - 20, p.y);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = 1;
      });
    }

    function update() {
      const now = Date.now();

      if (now - lastSecond >= 1000) {
        lastSecond = now;
        gameRef.current.timeLeft -= 1;
        setTimeLeft(gameRef.current.timeLeft);

        if (gameRef.current.timeLeft <= 0) {
          endGame();
          return;
        }
      }

      gameRef.current.frame += 1;

      if (gameRef.current.frame % 42 === 0) {
        spawnTarget();
      }

      targetsRef.current = targetsRef.current
        .map((target) => ({
          ...target,
          x: target.x + target.vx,
          y: target.y + target.vy,
        }))
        .filter((target) => target.x > -80 && target.x < GAME_WIDTH + 80);

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          life: p.life - 1,
        }))
        .filter((p) => p.life > 0);
    }

    function loop() {
      drawBackground();
      update();
      targetsRef.current.forEach(drawTarget);
      drawParticles();
      drawHud();

      animationRef.current = requestAnimationFrame(loop);
    }

    loop();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status, best]);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">BOOST Arcade • DOG Hunt</div>

        <h1>DOG Hunt</h1>

        <p>
          Tap AI bots out of the sky. Chain combos. Earn BOOST. Protect the
          internet.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="dog-canvas dog-hunt-canvas"
            onClick={(e) => shoot(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (touch) shoot(touch.clientX, touch.clientY);
            }}
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>DOG Hunt</h2>
              <p>Tap the AI bots. Deepfake enemies are worth more.</p>
              <button className="primary" onClick={startGame}>
                Start Hunt
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Round Complete</h2>
              <p>Score: {score}</p>
              <p>BOOST Earned: {boost}</p>
              <p>Best: {best}</p>
              <button className="primary" onClick={startGame}>
                Hunt Again
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
            <span>Time</span>
            <strong>{timeLeft}s</strong>
          </div>
        </div>
      </section>
    </main>
  );
            }

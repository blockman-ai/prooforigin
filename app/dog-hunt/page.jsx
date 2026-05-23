"use client";

import { useEffect, useRef, useState } from "react";

const GAME_WIDTH = 360;
const GAME_HEIGHT = 430;
const ROUND_TIME = 60;
const START_LIVES = 5;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function DogHuntPage() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const targetsRef = useRef([]);
  const particlesRef = useRef([]);
  const popupsRef = useRef([]);

  const gameRef = useRef({
    score: 0,
    boost: 0,
    combo: 1,
    timeLeft: ROUND_TIME,
    lives: START_LIVES,
    frame: 0,
    wave: 1,
    running: false,
    lastSpawnFrame: 0,
  });

  const [status, setStatus] = useState("ready");
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [combo, setCombo] = useState(1);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [lives, setLives] = useState(START_LIVES);
  const [wave, setWave] = useState(1);

  useEffect(() => {
    const savedBest = localStorage.getItem("doghunt_best");
    if (savedBest) setBest(Number(savedBest));
  }, []);

  function syncState() {
    setScore(gameRef.current.score);
    setBoost(gameRef.current.boost);
    setCombo(gameRef.current.combo);
    setTimeLeft(gameRef.current.timeLeft);
    setLives(gameRef.current.lives);
    setWave(gameRef.current.wave);
  }

  function addPopup(text, x, y, color = "#ffcc00") {
    popupsRef.current.push({
      text,
      x,
      y,
      color,
      life: 42,
    });
  }

  function addExplosion(x, y, color = "#ffcc00", amount = 18) {
    for (let i = 0; i < amount; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: randomBetween(-3.8, 3.8),
        vy: randomBetween(-3.8, 3.8),
        life: randomBetween(18, 34),
        color,
      });
    }
  }

  function spawnTarget(forceType = null) {
    const side = Math.random() > 0.5 ? "left" : "right";
    const difficulty = clamp(gameRef.current.wave, 1, 12);

    const typeRoll = Math.random();
    let type = forceType || "bot";

    if (!forceType) {
      if (typeRoll > 0.9) type = "boost";
      else if (typeRoll > 0.72) type = "deepfake";
      else type = "bot";
    }

    const baseSpeed =
      type === "boost"
        ? randomBetween(2.4, 3.8)
        : type === "deepfake"
        ? randomBetween(2.0, 3.5)
        : randomBetween(1.5, 3.0);

    const speed = baseSpeed + difficulty * 0.12;

    targetsRef.current.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now() + Math.random()),
      x: side === "left" ? -60 : GAME_WIDTH + 60,
      y: randomBetween(86, 305),
      vx: side === "left" ? speed : -speed,
      vy: randomBetween(-0.45, 0.45),
      size: type === "boost" ? 34 : type === "deepfake" ? 40 : 34,
      type,
      wobble: randomBetween(0, Math.PI * 2),
      missed: false,
    });
  }

  function startGame() {
    gameRef.current = {
      score: 0,
      boost: 0,
      combo: 1,
      timeLeft: ROUND_TIME,
      lives: START_LIVES,
      frame: 0,
      wave: 1,
      running: true,
      lastSpawnFrame: 0,
    };

    targetsRef.current = [];
    particlesRef.current = [];
    popupsRef.current = [];

    setStatus("playing");
    syncState();
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

  function registerMiss(x, y) {
    gameRef.current.combo = 1;
    gameRef.current.lives -= 1;

    addPopup("MISS", x, y, "#ffffff");
    addExplosion(x, y, "#ffffff", 6);

    syncState();

    if (gameRef.current.lives <= 0) {
      endGame();
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

    let hitTarget = null;

    for (const target of targetsRef.current) {
      const renderedY = target.y + Math.sin(target.wobble) * 5;
      const dx = x - target.x;
      const dy = y - renderedY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < target.size + 28) {
        hitTarget = target;
        break;
      }
    }

    if (!hitTarget) {
      registerMiss(x, y);
      return;
    }

    targetsRef.current = targetsRef.current.filter(
      (target) => target.id !== hitTarget.id
    );

    let base = 100;
    let color = "#00e5ff";
    let label = "+100";

    if (hitTarget.type === "deepfake") {
      base = 250;
      color = "#ff4d4d";
      label = "DEEPFAKE +250";
    }

    if (hitTarget.type === "boost") {
      base = 400;
      color = "#ffcc00";
      label = "BOOST BIRD +400";
    }

    const earned = base * gameRef.current.combo;

    gameRef.current.score += earned;
    gameRef.current.boost += earned;
    gameRef.current.combo = Math.min(12, gameRef.current.combo + 1);

    if (gameRef.current.combo % 5 === 0) {
      gameRef.current.boost += 500;
      addPopup("COMBO BONUS +500", hitTarget.x - 70, hitTarget.y - 30, "#00e676");
    }

    addExplosion(hitTarget.x, hitTarget.y, color, hitTarget.type === "boost" ? 30 : 20);
    addPopup(`${label} x${gameRef.current.combo}`, hitTarget.x - 50, hitTarget.y, color);

    syncState();
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
      gradient.addColorStop(0.5, "#07111f");
      gradient.addColorStop(1, "#02050a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(295, 65, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,229,255,0.065)";
      for (let i = 0; i < GAME_WIDTH; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i - (gameRef.current.frame % 28), 0);
        ctx.lineTo(i - (gameRef.current.frame % 28), GAME_HEIGHT);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(0,229,255,0.08)";
      ctx.fillRect(0, 330, GAME_WIDTH, 2);

      ctx.fillStyle = "rgba(255,255,255,0.055)";
      ctx.fillRect(0, 360, GAME_WIDTH, 70);
    }

    function drawHud() {
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.roundRect(8, 8, 168, 52, 14);
      ctx.fill();

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 11px Arial";
      ctx.fillText(`S ${gameRef.current.score}`, 18, 28);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`B ${gameRef.current.boost}`, 18, 46);

      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.roundRect(218, 8, 134, 52, 14);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Arial";
      ctx.fillText(`T ${gameRef.current.timeLeft}s`, 230, 28);

      ctx.fillStyle = "#ff4d4d";
      ctx.fillText(`x${gameRef.current.combo}`, 230, 46);

      ctx.fillStyle = "#00e676";
      ctx.fillText(`❤ ${gameRef.current.lives}`, 292, 46);
    }

    function drawTarget(target) {
      target.wobble += 0.08;
      const y = target.y + Math.sin(target.wobble) * 5;

      ctx.save();
      ctx.translate(target.x, y);

      const color =
        target.type === "boost"
          ? "#ffcc00"
          : target.type === "deepfake"
          ? "#ff4d4d"
          : "#00e5ff";

      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.fillStyle =
        target.type === "boost"
          ? "rgba(255,204,0,0.25)"
          : target.type === "deepfake"
          ? "rgba(255,77,77,0.22)"
          : "rgba(0,229,255,0.22)";

      ctx.beginPath();
      ctx.arc(0, 0, target.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${target.size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let emoji = "🤖";
      if (target.type === "deepfake") emoji = "👾";
      if (target.type === "boost") emoji = "🐦";

      ctx.fillText(emoji, 0, 2);
      ctx.restore();
    }

    function drawParticles() {
      particlesRef.current.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 34);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    function drawPopups() {
      popupsRef.current.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 42);
        ctx.fillStyle = p.color;
        ctx.font = "bold 14px Arial";
        ctx.fillText(p.text, p.x, p.y);
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
      gameRef.current.wave = Math.floor(gameRef.current.score / 1500) + 1;
      setWave(gameRef.current.wave);

      const spawnRate = clamp(58 - gameRef.current.wave * 3, 26, 58);

      if (gameRef.current.frame % spawnRate === 0) {
        spawnTarget();

        if (gameRef.current.wave >= 4 && Math.random() > 0.7) {
          setTimeout(() => spawnTarget(), 220);
        }
      }

      targetsRef.current = targetsRef.current
        .map((target) => ({
          ...target,
          x: target.x + target.vx,
          y: target.y + target.vy,
        }))
        .filter((target) => {
          const offscreen = target.x < -90 || target.x > GAME_WIDTH + 90;

          if (offscreen && !target.missed) {
            if (target.type !== "boost") {
              gameRef.current.combo = 1;
              gameRef.current.lives -= 1;
              addPopup("-1 LIFE", GAME_WIDTH / 2 - 28, 95, "#ff4d4d");
              syncState();

              if (gameRef.current.lives <= 0) {
                endGame();
              }
            }

            target.missed = true;
          }

          return !offscreen;
        });

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          life: p.life - 1,
        }))
        .filter((p) => p.life > 0);

      popupsRef.current = popupsRef.current
        .map((p) => ({
          ...p,
          y: p.y - 0.6,
          life: p.life - 1,
        }))
        .filter((p) => p.life > 0);
    }

    function loop() {
      drawBackground();
      update();
      targetsRef.current.forEach(drawTarget);
      drawParticles();
      drawPopups();
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
          Tap AI bots out of the sky. Hit deepfakes. Catch BOOST birds. Protect
          the internet.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="dog-canvas dog-hunt-canvas"
            onClick={(e) => shoot(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              e.preventDefault();
              const touch = e.changedTouches[0];
              if (touch) shoot(touch.clientX, touch.clientY);
            }}
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>DOG Hunt</h2>
              <p>Tap AI bots. Deepfakes and BOOST birds are worth more.</p>
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
            <span>Lives</span>
            <strong>{lives}</strong>
          </div>
        </div>

        <div className="game-stats compact-stats" style={{ marginTop: 10 }}>
          <div>
            <span>Combo</span>
            <strong>x{combo}</strong>
          </div>

          <div>
            <span>Wave</span>
            <strong>{wave}</strong>
          </div>

          <div>
            <span>Time</span>
            <strong>{timeLeft}s</strong>
          </div>

          <div>
            <span>Mode</span>
            <strong>HUNT</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

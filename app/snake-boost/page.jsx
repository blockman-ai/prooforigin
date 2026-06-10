"use client";

import { useEffect, useRef, useState } from "react";
import { loadBestScore, saveBestScore } from "../lib/gameTouch";

const GRID_SIZE = 20;
const TILE_COUNT = 18;
const START_SNAKE = [{ x: 8, y: 8 }];

function getSpeed(score) {
  return Math.max(70, 170 - Math.floor(score / 100) * 6);
}

export default function SnakeBoostPage() {
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  const snakeRef = useRef([...START_SNAKE]);
  const directionRef = useRef({ x: 1, y: 0 });
  const nextDirectionRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 12, y: 10 });
  const scoreRef = useRef(0);
  const boostRef = useRef(0);

  const joystickRef = useRef(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [boostEarned, setBoostEarned] = useState(0);
  const [status, setStatus] = useState("ready");
  const [tickSpeed, setTickSpeed] = useState(getSpeed(0));

  useEffect(() => {
    setBest(loadBestScore("snakeboost_best"));
  }, []);

  function resetGame() {
    snakeRef.current = [...START_SNAKE];
    directionRef.current = { x: 1, y: 0 };
    nextDirectionRef.current = { x: 1, y: 0 };
    foodRef.current = { x: 12, y: 10 };
    scoreRef.current = 0;
    boostRef.current = 0;
    setScore(0);
    setBoostEarned(0);
    setTickSpeed(getSpeed(0));
    setStatus("playing");
  }

  function endGame() {
    const finalScore = scoreRef.current;
    setStatus("gameover");
    setBest((prev) => saveBestScore("snakeboost_best", finalScore, prev));

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function changeDirection(dir) {
    if (status !== "playing") return;

    const current = directionRef.current;

    if (dir === "up" && current.y !== 1) {
      nextDirectionRef.current = { x: 0, y: -1 };
    }

    if (dir === "down" && current.y !== -1) {
      nextDirectionRef.current = { x: 0, y: 1 };
    }

    if (dir === "left" && current.x !== 1) {
      nextDirectionRef.current = { x: -1, y: 0 };
    }

    if (dir === "right" && current.x !== -1) {
      nextDirectionRef.current = { x: 1, y: 0 };
    }
  }

  function handleJoystickMove(clientX, clientY) {
    const joystick = joystickRef.current;
    if (!joystick) return;

    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 14) changeDirection("right");
      if (dx < -14) changeDirection("left");
    } else {
      if (dy > 14) changeDirection("down");
      if (dy < -14) changeDirection("up");
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    handleJoystickMove(touch.clientX, touch.clientY);
  }

  function handleMouseMove(e) {
    if (e.buttons !== 1) return;
    handleJoystickMove(e.clientX, e.clientY);
  }

  useEffect(() => {
    function handleKey(e) {
      if (status !== "playing") return;
      if (e.key === "ArrowUp") changeDirection("up");
      if (e.key === "ArrowDown") changeDirection("down");
      if (e.key === "ArrowLeft") changeDirection("left");
      if (e.key === "ArrowRight") changeDirection("right");
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [status]);

  useEffect(() => {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function randomFood() {
      let newFood;

      do {
        newFood = {
          x: Math.floor(Math.random() * TILE_COUNT),
          y: Math.floor(Math.random() * TILE_COUNT),
        };
      } while (
        snakeRef.current.some(
          (segment) => segment.x === newFood.x && segment.y === newFood.y
        )
      );

      foodRef.current = newFood;
    }

    function drawBackground() {
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let x = 0; x < TILE_COUNT; x++) {
        for (let y = 0; y < TILE_COUNT; y++) {
          ctx.strokeStyle = "rgba(0,229,255,0.055)";
          ctx.strokeRect(
            x * GRID_SIZE,
            y * GRID_SIZE,
            GRID_SIZE,
            GRID_SIZE
          );
        }
      }

      const glow = ctx.createRadialGradient(180, 180, 20, 180, 180, 230);
      glow.addColorStop(0, "rgba(255,204,0,0.12)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawFood() {
      const food = foodRef.current;

      ctx.shadowBlur = 18;
      ctx.shadowColor = "#ffcc00";
      ctx.fillStyle = "#ffcc00";

      ctx.beginPath();
      ctx.arc(
        food.x * GRID_SIZE + GRID_SIZE / 2,
        food.y * GRID_SIZE + GRID_SIZE / 2,
        7,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#031018";
      ctx.font = "bold 10px Arial";
      ctx.fillText("B", food.x * GRID_SIZE + 7, food.y * GRID_SIZE + 14);
    }

    function drawSnake() {
      snakeRef.current.forEach((segment, index) => {
        const px = segment.x * GRID_SIZE;
        const py = segment.y * GRID_SIZE;

        ctx.shadowBlur = index === 0 ? 18 : 10;
        ctx.shadowColor = index === 0 ? "#ffcc00" : "#00e5ff";

        ctx.fillStyle = index === 0 ? "#ffcc00" : "#00e5ff";
        ctx.fillRect(px + 2, py + 2, GRID_SIZE - 4, GRID_SIZE - 4);

        if (index === 0) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#031018";
          ctx.font = "12px Arial";
          ctx.fillText("🐶", px + 1, py + 15);
        }
      });

      ctx.shadowBlur = 0;
    }

    function drawHud() {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(8, 8, 104, 28);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 10px Arial";
      ctx.fillText(`S ${scoreRef.current}`, 15, 20);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`B ${boostRef.current}`, 62, 20);
    }

    function step() {
      directionRef.current = nextDirectionRef.current;

      const snake = snakeRef.current;
      const head = snake[0];

      const newHead = {
        x: head.x + directionRef.current.x,
        y: head.y + directionRef.current.y,
      };

      if (
        newHead.x < 0 ||
        newHead.y < 0 ||
        newHead.x >= TILE_COUNT ||
        newHead.y >= TILE_COUNT
      ) {
        endGame();
        return;
      }

      if (
        snake.some(
          (segment) => segment.x === newHead.x && segment.y === newHead.y
        )
      ) {
        endGame();
        return;
      }

      snake.unshift(newHead);

      if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
        scoreRef.current += 100;
        boostRef.current += 100;
        setScore(scoreRef.current);
        setBoostEarned(boostRef.current);
        setTickSpeed(getSpeed(scoreRef.current));
        randomFood();
      } else {
        snake.pop();
      }

      drawBackground();
      drawFood();
      drawSnake();
      drawHud();
    }

    drawBackground();
    drawFood();
    drawSnake();
    drawHud();

    intervalRef.current = setInterval(step, tickSpeed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, tickSpeed]);

  return (
    <main className="page">
      <section className="hero game-hero">
        <div className="badge">BOOST Arcade • Snake</div>

        <h1>Snake BOOST</h1>

        <p>
          Classic snake with BOOST orbs. Use the D-pad or drag the joystick.
          Arcade mode only — not a verification outcome.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="dog-canvas dog-canvas--square"
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>Snake BOOST</h2>
              <p>Collect BOOST orbs. Avoid walls and your own tail.</p>
              <button className="primary" type="button" onClick={resetGame}>
                Start Game
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Run Complete</h2>
              <p>Score: {score}</p>
              <p>BOOST collected: {boostEarned}</p>
              <p>Best: {best}</p>
              <button className="primary" type="button" onClick={resetGame}>
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
            <strong>{boostEarned}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{status === "playing" ? "LIVE" : "READY"}</strong>
          </div>
        </div>

        {status === "playing" && (
          <>
            <div className="snake-dpad" aria-label="Direction controls">
              <button type="button" className="dpad-empty" aria-hidden="true" />
              <button
                type="button"
                onClick={() => changeDirection("up")}
                aria-label="Move up"
              >
                ↑
              </button>
              <button type="button" className="dpad-empty" aria-hidden="true" />
              <button
                type="button"
                onClick={() => changeDirection("left")}
                aria-label="Move left"
              >
                ←
              </button>
              <button type="button" className="dpad-empty" aria-hidden="true" />
              <button
                type="button"
                onClick={() => changeDirection("right")}
                aria-label="Move right"
              >
                →
              </button>
              <button type="button" className="dpad-empty" aria-hidden="true" />
              <button
                type="button"
                onClick={() => changeDirection("down")}
                aria-label="Move down"
              >
                ↓
              </button>
              <button type="button" className="dpad-empty" aria-hidden="true" />
            </div>

            <div
              ref={joystickRef}
              className="snake-joystick"
              onTouchMove={handleTouchMove}
              onMouseMove={handleMouseMove}
            >
              <div className="joystick-ring">
                <span>Drag to steer</span>
              </div>
            </div>
          </>
        )}

        <a className="game-back-link" href="/">
          ← Back to ProofOrigin
        </a>
      </section>
    </main>
  );
}

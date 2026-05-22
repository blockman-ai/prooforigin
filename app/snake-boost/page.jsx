"use client";

import { useEffect, useRef, useState } from "react";

const GRID_SIZE = 20;
const TILE_COUNT = 18;
const START_SNAKE = [{ x: 8, y: 8 }];

export default function SnakeBoostPage() {
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const snakeRef = useRef([...START_SNAKE]);
  const directionRef = useRef({ x: 1, y: 0 });
  const nextDirectionRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 12, y: 10 });

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [boostEarned, setBoostEarned] = useState(0);
  const [status, setStatus] = useState("ready");

  useEffect(() => {
    const savedBest = localStorage.getItem("snakeboost_best");
    if (savedBest) setBest(Number(savedBest));
  }, []);

  function resetGame() {
    snakeRef.current = [...START_SNAKE];
    directionRef.current = { x: 1, y: 0 };
    nextDirectionRef.current = { x: 1, y: 0 };
    foodRef.current = { x: 12, y: 10 };
    setScore(0);
    setBoostEarned(0);
    setStatus("playing");
  }

  function endGame(finalScore) {
    setStatus("gameover");

    if (finalScore > best) {
      localStorage.setItem("snakeboost_best", String(finalScore));
      setBest(finalScore);
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }

  function changeDirection(dir) {
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

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowUp") changeDirection("up");
      if (e.key === "ArrowDown") changeDirection("down");
      if (e.key === "ArrowLeft") changeDirection("left");
      if (e.key === "ArrowRight") changeDirection("right");
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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
      ctx.fillText(
        "B",
        food.x * GRID_SIZE + 7,
        food.y * GRID_SIZE + 14
      );
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

    function drawHud(currentScore, currentBoost) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(8, 8, 190, 42);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 14px Arial";
      ctx.fillText(`Score: ${currentScore}`, 18, 26);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`BOOST: ${currentBoost}`, 18, 44);
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
        endGame(score);
        return;
      }

      if (
        snake.some(
          (segment) => segment.x === newHead.x && segment.y === newHead.y
        )
      ) {
        endGame(score);
        return;
      }

      snake.unshift(newHead);

      let nextScore = score;
      let nextBoost = boostEarned;

      if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
        nextScore += 100;
        nextBoost += 100;
        setScore(nextScore);
        setBoostEarned(nextBoost);
        randomFood();
      } else {
        snake.pop();
      }

      drawBackground();
      drawFood();
      drawSnake();
      drawHud(nextScore, nextBoost);
    }

    drawBackground();
    drawFood();
    drawSnake();
    drawHud(score, boostEarned);

    intervalRef.current = setInterval(step, 115);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, score, boostEarned, best]);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">BOOST Arcade • Snake BOOST</div>

        <h1>Snake BOOST</h1>

        <p>
          Classic snake, DOG BOOST style. Collect BOOST orbs, grow longer, and
          survive the grid.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="dog-canvas"
          />

          {status === "ready" && (
            <div className="game-overlay">
              <h2>Snake BOOST</h2>
              <p>Collect BOOST orbs. Avoid the walls and yourself.</p>
              <button className="primary" onClick={resetGame}>
                Start Game
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Game Over</h2>
              <p>Score: {score}</p>
              <p>BOOST Earned: {boostEarned}</p>
              <button className="primary" onClick={resetGame}>
                Play Again
              </button>
            </div>
          )}
        </div>

        <div className="game-stats">
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>

          <div>
            <span>Best</span>
            <strong>{best}</strong>
          </div>

          <div>
            <span>BOOST Earned</span>
            <strong>{boostEarned}</strong>
          </div>

          <div>
            <span>Reward Rate</span>
            <strong>100</strong>
          </div>
        </div>

        <div className="snake-controls">
          <button onClick={() => changeDirection("up")}>↑</button>

          <div>
            <button onClick={() => changeDirection("left")}>←</button>
            <button onClick={() => changeDirection("down")}>↓</button>
            <button onClick={() => changeDirection("right")}>→</button>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

const GRID_SIZE = 20;
const TILE_COUNT = 18;

export default function SnakeBoostPage() {
  const canvasRef = useRef(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const snakeRef = useRef([
    { x: 8, y: 8 },
  ]);

  const directionRef = useRef({ x: 1, y: 0 });

  const foodRef = useRef({
    x: 12,
    y: 10,
  });

  useEffect(() => {
    const savedBest = localStorage.getItem("snakeboost_best");

    if (savedBest) {
      setBest(Number(savedBest));
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animation;

    function drawGrid() {
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let x = 0; x < TILE_COUNT; x++) {
        for (let y = 0; y < TILE_COUNT; y++) {
          ctx.strokeStyle = "rgba(0,229,255,0.06)";
          ctx.strokeRect(
            x * GRID_SIZE,
            y * GRID_SIZE,
            GRID_SIZE,
            GRID_SIZE
          );
        }
      }
    }

    function drawSnake() {
      snakeRef.current.forEach((segment, index) => {
        ctx.fillStyle =
          index === 0
            ? "#ffcc00"
            : "rgba(0,229,255,0.9)";

        ctx.shadowBlur = 12;
        ctx.shadowColor = "#00e5ff";

        ctx.fillRect(
          segment.x * GRID_SIZE + 2,
          segment.y * GRID_SIZE + 2,
          GRID_SIZE - 4,
          GRID_SIZE - 4
        );
      });
    }

    function drawFood() {
      ctx.fillStyle = "#00e676";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#00e676";

      ctx.beginPath();
      ctx.arc(
        foodRef.current.x * GRID_SIZE + GRID_SIZE / 2,
        foodRef.current.y * GRID_SIZE + GRID_SIZE / 2,
        7,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    function moveSnake() {
      const head = snakeRef.current[0];

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

      for (let segment of snakeRef.current) {
        if (
          segment.x === newHead.x &&
          segment.y === newHead.y
        ) {
          endGame();
          return;
        }
      }

      snakeRef.current.unshift(newHead);

      if (
        newHead.x === foodRef.current.x &&
        newHead.y === foodRef.current.y
      ) {
        const nextScore = score + 100;

        setScore(nextScore);

        foodRef.current = {
          x: Math.floor(Math.random() * TILE_COUNT),
          y: Math.floor(Math.random() * TILE_COUNT),
        };
      } else {
        snakeRef.current.pop();
      }
    }

    function endGame() {
      setGameOver(true);

      if (score > best) {
        localStorage.setItem(
          "snakeboost_best",
          String(score)
        );

        setBest(score);
      }

      cancelAnimationFrame(animation);
    }

    function gameLoop() {
      drawGrid();
      drawFood();
      moveSnake();
      drawSnake();

      animation = setTimeout(() => {
        requestAnimationFrame(gameLoop);
      }, 120);
    }

    gameLoop();

    function handleKey(e) {
      if (e.key === "ArrowUp" && directionRef.current.y !== 1) {
        directionRef.current = { x: 0, y: -1 };
      }

      if (e.key === "ArrowDown" && directionRef.current.y !== -1) {
        directionRef.current = { x: 0, y: 1 };
      }

      if (e.key === "ArrowLeft" && directionRef.current.x !== 1) {
        directionRef.current = { x: -1, y: 0 };
      }

      if (e.key === "ArrowRight" && directionRef.current.x !== -1) {
        directionRef.current = { x: 1, y: 0 };
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      clearTimeout(animation);
      window.removeEventListener("keydown", handleKey);
    };
  }, [score, best]);

  function restartGame() {
    snakeRef.current = [{ x: 8, y: 8 }];

    directionRef.current = { x: 1, y: 0 };

    foodRef.current = {
      x: 12,
      y: 10,
    };

    setScore(0);
    setGameOver(false);
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">BOOST Arcade</div>

        <h1>Snake BOOST</h1>

        <p>
          Collect BOOST orbs. Grow your snake.
          Earn BOOST energy.
        </p>

        <div className="game-shell">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="dog-canvas"
          />

          {gameOver && (
            <div className="game-overlay">
              <h2>Game Over</h2>

              <p>Score: {score}</p>

              <button
                className="primary"
                onClick={restartGame}
              >
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
        </div>
      </section>
    </main>
  );
}

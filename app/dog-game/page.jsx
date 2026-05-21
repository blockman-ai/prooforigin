"use client";

import { useEffect, useRef, useState } from "react";

export default function DogGamePage() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let dog = { x: 60, y: 180, size: 34, velocity: 0 };
    let coins = [];
    let frame = 0;
    let gameOver = false;
    let currentScore = 0;

    function jump() {
      if (!started) setStarted(true);
      dog.velocity = -7;
    }

    window.addEventListener("click", jump);
    window.addEventListener("touchstart", jump);

    function drawDog() {
      ctx.font = "34px Arial";
      ctx.fillText("🐶", dog.x, dog.y);
    }

    function drawCoin(coin) {
      ctx.font = "26px Arial";
      ctx.fillText("🟡", coin.x, coin.y);
    }

    function drawObstacle(obstacle) {
      ctx.font = "34px Arial";
      ctx.fillText("🤖", obstacle.x, obstacle.y);
    }

    let obstacles = [];

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#061923");
      gradient.addColorStop(1, "#02050a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00f5ff";
      ctx.font = "18px Arial";
      ctx.fillText(`DOG BOOST SCORE: ${currentScore}`, 18, 28);

      if (!started) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "22px Arial";
        ctx.fillText("Tap to fly 🐶", 115, 170);
        requestAnimationFrame(loop);
        return;
      }

      dog.velocity += 0.35;
      dog.y += dog.velocity;

      if (dog.y > canvas.height - 20 || dog.y < 30) {
        gameOver = true;
      }

      if (frame % 90 === 0) {
        coins.push({
          x: canvas.width,
          y: 60 + Math.random() * 230,
        });
      }

      if (frame % 140 === 0) {
        obstacles.push({
          x: canvas.width,
          y: 70 + Math.random() * 240,
        });
      }

      coins = coins.map((coin) => ({ ...coin, x: coin.x - 3 }));
      obstacles = obstacles.map((obs) => ({ ...obs, x: obs.x - 4 }));

      coins.forEach((coin) => {
        drawCoin(coin);

        if (
          Math.abs(dog.x - coin.x) < 30 &&
          Math.abs(dog.y - coin.y) < 30
        ) {
          currentScore += 10;
          setScore(currentScore);
          coin.x = -999;
        }
      });

      obstacles.forEach((obs) => {
        drawObstacle(obs);

        if (
          Math.abs(dog.x - obs.x) < 30 &&
          Math.abs(dog.y - obs.y) < 30
        ) {
          gameOver = true;
        }
      });

      drawDog();

      if (gameOver) {
        ctx.fillStyle = "#ff4d5a";
        ctx.font = "30px Arial";
        ctx.fillText("GAME OVER", 95, 160);

        ctx.fillStyle = "#ffffff";
        ctx.font = "18px Arial";
        ctx.fillText("Refresh to play again", 100, 195);
        return;
      }

      frame++;
      requestAnimationFrame(loop);
    }

    loop();

    return () => {
      window.removeEventListener("click", jump);
      window.removeEventListener("touchstart", jump);
    };
  }, [started]);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">DOG BOOST Mini Game</div>

        <h1>Flappy DOG</h1>

        <p>Tap to fly. Collect DOG coins. Dodge AI bots.</p>

        <canvas
          ref={canvasRef}
          width={360}
          height={420}
          style={{
            width: "100%",
            maxWidth: "420px",
            borderRadius: "24px",
            border: "1px solid rgba(0, 245, 255, 0.35)",
            boxShadow: "0 0 35px rgba(0, 245, 255, 0.2)",
            background: "#02050a",
          }}
        />

        <h2>Score: {score}</h2>
      </section>
    </main>
  );
}

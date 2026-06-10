"use client";

import { useEffect, useRef, useState } from "react";
import { bindCanvasTap, loadBestScore, saveBestScore } from "../lib/gameTouch";

export default function DogStackPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  const [status, setStatus] = useState("ready");
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    setBest(loadBestScore("dogstack_best"));
  }, []);

  function startGame() {
    setScore(0);
    setBoost(0);
    setStatus("playing");
  }

  function dropBlock() {
    if (status === "playing" && gameRef.current) {
      gameRef.current.drop();
    }
  }

  useEffect(() => {
    if (status !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId;
    let currentScore = 0;
    let currentBoost = 0;

    let blocks = [
      {
        x: 90,
        y: 315,
        width: 180,
        height: 22,
      },
    ];

    let activeBlock = {
      x: 0,
      y: 280,
      width: 180,
      height: 22,
      speed: 3,
      direction: 1,
    };

    function endGame() {
      setStatus("gameover");
      setBest((prev) => saveBestScore("dogstack_best", currentScore, prev));
      cancelAnimationFrame(animationId);
    }

    function createNextBlock(width) {
      activeBlock = {
        x: 0,
        y: 280 - blocks.length * 24,
        width,
        height: 22,
        speed: Math.min(7, 3 + blocks.length * 0.25),
        direction: 1,
      };

      if (activeBlock.y < 90) {
        blocks = blocks.map((block) => ({
          ...block,
          y: block.y + 24,
        }));

        activeBlock.y += 24;
      }
    }

    function drop() {
      const lastBlock = blocks[blocks.length - 1];

      const overlapStart = Math.max(activeBlock.x, lastBlock.x);
      const overlapEnd = Math.min(
        activeBlock.x + activeBlock.width,
        lastBlock.x + lastBlock.width
      );

      const overlap = overlapEnd - overlapStart;

      if (overlap <= 0) {
        endGame();
        return;
      }

      const perfect = Math.abs(activeBlock.x - lastBlock.x) < 8;

      const newBlock = {
        x: perfect ? lastBlock.x : overlapStart,
        y: activeBlock.y,
        width: perfect ? lastBlock.width : overlap,
        height: activeBlock.height,
      };

      blocks.push(newBlock);

      currentScore += perfect ? 200 : 100;
      currentBoost += perfect ? 200 : 100;

      setScore(currentScore);
      setBoost(currentBoost);

      createNextBlock(newBlock.width);
    }

    gameRef.current = { drop };

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
      for (let y = 0; y < canvas.height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    function drawBlock(block, isActive = false) {
      const gradient = ctx.createLinearGradient(
        block.x,
        block.y,
        block.x + block.width,
        block.y
      );

      gradient.addColorStop(0, "#00e5ff");
      gradient.addColorStop(1, "#ffcc00");

      ctx.shadowBlur = isActive ? 22 : 12;
      ctx.shadowColor = isActive ? "#ffcc00" : "#00e5ff";
      ctx.fillStyle = gradient;

      ctx.fillRect(block.x, block.y, block.width, block.height);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#031018";
      ctx.font = "bold 12px Arial";
      ctx.fillText("DOG BOOST", block.x + 10, block.y + 15);
    }

    function drawHud() {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(8, 8, 150, 36);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`SCORE ${currentScore}`, 16, 24);

      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`BOOST ${currentBoost}`, 16, 40);
    }

    function loop() {
      drawBackground();

      activeBlock.x += activeBlock.speed * activeBlock.direction;

      if (
        activeBlock.x <= 0 ||
        activeBlock.x + activeBlock.width >= canvas.width
      ) {
        activeBlock.direction *= -1;
      }

      blocks.forEach((block) => drawBlock(block));
      drawBlock(activeBlock, true);
      drawHud();

      animationId = requestAnimationFrame(loop);
    }

    const unbindTap = bindCanvasTap(canvas, drop);

    loop();

    return () => {
      cancelAnimationFrame(animationId);
      unbindTap();
      gameRef.current = null;
    };
  }, [status]);

  return (
    <main className="page">
      <section className="hero game-hero">
        <div className="badge">BOOST Arcade • Stack</div>

        <h1>DOG Stack</h1>

        <p>
          Tap to drop BOOST bars when they align. Perfect stacks earn extra
          points — arcade training only.
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
              <h2>DOG Stack</h2>
              <p>Tap when the moving block lines up with the stack below.</p>
              <button className="primary" type="button" onClick={startGame}>
                Start Stack
              </button>
            </div>
          )}

          {status === "gameover" && (
            <div className="game-overlay">
              <h2>Stack Complete</h2>
              <p>Score: {score}</p>
              <p>BOOST collected: {boost}</p>
              <p>Best: {best}</p>
              <button className="primary" type="button" onClick={startGame}>
                Stack Again
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
            <span>Status</span>
            <strong>{status === "playing" ? "LIVE" : "READY"}</strong>
          </div>
        </div>

        {status === "playing" && (
          <button
            className="primary game-touch-btn"
            type="button"
            onClick={dropBlock}
          >
            Drop Block
          </button>
        )}

        <p className="game-hint">Tip: tap the canvas or the button to drop.</p>

        <a className="game-back-link" href="/">
          ← Back to ProofOrigin
        </a>
      </section>
    </main>
  );
}

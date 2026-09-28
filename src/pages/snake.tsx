import React, { useCallback, useEffect, useRef, useState } from "react";
import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

const GRID_SIZE = 20;
const CELL_SIZE = 20;
const BOARD_SIZE = GRID_SIZE * CELL_SIZE;
const INITIAL_SPEED = 150;
const MIN_SPEED = 60;
const SPEED_STEP = 5;
const HIGH_SCORE_KEY = "snake-high-score";

type Point = { x: number; y: number };
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Status = "idle" | "running" | "paused" | "over";

const DIRECTION_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  w: "UP",
  s: "DOWN",
  a: "LEFT",
  d: "RIGHT",
};

const initialSnake = (): Point[] => [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];

const randomFood = (snake: Point[]): Point => {
  const free: Point[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
};

const readHighScore = (): number => {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeHighScore = (score: number) => {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // ignore storage errors (private mode etc.)
  }
};

const SnakeGame: NextPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Point[]>(initialSnake());
  const foodRef = useRef<Point>(randomFood(snakeRef.current));
  const directionRef = useRef<Direction>("RIGHT");
  const queuedDirectionsRef = useRef<Direction[]>([]);
  const touchStartRef = useRef<Point | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);

  useEffect(() => setHighScore(readHighScore()), []);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE + 0.5, 0);
      ctx.lineTo(i * CELL_SIZE + 0.5, BOARD_SIZE);
      ctx.moveTo(0, i * CELL_SIZE + 0.5);
      ctx.lineTo(BOARD_SIZE, i * CELL_SIZE + 0.5);
      ctx.stroke();
    }

    const food = foodRef.current;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    snakeRef.current.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#22c55e" : "#16a34a";
      ctx.fillRect(
        p.x * CELL_SIZE + 1,
        p.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    });
  }, []);

  const reset = useCallback(() => {
    snakeRef.current = initialSnake();
    foodRef.current = randomFood(snakeRef.current);
    directionRef.current = "RIGHT";
    queuedDirectionsRef.current = [];
    setScore(0);
    setSpeed(INITIAL_SPEED);
    draw();
  }, [draw]);

  const start = useCallback(() => {
    if (status === "over" || status === "idle") reset();
    setStatus("running");
  }, [status, reset]);

  const togglePause = useCallback(() => {
    setStatus((s) =>
      s === "running" ? "paused" : s === "paused" ? "running" : s
    );
  }, []);

  const changeDirection = useCallback((dir: Direction) => {
    const queue = queuedDirectionsRef.current;
    const last = queue[queue.length - 1] ?? directionRef.current;
    // Ignore reversing into itself and duplicate inputs; cap the buffer.
    if (dir === last || dir === OPPOSITE[last] || queue.length >= 3) return;
    queue.push(dir);
  }, []);

  const step = useCallback(() => {
    const next = queuedDirectionsRef.current.shift();
    if (next) directionRef.current = next;

    const snake = snakeRef.current;
    const head = snake[0] as Point;
    const vec = DIRECTION_VECTORS[directionRef.current];
    const newHead = { x: head.x + vec.x, y: head.y + vec.y };
    const ate =
      newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
    // The tail moves away this tick unless we grow, so it's not a collision.
    const body = ate ? snake : snake.slice(0, -1);

    const hitWall =
      newHead.x < 0 ||
      newHead.y < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y >= GRID_SIZE;
    const hitSelf = body.some((p) => p.x === newHead.x && p.y === newHead.y);

    if (hitWall || hitSelf) {
      setStatus("over");
      return;
    }

    snakeRef.current = [newHead, ...body];
    if (ate) {
      setScore((s) => s + 10);
      setSpeed((sp) => Math.max(MIN_SPEED, sp - SPEED_STEP));
      if (snakeRef.current.length === GRID_SIZE * GRID_SIZE) {
        setStatus("over");
      } else {
        foodRef.current = randomFood(snakeRef.current);
      }
    }
    draw();
  }, [draw]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(step, speed);
    return () => window.clearInterval(id);
  }, [status, speed, step]);

  useEffect(() => draw(), [draw]);

  useEffect(() => {
    if (status === "over" && score > highScore) {
      setHighScore(score);
      writeHighScore(score);
    }
  }, [status, score, highScore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = KEY_TO_DIRECTION[key];
      if (dir) {
        e.preventDefault();
        if (status === "idle" || status === "over") start();
        changeDirection(dir);
      } else if (key === " ") {
        e.preventDefault();
        if (status === "idle" || status === "over") start();
        else togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, start, togglePause, changeDirection]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startPt = touchStartRef.current;
    const t = e.changedTouches[0];
    touchStartRef.current = null;
    if (!startPt || !t) return;
    const dx = t.clientX - startPt.x;
    const dy = t.clientY - startPt.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (status === "idle" || status === "over") start();
    if (Math.abs(dx) > Math.abs(dy)) changeDirection(dx > 0 ? "RIGHT" : "LEFT");
    else changeDirection(dy > 0 ? "DOWN" : "UP");
  };

  const pressDirection = (dir: Direction) => {
    if (status === "idle" || status === "over") start();
    changeDirection(dir);
  };

  const buttonClass =
    "rounded-lg bg-zinc-700 px-4 py-3 text-lg font-bold text-white active:bg-zinc-500 select-none";

  return (
    <>
      <Head>
        <title>贪吃蛇</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-900 p-4 text-white">
        <h1 className="text-3xl font-bold">🐍 贪吃蛇</h1>

        <div className="flex w-full max-w-[400px] justify-between text-lg">
          <span>得分：{score}</span>
          <span>最高分：{highScore}</span>
        </div>

        <div
          className="relative w-full max-w-[400px] touch-none"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <canvas
            ref={canvasRef}
            width={BOARD_SIZE}
            height={BOARD_SIZE}
            className="aspect-square w-full rounded-lg border-2 border-zinc-600"
          />
          {status !== "running" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/60">
              {status === "over" && (
                <p className="text-2xl font-bold text-red-400">游戏结束</p>
              )}
              {status === "paused" && (
                <p className="text-2xl font-bold">已暂停</p>
              )}
              <button
                className="rounded-lg bg-green-600 px-6 py-2 text-lg font-bold hover:bg-green-500"
                onClick={status === "paused" ? togglePause : start}
              >
                {status === "paused"
                  ? "继续"
                  : status === "over"
                  ? "再来一局"
                  : "开始游戏"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 md:hidden">
          <span />
          <button className={buttonClass} onClick={() => pressDirection("UP")}>
            ↑
          </button>
          <span />
          <button
            className={buttonClass}
            onClick={() => pressDirection("LEFT")}
          >
            ←
          </button>
          <button className={buttonClass} onClick={togglePause}>
            ⏯
          </button>
          <button
            className={buttonClass}
            onClick={() => pressDirection("RIGHT")}
          >
            →
          </button>
          <span />
          <button
            className={buttonClass}
            onClick={() => pressDirection("DOWN")}
          >
            ↓
          </button>
          <span />
        </div>

        <p className="text-center text-sm text-zinc-400">
          方向键 / WASD 控制方向，空格暂停；手机上可滑动或使用按钮。
          <br />
          每吃一个食物 +10 分，速度逐渐加快。
        </p>

        <Link href="/" className="text-sm text-zinc-400 underline">
          返回首页
        </Link>
      </main>
    </>
  );
};

export default SnakeGame;

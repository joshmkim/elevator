"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type Direction = "up" | "down" | "idle";

type Snapshot = {
  simTime: number;
  elevator: {
    floor: number;
    direction: Direction;
    doorsOpen: boolean;
    passengerCount: number;
    passengerDestinations: number[];
  };
  queues: Record<string, { up: number; down: number }>;
};

type Timeline = {
  duration: number;
  dt: number;
  snapshots: Snapshot[];
};

const MAX_AVATARS_PER_SIDE = 6;

type ScenarioKey = "low" | "medium" | "high";
type SpeedKey = 1 | 2 | 5;

const SCENARIOS: Record<ScenarioKey, { label: string; path: string }> = {
  low: { label: "Low", path: "backend/scenarios/low_traffic.jsonl" },
  medium: { label: "Medium", path: "backend/scenarios/medium_traffic.jsonl" },
  high: { label: "High", path: "backend/scenarios/high_traffic.jsonl" },
};

export default function Home() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [currentSimTime, setCurrentSimTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioKey>("high");
  const [speed, setSpeed] = useState<SpeedKey>(1);
  const timelineRef = useRef<Timeline | null>(null);
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastRealTimeRef = useRef<number | null>(null);

  // Pick the snapshot that matches the current simulated time.
  const currentSnapshot = (() => {
    if (!timeline) return null;
    const idx = Math.min(
      timeline.snapshots.length - 1,
      Math.max(0, Math.floor(currentSimTime / timeline.dt))
    );
    return timeline.snapshots[idx];
  })();

  // Create a new sim on the backend and fetch its timeline JSON.
  const fetchTimeline = useCallback(async () => {
    setRunning(false);
    setCurrentSimTime(0);
    setError(null);
    lastRealTimeRef.current = null;
    try {
      const createRes = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: 123,
          scenarioPath: SCENARIOS[scenario].path,
        }),
      });
      if (!createRes.ok) {
        const msg = await createRes.text().catch(() => createRes.statusText);
        setError(`Backend error: ${createRes.status} ${msg}`);
        return null;
      }
      const { id } = await createRes.json();
      const timelineRes = await fetch(`/api/simulations/${id}/timeline`);
      if (!timelineRes.ok) {
        setError("Failed to fetch timeline");
        return null;
      }
      const data: Timeline = await timelineRes.json();
      setTimeline(data);
      timelineRef.current = data;
      setCurrentSimTime(0);
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        "Could not reach the backend. Start it from the elevator folder with: source .venv/bin/activate && uvicorn backend.server:app --reload --port 8000"
      );
      return null;
    }
  }, [scenario]);

  // Hold the RAF tick function without re-creating it every render.
  const tickRef = useRef<((time: number) => void) | null>(null);

  // Start playback (fetches the timeline if we don’t have one yet).
  const start = useCallback(async () => {
    if (!timelineRef.current) {
      const data = await fetchTimeline();
      if (!data) return;
    }
    setRunning(true);
    runningRef.current = true;
  }, [fetchTimeline]);

  // Pause playback.
  const stop = useCallback(() => {
    setRunning(false);
    runningRef.current = false;
  }, []);

  // Toggle between play and pause.
  const togglePlayPause = useCallback(async () => {
    if (runningRef.current) {
      stop();
      return;
    }
    await start();
  }, [start, stop]);

  // Reset the sim back to t=0 by reloading a fresh timeline (does not auto-play).
  const restart = useCallback(async () => {
    const data = await fetchTimeline();
    if (data) stop();
  }, [fetchTimeline]);

  // Animation loop: advance sim time based on real time and selected speed.
  useEffect(() => {
    tickRef.current = (realTime: number) => {
      const tl = timelineRef.current;
      if (!tl || !runningRef.current) return;
      if (lastRealTimeRef.current == null) {
        lastRealTimeRef.current = realTime;
        rafRef.current = requestAnimationFrame((t) => tickRef.current?.(t));
        return;
      }
      const deltaReal = (realTime - lastRealTimeRef.current) / 1000;
      lastRealTimeRef.current = realTime;
      setCurrentSimTime((prev) => {
        const next = Math.min(tl.duration, prev + deltaReal * speed);
        if (next >= tl.duration) {
          setRunning(false);
          runningRef.current = false;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame((t) => tickRef.current?.(t));
    };

    if (running && timeline) {
      lastRealTimeRef.current = null;
      rafRef.current = requestAnimationFrame((t) => tickRef.current?.(t));
    } else if (!running && rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timeline, speed]);

  // Render the "Sim: m:ss / m:ss" label.
  const simLabel = (() => {
    const end = timeline?.duration ?? 3600;
    const m = Math.floor(currentSimTime / 60);
    const s = Math.floor(currentSimTime % 60)
      .toString()
      .padStart(2, "0");
    const endM = Math.floor(end / 60);
    const endS = Math.floor(end % 60)
      .toString()
      .padStart(2, "0");
    return `Sim: ${m}:${s} / ${endM}:${endS}`;
  })();

  // Render a row of cute avatars (with +N if there are many).
  const avatarNodes = (count: number) => {
    const n = Math.min(count, MAX_AVATARS_PER_SIDE);
    const nodes = Array.from({ length: n }, (_, i) => (
      <span key={i} className={styles.avatar} aria-hidden="true" />
    ));
    const remaining = count - n;
    if (remaining > 0) {
      nodes.push(
        <span key="more" className={styles.avatarMore}>
          +{remaining}
        </span>
      );
    }
    return nodes;
  };

  const floorRows = [];
  for (let f = 10; f >= 1; f--) {
    const key = String(f);
    const upCount = currentSnapshot?.queues[key]?.up ?? 0;
    const downCount = currentSnapshot?.queues[key]?.down ?? 0;
    floorRows.push(
      <div className={styles.floor} key={f}>
        <div className={styles.floorLeft}>
          <span className={styles.floorNum}>{f}</span>
          <div className={styles.floorPeople}>
            <div className={styles.peopleRow} title={`Waiting up: ${upCount}`}>
              {avatarNodes(upCount)}
            </div>
            <div
              className={`${styles.peopleRow} ${styles.peopleRowDown}`}
              title={`Waiting down: ${downCount}`}
            >
              {avatarNodes(downCount)}
            </div>
          </div>
        </div>
        <div className={styles.floorCalls}>
          <span className={styles.callPill} aria-label={`Up queue ${upCount}`}>
            <span className={styles.callIcon}>↑</span>
            <span className={styles.callCount}>{upCount}</span>
          </span>
          <span
            className={`${styles.callPill} ${styles.callPillDown}`}
            aria-label={`Down queue ${downCount}`}
          >
            <span className={styles.callIcon}>↓</span>
            <span className={styles.callCount}>{downCount}</span>
          </span>
        </div>
      </div>
    );
  }

  const elevatorFloor = currentSnapshot?.elevator.floor ?? 1;
  const direction = currentSnapshot?.elevator.direction ?? "idle";
  const doorsOpen = currentSnapshot?.elevator.doorsOpen ?? false;
  const passengerCount = currentSnapshot?.elevator.passengerCount ?? 0;
  const passengerDestinations =
    currentSnapshot?.elevator.passengerDestinations ?? [];
  const destinationCounts = passengerDestinations.reduce<Record<number, number>>(
    (acc, floor) => {
      acc[floor] = (acc[floor] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Elevator</h1>
        <header className={styles.controls}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.controlsLeft}>
            {/* Brand removed */}
          </div>
          <div className={styles.controlsRight}>
            <div className={styles.buttonRow}>
              <button
                type="button"
                onClick={togglePlayPause}
                className={`${styles.iconButton} ${styles.iconButtonLarge}`}
                aria-label={running ? "Pause" : "Start"}
                title={running ? "Pause" : "Start"}
              >
                <span className={styles.iconStack} aria-hidden="true">
                  <span
                    className={`${styles.iconLayer} ${styles.iconGlyph} ${styles.iconGlyphPlay} ${
                      running ? styles.iconLayerHidden : styles.iconLayerVisible
                    }`}
                  >
                    ▶
                  </span>
                  <span
                    className={`${styles.iconLayer} ${styles.iconGlyph} ${styles.iconGlyphPause} ${
                      running ? styles.iconLayerVisible : styles.iconLayerHidden
                    }`}
                  >
                    ⏸
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={restart}
                className={`${styles.iconButton} ${styles.iconButtonLarge}`}
                aria-label="Restart"
                title="Restart"
              >
                <span
                  className={`${styles.iconGlyph} ${styles.iconGlyphRestart}`}
                  aria-hidden="true"
                >
                  ↻
                </span>
              </button>
            </div>

            <div className={styles.scenarioRow} aria-label="Scenario">
              <span className={styles.scenarioLabel}>Scenario</span>
              <div className={styles.scenarioButtons} role="group">
                {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      key === scenario
                        ? `${styles.scenarioButton} ${styles.scenarioButtonActive}`
                        : styles.scenarioButton
                    }
                    onClick={async () => {
                      setScenario(key);
                      // If already running, reload immediately into the new scenario.
                      if (runningRef.current || timelineRef.current) {
                        await new Promise((r) => setTimeout(r, 0));
                        const data = await (async () => {
                          // Use the next state value via key param instead of relying on setState timing.
                          setRunning(false);
                          runningRef.current = false;
                          setCurrentSimTime(0);
                          setError(null);
                          lastRealTimeRef.current = null;
                          try {
                            const createRes = await fetch("/api/simulations", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                seed: 123,
                                scenarioPath: SCENARIOS[key].path,
                              }),
                            });
                            if (!createRes.ok) {
                              const msg = await createRes
                                .text()
                                .catch(() => createRes.statusText);
                              setError(`Backend error: ${createRes.status} ${msg}`);
                              return null;
                            }
                            const { id } = await createRes.json();
                            const timelineRes = await fetch(
                              `/api/simulations/${id}/timeline`
                            );
                            if (!timelineRes.ok) {
                              setError("Failed to fetch timeline");
                              return null;
                            }
                            const tl: Timeline = await timelineRes.json();
                            setTimeline(tl);
                            timelineRef.current = tl;
                            setCurrentSimTime(0);
                            return tl;
                          } catch {
                            setError(
                              "Could not reach the backend. Start it from the elevator folder with: source .venv/bin/activate && uvicorn backend.server:app --reload --port 8000"
                            );
                            return null;
                          }
                        })();
                        if (data && running) {
                          setRunning(true);
                          runningRef.current = true;
                        }
                      }
                    }}
                  >
                    {SCENARIOS[key].label}
                  </button>
                ))}
              </div>
            </div>

            <span className={styles.simTime}>{simLabel}</span>

            <div className={styles.speedRow} aria-label="Playback speed">
              <span className={styles.speedLabel}>Speed</span>
              <div className={styles.speedButtons} role="group">
                {([1, 2, 5] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={
                      s === speed
                        ? `${styles.speedButton} ${styles.speedButtonActive}`
                        : styles.speedButton
                    }
                    onClick={() => setSpeed(s)}
                    aria-label={`${s}x speed`}
                    title={`${s}x`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <span className={styles.statusPill}>
              <span
                className={`${styles.statusDot} ${
                  running ? styles.statusDotOn : styles.statusDotOff
                }`}
                aria-hidden="true"
              />
              {running ? "Running" : "Stopped"}
            </span>
          </div>
        </header>

        <section className={styles.layout}>
          <div className={styles.buildingWrap}>
            <div className={styles.building}>
              <div className={styles.shaft}>
                <div className={styles.shaftGlow} aria-hidden="true" />
                <div
                  className={`${styles.cab} ${
                    direction === "up"
                      ? styles.cabUp
                      : direction === "down"
                      ? styles.cabDown
                      : styles.cabIdle
                  } ${doorsOpen ? styles.cabDoorsOpen : ""}`}
                  style={{ bottom: `${(elevatorFloor - 1) * 52}px` }}
                >
                  <div className={styles.cabArrow} />
                  <div className={styles.cabDoors}>
                    <div className={`${styles.cabDoor} ${styles.left}`} />
                    <div className={`${styles.cabDoor} ${styles.right}`} />
                  </div>
                  <div className={styles.cabCounter}>{passengerCount}</div>
                </div>
              </div>
              <div className={styles.floors}>{floorRows}</div>
            </div>
          </div>

          <aside className={styles.panel}>
            <h2 className={styles.panelTitle}>Elevator panel</h2>
            <div className={styles.panelCard}>
              <div className={styles.panelRow}>
                <span className={styles.panelLabel}>Current floor</span>
                <span className={styles.panelValue}>{elevatorFloor}</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelLabel}>Direction</span>
                <span className={styles.panelValue}>{direction}</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelLabel}>Passengers</span>
                <span className={styles.panelValue}>{passengerCount}</span>
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelSectionTitle}>Destinations</div>
              <div
                className={styles.destGrid}
                role="grid"
                aria-label="Destination floors"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((f) => {
                  const count = destinationCounts[f] ?? 0;
                  const active = count > 0;
                  return (
                    <button
                      key={f}
                      type="button"
                      className={
                        active
                          ? `${styles.destButton} ${styles.destButtonActive} ${
                              f === 10 ? styles.destButtonLast : ""
                            }`
                          : `${styles.destButton} ${
                              f === 10 ? styles.destButtonLast : ""
                            }`
                      }
                      aria-label={
                        active
                          ? `Floor ${f}, ${count} passenger${count === 1 ? "" : "s"}`
                          : `Floor ${f}`
                      }
                      title={
                        active
                          ? `Floor ${f}: ${count} passenger${count === 1 ? "" : "s"}`
                          : `Floor ${f}`
                      }
                    >
                      <span className={styles.destButtonFloor}>{f}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

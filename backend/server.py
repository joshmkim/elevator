from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .sim_runner import generate_timeline

app = FastAPI()

# MVP: allow Next dev server to call backend directly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

_TIMELINES: dict[str, dict[str, Any]] = {}

@app.post("/api/simulations")
def create_simulation(payload: dict[str, Any] | None = None) -> dict[str, str]:
    # Create a new simulation run and store its generated timeline in memory.
    print("[backend] POST /api/simulations received")
    payload = payload or {}
    seed = payload.get("seed", None)
    scenario_path = payload.get("scenarioPath", None)
    try:
        print("[backend] Generating timeline (may take 10–30s)...")
        timeline = generate_timeline(seed=seed, scenario_path=scenario_path)
        print("[backend] Timeline generated")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[backend] Timeline generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Timeline generation failed: {e!s}")
    sim_id = str(uuid.uuid4())
    _TIMELINES[sim_id] = timeline
    return {"id": sim_id}


@app.get("/api/simulations/{sim_id}/timeline")
def get_timeline(sim_id: str) -> dict[str, Any]:
    # Return the saved timeline JSON for a previously created simulation.
    timeline = _TIMELINES.get(sim_id)
    if timeline is None:
        raise HTTPException(status_code=404, detail="simulation not found")
    return timeline

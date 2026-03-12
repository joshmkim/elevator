from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from . import elevator as elevator_algo
from . import visual_sim_constants as C

Direction = Literal["up", "down", "idle"]


@dataclass
class Arrival:
    t: float
    origin: int
    dest: int


@dataclass
class Person:
    dest: int


def _validate_floor(f: int) -> None:
    # Make sure a floor number is within 1..NUM_FLOORS.
    if not (1 <= f <= C.NUM_FLOORS):
        raise ValueError(f"floor out of range: {f}")


def load_arrivals_from_jsonl(path: str) -> list[Arrival]:
    # Load (time, from, to) arrivals from a JSONL scenario file.
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"scenario file not found: {path}")
    arrivals: list[Arrival] = []
    with p.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            t = float(obj["t"])
            origin = int(obj["from"])
            dest = int(obj["to"])
            if t < 0 or t > C.SIM_DURATION_S:
                raise ValueError(f"invalid t at line {line_no}: {t}")
            _validate_floor(origin)
            _validate_floor(dest)
            if origin == dest:
                raise ValueError(f"from==to at line {line_no}")
            arrivals.append(Arrival(t=t, origin=origin, dest=dest))
    arrivals.sort(key=lambda a: a.t)
    return arrivals


def _queues_template() -> dict[int, dict[str, list[Person]]]:
    # Create an empty {floor -> {up/down -> people}} queue structure.
    return {f: {"up": [], "down": []} for f in range(1, C.NUM_FLOORS + 1)}


def _enqueue_person(queues: dict[int, dict[str, list[Person]]], origin: int, dest: int) -> None:
    # Add a new person to the right (up/down) waiting queue on their origin floor.
    direction = "up" if dest > origin else "down"
    queues[origin][direction].append(Person(dest=dest))


def _any_requests(queues: dict[int, dict[str, list[Person]]], passengers: list[Person]) -> bool:
    # Return True if anyone is waiting or riding.
    if passengers:
        return True
    for f in range(1, C.NUM_FLOORS + 1):
        if queues[f]["up"] or queues[f]["down"]:
            return True
    return False


def _request_floors(queues: dict[int, dict[str, list[Person]]], passengers: list[Person]) -> list[int]:
    # Build a sorted list of floors we need to visit (waiting floors + passenger destinations).
    req: set[int] = set()
    for f in range(1, C.NUM_FLOORS + 1):
        if queues[f]["up"] or queues[f]["down"]:
            req.add(f)
    for p in passengers:
        req.add(p.dest)
    return sorted(req)


def _next_look_target(
    floor: int,
    direction: Direction,
    queues: dict[int, dict[str, list[Person]]],
    passengers: list[Person],
) -> tuple[Direction, int | None]:
    # Decide which direction to move and which floor to head toward next (LOOK behavior).
    # LOOK-style movement:
    # - Keep going in the current direction while there are requests ahead.
    # - Only reverse when there are no more requests ahead.
    targets = set(_request_floors(queues, passengers))
    targets.discard(floor)
    if not targets:
        return ("idle", None)

    above = sorted(t for t in targets if t > floor)
    below = sorted((t for t in targets if t < floor), reverse=True)

    if direction == "up":
        if above:
            return ("up", above[0])
        if below:
            return ("down", below[0])
        return ("idle", None)

    if direction == "down":
        if below:
            return ("down", below[0])
        if above:
            return ("up", above[0])
        return ("idle", None)

    # idle: choose a direction; prefer up if anything above, else down.
    if above:
        return ("up", above[0])
    if below:
        return ("down", below[0])
    return ("idle", None)


def _idle_direction_for_floor(floor: int, queues: dict[int, dict[str, list[Person]]]) -> Direction:
    # When stopped/idle at a floor, pick a direction to serve waiting riders.
    if queues[floor]["up"]:
        return "up"
    if queues[floor]["down"]:
        return "down"
    return "idle"


def _should_stop(
    floor: int,
    direction: Direction,
    queues: dict[int, dict[str, list[Person]]],
    passengers: list[Person],
) -> bool:
    # Return True if we should stop here to drop off or pick up (in current direction).
    if any(p.dest == floor for p in passengers):
        return True
    if direction == "up" and queues[floor]["up"]:
        return True
    if direction == "down" and queues[floor]["down"]:
        return True
    return False


def _board_and_unboard(
    floor: int,
    direction: Direction,
    queues: dict[int, dict[str, list[Person]]],
    passengers: list[Person],
) -> list[Person]:
    # Let off anyone whose destination is this floor, then board riders going our direction.
    # Unboard
    passengers = [p for p in passengers if p.dest != floor]
    # Board strictly in current direction.
    if direction == "up":
        q = queues[floor]["up"]
    elif direction == "down":
        q = queues[floor]["down"]
    else:
        q = []

    while len(passengers) < C.CAPACITY and q:
        passengers.append(q.pop(0))
    return passengers


def _random_spawn_schedule(rng: random.Random) -> list[Arrival]:
    # Generate a random schedule of arrivals (only used if no scenario file is provided).
    t = 0.0
    arrivals: list[Arrival] = []
    while t <= C.SIM_DURATION_S:
        t += rng.uniform(C.SPAWN_MIN_S, C.SPAWN_MAX_S)
        if t > C.SIM_DURATION_S:
            break
        origin = rng.randint(1, C.NUM_FLOORS)
        dest = rng.randint(1, C.NUM_FLOORS)
        while dest == origin:
            dest = rng.randint(1, C.NUM_FLOORS)
        arrivals.append(Arrival(t=t, origin=origin, dest=dest))
    return arrivals


def _snapshot(sim_time: float, floor: int, direction: Direction, doors_open: bool, passengers: list[Person], queues: dict[int, dict[str, list[Person]]]) -> dict[str, Any]:
    # Convert the current sim state into a JSON-friendly snapshot dict.
    return {
        "simTime": round(sim_time, 3),
        "elevator": {
            "floor": floor,
            "direction": direction,
            "doorsOpen": doors_open,
            "passengerCount": len(passengers),
            "passengerDestinations": sorted(p.dest for p in passengers),
        },
        "queues": {str(f): {"up": len(queues[f]["up"]), "down": len(queues[f]["down"])} for f in range(1, C.NUM_FLOORS + 1)},
    }


def generate_timeline(seed: int | None = None, scenario_path: str | None = None) -> dict[str, Any]:
    # Run the discrete-time sim and return a full timeline of snapshots.
    rng = random.Random(seed)

    if scenario_path:
        arrivals = load_arrivals_from_jsonl(str(Path(scenario_path)))
    else:
        arrivals = _random_spawn_schedule(rng)

    queues = _queues_template()
    passengers: list[Person] = []

    sim_time = 0.0
    floor = 1
    direction: Direction = "idle"
    # For this MVP mode we keep movement discrete: 1 floor per tick.
    # Boarding/unboarding happens instantly (no door-dwell pauses), so the
    # elevator can move every second.
    doors_open = False
    move_timer = 0.0

    next_arrival_idx = 0

    snapshots: list[dict[str, Any]] = []

    # Initial snapshot at t=0
    snapshots.append(_snapshot(sim_time, floor, direction, doors_open, passengers, queues))

    while sim_time < C.SIM_DURATION_S:
        sim_time = min(C.SIM_DURATION_S, sim_time + C.DT_S)

        # Enqueue arrivals up to current time
        while next_arrival_idx < len(arrivals) and arrivals[next_arrival_idx].t <= sim_time + 1e-9:
            a = arrivals[next_arrival_idx]
            _enqueue_person(queues, a.origin, a.dest)
            next_arrival_idx += 1

        # No door-open/dwell phase in this mode.

        # Not doors open
        if move_timer > 0:
            move_timer -= C.DT_S
            if move_timer <= 0:
                move_timer = 0.0
                prev_floor = floor
                if direction == "up":
                    floor = min(C.NUM_FLOORS, floor + 1)
                elif direction == "down":
                    floor = max(1, floor - 1)

                # Stop?
                stopped_this_tick = False
                if _should_stop(floor, direction, queues, passengers):
                    passengers = _board_and_unboard(floor, direction, queues, passengers)
                    doors_open = False
                    stopped_this_tick = True

                # Decide next movement (prevents getting stuck at boundaries).
                if _any_requests(queues, passengers):
                    prev_direction = direction
                    direction, nxt = _next_look_target(floor, direction, queues, passengers)
                    # If we reversed at this floor, allow boarding in the new direction
                    # (e.g. at floor 10, switch to down and pick up down-queue).
                    if (
                        direction in ("up", "down")
                        and prev_direction in ("up", "down")
                        and direction != prev_direction
                        and _should_stop(floor, direction, queues, passengers)
                    ):
                        passengers = _board_and_unboard(floor, direction, queues, passengers)
                        doors_open = False
                    if nxt is not None:
                        move_timer = C.TRAVEL_TIME_PER_FLOOR_S
                else:
                    direction = "idle"

            snapshots.append(_snapshot(sim_time, floor, direction, doors_open, passengers, queues))
            continue

        # Idle (not moving, doors closed) — decide what to do
        if _any_requests(queues, passengers):
            # If we're idle on a floor with a waiting queue, choose a direction and board immediately.
            if direction == "idle" and (queues[floor]["up"] or queues[floor]["down"]):
                direction = _idle_direction_for_floor(floor, queues)
                passengers = _board_and_unboard(floor, direction, queues, passengers)

            direction, nxt = _next_look_target(floor, direction, queues, passengers)

            # Service the current floor immediately if needed (in chosen direction).
            if queues[floor]["up"] or queues[floor]["down"] or any(p.dest == floor for p in passengers):
                passengers = _board_and_unboard(floor, direction, queues, passengers)
                # Recompute target after boarding (new passenger destinations may exist now).
                direction, nxt = _next_look_target(floor, direction, queues, passengers)

            if nxt is not None:
                move_timer = C.TRAVEL_TIME_PER_FLOOR_S
        else:
            direction = "idle"

        snapshots.append(_snapshot(sim_time, floor, direction, doors_open, passengers, queues))

    return {"duration": int(C.SIM_DURATION_S), "dt": C.DT_S, "snapshots": snapshots}

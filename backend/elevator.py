# Elevator simulation: LOOK scheduling, travel time.

from typing import Sequence


def _consolidate_consecutive(floors: list[int]) -> list[int]:
    # Remove consecutive duplicate floors.
    if not floors:
        return []
    out = [floors[0]]
    for f in floors[1:]:
        if f != out[-1]:
            out.append(f)
    return out


def compute_sequence(start: int, floors: list[int]) -> list[int]:
    # Compute visit order using LOOK (optimize travel).
    # Consecutive duplicate floors are consolidated to a single stop.
    consolidated = _consolidate_consecutive(floors)
    # LOOK: sweep one direction, then reverse
    if not consolidated:
        return [start]

    remaining = set(consolidated)
    # If the current floor is requested, treat it as "already served" for routing.
    # Otherwise LOOK can get stuck when all remaining requests equal `current`.
    remaining.discard(start)
    sequence = [start]
    current = start
    # Initial direction: toward first requested floor
    direction = 1 if consolidated[0] > start else -1  # 1 = up, -1 = down

    while remaining:
        if direction == 1:
            next_floors = sorted(f for f in remaining if f > current)
        else:
            next_floors = sorted((f for f in remaining if f < current), reverse=True)

        if not next_floors:
            direction *= -1
            continue

        for f in next_floors:
            sequence.append(f)
            remaining.discard(f)
            current = f
        direction *= -1

    return sequence


def compute_travel_time(sequence: Sequence[int], floor_time: int | None = None) -> int:
    # Compute total travel time based on the visited floor sequence.
    if floor_time is None:
        raise ValueError("floor_time is required")
    total_floors = 0
    for i in range(len(sequence) - 1):
        total_floors += abs(sequence[i + 1] - sequence[i])
    return total_floors * floor_time


def format_output(travel_time: int, sequence: Sequence[int]) -> str:
    # Produce the required output line.
    return f"{travel_time} {','.join(map(str, sequence))}"

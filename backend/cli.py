# CLI parsing for elevator simulation.

import re
import sys
from typing import NamedTuple


class ElevatorInput(NamedTuple):
    start: int
    floors: list[int]


def parse_input(args: list[str] | None = None) -> ElevatorInput:
    # Read and validate CLI input, then return (start, requested_floors).
    # Parse elevator start and floors from args or stdin.
    # Supports: elevator start=<N> floor=<f1>,<f2>,...
    if args is None:
        args = sys.argv[1:]

    line = " ".join(args).strip()
    if not line and sys.stdin.isatty():
        line = ""
    if not line:
        # Try reading from stdin (e.g. piped input)
        try:
            line = sys.stdin.read().strip()
        except (EOFError, OSError):
            pass

    if not line:
        _usage_exit("Missing input. Usage: elevator start=<n> floor=<f1>,<f2>,...")

    start_m = re.search(r"start\s*=\s*(\d+)", line, re.IGNORECASE)
    floor_m = re.search(r"floor\s*=\s*([\d,\s]+)", line, re.IGNORECASE)

    if not start_m:
        _usage_exit("Missing or invalid start=. Usage: elevator start=<n> floor=<f1>,<f2>,...")

    start = int(start_m.group(1))
    if start < 0:
        _usage_exit("start must be >= 0")

    if floor_m:
        raw = floor_m.group(1).strip()
        floors = []
        for part in re.split(r"[,]\s*", raw):
            part = part.strip()
            if not part:
                continue
            try:
                floors.append(int(part))
            except ValueError:
                _usage_exit(f"Invalid floor value: {part!r}")
            if floors[-1] < 0:
                _usage_exit("Floors must be >= 0")
    else:
        floors = []

    return ElevatorInput(start=start, floors=floors)


def _usage_exit(msg: str) -> None:
    # Print a usage error and exit with non-zero status.
    print(msg, file=sys.stderr)
    sys.exit(1)

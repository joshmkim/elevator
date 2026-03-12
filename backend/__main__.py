# Entry point for elevator simulation (python -m backend).

import sys

# Unbuffer stdout so output appears immediately (e.g. in IDE terminals, subprocesses)
if not sys.stdout.isatty():
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, OSError):
        pass

from . import constants
from .cli import parse_input
from .elevator import compute_sequence, compute_travel_time, format_output


def main() -> None:
    # Run the CLI: parse input, compute route, print result.
    inp = parse_input()
    sequence = compute_sequence(inp.start, inp.floors)
    travel_time = compute_travel_time(sequence, constants.FLOOR_TRAVEL_TIME)
    print(format_output(travel_time, sequence), flush=True)


if __name__ == "__main__":
    main()
    sys.exit(0)

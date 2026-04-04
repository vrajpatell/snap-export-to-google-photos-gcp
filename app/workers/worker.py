from __future__ import annotations

import argparse

from app.core.container import import_service


def main() -> None:
    parser = argparse.ArgumentParser(description="Run import worker for a specific job.")
    parser.add_argument("job_id")
    args = parser.parse_args()
    import_service.start_upload(args.job_id)


if __name__ == "__main__":
    main()

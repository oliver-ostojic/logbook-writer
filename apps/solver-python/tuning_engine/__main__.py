"""Allow running tuning_engine as a module: python -m tuning_engine"""
from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())

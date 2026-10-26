#!/bin/bash
# Superseded by make.py (Playwright, works on Linux/macOS/Windows, vector Perl poses).
# Usage: bash tooling/store_screenshots/make.sh [en tr de]   (run from the project root)
set -e
exec python3 "$(dirname "$0")/make.py" "$@"

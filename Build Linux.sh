#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
node scripts/build-desktop.cjs linux "$@"

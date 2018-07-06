#!/usr/bin/env bash

set -e

progress=$(node -e "console.log(require.resolve('@mapbox/watchbot-progress'));")
base=$(dirname ${progress})

${base}/bin/watchbot-progress.js "$@"

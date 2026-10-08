#!/usr/bin/env bash
set -euo pipefail

# Free Render services have no pre-deploy command. Finish database preparation
# before binding the HTTP port; a failed migration must stop startup.
bash bin/release.sh
exec bash bin/start.sh

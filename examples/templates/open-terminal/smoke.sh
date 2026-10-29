#!/bin/sh
set -eu
python -c 'from importlib.metadata import version; assert version("open-terminal") == "0.14.6"; import matplotlib'
test -x /usr/local/bin/harakiri-open-terminal
test -x /bin/bash

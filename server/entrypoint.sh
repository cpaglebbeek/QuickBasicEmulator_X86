#!/bin/sh
# QB64-PE compile wrapper. Sets working-dir to /opt/qb64pe so qb64pe finds
# its internal includes (wiki_global.bas etc), but writes binary to /work.
set -e
cd /opt/qb64pe
# -x: compile with console progress (no GUI window, no tiny-file-dialogs needs)
exec ./qb64pe -p -x /work/input.bas -o /work/output 2>&1

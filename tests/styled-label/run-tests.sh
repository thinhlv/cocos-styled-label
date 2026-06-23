#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_NAME="styled-label"
LOG_FILE="${SCRIPT_DIR}/test-results.log"
REPORT_FILE="${SCRIPT_DIR}/test-report.txt"
START_TIME=$(date +%s)

if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

log()  { echo -e "$*"; }
info() { log "${CYAN}[INFO]${RESET} $*"; }
ok()   { log "${GREEN}[OK]${RESET}   $*"; }
err()  { log "${RED}[FAIL]${RESET} $*"; }
hdr()  { log "\n${BOLD}$*${RESET}"; }

hdr "=== ${SUITE_NAME} Test Runner ==="
info "Working directory: ${SCRIPT_DIR}"

if ! command -v node &>/dev/null; then
  err "node not found. Install Node.js 18+ and retry."
  exit 1
fi
NODE_VER=$(node --version)
info "Node: ${NODE_VER}"

hdr "── Setup"
cd "${SCRIPT_DIR}"

if [ ! -d node_modules ]; then
  info "node_modules not found — running npm install..."
  npm install --prefer-offline 2>&1 | sed 's/^/  /'
else
  info "node_modules present, skipping install."
fi

hdr "── Running tests"
info "Executing: npm test"
info "Log: ${LOG_FILE}"

set +e
npm test 2>&1 | tee "${LOG_FILE}"
EXIT_CODE=${PIPESTATUS[0]}
set -e

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

SUMMARY_LINE=$(grep -E "^Tests:" "${LOG_FILE}" | tail -n1 || echo "")
SUITES_LINE=$(grep -E "^Test Suites:" "${LOG_FILE}" | tail -n1 || echo "")

{
  echo "${SUITE_NAME} Test Report — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Duration : ${ELAPSED}s"
  echo "Node     : ${NODE_VER}"
  echo "Result   : $([ "${EXIT_CODE}" -eq 0 ] && echo PASSED || echo FAILED)"
  [ -n "${SUITES_LINE}" ] && echo "Suites   : ${SUITES_LINE}"
  [ -n "${SUMMARY_LINE}" ] && echo "Tests    : ${SUMMARY_LINE}"
  echo ""
  echo "Full log : ${LOG_FILE}"
} > "${REPORT_FILE}"

hdr "── Report"
info "Duration : ${ELAPSED}s"

if [ "${EXIT_CODE}" -eq 0 ]; then
  ok  "Result   : ALL GREEN — ${SUMMARY_LINE}"
else
  err "Result   : FAILED — ${SUMMARY_LINE}"
fi

log ""
info "Report saved to: ${REPORT_FILE}"

exit "${EXIT_CODE}"

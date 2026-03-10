#!/usr/bin/env bash

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT}" ]]; then
  echo "Status: failed"
  echo "Reason: not inside a git repository"
  exit 1
fi

cd "${ROOT}"

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Status: failed"
  echo "Reason: remote 'upstream' is not configured"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "${CURRENT_BRANCH}" ]]; then
  CURRENT_BRANCH="DETACHED_HEAD"
fi

WORKTREE_STATUS="clean"
if [[ -n "$(git status --porcelain)" ]]; then
  WORKTREE_STATUS="dirty"
fi

git fetch upstream --quiet

if ! git rev-parse --verify upstream/main >/dev/null 2>&1; then
  echo "Status: failed"
  echo "Current branch: ${CURRENT_BRANCH}"
  echo "Working tree: ${WORKTREE_STATUS}"
  echo "Reason: upstream/main does not exist"
  exit 1
fi

COUNTS="$(git rev-list --left-right --count HEAD...upstream/main)"
BEHIND_COUNT="$(awk '{print $2}' <<<"${COUNTS}")"
AHEAD_COUNT="$(awk '{print $1}' <<<"${COUNTS}")"

UPSTREAM_COMMITS="$(git log --oneline --no-decorate HEAD..upstream/main | head -n 20 || true)"
LOCAL_COMMITS="$(git log --oneline --no-decorate upstream/main..HEAD | head -n 20 || true)"
DIFF_STAT="$(git diff --stat upstream/main...HEAD || true)"

TMP_DIR="$(mktemp -d)"
WORKTREE_ADDED=0
MERGE_ABORT_NEEDED=0

cleanup() {
  if [[ "${MERGE_ABORT_NEEDED}" -eq 1 ]]; then
    git -C "${TMP_DIR}" merge --abort >/dev/null 2>&1 || true
  fi
  if [[ "${WORKTREE_ADDED}" -eq 1 ]]; then
    git worktree remove --force "${TMP_DIR}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

git worktree add --quiet --detach "${TMP_DIR}" HEAD
WORKTREE_ADDED=1

MERGE_OUTPUT_FILE="${TMP_DIR}/merge-output.txt"
MERGE_STATUS="clean"
CONFLICT_FILES=""

set +e
git -C "${TMP_DIR}" merge --no-commit --no-ff upstream/main >"${MERGE_OUTPUT_FILE}" 2>&1
MERGE_EXIT=$?
set -e

if [[ ${MERGE_EXIT} -eq 0 ]]; then
  MERGE_ABORT_NEEDED=1
elif git -C "${TMP_DIR}" diff --name-only --diff-filter=U | grep -q .; then
  MERGE_STATUS="conflicts"
  CONFLICT_FILES="$(git -C "${TMP_DIR}" diff --name-only --diff-filter=U)"
  MERGE_ABORT_NEEDED=1
else
  MERGE_STATUS="error"
fi

echo "Status: ok"
echo "Current branch: ${CURRENT_BRANCH}"
echo "Working tree: ${WORKTREE_STATUS}"
echo "Upstream ahead: ${BEHIND_COUNT}"
echo "Branch ahead: ${AHEAD_COUNT}"

if [[ "${MERGE_STATUS}" == "clean" ]]; then
  echo "Dry-run merge result: clean"
elif [[ "${MERGE_STATUS}" == "conflicts" ]]; then
  echo "Dry-run merge result: conflicts"
else
  echo "Dry-run merge result: error"
fi

echo
echo "Upstream commits not in HEAD:"
if [[ -n "${UPSTREAM_COMMITS}" ]]; then
  echo "${UPSTREAM_COMMITS}"
else
  echo "(none)"
fi

echo
echo "Local commits not in upstream/main:"
if [[ -n "${LOCAL_COMMITS}" ]]; then
  echo "${LOCAL_COMMITS}"
else
  echo "(none)"
fi

echo
echo "Diff stat:"
if [[ -n "${DIFF_STAT}" ]]; then
  echo "${DIFF_STAT}"
else
  echo "(no diff)"
fi

if [[ "${MERGE_STATUS}" == "conflicts" ]]; then
  echo
  echo "Conflict files:"
  echo "${CONFLICT_FILES}"
elif [[ "${MERGE_STATUS}" == "error" ]]; then
  echo
  echo "Merge command output:"
  cat "${MERGE_OUTPUT_FILE}"
fi

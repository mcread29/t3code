---
name: upstream-merge-check
description: Check whether the current branch is behind its upstream parent repository, fetch upstream, dry-run a merge of upstream/main into the current branch, and report whether it would merge cleanly or which files would conflict. Use this for fork maintenance, upstream sync checks, merge conflict previews, or when a user asks whether upstream can be merged safely without actually merging.
---

# Upstream Merge Check

Use this skill when the user wants a non-destructive upstream sync check for the current repository.

## Workflow

1. Run `scripts/check_upstream_merge.sh` from this skill directory.
2. Relay the script output concisely to the user.
3. If the script reports a dirty working tree, note that the merge simulation was still run safely against `HEAD` in a temporary worktree.
4. If `upstream` or `upstream/main` is missing, report that clearly and stop.

## Constraints

- Do not perform a real merge.
- Do not leave the repository in a conflicted state.
- Do not use destructive cleanup on the user's main working tree.
- Prefer the script over ad hoc git command sequences so the behavior stays predictable.

## Output Expectations

Report:

- Current branch
- Working tree status
- Ahead/behind counts versus `upstream/main`
- Whether the dry-run merge would apply cleanly
- Conflict files, if any
- Short notable observations from the diff/stat and commit lists

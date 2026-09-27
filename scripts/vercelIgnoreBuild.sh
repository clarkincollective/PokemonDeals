#!/usr/bin/env bash
# Vercel `ignoreCommand` (vercel.json). Exit 0 = SKIP the build, exit 1 = BUILD.
#
# Measured 27 Sep 2026: 890 commits to main in 30 days, one production build per
# pushed commit, and 255 of them (29%) changed nothing the build consumes -
# docs/, tests/, scripts/, supabase/, .github/, Markdown. Each still cost a full
# `next build` (Build CPU minutes) and stored another function bundle (Function
# Storage). This skips those.
#
# FAIL OPEN. Any doubt - no previous SHA, shallow clone without it, git error,
# an empty diff we cannot explain - builds. A wrongly skipped production deploy
# is the expensive mistake; a wasted build is a cheap one.
#
# The comparison base is the previously DEPLOYED commit (VERCEL_GIT_PREVIOUS_SHA),
# not HEAD^, so a push of several commits is judged as a whole: if any commit in
# the range touched build input, the build runs.
set -u

# 28 Sep 2026: deployments are built on the owner's PC and uploaded prebuilt
# (scripts/deploy/deployFromPc.mjs, every 5 minutes), so Vercel bills no
# build minutes. While the marker file exists, Vercel's own Git-triggered
# build is always skipped. Delete `.pc-deploys` (and commit) to go back to
# Vercel building each push.
if [ -f ".pc-deploys" ]; then
  echo "ignoreCommand: deployments are built on the owner's PC (.pc-deploys present) - skipping Vercel build"
  exit 0
fi

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  # No usable previous SHA (first deploy, or not in the shallow clone): fall back
  # to the parent of HEAD only when there is exactly one new commit to judge.
  if [ -n "$base" ]; then
    echo "ignoreCommand: previous SHA $base not in clone - building"
    exit 1
  fi
  base="HEAD^"
  git cat-file -e "$base^{commit}" 2>/dev/null || { echo "ignoreCommand: no base commit - building"; exit 1; }
fi

changed="$(git diff --name-only "$base" HEAD 2>/dev/null)" || { echo "ignoreCommand: git diff failed - building"; exit 1; }
if [ -z "$changed" ]; then
  echo "ignoreCommand: empty diff against $base - building"
  exit 1
fi

# Paths the production build never reads. Everything else builds.
# NOTE scripts/ is skipped as a whole: nothing under app/ or lib/ imports from
# it (the ops scripts import FROM lib/, not the other way round).
skip_re='^(docs/|tests/|scripts/|supabase/|\.github/|\.local/|tmp/|[^/]+\.md$|.*/[^/]+\.md$|\.gitignore$|\.gitattributes$|\.editorconfig$|LICENSE$)'
build_needed=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! [[ "$f" =~ $skip_re ]]; then
    build_needed="$f"
    break
  fi
done <<< "$changed"

if [ -n "$build_needed" ]; then
  echo "ignoreCommand: $build_needed changed - building"
  exit 1
fi

echo "ignoreCommand: only non-build paths changed since $base - skipping build"
echo "$changed" | sed 's/^/  /'
exit 0

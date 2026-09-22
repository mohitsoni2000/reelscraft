#!/usr/bin/env bash
# Runs ON the Hostinger account (over SSH), fed to `bash -s` by .github/workflows/deploy.yml:
#
#   ssh -p 65002 user@host "DOCROOT=domains/example.com/public_html bash -s -- activate <sha>" < deploy/release.sh
#
# Commands
#   activate <sha>   copy ~/releases/<sha>/ into the docroot and record it as the current release
#   rollback         re-activate the release that was live before the current one
#   prune            keep the newest $KEEP releases (the current and previous one are never deleted)
#   status           show current / previous / stored releases
#
# Environment
#   DOCROOT       web root, relative to $HOME or absolute (required for activate/rollback), e.g. domains/example.com/public_html
#   RELEASES_DIR  default $HOME/releases
#   KEEP          releases to keep, default 5
#   TAKEOVER=1    also wipe files in the docroot that no release ever put there (see Safety)
#
# Safety: the docroot must be a directory inside $HOME (never $HOME itself). Deploys copy files in and
# then remove ONLY the files the previous release contained and the new one does not, so anything else
# in the docroot (other sites, subdomain folders, files uploaded by hand) is never touched, even if
# DOCROOT points at the wrong folder. .well-known/ (SSL validation) is never touched. TAKEOVER=1 is the
# explicit opt-in to a full mirror (rsync --delete-after, capped by --max-delete).
set -euo pipefail

RELEASES_DIR="${RELEASES_DIR:-$HOME/releases}"
KEEP="${KEEP:-5}"

die() { echo "release.sh: $*" >&2; exit 1; }
say() { echo "release.sh: $*"; }

# Prints the canonical docroot. This path is later used with `rsync --delete`, so it is validated
# on canonical paths (pwd -P), not on the raw string: "." or "./" or a symlink must not slip through.
docroot() {
  [ -n "${DOCROOT:-}" ] || die "DOCROOT is not set (repository variable HOSTINGER_DOCROOT)"
  local dir="$DOCROOT" home releases inside
  case "$dir" in
    /*) ;;
    *) dir="$HOME/$dir" ;;
  esac
  case "$dir" in *..*) die "DOCROOT must not contain '..'" ;; esac
  dir="$(cd "$dir" 2>/dev/null && pwd -P)" || die "DOCROOT '$DOCROOT' is not a directory (check HOSTINGER_DOCROOT)"
  home="$(cd "$HOME" && pwd -P)"

  case "$dir" in "$home"/?*) ;; *) die "DOCROOT must be a sub-directory of $home, not $home itself (got $dir)" ;; esac
  inside="${dir#"$home"/}"
  case "/$inside" in */.*) die "DOCROOT must not be or contain a dot-directory such as .ssh (got $dir)" ;; esac

  mkdir -p "$RELEASES_DIR"
  releases="$(cd "$RELEASES_DIR" && pwd -P)"
  case "$dir/" in "$releases"/*) die "DOCROOT must not be inside the releases directory" ;; esac
  case "$releases/" in "$dir"/*) die "DOCROOT ($dir) must not contain the releases directory ($releases)" ;; esac
  printf '%s\n' "$dir"
}

valid_sha() { printf '%s' "$1" | grep -Eq '^[0-9a-f]{7,40}$'; }

read_marker() { [ -f "$RELEASES_DIR/$1" ] && cat "$RELEASES_DIR/$1" || true; }

# Removes what a release left behind: files (then empty directories) that the OLD release contained
# and the NEW one does not. Never looks at anything else in the docroot.
remove_stale() {
  local old="$1" release="$2" target="$3" oldpath="$RELEASES_DIR/$1" f d
  [ -n "$old" ] || return 0
  [ -d "$oldpath" ] || { say "previous release $old is no longer stored: nothing to clean up"; return 0; }
  while IFS= read -r f; do
    case "$f" in ./.well-known/*) continue ;; esac
    rm -f -- "$target/${f#./}"
  done < <(comm -23 <(cd "$oldpath" && find . -type f | sort) <(cd "$release" && find . -type f | sort))
  while IFS= read -r d; do
    rmdir -- "$target/${d#./}" 2>/dev/null || true
  done < <(cd "$oldpath" && find . -mindepth 1 -type d | sort -r)
}

sync_release() {
  local sha="$1" target="$2" old="${3:-}" release="$RELEASES_DIR/$1"
  [ -d "$release" ] || die "release $sha not found in $RELEASES_DIR"
  [ -f "$release/index.html" ] || die "release $sha is incomplete: no index.html"
  [ -f "$release/.htaccess" ] || die "release $sha is incomplete: no .htaccess (dotfiles lost while uploading?)"

  # The web server must be able to read everything: normalise modes on our own copy, rsync -a carries them over.
  find "$release" -type d -exec chmod 755 {} +
  find "$release" -type f -exec chmod 644 {} +

  # Phase 1, additive: new hashed assets land before the HTML that references them.
  local dir
  for dir in _next img og; do
    if [ -d "$release/$dir" ]; then
      mkdir -p "$target/$dir"
      rsync -a "$release/$dir/" "$target/$dir/"
    fi
  done

  # Phase 2: everything. .well-known/ is excluded from transfer and deletion.
  if [ "${TAKEOVER:-0}" = "1" ]; then
    say "TAKEOVER=1: mirroring the release into $target (deleting everything else, at most 500 files)"
    rsync -a --delete-after --max-delete=500 --exclude='.well-known/' "$release/" "$target/"
  else
    rsync -a --exclude='.well-known/' "$release/" "$target/"
    remove_stale "$old" "$release" "$target"
  fi
}

activate() {
  local sha="${1:-}"
  valid_sha "$sha" || die "usage: activate <git-sha> (7-40 hex characters)"
  local target current
  target="$(docroot)"
  current="$(read_marker .current)"
  sync_release "$sha" "$target" "$current"
  if [ -n "$current" ] && [ "$current" != "$sha" ]; then
    printf '%s\n' "$current" > "$RELEASES_DIR/.previous"
  fi
  printf '%s\n' "$sha" > "$RELEASES_DIR/.current"
  say "activated $sha in $target (previous: ${current:-none})"
  prune
}

rollback() {
  local target current previous
  target="$(docroot)"
  current="$(read_marker .current)"
  previous="$(read_marker .previous)"
  [ -n "$previous" ] || die "no previous release recorded: this was the first deploy, nothing to roll back to"
  valid_sha "$previous" || die "corrupt .previous marker"
  sync_release "$previous" "$target" "$current"
  printf '%s\n' "$previous" > "$RELEASES_DIR/.current"
  [ -z "$current" ] || printf '%s\n' "$current" > "$RELEASES_DIR/.previous"
  say "rolled back to $previous in $target (was: ${current:-unknown})"
}

prune() {
  [ -d "$RELEASES_DIR" ] || return 0
  local protected name
  protected=" $(read_marker .current) $(read_marker .previous) "
  # newest first; skip the first $KEEP; never touch the protected ones
  ls -1t "$RELEASES_DIR" | grep -E '^[0-9a-f]{7,40}$' | tail -n +"$((KEEP + 1))" | while read -r name; do
    case "$protected" in *" $name "*) continue ;; esac
    rm -rf -- "${RELEASES_DIR:?}/$name"
    say "pruned old release $name"
  done
}

status() {
  say "current : $(read_marker .current)"
  say "previous: $(read_marker .previous)"
  say "stored  :"
  ls -1t "$RELEASES_DIR" 2>/dev/null | grep -E '^[0-9a-f]{7,40}$' | sed 's/^/           /' || true
}

case "${1:-}" in
  activate) shift; activate "${1:-}" ;;
  rollback) rollback ;;
  prune) prune ;;
  status) status ;;
  *) die "usage: DOCROOT=... bash release.sh activate <sha> | rollback | prune | status" ;;
esac

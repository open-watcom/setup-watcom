#!/usr/bin/env python
import argparse
import logging
import os
import pathlib
import pygit2
import subprocess
import shutil

ROOT = pathlib.Path(__file__).resolve().parent
DIST_PATH = ROOT / "dist"

VALID_VERSION_SERIES = ("v0", )
RELEASE_FILES = [
  "README.md",
  "LICENSE",
  "action.yml",
  "packed/index.js",
]


def main():
  parser = argparse.ArgumentParser(allow_abbrev=False)
  parser.add_argument("version", help="Create new release for this version series", choices=VALID_VERSION_SERIES)
  parser.set_defaults(log_level=logging.WARNING)
  log_group = parser.add_mutually_exclusive_group()
  log_group.add_argument("--verbose", const=logging.INFO, dest="log_level", action="store_const")
  log_group.add_argument("--debug", const=logging.DEBUG, dest="log_level", action="store_const")
  args = parser.parse_args()
  logging.basicConfig(level=args.log_level)

  build_branch = f"{args.version}-build"

  logging.debug(f"ROOT={ROOT}")
  logging.debug(f"DIST_PATH={DIST_PATH}")

  repo = pygit2.Repository(ROOT)

  modified_files = []
  for file, file_status in repo.status().items():
    if not file_status & pygit2.GIT_STATUS_IGNORED:
      modified_files.append(file)
  if modified_files:
    raise RuntimeError(f"The following files are dirty: {modified_files}")
    return 1

  commit_hash = repo.head.target.hex
  remote_origin = repo.remotes["origin"]
  origin_url = remote_origin.url
  user_name = repo.config.get_multivar("user.name").next()
  user_email = repo.config.get_multivar("user.email").next()
  logging.debug(f"commit hash {commit_hash}")
  logging.debug(f"remote url: {origin_url}")
  logging.debug(f"user name: {user_name}")
  logging.debug(f"user email: {user_email}")

  logging.info("Removing dist folder")
  try:
    shutil.rmtree(DIST_PATH)
  except FileNotFoundError:
    logging.debug("The dist folder was already removed")
    pass

  DIST_PATH.mkdir()
  subprocess.check_call(["git", "clone", "-b", build_branch, "--depth", "2", "--", origin_url, "."], cwd=DIST_PATH)
  new_repo = pygit2.Repository(DIST_PATH)
  new_repo.config.set_multivar("user.name", ".*", user_name)
  new_repo.config.set_multivar("user.email", ".*", user_email)
  for item in new_repo.revparse_single("HEAD").tree:
    if os.path.isdir(item.name):
      shutil.rmtree(os.path.join(DIST_PATH, os.item.name))
    else:
      os.unlink(os.path.join(DIST_PATH, item.name))
  for item in RELEASE_FILES:
    shutil.copy(ROOT / item, os.path.join(DIST_PATH, pathlib.Path(item).name))
  idx = new_repo.index
  idx.add_all()
  idx.write()
  new_tree = idx.write_tree()
  new_parent, new_ref = new_repo.resolve_refish(refish=new_repo.head.name)
  new_repo.create_commit(new_ref.name, new_repo.default_signature, new_repo.default_signature, f"{commit_hash} for {args.version}", new_tree, [new_parent.oid])

  logging.debug("Removing local %s tag", args.version)
  subprocess.call(["git", "tag", "-d", args.version], cwd=DIST_PATH)

  logging.debug("Removing %s tag from origin", args.version)
  subprocess.check_call(["git", "push", "origin", f":{args.version}"], cwd=DIST_PATH)

  logging.debug("Creating local %s tag", args.version)
  subprocess.check_call(["git", "tag", args.version], cwd=DIST_PATH)

  logging.debug("Pushing commits to origin")
  subprocess.check_call(["git", "push", "origin", build_branch], cwd=DIST_PATH)

  logging.debug("Pushing tag to origin")
  subprocess.check_call(["git", "push", "origin", args.version], cwd=DIST_PATH)


if __name__ == "__main__":
  raise SystemExit(main())

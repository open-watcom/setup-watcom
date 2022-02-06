#!/usr/bin/env python
import argparse
import logging
import os
import pathlib
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

  subprocess.check_call(["git", "diff", "--exit-code"], stdout=subprocess.DEVNULL)

  commit_hash = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
  origin_url = subprocess.check_output(["git", "remote", "get-url", "origin"], text=True).strip()

  logging.info("Removing dist folder")
  try:
    shutil.rmtree(DIST_PATH)
  except FileNotFoundError:
    logging.debug("The dist folder was already removed")
    pass

  logging.debug("Creating dist folder")
  DIST_PATH.mkdir()

  logging.debug("Cloning repo into dist folder")
  subprocess.check_call(["git", "clone", "-b", build_branch, "--depth", "2", "--", origin_url, "."], cwd=DIST_PATH)

  logging.debug("Configure user and email")
  subprocess.check_call(["git", "config", "user.name", "Watcom Release Script"], cwd=DIST_PATH)
  subprocess.check_call(["git", "config", "user.email", "Watcom-Release-Script@example.com"], cwd=DIST_PATH)

  logging.debug("Removing all files from previous releases")
  for item in DIST_PATH.iterdir():
    if item.name == ".git":
      continue
    if item.is_dir():
      shutil.rmtree(DIST_PATH / item)
    else:
      os.unlink(os.path.join(DIST_PATH, item.name))

  logging.debug("Copying file for new release")
  for item in RELEASE_FILES:
    shutil.copy(ROOT / item, os.path.join(DIST_PATH, pathlib.Path(item).name))

  logging.debug("Creating new commit")
  subprocess.check_call(["git", "add", *[pathlib.Path(file).name for file in RELEASE_FILES]], cwd=DIST_PATH)
  subprocess.check_call(["git", "commit", "-m", f"{commit_hash} for {args.version}"], cwd=DIST_PATH)

  logging.debug("Removing local %s tag", args.version)
  subprocess.call(["git", "tag", "-d", args.version], cwd=DIST_PATH)

  logging.debug("Creating local %s tag", args.version)
  subprocess.check_call(["git", "tag", args.version], cwd=DIST_PATH)

  logging.debug("Pushing commits to origin")
  subprocess.check_call(["git", "push", "origin", build_branch], cwd=DIST_PATH)

  logging.debug("Force pushing tag to origin")
  subprocess.check_call(["git", "push", "origin", "-f", args.version], cwd=DIST_PATH)

  print(f"Release {args.version} created!")


if __name__ == "__main__":
  raise SystemExit(main())

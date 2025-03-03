#!/usr/bin/env python
import argparse
import logging
import os
import pathlib
from re import L
import subprocess
import shutil
import tempfile
import tarfile

ROOT = pathlib.Path(__file__).resolve().parent

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

  # subprocess.check_call(["git", "diff", "--exit-code"], stdout=subprocess.DEVNULL)

  logging.debug("Determining current branch")
  current_branch = subprocess.check_output(["git", "branch", "--show-current"], text=True, cwd=ROOT).strip()
  logging.info(f"Current branch=%s", current_branch)

  logging.debug("Determining current git hash")
  commit_hash = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, cwd=ROOT).strip()
  logging.info(f"Current git hash=%s", commit_hash)

  with tempfile.NamedTemporaryFile() as tar_tmp:
    tar_tmp.close()

    logging.debug("Creating a TAR with all release files")
    with tarfile.open(tar_tmp.name, mode="w:gz") as f:
      for release_file in RELEASE_FILES:
        tarinfo = f.gettarinfo(release_file)
        tarinfo.name = os.path.basename(release_file)
        f.addfile(tarinfo, open(release_file, "rb"))
      f.close()

    logging.debug("Checking out %s", build_branch)
    subprocess.check_call(["git", "checkout", build_branch], cwd=ROOT)

    logging.debug("Removing all files from previous releases")
    for item in ROOT.iterdir():
      if item.name == ".git":
        continue
      if item.is_dir():
        shutil.rmtree(ROOT / item)
      else:
        os.unlink(os.path.join(ROOT, item.name))

    with tarfile.open(tar_tmp.name, mode="r") as f:
      def is_within_directory(directory, target):
          
          abs_directory = os.path.abspath(directory)
          abs_target = os.path.abspath(target)
      
          prefix = os.path.commonprefix([abs_directory, abs_target])
          
          return prefix == abs_directory
      
      def safe_extract(tar, path=".", members=None, *, numeric_owner=False):
      
          for member in tar.getmembers():
              member_path = os.path.join(path, member.name)
              if not is_within_directory(path, member_path):
                  raise Exception("Attempted Path Traversal in Tar File")
      
          tar.extractall(path, members, numeric_owner=numeric_owner) 
          
      
      safe_extract(f)

  logging.debug("Creating new commit")
  subprocess.check_call(["git", "add", *[pathlib.Path(file).name for file in RELEASE_FILES]], cwd=ROOT)
  subprocess.check_call(["git", "commit", "--allow-empty", "-m", f"{commit_hash} for {args.version}"], cwd=ROOT)

  logging.debug("Removing local %s tag", args.version)
  subprocess.call(["git", "tag", "-d", args.version], cwd=ROOT)

  logging.debug("Creating local %s tag", args.version)
  subprocess.check_call(["git", "tag", args.version], cwd=ROOT)

  logging.debug("Pushing commits to origin")
  subprocess.check_call(["git", "push", "origin", build_branch], cwd=ROOT)

  logging.debug("Force pushing tag to origin")
  subprocess.check_call(["git", "push", "origin", "-f", args.version], cwd=ROOT)

  logging.debug("Moving back to %s", current_branch)
  subprocess.check_call(["git", "checkout", current_branch], cwd=ROOT)

  print(f"Release {args.version} created!")

if __name__ == "__main__":
  raise SystemExit(main())

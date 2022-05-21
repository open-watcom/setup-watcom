import { ArchiveType, ISetupWatcomSettings } from "./interface";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";

function getInputs(): ISetupWatcomSettings {
  let p_version = core.getInput("version");
  const version_allowed = ["1.8", "1.9", "2.0", "2.0-64"];

  if (!version_allowed.includes(p_version.toLowerCase())) {
    throw new Error(
      `"version" needs to be one of ${version_allowed.join(
        ", "
      )}, got ${p_version}`
    );
  }

  let p_url: string;
  let p_needs_chmod = false;
  let p_archive_type: ArchiveType;

  let tag_default: string;
  if (p_version == "2.0" || p_version == "2.0-64") {
    tag_default = "current";
    let tag = core.getInput("tag");
    if (!tag) {
      tag = tag_default;
    }
    const tag_aliases: { [v: string]: string } = {
      current: "Current-build",
      last: "Last-CI-build",
    };
    if (tag in tag_aliases) {
      tag = tag_aliases[tag];
    }
    p_url =
      `https://github.com/open-watcom/open-watcom-v2/releases/download/${tag}/ow-snapshot.tar.xz`;
      p_archive_type = "tar";
  } else if (p_version == "1.9") {
    p_url = `https://github.com/open-watcom/open-watcom-1.9/releases/download/ow1.9/open-watcom-c-linux-1.9`;
    p_needs_chmod = true;
    p_archive_type = "exe";
  } else if (p_version == "1.8") {
    p_url = `https://github.com/open-watcom/open-watcom-1.9/releases/download/ow1.8/open-watcom-c-linux-1.8`;
    p_needs_chmod = true;
    p_archive_type = "exe";
  } else {
    throw new Error("Unsupported version");
  }

  let default_location: string;
  let p_path_subdir: string;
  if (process.platform === "win32") {
    default_location = "C:\\watcom";
    if (p_version == "2.0-64") {
      p_path_subdir = "binnt64";
    } else {
      p_path_subdir = "binnt";
    }
  } else if (process.platform === "darwin") {
    throw new Error("Unsupported platform");
  } else {
    default_location = "/opt/watcom";
    if (p_version == "2.0-64") {
      p_path_subdir = "binl64";
    } else {
      p_path_subdir = "binl";
    }
  }

  let p_location = core.getInput("location");
  if (!p_location) {
    p_location = default_location;
  }

  let p_environment = core.getBooleanInput("environment");

  return {
    version: p_version,
    url: p_url,
    archive_type: p_archive_type,
    location: p_location,
    environment: p_environment,
    path_subdir: p_path_subdir,
    needs_chmod: p_needs_chmod,
  };
}

async function run(): Promise<void> {
  try {
    core.startGroup("Initializing action.");
    const settings = getInputs();
    core.info(`version: ${settings.version}`);
    core.info(`url: ${settings.url}`);
    core.info(`location: ${settings.location}`);
    core.info(`environment: ${settings.environment}`);
    core.info(`path_subdir: ${settings.path_subdir}`);
    core.endGroup();

    core.startGroup(`Downloading ${settings.url}.`);
    const watcom_tar_path = await tc.downloadTool(settings.url);
    core.info(`Watcom archive downloaded to ${watcom_tar_path}.`);
    core.endGroup();

    core.startGroup(`Extracting to ${settings.location}.`)
    let watcom_path: fs.PathLike = "";
    if (settings.archive_type == "tar") {
      watcom_path = await tc.extractTar(watcom_tar_path, settings.location);
    } else if (settings.archive_type == "exe") {
      if (process.platform == "win32") {
        watcom_path = await tc.extractZip(watcom_tar_path, settings.location);
      } else {
        watcom_path = await tc.extractZip(watcom_tar_path, settings.location);
      }
    }
    core.info(`Archive extracted.`);
    core.endGroup();

    if (settings.needs_chmod && process.platform != "win32") {
      core.startGroup(`Fixing file mode bits`);
      child_process.exec("find . -regex \"./[a-z][a-z0-9]*\" -exec chmod a+x {} \\;", {cwd: path.join(watcom_path, settings.path_subdir)});
      core.endGroup();
    }

    if (settings.environment) {
      core.startGroup("Setting environment.");
      core.exportVariable("WATCOM", watcom_path);
      core.info(`Setted WATCOM=${watcom_path}`)
      let bin_path = path.join(watcom_path, settings.path_subdir);
      core.addPath(bin_path);
      core.info(`PATH appended with ${bin_path}.`);
      core.endGroup();
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();

import { ISetupWatcomSettings } from "./interface";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as io from "@actions/io";
import * as path from "path";
import * as fs from "fs";

function getInputs(): ISetupWatcomSettings {
  let p_version = core.getInput("version");
  const version_allowed = ["2.0"];

  if (!version_allowed.includes(p_version.toLowerCase())) {
    throw new Error(
      `"version" needs to be one of ${version_allowed.join(
        ", "
      )}, got ${p_version}`
    );
  }

  let p_tag: string;
  let p_url: string;

  let tag_default: string;
  if (p_version == "2.0") {
    tag_default = "current";
    p_tag = core.getInput("tag");
    if (!p_tag) {
      p_tag = tag_default;
    }
    const tag_aliases: { [v: string]: string } = {
      current: "Current-build",
      last: "Last-CI-build",
    };
    if (p_tag in tag_aliases) {
      p_tag = tag_aliases[p_tag];
    }
    p_url =
      `https://github.com/open-watcom/open-watcom-v2/releases/download/${p_tag}/ow-snapshot.tar.gz`;
  } else {
    throw new Error("Unsupported version");
  }

  let default_location: string;
  let p_path_subdir: string;
  if (process.platform === "win32") {
    default_location = "C:\\watcom";
    p_path_subdir = "binnt";
  } else if (process.platform === "darwin") {
    throw new Error("Unsupported platform");
  } else {
    default_location = "/opt/watcom";
    p_path_subdir = "binl";
  }

  let p_location = core.getInput("location");
  if (!p_location) {
    p_location = default_location;
  }

  let p_environment = core.getBooleanInput("environment");

  return {
    version: p_version,
    tag: p_tag,
    url: p_url,
    location: p_location,
    environment: p_environment,
    path_subdir: p_path_subdir,
  };
}

async function run(): Promise<void> {
  try {
    core.startGroup("Initializing action.");
    const settings = getInputs();
    core.info(`version: ${settings.version}`);
    core.info(`tag: ${settings.tag}`);
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
    const watcom_path = await tc.extractTar(watcom_tar_path, settings.location);
    core.info(`Archive extracted.`);
    core.endGroup();

    if (settings.environment) {
      core.startGroup("Settings environment");
      core.exportVariable("WATCOM", watcom_path);
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

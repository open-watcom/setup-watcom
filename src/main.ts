import { ArchiveType, ISetupWatcomSettings } from "./interface";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";
import * as exec from "@actions/exec";

function getInputs(): ISetupWatcomSettings {
  const p_version = core.getInput("version");
  const version_allowed = ["1.8", "1.9", "2.0", "2.0-64"];
  const p_target = core.getInput("target");
  const target_allowed = ["", "dos", "win", "nt", "os2", "os2-16", "linux"];

  if (!version_allowed.includes(p_version.toLowerCase())) {
    throw new Error(
      `"version" needs to be one of ${version_allowed.join(
        ", ",
      )}, got ${p_version}`,
    );
  }

  if (!target_allowed.includes(p_target.toLowerCase())) {
    throw new Error(
      `"target" needs to be one of ${target_allowed.join(
        ", ",
      )}, got ${p_target}`,
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
    } else {
      tag.replace(/ /g, "-");
    }
    const tag_aliases: { [v: string]: string } = {
      current: "Current-build",
      last: "Last-CI-build",
    };
    if (tag in tag_aliases) {
      tag = tag_aliases[tag];
    }
    p_url = `https://github.com/open-watcom/open-watcom-v2/releases/download/${tag}/ow-snapshot.tar`;
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

  let p_path_subdirs: string[];
  let p_inc_subdirs: string[];
  if (process.platform === "win32") {
    if (p_version == "2.0-64") {
      p_path_subdirs = ["BINNT64", "BINNT"];
    } else {
      p_path_subdirs = ["BINNT"];
    }
  } else if (process.platform === "darwin") {
    if (p_version !== "2.0-64") {
      throw new Error("Unsupported platform");
    }
    if (process.arch === 'arm64') {
      p_path_subdirs = ["armo64"];
    } else if (process.arch === 'x64') {
      p_path_subdirs = ["bino64"];
    } else {
      throw new Error("Unsupported platform");
    }
  } else {
    if (p_version == "2.0-64") {
      if (process.arch === 'arm64') {
        p_path_subdirs = ["arml64"];
      } else if (process.arch === 'x64') {
        p_path_subdirs = ["binl64", "binl"];
      } else {
        throw new Error("Unsupported platform");
      }
    } else {
      p_path_subdirs = ["binl"];
    }
  }
  if (process.platform === "win32") {
    switch (p_target) {
    case "dos":
      p_inc_subdirs = ["H"];
      break;
    case "win":
      p_inc_subdirs = ["H", "H\\WIN"];
      break;
    case "os2":
      p_inc_subdirs = ["H", "H\\OS2"];
      break;
    case "os2-16":
      p_inc_subdirs = ["H", "H\\OS21X"];
      break;
    case "linux":
      p_inc_subdirs = ["LH"];
      break;
    case "nt":
    default:
      p_inc_subdirs = ["H", "H\\NT", "H\\NT\\DIRECTX", "H\\NT\\DDK"];
    }
  } else {
    switch (p_target) {
    case "dos":
      p_inc_subdirs = ["h"];
      break;
    case "win":
      p_inc_subdirs = ["h", "h/win"];
      break;
    case "nt":
      p_inc_subdirs = ["h", "h/nt", "h/nt/directx", "h/nt/ddk"];
      break;
    case "os2":
      p_inc_subdirs = ["h", "h/os2"];
      break;
    case "os2-16":
      p_inc_subdirs = ["h", "h/os21x"];
      break;
    case "linux":
    default:
      p_inc_subdirs = ["lh"];
    }
  }

  let p_location = core.getInput("location");
  if (!p_location) {
    if (process.platform === "win32") {
      const home_path = process.env["USERPROFILE"] + "";
      p_location = path.join(home_path, "WATCOM");
    } else {
      const home_path = process.env["HOME"] + "";
      p_location = path.join(home_path, "watcom");
    }
  }

  const p_environment = core.getBooleanInput("environment");

  return {
    version: p_version,
    url: p_url,
    archive_type: p_archive_type,
    location: p_location,
    environment: p_environment,
    path_subdirs: p_path_subdirs,
    inc_subdirs: p_inc_subdirs,
    needs_chmod: p_needs_chmod,
  };
}

async function run(): Promise<void> {
  try {
    core.startGroup("Initializing action.");
    const originalPath = process.env["PATH"];
    const settings = getInputs();
    core.info(`version: ${settings.version}`);
    core.info(`url: ${settings.url}`);
    core.info(`location: ${settings.location}`);
    core.info(`environment: ${settings.environment}`);
    core.info(`path_subdirs: ${settings.path_subdirs}`);
    core.info(`inc_subdirs: ${settings.inc_subdirs}`);
    core.endGroup();
    if (settings.archive_type == "tar" && process.platform == "win32") {
      core.startGroup("Install GNU tar (MSYS).");
      process.env["PATH"] = `C:\\msys64\\usr\\bin;${originalPath}`;
      await exec.exec("pacman -S --noconfirm --needed tar");
      core.endGroup();
    }

    let watcom_tar_path: string;
    if (settings.archive_type == "tar") {
      try {
        core.startGroup(`Downloading ${settings.url}.xz.`);
        watcom_tar_path = await tc.downloadTool(`${settings.url}.xz`);
      } catch (error) {
        core.info("Downloading failed.");
        core.endGroup();
        core.startGroup(`Downloading ${settings.url}.gz.`);
        watcom_tar_path = await tc.downloadTool(`${settings.url}.gz`);
      }
    } else {
      core.startGroup(`Downloading ${settings.url}.`);
      watcom_tar_path = await tc.downloadTool(settings.url);
    }
    core.info(`Watcom archive downloaded to ${watcom_tar_path}.`);
    core.endGroup();

    core.startGroup(`Extracting to ${settings.location}.`);
    let watcom_path: fs.PathLike = "";
    if (settings.archive_type == "tar") {
      if (process.platform == "win32") {
        watcom_path = await tc.extractTar(watcom_tar_path, settings.location, [
          "x",
          "--exclude=wlink",
        ]);
      } else {
        watcom_path = await tc.extractTar(
          watcom_tar_path,
          settings.location,
          "x",
        );
      }
    } else if (settings.archive_type == "exe") {
      watcom_path = await tc.extractZip(watcom_tar_path, settings.location);
    }
    core.info(`Archive extracted.`);
    core.endGroup();

    if (
      settings.archive_type == "exe" &&
      settings.needs_chmod &&
      process.platform != "win32"
    ) {
      core.startGroup(`Fixing file mode bits`);
      for (var x of settings.path_subdirs) {
        child_process.exec(
          'find . -regex "./[a-z][a-z0-9]*" -exec chmod a+x {} \\;',
          { cwd: path.join(watcom_path, x) },
        );
      }
      core.endGroup();
    }
    if (settings.archive_type == "tar" && process.platform == "win32") {
      process.env["PATH"] = `${originalPath}`;
    }

    let tmpp = path.join(watcom_path, settings.path_subdirs[0]);
    core.info(`Check directory ${tmpp}.`);
    if (fs.existsSync(tmpp)) {
      if (settings.environment) {
        core.startGroup("Setting environment.");
        core.exportVariable("WATCOM", watcom_path);
        core.info(`Setted WATCOM=${watcom_path}`);
        const sep = (process.platform == "win32") ? ";" : ":";
        const additional_path = (process.platform == "win32") ? "BINW" : "binw";
        let bin_path = "";
        for (var x of settings.path_subdirs) {
          bin_path = bin_path + path.join(watcom_path, x) + sep;
        }
        bin_path = bin_path + path.join(watcom_path, additional_path);
        core.addPath(bin_path);
        const new_path = process.env["PATH"];
        core.info(`Setted PATH=${new_path}`);
        const originalInclude = process.env["INCLUDE"];
        let inc_path = "";
        for (var x of settings.inc_subdirs) {
          inc_path = inc_path + path.join(watcom_path, x) + sep;
        }
        if (originalInclude) {
          inc_path = inc_path + originalInclude;
        }
        core.exportVariable("INCLUDE", inc_path);
        core.info(`Setted INCLUDE=${inc_path}`);
        core.endGroup();
      }
    } else {
      throw new Error("OW image doesn't contain the required directory.");
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();

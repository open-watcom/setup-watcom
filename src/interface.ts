export type ArchiveType = "exe" | "tar";

export interface ISetupWatcomSettings {
  /**
   * The requested Open Watcom version
   */
  version: string;

  /**
   * The download url
   */
  url: string;

  /**
   * Archive type
   */
  archive_type: ArchiveType;

  /**
   * The destination path
   */
  location: string;

  /**
   * Set Open Watcom default environment variable (WATCOM + INCLUDE) and add
   * native binaries subdir to PATH
   */
  environment: boolean;

  /**
   * Watcom subdir containing the native binaries (for host OS)
   */
  path_subdirs: string[];

  /**
   * List of Watcom subdirs containing the default header files (for host OS)
   */
  inc_subdirs: string[];

  /**
   * Need mode bits fix-up
   */
  needs_chmod: boolean;
}

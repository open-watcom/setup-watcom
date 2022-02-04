export interface ISetupWatcomSettings {
  /**
   * The requested Open Watcom version
   */
  version: string;

  /**
   * The requested tag
   */
  tag: string;

  /**
   * The download url
   */
  url: string;

  /**
   * The destination path
   */
  location: string;

  /**
   * Set WATCOM environment variable + add to PATH
   */
  environment: boolean;

  /**
   * Watcom subdir containing the native binaries
   */
  path_subdir: string;
}

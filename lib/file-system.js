'use strict';

class FileSystem {
  /**
   * @name Watcher
   * @param {Object} options - configuration
   * @param {Array} options.volumes - array of container paths for docker volumes
   * @param {Boolean} options.autoClean - whether or not to delete files after every worker run. default true.
   */
  constructor(options = { volumes: [], autoClean: true }) {
    this.autoClean = options.autoClean;
    this.volumes = options.volumes;
  }

  clean() {
    if (this.autoClean) {
      const rms = this.volumes.concat(['/tmp']).map((volume) =>
        new Promise((resolve, reject) => {
          rmdir(volume, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      );
      return Promise.all(rms);
    } else {
      return Promise.resolve();
    }
  }

  init() {
    const chmods = this.volumes.map((volume) =>
      new Promise((resolve, reject) => {
        chmod(volume, 0o777, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    );

    await Promise.all(chmods);
  }

  static create(options) {
    return new FileSystem(options);
  }
}

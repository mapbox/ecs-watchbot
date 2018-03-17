'use strict';

const rmdir = require('fs').rmdir;
const chmod = require('fs').chmod;
const spawn = require('child_process').spawn;

class FileSystem {
  /**
   * @name Watcher
   * @param {Object} options - configuration
   * @param {Array} options.volumes - array of container paths for docker volumes
   * @param {Boolean} options.autoClean - whether or not to delete files after every worker run. default true.
   */
  constructor(options = {}) {
    this.autoClean = options.autoClean || true;
    this.volumes = options.volumes || [];
    this.maxDiskSpace = options.maxDiskSpace || 5000000;
  }

  clean() {
    if (this.autoClean) {
      const rms = this.volumes.concat(['/tmp']).map((volume) =>
        new Promise((resolve, reject) =>
          rmdir(volume, (err) => {
            if (err) return reject(err);
            resolve();
          })
        )
      );
      return Promise.all(rms);
    } else {
      return Promise.resolve();
    }
  }

  checkDisk() {
    return new Promise((resolve, reject) => {
      let output = '';

      spawn('du', ['-s', '/'])
        .on('error', (err) => {
          reject(err)
        })
        .on('exit', (code, signal) => {
          const match = output.match(/(\d+)\s+\//);
          const size = Number(match[1]);

          if (size > this.maxDiskSpace) resolve('full');
          resolve();
        })
        .stdout.on('data', (data) => output.concat(data));
    });
  }

  async init() {
    const chmods = this.volumes.map((volume) =>
      new Promise((resolve, reject) => {
        chmod(volume, 0o777, (err) => {
          if (err) return reject(err);
          resolve();
        });
      })
    );

    return await Promise.all(chmods);
  }

  static create(options) {
    return new FileSystem(options);
  }
}

module.exports = FileSystem;

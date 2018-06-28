#!/usr/bin/env node

'use strict';

const fs = require('fs');
const cp = require('child_process');
const util = require('util');
const AWS = require('aws-sdk');
const exec = util.promisify(cp.exec);
const path = require('path');
const pkg = require(path.resolve(__dirname, '..'));

const uploadBundle = async () => {
  const s3 = new AWS.S3();
  const Bucket = 'watchbot-binaries';
  const prefix = ['linux', 'macosx', 'windows'];
  const pkgNames = {
    linux: 'watchbot-linux',
    macosx: 'watchbot-macos',
    windows: 'watchbot-win.exe'
  };

  console.log('Generating the binaries from ecs-watchbot');
  await exec('npm ci --production', { cwd: '.' });
  await exec('npm install -g pkg', { cwd: '.' });
  await exec('pkg .', { cwd: '.' });

  prefix.forEach(async (pre) => {
    console.log(`Uploaded bundle to s3://${Bucket}/${pre}/${pkg.version}/watchbot`);
    await s3.putObject({
      Bucket,
      Key: `${pre}/${pkg.version}/watchbot`,
      Body: fs.createReadStream(pkgNames[pre]),
      ACL: 'public-read'
    }).promise();
  });
  console.log('Fin.');
};


if (require.main === module) {
  uploadBundle()
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}

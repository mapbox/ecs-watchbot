#!/usr/bin/env node

'use strict';

const fs = require('fs');
const cp = require('child_process');
const util = require('util');
const AWS = require('aws-sdk');
const exec = util.promisify(cp.exec);

const uploadBundle = async () => {
  const s3 = new AWS.S3();
  const Bucket = 'watchbot-binaries';
  const prefix = ['linux', 'macosx', 'windows'];
  const pkgNames = {
    linux: 'watchbot-linux',
    macosx: 'watchbot-macos',
    windows: 'watchbot-win.exe'
  };
  const options = { cwd: '.' };
  console.log('Generating the binaries from ecs-watchbot');
  let dir = await exec('ls -a');
  console.log('ls only', dir.stdout);
  dir = await exec('ls -a ../');
  console.log('ls ../', dir.stdout);

  console.log('npm ci --production');
  await exec('npm ci --production', options);
  console.log('npm install -g pkg');
  await exec('npm install -g pkg', options);
  console.log('pkg .');
  await exec('pkg .', options);

  let sha = await exec('git rev-parse HEAD', options);
  sha = sha.stdout.trim();
  prefix.forEach(async (pre) => {
    console.log(`Uploading bundle to s3://${Bucket}/${pre}/${sha}/watchbot`);
    await s3.putObject({
      Bucket,
      Key: `${pre}/${sha}/watchbot`,
      Body: fs.createReadStream(pkgNames[pre]),
      ACL: 'public-read'
    }).promise();
  });

  let version;
  try {
    version = (await exec('git describe --tags --exact-match', options)).stdout.trim();
  } catch (err) {
    console.log(`No tag found for ${sha}. Not creating a tag specific watchbot binary on S3.`);
    version = false;
  }
  if (version) {
    console.log(`Tag ${version} found for ${sha}. Creating a tag specific watchbot binary in S3.`);
    prefix.forEach(async (pre) => {
      await s3.putObject({
        Bucket,
        Key: `${pre}/${version}/watchbot`,
        Body: fs.createReadStream(pkgNames[pre]),
        ACL: 'public-read'
      }).promise();
      console.log(`Uploaded bundle to s3://${Bucket}/${pre}/${version}/watchbot`);
    });
  }
  console.log('Fin.');
};

if (require.main === module) {
  uploadBundle()
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}

#!/usr/bin/env node

'use strict';

const fs = require('fs');
const cp = require('child_process');
const util = require('util');
const AWS = require('aws-sdk');
const exec = util.promisify(cp.exec);
const remoteGitTags = require('remote-git-tags');

const getTagForSha = (sha) => {
  return Promise((resolve, reject) => {
    remoteGitTags('github.com/mapbox/ecs-watchbot')
      .then((allTags) => {
        allTags.forEach((remoteSha, remoteTag) => {
          if (remoteSha === sha)
            resolve(remoteTag);
        });
      })
      .catch((err) => reject(err));
  });
};

const uploadBundle = async () => {
  const s3 = new AWS.S3();
  const Bucket = 'watchbot-binaries';
  const prefix = ['linux', 'macosx', 'windows'];
  const pkgNames = {
    linux: 'watchbot-linux',
    macosx: 'watchbot-macos',
    windows: 'watchbot-win.exe'
  };

  await exec('npm ci --production');
  await exec('npm install -g pkg');
  await exec('pkg .');
  const sha = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION;

  getTagForSha(sha)
    .then((tag) => {
      if (tag) {
        prefix.forEach(async (pre) => {
          console.log(`Uploading the package to s3://${Bucket}/${pre}/${tag}/watchbot`);
          await s3.putObject({
            Bucket,
            Key: `${pre}/${tag}/watchbot`,
            Body: fs.createReadStream(pkgNames[pre]),
            ACL: 'public-read'
          }).promise();
        });
      } else {
        console.log(`No tag found for ${process.env.CODEBUILD_RESOLVED_SOURCE_VERSION}`);
      }
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

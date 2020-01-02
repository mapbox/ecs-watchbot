#!/usr/bin/env node

'use strict';

const fs = require('fs');
const cp = require('child_process');
const util = require('util');
const AWS = require('aws-sdk');
const exec = util.promisify(cp.exec);
const wbg = { exec };

/*
 * getTagForSha
 * @param {string} sha - A gitsha
 * @return {string} tag - Returns a tag, if one exists for the gitsha
 */
const getTagForSha = async (sha) => {
  return Promise.resolve()
    .then(() => { return wbg.exec('git ls-remote --tags https://github.com/mapbox/ecs-watchbot');})
    .then((data) => data.stdout.split('\n'))
    .then((data) => new Promise((resolve, reject) => {
      if (data.stderr) reject(data.stderr); else resolve(data);
    }))
    .then((data) => new Promise((resolve) => {
      data.forEach((ref) => {
        ref = ref.split('\t');
        if (ref[0] !== sha) return;
        const tagRegex = /refs\/tags\/(v?[0-9.-]+)(\^\{(.*)\})*/;
        return resolve(tagRegex.exec(ref[1])[1]);
      });
      resolve(null);
    }));
};
wbg.getTagForSha = getTagForSha;

/*
 * uploadBundle - uploads watchbot binaries to S3
 */
const uploadBundle = async () => {
  const s3 = new AWS.S3();
  const Bucket = 'watchbot-binaries';

  let targets = [
    { prefix: 'linux', target: 'node10-linux', pkg: 'watchbot-linux' },
    { prefix: 'macosx', target: 'node10-macos', pkg: 'watchbot-macos' },
    { prefix: 'windows', target: 'node10-win', pkg: 'watchbot-win.exe' }
  ];

  if (process.argv[2] === 'alpine') {
    targets = [
      { prefix: 'alpine', target: 'node10-alpine', pkg: 'watchbot' }
    ];
  }

  await wbg.exec('npm ci --production');
  await wbg.exec('npm install -g pkg');
  await wbg.exec(`pkg --targets ${targets.map((t) => t.target).join(',')} .`);
  const sha = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION;

  const tag = await getTagForSha(sha);
  if (process.argv[2] === 'alpine' && tag) {
    const uploads = targets.map((target) => {
      console.log(`Uploading the package to s3://${Bucket}/${target.prefix}/${tag}/watchbot`);
      return s3.putObject({
        Bucket,
        Key: `${target.prefix}/${tag}/watchbot`,
        Body: fs.createReadStream(target.pkg),
        ACL: 'public-read'
      }).promise();
    });

    await Promise.all(uploads);
  } else {
    console.log(`No tag found for ${process.env.CODEBUILD_RESOLVED_SOURCE_VERSION}`);
  }
};
wbg.uploadBundle = uploadBundle;

if (require.main === module) {
  uploadBundle()
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}

module.exports = wbg;

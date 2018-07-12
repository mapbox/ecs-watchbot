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
  return new Promise(async (resolve, reject) => {
    const data = (await wbg.exec('git ls-remote --tags https://github.com/mapbox/ecs-watchbot')).stdout.split('\n');
    if (data.stderr) return reject(data.stderr);
    data.forEach((ref) => {
      ref = ref.split('\t');
      if (ref[0] !== sha) return;
      const tagRegex = /refs\/tags\/(v?[0-9.-]+)(\^\{(.*)\})*/;
      return resolve(tagRegex.exec(ref[1])[1]);
    });
    return resolve(null);
  });
};
wbg.getTagForSha = getTagForSha;

/*
 * uploadBundle - uploads watchbot binaries to S3
 */
const uploadBundle = async () => {
  const s3 = new AWS.S3();
  const Bucket = 'watchbot-binaries';

  const targets = [
    { prefix: 'linux', target: 'node8-linux', pkg: 'watchbot-linux' },
    { prefix: 'alpine', target: 'node8-alpine', pkg: 'watchbot-alpine' },
    { prefix: 'macosx', target: 'node8-macos', pkg: 'watchbot-macos' },
    { prefix: 'windows', target: 'node8-win', pkg: 'watchbot-win.exe' },
  ]

  await wbg.exec('npm ci --production');
  await wbg.exec('npm install -g pkg');
  await wbg.exec(`pkg --targets ${targets.map((t) => t.target).join(',')} .`);
  const sha = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION;

  const tag = await getTagForSha(sha);
  if (tag) {
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

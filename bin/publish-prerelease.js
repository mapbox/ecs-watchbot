#!/usr/bin/env node

'use strict';

const cp = require('child_process');
const util = require('util');
const AWS = require('aws-sdk');
const exec = util.promisify(cp.exec);
const wbg = { exec };

const main = async () => {
  console.log('Creating prerelease');
  const tag = await wbg.exec('npm version prerelease'); // create pre-release
  console.log(tag.stdout);

  console.log('Pushing tag to Github');
  const push = await wbg.exec('git push && git push --tags');
  console.log(push.stdout);

  const gitsha = await wbg.exec('git rev-parse HEAD');
  console.log(`Starting pipeline execution with gitsha=${gitsha.stdout}`);

  const cp = new AWS.CodePipeline({});
  // await cp.startPipelineExecution({
  //   name: 'watchbot-pipeline',
  //   sourceRevisions: [
  //     {
  //       actionName: 'Source', /* required */
  //       revisionType: 'COMMIT_ID', /* required */
  //       revisionValue: gitsha /* required */
  //     }
  //   ]
  // });
};

main();

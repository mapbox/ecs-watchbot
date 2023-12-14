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
  await wbg.exec('git push && git push --tags');

  const gitsha = await wbg.exec('git rev-parse HEAD');
  console.log(`Starting pipeline execution with gitsha=${gitsha.stdout}`);

  const pipelineName = 'watchbot-pipeline';
  const cp = new AWS.CodePipeline({ region: 'us-east-1' });
  const existingConfig = await cp.getPipeline({
    name: pipelineName
  }).promise();

  const branch = await wbg.exec('git rev-parse --abbrev-ref HEAD');
  const branchNameOverride = branch.stdout;

  // find the Source stage and get the actions
  const sourceAction = existingConfig.pipeline.stages[0].actions[0];
  await cp.updatePipeline({
    pipeline: {
      ...existingConfig.pipeline,
      name: pipelineName,
      stages: [
        ...existingConfig.pipeline.stages,
        {
          name: 'Source',
          actions: [{
            ...sourceAction,
            configuration: {
              ...sourceAction.configuration,
              BranchName: branchNameOverride
            }
          }]
        }
      ]
    }
  });

  await cp.startPipelineExecution({
    name: pipelineName,
    sourceRevisions: [
      {
        actionName: 'Github',
        revisionType: 'COMMIT_ID',
        revisionValue: gitsha.stdout
      }
    ]
  });
};

main();

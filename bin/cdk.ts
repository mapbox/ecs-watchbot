#!/usr/bin/env node
import 'source-map-support/register';
import { App, BootstraplessSynthesizer } from 'aws-cdk-lib';
import { BucketStack } from '../cdk/BucketStack';
import { PipelineStack } from '../cdk/PipelineStack';
import { isProduction, tryGetContext } from '../cdk/util';

const app = new App();

const tags = {
  Team: 'DataPlatform',
  ServiceOrganization: 'Platform',
  Classification: 'internal',
  Public: 'false'
};
const region: string = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const deploymentEnvironment = tryGetContext(app, 'deploymentEnvironment');
const account = tryGetContext(app, 'account');
const bucketName = isProduction(deploymentEnvironment)
  ? 'ecs-watchbot-binaries'
  : 'ecs-watchbot-binaries-stg';

const pipelineStackName = 'watchbot-pipeline';
new PipelineStack(app, 'Pipeline', {
  stackName: pipelineStackName,
  synthesizer: new BootstraplessSynthesizer({
    deployRoleArn: `arn:aws:iam::${account}:role/CdkDeployOperatorRole`,
    cloudFormationExecutionRoleArn: `arn:aws:iam::${account}:role/CdkExecOperatorRole`
  }),
  env: { account, region },
  tags: {
    ...tags,
    CloudFormationStackName: pipelineStackName,
    Production: isProduction(deploymentEnvironment).toString()
  },
  deploymentEnvironment,
  bucketName
});

const bucketStackName = 'watchbot-bucket';
new BucketStack(app, 'Bucket', {
  stackName: bucketStackName,
  synthesizer: new BootstraplessSynthesizer({
    deployRoleArn: `arn:aws:iam::${account}:role/CdkDeployOperatorRole`,
    cloudFormationExecutionRoleArn: `arn:aws:iam::${account}:role/CdkExecOperatorRole`
  }),
  env: { account, region },
  tags: {
    ...tags,
    CloudFormationStackName: bucketStackName,
    Production: isProduction(deploymentEnvironment).toString()
  },
  deploymentEnvironment,
  bucketName
});

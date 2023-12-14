#!/usr/bin/env node
import 'source-map-support/register';
import {
    App,
    BootstraplessSynthesizer,
    CliCredentialsStackSynthesizer,
} from "aws-cdk-lib";
import {BucketStack} from "../cdk/BucketStack";
import {PipelineStack} from "../cdk/PipelineStack";

const app = new App();

const isProduction = (env: string) => env === 'production';
const tags = {
    Team: 'DataPlatform',
    ServiceOrganization: 'Platform',
    Classification: 'internal',
    Public: 'false',
}
const region: string = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const deploymentEnvironment = app.node.tryGetContext('deploymentEnvironment');
const account = app.node.tryGetContext('account');
const bucketName = isProduction(deploymentEnvironment) ? 'ecs-watchbot-binaries' : 'ecs-watchbot-binaries-stg';

const pipelineStackName = 'watchbot-pipeline';
new PipelineStack(app, 'Pipeline', {
    stackName: pipelineStackName,
    synthesizer: new CliCredentialsStackSynthesizer({ // TODO give cdk roles codestar-connections:* actions
       fileAssetsBucketName: `cdk-assets-${account}-${region}`,
        bucketPrefix: `ecs-watchbot/${pipelineStackName}`,
       qualifier: 'operator'
    }),
    // synthesizer: new BootstraplessSynthesizer({
    //     cloudFormationExecutionRoleArn: process.env.AWS_CDK_EXEC_ROLE,
    //     deployRoleArn: process.env.AWS_CDK_DEPLOY_ROLE,
    // }),
    env: { account, region },
    tags: {
        ...tags,
        CloudFormationStackName: pipelineStackName,
        Production: isProduction(deploymentEnvironment).toString(),
    },
    deploymentEnvironment: deploymentEnvironment,
    bucketName,
});

const bucketStackName = 'watchbot-bucket';
new BucketStack(app, 'Bucket', {
    stackName: bucketStackName,
    synthesizer: new BootstraplessSynthesizer({
        cloudFormationExecutionRoleArn: process.env.AWS_CDK_EXEC_ROLE,
        deployRoleArn: process.env.AWS_CDK_DEPLOY_ROLE,
    }),
    env: { account, region },
    tags: {
        ...tags,
        CloudFormationStackName: bucketStackName,
        Production: isProduction(deploymentEnvironment).toString(),
    },
    deploymentEnvironment: deploymentEnvironment,
    bucketName,
});

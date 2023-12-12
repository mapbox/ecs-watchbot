#!/usr/bin/env node
import 'source-map-support/register';
import {Construct} from "constructs";
import {App, aws_codebuild, aws_codepipeline, aws_s3, SecretValue, Stack, StackProps} from "aws-cdk-lib";
import {CodePipelineSource} from "aws-cdk-lib/pipelines";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {CodeBuildAction, GitHubSourceAction, GitHubTrigger} from "aws-cdk-lib/aws-codepipeline-actions";
import {Artifact} from "aws-cdk-lib/aws-codepipeline";
import {BuildSpec} from "aws-cdk-lib/aws-codebuild";
import {MapboxDefaultSynthesizer, MapboxS3} from "@mapbox/mapbox-cdk-common";

const app = new App();

const input =  CodePipelineSource.connection('mapbox/ecs-watchbot', 'master', {
    connectionArn: 'arn:aws:codestar-connections:us-east-1:222222222222:connection/7d2469ff-514a-4e4f-9003-5ca4a43cdc41', // Created using the AWS console * });', TODO update
});

interface Props extends StackProps {
    deploymentEnvironment: string
    bucketName: string
}

class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const artifact = new Artifact('Source');
        new aws_codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: this.stackName,
            artifactBucket: Bucket.fromBucketName(this, 'Bucket', props.bucketName),
            stages: [{
                stageName: 'Source',
                actions: [
                    new GitHubSourceAction({
                        actionName: 'Github',
                        branch: 'master',
                        owner: 'mapbox',
                        repo: 'ecs-watchbot',
                        output: artifact,
                        oauthToken: SecretValue.secretsManager('code-pipeline-helper/access-token')
                    }),
                ]
            }, {
              stageName: 'Bundle',
              actions: [
                  new CodeBuildAction({
                      actionName: 'BundleGeneral',
                      input: artifact,
                      project: new aws_codebuild.PipelineProject(this, 'BundleGeneral', {
                          environment: {
                              buildImage: aws_codebuild.LinuxBuildImage.STANDARD_7_0
                          },
                          projectName: `${this.stackName}-bundle`,
                          buildSpec: BuildSpec.fromObject({
                              version: '0.2',
                              phases: {
                                  install: {
                                      'commands': [
                                          'npm ci --production'
                                      ]
                                  },
                                  build: {
                                      commands:[
                                          'node bin/watchbot-binary-generator',
                                      ],
                                  },
                              },
                          })
                      })
                  }),
                  new CodeBuildAction({
                      actionName: 'AlpineBundle',
                      input: artifact,
                      project: new aws_codebuild.PipelineProject(this, 'AlpineBundle', {
                          environment: {
                              buildImage: aws_codebuild.LinuxBuildImage.fromCodeBuildImageId('public.ecr.aws/docker/library/node:18-alpine')
                          },
                          projectName: `${this.stackName}-alpine-bundler`,
                          description: 'Builds watchbot binaries for alpine OS',
                          buildSpec: BuildSpec.fromObject({
                              version: '0.2',
                              phases: {
                                  install: {
                                      'commands': [
                                          'apk add git',
                                          'npm ci --production'
                                      ]
                                  },
                                  build: {
                                      commands:[
                                          'node bin/watchbot-binary-generator alpine',
                                      ],
                                  },
                              },
                          })
                      })
                  })
              ]
            }]
        })


    }
}

class BucketStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        new MapboxS3(this, 'Bucket', {
            bucketName: props.bucketName,
            blockPublicAccess: {
                blockPublicAcls: true,
                ignorePublicAcls: true,
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
            },
            accessLoggingBucketName: 'mapbox-logs' // TODO need to resolve this
        });

    }

}

const isProduction = (env: string) => env === 'production';
const tags = {
    Team: 'DataPlatform',
    ServiceOrganization: 'Platform',
    Classification: 'internal',
    Public: 'false',
}
const region: string = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const deploymentEnvironment = app.node.tryGetContext('deploymentEnvironment') || 'staging';
const account = isProduction(deploymentEnvironment) ? '721885411435'  : '353802256504';  // 353802256504=artifacts-stg 721885411435=artifacts-prod
const bucketName = isProduction(deploymentEnvironment) ? 'ecs-watchbot-binaries' : 'ecs-watchbot-binaries-stg';
(async () => {
    const pipelineStackName = 'watchbot-pipeline';
    new PipelineStack(app, 'Pipeline', {
        stackName: pipelineStackName,
        synthesizer: await new MapboxDefaultSynthesizer(account, region, pipelineStackName).synthesize(),
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
        synthesizer: await new MapboxDefaultSynthesizer(account, region, bucketStackName).synthesize(),
        env: { account, region },
        tags: {
            ...tags,
            CloudFormationStackName: bucketStackName,
            Production: isProduction(deploymentEnvironment).toString(),
        },
        deploymentEnvironment: deploymentEnvironment,
        bucketName,
    })
})()

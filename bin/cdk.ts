#!/usr/bin/env node
import 'source-map-support/register';
import {Construct} from "constructs";
import {App, aws_codebuild, aws_codepipeline, SecretValue, Stack, StackProps} from "aws-cdk-lib";
import {CodePipelineSource} from "aws-cdk-lib/pipelines";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {CodeBuildAction, GitHubSourceAction, GitHubTrigger} from "aws-cdk-lib/aws-codepipeline-actions";
import {Artifact} from "aws-cdk-lib/aws-codepipeline";
import {BuildSpec} from "aws-cdk-lib/aws-codebuild";
import {MapboxDefaultSynthesizer} from "@mapbox/mapbox-cdk-common";

const app = new App();

const TARGET_BUCKET = 'watchbot-binaries';

const input =  CodePipelineSource.connection('mapbox/ecs-watchbot', 'master', {
    connectionArn: 'arn:aws:codestar-connections:us-east-1:222222222222:connection/7d2469ff-514a-4e4f-9003-5ca4a43cdc41', // Created using the AWS console * });', TODO update
});

class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const artifact = new Artifact('Source');
        new aws_codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: this.stackName,
            artifactBucket: Bucket.fromBucketName(this, 'Bucket', TARGET_BUCKET),
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

const stackName = 'watchbot-pipeline';
const region: string = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const account = '353802256504';  // artifacts-stg // '721885411435' = artifacts-prod
(async () => new PipelineStack(app, 'Pipeline', {
    stackName,
    synthesizer: await new MapboxDefaultSynthesizer(account, region, stackName).synthesize(),
    env: {
        account,
        region,
    },
    tags: {
        Team: 'DataPlatform',
        ServiceOrganization: 'Platform',
        CloudFormationStackName: 'watchbot-pipeline',
        Classification: 'internal',
        Production: 'true',
        Public: 'false'
    }
}))()

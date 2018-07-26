'use strict';

const redent = require('redent');
const cf = require('@mapbox/cloudfriend');
const hookshot = require('@mapbox/hookshot');

const Parameters = {
  GitSha: { Type: 'String' }
};

const Resources = {
  BundlerLogs: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: cf.sub('/aws/codebuild/${AWS::StackName}-bundler'),
      RetentionInDays: 14
    }
  },
  BundlerRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: { Service: 'codebuild.amazonaws.com' }
          }
        ]
      },
      Policies: [
        {
          PolicyName: cf.sub('BundlerPolicy'),
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: 'logs:*',
                Resource: cf.getAtt('BundlerLogs', 'Arn')
              },
              {
                Effect: 'Allow',
                Action: [
                  's3:ListBucket',
                  's3:GetObject',
                  's3:PutObject',
                  's3:PutObjectAcl'
                ],
                Resource: [
                  cf.sub('arn:${AWS::Partition}:s3:::watchbot-binaries'),
                  cf.sub('arn:${AWS::Partition}:s3:::watchbot-binaries/*')
                ]
              }
            ]
          }
        }
      ]
    }
  },
  Bundler: {
    Type: 'AWS::CodeBuild::Project',
    Properties: {
      Name: cf.sub('${AWS::StackName}-bundler'),
      Description: 'Uploads code-pipeline-helper bundles',
      Artifacts: {
        Type: 'GITHUB'
      },
      Environment: {
        Type: 'LINUX_CONTAINER',
        ComputeType: 'BUILD_GENERAL1_SMALL',
        Image: 'aws/codebuild/nodejs:8.11.0'
      },
      ServiceRole: cf.getAtt('BundlerRole', 'Arn'),
      Source: {
        Type: 'GITHUB',
        Location: 'https://github.com/mapbox/ecs-watchbot',
        BuildSpec: cf.sub(
          redent(`
            version: 0.2
            phases:
              install:
                commands:
                  - echo \${GitSha}
                  - npm install -g npm@5.8.0
                  - npm ci --production
              build:
                commands:
                  - node bin/watchbot-binary-generator
        `))
      }
    }
  },
  CodeBuildTriggerFunction: {
    Type: 'AWS::Lambda::Function',
    Properties: {
      Code: {
        S3Bucket: cf.join(['mapbox-', cf.region]),
        S3Key: cf.join(['bundles/ecs-watchbot/', cf.ref('GitSha'), '.zip'])
      },
      FunctionName: cf.join([cf.stackName, '-code-build-trigger']),
      Handler: 'index.codeBuildTrigger',
      MemorySize: 256,
      Runtime: 'nodejs8.10',
      Timeout: 300,
      Role: cf.getAtt('CodeBuildTriggerRole', 'Arn')
    }
  },
  CodeBuildTriggerRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole'
          }
        ]
      },
      Policies: [
        {
          PolicyName: 'write-logs',
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: 'logs:*',
                Resource: 'arn:aws:logs:*'
              }
            ]
          }
        }
      ]
    }
  }
};
const webhook = hookshot.github('CodeBuildTriggerFunction');

module.exports = cf.merge({ Parameters, Resources }, webhook);

'use strict';

const redent = require('redent');
const cf = require('@mapbox/cloudfriend');

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
  AlpineBundlerLogs: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: cf.sub('/aws/codebuild/${AWS::StackName}-alpine-bundler'),
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
                Resource: [
                  cf.getAtt('BundlerLogs', 'Arn'),
                  cf.getAtt('AlpineBundlerLogs', 'Arn')
                ]
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
              },
              {
                Effect: 'Allow',
                Action: [
                  'secretsmanager:GetSecretValue'
                ],
                Resource: [
                  cf.arn('secretsmanager', 'secret:general/dockerhub/mapboxmachinereadonly/ecs-watchbot-ci/*')
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
      Description: 'Builds ',
      Artifacts: {
        Type: 'CODEPIPELINE'
      },
      Environment: {
        Type: 'LINUX_CONTAINER',
        ComputeType: 'BUILD_GENERAL1_SMALL',
        Image: 'aws/codebuild/standard:7.0'
      },
      ServiceRole: cf.getAtt('BundlerRole', 'Arn'),
      Source: {
        Type: 'CODEPIPELINE',
        BuildSpec: redent(`
          version: 0.2
          phases:
            install:
              runtime-versions:
                nodejs: 18
              commands:
                - npm ci --production
            build:
              commands:
                - node bin/watchbot-binary-generator
        `)
      }
    }
  },
  AlpineBundler: {
    Type: 'AWS::CodeBuild::Project',
    Properties: {
      Name: cf.sub('${AWS::StackName}-alpine-bundler'),
      Description: 'Builds watchbot binaries for alpine OS',
      Artifacts: {
        Type: 'CODEPIPELINE'
      },
      Environment: {
        Type: 'LINUX_CONTAINER',
        ComputeType: 'BUILD_GENERAL1_SMALL',
        Image: 'public.ecr.aws/docker/library/node:18-alpine',
        ImagePullCredentialsType: 'CODEBUILD'
      },
      ServiceRole: cf.getAtt('BundlerRole', 'Arn'),
      Source: {
        Type: 'CODEPIPELINE',
        BuildSpec: redent(`
          version: 0.2
          phases:
            install:
              runtime-versions:
                nodejs: 18
              commands:
                - apk add git
                - npm ci --production
            build:
              commands:
                - node bin/watchbot-binary-generator alpine
        `)
      }
    }
  },
  PipelineRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: { Service: 'codepipeline.amazonaws.com' }
          }
        ]
      },
      Policies: [
        {
          PolicyName: cf.sub('PipelinePolicy'),
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  's3:ListBucket',
                  's3:GetBucketVersioning',
                  's3:GetObject',
                  's3:GetObjectVersion',
                  's3:PutObject'
                ],
                Resource: [
                  cf.sub('arn:${AWS::Partition}:s3:::watchbot-binaries'),
                  cf.sub('arn:${AWS::Partition}:s3:::watchbot-binaries/*')
                ]
              },
              {
                Effect: 'Allow',
                Action: [
                  'codebuild:StartBuild',
                  'codebuild:BatchGetBuilds',
                  'iam:PassRole'
                ],
                Resource: '*'
              }
            ]
          }
        }
      ]
    }
  },
  PipelineWebhook: {
    Type: 'AWS::CodePipeline::Webhook',
    Properties: {
      AuthenticationConfiguration: {
        SecretToken: '{{resolve:secretsmanager:code-pipeline-helper/webhook-secret}}'
      },
      Name: cf.sub('${AWS::StackName}-webhook'),
      Authentication: 'GITHUB_HMAC',
      TargetPipeline: cf.ref('Pipeline'),
      TargetPipelineVersion: cf.getAtt('Pipeline', 'Version'),
      TargetAction: 'GitHub',
      Filters: [
        {
          JsonPath: '$.ref',
          MatchEquals: 'refs/heads/{Branch}'
        }
      ],
      RegisterWithThirdParty: true
    }
  },
  Pipeline: {
    Type: 'AWS::CodePipeline::Pipeline',
    Properties: {
      Name: cf.stackName,
      RoleArn: cf.getAtt('PipelineRole', 'Arn'),
      ArtifactStore: {
        Type: 'S3',
        Location: 'watchbot-binaries'
      },
      Stages: [
        {
          Name: 'Source',
          Actions: [
            {
              Name: 'GitHub',
              ActionTypeId: {
                Category: 'Source',
                Owner: 'ThirdParty',
                Version: '2',
                Provider: 'GitHub'
              },
              OutputArtifacts: [
                { Name: 'Source' }
              ],
              Configuration: {
                Owner: 'mapbox',
                Repo: 'ecs-watchbot',
                PollForSourceChanges: 'false',
                Branch: 'master',
                OAuthToken: '{{resolve:secretsmanager:code-pipeline-helper/access-token}}'
              }
            }
          ]
        },
        {
          Name: 'Bundle',
          Actions: [
            {
              Name: 'Bundle',
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
                Version: '1',
                Provider: 'CodeBuild'
              },
              InputArtifacts: [
                { Name: 'Source' }
              ],
              Configuration: {
                ProjectName: cf.ref('Bundler')
              }
            },
            {
              Name: 'AlpineBundle',
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
                Version: '1',
                Provider: 'CodeBuild'
              },
              InputArtifacts: [
                { Name: 'Source' }
              ],
              Configuration: {
                ProjectName: cf.ref('AlpineBundler')
              }
            }
          ]
        }
      ]
    }
  }
};

module.exports = cf.merge({ Parameters, Resources });

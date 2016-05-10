/**
 * Creates a bare-bones CloudFormation template for a Watchbot stack
 *
 * @static
 * @memberof watchbot
 * @name template
 * @param {object} taskEnv - a set of key-value pairs to provide as environment
 * variables to **all** tasks.
 * @returns {object} a CloudFormation template. `JSON.stringify` this object and
 * save it to a file in order to deploy the stack.
 */
module.exports = function(taskEnv) {
  taskEnv = taskEnv || [];

  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'Watchbot',
    Parameters: {
      TaskRepo: {
        Description: 'The name of the task repository',
        Type: 'String'
      },
      TaskGitSha: {
        Description: 'The SHA of the task repository to use',
        Type: 'String'
      },
      TaskMemory: {
        Description: 'The number of MB of memory to reserve for each task',
        Type: 'Number',
        Default: 128
      },
      WatchbotGitSha: {
        Description: 'The SHA of Watchbot to use',
        Type: 'String',
        Default: 'v' + require('../package.json').version
      },
      WatchbotCluster: {
        Description: 'The ARN of the ECS cluster to run on',
        Type: 'String'
      },
      WatchbotClusterRole: {
        Description: 'An IAM role that can be assumed by EC2s in the ECS cluster',
        Type: 'String'
      },
      WatchbotWatchers: {
        Description: 'The number of queue watchers to run',
        Type: 'Number',
        Default: 1
      },
      WatchbotTasks: {
        Description: 'Max number of concurrent tasks to run per watcher',
        Type: 'Number',
        Default: 1
      },
      WatchbotUseWebhooks: {
        Description: 'Provide an HTTP endpoint that can be used to queue messages',
        Type: 'String',
        Default: 'false',
        AllowedValues: ['true', 'false']
      },
      WatchbotNotificationEmail: {
        Description: 'An email address to subscribe to notifications',
        Type: 'String',
        Default: 'devnull@mapbox.com'
      },
      WatchbotBackoff: {
        Description: 'Enable exponential backoff when retrying failed jobs',
        Type: 'String',
        Default: 'false',
        AllowedValues: ['true', 'false']
      },
      WatchbotMessageTimeout: {
        Description: 'Approx. number of seconds per job',
        Type: 'Number',
        Default: 600
      },
      WatchbotQueueSizeAlarm: {
        Description: 'Queue depth that triggers alarm',
        Type: 'Number',
        Default: 40
      },
      WatchbotQueueSizeAlarmPeriod: {
        Description: 'Number of 5-min periods of elevated queue depth that will trigger an alarm',
        Type: 'Number',
        Default: 24
      },
      WatchbotMessageRetentionPeriod: {
        Description: 'Number of seconds before a message is dropped from the queue',
        Type: 'Number',
        Default: 1209600
      }
    },
    Conditions: {
      UseWebhooks: { 'Fn::Equals': ['true', { Ref: 'WatchbotUseWebhooks' }] }
    },
    Resources: {
      WatchbotQueue: {
        Type: 'AWS::SQS::Queue',
        Description: 'Watchbot\'s backlog of messages to process',
        Properties: {
          VisibilityTimeout: { Ref: 'WatchbotMessageTimeout' },
          QueueName: { Ref: 'AWS::StackName' },
          MessageRetentionPeriod: { Ref: 'WatchbotMessageRetentionPeriod' }
        }
      },
      WatchbotWorkTopic: {
        Type: 'AWS::SNS::Topic',
        Description: 'Send messages to this topic to trigger tasks',
        Properties: {
          Subscription: [
            {
              Endpoint: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] },
              Protocol: 'sqs'
            }
          ]
        }
      },
      WatchbotNotificationTopic: {
        Type: 'AWS::SNS::Topic',
        Description: 'Subscribe to this topic to receive emails when tasks fail or retry',
        Properties: {
          Subscription: [
            {
              Endpoint: { Ref: 'WatchbotNotificationEmail' },
              Protocol: 'email'
            }
          ]
        }
      },
      WatchbotUser: {
        Type: 'AWS::IAM::User',
        Description: 'An AWS user with permission to publish the the work topic',
        Properties: {
          Path: '/service/',
          Policies: [
            {
              PolicyName: {
                'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, 'publish-to-sns']]
              },
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['sns:Publish'],
                    Resource: [{ Ref: 'WatchbotWorkTopic' }]
                  }
                ]
              }
            }
          ]
        }
      },
      WatchbotUserKey: {
        Type: 'AWS::IAM::AccessKey',
        Description: 'AWS access keys to authenticate as the Watchbot user',
        Properties: {
          Status: 'Active',
          UserName: { Ref: 'WatchbotUser' }
        }
      },
      WatchbotQueuePolicy: {
        Type: 'AWS::SQS::QueuePolicy',
        Description: 'A policy allowing the work topic to enqueue messages',
        Properties: {
          Queues: [{ Ref: 'WatchbotQueue' }],
          PolicyDocument: {
            Version: '2008-10-17',
            Id: 'WatchbotQueue',
            Statement: [
              {
                Sid: 'SendSomeMessages',
                Effect: 'Allow',
                Principal: { AWS: '*' },
                Action: ['sqs:SendMessage'],
                Resource: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] },
                Condition: {
                  ArnEquals: {
                    'aws:SourceArn': { Ref: 'WatchbotWorkTopic' }
                  }
                }
              }
            ]
          }
        }
      },
      WatchbotWebhookKey: {
        Type: 'AWS::ApiGateway::ApiKey',
        Condition: 'UseWebhooks',
        DependsOn: 'WatchbotWebhookDeployment',
        Properties: {
          Name: { 'Fn::Join': ['', ['watchbot-webhook-', { Ref: 'AWS::StackName' }]] },
          Enabled: true,
          StageKeys: [{ RestApiId: { Ref: 'WatchbotWebhookApi' }, StageName: 'watchbot' }]
        }
      },
      WatchbotWebhookApi: {
        Type: 'AWS::ApiGateway::RestApi',
        Condition: 'UseWebhooks',
        Properties: {
          Name: { 'Fn::Join': ['-', ['watchbot-webhook', { Ref: 'AWS::StackName' }]] },
          FailOnWarnings: true
        }
      },
      WatchbotWebhookDeployment: {
        Type: 'AWS::ApiGateway::Deployment',
        Condition: 'UseWebhooks',
        DependsOn: 'WatchbotWebhookMethod',
        Properties: {
          RestApiId: { Ref: 'WatchbotWebhookApi' },
          StageName: 'watchbot',
          StageDescription: { StageName: 'watchbot' }
        }
      },
      WatchbotWebhookMethod: {
        Type: 'AWS::ApiGateway::Method',
        Condition: 'UseWebhooks',
        Properties: {
          RestApiId: { Ref: 'WatchbotWebhookApi' },
          ResourceId: { Ref: 'WatchbotWebhookResource' },
          ApiKeyRequired: true,
          AuthorizationType: 'None',
          HttpMethod: 'POST',
          Integration: {
            Type: 'AWS',
            IntegrationHttpMethod: 'POST',
            IntegrationResponses: [
              { StatusCode: 200 },
              { StatusCode: 500, SelectionPattern: '^error.*' }
            ],
            Uri: {
              'Fn::Join': [
                '', [
                  'arn:aws:apigateway:',
                  { Ref: 'AWS::Region' },
                  ':lambda:path/2015-03-31/functions/',
                  { 'Fn::GetAtt': ['WatchbotWebhookFunction', 'Arn'] },
                  '/invocations'
                ]
              ]
            }
          },
          MethodResponses: [
            { StatusCode: '200', ResponseModels: { 'application/json': 'Empty' } },
            { StatusCode: '500', ResponseModels: { 'application/json': 'Empty' } }
          ]
        }
      },
      WatchbotWebhookResource: {
        Type: 'AWS::ApiGateway::Resource',
        Condition: 'UseWebhooks',
        Properties: {
          ParentId: { 'Fn::GetAtt': ['WatchbotWebhookApi', 'RootResourceId'] },
          RestApiId: { Ref: 'WatchbotWebhookApi' },
          PathPart: 'webhooks'
        }
      },
      WatchbotWebhookFunctionRole: {
        Type: 'AWS::IAM::Role',
        Condition: 'UseWebhooks',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Sid: 'webhookrole',
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole'
              }
            ]
          },
          Policies: [
            {
              PolicyName: 'WatchbotWebhookPolicy',
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['sns:Publish'],
                    Resource: [{ Ref: 'WatchbotWorkTopic' }]
                  }
                ]
              }
            }
          ]
        }
      },
      WatchbotWebhookFunction: {
        Type: 'AWS::Lambda::Function',
        Condition: 'UseWebhooks',
        Properties: {
          Code: {
            ZipFile: {
              'Fn::Join': [
                '\n', [
                  'var AWS = require("aws-sdk");',
                  { 'Fn::Join': ['', ['var sns = new AWS.SNS({ region: "', { Ref: 'AWS::Region' }, '" });']] },
                  { 'Fn::Join': ['', ['var topic = "', { Ref: 'WatchbotWorkTopic' }, '";']] },
                  'module.exports.webhooks = function(event, context) {',
                  '  var params = {',
                  '    TopicArn: topic,',
                  '    Subject: event.Subject || "webhook",',
                  '    Message: event.Message || JSON.stringify(event)',
                  '  };',
                  '  sns.publish(params, function(err) {',
                  '    if (err) return context.done("error: " + err.message);',
                  '    context.done(null, "success");',
                  '  });',
                  '};'
                ]
              ]
            }
          },
          Role: { 'Fn::GetAtt': ['WatchbotWebhookFunctionRole', 'Arn'] },
          Description: { 'Fn::Join': ['', ['watchbot webhooks for ', { Ref: 'AWS::StackName' }]] },
          Handler: 'index.webhooks',
          Runtime: 'nodejs',
          Timeout: 30,
          MemorySize: 128
        }
      },
      WatchbotWebhookPermission: {
        Type: 'AWS::Lambda::Permission',
        Condition: 'UseWebhooks',
        Properties:{
          FunctionName: { Ref: 'WatchbotWebhookFunction' },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '', [
                'arn:aws:execute-api:',
                { Ref: 'AWS::Region' }, ':',
                { Ref: 'AWS::AccountId' }, ':',
                { Ref: 'WatchbotWebhookApi' }, '/*'
              ]
            ]
          }
        }
      },
      WatchbotWatcherPolicy: {
        Type: 'AWS::IAM::Policy',
        Description: 'The IAM policy used by Watchbot\'s watcher container(s)',
        Properties: {
          Roles: [{ Ref: 'WatchbotClusterRole' }],
          PolicyName: { 'Fn::Join': ['', ['watchbot-watcher-', { Ref: 'AWS::StackName' }]] },
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'sqs:ReceiveMessage',
                  'sqs:DeleteMessage',
                  'sqs:ChangeMessageVisibility'
                ],
                Resource: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] }
              },
              {
                Effect: 'Allow',
                Action: ['sns:Publish'],
                Resource: { Ref: 'WatchbotNotificationTopic' }
              },
              {
                Effect: 'Allow',
                Action: ['ecs:RunTask'],
                Resource: { Ref: 'WatchbotTask' },
                Condition: {
                  StringEquals: { 'ecs:cluster': { Ref: 'WatchbotCluster' } }
                }
              },
              {
                Effect: 'Allow',
                Action: ['ecs:DescribeTasks'],
                Resource: '*',
                Condition: {
                  StringEquals: { 'ecs:cluster': { Ref: 'WatchbotCluster' } }
                }
              }
            ]
          }
        }
      },
      WatchbotTaskPolicy: {
        Type: 'AWS::IAM::Policy',
        Description: 'The IAM policy required by your task',
        Properties: {
          Roles: [{ Ref: 'WatchbotClusterRole' }],
          PolicyName: { 'Fn::Join': ['', ['watchbot-task-', { Ref: 'AWS::StackName' }]] },
          PolicyDocument: {
            Statement: []
          }
        }
      },
      WatchbotWatcher: {
        Type: 'AWS::ECS::TaskDefinition',
        Description: 'The task definition responsible for watching the queue and running tasks',
        Properties: {
          ContainerDefinitions: [
            {
              Name: {
                'Fn::Join': ['', [{ Ref: 'AWS::StackName' }, '-watchbot']]
              },
              Image: {
                'Fn::Join': [
                  '', [
                    { Ref: 'AWS::AccountId' },
                    '.dkr.ecr.',
                    { Ref: 'AWS::Region' },
                    '.amazonaws.com/watchbot:',
                    { Ref: 'WatchbotGitSha' }
                  ]
                ]
              },
              Memory: 128,
              Environment: [
                {
                  Name: 'Cluster',
                  Value: { Ref: 'WatchbotCluster' }
                },
                {
                  Name: 'TaskDefinition',
                  Value: { Ref: 'WatchbotTask' }
                },
                {
                  Name: 'ContainerName',
                  Value: { Ref: 'TaskRepo' }
                },
                {
                  Name: 'Concurrency',
                  Value: { Ref: 'WatchbotTasks' }
                },
                {
                  Name: 'QueueUrl',
                  Value: { Ref: 'WatchbotQueue' }
                },
                {
                  Name: 'NotificationTopic',
                  Value: { Ref: 'WatchbotNotificationTopic' }
                },
                {
                  Name: 'StackName',
                  Value: { Ref: 'AWS::StackName' }
                },
                {
                  Name: 'ExponentialBackoff',
                  Value: { Ref: 'WatchbotBackoff' }
                }
              ],
              MountPoints: [
                { ContainerPath: '/mnt/log', SourceVolume: 'logs' }
              ]
            }
          ],
          Volumes: [
            { Name: 'logs', Host: { SourcePath: '/var/log' } }
          ]
        }
      },
      WatchbotService: {
        Type: 'AWS::ECS::Service',
        Description: 'Maintains the desired number of watcher containers',
        DependsOn: 'WatchbotTask',
        Properties: {
          Cluster: { Ref: 'WatchbotCluster' },
          DesiredCount: { Ref: 'WatchbotWatchers' },
          TaskDefinition: { Ref: 'WatchbotWatcher' }
        }
      },
      WatchbotTask: {
        Type : 'AWS::ECS::TaskDefinition',
        Description: 'The task definition responsible for processing messages',
        DependsOn: 'WatchbotTaskPolicy',
        Properties: {
          ContainerDefinitions: [
            {
              Name: { Ref: 'TaskRepo' },
              Image: {
                'Fn::Join': [
                  '', [
                    { Ref: 'AWS::AccountId' },
                    '.dkr.ecr.',
                    { Ref: 'AWS::Region' },
                    '.amazonaws.com/',
                    { Ref: 'TaskRepo'},
                    ':',
                    { Ref: 'TaskGitSha' }
                  ]
                ]
              },
              Memory: { Ref: 'TaskMemory' },
              Environment: Object.keys(taskEnv).map(function(key) {
                return { Name: key, Value: taskEnv[key] };
              }),
              MountPoints: [
                { ContainerPath: '/mnt/log', SourceVolume: 'logs' },
                { ContainerPath: '/mnt/data', SourceVolume: 'data' }
              ]
            }
          ],
          Volumes: [
            { Name: 'logs', Host: { SourcePath: '/var/log' } },
            { Name: 'data', Host: { SourcePath: '/mnt/data' } }
          ]
        }
      },
      WatchbotWatchbotQueueSizeAlarm: {
        Type: 'AWS::CloudWatch::Alarm',
        Description: 'An alarm that is tripped when too many messages are in Watchbot\'s queue',
        Properties: {
          AlarmDescription: {
            'Fn::Join': [
              ' ', [
                'Alarm if more than',
                { Ref: 'WatchbotQueueSizeAlarm' },
                'messages in the queue for ',
                { Ref: 'WatchbotQueueSizeAlarmPeriod' },
                'consecutive minutes'
              ]
            ]
          },
          MetricName: 'ApproximateNumberOfMessagesVisible',
          Namespace: 'AWS/SQS',
          Statistic: 'Average',
          Period: '300',
          EvaluationPeriods: { Ref: 'WatchbotQueueSizeAlarmPeriod' },
          Threshold: { Ref: 'WatchbotQueueSizeAlarm' },
          AlarmActions: [{ Ref: 'WatchbotNotificationTopic' }],
          InsufficientDataActions: [{ Ref: 'WatchbotNotificationTopic' }],
          Dimensions: [
            {
              Name: 'QueueName',
              Value: { 'Fn::GetAtt': ['WatchbotQueue', 'QueueName'] }
            }
          ],
          ComparisonOperator: 'GreaterThanThreshold'
        }
      }
    },
    Outputs: {
      WatchbotSns: {
        Description: 'The ARN of Watchbot\'s SNS topic. Send messages to this topic to be processed by Watchbot',
        Value: { Ref: 'WatchbotWorkTopic' }
      },
      WatchbotAccessKeyId: {
        Description: 'An access key with permission to publish messages to Watchbot',
        Value: { Ref: 'WatchbotUserKey' }
      },
      WatchbotSecretAccessKey: {
        Description: 'A secret access key with permission to publish messages to Watchbot',
        Value: { 'Fn::GetAtt': ['WatchbotUserKey', 'SecretAccessKey'] }
      },
      WatchbotQueueUrl: {
        Description: 'The URL of Watchbot\'s SQS queue',
        Value: { Ref: 'WatchbotQueue' }
      },
      WatchbotQueueArn: {
        Description: 'The ARN of Watchbot\'s SQS queue',
        Value: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] }
      },
      WatchbotQueueName: {
        Description: 'The name of Watchbot\'s SQS queue',
        Value: { 'Fn::GetAtt': ['WatchbotQueue', 'QueueName'] }
      },
      WatchbotNotificationTopic: {
        Description: 'The ARN of an SNS topic where Watchbot will send notifications for failed processing',
        Value: { Ref: 'WatchbotNotificationTopic' }
      },
      WatchbotWebhookKey: {
        Condition: 'UseWebhooks',
        Description: 'The API key required to send webhooks to Watchbot',
        Value: { Ref: 'WatchbotWebhookKey' }
      },
      WatchbotWebhookEndpoint: {
        Condition: 'UseWebhooks',
        Description: 'The HTTPS endpoint used to send webhooks to Watchbot',
        Value: {
          'Fn::Join': [
            '', [
              'https://',
              { Ref: 'WatchbotWebhookApi' },
              '.execute-api.',
              { Ref: 'AWS::Region' },
              '.amazonaws.com/watchbot/webhooks'
            ]
          ]
        }
      }
    }
  };
};

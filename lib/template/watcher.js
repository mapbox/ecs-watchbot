module.exports.Parameters = {
  WatchbotGitSha: {
    Description: 'The SHA of Watchbot to use',
    Type: 'String',
    Default: 'v' + require('../../package.json').version
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
  }
};

module.exports.Resources = {
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
            Resource: {
              'Fn::Join': [
                '', [
                  'arn:aws:ecs:',
                  { Ref: 'AWS::Region' }, ':',
                  { Ref: 'AWS::AccountId' },
                  ':task-definition/',
                  { Ref: 'AWS::StackName' },
                  '*'
                ]
              ]
            },
            Condition: {
              StringEquals: { 'ecs:cluster': { Ref: 'WatchbotCluster' } }
            }
          },
          {
            Effect: 'Allow',
            Action: [
              'ecs:DescribeTasks',
              'ecs:DescribeContainerInstances'
            ],
            Resource: '*',
            Condition: {
              StringEquals: { 'ecs:cluster': { Ref: 'WatchbotCluster' } }
            }
          },
          {
            Effect: 'Allow',
            Action: ['ecs:ListContainerInstances'],
            Resource: { Ref: 'WatchbotCluster' }
          },
          {
            Effect: 'Allow',
            Action: ['ecs:DescribeTaskDefinition'],
            Resource: '*'
          }
        ]
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
                '.amazonaws.com/ecs-watchbot:',
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
          MountPoints: undefined,
          LogConfiguration: {
            LogDriver: 'syslog',
            Options: {
              'syslog-address': 'udp://localhost:514'
            }
          }
        }
      ],
      Volumes: undefined
    }
  },
  WatchbotService: {
    Type: 'AWS::ECS::Service',
    Description: 'Maintains the desired number of watcher containers',
    DependsOn: ['WatchbotTask', 'WatchbotTaskPolicy', 'WatchbotWatcherPolicy'],
    Properties: {
      Cluster: { Ref: 'WatchbotCluster' },
      DesiredCount: { Ref: 'WatchbotWatchers' },
      TaskDefinition: { Ref: 'WatchbotWatcher' }
    }
  }
};

module.exports.Outputs = {
  WatchbotAlarms: {
    Description: 'The ARN of an SNS topic where Watchbot will send notifications for failed processing',
    Value: { Ref: 'WatchbotNotificationTopic' }
  }
};

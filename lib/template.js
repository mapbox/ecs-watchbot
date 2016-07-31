var cf = require('cloudfriend');

/**
 * Builds a watchbot template
 *
 * @param {object} options
 * @param {string} options.prefix
 * @param {boolean} options.user
 * @param {boolean} options.webhook
 * @param {boolean} options.webhookKey
 * @param {string/ref} options.notificationEmail
 * @param {string/ref} options.cluster
 * @param {string/ref} options.clusterRole
 * @param {string/ref} options.watchbotVersion
 * @param {string} options.service
 * @param {string/ref} options.serviceVersion
 * @param {object} [env={}]
 * @param {number/ref} [options.watchers=1]
 * @param {number/ref} [options.workers=1]
 * @param {boolean/ref} [options.backoff=true]
 * @param {string} [options.mounts='']
 * @param {object} [options.reservation={}]
 * @param {number/ref} [options.reservation.memory=undefined]
 * @param {number/ref} [options.reservation.cpu=undefined]
 * @param {number/ref} [options.messageTimeout=600]
 * @param {number/ref} [options.messageRetention=1209600]
 * @param {number/ref} [options.alarmThreshold=40]
 * @param {number/ref} [options.alarmPeriods=24]
 * @returns {@link WatchbotOutput} Watchbot resources and references
 */
module.exports = function(options) {
  function prefixed(name) {
    return options.prefix + name;
  }

  options.reservation = options.reservation || {};
  options.env = options.env || {};
  options.alarmThreshold = options.alarmThreshold || 40;
  options.alarmPeriods = options.alarmPeriods || 24;
  options.messageTimeout = options.messageTimeout || 600;
  options.messageRetention = options.messageRetention || 1209600;
  options.watchers = options.watchers || 1;
  options.workers = options.workers || 1;
  options.backoff = options.backoff === undefined ? true : options.backoff;
  options.mounts = options.mounts || '';

  var resources = {};
  var references = {
    logGroup: cf.ref(prefixed('LogGroup')),
    topic: cf.ref(prefixed('Topic'))
  };

  if (options.user) user(prefixed, resources, references);
  if (options.webhook) webhook(prefixed, !!options.webhookKey, resources, references);

  resources[prefixed('NotificationTopic')] = {
    Type: 'AWS::SNS::Topic',
    Description: 'Subscribe to this topic to receive emails when tasks fail or retry',
    Properties: {
      Subscription: [
        {
          Endpoint: options.notificationEmail,
          Protocol: 'email'
        }
      ]
    }
  };

  resources[prefixed('LogGroup')] = {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      RetentionInDays: 14
    }
  };

  resources[prefixed('Queue')] = {
    Type: 'AWS::SQS::Queue',
    Description: 'Watchbot\'s backlog of messages to process',
    Properties: {
      VisibilityTimeout: options.messageTimeout,
      QueueName: cf.join([prefixed('-'), cf.stackName]),
      MessageRetentionPeriod: options.messageRetention
    }
  };

  resources[prefixed('Topic')] = {
    Type: 'AWS::SNS::Topic',
    Description: 'Send messages to this topic to trigger tasks',
    Properties: {
      Subscription: [
        {
          Endpoint: cf.getAtt(prefixed('Queue'), 'Arn'),
          Protocol: 'sqs'
        }
      ]
    }
  };

  resources[prefixed('QueuePolicy')] = {
    Type: 'AWS::SQS::QueuePolicy',
    Description: 'A policy allowing the work topic to enqueue messages',
    Properties: {
      Queues: [cf.ref(prefixed('Queue'))],
      PolicyDocument: {
        Version: '2008-10-17',
        Id: prefixed('WatchbotQueue'),
        Statement: [
          {
            Sid: 'SendSomeMessages',
            Effect: 'Allow',
            Principal: { AWS: '*' },
            Action: ['sqs:SendMessage'],
            Resource: cf.getAtt(prefixed('Queue'), 'Arn'),
            Condition: {
              ArnEquals: {
                'aws:SourceArn': cf.ref(prefixed('Topic'))
              }
            }
          }
        ]
      }
    }
  };

  resources[prefixed('QueueSizeAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Description: 'An alarm that is tripped when too many messages are in Watchbot\'s queue',
    Properties: {
      AlarmDescription: cf.join([
        'Alarm if more than',
        typeof options.alarmThreshold === 'object' ? options.alarmThreshold : options.alarmThreshold.toString(),
        'messages in the queue for ',
        typeof options.alarmPeriods === 'object' ? options.alarmPeriods : options.alarmPeriods.toString(),
        'consecutive 5 minute periods'
      ]),
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Namespace: 'AWS/SQS',
      Statistic: 'Average',
      Period: '300',
      EvaluationPeriods: options.alarmPeriods,
      Threshold: options.alarmThreshold,
      AlarmActions: [cf.ref(prefixed('NotificationTopic'))],
      Dimensions: [
        {
          Name: 'QueueName',
          Value: cf.getAtt(prefixed('Queue'), 'QueueName')
        }
      ],
      ComparisonOperator: 'GreaterThanThreshold'
    }
  };

  resources[prefixed('WorkerPolicy')] = {
    Type: 'AWS::IAM::Policy',
    Description: 'The IAM policy required by your task',
    Properties: {
      Roles: [options.clusterRole],
      PolicyName: cf.join([prefixed('-watchbot-task-'), cf.stackName]),
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: cf.ref(prefixed('NotificationTopic'))
          },
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:FilterLogEvents'],
            Resource: '*'
          }
        ]
      }
    }
  };

  resources[prefixed('WatcherPolicy')] = {
    Type: 'AWS::IAM::Policy',
    Description: 'The IAM policy used by Watchbot\'s watcher container(s)',
    DependsOn: prefixed('WorkerPolicy'),
    Properties: {
      Roles: [options.clusterRole],
      PolicyName: cf.join([prefixed('-watcher-'), cf.stackName]),
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility'],
            Resource: cf.getAtt(prefixed('Queue'), 'Arn')
          },
          {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: cf.ref(prefixed('NotificationTopic'))
          },
          {
            Effect: 'Allow',
            Action: ['ecs:RunTask'],
            Resource: cf.join([
              'arn:aws:ecs:', cf.region, ':', cf.accountId,
              ':task-definition/', cf.stackName, '*'
            ]),
            Condition: { StringEquals: { 'ecs:cluster': options.cluster } }
          },
          {
            Effect: 'Allow',
            Action: ['ecs:DescribeTasks', 'ecs:DescribeContainerInstances'],
            Resource: '*',
            Condition: { StringEquals: { 'ecs:cluster': options.cluster } }
          },
          {
            Effect: 'Allow',
            Action: ['ecs:ListContainerInstances'],
            Resource: options.cluster
          },
          {
            Effect: 'Allow',
            Action: ['ecs:DescribeTaskDefinition'],
            Resource: '*'
          },
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:FilterLogEvents'],
            Resource: '*'
          }
        ]
      }
    }
  };

  var mounts = mount(options.mounts);
  resources[prefixed('Worker')] = {
    Type: 'AWS::ECS::TaskDefinition',
    DependsOn: prefixed('WorkerPolicy'),
    Description: 'The task definition responsible for processing messages',
    Properties: {
      ContainerDefinitions: [
        {
          Name: prefixed('-worker-' + options.service),
          Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/', options.service, ':', options.serviceVersion]),
          Memory: options.reservation.memory,
          Cpu: options.reservation.cpu,
          Environment: unpackEnv(prefixed, options.env),
          MountPoints: mounts.mountPoints,
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-group': cf.ref(prefixed('LogGroup')),
              'awslogs-region': cf.region
            }
          }
        }
      ],
      Volumes: mounts.volumes
    }
  };

  resources[prefixed('Watcher')] = {
    Type: 'AWS::ECS::TaskDefinition',
    Description: 'The task definition responsible for watching the queue and running tasks',
    Properties: {
      ContainerDefinitions: [
        {
          Name: prefixed('-watcher-' + options.service),
          Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/ecs-watchbot:', options.watchbotVersion]),
          Memory: 128,
          Environment: [
            { Name: 'Cluster', Value: options.cluster },
            { Name: 'TaskDefinition', Value: cf.ref(prefixed('Worker')) },
            { Name: 'ContainerName', Value: prefixed('-worker-' + options.service) },
            { Name: 'Concurrency', Value: options.workers.toString() },
            { Name: 'QueueUrl', Value: cf.ref(prefixed('Queue')) },
            { Name: 'NotificationTopic', Value: cf.ref(prefixed('NotificationTopic')) },
            { Name: 'StackName', Value: cf.stackName },
            { Name: 'ExponentialBackoff', Value: options.backoff.toString() },
            { Name: 'LogGroupArn', Value: cf.getAtt(prefixed('LogGroup'), 'Arn') }
          ],
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-group': cf.ref(prefixed('LogGroup')),
              'awslogs-region': cf.region
            }
          }
        }
      ]
    }
  };

  resources[prefixed('Service')] = {
    Type: 'AWS::ECS::Service',
    Description: 'Maintains the desired number of watcher containers',
    DependsOn: [prefixed('Worker'), prefixed('WatcherPolicy')],
    Properties: {
      Cluster: options.cluster,
      DesiredCount: options.watchers,
      TaskDefinition: cf.ref(prefixed('Watcher'))
    }
  };

  /**
   * The Watchbot builder output object
   *
   * @name WatchbotOutput
   * @property {object} Resources - A CloudFormation Resources object
   * @property {object} refs - a set of CloudFormation `Ref`s to important
   * Watchbot resources
   */
  return {
    Resources: resources,
    ref: references
  };
};

function user(prefixed, resources, references) {
  resources[prefixed('User')] = {
    Type: 'AWS::IAM::User',
    Description: 'An AWS user with permission to publish the the work topic',
    Properties: {
      Policies: [
        {
          PolicyName: cf.join([cf.stackName, 'publish-to-sns']),
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: ['sns:Publish'],
                Resource: [cf.ref(prefixed('Topic'))]
              }
            ]
          }
        }
      ]
    }
  };

  resources[prefixed('UserKey')] = {
    Type: 'AWS::IAM::AccessKey',
    Description: 'AWS access keys to authenticate as the Watchbot user',
    Properties: {
      Status: 'Active',
      UserName: cf.ref(prefixed('User'))
    }
  };

  references.accessKeyId = cf.ref(prefixed('UserKey'));
  references.secretAccessKey = cf.getAtt(prefixed('UserKey'), 'SecretAccessKey');
}

function webhook(prefixed, useKey, resources, references) {
  resources[prefixed('WebhookApi')] = {
    Type: 'AWS::ApiGateway::RestApi',
    Properties: {
      Name: cf.join('-', [prefixed('-watchbot-webhook'), cf.stackName]),
      FailOnWarnings: true
    }
  };

  resources[prefixed('WebhookDeployment')] = {
    Type: 'AWS::ApiGateway::Deployment',
    DependsOn: 'WatchbotWebhookMethod',
    Properties: {
      RestApiId: cf.ref(prefixed('WebhookApi')),
      StageName: 'watchbot',
      StageDescription: {
        MethodSettings: [
          {
            HttpMethod: '*',
            ResourcePath: '/*',
            ThrottlingBurstLimit: 20,
            ThrottlingRateLimit: 5
          }
        ]
      }
    }
  };

  resources[prefixed('WebhookMethod')] = {
    Type: 'AWS::ApiGateway::Method',
    Properties: {
      RestApiId: cf.ref(prefixed('WebhookApi')),
      ResourceId: cf.ref(prefixed('WebhookResource')),
      ApiKeyRequired: useKey ? true : false,
      AuthorizationType: 'None',
      HttpMethod: 'POST',
      Integration: {
        Type: 'AWS',
        IntegrationHttpMethod: 'POST',
        IntegrationResponses: [
          { StatusCode: 200 },
          { StatusCode: 500, SelectionPattern: '^error.*' }
        ],
        Uri: cf.join(['arn:aws:apigateway:', cf.region, ':lambda:path/2015-03-31/functions/', cf.getAtt(prefixed('WebhookFunction'), 'Arn'), '/invocations'])
      },
      MethodResponses: [
        { StatusCode: '200', ResponseModels: { 'application/json': 'Empty' } },
        { StatusCode: '500', ResponseModels: { 'application/json': 'Empty' } }
      ]
    }
  };

  resources[prefixed('WebhookResource')] = {
    Type: 'AWS::ApiGateway::Resource',
    Properties: {
      ParentId: cf.getAtt(prefixed('WebhookApi'), 'RootResourceId'),
      RestApiId: cf.ref(prefixed('WebhookApi')),
      PathPart: 'webhooks'
    }
  };

  resources[prefixed('WebhookFunctionRole')] = {
    Type: 'AWS::IAM::Role',
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
                Action: ['logs:*'],
                Resource: ['arn:aws:logs:*:*:*']
              },
              {
                Effect: 'Allow',
                Action: ['sns:Publish'],
                Resource: [cf.ref(prefixed('Topic'))]
              }
            ]
          }
        }
      ]
    }
  };

  resources[prefixed('WebhookFunction')] = {
    Type: 'AWS::Lambda::Function',
    Properties: {
      Code: {
        ZipFile: cf.join('\n', [
          'var AWS = require("aws-sdk");',
          cf.join(['var sns = new AWS.SNS({ region: "', cf.region, '" });']),
          cf.join(['var topic = "', cf.ref(prefixed('Topic')), '";']),
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
        ])
      },
      Role: cf.getAtt(prefixed('WebhookFunctionRole'), 'Arn'),
      Description: cf.join([prefixed('-watchbot webhooks for '), cf.stackName]),
      Handler: 'index.webhooks',
      Runtime: 'nodejs',
      Timeout: 30,
      MemorySize: 128
    }
  };

  resources[prefixed('WebhookPermission')] = {
    Type: 'AWS::Lambda::Permission',
    Properties: {
      FunctionName: cf.ref(prefixed('WebhookFunction')),
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: cf.join(['arn:aws:execute-api:', cf.region, ':', cf.accountId, ':', cf.ref(prefixed('WebhookApi')), '/*'])
    }
  };

  references.webhookEndpoint = cf.join(['https://', cf.ref(prefixed('WebhookApi')), '.execute-api.', cf.region, '.amazonaws.com/watchbot/webhooks']);

  if (useKey) {
    resources[prefixed('WebhookKey')] = {
      WatchbotWebhookKey: {
        Type: 'AWS::ApiGateway::ApiKey',
        DependsOn: 'WatchbotWebhookDeployment',
        Properties: {
          Name: cf.join([prefixed('-watchbot-webhook-'), { Ref: 'AWS::StackName' }]),
          Enabled: true,
          StageKeys: [{ RestApiId: cf.ref(prefixed('WebhookApi')), StageName: 'watchbot' }]
        }
      }
    };

    references.webhookKey = cf.ref(prefixed('WebhookKey'));
  }
}

function mount(mountStrs) {
  var mounts = {
    mountPoints: [],
    volumes: []
  };

  mountStrs.split(',').forEach(function(mountStr, i) {
    var host = mountStr.split(':')[0];
    var container = mountStr.split(':')[1];
    var name = 'mnt-' + i;
    mounts.mountPoints.push({ ContainerPath: container, SourceVolume: name });
    mounts.volumes.push({ Name: name, Host: { SourcePath: host } });
  });

  return mounts;
}

function unpackEnv(prefixed, env) {
  return Object.keys(env).reduce(function(unpacked, key) {
    unpacked.push({ Name: key, Value: env[key] });
    return unpacked;
  }, [
    { Name: 'WorkTopic', Value: cf.ref(prefixed('Topic')) },
    { Name: 'LogGroup', Value: cf.ref(prefixed('LogGroup')) }
  ]);
}

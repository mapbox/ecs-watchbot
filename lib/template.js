var cf = require('cloudfriend');
var path = require('path');
var pkg = require(path.resolve(__dirname, '..', 'package.json'));

/**
 * Builds Watchbot resources for you to include in a CloudFormation template
 *
 * @static
 * @memberof watchbot
 * @name template
 * @param {object} options - configuration parameters
 * @param {string|ref} options.cluster - the ARN for the ECS cluster that will
 * host Watchbot's containers.
 * @param {string} options.service - the name of your service. This is usually
 * the name of your Github repository. It **must** match the name of the ECR
 * repository where your images are stored.
 * @param {string|ref} options.serviceVersion - the version of you service to
 * deploy. This should reference a specific image in ECR.
 * @param {array} [options.permissions=[]] - permissions that your worker will
 * need in order to complete tasks.
 * @param {object} [options.env={}] - key-value pairs that will be provided to the worker
 * containers as environment variables. Keys must be strings, and values can either
 * be strings or references to other CloudFormation resources via `{"Ref": "..."}`.
 * @param {array} [command=undefined] - an array of strings to that define the
 * command to run when the container is launched. If your Dockerfile specifies a
 * CMD, it will be overriden.
 * @param {string|ref} [options.watchbotVersion=current] - the version of Watchbot's
 * container that will be deployed. Defaults to the installed version
 * @param {string|ref} options.notificationEmail - an email address to receive
 * notifications when processing fails.
 * @param {string} [options.prefix='Watchbot'] - a prefix that will be applied
 * to the logical names of all the resources Watchbot creates. If you're
 * building a template that includes more than one Watchbot system, you'll need
 * to specify this in order to differentiate the resources.
 * @param {boolean} [options.user=false] - if true, Watchbot will build an IAM
 * User and associated access key pair. The user will have permission to publish
 * messages to Watchbot's SNS topic in order to spawn processing jobs. The
 * AccessKeyId and SecretAccessKey will be available as stack outputs.
 * @param {boolean} [options.webhook=false] - if true, Watchbot will build an
 * HTTPS endpoint via ApiGateway. JSON payloads can be POSTed to this endpoint,
 * and will be passed through to Watchbot's SNS topic, spawning processing jobs.
 * By default, no authentication is required in order to POST to the endpoint.
 * The endpoint URL will be available as a stack output.
 * @param {boolean} [options.webhookKey=false] - if true, Watchbot will generate
 * an API token and require that it be passed to all POST requests to the webhook
 * endpoint. The token will be available as a stack output.
 * @param {boolean} [options.reduce=false] - if true, Watchbot will enable the
 * workers to utilize a DynamoDB table to track the progress of a distributed
 * map-reduce operation.
 * @param {number|ref} [options.watchers=1] - the number of watcher containers
 * to run. Each watcher container reads from SQS and spawns worker containers
 * when messages arrive. Each watcher is responsible for spawning and monitoring
 * as many workers as you specify with the `workers` parameter. This parameter
 * can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.workers=1] - the number of concurrent worker
 * containers that any single watcher is responsible for spawning and monitoring.
 * This parameter can be provided as either a number or a reference, i.e.
 * `{"Ref": "..."}`.
 * @param {boolean|ref} [options.backoff=true] - by default, if a processing job
 * fails for any reason, Watchbot will retry the job. The duration between
 * between retries will increase exponentially according to the number of times
 * that the job has been retried. Set this parameter to false in order to avoid
 * this exponential backoff and retry jobs immediately.
 * @param {string} [options.logAggregationFunction=''] - the ARN of a Lambda function
 * function to send logs to.
 * @param {string} [options.mounts=''] - if your worker containers need to mount
 * files or folders from the host EC2 file system, specify those mounts with this
 * parameter. A single mount point can be specified as
 * `{host location}:{container location}`, e.g. /root:/mnt/root. Separate multiple
 * mount strings with commas if you need to mount more than one location.
 * @param {object} [options.reservation={}] - worker container resource reservations
 * @param {number|ref} [options.reservation.memory=64] - the number of
 * MB of RAM to reserve. If your worker container tries to utilize more than
 * this much RAM, it will be shut down. This parameter can be provided as either
 * a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.reservation.cpu=undefined] - the number of CPU
 * units to reserve for your worker container. This will only impact the
 * placement of your container on an EC2 with sufficient CPU capacity, but will
 * not limit your container's utilization. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.messageTimeout=600] - once Watchbot pulls a
 * message from SQS and spawns a worker to process it, SQS will wait this many
 * seconds for a response. If the worker has not yet finished processing the
 * message for any reason, SQS will make the message visible again and Watchbot
 * will spawn another worker to process it. This is helpful when containers or
 * processing scripts crash, but make sure that it allows sufficient time for
 * routine processing to occur. If set too low, you will end up processing jobs
 * multiple times. This parameter can be provided as either a number or a
 * reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.messageRetention=1209600] - the number of seconds
 * that a message will exist in SQS until it is deleted. The default value is the
 * maximum time that SQS allows, 14 days. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.alarmThreshold=40] - Watchbot creates a
 * CloudWatch alarm that will go off when there have been too many messages in
 * SQS for a certain period of time. Use this parameter to adjust the Threshold
 * number of messages to trigger the alarm. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {number|ref} [options.alarmPeriods=24] - Use this parameter to control
 * the duration that the SQS queue must be over the message threshold before
 * triggering an alarm. You specify the number of 5-minute periods before an
 * alarm is triggered. The default is 24 periods, or 2 hours. This parameter
 * can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {boolean} [options.debugLogs=false] - enable verbose watcher logging
 * @returns {@type WatchbotOutput} Watchbot resources and references
 */
module.exports = function(options) {
  function prefixed(name) {
    return options.prefix + name;
  }

  options.watchbotVersion = options.watchbotVersion || 'v' + pkg.version;
  options.prefix = options.prefix || 'Watchbot';
  options.reservation = options.reservation || {};
  options.reservation.memory = options.reservation.memory || 64;
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
    topic: cf.ref(prefixed('Topic')),
    queueUrl: cf.ref(prefixed('Queue')),
    queueArn: cf.getAtt(prefixed('Queue'), 'Arn')
  };

  if (options.user) user(prefixed, resources, references);
  if (options.webhook) webhook(prefixed, !!options.webhookKey, resources, references);
  if (options.logAggregationFunction) logAggregator(prefixed, resources, options);
  if (options.reduce) reduce(prefixed, resources, options, references);
  var mounts = mount(options.mounts);

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
      QueueName: cf.join([cf.stackName, '-', prefixed('Queue')]),
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

  resources[prefixed('WorkerRole')] = {
    Type: 'AWS::IAM::Role',
    Description: 'The IAM role for the ' + options.service + ' worker',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: ['ecs-tasks.amazonaws.com'] },
          Action: ['sts:AssumeRole']
        }]
      },
      Policies: [
        {
          PolicyName: cf.join([cf.stackName, '-default-worker']),
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: ['sns:Publish'],
                Resource: [cf.ref(prefixed('NotificationTopic')), cf.ref(prefixed('Topic'))]
              },
              {
                Effect: 'Allow',
                Action: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:FilterLogEvents'],
                Resource: '*'
              }
            ]
          }
        }
      ]
    }
  };

  if (options.permissions) resources[prefixed('WorkerRole')].Properties.Policies.push({
    PolicyName: cf.join([cf.stackName, '-user-defined-worker']),
    PolicyDocument: {
      Statement: options.permissions
    }
  });

  resources[prefixed('WatcherRole')] = {
    Type: 'AWS::IAM::Role',
    Description: 'The IAM role for the ' + options.service + ' watcher',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: ['ecs-tasks.amazonaws.com'] },
          Action: ['sts:AssumeRole']
        }]
      },
      Policies: [
        {
          PolicyName: cf.join([cf.stackName, '-watcher']),
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
      ]
    }
  };

  resources[prefixed('Worker')] = {
    Type: 'AWS::ECS::TaskDefinition',
    DependsOn: prefixed('WorkerRole'),
    Description: 'The task definition responsible for processing messages',
    Properties: {
      TaskRoleArn: cf.ref(prefixed('WorkerRole')),
      ContainerDefinitions: [
        {
          Name: prefixed('-worker-' + options.service),
          Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/', options.service, ':', options.serviceVersion]),
          Memory: options.reservation.memory,
          Cpu: options.reservation.cpu,
          Environment: unpackEnv(prefixed, options.env),
          MountPoints: mounts.mountPoints,
          Command: options.command,
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
      TaskRoleArn: cf.ref(prefixed('WatcherRole')),
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
            { Name: 'LogGroupArn', Value: cf.getAtt(prefixed('LogGroup'), 'Arn') },
            { Name: 'LogLevel', Value: options.debugLogs ? 'debug' : 'info' }
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
    DependsOn: [prefixed('Worker'), prefixed('Watcher')],
    Properties: {
      Cluster: options.cluster,
      DesiredCount: options.watchers,
      TaskDefinition: cf.ref(prefixed('Watcher'))
    }
  };

  /**
   * The Watchbot template builder output object
   *
   * @name WatchbotOutput
   * @property {object} Resources - A CloudFormation Resources object
   * @property {object} refs - a set of CloudFormation `Ref`s to important
   * Watchbot resources. These references are only useful in the context of a
   * CloudFormation template.
   * @property {object} refs.logGroup - the name of the CloudWatch LogGroup to
   * which Watchbot will write watcher and worker logs.
   * @property {object} refs.topic - the ARN for Watchbot's SNS topic. Publish
   * messages to this topic to trigger processing.
   * @property {object} refs.queueUrl - the URL for Watchbot's SQS queue.
   * @property {object} refs.queueArn - the ARN for Watchbot's SQS queue.
   * @property {object} [refs.accessKeyId] - if the `user` parameter was set to
   * true, this is an access key with permission to publish messages to Watchbot's
   * SNS topic.
   * @property {object} [refs.secretAccessKey] - if the `user` parameter was set to
   * true, this is a secret access key with permission to publish messages to Watchbot's
   * SNS topic.
   * @property {object} [refs.webhookEndpoint] - if the `webhook` parameter was
   * set to true, this is the URL for the ApiGateway endpoint. JSON payloads
   * POSTed to this endpoint will be passed through to Watchbot's SNS topic to
   * spawn processing.
   * @property {object} [refs.webhookKey] - if the `webhookKey` parameter was
   * set to true, this access token must be provided in all POST requests to the
   * webhook endpoint.
   */
  return {
    Resources: resources,
    ref: references
  };
};

function logAggregator(prefixed, resources, options) {
  resources[prefixed('LogForwarding')] = {
    Type: 'AWS::Logs::SubscriptionFilter',
    Description: 'Sends log events from CloudWatch Logs to a Lambda function',
    Properties: {
      DestinationArn: options.logAggregationFunction,
      LogGroupName: cf.ref(prefixed('LogGroup')),
      FilterPattern: ''
    }
  };
}

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
    DependsOn: prefixed('WebhookMethod'),
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
      Type: 'AWS::ApiGateway::ApiKey',
      DependsOn: prefixed('WebhookDeployment'),
      Properties: {
        Name: cf.join([prefixed('-watchbot-webhook-'), { Ref: 'AWS::StackName' }]),
        Enabled: true,
        StageKeys: [{ RestApiId: cf.ref(prefixed('WebhookApi')), StageName: 'watchbot' }]
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
    if (!mountStr.length) return;

    var host = mountStr.split(':')[0];
    var container = mountStr.split(':')[1];
    var name = 'mnt-' + i;
    mounts.mountPoints.push({ ContainerPath: container, SourceVolume: name });
    mounts.volumes.push({ Name: name, Host: { SourcePath: host } });
  });

  if (!mounts.mountPoints.length) {
    mounts.mountPoints = undefined;
    mounts.volumes = undefined;
  }

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

function reduce(prefixed, resources, options, references) {
  resources[prefixed('ProgressTable')] = {
    Type: 'AWS::DynamoDB::Table',
    Properties: {
      TableName: cf.join('-', [cf.stackName, prefixed('-progress')]),
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: {
        ReadCapacityUnits: 30,
        WriteCapacityUnits: 30
      }
    }
  };

  var tableArn = cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref(prefixed('ProgressTable'))]);

  resources[prefixed('ProgressTablePermission')] = {
    Type: 'AWS::IAM::Policy',
    Properties: {
      Roles: [cf.ref(prefixed('WorkerRole'))],
      PolicyName: 'watchbot-progress',
      PolicyDocument: {
        Statement: [
          {
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem'
            ],
            Effect: 'Allow',
            Resource: tableArn
          }
        ]
      }
    }
  };

  references.progressTable = cf.ref(prefixed('ProgressTable'));

  options.env.ProgressTable = tableArn;
}

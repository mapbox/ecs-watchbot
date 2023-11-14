'use strict';

const cf = require('@mapbox/cloudfriend');
const table = require('@mapbox/watchbot-progress').table;
const path = require('path');
const pkg = require(path.resolve(__dirname, '..', 'package.json'));
const dashboard = require(path.resolve(__dirname, 'dashboard.js'));

// All options must be documented in docs/building-a-template.md.
module.exports = (options = {}) => {
  ['service', 'serviceVersion', 'command', 'cluster'].forEach((required) => {
    if (!options[required]) throw new Error(`options.${required} is required`);
  });

  options = Object.assign(
    {
      capacity: 'EC2',
      prefix: 'Watchbot',
      watchbotVersion: 'v' + pkg.version,
      reservation: {},
      env: {},
      maxJobDuration: 0,
      messageRetention: 1209600,
      maxSize: 1,
      minSize: 0,
      mounts: '',
      privileged: false,
      writableFilesystem: false,
      family: options.service,
      errorThreshold: 10,
      alarmThreshold: 40,
      readCapacityUnits: 30,
      writeCapacityUnits: 30,
      alarmPeriods: 24,
      failedPlacementAlarmPeriods: 1,
      deadletterThreshold: 10,
      deadletterAlarm: true,
      dashboard: true,
      fifo: false,
      fargatePublicIp: 'DISABLED',
      structuredLogging: false
    },
    options
  );

  const prefixed = (name) => `${options.prefix}${name}`;

  options.reservation.softMemory = options.reservation.softMemory || cf.noValue;

  const ref = {
    logGroup: cf.ref(prefixed('LogGroup')),
    topic: options.fifo ? undefined : cf.ref(prefixed('Topic')),
    queueUrl: cf.ref(prefixed('Queue')),
    queueArn: cf.getAtt(prefixed('Queue'), 'Arn'),
    queueName: cf.getAtt(prefixed('Queue'), 'QueueName'),
    notificationTopic: cf.ref(prefixed('NotificationTopic'))
  };

  const unpackEnv = (env, mountPoints) => {
    return Object.keys(env).reduce(
      (unpacked, key) => {
        unpacked.push({ Name: key, Value: env[key] });
        return unpacked;
      },
      [
        { Name: 'WorkTopic', Value: options.fifo ? undefined : cf.ref(prefixed('Topic')) },
        { Name: 'QueueUrl', Value: cf.ref(prefixed('Queue')) },
        { Name: 'LogGroup', Value: cf.ref(prefixed('LogGroup')) },
        { Name: 'writableFilesystem', Value: options.writableFilesystem },
        { Name: 'maxJobDuration', Value: options.maxJobDuration },
        { Name: 'Volumes', Value: mountPoints.map((m) => m.ContainerPath).join(',') },
        { Name: 'Fifo', Value: options.fifo.toString() },
        { Name: 'structuredLogging', Value: options.structuredLogging.toString() }
      ]
    );
  };

  const mount = (mountInputs) => {
    let formatted = [];
    const mounts = {
      mountPoints: [],
      volumes: []
    };

    if (typeof mountInputs === 'object') formatted = mountInputs;
    if (typeof mountInputs === 'string') {
      mountInputs.split(',').forEach((mountStr) => {
        if (!mountStr.length) return;

        const persistent = /:/.test(mountStr);
        formatted.push(
          persistent ? mountStr.split(':')[1] : mountStr
        );
      });
    }

    if (formatted.indexOf('/tmp') === -1) {
      mounts.mountPoints.push({ ContainerPath: '/tmp', SourceVolume: 'tmp' });
      mounts.volumes.push({ Name: 'tmp' });
    }

    formatted.forEach((container, i) => {
      const name = 'mnt-' + i;

      mounts.mountPoints.push({ ContainerPath: container, SourceVolume: name });
      mounts.volumes.push({ Name: name });
    });

    return mounts;
  };

  const mounts = mount(options.mounts);

  const Conditions = {
    'InChina': cf.equals(cf.select(0, cf.split('-', cf.region)), 'cn'),
    [prefixed('CapacityIsEC2')]: cf.equals(options.capacity, 'EC2'),
    [prefixed('CapacityIsNotEC2')]: cf.notEquals(options.capacity, 'EC2'),
    [prefixed('CapacityIsFargate')]: cf.equals(options.capacity, 'FARGATE'),
    [prefixed('CapacityIsFargateSpot')]: cf.equals(options.capacity, 'FARGATE_SPOT')
  };

  const Resources = {};

  if (options.notificationTopic && options.notificationEmail) throw new Error('Cannot provide both notificationTopic and notificationEmail.');
  if (!options.notificationTopic && !options.notificationEmail) throw new Error('Must provide either notificationTopic or notificationEmail.');
  const notify = options.notificationTopic || cf.ref(prefixed('NotificationTopic'));

  if (options.notificationEmail) Resources[prefixed('NotificationTopic')] = {
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

  if (options.fifo) {
    Resources[prefixed('DeadLetterQueue')].Properties.FifoQueue = true;
    Resources[prefixed('DeadLetterQueue')].Properties.ContentBasedDeduplication = true;
    Resources[prefixed('DeadLetterQueue')].Properties.QueueName = cf.join([cf.stackName, '-', prefixed('DeadLetterQueue'), '.fifo']);
  }

  if (options.fifo) {
    Resources[prefixed('Queue')].Properties.FifoQueue = true;
    Resources[prefixed('Queue')].Properties.ContentBasedDeduplication = true;
    Resources[prefixed('Queue')].Properties.QueueName = cf.join([cf.stackName, '-', prefixed('Queue'), '.fifo']);
  }

  if (!options.fifo) Resources[prefixed('Topic')] = {
    Type: 'AWS::SNS::Topic',
    Properties: {
      Subscription: [
        {
          Endpoint: cf.getAtt(prefixed('Queue'), 'Arn'),
          Protocol: 'sqs'
        }
      ]
    }
  };

  if (!options.fifo) Resources[prefixed('QueuePolicy')] = {
    Type: 'AWS::SQS::QueuePolicy',
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

  if (options.dashboard) {
    Resources[prefixed('Dashboard')] = {
      Type: 'AWS::CloudWatch::Dashboard',
      Properties: {
        DashboardName: cf.join('-', [cf.ref('AWS::StackName'), prefixed(''), cf.region]),
        DashboardBody: cf.sub(dashboard, {
          WatchbotQueue: cf.getAtt(prefixed('Queue'), 'QueueName'),
          WatchbotDeadLetterQueue: cf.getAtt(prefixed('DeadLetterQueue'), 'QueueName'),
          WatchbotService: cf.getAtt(prefixed('Service'), 'Name'),
          Cluster: options.cluster,
          Prefix: options.prefix
        })
      }
    };
  }

  if (!options.fifo)
    Resources[prefixed('Role')].Properties.Policies[0].PolicyDocument.Statement.push({
      Effect: 'Allow',
      Action: 'sns:Publish',
      Resource: cf.ref(prefixed('Topic'))
    });

  if (options.permissions)
    Resources[prefixed('Role')].Properties.Policies.push({
      PolicyName: cf.join([cf.stackName, '-user-defined-worker']),
      PolicyDocument: {
        Statement: options.permissions
      }
    });

  if (options.reduce) {
    const tableName = cf.join('-', [cf.stackName, prefixed('-progress')]);
    const tableThroughput = {
      readCapacityUnits: options.readCapacityUnits,
      writeCapacityUnits: options.writeCapacityUnits
    };

    Resources[prefixed('ProgressTable')] = table(tableName, tableThroughput);

    const tableArn = cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref(prefixed('ProgressTable'))]);

    Resources[prefixed('ProgressTablePermission')] = {
      Type: 'AWS::IAM::Policy',
      Properties: {
        Roles: [cf.ref(prefixed('Role'))],
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

    ref.progressTable = cf.ref(prefixed('ProgressTable'));

    options.env.ProgressTable = tableArn;
  }

  Resources[prefixed('Task')] = {
    Type: 'AWS::ECS::TaskDefinition',
    Properties: {
      TaskRoleArn: cf.ref(prefixed('Role')),
      Family: options.family,
      RequiresCompatibilities: cf.if(prefixed('CapacityIsNotEC2'), ['FARGATE'], cf.noValue),
      ContainerDefinitions: [
        {
          Image: cf.join([
            cf.accountId,
            '.dkr.ecr.',
            cf.findInMap('EcrRegion', cf.region, 'Region'),
            '.',
            cf.urlSuffix,
            '/',
            options.service,
            ':',
            options.serviceVersion
          ]),
          MemoryReservation: options.reservation.softMemory,
          Environment: unpackEnv(options.env, mounts.mountPoints),
          MountPoints: mounts.mountPoints,
          Ulimits: [
            {
              Name: 'nofile',
              SoftLimit: 10240,
              HardLimit: 10240
            }
          ],
          ReadonlyRootFilesystem: cf.if(prefixed('CapacityIsEC2'), !options.writableFilesystem, cf.noValue),
        }
      ],
      Volumes: mounts.volumes
    }
  };

  Resources[prefixed('Service')] = {
    Type: 'AWS::ECS::Service',
    Properties: {
      NetworkConfiguration: cf.if(
        prefixed('CapacityIsNotEC2'),
        {
          AwsvpcConfiguration: {
            AssignPublicIp: options.fargatePublicIp,
            SecurityGroups: options.fargateSecurityGroups,
            Subnets: options.fargateSubnets
          }
        },
        cf.noValue
      ),
      CapacityProviderStrategy: cf.if(
        prefixed('CapacityIsFargateSpot'),
        [{ CapacityProvider: 'FARGATE_SPOT', Weight: 1 }],
        cf.noValue
      ),
      LaunchType: cf.if(prefixed('CapacityIsFargate'), 'FARGATE', cf.noValue)
    }
  };

  if (options.placementConstraints)
    Resources[prefixed('Service')].Properties.PlacementConstraints =
      options.placementConstraints;

  if (options.placementStrategies)
    Resources[prefixed('Service')].Properties.PlacementStrategies =
      options.placementStrategies;

  Resources[prefixed('ScalingRole')] = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['application-autoscaling.amazonaws.com'] },
            Action: ['sts:AssumeRole']
          }
        ]
      },
      Path: '/',
      Policies: [
        {
          PolicyName: 'watchbot-autoscaling',
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'application-autoscaling:*',
                  'cloudwatch:DescribeAlarms',
                  'cloudwatch:PutMetricAlarm',
                  'ecs:UpdateService',
                  'ecs:DescribeServices'
                ],
                Resource: '*'
              }
            ]
          }
        }
      ]
    }
  };

  Resources[prefixed('ScalingTarget')] = {
    Type: 'AWS::ApplicationAutoScaling::ScalableTarget',
    Properties: {
      ServiceNamespace: 'ecs',
      ScalableDimension: 'ecs:service:DesiredCount',
      ResourceId: cf.join([
        'service/',
        options.cluster,
        '/',
        cf.getAtt(prefixed('Service'), 'Name')
      ]),
      MinCapacity: options.minSize,
      MaxCapacity: options.maxSize,
      RoleARN: cf.getAtt(prefixed('ScalingRole'), 'Arn')
    }
  };

  Resources[prefixed('ScaleUp')] = {
    Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
    Properties: {
      ScalingTargetId: cf.ref(prefixed('ScalingTarget')),
      PolicyName: cf.sub('${AWS::StackName}-scale-up'),
      PolicyType: 'StepScaling',
      StepScalingPolicyConfiguration: {
        AdjustmentType: 'ChangeInCapacity',
        Cooldown: 300,
        MetricAggregationType: 'Average',
        StepAdjustments: [
          {
            ScalingAdjustment: cf.getAtt(prefixed('CustomScalingResource'), 'ScalingAdjustment'),
            MetricIntervalLowerBound: 0.0
          }
        ]
      }
    }
  };

  Resources[prefixed('ScaleUpTrigger')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('-scale-up')]),
      AlarmDescription: 'Scale up due to visible messages in queue',
      EvaluationPeriods: 1,
      Statistic: 'Maximum',
      Threshold: 0,
      Period: 300,
      ComparisonOperator: 'GreaterThanThreshold',
      Namespace: 'AWS/SQS',
      Dimensions: [
        { Name: 'QueueName', Value: cf.getAtt(prefixed('Queue'), 'QueueName') }
      ],
      MetricName: 'ApproximateNumberOfMessagesVisible',
      AlarmActions: [cf.ref(prefixed('ScaleUp'))]
    }
  };

  Resources[prefixed('ScaleDown')] = {
    Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
    Properties: {
      ScalingTargetId: cf.ref(prefixed('ScalingTarget')),
      PolicyName: cf.sub(prefixed('${AWS::StackName}-scale-down')),
      PolicyType: 'StepScaling',
      StepScalingPolicyConfiguration: {
        AdjustmentType: 'PercentChangeInCapacity',
        Cooldown: 300,
        MetricAggregationType: 'Average',
        StepAdjustments: [
          {
            ScalingAdjustment: -100,
            MetricIntervalUpperBound: 0.0
          }
        ]
      }
    }
  };

  Resources[prefixed('ScaleDownTrigger')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('-scale-down')]),
      AlarmDescription:
        'Scale down due to lack of in-flight messages in queue',
      EvaluationPeriods: 1,
      Statistic: 'Maximum',
      Threshold: 1,
      Period: 600,
      ComparisonOperator: 'LessThanThreshold',
      Namespace: 'Mapbox/ecs-watchbot',
      Dimensions: [
        { Name: 'QueueName', Value: cf.getAtt(prefixed('Queue'), 'QueueName') }
      ],
      MetricName: 'TotalMessages',
      AlarmActions: [cf.ref(prefixed('ScaleDown'))]
    }
  };

  if (options.deadletterAlarm) {
    Resources[prefixed('DeadLetterAlarm')] = {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('-dead-letter'), cf.region]),
        AlarmDescription:
          'Provides notification when messages are visible in the dead letter queue',
        EvaluationPeriods: 1,
        Statistic: 'Minimum',
        Threshold: 1,
        Period: '60',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Namespace: 'AWS/SQS',
        Dimensions: [
          { Name: 'QueueName', Value: cf.getAtt(prefixed('DeadLetterQueue'), 'QueueName') }
        ],
        MetricName: 'ApproximateNumberOfMessagesVisible',
        AlarmActions: [notify]
      }
    };
  }

  Resources[prefixed('WorkerErrorsMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      FilterPattern: '"[failure]"',
      LogGroupName: cf.ref(prefixed('LogGroup')),
      MetricTransformations: [{
        MetricName: cf.join([prefixed('WorkerErrors-'), cf.stackName]),
        MetricNamespace: 'Mapbox/ecs-watchbot',
        MetricValue: 1
      }]
    }
  };

  Resources[prefixed('WorkerErrorsAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('-worker-errors'), cf.region]),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#workererrors`,
      EvaluationPeriods: 1,
      Statistic: 'Sum',
      Threshold: options.errorThreshold,
      Period: '60',
      ComparisonOperator: 'GreaterThanThreshold',
      Namespace: 'Mapbox/ecs-watchbot',
      MetricName: cf.join([prefixed('WorkerErrors-'), cf.stackName]),
      AlarmActions: [notify]
    }
  };

  Resources[prefixed('QueueSizeAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('-queue-size'), cf.region]),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#queuesize`,
      EvaluationPeriods: options.alarmPeriods,
      Statistic: 'Average',
      Threshold: options.alarmThreshold,
      Period: '300',
      ComparisonOperator: 'GreaterThanThreshold',
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Dimensions: [
        {
          Name: 'QueueName',
          Value: cf.getAtt(prefixed('Queue'), 'QueueName')
        }
      ],
      AlarmActions: [notify]
    }
  };

  Resources[prefixed('WorkerDurationMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      LogGroupName: cf.ref(prefixed('LogGroup')),
      FilterPattern: '{ $.duration = * }',
      MetricTransformations: [
        {
          MetricName: cf.join([prefixed('WorkerDuration-'), cf.stackName]),
          MetricNamespace: 'Mapbox/ecs-watchbot',
          MetricValue: '$.duration'
        }
      ]
    }
  };

  Resources[prefixed('MessageReceivesMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      LogGroupName: cf.ref(prefixed('LogGroup')),
      FilterPattern: '{ $.receives = * }',
      MetricTransformations: [
        {
          MetricName: cf.join([prefixed('MessageReceives-'), cf.stackName]),
          MetricNamespace: 'Mapbox/ecs-watchbot',
          MetricValue: '$.receives'
        }
      ]
    }
  };

  Resources[prefixed('ResponseDurationMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      LogGroupName: cf.ref(prefixed('LogGroup')),
      FilterPattern: '{ $.response_duration = * }',
      MetricTransformations: [
        {
          MetricName: cf.join([prefixed('ResponseDuration-'), cf.stackName]),
          MetricNamespace: 'Mapbox/ecs-watchbot',
          MetricValue: '$.response_duration'
        }
      ]
    }
  };

  Resources[prefixed('AlarmMemoryUtilization')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.join('-', [cf.ref('AWS::StackName'), prefixed('MemoryUtilization'), cf.region]),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#memoryutilization`,
      Namespace: 'AWS/ECS',
      MetricName: 'MemoryUtilization',
      ComparisonOperator: 'GreaterThanThreshold',
      Threshold: 100,
      EvaluationPeriods: 10,
      Statistic: 'Average',
      Period: 60,
      AlarmActions: [notify],
      Dimensions: [
        {
          Name: 'ClusterName',
          Value: options.cluster
        },
        {
          Name: 'ServiceName',
          Value: cf.getAtt(prefixed('Service'), 'Name')
        }
      ]
    }
  };

  Resources[prefixed('LambdaScalingRole')] = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['lambda.amazonaws.com'] },
            Action: ['sts:AssumeRole']
          }
        ]
      },
      Policies: [{
        PolicyName: 'CustomcfnScalingLambdaLogs',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'logs:*'
              ],
              Resource: cf.join([
                'arn:',
                cf.partition,
                ':logs:*:*:*'
              ])
            }
          ]
        }
      }]
    }
  };

  Resources[prefixed('ScalingLambda')] = {
    Type: 'AWS::Lambda::Function',
    Properties: {
      Handler: 'index.handler',
      Role: cf.getAtt(prefixed('LambdaScalingRole'), 'Arn'),
      Code: {
        ZipFile: cf.sub(`
          const response = require('./cfn-response');
          exports.handler = function(event,context){
            const result = Math.round(Math.max(Math.min(parseInt(event.ResourceProperties.maxSize) / 10, 100), 1));
            response.send(event, context, response.SUCCESS, { ScalingAdjustment: result });
          }
          `)
      },
      Runtime: 'nodejs18.x'
    }
  };

  Resources[prefixed('CustomScalingResource')] = {
    Type: 'AWS::CloudFormation::CustomResource',
    Properties: {
      ServiceToken: cf.getAtt(prefixed('ScalingLambda'), 'Arn'),
      maxSize: options.maxSize
    }
  };

  Resources[prefixed('TotalMessagesLambda')] = {
    Type: 'AWS::Lambda::Function',
    Properties: {
      Handler: 'index.handler',
      Role: cf.getAtt(prefixed('LambdaTotalMessagesRole'), 'Arn'),
      Timeout: 60,
      Code: {
        ZipFile: cf.sub(`
          const AWS = require('aws-sdk');
          exports.handler = function(event, context, callback) {
            const sqs = new AWS.SQS({ region: process.env.AWS_DEFAULT_REGION });
            const cw = new AWS.CloudWatch({ region: process.env.AWS_DEFAULT_REGION });

            return sqs.getQueueAttributes({
              QueueUrl: ${'\'${QueueUrl}\''},
              AttributeNames: ['ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessages']
            }).promise()
              .then((attrs) => {
                return cw.putMetricData({
                  Namespace: 'Mapbox/ecs-watchbot',
                  MetricData: [{
                    MetricName: 'TotalMessages',
                    Dimensions: [{ Name: 'QueueName', Value: ${'\'${QueueName}\''} }],
                    Value: Number(attrs.Attributes.ApproximateNumberOfMessagesNotVisible) +
                            Number(attrs.Attributes.ApproximateNumberOfMessages)
                  }]
                }).promise();
              })
              .then((metric) => callback(null, metric))
              .catch((err) => callback(err));
          }
        `, {
          QueueUrl: cf.ref(prefixed('Queue')),
          QueueName: cf.getAtt(prefixed('Queue'), 'QueueName')
        })
      },
      Runtime: 'nodejs18.x'
    }
  };

  Resources[prefixed('LambdaTotalMessagesRole')] = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['lambda.amazonaws.com'] },
            Action: ['sts:AssumeRole']
          }
        ]
      },
      Policies: [{
        PolicyName: 'LambdaTotalMessagesMetric',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'logs:*'
              ],
              Resource: cf.join([
                'arn:',
                cf.partition,
                ':logs:*:*:*'
              ])
            },
            {
              Effect: 'Allow',
              Action: [
                'cloudwatch:PutMetricData'
              ],
              Resource: '*'
            },
            {
              Effect: 'Allow',
              Action: [
                'sqs:GetQueueAttributes'
              ],
              Resource: cf.getAtt(prefixed('Queue'), 'Arn')
            }
          ]
        }
      }]
    }
  };

  Resources[prefixed('TotalMessagesSchedule')] = {
    Type: 'AWS::Events::Rule',
    Properties: {
      Description: 'Update TotalMessages metric every minute',
      Name: cf.join('-', [cf.stackName, prefixed('-total-messages')]),
      ScheduleExpression: 'cron(0/1 * * * ? *)',
      Targets: [{ Arn: cf.getAtt(prefixed('TotalMessagesLambda'), 'Arn'), Id: prefixed('TotalMessagesLambda') }]
    }
  };

  Resources[prefixed('MetricSchedulePermission')] = {
    Type: 'AWS::Lambda::Permission',
    Properties: {
      Action: 'lambda:InvokeFunction',
      FunctionName: cf.getAtt(prefixed('TotalMessagesLambda'), 'Arn'),
      Principal: 'events.amazonaws.com',
      SourceArn: cf.getAtt(prefixed('TotalMessagesSchedule'), 'Arn')
    }
  };

  const outputs = {
    ClusterArn: {
      Description: 'Service cluster ARN',
      Value: options.cluster
    }
  };

  outputs[prefixed('DeadLetterQueueUrl')] = {
    Description: 'The URL for the dead letter queue',
    Value: cf.ref(prefixed('DeadLetterQueue'))
  };

  outputs[prefixed('QueueUrl')] = {
    Description: 'The URL for the primary work queue',
    Value: cf.ref(prefixed('Queue'))
  };

  outputs[prefixed('LogGroup')] = {
    Description: 'The ARN of Watchbot\'s log group',
    Value: cf.getAtt(prefixed('LogGroup'), 'Arn')
  };

  /**
   * The Watchbot template builder output object
   *
   * @name WatchbotOutput
   * @property {object} Conditions - A CloudFormation Conditions object
   * @property {object} Resources - A CloudFormation Resources object
   * @property {object} Mappings - A CloudFormation Mappings object
   * @property {object} refs - a set of CloudFormation `Ref`s to important
   * Watchbot resources. These references are only useful in the context of a
   * CloudFormation template.
   * @property {object} refs.logGroup - the name of the CloudWatch LogGroup to
   * which Watchbot logs.
   * @property {object} refs.topic - the ARN for Watchbot's SNS topic. Publish
   * messages to this topic to trigger processing.
   * @property {object} refs.queueUrl - the URL for Watchbot's SQS queue.
   * @property {object} refs.queueArn - the ARN for Watchbot's SQS queue.
   */
  return {
    Conditions: Conditions,
    Resources: Resources,
    Metadata: {
      EcsWatchbotVersion: pkg.version
    },
    Mappings: {
      EcrRegion: {
        'us-east-1': {
          Region: 'us-east-1'
        },
        'us-west-1': {
          Region: 'us-west-2'
        },
        'us-west-2': {
          Region: 'us-west-2'
        },
        'eu-central-1': {
          Region: 'eu-west-1'
        },
        'eu-west-1': {
          Region: 'eu-west-1'
        },
        'ap-northeast-1': {
          Region: 'us-west-2'
        },
        'ap-southeast-1': {
          Region: 'us-west-2'
        },
        'ap-southeast-2': {
          Region: 'us-west-2'
        },
        'us-east-2': {
          Region: 'us-east-1'
        },
        'cn-north-1': {
          Region: 'cn-north-1'
        },
        'cn-northwest-1': {
          Region: 'cn-northwest-1'
        }
      }
    },
    ref: ref,
    Outputs: outputs
  };
};

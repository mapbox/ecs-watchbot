'use strict';

const cf = require('@mapbox/cloudfriend');

/**
 * Builds Watchbot resources for you to include in a CloudFormation template
 *
 * @param {Object} options - configuration parameters
 * @param {String|ref} options.cluster - the ARN for the ECS cluster that will
 * host Watchbot's containers.
 * @param {String} options.service - the name of your service. This is usually
 * the name of your Github repository. It **must** match the name of the ECR
 * repository where your images are stored.
 * @param {String|ref} options.serviceVersion - the version of you service to
 * deploy. This should reference a specific image in ECR.
 * @param {String} options.command - the shell command that should be executed
 * in order to process a single message.
 * @param {Array} [options.permissions=[]] - permissions that your worker will
 * need in order to complete tasks.
 * @param {Object} [options.env={}] - key-value pairs that will be provided to
 * the worker containers as environment variables. Keys must be strings, and
 * values can either be strings or references to other CloudFormation resources
 * via `{"Ref": "..."}`.
 * @param {String} [options.prefix='Watchbot'] - a prefix that will be applied
 * to the logical names of all the resources Watchbot creates. If you're
 * building a template that includes more than one Watchbot system, you'll need
 * to specify this in order to differentiate the resources.
 * @param {String} [options.family] - the name of the the task definition family
 * that watchbot will create revisions of.
 * @param {Number|ref} [options.workers=1] - the maximum number of worker
 * containers that can be launched to process jobs concurrently. This parameter
 * can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {String} [options.mounts=''] - if your worker containers need to mount
 * files or folders from the host EC2 file system, specify those mounts with this parameter.
 * A single persistent mount point can be specified as `{host location}:{container location}`,
 * e.g. /root:/mnt/root. A single ephemeral mount point can be specified as `{container location}`,
 * e.g. /mnt/tmp. Separate multiple mount strings with commas if you need to mount
 * more than one location. You can also specify a mount object with `container`
 * and `host` property arrays, in which the indeces
 * correspond: `{ container: [{container location}], host: [{host location}] }`,
 * e.g. { container: [/mnt/root, /mnt/tmp], host: [/root, ''] }. A blank host
 * entry will create an ephemeral mount point at the corresponding container filepath.
 * @param {Object} [options.reservation={}] - worker container resource reservations
 * @param {Number|ref} [options.reservation.memory] - the number of MB of RAM
 * to reserve as a hard limit. If your worker container tries to utilize more
 * than this much RAM, it will be shut down. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.reservation.softMemory] - the number of MB of
 * RAM to reserve as a soft limit. Your worker container will be able to utilize
 * more than this much RAM if it happens to be available on the host. This
 * parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.reservation.cpu] - the number of CPU units to
 * reserve for your worker container. This will only impact the placement of
 * your container on an EC2 with sufficient CPU capacity, but will not limit
 * your container's utilization. This parameter can be provided as either a
 * number or a reference, i.e. `{"Ref": "..."}`.
 * @param {string|ref} [options.notificationTopic] - an ARN of the SNS topic to receive
 * notifications when processing fails.
 * @param {Boolean} [options.privileged=false] - give the container elevated
 * privileges on the host container instance
 * @param {Number|ref} [options.messageTimeout=600] - once Watchbot pulls a
 * message from SQS and spawns a worker to process it, SQS will wait this many
 * seconds for a response. If the worker has not yet finished processing the
 * message for any reason, SQS will make the message visible again and Watchbot
 * will spawn another worker to process it. This is helpful when containers or
 * processing scripts crash, but make sure that it allows sufficient time for
 * routine processing to occur. If set too low, you will end up processing jobs
 * multiple times. This parameter can be provided as either a number or a
 * reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.messageRetention=1209600] - the number of seconds
 * that a message will exist in SQS until it is deleted. The default value is
 * the maximum time that SQS allows, 14 days. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.errorThreshold=10] - Watchbot creates a
 * CloudWatch alarm that will fire if there have been more than this number
 * of failed worker invocations in a 60 second period. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.alarmThreshold=40] - Watchbot creates a
 * CloudWatch alarm that will go off when there have been too many messages in
 * SQS for a certain period of time. Use this parameter to adjust the Threshold
 * number of messages to trigger the alarm. This parameter can be provided as
 * either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.alarmPeriods=24] - Use this parameter to control
 * the duration that the SQS queue must be over the message threshold before
 * triggering an alarm. You specify the number of 5-minute periods before an
 * alarm is triggered. The default is 24 periods, or 2 hours. This parameter
 * can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
 * @param {Number|ref} [options.failedPlacementAlarmPeriods=1] - Use this
 * parameter to control the duration for which the failed placements exceed
 * the threshold of 5 before triggering an alarm. You specify the number
 * of 1-minute periods before an alarm is triggered. The default is 1 period, or
 * 1 minute. This parameter can be provided as either a number or a reference,
 * i.e. `{"Ref": "..."}`.
 */
module.exports = (options = {}) => {
  ['service', 'serviceVersion', 'command', 'cluster'].forEach((required) => {
    if (!options[required]) throw new Error(`options.${required} is required`);
  });

  options = Object.assign(
    {
      prefix: 'Watchbot',
      reservation: {},
      env: {},
      messageTimeout: 600,
      messageRetention: 1209600,
      workers: 1,
      mounts: '',
      privileged: false,
      family: options.service,
      errorThreshold: 1,
      alarmThreshold: 1,
      alarmPeriods: 1,
      failedPlacementAlarmPeriods: 1
    },
    options
  );

  const prefixed = (name) => `${options.prefix}${name}`;

  const unpackEnv = (env) => {
    return Object.keys(env).reduce(
      (unpacked, key) => {
        unpacked.push({ Name: key, Value: env[key] });
        return unpacked;
      },
      [
        { Name: 'WorkTopic', Value: cf.ref(prefixed('Topic')) },
        { Name: 'QueueUrl', Value: cf.ref(prefixed('Queue')) }
      ]
    );
  };

  const mount = (mountInputs) => {
    let formatted = { container: [], host: [] };
    const mounts = {
      mountPoints: [],
      volumes: []
    };

    if (typeof mountInputs === 'object') formatted = mountInputs;
    if (typeof mountInputs === 'string') {
      mountInputs.split(',').forEach((mountStr) => {
        if (!mountStr.length) return;

        const persistent = /:/.test(mountStr);
        formatted.container.push(
          persistent ? mountStr.split(':')[1] : mountStr
        );
        formatted.host.push(persistent ? mountStr.split(':')[0] : '');
      });
    }

    formatted.container.forEach((container, i) => {
      const name = 'mnt-' + i;
      const host = formatted.host[i] ? { SourcePath: formatted.host[i] } : {};

      mounts.mountPoints.push({ ContainerPath: container, SourceVolume: name });
      mounts.volumes.push({ Name: name, Host: host });
    });

    if (!mounts.mountPoints.length) {
      mounts.mountPoints = undefined;
      mounts.volumes = undefined;
    }

    return mounts;
  };

  const mounts = mount(options.mounts);
  const Resources = {};

	var references = {
		logGroup: cf.ref(prefixed('Logs')),
		notificationTopic: cf.ref(prefixed('NotificationTopic'))
	};

  if (options.notificationTopic && options.notificationEmail) throw new Error('Cannot provide both notificationTopic and notificationEmail.');
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

  Resources[prefixed('DeadLetterQueue')] = {
    Type: 'AWS::SQS::Queue',
    Description: 'List of messages that failed to process 14 times',
    Properties: {
      QueueName: cf.join([cf.stackName, '-', prefixed('DeadLetterQueue')]),
      MessageRetentionPeriod: 1209600
    }
  };

  Resources[prefixed('Queue')] = {
    Type: 'AWS::SQS::Queue',
    Properties: {
      VisibilityTimeout: options.messageTimeout,
      QueueName: cf.join([cf.stackName, '-', prefixed('Queue')]),
      MessageRetentionPeriod: options.messageRetention,
      RedrivePolicy: {
        deadLetterTargetArn: cf.getAtt(prefixed('DeadLetterQueue'), 'Arn'),
        maxReceiveCount: 10
      }
    }
  };

  Resources[prefixed('Topic')] = {
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

  Resources[prefixed('QueuePolicy')] = {
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

  Resources[prefixed('Logs')] = {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: cf.join('-', [
        cf.stackName,
        cf.region,
        options.prefix.toLowerCase()
      ]),
      RetentionInDays: 14
    }
  };

  Resources[prefixed('Role')] = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['ecs-tasks.amazonaws.com'] },
            Action: ['sts:AssumeRole']
          }
        ]
      },
      Policies: [
        {
          PolicyName: cf.join([cf.stackName, '-default-worker']),
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: 'sns:Publish',
                Resource: cf.ref(prefixed('Topic'))
              },
              {
                Effect: 'Allow',
                Action: [
                  'sqs:ReceiveMessage',
                  'sqs:DeleteMessage',
                  'sqs:ChangeMessageVisibility'
                ],
                Resource: cf.getAtt(prefixed('Queue'), 'Arn')
              },
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'logs:FilterLogEvents'
                ],
                Resource: cf.getAtt(prefixed('Logs'), 'Arn')
              },
              {
                Effect: 'Allow',
                Action: 'kms:Decrypt',
                Resource: cf.importValue('cloudformation-kms-production')
              }
            ]
          }
        }
      ]
    }
  };

  if (options.permissions)
    Resources[prefixed('Role')].Properties.Policies.push({
      PolicyName: cf.join([cf.stackName, '-user-defined-worker']),
      PolicyDocument: {
        Statement: options.permissions
      }
    });

  Resources[prefixed('Task')] = {
    Type: 'AWS::ECS::TaskDefinition',
    Properties: {
      TaskRoleArn: cf.ref(prefixed('Role')),
      Family: options.family,
      ContainerDefinitions: [
        {
          Name: prefixed(`-${options.service}`).toLowerCase(),
          Image: cf.join([
            cf.accountId,
            '.dkr.ecr.us-east-1.amazonaws.com/',
            options.service,
            ':',
            options.serviceVersion
          ]),
          Cpu: options.reservation.cpu,
          Privileged: options.privileged,
          Environment: unpackEnv(options.env),
          MountPoints: mounts.mountPoints,
          Command: ['watchbot', 'listen', `${options.command}`],
          Ulimits: [
            {
              Name: 'nofile',
              SoftLimit: 10240,
              HardLimit: 10240
            }
          ],
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-group': cf.ref(prefixed('Logs')),
              'awslogs-region': cf.region,
              'awslogs-stream-prefix': options.serviceVersion
            }
          }
        }
      ],
      Volumes: mounts.volumes
    }
  };

  if (options.reservation.memory)
    Resources[prefixed('Task')].Properties.ContainerDefinitions[0].Memory =
      options.reservation.memory;

  if (options.reservation.softMemory)
    Resources[
      prefixed('Task')
    ].Properties.ContainerDefinitions[0].MemoryReservation =
      options.reservation.softMemory;

  Resources[prefixed('Service')] = {
    Type: 'AWS::ECS::Service',
    Properties: {
      Cluster: options.cluster,
      DesiredCount: 0,
      TaskDefinition: cf.ref(prefixed('Task'))
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
      MinCapacity: 0,
      MaxCapacity: options.workers,
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
            ScalingAdjustment: Math.ceil(options.workers / 10),
            MetricIntervalLowerBound: 0.0
          }
        ]
      }
    }
  };

  Resources[prefixed('ScaleUpTrigger')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.sub('${AWS::StackName}-scale-up'),
      AlarmDescription: 'Scale up workers due to visible messages in queue',
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
      PolicyName: cf.sub('${AWS::StackName}-scale-down'),
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
      AlarmName: cf.sub('${AWS::StackName}-scale-down'),
      AlarmDescription:
        'Scale down workers due to lack of in-flight messages in queue',
      EvaluationPeriods: 1,
      Statistic: 'Maximum',
      Threshold: 1,
      Period: 600,
      ComparisonOperator: 'LessThanThreshold',
      Namespace: 'AWS/SQS',
      Dimensions: [
        { Name: 'QueueName', Value: cf.getAtt(prefixed('Queue'), 'QueueName') }
      ],
      MetricName: 'ApproximateNumberOfMessagesNotVisible',
      AlarmActions: [cf.ref(prefixed('ScaleDown'))]
    }
  };

  Resources[prefixed('DeadLetterAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.sub('${AWS::StackName}-dead-letter'),
      AlarmDescription:
        'Provides notification when messages are visible in the dead letter queue',
      EvaluationPeriods: 1,
      Statistic: 'Minimum',
      Threshold: 1,
      Period: 60,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Namespace: 'AWS/SQS',
      Dimensions: [
        { Name: 'QueueName', Value: cf.getAtt(prefixed('DeadLetterQueue'), 'QueueName') }
      ],
      MetricName: 'ApproximateNumberOfMessagesVisible',
      AlarmActions: [notify]
    }
  };

	Resources[prefixed('FailedWorkerPlacementMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      FilterPattern: '{ $.failedPlacement = true }',
      LogGroupName: cf.ref(prefixed('Logs')),
      MetricTransformations: [{
        MetricName: cf.join([prefixed('FailedWorkerPlacement-'), cf.stackName]),
        MetricNamespace: 'Mapbox/ecs-watchbot',
        MetricValue: 1
      }]
    }
  };


  Resources[prefixed('FailedworkerPlacementAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.sub('${AWS::StackName}-failed-worker-placement'),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#failedworkerplacement`,
      EvaluationPeriods: options.failedPlacementAlarmPeriods,
      Statistic: 'Sum',
      Threshold: 1,
      Period: 10,
      ComparisonOperator: 'GreaterThanThreshold',
      Namespace: 'Mapbox/ecs-watchbot',
      MetricName: cf.join([prefixed('FailedWorkerPlacement-'), cf.stackName]),
      AlarmActions: [notify]
    }
  };

	Resources[prefixed('WorkerErrorsMetric')] = {
    Type: 'AWS::Logs::MetricFilter',
    Properties: {
      FilterPattern: '{ $.outcome = "failed*" }',
      LogGroupName: cf.ref(prefixed('Logs')),
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
      AlarmName: cf.sub('${AWS::StackName}-worker-errors'),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#workererrors`,
      EvaluationPeriods: 1,
      Statistic: 'Sum',
      Threshold: options.errorThreshold,
      Period: 10,
      ComparisonOperator: 'GreaterThanThreshold',
      Namespace: 'Mapbox/ecs-watchbot',
      MetricName: cf.join([prefixed('WorkerErrors-'), cf.stackName]),
      AlarmActions: [notify]
    }
  };

  Resources[prefixed('QueueSizeAlarm')] = {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: cf.sub('${AWS::StackName}-queue-size'),
      AlarmDescription:
        `https://github.com/mapbox/ecs-watchbot/blob/${options.watchbotVersion}/docs/alarms.md#queuesize`,
      EvaluationPeriods: options.alarmPeriods,
      Statistic: 'Average',
      Threshold: options.alarmThreshold,
      Period: 60,
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

  return cf.merge({ Resources });
};

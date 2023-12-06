import { App, Arn, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { FargateWatchbot, WatchbotProps } from '../lib/watchbot';
import { Template } from 'aws-cdk-lib/assertions';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';

const defaultProps = {
  prefix: 'Watchbot',
  containerName: `Watchbot-test-stack`,
  structuredLogging: false,
  writableFileSystem: false,
  maxJobDuration: Duration.seconds(0),
  family: 'serviceName',
  command: ['watchbot', 'listen'],

  publicIP: false,
  privileged: false,
  logGroupName: `test-stack-us-east-1-watchbot`,
  logGroupRetentionDays: RetentionDays.TWO_WEEKS,
  mountPoints: [
    {
      containerPath: '/tmp',
      sourceVolume: 'tmp',
      readOnly: true
    }
  ],
  volumes: [
    {
      name: 'tmp'
    }
  ],

  fifo: false,
  deadLetterThreshold: 10,
  retentionPeriod: Duration.days(14)
};

const staticRequiredProps = {
  command: ['echo', 'hello'],
  serviceVersion: '1.0.0'
};

describe('FargateWatchbot', () => {
  let stack: Stack;
  let template: Template;

  const createStack = (h: Partial<WatchbotProps>) =>
    new (class DummyStack extends Stack {
      constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const requiredProps: WatchbotProps = {
          ...staticRequiredProps,
          image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
          serviceName: 'test-service',
          deploymentEnvironment: 'staging',
          alarms: {
            action: Topic.fromTopicArn(
              this,
              'Topic',
              Arn.format({
                account: '222258372212',
                region: 'us-east-1',
                partition: 'aws',
                service: 'sns',
                resource: 'on-call-production-us-east-1-data-platform'
              })
            )
          }
        };

        new FargateWatchbot(this, 'MyWatchbot', {
          ...requiredProps,
          ...h
        });
      }
    })(new App(), 'test-stack', {
      stackName: 'test-stack',
      env: {
        region: 'us-east-1',
        account: '222258372212'
      }
    });

  describe('When passing the minimal required props', () => {
    beforeEach(() => {
      stack = createStack({});
      template = Template.fromStack(stack);
    });

    it('creates a LogGroup', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: defaultProps.logGroupName,
        RetentionInDays: defaultProps.logGroupRetentionDays
      });
    });

    it('creates a TaskDefinition', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '256',
        Memory: '512',
        RequiresCompatibilities: ['FARGATE'],
        Family: 'test-service',
        Volumes: defaultProps.volumes.map((v) => ({ Name: v.name })),
        ContainerDefinitions: [
          {
            Privileged: defaultProps.privileged,
            Image: 'amazon/amazon-ecs-sample',
            Command: [...defaultProps.command, ...staticRequiredProps.command],
            Environment: [
              { Name: 'QueueUrl', Value: {} },
              {
                Name: 'LogGroup',
                Value: { 'Fn::GetAtt': ['WatchbotLogGroup', 'Arn'] }
              },
              { Name: 'writableFilesystem', Value: 'false' },
              { Name: 'maxJobDuration', Value: '0' },
              { Name: 'Volumes', Value: '/tmp' },
              { Name: 'Fifo', Value: 'false' },
              { Name: 'structuredLogging', Value: 'false' },
              { Name: 'QUEUE_NAME', Value: {} },
              { Name: 'WorkTopic', Value: {} }
            ],
            LogConfiguration: {
              LogDriver: 'awslogs',
              Options: {
                'awslogs-group': {
                  Ref: 'WatchbotLogGroup'
                },
                'awslogs-region': 'us-east-1',
                'awslogs-stream-prefix': staticRequiredProps.serviceVersion
              }
            },
            MountPoints: [
              {
                ContainerPath: '/tmp',
                ReadOnly: true,
                SourceVolume: 'tmp'
              }
            ],
            ReadonlyRootFilesystem: true,
            Ulimits: [
              {
                HardLimit: 10240,
                Name: 'nofile',
                SoftLimit: 10240
              }
            ]
          }
        ]
      });
    });

    it('creates a Fargate service', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        PropagateTags: 'TASK_DEFINITION',
        ServiceName: 'test-service',
        Cluster: 'fargate-processing-staging',
        LaunchType: 'FARGATE',
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            AssignPublicIp: 'DISABLED'
          }
        }
      });
    });

    it('creates scaling resources', () => {
      template.hasResourceProperties(
        'AWS::ApplicationAutoScaling::ScalingPolicy',
        {
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'ECSServiceAverageCPUUtilization'
            },
            TargetValue: 50
          }
        }
      );
      template.hasResourceProperties(
        'AWS::ApplicationAutoScaling::ScalingPolicy',
        {
          PolicyType: 'StepScaling',
          StepScalingPolicyConfiguration: {
            AdjustmentType: 'ChangeInCapacity',
            MetricAggregationType: 'Maximum',
            StepAdjustments: [
              {
                MetricIntervalLowerBound: 0,
                MetricIntervalUpperBound: 400,
                ScalingAdjustment: 1
              },
              {
                MetricIntervalLowerBound: 400,
                ScalingAdjustment: 5
              }
            ]
          }
        }
      );

      // Scale up
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmActions: [{}],
        AlarmDescription: 'Upper threshold scaling alarm',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Dimensions: [
          {
            Name: 'QueueName'
          }
        ],
        EvaluationPeriods: 1,
        MetricName: 'ApproximateNumberOfMessagesVisible',
        Namespace: 'AWS/SQS',
        Period: 300,
        Statistic: 'Maximum',
        Threshold: 100
      });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmActions: [{}],
        AlarmDescription: 'Lower threshold scaling alarm',
        ComparisonOperator: 'LessThanOrEqualToThreshold',
        Dimensions: [
          {
            Name: 'QueueName'
          }
        ],
        EvaluationPeriods: 1,
        MetricName: 'ApproximateNumberOfMessagesVisible',
        Namespace: 'AWS/SQS',
        Period: 300,
        Statistic: 'Maximum',
        Threshold: 0
      });
    });

    it('creates a 2 SQS queue', () => {
      template.resourceCountIs('AWS::SQS::Queue', 2);

      // Queue
      template.hasResourceProperties('AWS::SQS::Queue', {
        ContentBasedDeduplication: defaultProps.fifo, // this is only true if fifo is true
        FifoQueue: defaultProps.fifo,
        MessageRetentionPeriod: defaultProps.retentionPeriod.toSeconds(),
        QueueName: 'test-stack-WatchbotQueue',
        RedrivePolicy: {
          maxReceiveCount: 10
        },
        VisibilityTimeout: 180
      });

      // DLQ
      template.hasResourceProperties('AWS::SQS::Queue', {
        ContentBasedDeduplication: defaultProps.fifo, // this is only true if fifo is true
        FifoQueue: defaultProps.fifo,
        MessageRetentionPeriod: defaultProps.retentionPeriod.toSeconds(),
        QueueName: 'test-stack-WatchbotDeadLetterQueue'
      });
    });

    it('creates an SNS topic', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'test-stack-WatchbotTopic'
      });

      template.resourceCountIs('AWS::SNS::Subscription', 1);
    });
  });

  describe('When passing overrides', () => {
    let props: Partial<WatchbotProps>;
    beforeEach(() => {
      props = {
        fifo: true,
        prefix: 'Tiles',
        logGroupRetentionDays: RetentionDays.THREE_MONTHS,
        retentionPeriod: Duration.days(3),
        serviceVersion: '2.3.1',
        command: ['python', 'main.py'],
        minScalingCapacity: 0,
        maxScalingCapacity: 244,
        cpu: 565,
        memoryReservationMiB: 1000,
        memoryLimitMiB: 4255,
        maxJobDuration: Duration.seconds(60),
        readonlyRootFilesystem: false,
        structuredLogging: true
      };
      stack = createStack(props);
      template = Template.fromStack(stack);
    });

    it('creates a LogGroup', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: 'test-stack-us-east-1-tiles',
        RetentionInDays: RetentionDays.THREE_MONTHS
      });
    });

    it('creates scaling resources', () => {
      template.hasResourceProperties(
        'AWS::ApplicationAutoScaling::ScalableTarget',
        {
          MaxCapacity: props.maxScalingCapacity,
          MinCapacity: props.minScalingCapacity,
          ScalableDimension: 'ecs:service:DesiredCount',
          ServiceNamespace: 'ecs'
        }
      );
    });

    it('creates a 2 SQS queue', () => {
      template.resourceCountIs('AWS::SQS::Queue', 2);

      // Queue
      template.hasResourceProperties('AWS::SQS::Queue', {
        ContentBasedDeduplication: props.fifo,
        FifoQueue: props.fifo,
        MessageRetentionPeriod: props.retentionPeriod?.toSeconds(),
        QueueName: 'test-stack-TilesQueue.fifo',
        RedrivePolicy: {
          maxReceiveCount: 10
        },
        VisibilityTimeout: 180
      });

      // DLQ
      template.hasResourceProperties('AWS::SQS::Queue', {
        ContentBasedDeduplication: props.fifo,
        FifoQueue: props.fifo,
        MessageRetentionPeriod: props.retentionPeriod?.toSeconds(),
        QueueName: 'test-stack-TilesDeadLetterQueue.fifo'
      });
    });

    it('creates a TaskDefinition', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '565',
        Memory: '4255',
        RequiresCompatibilities: ['FARGATE'],
        Family: 'test-service',
        Volumes: defaultProps.volumes.map((v) => ({ Name: v.name })),
        ContainerDefinitions: [
          {
            Privileged: defaultProps.privileged,
            Image: 'amazon/amazon-ecs-sample',
            Command: ['watchbot', 'listen', ...(props.command || [])],
            Environment: [
              { Name: 'QueueUrl', Value: {} },
              {
                Name: 'LogGroup',
                Value: { 'Fn::GetAtt': ['TilesLogGroup', 'Arn'] }
              },
              {
                Name: 'writableFilesystem',
                Value: (!props.readonlyRootFilesystem).toString()
              },
              {
                Name: 'maxJobDuration',
                Value: `${props.maxJobDuration?.toSeconds()}`
              },
              { Name: 'Volumes', Value: '/tmp' },
              { Name: 'Fifo', Value: props.fifo?.toString() },
              {
                Name: 'structuredLogging',
                Value: props.structuredLogging?.toString()
              },
              { Name: 'QUEUE_NAME', Value: {} }
            ],
            LogConfiguration: {
              LogDriver: 'awslogs',
              Options: {
                'awslogs-group': {
                  Ref: 'TilesLogGroup'
                },
                'awslogs-region': 'us-east-1',
                'awslogs-stream-prefix': props.serviceVersion
              }
            },
            MountPoints: [
              {
                ContainerPath: '/tmp',
                ReadOnly: true,
                SourceVolume: 'tmp'
              }
            ],
            ReadonlyRootFilesystem: props.readonlyRootFilesystem,
            Ulimits: [
              {
                HardLimit: 10240,
                Name: 'nofile',
                SoftLimit: 10240
              }
            ]
          }
        ]
      });
    });

    it('DOES NOT create an SNS topic', () => {
      template.resourceCountIs('AWS::SNS::Topic', 0);
    });
  });
});

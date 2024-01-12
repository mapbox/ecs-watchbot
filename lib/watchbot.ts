import { aws_dynamodb, Duration, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { ISecurityGroup, SubnetSelection, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  BaseService,
  Cluster,
  ContainerDefinition,
  ContainerImage,
  HealthCheck,
  ICluster,
  LogDrivers,
  MountPoint,
  PropagatedTagSource,
  RuntimePlatform,
  Secret,
  TaskDefinition,
  UlimitName,
  Volume
} from 'aws-cdk-lib/aws-ecs';
import { AnyPrincipal, PrincipalWithConditions } from 'aws-cdk-lib/aws-iam';
import { CfnLogGroup, FilterPattern, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { ScalingInterval } from 'aws-cdk-lib/aws-applicationautoscaling';
import {
  MapboxQueueProcessingFargateService,
  MapboxQueueProcessingFargateServiceProps
} from './MapboxQueueProcessingFargateService';
import { MonitoringFacade, SnsAlarmActionStrategy } from 'cdk-monitoring-constructs';
import * as path from 'path';
import { ComparisonOperator, Stats } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, CfnTable } from 'aws-cdk-lib/aws-dynamodb';

const pkg = require(path.resolve(__dirname, '..', 'package.json'));

export interface WatchbotProps {
  /**
   * @default {prefix}-${stackName}
   */
  readonly containerName?: string;

  /**
   * The intervals for scaling based on the SQS queue's ApproximateNumberOfMessagesVisible metric.
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#scalingsteps
   */
  readonly scalingSteps?: ScalingInterval[];

  /**
   * The runtime platform of the task definition.
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#runtimeplatform
   */
  readonly runtimePlatform?: RuntimePlatform;

  /**
   * The secret to expose to the container as an environment variable.
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#secrets
   */
  readonly secrets?: Record<string, Secret>;

  /**
   * The health check command and associated configuration parameters for the container.
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#healthcheck
   */
  readonly healthCheck?: HealthCheck;

  /**
   * Previously reservation.memory
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#memorylimitmib
   */
  readonly memoryLimitMiB?: number;

  /**
   * Previously reservation.cpu
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#cpu
   */
  readonly cpu?: number;

  readonly subnets?: SubnetSelection;
  /**
   * Whether the tasks' elastic network interface receives a public IP address. Should be `true` if `subnets` are public.
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-awsvpcconfiguration.html
   */
  readonly publicIP?: boolean;

  readonly securityGroups?: ISecurityGroup[];

  readonly image: ContainerImage;
  readonly cluster?: ICluster;

  /**
   * The name of the service.
   */
  readonly serviceName: string;

  /**
   * The command that is passed to the container. This will be appended to 'watchbot listen' command.
   */
  readonly command: string[];

  readonly deploymentEnvironment: string;

  /**
   * The version of your image to deploy. This should reference a specific image in ECR.
   */
  readonly serviceVersion: string;

  /**
   * The name of a family that the task definition is registered to.
   * @default uses serviceName
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#family
   */
  readonly family?: string;

  /**
   * Prefix to be added to some resource names
   * @default Watchbot
   */
  readonly prefix?: string;

  /**
   * @default {stackName}-{region}-{prefix}
   */
  readonly logGroupName?: string;

  /**
   * @default RetentionDays.TWO_WEEKS
   */
  readonly logGroupRetentionDays?: RetentionDays;

  /**
   * The number of times to retry a message before sending it to the dead-letter queue
   * @default 10
   */
  readonly deadLetterThreshold?: number;

  /**
   * The number of seconds that Amazon SQS retains a message
   * @default Duration.days(14)
   */
  readonly retentionPeriod?: Duration;

  /**
   * Specifies whether the container is marked as privileged. When this parameter is true, the container is given elevated privileges on the host container instance (similar to the root user)
   * @default false
   */
  readonly privileged?: boolean;

  /**
   * @default the `/tmp` directory is added as an ephemeral mount.
   */
  readonly mountPoints?: MountPoint[];
  /**
   * @default the '/tmp' directory
   */
  readonly volumes?: Volume[];

  /**
   * Whether to emit logs in JSON format or not
   * @default false
   */
  readonly structuredLogging?: boolean;

  /**
   * Give the container read-write access to the root file system. Previously writableFilesystem.
   * @default true
   * @see https://github.com/mapbox/ecs-watchbot/blob/master/docs/building-a-template.md#writablefilesystem-mode-explained
   */
  readonly readonlyRootFilesystem?: boolean;

  /**
   * The maximum duration that a job is allowed to run. After this time period, the worker will be stopped and the job will be returned to the queue.
   * @default 0
   */
  readonly maxJobDuration?: Duration;

  /**
   * Environment variables passed to the container running the task. This will always include QueueUrl, QUEUE_NAME, LogGroup (ARN), writableFilesystem, maxJobDuration (in seconds), Volumes (comma separated string), Fifo (ARN), WorkTopic (SNS topic ARN), structuredLogging (true or false string).
   * You can override or append to these variables.
   */
  readonly environment?: { [key: string]: string };

  /**
   * The soft limit (in MiB) of memory to reserve for the container. Previously reservation.softMemory
   * @default No memory reserved
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.ContainerDefinitionOptions.html#memoryreservationmib
   */
  readonly memoryReservationMiB?: number;

  /**
   * Whether to use a FIFO queue or a standard queue with SNS Topic
   * @default false
   * @see https://github.com/mapbox/ecs-watchbot/blob/master/docs/using-a-fifo-queue.md
   */
  readonly fifo?: boolean;

  /**
   * Previously maxSize
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#maxscalingcapacity
   */
  readonly maxScalingCapacity?: number;

  /**
   * Previously minSize
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.QueueProcessingFargateService.html#minscalingcapacity
   */
  readonly minScalingCapacity?: number;

  readonly alarms: WatchbotAlarms;

  /**
   * If this property is present, watchbot will run in reduce mode. Watchbot will be capable of helping track the progress of distributed map-reduce operations.
   * @default Does not run in reduce mode
   * @see https://github.com/mapbox/ecs-watchbot/blob/master/docs/reduce-mode.md
   */
  readonly reduceModeConfiguration?: {
    /**
     * Whether to run Watchbot in reduce mode
     */
    enabled: boolean;

    /**
     * @default 30
     */
    readCapacityUnits?: number;
    /**
     * @default 30
     */
    writeCapacityUnits?: number;
  };
}

export type WatchbotAlarms = {
  /**
   * SNS topic to send alarm actions to. In most cases, you'll need to get the topic ARN using mapbox-cdk-common ArnUtility.getOncallArn() then import that in CDK using `Topic.fromTopicArn`.
   */
  action: ITopic;

  /**
   * @default { threshold: 100, period: Duration.minutes(1), evaluationPeriods: 10 }
   */
  memoryUtilization?: AlarmProps;
  /**
   * @default { threshold: 90, period: Duration.minutes(1), evaluationPeriods: 10 }
   */
  cpuUtilization?: AlarmProps;
  /**
   * @default { threshold: 40, period: Duration.minutes(5), evaluationPeriods: 24 }
   */
  queueSize?: AlarmProps;
  /**
   * @default { threshold: 10, period: Duration.minutes(1), evaluationPeriods: 1 }
   */
  dlqSize?: AlarmProps;
  /**
   * @default { threshold: 10, period: Duration.minutes(1), evaluationPeriods: 1 }
   */
  workersErrors?: AlarmProps;
};

export type AlarmProps = {
  threshold?: number;
  evaluationPeriods?: number;
  period?: Duration;
};

enum SupportedRegion {
  UsEast1 = 'us-east-1',
  UsEast2 = 'us-east-2',
  ApNortheast1 = 'ap-northeast-1'
}

const VPC_IDs: { [key in SupportedRegion]: Record<string, string> } = {
  [SupportedRegion.UsEast1]: {
    production: 'vpc-048f5219a42f46f6a',
    staging: 'vpc-0df6a0c7af1559f9f'
  },
  [SupportedRegion.UsEast2]: {
    production: 'vpc-0a97415bec55cdb45',
    staging: 'vpc-0953e25515614814d'
  },
  [SupportedRegion.ApNortheast1]: {
    production: 'vpc-01848e03716cf0fa6',
    staging: 'vpc-02d9dc87cb2f3bc1a'
  }
};

const NETWORKING_STG_ACCOUNT_ID = '553571408602';
const NETWORKING_PROD_ACCOUNT_ID = '93972345615';

export class FargateWatchbot extends Resource {
  protected readonly props: WatchbotProps;
  public service: BaseService;
  public taskDefinition: TaskDefinition;

  public readonly cluster?: ICluster;
  public readonly logGroup: LogGroup;
  public readonly queue: IQueue;
  public readonly deadLetterQueue: IQueue;
  public readonly monitoring: MonitoringFacade;
  public readonly queueProcessingFargateService: MapboxQueueProcessingFargateService;
  public readonly topic: Topic | undefined;
  public readonly container: ContainerDefinition | undefined;
  public readonly table: aws_dynamodb.Table;

  private readonly RUNBOOK: string;
  private readonly scope: Construct;

  constructor(scope: Construct, id: string, props: WatchbotProps) {
    super(scope, id);
    this.scope = scope;

    if (!['production', 'staging'].includes(props.deploymentEnvironment)) {
      throw new Error(
        `deploymentEnvironment must be one of [staging, production] but received deploymentEnvironment=${props.deploymentEnvironment}`
      );
    }

    this.RUNBOOK = `https://github.com/mapbox/ecs-watchbot/blob/${pkg.version}/docs/alarms.md`;

    this.props = this.mergePropsWithDefaults(id, props);

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: this.props.logGroupName,
      retention: this.props.logGroupRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY
    });
    (this.logGroup.node.defaultChild as CfnLogGroup).overrideLogicalId(this.prefixed('LogGroup'));

    // workaround for a bug when you set fifo = false
    // https://github.com/aws/aws-cdk/issues/8550
    const additionalFifoProperties = this.props.fifo? { fifo: true, contentBasedDeduplication: true } : { contentBasedDeduplication: false };

    this.deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      queueName: `${this.stack.stackName}-${this.prefixed('DeadLetterQueue')}`,
      retentionPeriod: this.props.retentionPeriod || Duration.days(14),
      ...additionalFifoProperties
    });

    this.queue = new Queue(this, 'Queue', {
      queueName: `${this.stack.stackName}-${this.prefixed('Queue')}`,
      retentionPeriod: this.props.retentionPeriod || Duration.days(14),
      visibilityTimeout: Duration.seconds(180),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: this.props.deadLetterThreshold || 10
      },
      ...additionalFifoProperties
    });

    this.cluster = this.props.cluster;

    const queueProcessingFargateServiceProps: MapboxQueueProcessingFargateServiceProps = {
      // Service props
      serviceName: this.props.serviceName,

      // Task Definition props
      cpu: this.props.cpu,
      memoryLimitMiB: this.props.memoryLimitMiB,
      family: this.props.family,
      runtimePlatform: this.props.runtimePlatform,
      volumes: this.props.volumes,
      privileged: this.props.privileged,
      readonlyRootFilesystem: this.props.readonlyRootFilesystem,
      memoryReservationMiB: this.props.memoryReservationMiB,

      // Container props
      image: this.props.image,
      containerName: this.props.containerName,
      environment: {
        QueueUrl: this.queue.queueUrl,
        LogGroup: this.logGroup.logGroupArn,
        writableFilesystem: (!this.props.readonlyRootFilesystem)?.toString() || '',
        maxJobDuration: `${this.props.maxJobDuration?.toSeconds() || 0}`,
        Volumes: (this.props.mountPoints || []).map((m) => m.containerPath).join(','),
        Fifo: (this.props.fifo || false).toString(),
        structuredLogging: (this.props.structuredLogging || false).toString(),
        ...this.props.environment
      },
      secrets: this.props.secrets,
      command: ['watchbot', 'listen', ...this.props.command],
      enableLogging: true,
      logDriver: LogDrivers.awsLogs({
        streamPrefix: this.props.serviceVersion,
        logGroup: this.logGroup
      }),
      healthCheck: this.props.healthCheck,

      queue: this.queue,

      cluster: this.cluster,
      propagateTags: PropagatedTagSource.TASK_DEFINITION,

      // scaling props
      scalingSteps: this.props.scalingSteps,
      maxScalingCapacity: this.props.maxScalingCapacity,
      minScalingCapacity: this.props.minScalingCapacity,

      // network config props
      taskSubnets: this.props.subnets,
      assignPublicIp: this.props.publicIP,
      securityGroups: this.props.securityGroups
    };
    this.queueProcessingFargateService = new MapboxQueueProcessingFargateService(
      this,
      'Service',
      queueProcessingFargateServiceProps
    );
    this.service = this.queueProcessingFargateService.service;
    this.taskDefinition = this.queueProcessingFargateService.taskDefinition;

    this.container = this.taskDefinition.findContainer(this.props.containerName || '');
    if (this.container) {
      this.container.addMountPoints(...(this.props.mountPoints || []));
      this.container.addUlimits({
        name: UlimitName.NOFILE,
        softLimit: 10240,
        hardLimit: 10240
      });
    } else {
      throw new Error(`Could not find container with containerName=${this.props.containerName}`);
    }

    if (!this.props.fifo) {
      this.topic = new Topic(this, 'Topic', {
        topicName: `${this.stack.stackName}-${this.props.prefix}Topic`
      });
      this.topic.addSubscription(new SqsSubscription(this.queue));
      this.queue.grantSendMessages(
        new PrincipalWithConditions(new AnyPrincipal(), {
          ArnEquals: {
            'aws:SourceArn': this.topic.topicArn
          }
        })
      );
      this.topic.grantPublish(this.taskDefinition.taskRole);
      this.container.addEnvironment('WorkTopic', this.topic.topicArn);
    }

    this.monitoring = this.createAlarms();

    if (this.props.reduceModeConfiguration?.enabled) {
      const table = new aws_dynamodb.Table(this, 'ProgressTable', {
        tableName: `${this.stack.stackName}-${this.prefixed('-progress')}`.toLowerCase(),
        readCapacity: this.props.reduceModeConfiguration.readCapacityUnits || 30,
        writeCapacity: this.props.reduceModeConfiguration.writeCapacityUnits || 30,
        partitionKey: {
          name: 'id',
          type: AttributeType.STRING
        }
      });
      (table.node.defaultChild as CfnTable).overrideLogicalId('ProgressTable');
      this.table = table;
      this.container.addEnvironment('ProgressTable', this.table.tableArn);
    }
  }

  private createAlarms() {
    const monitoring = new MonitoringFacade(this, 'Monitoring', {
      alarmFactoryDefaults: {
        alarmNamePrefix: this.prefixed(''),
        actionsEnabled: true,
        action: new SnsAlarmActionStrategy({
          onAlarmTopic: this.props.alarms.action
        })
      }
    });

    const workersErrorsMetric = this.logGroup
      .addMetricFilter(this.prefixed('WorkerErrorsMetric'), {
        metricName: `${this.prefixed('WorkerErrors')}-${this.stack.stackName}`,
        metricNamespace: 'Mapbox/ecs-watchbot',
        metricValue: '1',
        filterPattern: FilterPattern.anyTerm('"[failure]"')
      })
      .metric({
        statistic: Stats.SUM
      });

    monitoring
      .addLargeHeader(this.prefixed(this.stack.stackName))
      .monitorQueueProcessingFargateService({
        fargateService: this.queueProcessingFargateService,
        addServiceAlarms: {
          addMemoryUsageAlarm: {
            memoryUsage: {
              runbookLink: `${this.RUNBOOK}#memoryutilization`,
              maxUsagePercent: this.props.alarms.memoryUtilization?.threshold || 100,
              period: this.props.alarms.memoryUtilization?.period || Duration.minutes(1),
              evaluationPeriods: this.props.alarms.memoryUtilization?.evaluationPeriods || 10
            }
          },
          addCpuUsageAlarm: {
            cpu: {
              runbookLink: `${this.RUNBOOK}#CpuUtilization`,
              maxUsagePercent: this.props.alarms.cpuUtilization?.threshold || 90,
              period: this.props.alarms.cpuUtilization?.period || Duration.minutes(1),
              evaluationPeriods: this.props.alarms.cpuUtilization?.evaluationPeriods || 10
            }
          }
        }
      })
      .monitorSqsQueueWithDlq({
        queue: this.queue,
        deadLetterQueue: this.deadLetterQueue,
        addQueueMaxSizeAlarm: {
          maxSize: {
            runbookLink: `${this.RUNBOOK}#QueueSize`,
            maxMessageCount: this.props.alarms.queueSize?.threshold || 40,
            period: this.props.alarms.queueSize?.period || Duration.minutes(5),
            evaluationPeriods: this.props.alarms.queueSize?.evaluationPeriods || 24
          }
        },
        addDeadLetterQueueMaxSizeAlarm: {
          maxSize: {
            runbookLink: `${this.RUNBOOK}#DeadLetterQueueSize`,
            maxMessageCount: this.props.alarms.dlqSize?.threshold || 10,
            period: this.props.alarms.dlqSize?.period || Duration.minutes(1),
            evaluationPeriods: this.props.alarms.dlqSize?.evaluationPeriods || 1,
            datapointsToAlarm: this.props.alarms.dlqSize?.evaluationPeriods || 1 // match evaluationPeriods
          }
        }
      })
      .monitorCustom({
        addToAlarmDashboard: true,
        alarmFriendlyName: `worker-errors-${this.stack.region}`,
        metricGroups: [
          {
            title: 'Worker Errors',
            metrics: [
              {
                alarmFriendlyName: `worker-errors-${this.stack.region}`,
                metric: workersErrorsMetric,
                addAlarm: {
                  error: {
                    threshold: this.props.alarms.workersErrors?.threshold || 10,
                    evaluationPeriods: this.props.alarms.workersErrors?.evaluationPeriods || 1,
                    datapointsToAlarm: this.props.alarms.workersErrors?.evaluationPeriods || 1, // match evaluationPeriods
                    period: this.props.alarms.workersErrors?.period || Duration.minutes(1),
                    comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                    runbookLink: `${this.RUNBOOK}#workererrors`
                  }
                }
              }
            ]
          }
        ]
      });
    return monitoring;
  }

  private prefixed = (name: string) => `${this.props.prefix}${name}`;

  private mergePropsWithDefaults(id: string, props: WatchbotProps): WatchbotProps {
    const { region } = Stack.of(this.scope);

    const prefix = props.prefix ?? 'Watchbot';
    const DEFAULT_PROPS: Partial<WatchbotProps> = {
      prefix,
      containerName: `${prefix}-${this.stack.stackName}`,
      structuredLogging: false,
      readonlyRootFilesystem: true,
      maxJobDuration: Duration.seconds(0),
      family: props.serviceName,
      cluster: Cluster.fromClusterAttributes(this, `${id}Cluster`, {
        clusterName: `fargate-processing-${props.deploymentEnvironment}`,
        vpc: Vpc.fromLookup(this, `${id}VPC`, {
          vpcId: VPC_IDs[region as SupportedRegion][props.deploymentEnvironment],
          isDefault: false,
          region,
          ownerAccountId:
            props.deploymentEnvironment === 'staging'
              ? NETWORKING_STG_ACCOUNT_ID
              : NETWORKING_PROD_ACCOUNT_ID
        })
      }),

      publicIP: false,
      privileged: false,
      logGroupName: `${this.stack.stackName}-${this.stack.region}-${prefix.toLowerCase()}`,
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
      retentionPeriod: Duration.days(14),
      reduceModeConfiguration: {
        enabled: false,
        writeCapacityUnits: 30,
        readCapacityUnits: 30
      }
    };

    return {
      ...DEFAULT_PROPS,
      ...props
    };
  }
}

import { Arn, Duration, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { ISecurityGroup, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import {
  BaseService,
  Cluster, ContainerImage,
  FargateTaskDefinition, ICluster,
  LogDrivers, MountPoint,
  PropagatedTagSource, TaskDefinition, UlimitName, Volume,
} from 'aws-cdk-lib/aws-ecs';
import {
  QueueProcessingFargateService,
  QueueProcessingFargateServiceProps,
} from 'aws-cdk-lib/aws-ecs-patterns';
import { AnyPrincipal, PrincipalWithConditions } from 'aws-cdk-lib/aws-iam';
import { CfnLogGroup, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface WatchbotProps extends Omit<QueueProcessingFargateServiceProps, 'cluster' | 'command' | 'serviceName'> {
  readonly subnets?: SubnetSelection;
  /**
   * Whether the tasks' elastic network interface receives a public IP address. Should be `true` if `subnets` are public.
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-awsvpcconfiguration.html
   */
  readonly publicIP?: boolean;

  readonly securityGroups?: ISecurityGroup[];

  readonly image: ContainerImage;
  readonly cluster: ICluster;
  readonly serviceName: string;
  readonly command: string[];

  // TODO this is used to figure out cluster name. Do we actually need this to be required?
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
   * Give the container read-write access to the root file system.
   * @default false
   * @see
   */
  readonly writableFileSystem?: boolean;

  /**
   * The maximum duration that a job is allowed to run. After this time period, the worker will be stopped and the job will be returned to the queue.
   * @default 0
   */
  readonly maxJobDuration?: Duration;

  /**
   * Environment variables passed to the container running the task. This will always include QueueUrl, LogGroup (ARN), writableFilesystem, maxJobDuration (in seconds), Volumes (comma separated string), Fifo (ARN), WorkTopic (SNS topic ARN), structuredLogging (true or false string).
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
  // **** related to tables ****
  // readCapacityUnits: 30,
  // writeCapacityUnits: 30,


  // watchbotVersion: 'v' + pkg.version,
  // **** related to alarms ****
  // errorThreshold: 10,
  // alarmThreshold: 40,
  // alarmPeriods: 24,
  // deadletterAlarm: true,
  // dashboard: true,
}

export abstract class Watchbot extends Resource {
  protected readonly props: WatchbotProps;
  public readonly service: BaseService;
  public readonly taskDefinition: TaskDefinition;

  public readonly cluster: ICluster;
  public readonly logGroup: LogGroup;
  public readonly queue: IQueue;
  public readonly deadLetterQueue: IQueue;
  public readonly topic: Topic | undefined;

  protected constructor(scope: Construct, id: string, props: WatchbotProps) {
    super(scope, id);

    this.props = this.mergePropsWithDefaults(props);

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: this.props.logGroupName,
      retention: this.props.logGroupRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    (this.logGroup.node.defaultChild as CfnLogGroup).overrideLogicalId(this.prefixed('LogGroup'));

    const { queue, deadLetterQueue, topic } = this.createQueues();
    this.queue = queue;
    this.deadLetterQueue = deadLetterQueue;
    this.topic = topic;

    this.cluster = this.props.cluster;

    const container = this.taskDefinition.addContainer(this.props.containerName || '', {
      image: props.image,
      command: ['watchbot', 'listen', ...this.props.command],
      environment: {
        QueueUrl: this.queue.queueUrl,
        LogGroup: this.logGroup.logGroupArn,
        writableFilesystem: this.props.writableFileSystem.toString(),
        maxJobDuration: `${(this.props.maxJobDuration || Duration.seconds(0)).toSeconds()}`,
        Volumes: this.props.mountPoints?.map((m) => m.containerPath).join(','),
        Fifo: this.props.fifo.toString(),
        WorkTopic: this.topic?.topicArn || '',
        structuredLogging: this.props.structuredLogging.toString(),
        ...this.props.environment,
      },
      secrets: this.props.secrets,

      // logging props
      logging: LogDrivers.awsLogs({
        streamPrefix: this.props.serviceVersion,
        logGroup: this.logGroup,
      }),

      ulimits: [{
        name: UlimitName.NOFILE,
        softLimit: 10240,
        hardLimit: 10240,
      }],
      memoryReservationMiB: this.props.memoryReservationMiB,
      healthCheck: props.healthCheck,
      privileged: this.props.privileged,
      readonlyRootFilesystem: !this.props.writableFileSystem,
    });
    container.addMountPoints(...this.props.mountPoints);

  }

  private createQueues = () => {
    const deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      fifo: this.props.fifo,
      queueName: `${this.stack.stackName}-${this.prefixed('DeadLetterQueue')}${this.props.fifo ? '.fifo' : ''}`,
      retentionPeriod: this.props.retentionPeriod || Duration.days(14),
      contentBasedDeduplication: this.props.fifo,
    });

    const queue = new Queue(this, 'Queue', {
      queueName: `${this.stack.stackName}-${this.prefixed('Queue')}${this.props.fifo ? '.fifo' : ''}`,
      retentionPeriod: this.props.retentionPeriod || Duration.days(14),
      fifo: this.props.fifo,
      contentBasedDeduplication: this.props.fifo,
      visibilityTimeout: Duration.seconds(180),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: this.props.deadLetterThreshold || 10,
      },
    });
    let topic = undefined;
    if (!this.props.fifo) {
      topic = new Topic(this, 'Topic', {
        topicName: `${this.stack.stackName}-${this.props.prefix}Topic`,
      });
      topic.addSubscription(new SqsSubscription(queue));
      queue.grantSendMessages(new PrincipalWithConditions(new AnyPrincipal(), {
        ArnEquals: {
          'aws:SourceArn': topic.topicArn,
        },
      }));
      topic.grantPublish(this.taskDefinition.taskRole);
    }

    return { queue, deadLetterQueue, topic };
  };

  private prefixed = (name: string) => `${this.props.prefix}${name}`;

  private mergePropsWithDefaults(props: WatchbotProps): WatchbotProps {
    const prefix = 'Watchbot';
    const DEFAULT_PROPS: Partial<WatchbotProps> = {
      prefix,
      containerName: `${prefix}-${this.stack.stackName}`,
      structuredLogging: false,
      writableFileSystem: false,
      maxJobDuration: Duration.seconds(0),
      family: props.serviceName,
      cluster: Cluster.fromClusterArn(this, 'Cluster', Arn.format({
        service: 'ecs',
        resource: 'service',
        resourceName: `fargate-processing-${props.deploymentEnvironment}`,
      })),
      publicIP: false,
      privileged: false,
      logGroupName: `${this.stack.stackName}-${this.stack.region}-${prefix.toLowerCase()}`,
      logGroupRetentionDays: RetentionDays.TWO_WEEKS,
      mountPoints: [{
        containerPath: '/tmp',
        sourceVolume: 'tmp',
        readOnly: true,
      }],
      volumes: [{
        name: 'tmp',
      }],

      fifo: false,
      deadLetterThreshold: 10,
      retentionPeriod: Duration.days(14),
    };
    return {
      ...DEFAULT_PROPS,
      ...props,
    }
  }
}

export class FargateWatchbot extends Watchbot {
  constructor(scope: Construct, id: string, props: WatchbotProps) {
    super(scope, id, props);

    this.taskDefinition = new FargateTaskDefinition(this, 'QueueProcessingTaskDef', {
      memoryLimitMiB: this.props.memoryLimitMiB,
      cpu: this.props.cpu,
      family: this.props.family,
      runtimePlatform: this.props.runtimePlatform,
      volumes: this.props.volumes,
    });

    const queueProcessingFargateServiceProps = {
      ...this.props,
      queue: this.queue,
      taskDefinition: this.taskDefinition,
      cluster: this.cluster,
      propagateTags: PropagatedTagSource.TASK_DEFINITION,

      // scaling props
      scalingSteps: this.props.scalingSteps,
      maxScalingCapacity: this.props.maxScalingCapacity,
      minScalingCapacity: this.props.minScalingCapacity,

      // network config props
      taskSubnets: this.props.subnets,
      assignPublicIp: this.props.publicIP,
      securityGroups: this.props.securityGroups,
    }
    const queueProcessingFargateService = new QueueProcessingFargateService(this, 'Service', queueProcessingFargateServiceProps);
    this.service = queueProcessingFargateService.service;
  }
}

import { Duration, RemovalPolicy, Resource } from 'aws-cdk-lib';
import {ISecurityGroup, SecurityGroup, SubnetSelection, Vpc} from 'aws-cdk-lib/aws-ec2';
import {
  BaseService,
  Cluster, ContainerDefinition, ContainerImage, CpuArchitecture, HealthCheck, ICluster,
  LogDrivers, MountPoint,
  PropagatedTagSource, RuntimePlatform, Secret, TaskDefinition, UlimitName, Volume,
} from 'aws-cdk-lib/aws-ecs';
import { AnyPrincipal, PrincipalWithConditions } from 'aws-cdk-lib/aws-iam';
import { CfnLogGroup, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {ScalingInterval} from "aws-cdk-lib/aws-applicationautoscaling";
import {
  MapboxQueueProcessingFargateService,
  MapboxQueueProcessingFargateServiceProps
} from "./QueueProcessingFargateService";

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
  readonly secrets?: {[key: string]: Secret}

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
   * Give the container read-write access to the root file system. Previously writableFilesystem.
   * @default true
   * @see
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

export class FargateWatchbot extends Resource {
  protected readonly props: WatchbotProps;
  public service: BaseService;
  public taskDefinition: TaskDefinition;

  public readonly cluster?: ICluster;
  public readonly logGroup: LogGroup;
  public readonly queue: IQueue;
  public readonly deadLetterQueue: IQueue;
  public topic: Topic | undefined;
  public container: ContainerDefinition | undefined;

  constructor(scope: Construct, id: string, props: WatchbotProps) {
    super(scope, id);

    this.props = this.mergePropsWithDefaults(props);

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: this.props.logGroupName,
      retention: this.props.logGroupRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    (this.logGroup.node.defaultChild as CfnLogGroup).overrideLogicalId(this.prefixed('LogGroup'));


    this.deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      fifo: this.props.fifo,
      queueName: `${this.stack.stackName}-${this.prefixed('DeadLetterQueue')}${this.props.fifo ? '.fifo' : ''}`,
      retentionPeriod: this.props.retentionPeriod || Duration.days(14),
      contentBasedDeduplication: this.props.fifo,
    });

    this.queue = new Queue(this, 'Queue', {
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
        ...this.props.environment,
      },
      secrets: this.props.secrets,
      command: ['watchbot', 'listen', ...this.props.command],
      enableLogging: true,
      logDriver: LogDrivers.awsLogs({
        streamPrefix: this.props.serviceVersion,
        logGroup: this.logGroup,
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
      securityGroups: this.props.securityGroups,
    }
    const queueProcessingFargateService = new MapboxQueueProcessingFargateService(this, 'Service', queueProcessingFargateServiceProps);
    this.service = queueProcessingFargateService.service;
    this.taskDefinition = queueProcessingFargateService.taskDefinition;

    this.container = this.taskDefinition.findContainer(this.props.containerName || '');
    if (this.container) {
      this.container.addMountPoints(...(this.props.mountPoints || []));
      this.container.addUlimits({
        name: UlimitName.NOFILE,
        softLimit: 10240,
        hardLimit: 10240,
      });
    } else {
      throw new Error(`Could not find container with containerName=${this.props.containerName}`);
    }

    if (!this.props.fifo) {
      this.topic = new Topic(this, 'Topic', {
        topicName: `${this.stack.stackName}-${this.props.prefix}Topic`,
      });
      this.topic.addSubscription(new SqsSubscription(this.queue));
      this.queue.grantSendMessages(new PrincipalWithConditions(new AnyPrincipal(), {
        ArnEquals: {
          'aws:SourceArn': this.topic.topicArn,
        },
      }));
      this.topic.grantPublish(this.taskDefinition.taskRole);
      this.container.addEnvironment('WorkTopic', this.topic.topicArn)
    }
  }

  private prefixed = (name: string) => `${this.props.prefix}${name}`;

  private mergePropsWithDefaults(props: WatchbotProps): WatchbotProps {
    console.log(props)
    const prefix = props.prefix ?? 'Watchbot';
    const DEFAULT_PROPS: Partial<WatchbotProps> = {
      prefix,
      containerName: `${prefix}-${this.stack.stackName}`,
      structuredLogging: false,
      readonlyRootFilesystem: true,
      maxJobDuration: Duration.seconds(0),
      family: props.serviceName,
      cluster: Cluster.fromClusterAttributes(this, 'Cluster', {
        clusterName: `fargate-processing-${props.deploymentEnvironment}`,
        vpc: Vpc.fromLookup(this, 'VPC', {
          vpcId: 'vpc-id'
        })
      }),

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

    console.log({
      ...DEFAULT_PROPS,
      ...props,
    })
    return {
      ...DEFAULT_PROPS,
      ...props,
    }
  }
}

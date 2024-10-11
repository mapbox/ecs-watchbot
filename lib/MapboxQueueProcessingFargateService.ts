import { Construct } from 'constructs';
import {
  FargateService,
  FargateTaskDefinition,
  LinuxParameters,
  LinuxParametersProps,
  Volume
} from 'aws-cdk-lib/aws-ecs';
import {
  QueueProcessingFargateServiceProps,
  QueueProcessingServiceBase
} from 'aws-cdk-lib/aws-ecs-patterns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { cx_api, FeatureFlags, Duration } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

/**
 * The properties for the MapboxQueueProcessingFargateService service.
 */
export interface MapboxQueueProcessingFargateServiceProps
  extends QueueProcessingFargateServiceProps {
  /**
   * Specifies whether the container is marked as privileged. When this parameter is true, the container is given elevated privileges on the host container instance (similar to the root user).
   * @default false
   */
  readonly privileged?: boolean;

  /**
   * The soft limit (in MiB) of memory to reserve for the container.
   * @default No memory reserved
   */
  readonly memoryReservationMiB?: number;

  /**
   * When this parameter is true, the container is given read-only access to its root file system
   * @default false
   */
  readonly readonlyRootFilesystem?: boolean;

  /**
   * The list of volume definitions for the task
   * @default []
   */
  readonly volumes?: Volume[];

  /**
   * Linux-specific modifications that are applied to the container, such as Linux kernel capabilities.
   * @default undefined
   */
  readonly linuxParameters?: LinuxParametersProps;

  /**
   * Size of disk to attach to the fargate container
   * @default undefined
   */
  readonly ephemeralStorageGiB?: number;

}

/**
 * Class to create a queue processing Fargate service. This class was adapted from aws-cdk-lib MapboxQueueProcessingFargateService class but enhanced with more props that couldn't be achieved by extending the class
 * @see https://github.com/aws/aws-cdk/blob/v2.109.0/packages/aws-cdk-lib/aws-ecs-patterns/lib/fargate/queue-processing-fargate-service.ts
 */
export class MapboxQueueProcessingFargateService extends QueueProcessingServiceBase {
  /**
   * The Fargate service in this construct.
   */
  public readonly service: FargateService;
  /**
   * The Fargate task definition in this construct.
   */
  public readonly taskDefinition: FargateTaskDefinition;

  /**
   * A lambda to calculate the total messages (visible and not visible) in the SQS queue as a cloudwatch metric
   */
  readonly totalMessagesLambda: lambda.Function;

  /**
   * A metric to track the total messages visible and not visible
   */
  readonly totalMessagesMetric: cloudwatch.Metric;

  /**
   * A metric to track the total messages visible- created by default by SQS
   */
  readonly visibleMessagesMetric: cloudwatch.Metric;

  /**
   * Constructs a new instance of the QueueProcessingFargateService class.
   */
  constructor(scope: Construct, id: string, props: MapboxQueueProcessingFargateServiceProps) {
    super(scope, id, props);

    // Create a Task Definition for the container to start
    this.taskDefinition = new FargateTaskDefinition(this, 'QueueProcessingTaskDef', {
      memoryLimitMiB: props.memoryLimitMiB || 512,
      cpu: props.cpu || 256,
      ephemeralStorageGiB: props.ephemeralStorageGiB || 20,
      family: props.family,
      runtimePlatform: props.runtimePlatform,
      volumes: props.volumes
    });

    const containerName = props.containerName ?? 'QueueProcessingContainer';

    this.taskDefinition.addContainer(containerName, {
      image: props.image,
      command: props.command,
      environment: this.environment,
      secrets: this.secrets,
      logging: this.logDriver,
      healthCheck: props.healthCheck,
      privileged: props.privileged,
      memoryReservationMiB: props.memoryReservationMiB,
      readonlyRootFilesystem: props.readonlyRootFilesystem,
      linuxParameters: props.linuxParameters
        ? new LinuxParameters(this, 'LinuxParameters', props.linuxParameters)
        : undefined
    });

    // The desiredCount should be removed from the fargate service when the feature flag is removed.
    const desiredCount = FeatureFlags.of(this).isEnabled(cx_api.ECS_REMOVE_DEFAULT_DESIRED_COUNT)
      ? undefined
      : this.minCapacity;

    // Create a Fargate service with the previously defined Task Definition and configure
    // autoscaling based on cpu utilization and number of messages visible in the SQS queue.
    this.service = new FargateService(this, 'QueueProcessingFargateService', {
      cluster: this.cluster,
      desiredCount: desiredCount,
      taskDefinition: this.taskDefinition,
      serviceName: props.serviceName,
      minHealthyPercent: props.minHealthyPercent,
      maxHealthyPercent: props.maxHealthyPercent,
      propagateTags: props.propagateTags,
      enableECSManagedTags: props.enableECSManagedTags,
      platformVersion: props.platformVersion,
      deploymentController: props.deploymentController,
      securityGroups: props.securityGroups,
      vpcSubnets: props.taskSubnets,
      assignPublicIp: props.assignPublicIp,
      circuitBreaker: props.circuitBreaker,
      capacityProviderStrategies: props.capacityProviderStrategies,
      enableExecuteCommand: props.enableExecuteCommand
    });

    this.grantPermissionsToService(this.service);

    this.totalMessagesLambda = new lambda.Function(this, 'TotalMessagesLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: new lambda.InlineCode(`
        const { SQS } = require('@aws-sdk/client-sqs');
        const { CloudWatch } = require('@aws-sdk/client-cloudwatch');
        exports.handler = function(event, context, callback) {
          const sqs = new SQS({ region: process.env.AWS_DEFAULT_REGION });
          const cw = new CloudWatch({ region: process.env.AWS_DEFAULT_REGION });

          return sqs.getQueueAttributes({
            QueueUrl: '${this.sqsQueue.queueUrl}',
            AttributeNames: ['ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessages']
          })
            .then((attrs) => {
              return cw.putMetricData({
                Namespace: 'Mapbox/ecs-watchbot',
                MetricData: [{
                  MetricName: 'TotalMessages',
                  Dimensions: [{ Name: 'QueueName', Value: '${this.sqsQueue.queueName}'}],
                  Value: Number(attrs.Attributes.ApproximateNumberOfMessagesNotVisible) +
                          Number(attrs.Attributes.ApproximateNumberOfMessages)
                }]
              })
            })
            .then((metric) => callback(null, metric))
            .catch((err) => callback(err));
        }
      `)
    })

    this.totalMessagesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }))
    this.totalMessagesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sqs:GetQueueAttributes'],
      resources: [this.sqsQueue.queueArn]
    }))

    const rule = new events.Rule(this, 'TotalMessagesRule', {
      description: 'Update TotalMessages metric every minute',
      schedule: events.Schedule.cron({ minute: '0/1'}) // run every minute
    });

    rule.addTarget(new targets.LambdaFunction(this.totalMessagesLambda));

    this.totalMessagesMetric = new cloudwatch.Metric({
      namespace: 'Mapbox/ecs-watchbot',
      metricName: 'TotalMessages',
      dimensionsMap: { QueueName: this.sqsQueue.queueName },
      period: Duration.minutes(1),
    });

    this.visibleMessagesMetric = new cloudwatch.Metric({
      namespace: 'SQS/Queue Metrics',
      metricName: 'ApproximateNumberOfMessagesVisible',
      dimensionsMap: { QueueName: this.sqsQueue.queueName },
      period: Duration.minutes(1),
    });


    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.minScalingCapacity,
      maxCapacity: props.maxScalingCapacity || 1
    });

    scaling.scaleOnMetric('TotalMessagesScaling', {
      metric: this.totalMessagesMetric,
      scalingSteps: [
        { lower: 0, upper: 0, change: -100 }, // this is a bogus param - we require two for autoscaling
        { lower: 1, upper: 1, change: 0 },
      ],
      evaluationPeriods: 3
    })

    scaling.scaleOnMetric('VisibleMessagesScaling', {
      metric: this.visibleMessagesMetric,
      scalingSteps: [
        { lower: 1, upper: 1, change: 1 },
        { lower: 10, upper: 10, change: 5 },  // test - let's add 5 tasks if there are > 10 messages
      ],
      evaluationPeriods: 3
    })

  }
}

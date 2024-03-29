import { Construct } from 'constructs';
import { FargateService, FargateTaskDefinition, Volume } from 'aws-cdk-lib/aws-ecs';
import {
  QueueProcessingFargateServiceProps,
  QueueProcessingServiceBase
} from 'aws-cdk-lib/aws-ecs-patterns';
import { cx_api, FeatureFlags } from 'aws-cdk-lib';

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
   * Constructs a new instance of the QueueProcessingFargateService class.
   */
  constructor(scope: Construct, id: string, props: MapboxQueueProcessingFargateServiceProps) {
    super(scope, id, props);

    // Create a Task Definition for the container to start
    this.taskDefinition = new FargateTaskDefinition(this, 'QueueProcessingTaskDef', {
      memoryLimitMiB: props.memoryLimitMiB || 512,
      cpu: props.cpu || 256,
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
      readonlyRootFilesystem: props.readonlyRootFilesystem
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

    this.configureAutoscalingForService(this.service);
    this.grantPermissionsToService(this.service);
  }
}

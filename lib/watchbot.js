"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FargateWatchbot = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_ecs_1 = require("aws-cdk-lib/aws-ecs");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
const aws_logs_1 = require("aws-cdk-lib/aws-logs");
const aws_sns_1 = require("aws-cdk-lib/aws-sns");
const aws_sns_subscriptions_1 = require("aws-cdk-lib/aws-sns-subscriptions");
const aws_sqs_1 = require("aws-cdk-lib/aws-sqs");
const MapboxQueueProcessingFargateService_1 = require("./MapboxQueueProcessingFargateService");
const cdk_monitoring_constructs_1 = require("cdk-monitoring-constructs");
const path = require("path");
const aws_cloudwatch_1 = require("aws-cdk-lib/aws-cloudwatch");
const aws_dynamodb_1 = require("aws-cdk-lib/aws-dynamodb");
const pkg = require(path.resolve(__dirname, '..', 'package.json'));
var SupportedRegion;
(function (SupportedRegion) {
    SupportedRegion["UsEast1"] = "us-east-1";
    SupportedRegion["UsEast2"] = "us-east-2";
    SupportedRegion["ApNortheast1"] = "ap-northeast-1";
})(SupportedRegion || (SupportedRegion = {}));
const VPC_IDs = {
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
class FargateWatchbot extends aws_cdk_lib_1.Resource {
    constructor(scope, id, props) {
        var _a, _b, _c;
        super(scope, id);
        this.prefixed = (name) => `${this.props.prefix}${name}`;
        this.scope = scope;
        if (!['production', 'staging'].includes(props.deploymentEnvironment)) {
            throw new Error(`deploymentEnvironment must be one of [staging, production] but received deploymentEnvironment=${props.deploymentEnvironment}`);
        }
        this.RUNBOOK = `https://github.com/mapbox/ecs-watchbot/blob/${pkg.version}/docs/alarms.md`;
        this.props = this.mergePropsWithDefaults(id, props);
        this.logGroup = new aws_logs_1.LogGroup(this, 'LogGroup', {
            logGroupName: this.props.logGroupName,
            retention: this.props.logGroupRetentionDays,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        this.logGroup.node.defaultChild.overrideLogicalId(this.prefixed('LogGroup'));
        // workaround for a bug when you set fifo = false
        // https://github.com/aws/aws-cdk/issues/8550
        const additionalFifoProperties = this.props.fifo ? { fifo: true, contentBasedDeduplication: true } : { contentBasedDeduplication: false };
        this.deadLetterQueue = new aws_sqs_1.Queue(this, 'DeadLetterQueue', {
            queueName: `${this.stack.stackName}-${this.prefixed('DeadLetterQueue')}`,
            retentionPeriod: this.props.retentionPeriod || aws_cdk_lib_1.Duration.days(14),
            ...additionalFifoProperties
        });
        this.queue = new aws_sqs_1.Queue(this, 'Queue', {
            queueName: `${this.stack.stackName}-${this.prefixed('Queue')}`,
            retentionPeriod: this.props.retentionPeriod || aws_cdk_lib_1.Duration.days(14),
            visibilityTimeout: aws_cdk_lib_1.Duration.seconds(180),
            deadLetterQueue: {
                queue: this.deadLetterQueue,
                maxReceiveCount: this.props.deadLetterThreshold || 10
            },
            ...additionalFifoProperties
        });
        this.cluster = this.props.cluster;
        const queueProcessingFargateServiceProps = {
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
                writableFilesystem: ((_a = (!this.props.readonlyRootFilesystem)) === null || _a === void 0 ? void 0 : _a.toString()) || '',
                maxJobDuration: `${((_b = this.props.maxJobDuration) === null || _b === void 0 ? void 0 : _b.toSeconds()) || 0}`,
                Volumes: (this.props.mountPoints || []).map((m) => m.containerPath).join(','),
                Fifo: (this.props.fifo || false).toString(),
                structuredLogging: (this.props.structuredLogging || false).toString(),
                ...this.props.environment
            },
            secrets: this.props.secrets,
            command: ['watchbot', 'listen', ...this.props.command],
            enableLogging: true,
            logDriver: aws_ecs_1.LogDrivers.awsLogs({
                streamPrefix: this.props.serviceVersion,
                logGroup: this.logGroup
            }),
            healthCheck: this.props.healthCheck,
            queue: this.queue,
            cluster: this.cluster,
            propagateTags: aws_ecs_1.PropagatedTagSource.TASK_DEFINITION,
            // scaling props
            scalingSteps: this.props.scalingSteps,
            maxScalingCapacity: this.props.maxScalingCapacity,
            minScalingCapacity: this.props.minScalingCapacity,
            // network config props
            taskSubnets: this.props.subnets,
            assignPublicIp: this.props.publicIP,
            securityGroups: this.props.securityGroups
        };
        this.queueProcessingFargateService = new MapboxQueueProcessingFargateService_1.MapboxQueueProcessingFargateService(this, 'Service', queueProcessingFargateServiceProps);
        this.service = this.queueProcessingFargateService.service;
        this.taskDefinition = this.queueProcessingFargateService.taskDefinition;
        this.container = this.taskDefinition.findContainer(this.props.containerName || '');
        if (this.container) {
            this.container.addMountPoints(...(this.props.mountPoints || []));
            this.container.addUlimits({
                name: aws_ecs_1.UlimitName.NOFILE,
                softLimit: 10240,
                hardLimit: 10240
            });
        }
        else {
            throw new Error(`Could not find container with containerName=${this.props.containerName}`);
        }
        if (!this.props.fifo) {
            this.topic = new aws_sns_1.Topic(this, 'Topic', {
                topicName: `${this.stack.stackName}-${this.props.prefix}Topic`
            });
            this.topic.addSubscription(new aws_sns_subscriptions_1.SqsSubscription(this.queue));
            this.queue.grantSendMessages(new aws_iam_1.PrincipalWithConditions(new aws_iam_1.AnyPrincipal(), {
                ArnEquals: {
                    'aws:SourceArn': this.topic.topicArn
                }
            }));
            this.topic.grantPublish(this.taskDefinition.taskRole);
            this.container.addEnvironment('WorkTopic', this.topic.topicArn);
        }
        this.monitoring = this.createAlarms();
        if ((_c = this.props.reduceModeConfiguration) === null || _c === void 0 ? void 0 : _c.enabled) {
            const table = new aws_cdk_lib_1.aws_dynamodb.Table(this, 'ProgressTable', {
                tableName: `${this.stack.stackName}-${this.prefixed('-progress')}`.toLowerCase(),
                readCapacity: this.props.reduceModeConfiguration.readCapacityUnits || 30,
                writeCapacity: this.props.reduceModeConfiguration.writeCapacityUnits || 30,
                partitionKey: {
                    name: 'id',
                    type: aws_dynamodb_1.AttributeType.STRING
                }
            });
            table.node.defaultChild.overrideLogicalId('ProgressTable');
            this.table = table;
            this.container.addEnvironment('ProgressTable', this.table.tableArn);
        }
    }
    createAlarms() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const monitoring = new cdk_monitoring_constructs_1.MonitoringFacade(this, 'Monitoring', {
            alarmFactoryDefaults: {
                alarmNamePrefix: this.prefixed(''),
                actionsEnabled: true,
                action: new cdk_monitoring_constructs_1.SnsAlarmActionStrategy({
                    onAlarmTopic: this.props.alarms.action
                })
            }
        });
        const workersErrorsMetric = this.logGroup
            .addMetricFilter(this.prefixed('WorkerErrorsMetric'), {
            metricName: `${this.prefixed('WorkerErrors')}-${this.stack.stackName}`,
            metricNamespace: 'Mapbox/ecs-watchbot',
            metricValue: '1',
            filterPattern: aws_logs_1.FilterPattern.anyTerm('"[failure]"')
        })
            .metric({
            statistic: aws_cloudwatch_1.Stats.SUM
        });
        monitoring
            .addLargeHeader(this.prefixed(this.stack.stackName))
            .monitorQueueProcessingFargateService({
            fargateService: this.queueProcessingFargateService,
            addServiceAlarms: {
                addMemoryUsageAlarm: {
                    memoryUsage: {
                        runbookLink: `${this.RUNBOOK}#memoryutilization`,
                        maxUsagePercent: ((_a = this.props.alarms.memoryUtilization) === null || _a === void 0 ? void 0 : _a.threshold) || 100,
                        period: ((_b = this.props.alarms.memoryUtilization) === null || _b === void 0 ? void 0 : _b.period) || aws_cdk_lib_1.Duration.minutes(1),
                        evaluationPeriods: ((_c = this.props.alarms.memoryUtilization) === null || _c === void 0 ? void 0 : _c.evaluationPeriods) || 10
                    }
                },
                addCpuUsageAlarm: {
                    cpu: {
                        runbookLink: `${this.RUNBOOK}#CpuUtilization`,
                        maxUsagePercent: ((_d = this.props.alarms.cpuUtilization) === null || _d === void 0 ? void 0 : _d.threshold) || 90,
                        period: ((_e = this.props.alarms.cpuUtilization) === null || _e === void 0 ? void 0 : _e.period) || aws_cdk_lib_1.Duration.minutes(1),
                        evaluationPeriods: ((_f = this.props.alarms.cpuUtilization) === null || _f === void 0 ? void 0 : _f.evaluationPeriods) || 10
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
                    maxMessageCount: ((_g = this.props.alarms.queueSize) === null || _g === void 0 ? void 0 : _g.threshold) || 40,
                    period: ((_h = this.props.alarms.queueSize) === null || _h === void 0 ? void 0 : _h.period) || aws_cdk_lib_1.Duration.minutes(5),
                    evaluationPeriods: ((_j = this.props.alarms.queueSize) === null || _j === void 0 ? void 0 : _j.evaluationPeriods) || 24
                }
            },
            addDeadLetterQueueMaxSizeAlarm: {
                maxSize: {
                    runbookLink: `${this.RUNBOOK}#DeadLetterQueueSize`,
                    maxMessageCount: ((_k = this.props.alarms.dlqSize) === null || _k === void 0 ? void 0 : _k.threshold) || 10,
                    period: ((_l = this.props.alarms.dlqSize) === null || _l === void 0 ? void 0 : _l.period) || aws_cdk_lib_1.Duration.minutes(1),
                    evaluationPeriods: ((_m = this.props.alarms.dlqSize) === null || _m === void 0 ? void 0 : _m.evaluationPeriods) || 1,
                    datapointsToAlarm: ((_o = this.props.alarms.dlqSize) === null || _o === void 0 ? void 0 : _o.evaluationPeriods) || 1 // match evaluationPeriods
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
                                    threshold: ((_p = this.props.alarms.workersErrors) === null || _p === void 0 ? void 0 : _p.threshold) || 10,
                                    evaluationPeriods: ((_q = this.props.alarms.workersErrors) === null || _q === void 0 ? void 0 : _q.evaluationPeriods) || 1,
                                    datapointsToAlarm: ((_r = this.props.alarms.workersErrors) === null || _r === void 0 ? void 0 : _r.evaluationPeriods) || 1,
                                    period: ((_s = this.props.alarms.workersErrors) === null || _s === void 0 ? void 0 : _s.period) || aws_cdk_lib_1.Duration.minutes(1),
                                    comparisonOperator: aws_cloudwatch_1.ComparisonOperator.GREATER_THAN_THRESHOLD,
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
    mergePropsWithDefaults(id, props) {
        var _a;
        const { region } = aws_cdk_lib_1.Stack.of(this.scope);
        const prefix = (_a = props.prefix) !== null && _a !== void 0 ? _a : 'Watchbot';
        const DEFAULT_PROPS = {
            prefix,
            containerName: `${prefix}-${this.stack.stackName}`,
            structuredLogging: false,
            readonlyRootFilesystem: true,
            maxJobDuration: aws_cdk_lib_1.Duration.seconds(0),
            family: props.serviceName,
            cluster: aws_ecs_1.Cluster.fromClusterAttributes(this, `${id}Cluster`, {
                clusterName: `fargate-processing-${props.deploymentEnvironment}`,
                vpc: aws_ec2_1.Vpc.fromLookup(this, `${id}VPC`, {
                    vpcId: VPC_IDs[region][props.deploymentEnvironment],
                    isDefault: false,
                    region,
                    ownerAccountId: props.deploymentEnvironment === 'staging'
                        ? NETWORKING_STG_ACCOUNT_ID
                        : NETWORKING_PROD_ACCOUNT_ID
                })
            }),
            publicIP: false,
            privileged: false,
            logGroupName: `${this.stack.stackName}-${this.stack.region}-${prefix.toLowerCase()}`,
            logGroupRetentionDays: aws_logs_1.RetentionDays.TWO_WEEKS,
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
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
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
exports.FargateWatchbot = FargateWatchbot;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hib3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaGJvdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2Q0FBcUY7QUFDckYsaURBQTJFO0FBQzNFLGlEQWU2QjtBQUM3QixpREFBNEU7QUFDNUUsbURBQTJGO0FBQzNGLGlEQUFvRDtBQUNwRCw2RUFBb0U7QUFDcEUsaURBQW9EO0FBR3BELCtGQUcrQztBQUMvQyx5RUFBcUY7QUFDckYsNkJBQTZCO0FBQzdCLCtEQUF1RTtBQUN2RSwyREFBbUU7QUFFbkUsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBd09uRSxJQUFLLGVBSUo7QUFKRCxXQUFLLGVBQWU7SUFDbEIsd0NBQXFCLENBQUE7SUFDckIsd0NBQXFCLENBQUE7SUFDckIsa0RBQStCLENBQUE7QUFDakMsQ0FBQyxFQUpJLGVBQWUsS0FBZixlQUFlLFFBSW5CO0FBRUQsTUFBTSxPQUFPLEdBQXlEO0lBQ3BFLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxFQUFFO1FBQzlCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztDQUNGLENBQUM7QUFFRixNQUFNLHlCQUF5QixHQUFHLGNBQWMsQ0FBQztBQUNqRCxNQUFNLDBCQUEwQixHQUFHLGFBQWEsQ0FBQztBQUVqRCxNQUFhLGVBQWdCLFNBQVEsc0JBQVE7SUFrQjNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVB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bEMsdUJBQXVCLEVBQUU7Z0JBQ3ZCLE9BQU8sRUFBRSxLQUFLO2dCQUNkLGtCQUFrQixFQUFFLEVBQUU7Z0JBQ3RCLGlCQUFpQixFQUFFLEVBQUU7YUFDdEI7U0FDRixDQUFDO1FBRUYsT0FBTztZQUNMLEdBQUcsYUFBYTtZQUNoQixHQUFHLEtBQUs7U0FDVCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBOVRELDBDQThUQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGF3c19keW5hbW9kYiwgRHVyYXRpb24sIFJlbW92YWxQb2xpY3ksIFJlc291cmNlLCBTdGFjayB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IElTZWN1cml0eUdyb3VwLCBTdWJuZXRTZWxlY3Rpb24sIFZwYyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0IHtcbiAgQmFzZVNlcnZpY2UsXG4gIENsdXN0ZXIsXG4gIENvbnRhaW5lckRlZmluaXRpb24sXG4gIENvbnRhaW5lckltYWdlLFxuICBIZWFsdGhDaGVjayxcbiAgSUNsdXN0ZXIsXG4gIExvZ0RyaXZlcnMsXG4gIE1vdW50UG9pbnQsXG4gIFByb3BhZ2F0ZWRUYWdTb3VyY2UsXG4gIFJ1bnRpbWVQbGF0Zm9ybSxcbiAgU2VjcmV0LFxuICBUYXNrRGVmaW5pdGlvbixcbiAgVWxpbWl0TmFtZSxcbiAgVm9sdW1lXG59IGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0IHsgQW55UHJpbmNpcGFsLCBQcmluY2lwYWxXaXRoQ29uZGl0aW9ucyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ2ZuTG9nR3JvdXAsIEZpbHRlclBhdHRlcm4sIExvZ0dyb3VwLCBSZXRlbnRpb25EYXlzIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgSVRvcGljLCBUb3BpYyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0IHsgU3FzU3Vic2NyaXB0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCB7IElRdWV1ZSwgUXVldWUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgU2NhbGluZ0ludGVydmFsIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0IHtcbiAgTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UsXG4gIE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHNcbn0gZnJvbSAnLi9NYXBib3hRdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZSc7XG5pbXBvcnQgeyBNb25pdG9yaW5nRmFjYWRlLCBTbnNBbGFybUFjdGlvblN0cmF0ZWd5IH0gZnJvbSAnY2RrLW1vbml0b3JpbmctY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ29tcGFyaXNvbk9wZXJhdG9yLCBTdGF0cyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCB7IEF0dHJpYnV0ZVR5cGUsIENmblRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcblxuY29uc3QgcGtnID0gcmVxdWlyZShwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4nLCAncGFja2FnZS5qc29uJykpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhdGNoYm90UHJvcHMge1xuICAvKipcbiAgICogQGRlZmF1bHQge3ByZWZpeH0tJHtzdGFja05hbWV9XG4gICAqL1xuICByZWFkb25seSBjb250YWluZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgaW50ZXJ2YWxzIGZvciBzY2FsaW5nIGJhc2VkIG9uIHRoZSBTUVMgcXVldWUncyBBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlIG1ldHJpYy5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNzY2FsaW5nc3RlcHNcbiAgICovXG4gIHJlYWRvbmx5IHNjYWxpbmdTdGVwcz86IFNjYWxpbmdJbnRlcnZhbFtdO1xuXG4gIC8qKlxuICAgKiBUaGUgcnVudGltZSBwbGF0Zm9ybSBvZiB0aGUgdGFzayBkZWZpbml0aW9uLlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI3J1bnRpbWVwbGF0Zm9ybVxuICAgKi9cbiAgcmVhZG9ubHkgcnVudGltZVBsYXRmb3JtPzogUnVudGltZVBsYXRmb3JtO1xuXG4gIC8qKlxuICAgKiBUaGUgc2VjcmV0IHRvIGV4cG9zZSB0byB0aGUgY29udGFpbmVyIGFzIGFuIGVudmlyb25tZW50IHZhcmlhYmxlLlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI3NlY3JldHNcbiAgICovXG4gIHJlYWRvbmx5IHNlY3JldHM/OiBSZWNvcmQ8c3RyaW5nLCBTZWNyZXQ+O1xuXG4gIC8qKlxuICAgKiBUaGUgaGVhbHRoIGNoZWNrIGNvbW1hbmQgYW5kIGFzc29jaWF0ZWQgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzIGZvciB0aGUgY29udGFpbmVyLlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI2hlYWx0aGNoZWNrXG4gICAqL1xuICByZWFkb25seSBoZWFsdGhDaGVjaz86IEhlYWx0aENoZWNrO1xuXG4gIC8qKlxuICAgKiBQcmV2aW91c2x5IHJlc2VydmF0aW9uLm1lbW9yeVxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI21lbW9yeWxpbWl0bWliXG4gICAqL1xuICByZWFkb25seSBtZW1vcnlMaW1pdE1pQj86IG51bWJlcjtcblxuICAvKipcbiAgICogUHJldmlvdXNseSByZXNlcnZhdGlvbi5jcHVcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNjcHVcbiAgICovXG4gIHJlYWRvbmx5IGNwdT86IG51bWJlcjtcblxuICByZWFkb25seSBzdWJuZXRzPzogU3VibmV0U2VsZWN0aW9uO1xuICAvKipcbiAgICogV2hldGhlciB0aGUgdGFza3MnIGVsYXN0aWMgbmV0d29yayBpbnRlcmZhY2UgcmVjZWl2ZXMgYSBwdWJsaWMgSVAgYWRkcmVzcy4gU2hvdWxkIGJlIGB0cnVlYCBpZiBgc3VibmV0c2AgYXJlIHB1YmxpYy5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQVdTQ2xvdWRGb3JtYXRpb24vbGF0ZXN0L1VzZXJHdWlkZS9hd3MtcHJvcGVydGllcy1lY3Mtc2VydmljZS1hd3N2cGNjb25maWd1cmF0aW9uLmh0bWxcbiAgICovXG4gIHJlYWRvbmx5IHB1YmxpY0lQPzogYm9vbGVhbjtcblxuICByZWFkb25seSBzZWN1cml0eUdyb3Vwcz86IElTZWN1cml0eUdyb3VwW107XG5cbiAgcmVhZG9ubHkgaW1hZ2U6IENvbnRhaW5lckltYWdlO1xuICByZWFkb25seSBjbHVzdGVyPzogSUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBuYW1lIG9mIHRoZSBzZXJ2aWNlLlxuICAgKi9cbiAgcmVhZG9ubHkgc2VydmljZU5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGNvbW1hbmQgdGhhdCBpcyBwYXNzZWQgdG8gdGhlIGNvbnRhaW5lci4gVGhpcyB3aWxsIGJlIGFwcGVuZGVkIHRvICd3YXRjaGJvdCBsaXN0ZW4nIGNvbW1hbmQuXG4gICAqL1xuICByZWFkb25seSBjb21tYW5kOiBzdHJpbmdbXTtcblxuICByZWFkb25seSBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIHZlcnNpb24gb2YgeW91ciBpbWFnZSB0byBkZXBsb3kuIFRoaXMgc2hvdWxkIHJlZmVyZW5jZSBhIHNwZWNpZmljIGltYWdlIGluIEVDUi5cbiAgICovXG4gIHJlYWRvbmx5IHNlcnZpY2VWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBuYW1lIG9mIGEgZmFtaWx5IHRoYXQgdGhlIHRhc2sgZGVmaW5pdGlvbiBpcyByZWdpc3RlcmVkIHRvLlxuICAgKiBAZGVmYXVsdCB1c2VzIHNlcnZpY2VOYW1lXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjZmFtaWx5XG4gICAqL1xuICByZWFkb25seSBmYW1pbHk/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFByZWZpeCB0byBiZSBhZGRlZCB0byBzb21lIHJlc291cmNlIG5hbWVzXG4gICAqIEBkZWZhdWx0IFdhdGNoYm90XG4gICAqL1xuICByZWFkb25seSBwcmVmaXg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IHtzdGFja05hbWV9LXtyZWdpb259LXtwcmVmaXh9XG4gICAqL1xuICByZWFkb25seSBsb2dHcm91cE5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IFJldGVudGlvbkRheXMuVFdPX1dFRUtTXG4gICAqL1xuICByZWFkb25seSBsb2dHcm91cFJldGVudGlvbkRheXM/OiBSZXRlbnRpb25EYXlzO1xuXG4gIC8qKlxuICAgKiBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIHJldHJ5IGEgbWVzc2FnZSBiZWZvcmUgc2VuZGluZyBpdCB0byB0aGUgZGVhZC1sZXR0ZXIgcXVldWVcbiAgICogQGRlZmF1bHQgMTBcbiAgICovXG4gIHJlYWRvbmx5IGRlYWRMZXR0ZXJUaHJlc2hvbGQ/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBudW1iZXIgb2Ygc2Vjb25kcyB0aGF0IEFtYXpvbiBTUVMgcmV0YWlucyBhIG1lc3NhZ2VcbiAgICogQGRlZmF1bHQgRHVyYXRpb24uZGF5cygxNClcbiAgICovXG4gIHJlYWRvbmx5IHJldGVudGlvblBlcmlvZD86IER1cmF0aW9uO1xuXG4gIC8qKlxuICAgKiBTcGVjaWZpZXMgd2hldGhlciB0aGUgY29udGFpbmVyIGlzIG1hcmtlZCBhcyBwcml2aWxlZ2VkLiBXaGVuIHRoaXMgcGFyYW1ldGVyIGlzIHRydWUsIHRoZSBjb250YWluZXIgaXMgZ2l2ZW4gZWxldmF0ZWQgcHJpdmlsZWdlcyBvbiB0aGUgaG9zdCBjb250YWluZXIgaW5zdGFuY2UgKHNpbWlsYXIgdG8gdGhlIHJvb3QgdXNlcilcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IHByaXZpbGVnZWQ/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBAZGVmYXVsdCB0aGUgYC90bXBgIGRpcmVjdG9yeSBpcyBhZGRlZCBhcyBhbiBlcGhlbWVyYWwgbW91bnQuXG4gICAqL1xuICByZWFkb25seSBtb3VudFBvaW50cz86IE1vdW50UG9pbnRbXTtcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHRoZSAnL3RtcCcgZGlyZWN0b3J5XG4gICAqL1xuICByZWFkb25seSB2b2x1bWVzPzogVm9sdW1lW107XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZW1pdCBsb2dzIGluIEpTT04gZm9ybWF0IG9yIG5vdFxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgc3RydWN0dXJlZExvZ2dpbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBHaXZlIHRoZSBjb250YWluZXIgcmVhZC13cml0ZSBhY2Nlc3MgdG8gdGhlIHJvb3QgZmlsZSBzeXN0ZW0uIFByZXZpb3VzbHkgd3JpdGFibGVGaWxlc3lzdGVtLlxuICAgKiBAZGVmYXVsdCB0cnVlXG4gICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21hcGJveC9lY3Mtd2F0Y2hib3QvYmxvYi9tYXN0ZXIvZG9jcy9idWlsZGluZy1hLXRlbXBsYXRlLm1kI3dyaXRhYmxlZmlsZXN5c3RlbS1tb2RlLWV4cGxhaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgcmVhZG9ubHlSb290RmlsZXN5c3RlbT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFRoZSBtYXhpbXVtIGR1cmF0aW9uIHRoYXQgYSBqb2IgaXMgYWxsb3dlZCB0byBydW4uIEFmdGVyIHRoaXMgdGltZSBwZXJpb2QsIHRoZSB3b3JrZXIgd2lsbCBiZSBzdG9wcGVkIGFuZCB0aGUgam9iIHdpbGwgYmUgcmV0dXJuZWQgdG8gdGhlIHF1ZXVlLlxuICAgKiBAZGVmYXVsdCAwXG4gICAqL1xuICByZWFkb25seSBtYXhKb2JEdXJhdGlvbj86IER1cmF0aW9uO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCB2YXJpYWJsZXMgcGFzc2VkIHRvIHRoZSBjb250YWluZXIgcnVubmluZyB0aGUgdGFzay4gVGhpcyB3aWxsIGFsd2F5cyBpbmNsdWRlIFF1ZXVlVXJsLCBRVUVVRV9OQU1FLCBMb2dHcm91cCAoQVJOKSwgd3JpdGFibGVGaWxlc3lzdGVtLCBtYXhKb2JEdXJhdGlvbiAoaW4gc2Vjb25kcyksIFZvbHVtZXMgKGNvbW1hIHNlcGFyYXRlZCBzdHJpbmcpLCBGaWZvIChBUk4pLCBXb3JrVG9waWMgKFNOUyB0b3BpYyBBUk4pLCBzdHJ1Y3R1cmVkTG9nZ2luZyAodHJ1ZSBvciBmYWxzZSBzdHJpbmcpLlxuICAgKiBZb3UgY2FuIG92ZXJyaWRlIG9yIGFwcGVuZCB0byB0aGVzZSB2YXJpYWJsZXMuXG4gICAqL1xuICByZWFkb25seSBlbnZpcm9ubWVudD86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cbiAgLyoqXG4gICAqIFRoZSBzb2Z0IGxpbWl0IChpbiBNaUIpIG9mIG1lbW9yeSB0byByZXNlcnZlIGZvciB0aGUgY29udGFpbmVyLiBQcmV2aW91c2x5IHJlc2VydmF0aW9uLnNvZnRNZW1vcnlcbiAgICogQGRlZmF1bHQgTm8gbWVtb3J5IHJlc2VydmVkXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zLmh0bWwjbWVtb3J5cmVzZXJ2YXRpb25taWJcbiAgICovXG4gIHJlYWRvbmx5IG1lbW9yeVJlc2VydmF0aW9uTWlCPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIHVzZSBhIEZJRk8gcXVldWUgb3IgYSBzdGFuZGFyZCBxdWV1ZSB3aXRoIFNOUyBUb3BpY1xuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXBib3gvZWNzLXdhdGNoYm90L2Jsb2IvbWFzdGVyL2RvY3MvdXNpbmctYS1maWZvLXF1ZXVlLm1kXG4gICAqL1xuICByZWFkb25seSBmaWZvPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUHJldmlvdXNseSBtYXhTaXplXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjbWF4c2NhbGluZ2NhcGFjaXR5XG4gICAqL1xuICByZWFkb25seSBtYXhTY2FsaW5nQ2FwYWNpdHk/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFByZXZpb3VzbHkgbWluU2l6ZVxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI21pbnNjYWxpbmdjYXBhY2l0eVxuICAgKi9cbiAgcmVhZG9ubHkgbWluU2NhbGluZ0NhcGFjaXR5PzogbnVtYmVyO1xuXG4gIHJlYWRvbmx5IGFsYXJtczogV2F0Y2hib3RBbGFybXM7XG5cbiAgLyoqXG4gICAqIElmIHRoaXMgcHJvcGVydHkgaXMgcHJlc2VudCwgd2F0Y2hib3Qgd2lsbCBydW4gaW4gcmVkdWNlIG1vZGUuIFdhdGNoYm90IHdpbGwgYmUgY2FwYWJsZSBvZiBoZWxwaW5nIHRyYWNrIHRoZSBwcm9ncmVzcyBvZiBkaXN0cmlidXRlZCBtYXAtcmVkdWNlIG9wZXJhdGlvbnMuXG4gICAqIEBkZWZhdWx0IERvZXMgbm90IHJ1biBpbiByZWR1Y2UgbW9kZVxuICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXBib3gvZWNzLXdhdGNoYm90L2Jsb2IvbWFzdGVyL2RvY3MvcmVkdWNlLW1vZGUubWRcbiAgICovXG4gIHJlYWRvbmx5IHJlZHVjZU1vZGVDb25maWd1cmF0aW9uPzoge1xuICAgIC8qKlxuICAgICAqIFdoZXRoZXIgdG8gcnVuIFdhdGNoYm90IGluIHJlZHVjZSBtb2RlXG4gICAgICovXG4gICAgZW5hYmxlZDogYm9vbGVhbjtcblxuICAgIC8qKlxuICAgICAqIEBkZWZhdWx0IDMwXG4gICAgICovXG4gICAgcmVhZENhcGFjaXR5VW5pdHM/OiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQGRlZmF1bHQgMzBcbiAgICAgKi9cbiAgICB3cml0ZUNhcGFjaXR5VW5pdHM/OiBudW1iZXI7XG4gIH07XG59XG5cbmV4cG9ydCB0eXBlIFdhdGNoYm90QWxhcm1zID0ge1xuICAvKipcbiAgICogU05TIHRvcGljIHRvIHNlbmQgYWxhcm0gYWN0aW9ucyB0by4gSW4gbW9zdCBjYXNlcywgeW91J2xsIG5lZWQgdG8gZ2V0IHRoZSB0b3BpYyBBUk4gdXNpbmcgbWFwYm94LWNkay1jb21tb24gQXJuVXRpbGl0eS5nZXRPbmNhbGxBcm4oKSB0aGVuIGltcG9ydCB0aGF0IGluIENESyB1c2luZyBgVG9waWMuZnJvbVRvcGljQXJuYC5cbiAgICovXG4gIGFjdGlvbjogSVRvcGljO1xuXG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7IHRocmVzaG9sZDogMTAwLCBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoMSksIGV2YWx1YXRpb25QZXJpb2RzOiAxMCB9XG4gICAqL1xuICBtZW1vcnlVdGlsaXphdGlvbj86IEFsYXJtUHJvcHM7XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7IHRocmVzaG9sZDogOTAsIHBlcmlvZDogRHVyYXRpb24ubWludXRlcygxKSwgZXZhbHVhdGlvblBlcmlvZHM6IDEwIH1cbiAgICovXG4gIGNwdVV0aWxpemF0aW9uPzogQWxhcm1Qcm9wcztcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHsgdGhyZXNob2xkOiA0MCwgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLCBldmFsdWF0aW9uUGVyaW9kczogMjQgfVxuICAgKi9cbiAgcXVldWVTaXplPzogQWxhcm1Qcm9wcztcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHsgdGhyZXNob2xkOiAxMCwgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDEpLCBldmFsdWF0aW9uUGVyaW9kczogMSB9XG4gICAqL1xuICBkbHFTaXplPzogQWxhcm1Qcm9wcztcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHsgdGhyZXNob2xkOiAxMCwgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDEpLCBldmFsdWF0aW9uUGVyaW9kczogMSB9XG4gICAqL1xuICB3b3JrZXJzRXJyb3JzPzogQWxhcm1Qcm9wcztcbn07XG5cbmV4cG9ydCB0eXBlIEFsYXJtUHJvcHMgPSB7XG4gIHRocmVzaG9sZD86IG51bWJlcjtcbiAgZXZhbHVhdGlvblBlcmlvZHM/OiBudW1iZXI7XG4gIHBlcmlvZD86IER1cmF0aW9uO1xufTtcblxuZW51bSBTdXBwb3J0ZWRSZWdpb24ge1xuICBVc0Vhc3QxID0gJ3VzLWVhc3QtMScsXG4gIFVzRWFzdDIgPSAndXMtZWFzdC0yJyxcbiAgQXBOb3J0aGVhc3QxID0gJ2FwLW5vcnRoZWFzdC0xJ1xufVxuXG5jb25zdCBWUENfSURzOiB7IFtrZXkgaW4gU3VwcG9ydGVkUmVnaW9uXTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9ID0ge1xuICBbU3VwcG9ydGVkUmVnaW9uLlVzRWFzdDFdOiB7XG4gICAgcHJvZHVjdGlvbjogJ3ZwYy0wNDhmNTIxOWE0MmY0NmY2YScsXG4gICAgc3RhZ2luZzogJ3ZwYy0wZGY2YTBjN2FmMTU1OWY5ZidcbiAgfSxcbiAgW1N1cHBvcnRlZFJlZ2lvbi5Vc0Vhc3QyXToge1xuICAgIHByb2R1Y3Rpb246ICd2cGMtMGE5NzQxNWJlYzU1Y2RiNDUnLFxuICAgIHN0YWdpbmc6ICd2cGMtMDk1M2UyNTUxNTYxNDgxNGQnXG4gIH0sXG4gIFtTdXBwb3J0ZWRSZWdpb24uQXBOb3J0aGVhc3QxXToge1xuICAgIHByb2R1Y3Rpb246ICd2cGMtMDE4NDhlMDM3MTZjZjBmYTYnLFxuICAgIHN0YWdpbmc6ICd2cGMtMDJkOWRjODdjYjJmM2JjMWEnXG4gIH1cbn07XG5cbmNvbnN0IE5FVFdPUktJTkdfU1RHX0FDQ09VTlRfSUQgPSAnNTUzNTcxNDA4NjAyJztcbmNvbnN0IE5FVFdPUktJTkdfUFJPRF9BQ0NPVU5UX0lEID0gJzkzOTcyMzQ1NjE1JztcblxuZXhwb3J0IGNsYXNzIEZhcmdhdGVXYXRjaGJvdCBleHRlbmRzIFJlc291cmNlIHtcbiAgcHJvdGVjdGVkIHJlYWRvbmx5IHByb3BzOiBXYXRjaGJvdFByb3BzO1xuICBwdWJsaWMgc2VydmljZTogQmFzZVNlcnZpY2U7XG4gIHB1YmxpYyB0YXNrRGVmaW5pdGlvbjogVGFza0RlZmluaXRpb247XG5cbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI/OiBJQ2x1c3RlcjtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBMb2dHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHF1ZXVlOiBJUXVldWU7XG4gIHB1YmxpYyByZWFkb25seSBkZWFkTGV0dGVyUXVldWU6IElRdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IG1vbml0b3Jpbmc6IE1vbml0b3JpbmdGYWNhZGU7XG4gIHB1YmxpYyByZWFkb25seSBxdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZTogTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2U7XG4gIHB1YmxpYyByZWFkb25seSB0b3BpYzogVG9waWMgfCB1bmRlZmluZWQ7XG4gIHB1YmxpYyByZWFkb25seSBjb250YWluZXI6IENvbnRhaW5lckRlZmluaXRpb24gfCB1bmRlZmluZWQ7XG4gIHB1YmxpYyByZWFkb25seSB0YWJsZTogYXdzX2R5bmFtb2RiLlRhYmxlO1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgUlVOQk9PSzogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiBDb25zdHJ1Y3Q7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFdhdGNoYm90UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIHRoaXMuc2NvcGUgPSBzY29wZTtcblxuICAgIGlmICghWydwcm9kdWN0aW9uJywgJ3N0YWdpbmcnXS5pbmNsdWRlcyhwcm9wcy5kZXBsb3ltZW50RW52aXJvbm1lbnQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBkZXBsb3ltZW50RW52aXJvbm1lbnQgbXVzdCBiZSBvbmUgb2YgW3N0YWdpbmcsIHByb2R1Y3Rpb25dIGJ1dCByZWNlaXZlZCBkZXBsb3ltZW50RW52aXJvbm1lbnQ9JHtwcm9wcy5kZXBsb3ltZW50RW52aXJvbm1lbnR9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLlJVTkJPT0sgPSBgaHR0cHM6Ly9naXRodWIuY29tL21hcGJveC9lY3Mtd2F0Y2hib3QvYmxvYi8ke3BrZy52ZXJzaW9ufS9kb2NzL2FsYXJtcy5tZGA7XG5cbiAgICB0aGlzLnByb3BzID0gdGhpcy5tZXJnZVByb3BzV2l0aERlZmF1bHRzKGlkLCBwcm9wcyk7XG5cbiAgICB0aGlzLmxvZ0dyb3VwID0gbmV3IExvZ0dyb3VwKHRoaXMsICdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogdGhpcy5wcm9wcy5sb2dHcm91cE5hbWUsXG4gICAgICByZXRlbnRpb246IHRoaXMucHJvcHMubG9nR3JvdXBSZXRlbnRpb25EYXlzLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG4gICAgKHRoaXMubG9nR3JvdXAubm9kZS5kZWZhdWx0Q2hpbGQgYXMgQ2ZuTG9nR3JvdXApLm92ZXJyaWRlTG9naWNhbElkKHRoaXMucHJlZml4ZWQoJ0xvZ0dyb3VwJykpO1xuXG4gICAgLy8gd29ya2Fyb3VuZCBmb3IgYSBidWcgd2hlbiB5b3Ugc2V0IGZpZm8gPSBmYWxzZVxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvODU1MFxuICAgIGNvbnN0IGFkZGl0aW9uYWxGaWZvUHJvcGVydGllcyA9IHRoaXMucHJvcHMuZmlmbz8geyBmaWZvOiB0cnVlLCBjb250ZW50QmFzZWREZWR1cGxpY2F0aW9uOiB0cnVlIH0gOiB7IGNvbnRlbnRCYXNlZERlZHVwbGljYXRpb246IGZhbHNlIH07XG5cbiAgICB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSA9IG5ldyBRdWV1ZSh0aGlzLCAnRGVhZExldHRlclF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByZWZpeGVkKCdEZWFkTGV0dGVyUXVldWUnKX1gLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiB0aGlzLnByb3BzLnJldGVudGlvblBlcmlvZCB8fCBEdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIC4uLmFkZGl0aW9uYWxGaWZvUHJvcGVydGllc1xuICAgIH0pO1xuXG4gICAgdGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZSh0aGlzLCAnUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMucHJlZml4ZWQoJ1F1ZXVlJyl9YCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogdGhpcy5wcm9wcy5yZXRlbnRpb25QZXJpb2QgfHwgRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxODApLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiB0aGlzLnByb3BzLmRlYWRMZXR0ZXJUaHJlc2hvbGQgfHwgMTBcbiAgICAgIH0sXG4gICAgICAuLi5hZGRpdGlvbmFsRmlmb1Byb3BlcnRpZXNcbiAgICB9KTtcblxuICAgIHRoaXMuY2x1c3RlciA9IHRoaXMucHJvcHMuY2x1c3RlcjtcblxuICAgIGNvbnN0IHF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHM6IE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHMgPSB7XG4gICAgICAvLyBTZXJ2aWNlIHByb3BzXG4gICAgICBzZXJ2aWNlTmFtZTogdGhpcy5wcm9wcy5zZXJ2aWNlTmFtZSxcblxuICAgICAgLy8gVGFzayBEZWZpbml0aW9uIHByb3BzXG4gICAgICBjcHU6IHRoaXMucHJvcHMuY3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHRoaXMucHJvcHMubWVtb3J5TGltaXRNaUIsXG4gICAgICBmYW1pbHk6IHRoaXMucHJvcHMuZmFtaWx5LFxuICAgICAgcnVudGltZVBsYXRmb3JtOiB0aGlzLnByb3BzLnJ1bnRpbWVQbGF0Zm9ybSxcbiAgICAgIHZvbHVtZXM6IHRoaXMucHJvcHMudm9sdW1lcyxcbiAgICAgIHByaXZpbGVnZWQ6IHRoaXMucHJvcHMucHJpdmlsZWdlZCxcbiAgICAgIHJlYWRvbmx5Um9vdEZpbGVzeXN0ZW06IHRoaXMucHJvcHMucmVhZG9ubHlSb290RmlsZXN5c3RlbSxcbiAgICAgIG1lbW9yeVJlc2VydmF0aW9uTWlCOiB0aGlzLnByb3BzLm1lbW9yeVJlc2VydmF0aW9uTWlCLFxuXG4gICAgICAvLyBDb250YWluZXIgcHJvcHNcbiAgICAgIGltYWdlOiB0aGlzLnByb3BzLmltYWdlLFxuICAgICAgY29udGFpbmVyTmFtZTogdGhpcy5wcm9wcy5jb250YWluZXJOYW1lLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUXVldWVVcmw6IHRoaXMucXVldWUucXVldWVVcmwsXG4gICAgICAgIExvZ0dyb3VwOiB0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuLFxuICAgICAgICB3cml0YWJsZUZpbGVzeXN0ZW06ICghdGhpcy5wcm9wcy5yZWFkb25seVJvb3RGaWxlc3lzdGVtKT8udG9TdHJpbmcoKSB8fCAnJyxcbiAgICAgICAgbWF4Sm9iRHVyYXRpb246IGAke3RoaXMucHJvcHMubWF4Sm9iRHVyYXRpb24/LnRvU2Vjb25kcygpIHx8IDB9YCxcbiAgICAgICAgVm9sdW1lczogKHRoaXMucHJvcHMubW91bnRQb2ludHMgfHwgW10pLm1hcCgobSkgPT4gbS5jb250YWluZXJQYXRoKS5qb2luKCcsJyksXG4gICAgICAgIEZpZm86ICh0aGlzLnByb3BzLmZpZm8gfHwgZmFsc2UpLnRvU3RyaW5nKCksXG4gICAgICAgIHN0cnVjdHVyZWRMb2dnaW5nOiAodGhpcy5wcm9wcy5zdHJ1Y3R1cmVkTG9nZ2luZyB8fCBmYWxzZSkudG9TdHJpbmcoKSxcbiAgICAgICAgLi4udGhpcy5wcm9wcy5lbnZpcm9ubWVudFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHRoaXMucHJvcHMuc2VjcmV0cyxcbiAgICAgIGNvbW1hbmQ6IFsnd2F0Y2hib3QnLCAnbGlzdGVuJywgLi4udGhpcy5wcm9wcy5jb21tYW5kXSxcbiAgICAgIGVuYWJsZUxvZ2dpbmc6IHRydWUsXG4gICAgICBsb2dEcml2ZXI6IExvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogdGhpcy5wcm9wcy5zZXJ2aWNlVmVyc2lvbixcbiAgICAgICAgbG9nR3JvdXA6IHRoaXMubG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgaGVhbHRoQ2hlY2s6IHRoaXMucHJvcHMuaGVhbHRoQ2hlY2ssXG5cbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuXG4gICAgICBjbHVzdGVyOiB0aGlzLmNsdXN0ZXIsXG4gICAgICBwcm9wYWdhdGVUYWdzOiBQcm9wYWdhdGVkVGFnU291cmNlLlRBU0tfREVGSU5JVElPTixcblxuICAgICAgLy8gc2NhbGluZyBwcm9wc1xuICAgICAgc2NhbGluZ1N0ZXBzOiB0aGlzLnByb3BzLnNjYWxpbmdTdGVwcyxcbiAgICAgIG1heFNjYWxpbmdDYXBhY2l0eTogdGhpcy5wcm9wcy5tYXhTY2FsaW5nQ2FwYWNpdHksXG4gICAgICBtaW5TY2FsaW5nQ2FwYWNpdHk6IHRoaXMucHJvcHMubWluU2NhbGluZ0NhcGFjaXR5LFxuXG4gICAgICAvLyBuZXR3b3JrIGNvbmZpZyBwcm9wc1xuICAgICAgdGFza1N1Ym5ldHM6IHRoaXMucHJvcHMuc3VibmV0cyxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiB0aGlzLnByb3BzLnB1YmxpY0lQLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IHRoaXMucHJvcHMuc2VjdXJpdHlHcm91cHNcbiAgICB9O1xuICAgIHRoaXMucXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UgPSBuZXcgTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UoXG4gICAgICB0aGlzLFxuICAgICAgJ1NlcnZpY2UnLFxuICAgICAgcXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2VQcm9wc1xuICAgICk7XG4gICAgdGhpcy5zZXJ2aWNlID0gdGhpcy5xdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5zZXJ2aWNlO1xuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSB0aGlzLnF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLnRhc2tEZWZpbml0aW9uO1xuXG4gICAgdGhpcy5jb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmZpbmRDb250YWluZXIodGhpcy5wcm9wcy5jb250YWluZXJOYW1lIHx8ICcnKTtcbiAgICBpZiAodGhpcy5jb250YWluZXIpIHtcbiAgICAgIHRoaXMuY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKC4uLih0aGlzLnByb3BzLm1vdW50UG9pbnRzIHx8IFtdKSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRVbGltaXRzKHtcbiAgICAgICAgbmFtZTogVWxpbWl0TmFtZS5OT0ZJTEUsXG4gICAgICAgIHNvZnRMaW1pdDogMTAyNDAsXG4gICAgICAgIGhhcmRMaW1pdDogMTAyNDBcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGNvbnRhaW5lciB3aXRoIGNvbnRhaW5lck5hbWU9JHt0aGlzLnByb3BzLmNvbnRhaW5lck5hbWV9YCk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnByb3BzLmZpZm8pIHtcbiAgICAgIHRoaXMudG9waWMgPSBuZXcgVG9waWModGhpcywgJ1RvcGljJywge1xuICAgICAgICB0b3BpY05hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMucHJvcHMucHJlZml4fVRvcGljYFxuICAgICAgfSk7XG4gICAgICB0aGlzLnRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgU3FzU3Vic2NyaXB0aW9uKHRoaXMucXVldWUpKTtcbiAgICAgIHRoaXMucXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoXG4gICAgICAgIG5ldyBQcmluY2lwYWxXaXRoQ29uZGl0aW9ucyhuZXcgQW55UHJpbmNpcGFsKCksIHtcbiAgICAgICAgICBBcm5FcXVhbHM6IHtcbiAgICAgICAgICAgICdhd3M6U291cmNlQXJuJzogdGhpcy50b3BpYy50b3BpY0FyblxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICB0aGlzLnRvcGljLmdyYW50UHVibGlzaCh0aGlzLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlKTtcbiAgICAgIHRoaXMuY29udGFpbmVyLmFkZEVudmlyb25tZW50KCdXb3JrVG9waWMnLCB0aGlzLnRvcGljLnRvcGljQXJuKTtcbiAgICB9XG5cbiAgICB0aGlzLm1vbml0b3JpbmcgPSB0aGlzLmNyZWF0ZUFsYXJtcygpO1xuXG4gICAgaWYgKHRoaXMucHJvcHMucmVkdWNlTW9kZUNvbmZpZ3VyYXRpb24/LmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gbmV3IGF3c19keW5hbW9kYi5UYWJsZSh0aGlzLCAnUHJvZ3Jlc3NUYWJsZScsIHtcbiAgICAgICAgdGFibGVOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByZWZpeGVkKCctcHJvZ3Jlc3MnKX1gLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHJlYWRDYXBhY2l0eTogdGhpcy5wcm9wcy5yZWR1Y2VNb2RlQ29uZmlndXJhdGlvbi5yZWFkQ2FwYWNpdHlVbml0cyB8fCAzMCxcbiAgICAgICAgd3JpdGVDYXBhY2l0eTogdGhpcy5wcm9wcy5yZWR1Y2VNb2RlQ29uZmlndXJhdGlvbi53cml0ZUNhcGFjaXR5VW5pdHMgfHwgMzAsXG4gICAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICAgIG5hbWU6ICdpZCcsXG4gICAgICAgICAgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkdcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAodGFibGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgQ2ZuVGFibGUpLm92ZXJyaWRlTG9naWNhbElkKCdQcm9ncmVzc1RhYmxlJyk7XG4gICAgICB0aGlzLnRhYmxlID0gdGFibGU7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRFbnZpcm9ubWVudCgnUHJvZ3Jlc3NUYWJsZScsIHRoaXMudGFibGUudGFibGVBcm4pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQWxhcm1zKCkge1xuICAgIGNvbnN0IG1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZ0ZhY2FkZSh0aGlzLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGFsYXJtRmFjdG9yeURlZmF1bHRzOiB7XG4gICAgICAgIGFsYXJtTmFtZVByZWZpeDogdGhpcy5wcmVmaXhlZCgnJyksXG4gICAgICAgIGFjdGlvbnNFbmFibGVkOiB0cnVlLFxuICAgICAgICBhY3Rpb246IG5ldyBTbnNBbGFybUFjdGlvblN0cmF0ZWd5KHtcbiAgICAgICAgICBvbkFsYXJtVG9waWM6IHRoaXMucHJvcHMuYWxhcm1zLmFjdGlvblxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgd29ya2Vyc0Vycm9yc01ldHJpYyA9IHRoaXMubG9nR3JvdXBcbiAgICAgIC5hZGRNZXRyaWNGaWx0ZXIodGhpcy5wcmVmaXhlZCgnV29ya2VyRXJyb3JzTWV0cmljJyksIHtcbiAgICAgICAgbWV0cmljTmFtZTogYCR7dGhpcy5wcmVmaXhlZCgnV29ya2VyRXJyb3JzJyl9LSR7dGhpcy5zdGFjay5zdGFja05hbWV9YCxcbiAgICAgICAgbWV0cmljTmFtZXNwYWNlOiAnTWFwYm94L2Vjcy13YXRjaGJvdCcsXG4gICAgICAgIG1ldHJpY1ZhbHVlOiAnMScsXG4gICAgICAgIGZpbHRlclBhdHRlcm46IEZpbHRlclBhdHRlcm4uYW55VGVybSgnXCJbZmFpbHVyZV1cIicpXG4gICAgICB9KVxuICAgICAgLm1ldHJpYyh7XG4gICAgICAgIHN0YXRpc3RpYzogU3RhdHMuU1VNXG4gICAgICB9KTtcblxuICAgIG1vbml0b3JpbmdcbiAgICAgIC5hZGRMYXJnZUhlYWRlcih0aGlzLnByZWZpeGVkKHRoaXMuc3RhY2suc3RhY2tOYW1lKSlcbiAgICAgIC5tb25pdG9yUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2Uoe1xuICAgICAgICBmYXJnYXRlU2VydmljZTogdGhpcy5xdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZSxcbiAgICAgICAgYWRkU2VydmljZUFsYXJtczoge1xuICAgICAgICAgIGFkZE1lbW9yeVVzYWdlQWxhcm06IHtcbiAgICAgICAgICAgIG1lbW9yeVVzYWdlOiB7XG4gICAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I21lbW9yeXV0aWxpemF0aW9uYCxcbiAgICAgICAgICAgICAgbWF4VXNhZ2VQZXJjZW50OiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8udGhyZXNob2xkIHx8IDEwMCxcbiAgICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8ucGVyaW9kIHx8IER1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMTBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFkZENwdVVzYWdlQWxhcm06IHtcbiAgICAgICAgICAgIGNwdToge1xuICAgICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSNDcHVVdGlsaXphdGlvbmAsXG4gICAgICAgICAgICAgIG1heFVzYWdlUGVyY2VudDogdGhpcy5wcm9wcy5hbGFybXMuY3B1VXRpbGl6YXRpb24/LnRocmVzaG9sZCB8fCA5MCxcbiAgICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5jcHVVdGlsaXphdGlvbj8ucGVyaW9kIHx8IER1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5jcHVVdGlsaXphdGlvbj8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMTBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAubW9uaXRvclNxc1F1ZXVlV2l0aERscSh7XG4gICAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgICBkZWFkTGV0dGVyUXVldWU6IHRoaXMuZGVhZExldHRlclF1ZXVlLFxuICAgICAgICBhZGRRdWV1ZU1heFNpemVBbGFybToge1xuICAgICAgICAgIG1heFNpemU6IHtcbiAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I1F1ZXVlU2l6ZWAsXG4gICAgICAgICAgICBtYXhNZXNzYWdlQ291bnQ6IHRoaXMucHJvcHMuYWxhcm1zLnF1ZXVlU2l6ZT8udGhyZXNob2xkIHx8IDQwLFxuICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5xdWV1ZVNpemU/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLnF1ZXVlU2l6ZT8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMjRcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFkZERlYWRMZXR0ZXJRdWV1ZU1heFNpemVBbGFybToge1xuICAgICAgICAgIG1heFNpemU6IHtcbiAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I0RlYWRMZXR0ZXJRdWV1ZVNpemVgLFxuICAgICAgICAgICAgbWF4TWVzc2FnZUNvdW50OiB0aGlzLnByb3BzLmFsYXJtcy5kbHFTaXplPy50aHJlc2hvbGQgfHwgMTAsXG4gICAgICAgICAgICBwZXJpb2Q6IHRoaXMucHJvcHMuYWxhcm1zLmRscVNpemU/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLmRscVNpemU/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEsXG4gICAgICAgICAgICBkYXRhcG9pbnRzVG9BbGFybTogdGhpcy5wcm9wcy5hbGFybXMuZGxxU2l6ZT8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMSAvLyBtYXRjaCBldmFsdWF0aW9uUGVyaW9kc1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5tb25pdG9yQ3VzdG9tKHtcbiAgICAgICAgYWRkVG9BbGFybURhc2hib2FyZDogdHJ1ZSxcbiAgICAgICAgYWxhcm1GcmllbmRseU5hbWU6IGB3b3JrZXItZXJyb3JzLSR7dGhpcy5zdGFjay5yZWdpb259YCxcbiAgICAgICAgbWV0cmljR3JvdXBzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGl0bGU6ICdXb3JrZXIgRXJyb3JzJyxcbiAgICAgICAgICAgIG1ldHJpY3M6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGFsYXJtRnJpZW5kbHlOYW1lOiBgd29ya2VyLWVycm9ycy0ke3RoaXMuc3RhY2sucmVnaW9ufWAsXG4gICAgICAgICAgICAgICAgbWV0cmljOiB3b3JrZXJzRXJyb3JzTWV0cmljLFxuICAgICAgICAgICAgICAgIGFkZEFsYXJtOiB7XG4gICAgICAgICAgICAgICAgICBlcnJvcjoge1xuICAgICAgICAgICAgICAgICAgICB0aHJlc2hvbGQ6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LnRocmVzaG9sZCB8fCAxMCxcbiAgICAgICAgICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEsXG4gICAgICAgICAgICAgICAgICAgIGRhdGFwb2ludHNUb0FsYXJtOiB0aGlzLnByb3BzLmFsYXJtcy53b3JrZXJzRXJyb3JzPy5ldmFsdWF0aW9uUGVyaW9kcyB8fCAxLCAvLyBtYXRjaCBldmFsdWF0aW9uUGVyaW9kc1xuICAgICAgICAgICAgICAgICAgICBwZXJpb2Q6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6IENvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgICAgICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSN3b3JrZXJlcnJvcnNgXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9KTtcbiAgICByZXR1cm4gbW9uaXRvcmluZztcbiAgfVxuXG4gIHByaXZhdGUgcHJlZml4ZWQgPSAobmFtZTogc3RyaW5nKSA9PiBgJHt0aGlzLnByb3BzLnByZWZpeH0ke25hbWV9YDtcblxuICBwcml2YXRlIG1lcmdlUHJvcHNXaXRoRGVmYXVsdHMoaWQ6IHN0cmluZywgcHJvcHM6IFdhdGNoYm90UHJvcHMpOiBXYXRjaGJvdFByb3BzIHtcbiAgICBjb25zdCB7IHJlZ2lvbiB9ID0gU3RhY2sub2YodGhpcy5zY29wZSk7XG5cbiAgICBjb25zdCBwcmVmaXggPSBwcm9wcy5wcmVmaXggPz8gJ1dhdGNoYm90JztcbiAgICBjb25zdCBERUZBVUxUX1BST1BTOiBQYXJ0aWFsPFdhdGNoYm90UHJvcHM+ID0ge1xuICAgICAgcHJlZml4LFxuICAgICAgY29udGFpbmVyTmFtZTogYCR7cHJlZml4fS0ke3RoaXMuc3RhY2suc3RhY2tOYW1lfWAsXG4gICAgICBzdHJ1Y3R1cmVkTG9nZ2luZzogZmFsc2UsXG4gICAgICByZWFkb25seVJvb3RGaWxlc3lzdGVtOiB0cnVlLFxuICAgICAgbWF4Sm9iRHVyYXRpb246IER1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICBmYW1pbHk6IHByb3BzLnNlcnZpY2VOYW1lLFxuICAgICAgY2x1c3RlcjogQ2x1c3Rlci5mcm9tQ2x1c3RlckF0dHJpYnV0ZXModGhpcywgYCR7aWR9Q2x1c3RlcmAsIHtcbiAgICAgICAgY2x1c3Rlck5hbWU6IGBmYXJnYXRlLXByb2Nlc3NpbmctJHtwcm9wcy5kZXBsb3ltZW50RW52aXJvbm1lbnR9YCxcbiAgICAgICAgdnBjOiBWcGMuZnJvbUxvb2t1cCh0aGlzLCBgJHtpZH1WUENgLCB7XG4gICAgICAgICAgdnBjSWQ6IFZQQ19JRHNbcmVnaW9uIGFzIFN1cHBvcnRlZFJlZ2lvbl1bcHJvcHMuZGVwbG95bWVudEVudmlyb25tZW50XSxcbiAgICAgICAgICBpc0RlZmF1bHQ6IGZhbHNlLFxuICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICBvd25lckFjY291bnRJZDpcbiAgICAgICAgICAgIHByb3BzLmRlcGxveW1lbnRFbnZpcm9ubWVudCA9PT0gJ3N0YWdpbmcnXG4gICAgICAgICAgICAgID8gTkVUV09SS0lOR19TVEdfQUNDT1VOVF9JRFxuICAgICAgICAgICAgICA6IE5FVFdPUktJTkdfUFJPRF9BQ0NPVU5UX0lEXG4gICAgICAgIH0pXG4gICAgICB9KSxcblxuICAgICAgcHVibGljSVA6IGZhbHNlLFxuICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgICBsb2dHcm91cE5hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMuc3RhY2sucmVnaW9ufS0ke3ByZWZpeC50b0xvd2VyQ2FzZSgpfWAsXG4gICAgICBsb2dHcm91cFJldGVudGlvbkRheXM6IFJldGVudGlvbkRheXMuVFdPX1dFRUtTLFxuICAgICAgbW91bnRQb2ludHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvdG1wJyxcbiAgICAgICAgICBzb3VyY2VWb2x1bWU6ICd0bXAnLFxuICAgICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICB2b2x1bWVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAndG1wJ1xuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgZmlmbzogZmFsc2UsXG4gICAgICBkZWFkTGV0dGVyVGhyZXNob2xkOiAxMCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICByZWR1Y2VNb2RlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgd3JpdGVDYXBhY2l0eVVuaXRzOiAzMCxcbiAgICAgICAgcmVhZENhcGFjaXR5VW5pdHM6IDMwXG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAuLi5ERUZBVUxUX1BST1BTLFxuICAgICAgLi4ucHJvcHNcbiAgICB9O1xuICB9XG59XG4iXX0=
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
        const additionalFifoProperties = this.props.fifo ? { fifo: true, contentBasedDeduplication: true } : {};
        this.deadLetterQueue = new aws_sqs_1.Queue(this, 'DeadLetterQueue', {
            queueName: `${this.stack.stackName}-${this.prefixed('DeadLetterQueue')}${this.props.fifo ? '.fifo' : ''}`,
            retentionPeriod: this.props.retentionPeriod || aws_cdk_lib_1.Duration.days(14),
            ...additionalFifoProperties
        });
        this.queue = new aws_sqs_1.Queue(this, 'Queue', {
            queueName: `${this.stack.stackName}-${this.prefixed('Queue')}${this.props.fifo ? '.fifo' : ''}`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hib3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaGJvdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2Q0FBcUY7QUFDckYsaURBQTJFO0FBQzNFLGlEQWU2QjtBQUM3QixpREFBNEU7QUFDNUUsbURBQTJGO0FBQzNGLGlEQUFvRDtBQUNwRCw2RUFBb0U7QUFDcEUsaURBQW9EO0FBR3BELCtGQUcrQztBQUMvQyx5RUFBcUY7QUFDckYsNkJBQTZCO0FBQzdCLCtEQUF1RTtBQUN2RSwyREFBbUU7QUFFbkUsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBd09uRSxJQUFLLGVBSUo7QUFKRCxXQUFLLGVBQWU7SUFDbEIsd0NBQXFCLENBQUE7SUFDckIsd0NBQXFCLENBQUE7SUFDckIsa0RBQStCLENBQUE7QUFDakMsQ0FBQyxFQUpJLGVBQWUsS0FBZixlQUFlLFFBSW5CO0FBRUQsTUFBTSxPQUFPLEdBQXlEO0lBQ3BFLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxFQUFFO1FBQzlCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztDQUNGLENBQUM7QUFFRixNQUFNLHlCQUF5QixHQUFHLGNBQWMsQ0FBQztBQUNqRCxNQUFNLDBCQUEwQixHQUFHLGFBQWEsQ0FBQztBQUVqRCxNQUFhLGVBQWdCLFNBQVEsc0JBQVE7SUFrQjNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVB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SUFBSSxFQUFFLEtBQUs7aUJBQ1o7YUFDRjtZQUNELElBQUksRUFBRSxLQUFLO1lBQ1gsbUJBQW1CLEVBQUUsRUFBRTtZQUN2QixlQUFlLEVBQUUsc0JBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2xDLHVCQUF1QixFQUFFO2dCQUN2QixPQUFPLEVBQUUsS0FBSztnQkFDZCxrQkFBa0IsRUFBRSxFQUFFO2dCQUN0QixpQkFBaUIsRUFBRSxFQUFFO2FBQ3RCO1NBQ0YsQ0FBQztRQUVGLE9BQU87WUFDTCxHQUFHLGFBQWE7WUFDaEIsR0FBRyxLQUFLO1NBQ1QsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTlURCwwQ0E4VEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBhd3NfZHluYW1vZGIsIER1cmF0aW9uLCBSZW1vdmFsUG9saWN5LCBSZXNvdXJjZSwgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBJU2VjdXJpdHlHcm91cCwgU3VibmV0U2VsZWN0aW9uLCBWcGMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCB7XG4gIEJhc2VTZXJ2aWNlLFxuICBDbHVzdGVyLFxuICBDb250YWluZXJEZWZpbml0aW9uLFxuICBDb250YWluZXJJbWFnZSxcbiAgSGVhbHRoQ2hlY2ssXG4gIElDbHVzdGVyLFxuICBMb2dEcml2ZXJzLFxuICBNb3VudFBvaW50LFxuICBQcm9wYWdhdGVkVGFnU291cmNlLFxuICBSdW50aW1lUGxhdGZvcm0sXG4gIFNlY3JldCxcbiAgVGFza0RlZmluaXRpb24sXG4gIFVsaW1pdE5hbWUsXG4gIFZvbHVtZVxufSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCB7IEFueVByaW5jaXBhbCwgUHJpbmNpcGFsV2l0aENvbmRpdGlvbnMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENmbkxvZ0dyb3VwLCBGaWx0ZXJQYXR0ZXJuLCBMb2dHcm91cCwgUmV0ZW50aW9uRGF5cyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IElUb3BpYywgVG9waWMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCB7IFNxc1N1YnNjcmlwdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgeyBJUXVldWUsIFF1ZXVlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNjYWxpbmdJbnRlcnZhbCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcHBsaWNhdGlvbmF1dG9zY2FsaW5nJztcbmltcG9ydCB7XG4gIE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLFxuICBNYXBib3hRdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZVByb3BzXG59IGZyb20gJy4vTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UnO1xuaW1wb3J0IHsgTW9uaXRvcmluZ0ZhY2FkZSwgU25zQWxhcm1BY3Rpb25TdHJhdGVneSB9IGZyb20gJ2Nkay1tb25pdG9yaW5nLWNvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IENvbXBhcmlzb25PcGVyYXRvciwgU3RhdHMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgeyBBdHRyaWJ1dGVUeXBlLCBDZm5UYWJsZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5cbmNvbnN0IHBrZyA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uJywgJ3BhY2thZ2UuanNvbicpKTtcblxuZXhwb3J0IGludGVyZmFjZSBXYXRjaGJvdFByb3BzIHtcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHtwcmVmaXh9LSR7c3RhY2tOYW1lfVxuICAgKi9cbiAgcmVhZG9ubHkgY29udGFpbmVyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGludGVydmFscyBmb3Igc2NhbGluZyBiYXNlZCBvbiB0aGUgU1FTIHF1ZXVlJ3MgQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSBtZXRyaWMuXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjc2NhbGluZ3N0ZXBzXG4gICAqL1xuICByZWFkb25seSBzY2FsaW5nU3RlcHM/OiBTY2FsaW5nSW50ZXJ2YWxbXTtcblxuICAvKipcbiAgICogVGhlIHJ1bnRpbWUgcGxhdGZvcm0gb2YgdGhlIHRhc2sgZGVmaW5pdGlvbi5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNydW50aW1lcGxhdGZvcm1cbiAgICovXG4gIHJlYWRvbmx5IHJ1bnRpbWVQbGF0Zm9ybT86IFJ1bnRpbWVQbGF0Zm9ybTtcblxuICAvKipcbiAgICogVGhlIHNlY3JldCB0byBleHBvc2UgdG8gdGhlIGNvbnRhaW5lciBhcyBhbiBlbnZpcm9ubWVudCB2YXJpYWJsZS5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNzZWNyZXRzXG4gICAqL1xuICByZWFkb25seSBzZWNyZXRzPzogUmVjb3JkPHN0cmluZywgU2VjcmV0PjtcblxuICAvKipcbiAgICogVGhlIGhlYWx0aCBjaGVjayBjb21tYW5kIGFuZCBhc3NvY2lhdGVkIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycyBmb3IgdGhlIGNvbnRhaW5lci5cbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNoZWFsdGhjaGVja1xuICAgKi9cbiAgcmVhZG9ubHkgaGVhbHRoQ2hlY2s/OiBIZWFsdGhDaGVjaztcblxuICAvKipcbiAgICogUHJldmlvdXNseSByZXNlcnZhdGlvbi5tZW1vcnlcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNtZW1vcnlsaW1pdG1pYlxuICAgKi9cbiAgcmVhZG9ubHkgbWVtb3J5TGltaXRNaUI/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFByZXZpb3VzbHkgcmVzZXJ2YXRpb24uY3B1XG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjY3B1XG4gICAqL1xuICByZWFkb25seSBjcHU/OiBudW1iZXI7XG5cbiAgcmVhZG9ubHkgc3VibmV0cz86IFN1Ym5ldFNlbGVjdGlvbjtcbiAgLyoqXG4gICAqIFdoZXRoZXIgdGhlIHRhc2tzJyBlbGFzdGljIG5ldHdvcmsgaW50ZXJmYWNlIHJlY2VpdmVzIGEgcHVibGljIElQIGFkZHJlc3MuIFNob3VsZCBiZSBgdHJ1ZWAgaWYgYHN1Ym5ldHNgIGFyZSBwdWJsaWMuXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL0FXU0Nsb3VkRm9ybWF0aW9uL2xhdGVzdC9Vc2VyR3VpZGUvYXdzLXByb3BlcnRpZXMtZWNzLXNlcnZpY2UtYXdzdnBjY29uZmlndXJhdGlvbi5odG1sXG4gICAqL1xuICByZWFkb25seSBwdWJsaWNJUD86IGJvb2xlYW47XG5cbiAgcmVhZG9ubHkgc2VjdXJpdHlHcm91cHM/OiBJU2VjdXJpdHlHcm91cFtdO1xuXG4gIHJlYWRvbmx5IGltYWdlOiBDb250YWluZXJJbWFnZTtcbiAgcmVhZG9ubHkgY2x1c3Rlcj86IElDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBUaGUgbmFtZSBvZiB0aGUgc2VydmljZS5cbiAgICovXG4gIHJlYWRvbmx5IHNlcnZpY2VOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBjb21tYW5kIHRoYXQgaXMgcGFzc2VkIHRvIHRoZSBjb250YWluZXIuIFRoaXMgd2lsbCBiZSBhcHBlbmRlZCB0byAnd2F0Y2hib3QgbGlzdGVuJyBjb21tYW5kLlxuICAgKi9cbiAgcmVhZG9ubHkgY29tbWFuZDogc3RyaW5nW107XG5cbiAgcmVhZG9ubHkgZGVwbG95bWVudEVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSB2ZXJzaW9uIG9mIHlvdXIgaW1hZ2UgdG8gZGVwbG95LiBUaGlzIHNob3VsZCByZWZlcmVuY2UgYSBzcGVjaWZpYyBpbWFnZSBpbiBFQ1IuXG4gICAqL1xuICByZWFkb25seSBzZXJ2aWNlVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgbmFtZSBvZiBhIGZhbWlseSB0aGF0IHRoZSB0YXNrIGRlZmluaXRpb24gaXMgcmVnaXN0ZXJlZCB0by5cbiAgICogQGRlZmF1bHQgdXNlcyBzZXJ2aWNlTmFtZVxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI2ZhbWlseVxuICAgKi9cbiAgcmVhZG9ubHkgZmFtaWx5Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBQcmVmaXggdG8gYmUgYWRkZWQgdG8gc29tZSByZXNvdXJjZSBuYW1lc1xuICAgKiBAZGVmYXVsdCBXYXRjaGJvdFxuICAgKi9cbiAgcmVhZG9ubHkgcHJlZml4Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7c3RhY2tOYW1lfS17cmVnaW9ufS17cHJlZml4fVxuICAgKi9cbiAgcmVhZG9ubHkgbG9nR3JvdXBOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZGVmYXVsdCBSZXRlbnRpb25EYXlzLlRXT19XRUVLU1xuICAgKi9cbiAgcmVhZG9ubHkgbG9nR3JvdXBSZXRlbnRpb25EYXlzPzogUmV0ZW50aW9uRGF5cztcblxuICAvKipcbiAgICogVGhlIG51bWJlciBvZiB0aW1lcyB0byByZXRyeSBhIG1lc3NhZ2UgYmVmb3JlIHNlbmRpbmcgaXQgdG8gdGhlIGRlYWQtbGV0dGVyIHF1ZXVlXG4gICAqIEBkZWZhdWx0IDEwXG4gICAqL1xuICByZWFkb25seSBkZWFkTGV0dGVyVGhyZXNob2xkPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBUaGUgbnVtYmVyIG9mIHNlY29uZHMgdGhhdCBBbWF6b24gU1FTIHJldGFpbnMgYSBtZXNzYWdlXG4gICAqIEBkZWZhdWx0IER1cmF0aW9uLmRheXMoMTQpXG4gICAqL1xuICByZWFkb25seSByZXRlbnRpb25QZXJpb2Q/OiBEdXJhdGlvbjtcblxuICAvKipcbiAgICogU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGNvbnRhaW5lciBpcyBtYXJrZWQgYXMgcHJpdmlsZWdlZC4gV2hlbiB0aGlzIHBhcmFtZXRlciBpcyB0cnVlLCB0aGUgY29udGFpbmVyIGlzIGdpdmVuIGVsZXZhdGVkIHByaXZpbGVnZXMgb24gdGhlIGhvc3QgY29udGFpbmVyIGluc3RhbmNlIChzaW1pbGFyIHRvIHRoZSByb290IHVzZXIpXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBwcml2aWxlZ2VkPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQGRlZmF1bHQgdGhlIGAvdG1wYCBkaXJlY3RvcnkgaXMgYWRkZWQgYXMgYW4gZXBoZW1lcmFsIG1vdW50LlxuICAgKi9cbiAgcmVhZG9ubHkgbW91bnRQb2ludHM/OiBNb3VudFBvaW50W107XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB0aGUgJy90bXAnIGRpcmVjdG9yeVxuICAgKi9cbiAgcmVhZG9ubHkgdm9sdW1lcz86IFZvbHVtZVtdO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIGVtaXQgbG9ncyBpbiBKU09OIGZvcm1hdCBvciBub3RcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IHN0cnVjdHVyZWRMb2dnaW5nPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogR2l2ZSB0aGUgY29udGFpbmVyIHJlYWQtd3JpdGUgYWNjZXNzIHRvIHRoZSByb290IGZpbGUgc3lzdGVtLiBQcmV2aW91c2x5IHdyaXRhYmxlRmlsZXN5c3RlbS5cbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXBib3gvZWNzLXdhdGNoYm90L2Jsb2IvbWFzdGVyL2RvY3MvYnVpbGRpbmctYS10ZW1wbGF0ZS5tZCN3cml0YWJsZWZpbGVzeXN0ZW0tbW9kZS1leHBsYWluZWRcbiAgICovXG4gIHJlYWRvbmx5IHJlYWRvbmx5Um9vdEZpbGVzeXN0ZW0/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBUaGUgbWF4aW11bSBkdXJhdGlvbiB0aGF0IGEgam9iIGlzIGFsbG93ZWQgdG8gcnVuLiBBZnRlciB0aGlzIHRpbWUgcGVyaW9kLCB0aGUgd29ya2VyIHdpbGwgYmUgc3RvcHBlZCBhbmQgdGhlIGpvYiB3aWxsIGJlIHJldHVybmVkIHRvIHRoZSBxdWV1ZS5cbiAgICogQGRlZmF1bHQgMFxuICAgKi9cbiAgcmVhZG9ubHkgbWF4Sm9iRHVyYXRpb24/OiBEdXJhdGlvbjtcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgdmFyaWFibGVzIHBhc3NlZCB0byB0aGUgY29udGFpbmVyIHJ1bm5pbmcgdGhlIHRhc2suIFRoaXMgd2lsbCBhbHdheXMgaW5jbHVkZSBRdWV1ZVVybCwgUVVFVUVfTkFNRSwgTG9nR3JvdXAgKEFSTiksIHdyaXRhYmxlRmlsZXN5c3RlbSwgbWF4Sm9iRHVyYXRpb24gKGluIHNlY29uZHMpLCBWb2x1bWVzIChjb21tYSBzZXBhcmF0ZWQgc3RyaW5nKSwgRmlmbyAoQVJOKSwgV29ya1RvcGljIChTTlMgdG9waWMgQVJOKSwgc3RydWN0dXJlZExvZ2dpbmcgKHRydWUgb3IgZmFsc2Ugc3RyaW5nKS5cbiAgICogWW91IGNhbiBvdmVycmlkZSBvciBhcHBlbmQgdG8gdGhlc2UgdmFyaWFibGVzLlxuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXG4gIC8qKlxuICAgKiBUaGUgc29mdCBsaW1pdCAoaW4gTWlCKSBvZiBtZW1vcnkgdG8gcmVzZXJ2ZSBmb3IgdGhlIGNvbnRhaW5lci4gUHJldmlvdXNseSByZXNlcnZhdGlvbi5zb2Z0TWVtb3J5XG4gICAqIEBkZWZhdWx0IE5vIG1lbW9yeSByZXNlcnZlZFxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucy5odG1sI21lbW9yeXJlc2VydmF0aW9ubWliXG4gICAqL1xuICByZWFkb25seSBtZW1vcnlSZXNlcnZhdGlvbk1pQj86IG51bWJlcjtcblxuICAvKipcbiAgICogV2hldGhlciB0byB1c2UgYSBGSUZPIHF1ZXVlIG9yIGEgc3RhbmRhcmQgcXVldWUgd2l0aCBTTlMgVG9waWNcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L2Vjcy13YXRjaGJvdC9ibG9iL21hc3Rlci9kb2NzL3VzaW5nLWEtZmlmby1xdWV1ZS5tZFxuICAgKi9cbiAgcmVhZG9ubHkgZmlmbz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFByZXZpb3VzbHkgbWF4U2l6ZVxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI21heHNjYWxpbmdjYXBhY2l0eVxuICAgKi9cbiAgcmVhZG9ubHkgbWF4U2NhbGluZ0NhcGFjaXR5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBQcmV2aW91c2x5IG1pblNpemVcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNtaW5zY2FsaW5nY2FwYWNpdHlcbiAgICovXG4gIHJlYWRvbmx5IG1pblNjYWxpbmdDYXBhY2l0eT86IG51bWJlcjtcblxuICByZWFkb25seSBhbGFybXM6IFdhdGNoYm90QWxhcm1zO1xuXG4gIC8qKlxuICAgKiBJZiB0aGlzIHByb3BlcnR5IGlzIHByZXNlbnQsIHdhdGNoYm90IHdpbGwgcnVuIGluIHJlZHVjZSBtb2RlLiBXYXRjaGJvdCB3aWxsIGJlIGNhcGFibGUgb2YgaGVscGluZyB0cmFjayB0aGUgcHJvZ3Jlc3Mgb2YgZGlzdHJpYnV0ZWQgbWFwLXJlZHVjZSBvcGVyYXRpb25zLlxuICAgKiBAZGVmYXVsdCBEb2VzIG5vdCBydW4gaW4gcmVkdWNlIG1vZGVcbiAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L2Vjcy13YXRjaGJvdC9ibG9iL21hc3Rlci9kb2NzL3JlZHVjZS1tb2RlLm1kXG4gICAqL1xuICByZWFkb25seSByZWR1Y2VNb2RlQ29uZmlndXJhdGlvbj86IHtcbiAgICAvKipcbiAgICAgKiBXaGV0aGVyIHRvIHJ1biBXYXRjaGJvdCBpbiByZWR1Y2UgbW9kZVxuICAgICAqL1xuICAgIGVuYWJsZWQ6IGJvb2xlYW47XG5cbiAgICAvKipcbiAgICAgKiBAZGVmYXVsdCAzMFxuICAgICAqL1xuICAgIHJlYWRDYXBhY2l0eVVuaXRzPzogbnVtYmVyO1xuICAgIC8qKlxuICAgICAqIEBkZWZhdWx0IDMwXG4gICAgICovXG4gICAgd3JpdGVDYXBhY2l0eVVuaXRzPzogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgdHlwZSBXYXRjaGJvdEFsYXJtcyA9IHtcbiAgLyoqXG4gICAqIFNOUyB0b3BpYyB0byBzZW5kIGFsYXJtIGFjdGlvbnMgdG8uIEluIG1vc3QgY2FzZXMsIHlvdSdsbCBuZWVkIHRvIGdldCB0aGUgdG9waWMgQVJOIHVzaW5nIG1hcGJveC1jZGstY29tbW9uIEFyblV0aWxpdHkuZ2V0T25jYWxsQXJuKCkgdGhlbiBpbXBvcnQgdGhhdCBpbiBDREsgdXNpbmcgYFRvcGljLmZyb21Ub3BpY0FybmAuXG4gICAqL1xuICBhY3Rpb246IElUb3BpYztcblxuICAvKipcbiAgICogQGRlZmF1bHQgeyB0aHJlc2hvbGQ6IDEwMCwgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDEpLCBldmFsdWF0aW9uUGVyaW9kczogMTAgfVxuICAgKi9cbiAgbWVtb3J5VXRpbGl6YXRpb24/OiBBbGFybVByb3BzO1xuICAvKipcbiAgICogQGRlZmF1bHQgeyB0aHJlc2hvbGQ6IDkwLCBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoMSksIGV2YWx1YXRpb25QZXJpb2RzOiAxMCB9XG4gICAqL1xuICBjcHVVdGlsaXphdGlvbj86IEFsYXJtUHJvcHM7XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7IHRocmVzaG9sZDogNDAsIHBlcmlvZDogRHVyYXRpb24ubWludXRlcyg1KSwgZXZhbHVhdGlvblBlcmlvZHM6IDI0IH1cbiAgICovXG4gIHF1ZXVlU2l6ZT86IEFsYXJtUHJvcHM7XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7IHRocmVzaG9sZDogMTAsIHBlcmlvZDogRHVyYXRpb24ubWludXRlcygxKSwgZXZhbHVhdGlvblBlcmlvZHM6IDEgfVxuICAgKi9cbiAgZGxxU2l6ZT86IEFsYXJtUHJvcHM7XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7IHRocmVzaG9sZDogMTAsIHBlcmlvZDogRHVyYXRpb24ubWludXRlcygxKSwgZXZhbHVhdGlvblBlcmlvZHM6IDEgfVxuICAgKi9cbiAgd29ya2Vyc0Vycm9ycz86IEFsYXJtUHJvcHM7XG59O1xuXG5leHBvcnQgdHlwZSBBbGFybVByb3BzID0ge1xuICB0aHJlc2hvbGQ/OiBudW1iZXI7XG4gIGV2YWx1YXRpb25QZXJpb2RzPzogbnVtYmVyO1xuICBwZXJpb2Q/OiBEdXJhdGlvbjtcbn07XG5cbmVudW0gU3VwcG9ydGVkUmVnaW9uIHtcbiAgVXNFYXN0MSA9ICd1cy1lYXN0LTEnLFxuICBVc0Vhc3QyID0gJ3VzLWVhc3QtMicsXG4gIEFwTm9ydGhlYXN0MSA9ICdhcC1ub3J0aGVhc3QtMSdcbn1cblxuY29uc3QgVlBDX0lEczogeyBba2V5IGluIFN1cHBvcnRlZFJlZ2lvbl06IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSA9IHtcbiAgW1N1cHBvcnRlZFJlZ2lvbi5Vc0Vhc3QxXToge1xuICAgIHByb2R1Y3Rpb246ICd2cGMtMDQ4ZjUyMTlhNDJmNDZmNmEnLFxuICAgIHN0YWdpbmc6ICd2cGMtMGRmNmEwYzdhZjE1NTlmOWYnXG4gIH0sXG4gIFtTdXBwb3J0ZWRSZWdpb24uVXNFYXN0Ml06IHtcbiAgICBwcm9kdWN0aW9uOiAndnBjLTBhOTc0MTViZWM1NWNkYjQ1JyxcbiAgICBzdGFnaW5nOiAndnBjLTA5NTNlMjU1MTU2MTQ4MTRkJ1xuICB9LFxuICBbU3VwcG9ydGVkUmVnaW9uLkFwTm9ydGhlYXN0MV06IHtcbiAgICBwcm9kdWN0aW9uOiAndnBjLTAxODQ4ZTAzNzE2Y2YwZmE2JyxcbiAgICBzdGFnaW5nOiAndnBjLTAyZDlkYzg3Y2IyZjNiYzFhJ1xuICB9XG59O1xuXG5jb25zdCBORVRXT1JLSU5HX1NUR19BQ0NPVU5UX0lEID0gJzU1MzU3MTQwODYwMic7XG5jb25zdCBORVRXT1JLSU5HX1BST0RfQUNDT1VOVF9JRCA9ICc5Mzk3MjM0NTYxNSc7XG5cbmV4cG9ydCBjbGFzcyBGYXJnYXRlV2F0Y2hib3QgZXh0ZW5kcyBSZXNvdXJjZSB7XG4gIHByb3RlY3RlZCByZWFkb25seSBwcm9wczogV2F0Y2hib3RQcm9wcztcbiAgcHVibGljIHNlcnZpY2U6IEJhc2VTZXJ2aWNlO1xuICBwdWJsaWMgdGFza0RlZmluaXRpb246IFRhc2tEZWZpbml0aW9uO1xuXG4gIHB1YmxpYyByZWFkb25seSBjbHVzdGVyPzogSUNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBsb2dHcm91cDogTG9nR3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSBxdWV1ZTogSVF1ZXVlO1xuICBwdWJsaWMgcmVhZG9ubHkgZGVhZExldHRlclF1ZXVlOiBJUXVldWU7XG4gIHB1YmxpYyByZWFkb25seSBtb25pdG9yaW5nOiBNb25pdG9yaW5nRmFjYWRlO1xuICBwdWJsaWMgcmVhZG9ubHkgcXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2U6IE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlO1xuICBwdWJsaWMgcmVhZG9ubHkgdG9waWM6IFRvcGljIHwgdW5kZWZpbmVkO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVyOiBDb250YWluZXJEZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xuICBwdWJsaWMgcmVhZG9ubHkgdGFibGU6IGF3c19keW5hbW9kYi5UYWJsZTtcblxuICBwcml2YXRlIHJlYWRvbmx5IFJVTkJPT0s6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBzY29wZTogQ29uc3RydWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXYXRjaGJvdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICB0aGlzLnNjb3BlID0gc2NvcGU7XG5cbiAgICBpZiAoIVsncHJvZHVjdGlvbicsICdzdGFnaW5nJ10uaW5jbHVkZXMocHJvcHMuZGVwbG95bWVudEVudmlyb25tZW50KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgZGVwbG95bWVudEVudmlyb25tZW50IG11c3QgYmUgb25lIG9mIFtzdGFnaW5nLCBwcm9kdWN0aW9uXSBidXQgcmVjZWl2ZWQgZGVwbG95bWVudEVudmlyb25tZW50PSR7cHJvcHMuZGVwbG95bWVudEVudmlyb25tZW50fWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpcy5SVU5CT09LID0gYGh0dHBzOi8vZ2l0aHViLmNvbS9tYXBib3gvZWNzLXdhdGNoYm90L2Jsb2IvJHtwa2cudmVyc2lvbn0vZG9jcy9hbGFybXMubWRgO1xuXG4gICAgdGhpcy5wcm9wcyA9IHRoaXMubWVyZ2VQcm9wc1dpdGhEZWZhdWx0cyhpZCwgcHJvcHMpO1xuXG4gICAgdGhpcy5sb2dHcm91cCA9IG5ldyBMb2dHcm91cCh0aGlzLCAnTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IHRoaXMucHJvcHMubG9nR3JvdXBOYW1lLFxuICAgICAgcmV0ZW50aW9uOiB0aGlzLnByb3BzLmxvZ0dyb3VwUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuICAgICh0aGlzLmxvZ0dyb3VwLm5vZGUuZGVmYXVsdENoaWxkIGFzIENmbkxvZ0dyb3VwKS5vdmVycmlkZUxvZ2ljYWxJZCh0aGlzLnByZWZpeGVkKCdMb2dHcm91cCcpKTtcblxuICAgIC8vIHdvcmthcm91bmQgZm9yIGEgYnVnIHdoZW4geW91IHNldCBmaWZvID0gZmFsc2VcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYXdzL2F3cy1jZGsvaXNzdWVzLzg1NTBcbiAgICBjb25zdCBhZGRpdGlvbmFsRmlmb1Byb3BlcnRpZXMgPSB0aGlzLnByb3BzLmZpZm8/IHsgZmlmbzogdHJ1ZSwgY29udGVudEJhc2VkRGVkdXBsaWNhdGlvbjogdHJ1ZSB9IDoge307XG5cbiAgICB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSA9IG5ldyBRdWV1ZSh0aGlzLCAnRGVhZExldHRlclF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByZWZpeGVkKCdEZWFkTGV0dGVyUXVldWUnKX0ke3RoaXMucHJvcHMuZmlmbyA/ICcuZmlmbycgOiAnJ31gLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiB0aGlzLnByb3BzLnJldGVudGlvblBlcmlvZCB8fCBEdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIC4uLmFkZGl0aW9uYWxGaWZvUHJvcGVydGllc1xuICAgIH0pO1xuXG4gICAgdGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZSh0aGlzLCAnUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMucHJlZml4ZWQoJ1F1ZXVlJyl9JHt0aGlzLnByb3BzLmZpZm8gPyAnLmZpZm8nIDogJyd9YCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogdGhpcy5wcm9wcy5yZXRlbnRpb25QZXJpb2QgfHwgRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxODApLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiB0aGlzLnByb3BzLmRlYWRMZXR0ZXJUaHJlc2hvbGQgfHwgMTBcbiAgICAgIH0sXG4gICAgICAuLi5hZGRpdGlvbmFsRmlmb1Byb3BlcnRpZXNcbiAgICB9KTtcblxuICAgIHRoaXMuY2x1c3RlciA9IHRoaXMucHJvcHMuY2x1c3RlcjtcblxuICAgIGNvbnN0IHF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHM6IE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHMgPSB7XG4gICAgICAvLyBTZXJ2aWNlIHByb3BzXG4gICAgICBzZXJ2aWNlTmFtZTogdGhpcy5wcm9wcy5zZXJ2aWNlTmFtZSxcblxuICAgICAgLy8gVGFzayBEZWZpbml0aW9uIHByb3BzXG4gICAgICBjcHU6IHRoaXMucHJvcHMuY3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHRoaXMucHJvcHMubWVtb3J5TGltaXRNaUIsXG4gICAgICBmYW1pbHk6IHRoaXMucHJvcHMuZmFtaWx5LFxuICAgICAgcnVudGltZVBsYXRmb3JtOiB0aGlzLnByb3BzLnJ1bnRpbWVQbGF0Zm9ybSxcbiAgICAgIHZvbHVtZXM6IHRoaXMucHJvcHMudm9sdW1lcyxcbiAgICAgIHByaXZpbGVnZWQ6IHRoaXMucHJvcHMucHJpdmlsZWdlZCxcbiAgICAgIHJlYWRvbmx5Um9vdEZpbGVzeXN0ZW06IHRoaXMucHJvcHMucmVhZG9ubHlSb290RmlsZXN5c3RlbSxcbiAgICAgIG1lbW9yeVJlc2VydmF0aW9uTWlCOiB0aGlzLnByb3BzLm1lbW9yeVJlc2VydmF0aW9uTWlCLFxuXG4gICAgICAvLyBDb250YWluZXIgcHJvcHNcbiAgICAgIGltYWdlOiB0aGlzLnByb3BzLmltYWdlLFxuICAgICAgY29udGFpbmVyTmFtZTogdGhpcy5wcm9wcy5jb250YWluZXJOYW1lLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUXVldWVVcmw6IHRoaXMucXVldWUucXVldWVVcmwsXG4gICAgICAgIExvZ0dyb3VwOiB0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuLFxuICAgICAgICB3cml0YWJsZUZpbGVzeXN0ZW06ICghdGhpcy5wcm9wcy5yZWFkb25seVJvb3RGaWxlc3lzdGVtKT8udG9TdHJpbmcoKSB8fCAnJyxcbiAgICAgICAgbWF4Sm9iRHVyYXRpb246IGAke3RoaXMucHJvcHMubWF4Sm9iRHVyYXRpb24/LnRvU2Vjb25kcygpIHx8IDB9YCxcbiAgICAgICAgVm9sdW1lczogKHRoaXMucHJvcHMubW91bnRQb2ludHMgfHwgW10pLm1hcCgobSkgPT4gbS5jb250YWluZXJQYXRoKS5qb2luKCcsJyksXG4gICAgICAgIEZpZm86ICh0aGlzLnByb3BzLmZpZm8gfHwgZmFsc2UpLnRvU3RyaW5nKCksXG4gICAgICAgIHN0cnVjdHVyZWRMb2dnaW5nOiAodGhpcy5wcm9wcy5zdHJ1Y3R1cmVkTG9nZ2luZyB8fCBmYWxzZSkudG9TdHJpbmcoKSxcbiAgICAgICAgLi4udGhpcy5wcm9wcy5lbnZpcm9ubWVudFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHRoaXMucHJvcHMuc2VjcmV0cyxcbiAgICAgIGNvbW1hbmQ6IFsnd2F0Y2hib3QnLCAnbGlzdGVuJywgLi4udGhpcy5wcm9wcy5jb21tYW5kXSxcbiAgICAgIGVuYWJsZUxvZ2dpbmc6IHRydWUsXG4gICAgICBsb2dEcml2ZXI6IExvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogdGhpcy5wcm9wcy5zZXJ2aWNlVmVyc2lvbixcbiAgICAgICAgbG9nR3JvdXA6IHRoaXMubG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgaGVhbHRoQ2hlY2s6IHRoaXMucHJvcHMuaGVhbHRoQ2hlY2ssXG5cbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuXG4gICAgICBjbHVzdGVyOiB0aGlzLmNsdXN0ZXIsXG4gICAgICBwcm9wYWdhdGVUYWdzOiBQcm9wYWdhdGVkVGFnU291cmNlLlRBU0tfREVGSU5JVElPTixcblxuICAgICAgLy8gc2NhbGluZyBwcm9wc1xuICAgICAgc2NhbGluZ1N0ZXBzOiB0aGlzLnByb3BzLnNjYWxpbmdTdGVwcyxcbiAgICAgIG1heFNjYWxpbmdDYXBhY2l0eTogdGhpcy5wcm9wcy5tYXhTY2FsaW5nQ2FwYWNpdHksXG4gICAgICBtaW5TY2FsaW5nQ2FwYWNpdHk6IHRoaXMucHJvcHMubWluU2NhbGluZ0NhcGFjaXR5LFxuXG4gICAgICAvLyBuZXR3b3JrIGNvbmZpZyBwcm9wc1xuICAgICAgdGFza1N1Ym5ldHM6IHRoaXMucHJvcHMuc3VibmV0cyxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiB0aGlzLnByb3BzLnB1YmxpY0lQLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IHRoaXMucHJvcHMuc2VjdXJpdHlHcm91cHNcbiAgICB9O1xuICAgIHRoaXMucXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UgPSBuZXcgTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UoXG4gICAgICB0aGlzLFxuICAgICAgJ1NlcnZpY2UnLFxuICAgICAgcXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2VQcm9wc1xuICAgICk7XG4gICAgdGhpcy5zZXJ2aWNlID0gdGhpcy5xdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5zZXJ2aWNlO1xuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSB0aGlzLnF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLnRhc2tEZWZpbml0aW9uO1xuXG4gICAgdGhpcy5jb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmZpbmRDb250YWluZXIodGhpcy5wcm9wcy5jb250YWluZXJOYW1lIHx8ICcnKTtcbiAgICBpZiAodGhpcy5jb250YWluZXIpIHtcbiAgICAgIHRoaXMuY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKC4uLih0aGlzLnByb3BzLm1vdW50UG9pbnRzIHx8IFtdKSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRVbGltaXRzKHtcbiAgICAgICAgbmFtZTogVWxpbWl0TmFtZS5OT0ZJTEUsXG4gICAgICAgIHNvZnRMaW1pdDogMTAyNDAsXG4gICAgICAgIGhhcmRMaW1pdDogMTAyNDBcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGNvbnRhaW5lciB3aXRoIGNvbnRhaW5lck5hbWU9JHt0aGlzLnByb3BzLmNvbnRhaW5lck5hbWV9YCk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnByb3BzLmZpZm8pIHtcbiAgICAgIHRoaXMudG9waWMgPSBuZXcgVG9waWModGhpcywgJ1RvcGljJywge1xuICAgICAgICB0b3BpY05hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMucHJvcHMucHJlZml4fVRvcGljYFxuICAgICAgfSk7XG4gICAgICB0aGlzLnRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgU3FzU3Vic2NyaXB0aW9uKHRoaXMucXVldWUpKTtcbiAgICAgIHRoaXMucXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoXG4gICAgICAgIG5ldyBQcmluY2lwYWxXaXRoQ29uZGl0aW9ucyhuZXcgQW55UHJpbmNpcGFsKCksIHtcbiAgICAgICAgICBBcm5FcXVhbHM6IHtcbiAgICAgICAgICAgICdhd3M6U291cmNlQXJuJzogdGhpcy50b3BpYy50b3BpY0FyblxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICB0aGlzLnRvcGljLmdyYW50UHVibGlzaCh0aGlzLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlKTtcbiAgICAgIHRoaXMuY29udGFpbmVyLmFkZEVudmlyb25tZW50KCdXb3JrVG9waWMnLCB0aGlzLnRvcGljLnRvcGljQXJuKTtcbiAgICB9XG5cbiAgICB0aGlzLm1vbml0b3JpbmcgPSB0aGlzLmNyZWF0ZUFsYXJtcygpO1xuXG4gICAgaWYgKHRoaXMucHJvcHMucmVkdWNlTW9kZUNvbmZpZ3VyYXRpb24/LmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gbmV3IGF3c19keW5hbW9kYi5UYWJsZSh0aGlzLCAnUHJvZ3Jlc3NUYWJsZScsIHtcbiAgICAgICAgdGFibGVOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByZWZpeGVkKCctcHJvZ3Jlc3MnKX1gLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHJlYWRDYXBhY2l0eTogdGhpcy5wcm9wcy5yZWR1Y2VNb2RlQ29uZmlndXJhdGlvbi5yZWFkQ2FwYWNpdHlVbml0cyB8fCAzMCxcbiAgICAgICAgd3JpdGVDYXBhY2l0eTogdGhpcy5wcm9wcy5yZWR1Y2VNb2RlQ29uZmlndXJhdGlvbi53cml0ZUNhcGFjaXR5VW5pdHMgfHwgMzAsXG4gICAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICAgIG5hbWU6ICdpZCcsXG4gICAgICAgICAgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkdcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAodGFibGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgQ2ZuVGFibGUpLm92ZXJyaWRlTG9naWNhbElkKCdQcm9ncmVzc1RhYmxlJyk7XG4gICAgICB0aGlzLnRhYmxlID0gdGFibGU7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRFbnZpcm9ubWVudCgnUHJvZ3Jlc3NUYWJsZScsIHRoaXMudGFibGUudGFibGVBcm4pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQWxhcm1zKCkge1xuICAgIGNvbnN0IG1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZ0ZhY2FkZSh0aGlzLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGFsYXJtRmFjdG9yeURlZmF1bHRzOiB7XG4gICAgICAgIGFsYXJtTmFtZVByZWZpeDogdGhpcy5wcmVmaXhlZCgnJyksXG4gICAgICAgIGFjdGlvbnNFbmFibGVkOiB0cnVlLFxuICAgICAgICBhY3Rpb246IG5ldyBTbnNBbGFybUFjdGlvblN0cmF0ZWd5KHtcbiAgICAgICAgICBvbkFsYXJtVG9waWM6IHRoaXMucHJvcHMuYWxhcm1zLmFjdGlvblxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgd29ya2Vyc0Vycm9yc01ldHJpYyA9IHRoaXMubG9nR3JvdXBcbiAgICAgIC5hZGRNZXRyaWNGaWx0ZXIodGhpcy5wcmVmaXhlZCgnV29ya2VyRXJyb3JzTWV0cmljJyksIHtcbiAgICAgICAgbWV0cmljTmFtZTogYCR7dGhpcy5wcmVmaXhlZCgnV29ya2VyRXJyb3JzJyl9LSR7dGhpcy5zdGFjay5zdGFja05hbWV9YCxcbiAgICAgICAgbWV0cmljTmFtZXNwYWNlOiAnTWFwYm94L2Vjcy13YXRjaGJvdCcsXG4gICAgICAgIG1ldHJpY1ZhbHVlOiAnMScsXG4gICAgICAgIGZpbHRlclBhdHRlcm46IEZpbHRlclBhdHRlcm4uYW55VGVybSgnXCJbZmFpbHVyZV1cIicpXG4gICAgICB9KVxuICAgICAgLm1ldHJpYyh7XG4gICAgICAgIHN0YXRpc3RpYzogU3RhdHMuU1VNXG4gICAgICB9KTtcblxuICAgIG1vbml0b3JpbmdcbiAgICAgIC5hZGRMYXJnZUhlYWRlcih0aGlzLnByZWZpeGVkKHRoaXMuc3RhY2suc3RhY2tOYW1lKSlcbiAgICAgIC5tb25pdG9yUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2Uoe1xuICAgICAgICBmYXJnYXRlU2VydmljZTogdGhpcy5xdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZSxcbiAgICAgICAgYWRkU2VydmljZUFsYXJtczoge1xuICAgICAgICAgIGFkZE1lbW9yeVVzYWdlQWxhcm06IHtcbiAgICAgICAgICAgIG1lbW9yeVVzYWdlOiB7XG4gICAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I21lbW9yeXV0aWxpemF0aW9uYCxcbiAgICAgICAgICAgICAgbWF4VXNhZ2VQZXJjZW50OiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8udGhyZXNob2xkIHx8IDEwMCxcbiAgICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8ucGVyaW9kIHx8IER1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5tZW1vcnlVdGlsaXphdGlvbj8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMTBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFkZENwdVVzYWdlQWxhcm06IHtcbiAgICAgICAgICAgIGNwdToge1xuICAgICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSNDcHVVdGlsaXphdGlvbmAsXG4gICAgICAgICAgICAgIG1heFVzYWdlUGVyY2VudDogdGhpcy5wcm9wcy5hbGFybXMuY3B1VXRpbGl6YXRpb24/LnRocmVzaG9sZCB8fCA5MCxcbiAgICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5jcHVVdGlsaXphdGlvbj8ucGVyaW9kIHx8IER1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5jcHVVdGlsaXphdGlvbj8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMTBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAubW9uaXRvclNxc1F1ZXVlV2l0aERscSh7XG4gICAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgICBkZWFkTGV0dGVyUXVldWU6IHRoaXMuZGVhZExldHRlclF1ZXVlLFxuICAgICAgICBhZGRRdWV1ZU1heFNpemVBbGFybToge1xuICAgICAgICAgIG1heFNpemU6IHtcbiAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I1F1ZXVlU2l6ZWAsXG4gICAgICAgICAgICBtYXhNZXNzYWdlQ291bnQ6IHRoaXMucHJvcHMuYWxhcm1zLnF1ZXVlU2l6ZT8udGhyZXNob2xkIHx8IDQwLFxuICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5xdWV1ZVNpemU/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLnF1ZXVlU2l6ZT8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMjRcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFkZERlYWRMZXR0ZXJRdWV1ZU1heFNpemVBbGFybToge1xuICAgICAgICAgIG1heFNpemU6IHtcbiAgICAgICAgICAgIHJ1bmJvb2tMaW5rOiBgJHt0aGlzLlJVTkJPT0t9I0RlYWRMZXR0ZXJRdWV1ZVNpemVgLFxuICAgICAgICAgICAgbWF4TWVzc2FnZUNvdW50OiB0aGlzLnByb3BzLmFsYXJtcy5kbHFTaXplPy50aHJlc2hvbGQgfHwgMTAsXG4gICAgICAgICAgICBwZXJpb2Q6IHRoaXMucHJvcHMuYWxhcm1zLmRscVNpemU/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLmRscVNpemU/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEsXG4gICAgICAgICAgICBkYXRhcG9pbnRzVG9BbGFybTogdGhpcy5wcm9wcy5hbGFybXMuZGxxU2l6ZT8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMSAvLyBtYXRjaCBldmFsdWF0aW9uUGVyaW9kc1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5tb25pdG9yQ3VzdG9tKHtcbiAgICAgICAgYWRkVG9BbGFybURhc2hib2FyZDogdHJ1ZSxcbiAgICAgICAgYWxhcm1GcmllbmRseU5hbWU6IGB3b3JrZXItZXJyb3JzLSR7dGhpcy5zdGFjay5yZWdpb259YCxcbiAgICAgICAgbWV0cmljR3JvdXBzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGl0bGU6ICdXb3JrZXIgRXJyb3JzJyxcbiAgICAgICAgICAgIG1ldHJpY3M6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGFsYXJtRnJpZW5kbHlOYW1lOiBgd29ya2VyLWVycm9ycy0ke3RoaXMuc3RhY2sucmVnaW9ufWAsXG4gICAgICAgICAgICAgICAgbWV0cmljOiB3b3JrZXJzRXJyb3JzTWV0cmljLFxuICAgICAgICAgICAgICAgIGFkZEFsYXJtOiB7XG4gICAgICAgICAgICAgICAgICBlcnJvcjoge1xuICAgICAgICAgICAgICAgICAgICB0aHJlc2hvbGQ6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LnRocmVzaG9sZCB8fCAxMCxcbiAgICAgICAgICAgICAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEsXG4gICAgICAgICAgICAgICAgICAgIGRhdGFwb2ludHNUb0FsYXJtOiB0aGlzLnByb3BzLmFsYXJtcy53b3JrZXJzRXJyb3JzPy5ldmFsdWF0aW9uUGVyaW9kcyB8fCAxLCAvLyBtYXRjaCBldmFsdWF0aW9uUGVyaW9kc1xuICAgICAgICAgICAgICAgICAgICBwZXJpb2Q6IHRoaXMucHJvcHMuYWxhcm1zLndvcmtlcnNFcnJvcnM/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6IENvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgICAgICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSN3b3JrZXJlcnJvcnNgXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9KTtcbiAgICByZXR1cm4gbW9uaXRvcmluZztcbiAgfVxuXG4gIHByaXZhdGUgcHJlZml4ZWQgPSAobmFtZTogc3RyaW5nKSA9PiBgJHt0aGlzLnByb3BzLnByZWZpeH0ke25hbWV9YDtcblxuICBwcml2YXRlIG1lcmdlUHJvcHNXaXRoRGVmYXVsdHMoaWQ6IHN0cmluZywgcHJvcHM6IFdhdGNoYm90UHJvcHMpOiBXYXRjaGJvdFByb3BzIHtcbiAgICBjb25zdCB7IHJlZ2lvbiB9ID0gU3RhY2sub2YodGhpcy5zY29wZSk7XG5cbiAgICBjb25zdCBwcmVmaXggPSBwcm9wcy5wcmVmaXggPz8gJ1dhdGNoYm90JztcbiAgICBjb25zdCBERUZBVUxUX1BST1BTOiBQYXJ0aWFsPFdhdGNoYm90UHJvcHM+ID0ge1xuICAgICAgcHJlZml4LFxuICAgICAgY29udGFpbmVyTmFtZTogYCR7cHJlZml4fS0ke3RoaXMuc3RhY2suc3RhY2tOYW1lfWAsXG4gICAgICBzdHJ1Y3R1cmVkTG9nZ2luZzogZmFsc2UsXG4gICAgICByZWFkb25seVJvb3RGaWxlc3lzdGVtOiB0cnVlLFxuICAgICAgbWF4Sm9iRHVyYXRpb246IER1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICBmYW1pbHk6IHByb3BzLnNlcnZpY2VOYW1lLFxuICAgICAgY2x1c3RlcjogQ2x1c3Rlci5mcm9tQ2x1c3RlckF0dHJpYnV0ZXModGhpcywgYCR7aWR9Q2x1c3RlcmAsIHtcbiAgICAgICAgY2x1c3Rlck5hbWU6IGBmYXJnYXRlLXByb2Nlc3NpbmctJHtwcm9wcy5kZXBsb3ltZW50RW52aXJvbm1lbnR9YCxcbiAgICAgICAgdnBjOiBWcGMuZnJvbUxvb2t1cCh0aGlzLCBgJHtpZH1WUENgLCB7XG4gICAgICAgICAgdnBjSWQ6IFZQQ19JRHNbcmVnaW9uIGFzIFN1cHBvcnRlZFJlZ2lvbl1bcHJvcHMuZGVwbG95bWVudEVudmlyb25tZW50XSxcbiAgICAgICAgICBpc0RlZmF1bHQ6IGZhbHNlLFxuICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICBvd25lckFjY291bnRJZDpcbiAgICAgICAgICAgIHByb3BzLmRlcGxveW1lbnRFbnZpcm9ubWVudCA9PT0gJ3N0YWdpbmcnXG4gICAgICAgICAgICAgID8gTkVUV09SS0lOR19TVEdfQUNDT1VOVF9JRFxuICAgICAgICAgICAgICA6IE5FVFdPUktJTkdfUFJPRF9BQ0NPVU5UX0lEXG4gICAgICAgIH0pXG4gICAgICB9KSxcblxuICAgICAgcHVibGljSVA6IGZhbHNlLFxuICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgICBsb2dHcm91cE5hbWU6IGAke3RoaXMuc3RhY2suc3RhY2tOYW1lfS0ke3RoaXMuc3RhY2sucmVnaW9ufS0ke3ByZWZpeC50b0xvd2VyQ2FzZSgpfWAsXG4gICAgICBsb2dHcm91cFJldGVudGlvbkRheXM6IFJldGVudGlvbkRheXMuVFdPX1dFRUtTLFxuICAgICAgbW91bnRQb2ludHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvdG1wJyxcbiAgICAgICAgICBzb3VyY2VWb2x1bWU6ICd0bXAnLFxuICAgICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICB2b2x1bWVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAndG1wJ1xuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgZmlmbzogZmFsc2UsXG4gICAgICBkZWFkTGV0dGVyVGhyZXNob2xkOiAxMCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICByZWR1Y2VNb2RlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgd3JpdGVDYXBhY2l0eVVuaXRzOiAzMCxcbiAgICAgICAgcmVhZENhcGFjaXR5VW5pdHM6IDMwXG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAuLi5ERUZBVUxUX1BST1BTLFxuICAgICAgLi4ucHJvcHNcbiAgICB9O1xuICB9XG59XG4iXX0=
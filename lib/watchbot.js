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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hib3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaGJvdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2Q0FBcUY7QUFDckYsaURBQTJFO0FBQzNFLGlEQWU2QjtBQUM3QixpREFBNEU7QUFDNUUsbURBQTJGO0FBQzNGLGlEQUFvRDtBQUNwRCw2RUFBb0U7QUFDcEUsaURBQW9EO0FBR3BELCtGQUcrQztBQUMvQyx5RUFBcUY7QUFDckYsNkJBQTZCO0FBQzdCLCtEQUF1RTtBQUN2RSwyREFBbUU7QUFFbkUsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBd09uRSxJQUFLLGVBSUo7QUFKRCxXQUFLLGVBQWU7SUFDbEIsd0NBQXFCLENBQUE7SUFDckIsd0NBQXFCLENBQUE7SUFDckIsa0RBQStCLENBQUE7QUFDakMsQ0FBQyxFQUpJLGVBQWUsS0FBZixlQUFlLFFBSW5CO0FBRUQsTUFBTSxPQUFPLEdBQXlEO0lBQ3BFLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3pCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztJQUNELENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxFQUFFO1FBQzlCLFVBQVUsRUFBRSx1QkFBdUI7UUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtLQUNqQztDQUNGLENBQUM7QUFFRixNQUFNLHlCQUF5QixHQUFHLGNBQWMsQ0FBQztBQUNqRCxNQUFNLDBCQUEwQixHQUFHLGFBQWEsQ0FBQztBQUVqRCxNQUFhLGVBQWdCLFNBQVEsc0JBQVE7SUFrQjNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVB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T0FBTyxFQUFFLEtBQUs7Z0JBQ2Qsa0JBQWtCLEVBQUUsRUFBRTtnQkFDdEIsaUJBQWlCLEVBQUUsRUFBRTthQUN0QjtTQUNGLENBQUM7UUFFRixPQUFPO1lBQ0wsR0FBRyxhQUFhO1lBQ2hCLEdBQUcsS0FBSztTQUNULENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE5VEQsMENBOFRDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYXdzX2R5bmFtb2RiLCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSwgUmVzb3VyY2UsIFN0YWNrIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgSVNlY3VyaXR5R3JvdXAsIFN1Ym5ldFNlbGVjdGlvbiwgVnBjIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQge1xuICBCYXNlU2VydmljZSxcbiAgQ2x1c3RlcixcbiAgQ29udGFpbmVyRGVmaW5pdGlvbixcbiAgQ29udGFpbmVySW1hZ2UsXG4gIEhlYWx0aENoZWNrLFxuICBJQ2x1c3RlcixcbiAgTG9nRHJpdmVycyxcbiAgTW91bnRQb2ludCxcbiAgUHJvcGFnYXRlZFRhZ1NvdXJjZSxcbiAgUnVudGltZVBsYXRmb3JtLFxuICBTZWNyZXQsXG4gIFRhc2tEZWZpbml0aW9uLFxuICBVbGltaXROYW1lLFxuICBWb2x1bWVcbn0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgeyBBbnlQcmluY2lwYWwsIFByaW5jaXBhbFdpdGhDb25kaXRpb25zIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBDZm5Mb2dHcm91cCwgRmlsdGVyUGF0dGVybiwgTG9nR3JvdXAsIFJldGVudGlvbkRheXMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBJVG9waWMsIFRvcGljIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgeyBTcXNTdWJzY3JpcHRpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0IHsgSVF1ZXVlLCBRdWV1ZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTY2FsaW5nSW50ZXJ2YWwgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XG5pbXBvcnQge1xuICBNYXBib3hRdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZSxcbiAgTWFwYm94UXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2VQcm9wc1xufSBmcm9tICcuL01hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlJztcbmltcG9ydCB7IE1vbml0b3JpbmdGYWNhZGUsIFNuc0FsYXJtQWN0aW9uU3RyYXRlZ3kgfSBmcm9tICdjZGstbW9uaXRvcmluZy1jb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBDb21wYXJpc29uT3BlcmF0b3IsIFN0YXRzIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0IHsgQXR0cmlidXRlVHlwZSwgQ2ZuVGFibGUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuXG5jb25zdCBwa2cgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICdwYWNrYWdlLmpzb24nKSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F0Y2hib3RQcm9wcyB7XG4gIC8qKlxuICAgKiBAZGVmYXVsdCB7cHJlZml4fS0ke3N0YWNrTmFtZX1cbiAgICovXG4gIHJlYWRvbmx5IGNvbnRhaW5lck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBpbnRlcnZhbHMgZm9yIHNjYWxpbmcgYmFzZWQgb24gdGhlIFNRUyBxdWV1ZSdzIEFwcHJveGltYXRlTnVtYmVyT2ZNZXNzYWdlc1Zpc2libGUgbWV0cmljLlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI3NjYWxpbmdzdGVwc1xuICAgKi9cbiAgcmVhZG9ubHkgc2NhbGluZ1N0ZXBzPzogU2NhbGluZ0ludGVydmFsW107XG5cbiAgLyoqXG4gICAqIFRoZSBydW50aW1lIHBsYXRmb3JtIG9mIHRoZSB0YXNrIGRlZmluaXRpb24uXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjcnVudGltZXBsYXRmb3JtXG4gICAqL1xuICByZWFkb25seSBydW50aW1lUGxhdGZvcm0/OiBSdW50aW1lUGxhdGZvcm07XG5cbiAgLyoqXG4gICAqIFRoZSBzZWNyZXQgdG8gZXhwb3NlIHRvIHRoZSBjb250YWluZXIgYXMgYW4gZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjc2VjcmV0c1xuICAgKi9cbiAgcmVhZG9ubHkgc2VjcmV0cz86IFJlY29yZDxzdHJpbmcsIFNlY3JldD47XG5cbiAgLyoqXG4gICAqIFRoZSBoZWFsdGggY2hlY2sgY29tbWFuZCBhbmQgYXNzb2NpYXRlZCBjb25maWd1cmF0aW9uIHBhcmFtZXRlcnMgZm9yIHRoZSBjb250YWluZXIuXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjaGVhbHRoY2hlY2tcbiAgICovXG4gIHJlYWRvbmx5IGhlYWx0aENoZWNrPzogSGVhbHRoQ2hlY2s7XG5cbiAgLyoqXG4gICAqIFByZXZpb3VzbHkgcmVzZXJ2YXRpb24ubWVtb3J5XG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjbWVtb3J5bGltaXRtaWJcbiAgICovXG4gIHJlYWRvbmx5IG1lbW9yeUxpbWl0TWlCPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBQcmV2aW91c2x5IHJlc2VydmF0aW9uLmNwdVxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2Vjc19wYXR0ZXJucy5RdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS5odG1sI2NwdVxuICAgKi9cbiAgcmVhZG9ubHkgY3B1PzogbnVtYmVyO1xuXG4gIHJlYWRvbmx5IHN1Ym5ldHM/OiBTdWJuZXRTZWxlY3Rpb247XG4gIC8qKlxuICAgKiBXaGV0aGVyIHRoZSB0YXNrcycgZWxhc3RpYyBuZXR3b3JrIGludGVyZmFjZSByZWNlaXZlcyBhIHB1YmxpYyBJUCBhZGRyZXNzLiBTaG91bGQgYmUgYHRydWVgIGlmIGBzdWJuZXRzYCBhcmUgcHVibGljLlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9BV1NDbG91ZEZvcm1hdGlvbi9sYXRlc3QvVXNlckd1aWRlL2F3cy1wcm9wZXJ0aWVzLWVjcy1zZXJ2aWNlLWF3c3ZwY2NvbmZpZ3VyYXRpb24uaHRtbFxuICAgKi9cbiAgcmVhZG9ubHkgcHVibGljSVA/OiBib29sZWFuO1xuXG4gIHJlYWRvbmx5IHNlY3VyaXR5R3JvdXBzPzogSVNlY3VyaXR5R3JvdXBbXTtcblxuICByZWFkb25seSBpbWFnZTogQ29udGFpbmVySW1hZ2U7XG4gIHJlYWRvbmx5IGNsdXN0ZXI/OiBJQ2x1c3RlcjtcblxuICAvKipcbiAgICogVGhlIG5hbWUgb2YgdGhlIHNlcnZpY2UuXG4gICAqL1xuICByZWFkb25seSBzZXJ2aWNlTmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgY29tbWFuZCB0aGF0IGlzIHBhc3NlZCB0byB0aGUgY29udGFpbmVyLiBUaGlzIHdpbGwgYmUgYXBwZW5kZWQgdG8gJ3dhdGNoYm90IGxpc3RlbicgY29tbWFuZC5cbiAgICovXG4gIHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZ1tdO1xuXG4gIHJlYWRvbmx5IGRlcGxveW1lbnRFbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgdmVyc2lvbiBvZiB5b3VyIGltYWdlIHRvIGRlcGxveS4gVGhpcyBzaG91bGQgcmVmZXJlbmNlIGEgc3BlY2lmaWMgaW1hZ2UgaW4gRUNSLlxuICAgKi9cbiAgcmVhZG9ubHkgc2VydmljZVZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIG5hbWUgb2YgYSBmYW1pbHkgdGhhdCB0aGUgdGFzayBkZWZpbml0aW9uIGlzIHJlZ2lzdGVyZWQgdG8uXG4gICAqIEBkZWZhdWx0IHVzZXMgc2VydmljZU5hbWVcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNmYW1pbHlcbiAgICovXG4gIHJlYWRvbmx5IGZhbWlseT86IHN0cmluZztcblxuICAvKipcbiAgICogUHJlZml4IHRvIGJlIGFkZGVkIHRvIHNvbWUgcmVzb3VyY2UgbmFtZXNcbiAgICogQGRlZmF1bHQgV2F0Y2hib3RcbiAgICovXG4gIHJlYWRvbmx5IHByZWZpeD86IHN0cmluZztcblxuICAvKipcbiAgICogQGRlZmF1bHQge3N0YWNrTmFtZX0te3JlZ2lvbn0te3ByZWZpeH1cbiAgICovXG4gIHJlYWRvbmx5IGxvZ0dyb3VwTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogQGRlZmF1bHQgUmV0ZW50aW9uRGF5cy5UV09fV0VFS1NcbiAgICovXG4gIHJlYWRvbmx5IGxvZ0dyb3VwUmV0ZW50aW9uRGF5cz86IFJldGVudGlvbkRheXM7XG5cbiAgLyoqXG4gICAqIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gcmV0cnkgYSBtZXNzYWdlIGJlZm9yZSBzZW5kaW5nIGl0IHRvIHRoZSBkZWFkLWxldHRlciBxdWV1ZVxuICAgKiBAZGVmYXVsdCAxMFxuICAgKi9cbiAgcmVhZG9ubHkgZGVhZExldHRlclRocmVzaG9sZD86IG51bWJlcjtcblxuICAvKipcbiAgICogVGhlIG51bWJlciBvZiBzZWNvbmRzIHRoYXQgQW1hem9uIFNRUyByZXRhaW5zIGEgbWVzc2FnZVxuICAgKiBAZGVmYXVsdCBEdXJhdGlvbi5kYXlzKDE0KVxuICAgKi9cbiAgcmVhZG9ubHkgcmV0ZW50aW9uUGVyaW9kPzogRHVyYXRpb247XG5cbiAgLyoqXG4gICAqIFNwZWNpZmllcyB3aGV0aGVyIHRoZSBjb250YWluZXIgaXMgbWFya2VkIGFzIHByaXZpbGVnZWQuIFdoZW4gdGhpcyBwYXJhbWV0ZXIgaXMgdHJ1ZSwgdGhlIGNvbnRhaW5lciBpcyBnaXZlbiBlbGV2YXRlZCBwcml2aWxlZ2VzIG9uIHRoZSBob3N0IGNvbnRhaW5lciBpbnN0YW5jZSAoc2ltaWxhciB0byB0aGUgcm9vdCB1c2VyKVxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgcHJpdmlsZWdlZD86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IHRoZSBgL3RtcGAgZGlyZWN0b3J5IGlzIGFkZGVkIGFzIGFuIGVwaGVtZXJhbCBtb3VudC5cbiAgICovXG4gIHJlYWRvbmx5IG1vdW50UG9pbnRzPzogTW91bnRQb2ludFtdO1xuICAvKipcbiAgICogQGRlZmF1bHQgdGhlICcvdG1wJyBkaXJlY3RvcnlcbiAgICovXG4gIHJlYWRvbmx5IHZvbHVtZXM/OiBWb2x1bWVbXTtcblxuICAvKipcbiAgICogV2hldGhlciB0byBlbWl0IGxvZ3MgaW4gSlNPTiBmb3JtYXQgb3Igbm90XG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBzdHJ1Y3R1cmVkTG9nZ2luZz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEdpdmUgdGhlIGNvbnRhaW5lciByZWFkLXdyaXRlIGFjY2VzcyB0byB0aGUgcm9vdCBmaWxlIHN5c3RlbS4gUHJldmlvdXNseSB3cml0YWJsZUZpbGVzeXN0ZW0uXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L2Vjcy13YXRjaGJvdC9ibG9iL21hc3Rlci9kb2NzL2J1aWxkaW5nLWEtdGVtcGxhdGUubWQjd3JpdGFibGVmaWxlc3lzdGVtLW1vZGUtZXhwbGFpbmVkXG4gICAqL1xuICByZWFkb25seSByZWFkb25seVJvb3RGaWxlc3lzdGVtPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogVGhlIG1heGltdW0gZHVyYXRpb24gdGhhdCBhIGpvYiBpcyBhbGxvd2VkIHRvIHJ1bi4gQWZ0ZXIgdGhpcyB0aW1lIHBlcmlvZCwgdGhlIHdvcmtlciB3aWxsIGJlIHN0b3BwZWQgYW5kIHRoZSBqb2Igd2lsbCBiZSByZXR1cm5lZCB0byB0aGUgcXVldWUuXG4gICAqIEBkZWZhdWx0IDBcbiAgICovXG4gIHJlYWRvbmx5IG1heEpvYkR1cmF0aW9uPzogRHVyYXRpb247XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHZhcmlhYmxlcyBwYXNzZWQgdG8gdGhlIGNvbnRhaW5lciBydW5uaW5nIHRoZSB0YXNrLiBUaGlzIHdpbGwgYWx3YXlzIGluY2x1ZGUgUXVldWVVcmwsIFFVRVVFX05BTUUsIExvZ0dyb3VwIChBUk4pLCB3cml0YWJsZUZpbGVzeXN0ZW0sIG1heEpvYkR1cmF0aW9uIChpbiBzZWNvbmRzKSwgVm9sdW1lcyAoY29tbWEgc2VwYXJhdGVkIHN0cmluZyksIEZpZm8gKEFSTiksIFdvcmtUb3BpYyAoU05TIHRvcGljIEFSTiksIHN0cnVjdHVyZWRMb2dnaW5nICh0cnVlIG9yIGZhbHNlIHN0cmluZykuXG4gICAqIFlvdSBjYW4gb3ZlcnJpZGUgb3IgYXBwZW5kIHRvIHRoZXNlIHZhcmlhYmxlcy5cbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50PzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcblxuICAvKipcbiAgICogVGhlIHNvZnQgbGltaXQgKGluIE1pQikgb2YgbWVtb3J5IHRvIHJlc2VydmUgZm9yIHRoZSBjb250YWluZXIuIFByZXZpb3VzbHkgcmVzZXJ2YXRpb24uc29mdE1lbW9yeVxuICAgKiBAZGVmYXVsdCBObyBtZW1vcnkgcmVzZXJ2ZWRcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3MuQ29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMuaHRtbCNtZW1vcnlyZXNlcnZhdGlvbm1pYlxuICAgKi9cbiAgcmVhZG9ubHkgbWVtb3J5UmVzZXJ2YXRpb25NaUI/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gdXNlIGEgRklGTyBxdWV1ZSBvciBhIHN0YW5kYXJkIHF1ZXVlIHdpdGggU05TIFRvcGljXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21hcGJveC9lY3Mtd2F0Y2hib3QvYmxvYi9tYXN0ZXIvZG9jcy91c2luZy1hLWZpZm8tcXVldWUubWRcbiAgICovXG4gIHJlYWRvbmx5IGZpZm8/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBQcmV2aW91c2x5IG1heFNpemVcbiAgICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19lY3NfcGF0dGVybnMuUXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UuaHRtbCNtYXhzY2FsaW5nY2FwYWNpdHlcbiAgICovXG4gIHJlYWRvbmx5IG1heFNjYWxpbmdDYXBhY2l0eT86IG51bWJlcjtcblxuICAvKipcbiAgICogUHJldmlvdXNseSBtaW5TaXplXG4gICAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZWNzX3BhdHRlcm5zLlF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlLmh0bWwjbWluc2NhbGluZ2NhcGFjaXR5XG4gICAqL1xuICByZWFkb25seSBtaW5TY2FsaW5nQ2FwYWNpdHk/OiBudW1iZXI7XG5cbiAgcmVhZG9ubHkgYWxhcm1zOiBXYXRjaGJvdEFsYXJtcztcblxuICAvKipcbiAgICogSWYgdGhpcyBwcm9wZXJ0eSBpcyBwcmVzZW50LCB3YXRjaGJvdCB3aWxsIHJ1biBpbiByZWR1Y2UgbW9kZS4gV2F0Y2hib3Qgd2lsbCBiZSBjYXBhYmxlIG9mIGhlbHBpbmcgdHJhY2sgdGhlIHByb2dyZXNzIG9mIGRpc3RyaWJ1dGVkIG1hcC1yZWR1Y2Ugb3BlcmF0aW9ucy5cbiAgICogQGRlZmF1bHQgRG9lcyBub3QgcnVuIGluIHJlZHVjZSBtb2RlXG4gICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21hcGJveC9lY3Mtd2F0Y2hib3QvYmxvYi9tYXN0ZXIvZG9jcy9yZWR1Y2UtbW9kZS5tZFxuICAgKi9cbiAgcmVhZG9ubHkgcmVkdWNlTW9kZUNvbmZpZ3VyYXRpb24/OiB7XG4gICAgLyoqXG4gICAgICogV2hldGhlciB0byBydW4gV2F0Y2hib3QgaW4gcmVkdWNlIG1vZGVcbiAgICAgKi9cbiAgICBlbmFibGVkOiBib29sZWFuO1xuXG4gICAgLyoqXG4gICAgICogQGRlZmF1bHQgMzBcbiAgICAgKi9cbiAgICByZWFkQ2FwYWNpdHlVbml0cz86IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBAZGVmYXVsdCAzMFxuICAgICAqL1xuICAgIHdyaXRlQ2FwYWNpdHlVbml0cz86IG51bWJlcjtcbiAgfTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0Y2hib3RBbGFybXMgPSB7XG4gIC8qKlxuICAgKiBTTlMgdG9waWMgdG8gc2VuZCBhbGFybSBhY3Rpb25zIHRvLiBJbiBtb3N0IGNhc2VzLCB5b3UnbGwgbmVlZCB0byBnZXQgdGhlIHRvcGljIEFSTiB1c2luZyBtYXBib3gtY2RrLWNvbW1vbiBBcm5VdGlsaXR5LmdldE9uY2FsbEFybigpIHRoZW4gaW1wb3J0IHRoYXQgaW4gQ0RLIHVzaW5nIGBUb3BpYy5mcm9tVG9waWNBcm5gLlxuICAgKi9cbiAgYWN0aW9uOiBJVG9waWM7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IHsgdGhyZXNob2xkOiAxMDAsIHBlcmlvZDogRHVyYXRpb24ubWludXRlcygxKSwgZXZhbHVhdGlvblBlcmlvZHM6IDEwIH1cbiAgICovXG4gIG1lbW9yeVV0aWxpemF0aW9uPzogQWxhcm1Qcm9wcztcbiAgLyoqXG4gICAqIEBkZWZhdWx0IHsgdGhyZXNob2xkOiA5MCwgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDEpLCBldmFsdWF0aW9uUGVyaW9kczogMTAgfVxuICAgKi9cbiAgY3B1VXRpbGl6YXRpb24/OiBBbGFybVByb3BzO1xuICAvKipcbiAgICogQGRlZmF1bHQgeyB0aHJlc2hvbGQ6IDQwLCBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoNSksIGV2YWx1YXRpb25QZXJpb2RzOiAyNCB9XG4gICAqL1xuICBxdWV1ZVNpemU/OiBBbGFybVByb3BzO1xuICAvKipcbiAgICogQGRlZmF1bHQgeyB0aHJlc2hvbGQ6IDEwLCBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoMSksIGV2YWx1YXRpb25QZXJpb2RzOiAxIH1cbiAgICovXG4gIGRscVNpemU/OiBBbGFybVByb3BzO1xuICAvKipcbiAgICogQGRlZmF1bHQgeyB0aHJlc2hvbGQ6IDEwLCBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoMSksIGV2YWx1YXRpb25QZXJpb2RzOiAxIH1cbiAgICovXG4gIHdvcmtlcnNFcnJvcnM/OiBBbGFybVByb3BzO1xufTtcblxuZXhwb3J0IHR5cGUgQWxhcm1Qcm9wcyA9IHtcbiAgdGhyZXNob2xkPzogbnVtYmVyO1xuICBldmFsdWF0aW9uUGVyaW9kcz86IG51bWJlcjtcbiAgcGVyaW9kPzogRHVyYXRpb247XG59O1xuXG5lbnVtIFN1cHBvcnRlZFJlZ2lvbiB7XG4gIFVzRWFzdDEgPSAndXMtZWFzdC0xJyxcbiAgVXNFYXN0MiA9ICd1cy1lYXN0LTInLFxuICBBcE5vcnRoZWFzdDEgPSAnYXAtbm9ydGhlYXN0LTEnXG59XG5cbmNvbnN0IFZQQ19JRHM6IHsgW2tleSBpbiBTdXBwb3J0ZWRSZWdpb25dOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0gPSB7XG4gIFtTdXBwb3J0ZWRSZWdpb24uVXNFYXN0MV06IHtcbiAgICBwcm9kdWN0aW9uOiAndnBjLTA0OGY1MjE5YTQyZjQ2ZjZhJyxcbiAgICBzdGFnaW5nOiAndnBjLTBkZjZhMGM3YWYxNTU5ZjlmJ1xuICB9LFxuICBbU3VwcG9ydGVkUmVnaW9uLlVzRWFzdDJdOiB7XG4gICAgcHJvZHVjdGlvbjogJ3ZwYy0wYTk3NDE1YmVjNTVjZGI0NScsXG4gICAgc3RhZ2luZzogJ3ZwYy0wOTUzZTI1NTE1NjE0ODE0ZCdcbiAgfSxcbiAgW1N1cHBvcnRlZFJlZ2lvbi5BcE5vcnRoZWFzdDFdOiB7XG4gICAgcHJvZHVjdGlvbjogJ3ZwYy0wMTg0OGUwMzcxNmNmMGZhNicsXG4gICAgc3RhZ2luZzogJ3ZwYy0wMmQ5ZGM4N2NiMmYzYmMxYSdcbiAgfVxufTtcblxuY29uc3QgTkVUV09SS0lOR19TVEdfQUNDT1VOVF9JRCA9ICc1NTM1NzE0MDg2MDInO1xuY29uc3QgTkVUV09SS0lOR19QUk9EX0FDQ09VTlRfSUQgPSAnOTM5NzIzNDU2MTUnO1xuXG5leHBvcnQgY2xhc3MgRmFyZ2F0ZVdhdGNoYm90IGV4dGVuZHMgUmVzb3VyY2Uge1xuICBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvcHM6IFdhdGNoYm90UHJvcHM7XG4gIHB1YmxpYyBzZXJ2aWNlOiBCYXNlU2VydmljZTtcbiAgcHVibGljIHRhc2tEZWZpbml0aW9uOiBUYXNrRGVmaW5pdGlvbjtcblxuICBwdWJsaWMgcmVhZG9ubHkgY2x1c3Rlcj86IElDbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nR3JvdXA6IExvZ0dyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgcXVldWU6IElRdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IGRlYWRMZXR0ZXJRdWV1ZTogSVF1ZXVlO1xuICBwdWJsaWMgcmVhZG9ubHkgbW9uaXRvcmluZzogTW9uaXRvcmluZ0ZhY2FkZTtcbiAgcHVibGljIHJlYWRvbmx5IHF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlOiBNYXBib3hRdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZTtcbiAgcHVibGljIHJlYWRvbmx5IHRvcGljOiBUb3BpYyB8IHVuZGVmaW5lZDtcbiAgcHVibGljIHJlYWRvbmx5IGNvbnRhaW5lcjogQ29udGFpbmVyRGVmaW5pdGlvbiB8IHVuZGVmaW5lZDtcbiAgcHVibGljIHJlYWRvbmx5IHRhYmxlOiBhd3NfZHluYW1vZGIuVGFibGU7XG5cbiAgcHJpdmF0ZSByZWFkb25seSBSVU5CT09LOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgc2NvcGU6IENvbnN0cnVjdDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2F0Y2hib3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgdGhpcy5zY29wZSA9IHNjb3BlO1xuXG4gICAgaWYgKCFbJ3Byb2R1Y3Rpb24nLCAnc3RhZ2luZyddLmluY2x1ZGVzKHByb3BzLmRlcGxveW1lbnRFbnZpcm9ubWVudCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYGRlcGxveW1lbnRFbnZpcm9ubWVudCBtdXN0IGJlIG9uZSBvZiBbc3RhZ2luZywgcHJvZHVjdGlvbl0gYnV0IHJlY2VpdmVkIGRlcGxveW1lbnRFbnZpcm9ubWVudD0ke3Byb3BzLmRlcGxveW1lbnRFbnZpcm9ubWVudH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMuUlVOQk9PSyA9IGBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L2Vjcy13YXRjaGJvdC9ibG9iLyR7cGtnLnZlcnNpb259L2RvY3MvYWxhcm1zLm1kYDtcblxuICAgIHRoaXMucHJvcHMgPSB0aGlzLm1lcmdlUHJvcHNXaXRoRGVmYXVsdHMoaWQsIHByb3BzKTtcblxuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiB0aGlzLnByb3BzLmxvZ0dyb3VwTmFtZSxcbiAgICAgIHJldGVudGlvbjogdGhpcy5wcm9wcy5sb2dHcm91cFJldGVudGlvbkRheXMsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcbiAgICAodGhpcy5sb2dHcm91cC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBDZm5Mb2dHcm91cCkub3ZlcnJpZGVMb2dpY2FsSWQodGhpcy5wcmVmaXhlZCgnTG9nR3JvdXAnKSk7XG5cbiAgICAvLyB3b3JrYXJvdW5kIGZvciBhIGJ1ZyB3aGVuIHlvdSBzZXQgZmlmbyA9IGZhbHNlXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy84NTUwXG4gICAgY29uc3QgYWRkaXRpb25hbEZpZm9Qcm9wZXJ0aWVzID0gdGhpcy5wcm9wcy5maWZvPyB7IGZpZm86IHRydWUsIGNvbnRlbnRCYXNlZERlZHVwbGljYXRpb246IHRydWUgfSA6IHt9O1xuXG4gICAgdGhpcy5kZWFkTGV0dGVyUXVldWUgPSBuZXcgUXVldWUodGhpcywgJ0RlYWRMZXR0ZXJRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFjay5zdGFja05hbWV9LSR7dGhpcy5wcmVmaXhlZCgnRGVhZExldHRlclF1ZXVlJyl9YCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogdGhpcy5wcm9wcy5yZXRlbnRpb25QZXJpb2QgfHwgRHVyYXRpb24uZGF5cygxNCksXG4gICAgICAuLi5hZGRpdGlvbmFsRmlmb1Byb3BlcnRpZXNcbiAgICB9KTtcblxuICAgIHRoaXMucXVldWUgPSBuZXcgUXVldWUodGhpcywgJ1F1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByZWZpeGVkKCdRdWV1ZScpfWAsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IHRoaXMucHJvcHMucmV0ZW50aW9uUGVyaW9kIHx8IER1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTgwKSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogdGhpcy5kZWFkTGV0dGVyUXVldWUsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogdGhpcy5wcm9wcy5kZWFkTGV0dGVyVGhyZXNob2xkIHx8IDEwXG4gICAgICB9LFxuICAgICAgLi4uYWRkaXRpb25hbEZpZm9Qcm9wZXJ0aWVzXG4gICAgfSk7XG5cbiAgICB0aGlzLmNsdXN0ZXIgPSB0aGlzLnByb3BzLmNsdXN0ZXI7XG5cbiAgICBjb25zdCBxdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZVByb3BzOiBNYXBib3hRdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZVByb3BzID0ge1xuICAgICAgLy8gU2VydmljZSBwcm9wc1xuICAgICAgc2VydmljZU5hbWU6IHRoaXMucHJvcHMuc2VydmljZU5hbWUsXG5cbiAgICAgIC8vIFRhc2sgRGVmaW5pdGlvbiBwcm9wc1xuICAgICAgY3B1OiB0aGlzLnByb3BzLmNwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiB0aGlzLnByb3BzLm1lbW9yeUxpbWl0TWlCLFxuICAgICAgZmFtaWx5OiB0aGlzLnByb3BzLmZhbWlseSxcbiAgICAgIHJ1bnRpbWVQbGF0Zm9ybTogdGhpcy5wcm9wcy5ydW50aW1lUGxhdGZvcm0sXG4gICAgICB2b2x1bWVzOiB0aGlzLnByb3BzLnZvbHVtZXMsXG4gICAgICBwcml2aWxlZ2VkOiB0aGlzLnByb3BzLnByaXZpbGVnZWQsXG4gICAgICByZWFkb25seVJvb3RGaWxlc3lzdGVtOiB0aGlzLnByb3BzLnJlYWRvbmx5Um9vdEZpbGVzeXN0ZW0sXG4gICAgICBtZW1vcnlSZXNlcnZhdGlvbk1pQjogdGhpcy5wcm9wcy5tZW1vcnlSZXNlcnZhdGlvbk1pQixcblxuICAgICAgLy8gQ29udGFpbmVyIHByb3BzXG4gICAgICBpbWFnZTogdGhpcy5wcm9wcy5pbWFnZSxcbiAgICAgIGNvbnRhaW5lck5hbWU6IHRoaXMucHJvcHMuY29udGFpbmVyTmFtZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFF1ZXVlVXJsOiB0aGlzLnF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICBMb2dHcm91cDogdGhpcy5sb2dHcm91cC5sb2dHcm91cEFybixcbiAgICAgICAgd3JpdGFibGVGaWxlc3lzdGVtOiAoIXRoaXMucHJvcHMucmVhZG9ubHlSb290RmlsZXN5c3RlbSk/LnRvU3RyaW5nKCkgfHwgJycsXG4gICAgICAgIG1heEpvYkR1cmF0aW9uOiBgJHt0aGlzLnByb3BzLm1heEpvYkR1cmF0aW9uPy50b1NlY29uZHMoKSB8fCAwfWAsXG4gICAgICAgIFZvbHVtZXM6ICh0aGlzLnByb3BzLm1vdW50UG9pbnRzIHx8IFtdKS5tYXAoKG0pID0+IG0uY29udGFpbmVyUGF0aCkuam9pbignLCcpLFxuICAgICAgICBGaWZvOiAodGhpcy5wcm9wcy5maWZvIHx8IGZhbHNlKS50b1N0cmluZygpLFxuICAgICAgICBzdHJ1Y3R1cmVkTG9nZ2luZzogKHRoaXMucHJvcHMuc3RydWN0dXJlZExvZ2dpbmcgfHwgZmFsc2UpLnRvU3RyaW5nKCksXG4gICAgICAgIC4uLnRoaXMucHJvcHMuZW52aXJvbm1lbnRcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB0aGlzLnByb3BzLnNlY3JldHMsXG4gICAgICBjb21tYW5kOiBbJ3dhdGNoYm90JywgJ2xpc3RlbicsIC4uLnRoaXMucHJvcHMuY29tbWFuZF0sXG4gICAgICBlbmFibGVMb2dnaW5nOiB0cnVlLFxuICAgICAgbG9nRHJpdmVyOiBMb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6IHRoaXMucHJvcHMuc2VydmljZVZlcnNpb24sXG4gICAgICAgIGxvZ0dyb3VwOiB0aGlzLmxvZ0dyb3VwXG4gICAgICB9KSxcbiAgICAgIGhlYWx0aENoZWNrOiB0aGlzLnByb3BzLmhlYWx0aENoZWNrLFxuXG4gICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcblxuICAgICAgY2x1c3RlcjogdGhpcy5jbHVzdGVyLFxuICAgICAgcHJvcGFnYXRlVGFnczogUHJvcGFnYXRlZFRhZ1NvdXJjZS5UQVNLX0RFRklOSVRJT04sXG5cbiAgICAgIC8vIHNjYWxpbmcgcHJvcHNcbiAgICAgIHNjYWxpbmdTdGVwczogdGhpcy5wcm9wcy5zY2FsaW5nU3RlcHMsXG4gICAgICBtYXhTY2FsaW5nQ2FwYWNpdHk6IHRoaXMucHJvcHMubWF4U2NhbGluZ0NhcGFjaXR5LFxuICAgICAgbWluU2NhbGluZ0NhcGFjaXR5OiB0aGlzLnByb3BzLm1pblNjYWxpbmdDYXBhY2l0eSxcblxuICAgICAgLy8gbmV0d29yayBjb25maWcgcHJvcHNcbiAgICAgIHRhc2tTdWJuZXRzOiB0aGlzLnByb3BzLnN1Ym5ldHMsXG4gICAgICBhc3NpZ25QdWJsaWNJcDogdGhpcy5wcm9wcy5wdWJsaWNJUCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiB0aGlzLnByb3BzLnNlY3VyaXR5R3JvdXBzXG4gICAgfTtcbiAgICB0aGlzLnF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlID0gbmV3IE1hcGJveFF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlKFxuICAgICAgdGhpcyxcbiAgICAgICdTZXJ2aWNlJyxcbiAgICAgIHF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlUHJvcHNcbiAgICApO1xuICAgIHRoaXMuc2VydmljZSA9IHRoaXMucXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2Uuc2VydmljZTtcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gdGhpcy5xdWV1ZVByb2Nlc3NpbmdGYXJnYXRlU2VydmljZS50YXNrRGVmaW5pdGlvbjtcblxuICAgIHRoaXMuY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5maW5kQ29udGFpbmVyKHRoaXMucHJvcHMuY29udGFpbmVyTmFtZSB8fCAnJyk7XG4gICAgaWYgKHRoaXMuY29udGFpbmVyKSB7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRNb3VudFBvaW50cyguLi4odGhpcy5wcm9wcy5tb3VudFBvaW50cyB8fCBbXSkpO1xuICAgICAgdGhpcy5jb250YWluZXIuYWRkVWxpbWl0cyh7XG4gICAgICAgIG5hbWU6IFVsaW1pdE5hbWUuTk9GSUxFLFxuICAgICAgICBzb2Z0TGltaXQ6IDEwMjQwLFxuICAgICAgICBoYXJkTGltaXQ6IDEwMjQwXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCBjb250YWluZXIgd2l0aCBjb250YWluZXJOYW1lPSR7dGhpcy5wcm9wcy5jb250YWluZXJOYW1lfWApO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5wcm9wcy5maWZvKSB7XG4gICAgICB0aGlzLnRvcGljID0gbmV3IFRvcGljKHRoaXMsICdUb3BpYycsIHtcbiAgICAgICAgdG9waWNOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnByb3BzLnByZWZpeH1Ub3BpY2BcbiAgICAgIH0pO1xuICAgICAgdGhpcy50b3BpYy5hZGRTdWJzY3JpcHRpb24obmV3IFNxc1N1YnNjcmlwdGlvbih0aGlzLnF1ZXVlKSk7XG4gICAgICB0aGlzLnF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKFxuICAgICAgICBuZXcgUHJpbmNpcGFsV2l0aENvbmRpdGlvbnMobmV3IEFueVByaW5jaXBhbCgpLCB7XG4gICAgICAgICAgQXJuRXF1YWxzOiB7XG4gICAgICAgICAgICAnYXdzOlNvdXJjZUFybic6IHRoaXMudG9waWMudG9waWNBcm5cbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgdGhpcy50b3BpYy5ncmFudFB1Ymxpc2godGhpcy50YXNrRGVmaW5pdGlvbi50YXNrUm9sZSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hZGRFbnZpcm9ubWVudCgnV29ya1RvcGljJywgdGhpcy50b3BpYy50b3BpY0Fybik7XG4gICAgfVxuXG4gICAgdGhpcy5tb25pdG9yaW5nID0gdGhpcy5jcmVhdGVBbGFybXMoKTtcblxuICAgIGlmICh0aGlzLnByb3BzLnJlZHVjZU1vZGVDb25maWd1cmF0aW9uPy5lbmFibGVkKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IG5ldyBhd3NfZHluYW1vZGIuVGFibGUodGhpcywgJ1Byb2dyZXNzVGFibGUnLCB7XG4gICAgICAgIHRhYmxlTmFtZTogYCR7dGhpcy5zdGFjay5zdGFja05hbWV9LSR7dGhpcy5wcmVmaXhlZCgnLXByb2dyZXNzJyl9YC50b0xvd2VyQ2FzZSgpLFxuICAgICAgICByZWFkQ2FwYWNpdHk6IHRoaXMucHJvcHMucmVkdWNlTW9kZUNvbmZpZ3VyYXRpb24ucmVhZENhcGFjaXR5VW5pdHMgfHwgMzAsXG4gICAgICAgIHdyaXRlQ2FwYWNpdHk6IHRoaXMucHJvcHMucmVkdWNlTW9kZUNvbmZpZ3VyYXRpb24ud3JpdGVDYXBhY2l0eVVuaXRzIHx8IDMwLFxuICAgICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgICBuYW1lOiAnaWQnLFxuICAgICAgICAgIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgKHRhYmxlLm5vZGUuZGVmYXVsdENoaWxkIGFzIENmblRhYmxlKS5vdmVycmlkZUxvZ2ljYWxJZCgnUHJvZ3Jlc3NUYWJsZScpO1xuICAgICAgdGhpcy50YWJsZSA9IHRhYmxlO1xuICAgICAgdGhpcy5jb250YWluZXIuYWRkRW52aXJvbm1lbnQoJ1Byb2dyZXNzVGFibGUnLCB0aGlzLnRhYmxlLnRhYmxlQXJuKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUFsYXJtcygpIHtcbiAgICBjb25zdCBtb25pdG9yaW5nID0gbmV3IE1vbml0b3JpbmdGYWNhZGUodGhpcywgJ01vbml0b3JpbmcnLCB7XG4gICAgICBhbGFybUZhY3RvcnlEZWZhdWx0czoge1xuICAgICAgICBhbGFybU5hbWVQcmVmaXg6IHRoaXMucHJlZml4ZWQoJycpLFxuICAgICAgICBhY3Rpb25zRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgYWN0aW9uOiBuZXcgU25zQWxhcm1BY3Rpb25TdHJhdGVneSh7XG4gICAgICAgICAgb25BbGFybVRvcGljOiB0aGlzLnByb3BzLmFsYXJtcy5hY3Rpb25cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHdvcmtlcnNFcnJvcnNNZXRyaWMgPSB0aGlzLmxvZ0dyb3VwXG4gICAgICAuYWRkTWV0cmljRmlsdGVyKHRoaXMucHJlZml4ZWQoJ1dvcmtlckVycm9yc01ldHJpYycpLCB7XG4gICAgICAgIG1ldHJpY05hbWU6IGAke3RoaXMucHJlZml4ZWQoJ1dvcmtlckVycm9ycycpfS0ke3RoaXMuc3RhY2suc3RhY2tOYW1lfWAsXG4gICAgICAgIG1ldHJpY05hbWVzcGFjZTogJ01hcGJveC9lY3Mtd2F0Y2hib3QnLFxuICAgICAgICBtZXRyaWNWYWx1ZTogJzEnLFxuICAgICAgICBmaWx0ZXJQYXR0ZXJuOiBGaWx0ZXJQYXR0ZXJuLmFueVRlcm0oJ1wiW2ZhaWx1cmVdXCInKVxuICAgICAgfSlcbiAgICAgIC5tZXRyaWMoe1xuICAgICAgICBzdGF0aXN0aWM6IFN0YXRzLlNVTVxuICAgICAgfSk7XG5cbiAgICBtb25pdG9yaW5nXG4gICAgICAuYWRkTGFyZ2VIZWFkZXIodGhpcy5wcmVmaXhlZCh0aGlzLnN0YWNrLnN0YWNrTmFtZSkpXG4gICAgICAubW9uaXRvclF1ZXVlUHJvY2Vzc2luZ0ZhcmdhdGVTZXJ2aWNlKHtcbiAgICAgICAgZmFyZ2F0ZVNlcnZpY2U6IHRoaXMucXVldWVQcm9jZXNzaW5nRmFyZ2F0ZVNlcnZpY2UsXG4gICAgICAgIGFkZFNlcnZpY2VBbGFybXM6IHtcbiAgICAgICAgICBhZGRNZW1vcnlVc2FnZUFsYXJtOiB7XG4gICAgICAgICAgICBtZW1vcnlVc2FnZToge1xuICAgICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSNtZW1vcnl1dGlsaXphdGlvbmAsXG4gICAgICAgICAgICAgIG1heFVzYWdlUGVyY2VudDogdGhpcy5wcm9wcy5hbGFybXMubWVtb3J5VXRpbGl6YXRpb24/LnRocmVzaG9sZCB8fCAxMDAsXG4gICAgICAgICAgICAgIHBlcmlvZDogdGhpcy5wcm9wcy5hbGFybXMubWVtb3J5VXRpbGl6YXRpb24/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogdGhpcy5wcm9wcy5hbGFybXMubWVtb3J5VXRpbGl6YXRpb24/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhZGRDcHVVc2FnZUFsYXJtOiB7XG4gICAgICAgICAgICBjcHU6IHtcbiAgICAgICAgICAgICAgcnVuYm9va0xpbms6IGAke3RoaXMuUlVOQk9PS30jQ3B1VXRpbGl6YXRpb25gLFxuICAgICAgICAgICAgICBtYXhVc2FnZVBlcmNlbnQ6IHRoaXMucHJvcHMuYWxhcm1zLmNwdVV0aWxpemF0aW9uPy50aHJlc2hvbGQgfHwgOTAsXG4gICAgICAgICAgICAgIHBlcmlvZDogdGhpcy5wcm9wcy5hbGFybXMuY3B1VXRpbGl6YXRpb24/LnBlcmlvZCB8fCBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogdGhpcy5wcm9wcy5hbGFybXMuY3B1VXRpbGl6YXRpb24/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLm1vbml0b3JTcXNRdWV1ZVdpdGhEbHEoe1xuICAgICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcbiAgICAgICAgZGVhZExldHRlclF1ZXVlOiB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSxcbiAgICAgICAgYWRkUXVldWVNYXhTaXplQWxhcm06IHtcbiAgICAgICAgICBtYXhTaXplOiB7XG4gICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSNRdWV1ZVNpemVgLFxuICAgICAgICAgICAgbWF4TWVzc2FnZUNvdW50OiB0aGlzLnByb3BzLmFsYXJtcy5xdWV1ZVNpemU/LnRocmVzaG9sZCB8fCA0MCxcbiAgICAgICAgICAgIHBlcmlvZDogdGhpcy5wcm9wcy5hbGFybXMucXVldWVTaXplPy5wZXJpb2QgfHwgRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5xdWV1ZVNpemU/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDI0XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZGREZWFkTGV0dGVyUXVldWVNYXhTaXplQWxhcm06IHtcbiAgICAgICAgICBtYXhTaXplOiB7XG4gICAgICAgICAgICBydW5ib29rTGluazogYCR7dGhpcy5SVU5CT09LfSNEZWFkTGV0dGVyUXVldWVTaXplYCxcbiAgICAgICAgICAgIG1heE1lc3NhZ2VDb3VudDogdGhpcy5wcm9wcy5hbGFybXMuZGxxU2l6ZT8udGhyZXNob2xkIHx8IDEwLFxuICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy5kbHFTaXplPy5wZXJpb2QgfHwgRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy5kbHFTaXplPy5ldmFsdWF0aW9uUGVyaW9kcyB8fCAxLFxuICAgICAgICAgICAgZGF0YXBvaW50c1RvQWxhcm06IHRoaXMucHJvcHMuYWxhcm1zLmRscVNpemU/LmV2YWx1YXRpb25QZXJpb2RzIHx8IDEgLy8gbWF0Y2ggZXZhbHVhdGlvblBlcmlvZHNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAubW9uaXRvckN1c3RvbSh7XG4gICAgICAgIGFkZFRvQWxhcm1EYXNoYm9hcmQ6IHRydWUsXG4gICAgICAgIGFsYXJtRnJpZW5kbHlOYW1lOiBgd29ya2VyLWVycm9ycy0ke3RoaXMuc3RhY2sucmVnaW9ufWAsXG4gICAgICAgIG1ldHJpY0dyb3VwczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHRpdGxlOiAnV29ya2VyIEVycm9ycycsXG4gICAgICAgICAgICBtZXRyaWNzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhbGFybUZyaWVuZGx5TmFtZTogYHdvcmtlci1lcnJvcnMtJHt0aGlzLnN0YWNrLnJlZ2lvbn1gLFxuICAgICAgICAgICAgICAgIG1ldHJpYzogd29ya2Vyc0Vycm9yc01ldHJpYyxcbiAgICAgICAgICAgICAgICBhZGRBbGFybToge1xuICAgICAgICAgICAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyZXNob2xkOiB0aGlzLnByb3BzLmFsYXJtcy53b3JrZXJzRXJyb3JzPy50aHJlc2hvbGQgfHwgMTAsXG4gICAgICAgICAgICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiB0aGlzLnByb3BzLmFsYXJtcy53b3JrZXJzRXJyb3JzPy5ldmFsdWF0aW9uUGVyaW9kcyB8fCAxLFxuICAgICAgICAgICAgICAgICAgICBkYXRhcG9pbnRzVG9BbGFybTogdGhpcy5wcm9wcy5hbGFybXMud29ya2Vyc0Vycm9ycz8uZXZhbHVhdGlvblBlcmlvZHMgfHwgMSwgLy8gbWF0Y2ggZXZhbHVhdGlvblBlcmlvZHNcbiAgICAgICAgICAgICAgICAgICAgcGVyaW9kOiB0aGlzLnByb3BzLmFsYXJtcy53b3JrZXJzRXJyb3JzPy5wZXJpb2QgfHwgRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBDb21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgICAgICAgICAgICAgICAgcnVuYm9va0xpbms6IGAke3RoaXMuUlVOQk9PS30jd29ya2VyZXJyb3JzYFxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSk7XG4gICAgcmV0dXJuIG1vbml0b3Jpbmc7XG4gIH1cblxuICBwcml2YXRlIHByZWZpeGVkID0gKG5hbWU6IHN0cmluZykgPT4gYCR7dGhpcy5wcm9wcy5wcmVmaXh9JHtuYW1lfWA7XG5cbiAgcHJpdmF0ZSBtZXJnZVByb3BzV2l0aERlZmF1bHRzKGlkOiBzdHJpbmcsIHByb3BzOiBXYXRjaGJvdFByb3BzKTogV2F0Y2hib3RQcm9wcyB7XG4gICAgY29uc3QgeyByZWdpb24gfSA9IFN0YWNrLm9mKHRoaXMuc2NvcGUpO1xuXG4gICAgY29uc3QgcHJlZml4ID0gcHJvcHMucHJlZml4ID8/ICdXYXRjaGJvdCc7XG4gICAgY29uc3QgREVGQVVMVF9QUk9QUzogUGFydGlhbDxXYXRjaGJvdFByb3BzPiA9IHtcbiAgICAgIHByZWZpeCxcbiAgICAgIGNvbnRhaW5lck5hbWU6IGAke3ByZWZpeH0tJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX1gLFxuICAgICAgc3RydWN0dXJlZExvZ2dpbmc6IGZhbHNlLFxuICAgICAgcmVhZG9ubHlSb290RmlsZXN5c3RlbTogdHJ1ZSxcbiAgICAgIG1heEpvYkR1cmF0aW9uOiBEdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgZmFtaWx5OiBwcm9wcy5zZXJ2aWNlTmFtZSxcbiAgICAgIGNsdXN0ZXI6IENsdXN0ZXIuZnJvbUNsdXN0ZXJBdHRyaWJ1dGVzKHRoaXMsIGAke2lkfUNsdXN0ZXJgLCB7XG4gICAgICAgIGNsdXN0ZXJOYW1lOiBgZmFyZ2F0ZS1wcm9jZXNzaW5nLSR7cHJvcHMuZGVwbG95bWVudEVudmlyb25tZW50fWAsXG4gICAgICAgIHZwYzogVnBjLmZyb21Mb29rdXAodGhpcywgYCR7aWR9VlBDYCwge1xuICAgICAgICAgIHZwY0lkOiBWUENfSURzW3JlZ2lvbiBhcyBTdXBwb3J0ZWRSZWdpb25dW3Byb3BzLmRlcGxveW1lbnRFbnZpcm9ubWVudF0sXG4gICAgICAgICAgaXNEZWZhdWx0OiBmYWxzZSxcbiAgICAgICAgICByZWdpb24sXG4gICAgICAgICAgb3duZXJBY2NvdW50SWQ6XG4gICAgICAgICAgICBwcm9wcy5kZXBsb3ltZW50RW52aXJvbm1lbnQgPT09ICdzdGFnaW5nJ1xuICAgICAgICAgICAgICA/IE5FVFdPUktJTkdfU1RHX0FDQ09VTlRfSURcbiAgICAgICAgICAgICAgOiBORVRXT1JLSU5HX1BST0RfQUNDT1VOVF9JRFxuICAgICAgICB9KVxuICAgICAgfSksXG5cbiAgICAgIHB1YmxpY0lQOiBmYWxzZSxcbiAgICAgIHByaXZpbGVnZWQ6IGZhbHNlLFxuICAgICAgbG9nR3JvdXBOYW1lOiBgJHt0aGlzLnN0YWNrLnN0YWNrTmFtZX0tJHt0aGlzLnN0YWNrLnJlZ2lvbn0tJHtwcmVmaXgudG9Mb3dlckNhc2UoKX1gLFxuICAgICAgbG9nR3JvdXBSZXRlbnRpb25EYXlzOiBSZXRlbnRpb25EYXlzLlRXT19XRUVLUyxcbiAgICAgIG1vdW50UG9pbnRzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjb250YWluZXJQYXRoOiAnL3RtcCcsXG4gICAgICAgICAgc291cmNlVm9sdW1lOiAndG1wJyxcbiAgICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgdm9sdW1lczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ3RtcCdcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIGZpZm86IGZhbHNlLFxuICAgICAgZGVhZExldHRlclRocmVzaG9sZDogMTAsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IER1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgcmVkdWNlTW9kZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgIHdyaXRlQ2FwYWNpdHlVbml0czogMzAsXG4gICAgICAgIHJlYWRDYXBhY2l0eVVuaXRzOiAzMFxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgLi4uREVGQVVMVF9QUk9QUyxcbiAgICAgIC4uLnByb3BzXG4gICAgfTtcbiAgfVxufVxuIl19
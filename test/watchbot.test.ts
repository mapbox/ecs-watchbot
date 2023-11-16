import {App, Duration, Fn, Stack} from 'aws-cdk-lib';
import { FargateWatchbot, WatchbotProps } from '../lib/watchbot';
import { Template } from 'aws-cdk-lib/assertions';
import {Cluster, ContainerImage} from 'aws-cdk-lib/aws-ecs';
import {Vpc} from "aws-cdk-lib/aws-ec2";
import {CfnLogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {CfnQueue} from "aws-cdk-lib/aws-sqs";
import {CfnTopic} from "aws-cdk-lib/aws-sns";

const stack = new Stack(new App(), 'test-stack', {
    stackName: 'test-stack',
    env: {
        region: 'us-east-1',
        account: '222258372212',
    },
});

const defaultProps = {
    prefix: 'Watchbot',
    containerName: `Watchbot-test-stack`,
    structuredLogging: false,
    writableFileSystem: false,
    maxJobDuration: Duration.seconds(0),
    family: 'serviceName',
    cluster: Cluster.fromClusterAttributes(stack, 'Cluster', {
        clusterName: `fargate-processing-staging`,
        vpc: Vpc.fromLookup(stack, 'VPC', {
            vpcId: 'vpc-id'
        })
    }),
    command: ['watchbot', 'listen'],

    publicIP: false,
    privileged: false,
    logGroupName: `test-stack-us-east-1-watchbot`,
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
}

describe('FargateWatchbot', () => {
    const requiredProps: WatchbotProps = {
        image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        serviceName: 'test-service',
        command: ['echo', 'hello'],
        deploymentEnvironment: 'staging',
        serviceVersion: '1.0.0',
    };

    describe('When passing the minimal required props', () => {
        const watchbot = new FargateWatchbot(stack, 'MyFargateWatchbot', requiredProps);

        const template = Template.fromStack(stack);

        it('creates a LogGroup', () => {
            template.hasResourceProperties('AWS::Logs::LogGroup', {
                LogGroupName: defaultProps.logGroupName,
                RetentionInDays: defaultProps.logGroupRetentionDays,
            });
        });

        it('Snap', () => {
            expect(template).toMatchSnapshot()
        })

        it('creates a TaskDefinition', () => {
            template.hasResourceProperties('AWS::ECS::TaskDefinition', {
                Cpu: '256',
                Memory: '512',
                RequiresCompatibilities: ['FARGATE'],
                Family: 'test-service',
                Volumes: defaultProps.volumes.map(v => ({ Name: v.name })),
                ContainerDefinitions: [{
                    Privileged: defaultProps.privileged,
                    Image: 'amazon/amazon-ecs-sample',
                    Command: [...defaultProps.command, ...requiredProps.command],
                    Environment: [
                        { Name: 'QueueUrl', Value: {} },
                        { Name: 'LogGroup', Value: { 'Fn::GetAtt': [ 'WatchbotLogGroup', 'Arn' ]}},
                        { Name: 'writableFilesystem', Value: 'false'},
                        { Name: 'maxJobDuration', Value: '0'},
                        { Name: 'Volumes', Value: '/tmp'},
                        { Name: 'Fifo', Value: 'false'},
                        { Name: 'structuredLogging', Value: 'false'},
                        { Name: 'QUEUE_NAME', Value: {} },
                        { Name: 'WorkTopic', Value: {} },
                    ],
                    LogConfiguration: {
                        LogDriver: 'awslogs',
                        Options: {
                            "awslogs-group": {
                                "Ref": "WatchbotLogGroup",
                            },
                            "awslogs-region": "us-east-1",
                            "awslogs-stream-prefix": requiredProps.serviceVersion,
                        }
                    },
                    MountPoints: [{
                        "ContainerPath": "/tmp",
                        "ReadOnly": true,
                        "SourceVolume": "tmp",
                    }],
                    ReadonlyRootFilesystem: true,
                    Ulimits: [{
                        "HardLimit": 10240,
                        "Name": "nofile",
                        "SoftLimit": 10240,
                    }]
                }]
            });
        });

        it('creates a Fargate service', () => {
            template.hasResourceProperties('AWS::ECS::Service', {
                PropagateTags: "TASK_DEFINITION",
                ServiceName: "test-service",
                Cluster: 'fargate-processing-staging',
                LaunchType: 'FARGATE',
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'DISABLED'
                    }
                }

            });
        });

        it('creates a 2 SQS queue', () => {
            template.resourceCountIs('AWS::SQS::Queue', 2);

            // Queue
            template.hasResourceProperties('AWS::SQS::Queue', {
                "ContentBasedDeduplication": defaultProps.fifo, // this is only true if fifo is true
                "FifoQueue": defaultProps.fifo,
                "MessageRetentionPeriod": defaultProps.retentionPeriod.toSeconds(),
                "QueueName": "test-stack-WatchbotQueue",
                "RedrivePolicy": {
                    "maxReceiveCount": 10,
                },
                "VisibilityTimeout": 180,
            });

            // DLQ
            template.hasResourceProperties('AWS::SQS::Queue', {
                "ContentBasedDeduplication": defaultProps.fifo, // this is only true if fifo is true
                "FifoQueue": defaultProps.fifo,
                "MessageRetentionPeriod": defaultProps.retentionPeriod.toSeconds(),
                "QueueName": "test-stack-WatchbotDeadLetterQueue",
            });
        });

        it('creates an SNS topic if fifo is false', () => {
            if (!defaultProps.fifo) {
                template.resourceCountIs('AWS::SNS::Topic', 1);
            }
        });
    });

});

import {aws_codebuild, aws_codepipeline, aws_codestarconnections, RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {BuildEnvironmentVariableType, BuildSpec} from "aws-cdk-lib/aws-codebuild";
import {Effect, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";

interface Props extends StackProps {
    deploymentEnvironment: string
    bucketName: string
}

export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const codebuildLogGroup = new LogGroup(this, 'CodebuildLogs', {
            logGroupName: `${this.stackName}-logs`,
            retention: RetentionDays.TWO_WEEKS,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const linuxCodebuild = new aws_codebuild.PipelineProject(this, 'LinuxBundle', {
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.STANDARD_7_0
            },
            logging: {
                cloudWatch: {
                    enabled: true,
                    logGroup: codebuildLogGroup,
                }
            },
            environmentVariables: {
                BUCKET_NAME: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.bucketName
                }
            },
            projectName: `${this.stackName}-linux-bundle`,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'commands': [
                            'npm ci --production'
                        ]
                    },
                    build: {
                        commands:[
                            'node bin/watchbot-binary-generator',
                        ],
                    },
                },
            })
        });
        const alpineCodebuild = new aws_codebuild.PipelineProject(this, 'AlpineBundle', {
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.fromCodeBuildImageId('public.ecr.aws/docker/library/node:18-alpine')
            },
            logging: {
                cloudWatch: {
                    enabled: true,
                    logGroup: codebuildLogGroup,
                }
            },
            environmentVariables: {
                BUCKET_NAME: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.bucketName
                }
            },
            projectName: `${this.stackName}-alpine-bundler`,
            description: 'Builds watchbot binaries for alpine OS',
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'commands': [
                            'apk add git',
                            'npm ci --production'
                        ]
                    },
                    build: {
                        commands:[
                            'node bin/watchbot-binary-generator alpine',
                        ],
                    },
                },
            })
        })
        const testCodebuild = new aws_codebuild.PipelineProject(this, 'TestCodebuild', {
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.STANDARD_7_0
            },
            logging: {
                cloudWatch: {
                    enabled: true,
                    logGroup: codebuildLogGroup,
                }
            },
            environmentVariables: {
                BUCKET_NAME: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: 'watchbot-binaries' // bucket name used in tests
                }
            },
            projectName: `${this.stackName}-test`,
            description: 'Runs tests',
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    pre_build: {
                        'commands': [
                            'docker build -q -t ecs-watchbot -f test/Dockerfile ./'
                        ]
                    },
                    build: {
                        commands:[
                            'docker run -t ecs-watchbot npm run test-container',
                        ],
                    },
                },
            })
        });
        const s3Permissions = new Policy(this, 'S3Policy', {
            statements: [new PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:GetObjectVersion"
                ],
                resources: [
                    `arn:aws:s3:::${props.bucketName}`,
                    `arn:aws:s3:::${props.bucketName}/*`,
                ]
            })]
        })
        linuxCodebuild.role?.attachInlinePolicy(s3Permissions);
        alpineCodebuild.role?.attachInlinePolicy(s3Permissions);
        testCodebuild.role?.attachInlinePolicy(s3Permissions);

        const role = new Role(this, 'PipelineRole', {
            assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
            inlinePolicies: {
                main: new PolicyDocument({
                    statements: [new PolicyStatement({
                        sid: 'S3permissions',
                        effect: Effect.ALLOW,
                        actions: [
                            's3:*'
                        ],
                        resources: [
                            `arn:aws:s3:::${props.bucketName}`,
                            `arn:aws:s3:::${props.bucketName}/*`,
                        ]
                    }), new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            'codebuild:StartBuild',
                            'codebuild:BatchGetBuilds',
                            'codestar-connections:*'
                        ],
                        resources: ['*']
                    }), new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            'sts:AssumeRole'
                        ],
                        resources: [
                            linuxCodebuild.role?.roleArn || '',
                            alpineCodebuild.role?.roleArn  || '',
                        ]
                    })]
                })
            }
        });

        /*
         aws_codepipeline.Pipeline creates PipelineType=v1 which can't be re-triggered with overrides and that's needed for testing
         codepipeline.CodePipeline creates PipelineType=v2 but forces you to have a stack to deploy which we don't have here
         hence using aws_codepipeline.CfnPipeline
        */
        const connection = new aws_codestarconnections.CfnConnection(this, 'Connection', {
            connectionName: 'ecs-watchbot',
            providerType: 'GitHub'
        });
        const p = new aws_codepipeline.CfnPipeline(this, 'Pipeline', {
            roleArn: role.roleArn,
            name: this.stackName,
            stages: [{
                name: 'Source',
                actions: [{
                    name: 'Github',
                    actionTypeId: {
                        category: 'Source',
                        owner: 'AWS',
                        provider: 'CodeStarSourceConnection',
                        version: '1',
                    },
                    configuration: {
                        ConnectionArn: connection.attrConnectionArn,
                        FullRepositoryId: 'mapbox/ecs-watchbot',
                        BranchName: 'build-binary', // TODO update before merge
                    },
                    outputArtifacts: [{
                        name: 'Source',
                    }],
                }],
            }, {
                name: 'Test',
                actions: [{
                    name: 'Test',
                    actionTypeId: {
                        category: 'Build',
                        owner: 'AWS',
                        provider: 'CodeBuild',
                        version: '1',
                    },
                    inputArtifacts: [{
                        name: 'Source'
                    }],
                    configuration: {
                        ProjectName: testCodebuild.projectName
                    }
                }]
            }, {
                name: 'Bundle',
                actions: [{
                    name: 'Bundle',
                    actionTypeId: {
                        category: 'Build',
                        owner: 'AWS',
                        provider: 'CodeBuild',
                        version: '1',
                    },
                    inputArtifacts: [{
                        name: 'Source'
                    }],
                    configuration: {
                        ProjectName: linuxCodebuild.projectName
                    }
                }, {
                    name: 'AlpineBundle',
                    actionTypeId: {
                        category: 'Build',
                        owner: 'AWS',
                        provider: 'CodeBuild',
                        version: '1',
                    },
                    inputArtifacts: [{
                        name: 'Source'
                    }],
                    configuration: {
                        ProjectName: alpineCodebuild.projectName
                    }
                }]
            }],
            artifactStore: {
                location: props.bucketName,
                type: 'S3',
            },
        });
        p.addPropertyOverride('PipelineType', 'V2'); // v2 is required to trigger on a specific gitsha
    }
}

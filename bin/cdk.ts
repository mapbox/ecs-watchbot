#!/usr/bin/env node
import 'source-map-support/register';
import {Construct} from "constructs";
import {
    App,
    aws_codebuild,
    aws_codepipeline,
    aws_codestarconnections,
    BootstraplessSynthesizer,
    CliCredentialsStackSynthesizer,
    Duration,
    RemovalPolicy,
    Stack,
    StackProps,
} from "aws-cdk-lib";
import {Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";
import {BuildEnvironmentVariableType, BuildSpec} from "aws-cdk-lib/aws-codebuild";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Effect, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";

const app = new App();

// const input =  CodePipelineSource.connection('mapbox/ecs-watchbot', 'master', {
//     connectionArn: 'arn:aws:codestar-connections:us-east-1:353802256504:connection/da887df2-781b-4a00-8dce-24dced5cc129',
// });

interface Props extends StackProps {
    deploymentEnvironment: string
    bucketName: string
}

class PipelineStack extends Stack {
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
         aws_codepipeline.Pipeline creates v1 which can't be re-triggered with overrides and that's needed for testing
         codepipeline.CodePipeline creates v2 but forces you to have a stack
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
                        BranchName: 'master',
                    },
                    outputArtifacts: [{
                        name: 'Source',
                    }],
                }],
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
        p.addPropertyOverride('PipelineType', 'V2');
        p.addPropertyOverride('Triggers', [
            {
                ProviderType: 'CodeStarSourceConnection',
                GitConfiguration: {
                    SourceActionName: 'Github',
                    Push: [{
                        Tags: {
                            Includes: ['*.*.*-*']
                        }
                    }]
                }
            }
        ]);
    }
}


class BucketStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        new Bucket(this, 'Bucket', {
            bucketName: props.bucketName,
            blockPublicAccess: {
                blockPublicAcls: true,
                ignorePublicAcls: true,
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
            },
            versioned: true,
            encryption: BucketEncryption.S3_MANAGED,
            lifecycleRules: [{
                enabled: true,
                abortIncompleteMultipartUploadAfter: Duration.days(1),
            }]
        });

    }

}

const isProduction = (env: string) => env === 'production';
const tags = {
    Team: 'DataPlatform',
    ServiceOrganization: 'Platform',
    Classification: 'internal',
    Public: 'false',
}
const region: string = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const deploymentEnvironment = app.node.tryGetContext('deploymentEnvironment');
const account = app.node.tryGetContext('account');
const bucketName = isProduction(deploymentEnvironment) ? 'ecs-watchbot-binaries' : 'ecs-watchbot-binaries-stg';

const pipelineStackName = 'watchbot-pipeline';
new PipelineStack(app, 'Pipeline', {
    stackName: pipelineStackName,
    synthesizer: new CliCredentialsStackSynthesizer({ // TODO give cdk roles codestar-connections:* actions
       fileAssetsBucketName: `cdk-assets-${account}-${region}`,
        bucketPrefix: `ecs-watchbot/${pipelineStackName}`,
       qualifier: 'operator'
    }),
    // synthesizer: new BootstraplessSynthesizer({
    //     cloudFormationExecutionRoleArn: process.env.AWS_CDK_EXEC_ROLE,
    //     deployRoleArn: process.env.AWS_CDK_DEPLOY_ROLE,
    // }),
    env: { account, region },
    tags: {
        ...tags,
        CloudFormationStackName: pipelineStackName,
        Production: isProduction(deploymentEnvironment).toString(),
    },
    deploymentEnvironment: deploymentEnvironment,
    bucketName,
});

const bucketStackName = 'watchbot-bucket';
new BucketStack(app, 'Bucket', {
    stackName: bucketStackName,
    synthesizer: new BootstraplessSynthesizer({
        cloudFormationExecutionRoleArn: process.env.AWS_CDK_EXEC_ROLE,
        deployRoleArn: process.env.AWS_CDK_DEPLOY_ROLE,
    }),
    env: { account, region },
    tags: {
        ...tags,
        CloudFormationStackName: bucketStackName,
        Production: isProduction(deploymentEnvironment).toString(),
    },
    deploymentEnvironment: deploymentEnvironment,
    bucketName,
});

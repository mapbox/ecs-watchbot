## Building a Watchbot template

Watchbot provides a method to build a CloudFormation template:

- **watchbot.template(options)** creates CloudFormation JSON objects for the various Resources that Watchbot needs in order to do its job.

With that tool in hand, creating a Watchbot stack will generally involve:
- determine the appropriate `options` to provide to `watchbot.template` for your situation. See the table below for more details on the various required options, optional ones, and default values.
- write a CloudFormation template that defines the configuration parameters, stack outputs, permissions required by your worker containers, and any additional resources that are required in order to process jobs.
- write a script which merges the two templates, adding Watchbot's resources to your template.
- use [cfn-config](https://github.com/mapbox/cfn-config) to deploy the template by referencing the script that you've written.

As an example, consider a service where the workers are expected to manipulate objects in an S3 bucket. In the CloudFormation template, we wish to create the S3 bucket that our workers will interact with, and then build the Watchbot resources required to perform the task in response to SNS events.

```js
var watchbot = require('@mapbox/watchbot');
var cloudfriend = require('@mapobx/cloudfriend');

// Build the parameters, resources, and outputs that your service needs
var myTemplate = {
  Parameters: {
    GitSha: { Type: 'String' },
    Cluster: { Type: 'String' },
    AlarmEmail: { Type: 'String' }
  },
  Resources: {
    MyBucket: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        Name: 'my-bucket'
      }
    }
  }
};

// Generate Watchbot resources. You can use references to parameters and
// resources that were defined above.
var watch = watchbot.template({
  cluster: { Ref: 'Cluster' },
  service: 'my-repo-name',
  serviceVersion: { Ref: 'GitSha' },
  env: { BucketName: 'my-bucket' },
  maxSize: 5,
  reservation: { memory: 512 },
  notificationEmail: { Ref: 'AlarmEmail' },
  permissions: [
    {
      Effect: 'Allow',
      Action: ['s3:*'],
      Resource: {
        'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'MyBucket' }]]
      }
    }
  ]
});

module.exports = cloudfriend.merge(myTemplate, watch);
```


## Full API Definition

When creating your watchbot stacks with the `watchbot.template()` method, you now have the following options:


 Key | Description | Type | Required | Default
----------|----------------|--------------|------------ |---------
**cluster** | The cluster on which your watchbot service will run. | String/Ref | Yes | -
**service** | The name of your service. This is usually the same as your GitHub repository. It **must** match the name of the ECR repository where your images are stored. | String/Ref | Yes | -
**serviceVersion** | The version of your image to deploy. This should reference a specific image in ECR. | String/Ref | Yes | -
**family** | The name of the task definition family that watchbot will create revisions of. | String/Ref | No | -
**command** | The shell command to be run by the subprocess worker. The working directory for the subprocess is determined in your Dockerfile by the `WORKDIR` missive. | String | Yes | -
**capacity** | If the value is `'EC2'` (the default), Watchbot's ECS service will use the `EC2` launch type. If the value is `FARGATE`, it will use with the `FARGATE` launch type. And if it is `FARGATE_SPOT`, it will use the `FARGATE_SPOT` capacity provider. You can only use `FARGATE_SPOT` on ECS clusters configured to allow the `FARGATE_SPOT` capacity provider. Switching `capacity` values can be disruptive. Switching between `EC2` and `FARGATE`, `EC2` and `FARGATE_SPOT`, or between `FARGATE` and `FARGATE_SPOT` will cause the ECS service to be replaced during the CloudFormation update: a new service will be created, then the old service will be deleted. | `'EC2'|'FARGATE'|'FARGATE_SPOT'`/Ref | No | `'EC2'`
**fargateSecurityGroups** | The IDs of security groups to associate with Fargate Watchbot containers. This option is ignored if `capacity` is `'EC2'`. If you do not specify a security group and use a Fargate capacity type, the default security group for the VPC is used. You can provide no more than 5. See the [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-awsvpcconfiguration.html). | String[]/Ref | No | []
**fargateSubnets** | The IDs of subnets to associate with Fargate Watchbot containers. This option is ignored if `capacity` is `'EC2'`. You can provide no more than 16. See the [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-awsvpcconfiguration.html). | String[]/Ref | No | []
**fargatePublicIp** | Whether the tasks' elastic network interface receives a public IP address. Should be `ENABLED` if `fargateSubnets` are public. See the [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-awsvpcconfiguration.html). | `'ENABLED'|'DISABLED'` | No | `'DISABLED'`
**maxSize** | The maximum number of workers to run for your service. | Number/Ref | Yes | -
**minSize** | The minimum number of workers to run for your service. | Number | No | 0
**writableFilesystem** | Whether you want a new container for every job with a writable filesystem. See below for more details. | Boolean | No | false
**mounts** | If your worker containers need to write files or folders inside its file system, specify those locations with this parameter. A single ephemeral mount point can be specified as `{container location}`, e.g. /mnt/tmp. Separate multiple mount strings with commas if you need to mount more than one location. You can also specify mounts as an arrays of paths. Every mounted volume will be cleaned after each job. By default, the `/tmp` directory is added as an ephemeral mount. | String/Object | No | `/tmp`
**env** | Key-value pairs that will be provided to the worker containers as environment variables. Keys must be strings, and values can either be strings or references to other CloudFormation resources via `{"Ref": "..."}`. | Object | No | `{}`
**prefix** | a prefix that will be applied to the logical names of all the resources Watchbot creates. If you're building a template that includes more than one Watchbot system, you'll need to specify this in order to differentiate the resources. | String/Ref | No | none
**reservation.memory** | The number of MB of RAM to reserve as a hard limit. If your worker container tries to utilize more than this much RAM, it will be shut down. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. If `capacity` is `'FARGATE'` or `'FARGATE_SPOT`', this must be an allowed value for Fargate tasks. | Number/Ref | No | None if `capacity` is `'EC2'`; `512` if it is `'FARGATE'` or `'FARGATE_SPOT`'
**reservation.softMemory** | The number of MB of RAM to reserve as a soft limit. Your worker container will be able to utilize more than this much RAM if it happens to be available on the host. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | Number/Ref | No | none
**reservation.cpu** | The number of CPU units to reserve for your worker container. This will only impact the placement of your container on an EC2 with sufficient CPU capacity, but will not limit your container's utilization. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. If `capacity` is `'FARGATE'` or `'FARGATE_SPOT`', this must be an allowed value for Fargate tasks. | Number/Ref | Yes | `128` if `capacity` is `'EC2'`; `256` if `capacity` is `'FARGATE'` or `'FARGATE_SPOT`'
**privileged** | Give the container elevated privileges on the host container instance. This value is ignored for `capacity` values other than `'EC2'`. | Boolean/Ref | No | false
**writableFileSystem** | Give the container read-only access to the root file system. This value is ignored for `capacity` values other than `'EC2'`. | Boolean/Ref | No | false
**messageRetention** | The number of seconds that a message will exist in SQS until it is deleted. The default value is the maximum time that SQS allows, 14 days. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | Number/Ref | No | 1209600 (14 days)
**maxJobDuration** | The maximum number of seconds that a job is allowed to run. After this time period, the worker will be stopped and the job will be returned to the queue. | Number/Ref | No | No | -
**notificationEmail** | The email to send alarm notifications to | String/Ref | No. Must specify either a `notificationTopic` or `notificationEmail` | -
**notificationTopic** | An SNS topic to send alarms to | String/Ref | No. Must specify either a `notificationTopic` or `notificationEmail` | -
**alarmPeriods** | Use this parameter to control the duration that the SQS queue must be over the message threshold before triggering an alarm. You specify the number of 5-minute periods before an alarm is triggered. The default is 24 periods, or 2 hours. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | String/Ref | No | 24
**alarmThreshold** | Watchbot creates a CloudWatch alarm that will go off when there have been too many messages in SQS for a certain period of time. Use this parameter to adjust the Threshold number of messages to trigger the alarm. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | Number/Ref | No | 40
**errorThreshold** | Watchbot creates a CloudWatch alarm that will fire if there have been more than this number of failed worker invocations in a 60 second period. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | Number/Ref | No | 10
**deadletterThreshold** | Use this parameter to control the number of times a message is delivered to the source queue before being moved to the dead-letter queue. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`. | Number/Ref | No | 10
**deadletterAlarm** | Use this parameter to disable the alarm resource for dead letter queue messages. | Boolean | No | `true`
**dashboard** | Watchbot creates a Cloudwatch Dashboard called `<cloudformation-stack>-<region>`. If running in China, this may need to be disabled | Boolean | No | `true`
**fifo** | Whether you want Watchbot's SQS queue to be first-in-first-out (FIFO). By default, Watchbot creates a standard SQS queue, in which the order of jobs is not guaranteed to match the order of messages. If your program requires more precise ordering and the limitations of a FIFO queue will be acceptable, set this option to `true`. Learn more in ["Using a FIFO queue"](./using-a-fifo-queue.md) | Boolean | No | `false`
**placementConstraints** | ECS service [placement constraints](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-placementconstraint.html). This value is ignored for `capacity` values other than `'EC2'`. | Object[]/Ref | No | false
**placementStrategies** | ECS service [placement strategies](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-service-placementstrategy.html). This value is ignored for `capacity` values other than `'EC2'`. | Object[]/Ref | No | false
**structuredLogging** | Whether to emit logs in JSON format or not | Boolean | No | `false`
**autoscalingRoleArn** | A custom autoscaling role to use instead of building a distinct role for the stack | String/Ref | No | If not provided, an autoscaling role will be built with the permissions described in [Custom Autoscaling Role](#custom-autoscaling-role)

### writableFilesystem mode explained

**Default behavior**

By default, containers are re-used from one job to the next, and file system is set to read-only for most of the filesystem. Workers can only write to the `/tmp` directory or any ephemeral volumes added to the `mounts` property in the cloudformation template. All of the mounts, including `/tmp`, are cleaned after every job completes.

Since containers are only started once during scale up and then left on for long durations, users can expect to see very few failed task placements. Combined with the low overhead of not needing to start containers for every job, watchbot is ideal for workloads that are potentially very short-lived and require high throughput. During initial benchmarks, watchbot was able to achieve a throughput of 50 tasks per second when run at 500 workers for jobs that ran 10 seconds each. There were no signs showing that it would slow down, and seemed to be able to handle as much throughput as you were willing to add workers.

**writableFilesystem mode**

In writableFilesystem mode, the whole file system is writable and containers are stopped after every job. This refreshing of containers allows users to confidently expect their work to run in a brand new container every time, and allows them to write to anywhere on the filesystem. This mode can be guaranteed to be slower than the default mode, due to the overhead of starting a new container after every job.

writableFilesystem mode has no restrictions to the file system: workers can write anywhere and read from anywhere, their files being instantly deleted after the job finishes and the container dies.

### watchbot.template references

After building Watchbot resources using `watchbot.template()`, you may wish to reference some of those resources. The object returned from `watchbot.template()` provides references to a few of its resources through a `.ref` property:

Name | Description
--- | ---
.ref.logGroup | the CloudWatch LogGroup where watcher and worker container's logs are written
.ref.topic | the SNS topic that you can publish messages to in order to have them processed by Watchbot
.ref.queueUrl | the URL of the SQS Queue Watchbot built
.ref.queueArn | the ARN of the SQS Queue Watchbot built
.ref.queueName | the name of the SQS Queue Watchbot built
.ref.notificationTopic | the SNS topic that receives notifications when processing fails
.ref.progressTable | [conditional] if running in reduce-mode, the name of the DynamoDB table that tracks job progress

These properties each return CloudFormation references (i.e. `{ "Ref": "..." }` objects) that can be used in your template. In the above example, if I wanted my stack to output the SNS topic built by Watchbot, I could:

```js
var outputs = {
  Outputs: { SnsTopic: { Value: watcher.ref.topic } }
};

cloudfriend.merge(myTemplate, watcher, outputs);
```

### Custom Autoscaling Role

You can provide a custom autoscaling role for your service. If you do not provide a custom role, a role with the following permissions will be created, which can only be assumed by the `application-autoscaling.amazonaws.com` principal.

```JSON
{
  "Statement": [
    {
      "Action": [
        "application-autoscaling:*",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:PutMetricAlarm",
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "*",
      "Effect": "Allow"
    }
  ]
}
```
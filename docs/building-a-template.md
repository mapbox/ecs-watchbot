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

### watchbot.template options

## Full API Definition

When creating your watchbot stacks with the `watchbot.template()` method, you now have the following options:


- **cluster**
  - The cluster on which your watchbot service will run.
  - Type: String/Ref
  - Required: Yes
- **service**
  - The name of your service. This is usually the same as your GitHub repository. It **must** match the name of the ECR repository where your images are stored.
  - Type: String/Ref
  - Required: Yes
- **serviceVersion**
  - The version of your image to deploy. This should reference a specific image in ECR.
  - Type: String/Ref
  - Required: Yes
- **family**
  - The name of the task definition family that watchbot will create revisions of.
  - Type: String/Ref
  - Required: Yes
- **command**
  - The shell command to be run by the subprocess worker. The working directory for the subprocess is determined in your Dockerfile by the `WORKDIR` missive.
  - Type: String
  - Required: Yes
- **workers**
  - The maximum number of workers to run for your service. Must be a number, not a reference to a number, since one tenth of this number will be used as the scaling adjustment for the scaling policy.
  - Type: Number
  - Required: Yes
- **fresh**
  - Whether you want a fresh container for every job. See below for more details.
  - Type: Boolean
  - Required: No
  - Default: false
- **mounts**
  - If your worker containers need to write files or folders inside its file system, specify those locations with this parameter. A single ephemeral mount point can be specified as `{container location}`, e.g. /mnt/tmp. Separate multiple mount strings with commas if you need to mount more than one location. You can also specify mounts as an arrays of paths. Every mounted volume will be cleaned after each job. By default, the `/tmp` directory is added as an ephemeral mount.
  - Type: String/Object
  - Required: No
  - Default: `'``/tmp``'`
- **env**
  - Key-value pairs that will be provided to the worker containers as environment variables. Keys must be strings, and values can either be strings or references to other CloudFormation resources via `{"Ref": "..."}`.
  - Type: Object
  - Required: No
  - Default: `{}`
- **prefix**
  - a prefix that will be applied to the logical names of all the resources Watchbot creates. If you're building a template that includes more than one Watchbot system, you'll need to specify this in order to differentiate the resources.
  - Type: String/Ref
  - Required: No
  - Default: none
- **reservation**
  - worker container resource reservations
  - Type: Object
  - **reservation.hardMemory**
    - The number of MB of RAM to reserve as a hard limit. If your worker container tries to utilize more than this much RAM, it will be shut down. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
    - Type: Number/Ref
    - Required: No
    - Default: none
  - **reservation.softMemory**
    - The number of MB of RAM to reserve as a soft limit. Your worker container will be able to utilize more than this much RAM if it happens to be available on the host. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
    - Type: Number/Ref
    - Required: No
    - Default: none
  - **reservation.cpu**
    - The number of CPU units to reserve for your worker container. This will only impact the placement of your container on an EC2 with sufficient CPU capacity, but will not limit your container's utilization. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
    - Type: Number/Ref
    - Required: Yes
- **privileged**
  - Give the container elevated privileges on the host container instance
  - Type: Boolean
  - Required: No
  - Default: false
- **messageRetention**
  - The number of seconds that a message will exist in SQS until it is deleted. The default value is the maximum time that SQS allows, 14 days. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
  - Type: Number/Ref
  - Required: No
  - Default: 1209600 (14 days)
- **maxJobDuration**
  - The maximum number of seconds that a job is allowed to run. After this time period, the worker will be stopped and the job will be returned to the queue.
  - Type: Number/Ref
  - Required: No
  - Default: No
- **notificationEmail**
  - The email to send alarm notifications to
  - Type: String/Ref
  - Required: No. Must specify either a `notificationTopic` or `notificationEmail`
- **notificationTopic**
  - An SNS topic to send alarms to
  - Type: String/Ref
  - Required: No. Must specify either a `notificationTopic` or `notificationEmail`
- **alarmPeriods**
  - Use this parameter to control the duration that the SQS queue must be over the message threshold before triggering an alarm. You specify the number of 5-minute periods before an alarm is triggered. The default is 24 periods, or 2 hours. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
  - Type: String/Ref
  - Required: No
  - Default: 24
- **alarmThreshold**
  - Watchbot creates a CloudWatch alarm that will go off when there have been too many messages in SQS for a certain period of time. Use this parameter to adjust the Threshold number of messages to trigger the alarm. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
  - Type: Number/Ref
  - Required: No
  - Default: 40
- **errorThreshold**
  - Watchbot creates a CloudWatch alarm that will fire if there have been more than this number of failed worker invocations in a 60 second period. This parameter can be provided as either a number or a reference, i.e. `{"Ref": "..."}`.
  - Type: Number/Ref
  - Required: No
  - Default: 10

### Fresh Mode Explained

**Default behavior**

By default, containers are re-used from one job to the next, and file system permissions of the workers are very restricted. Workers can only write to the `/tmp` directory or any ephemeral volumes added to the `mounts` property in the cloudformation template. All of the mounts, including `/tmp`, are cleaned after every job completes.

Since containers are only started once during scale up and then left on for long durations, users can expect to see very few failed task placements. Combined with the low overhead of not needing to start containers for every job, watchbot 4 is ideal for workloads that are potentially very short-lived and require high throughput. During initial benchmarks, watchbot 4 was able to achieve a throughput of 50 tasks per second when run at 500 workers for jobs that ran 10 seconds each. There were no signs showing that it would slow down, and seemed to be able to handle as much throughput as you were willing to add workers.

**Fresh mode** 

In fresh mode, containers are stopped after every job. This refreshing of containers allows users to confidently expect their work to run in a fresh container every time, and allow them to write to anywhere on the filesystem. Fresh mode throughput values have not been confirmed yet, but it can be guaranteed to be slower than the default mode, due to the overhead of starting a new container after every job.

Fresh mode has no restrictions to the file system: workers can write anywhere and read from anywhere, their files being instantly deleted after the job finishes and the container dies.

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

module.exports.watchbot.merge(myTemplate, watcher, outputs);
```

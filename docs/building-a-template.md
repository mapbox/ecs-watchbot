## Building a Watchbot template

Watchbot provides two important methods to help you build a CloudFormation template:

- **watchbot.template(options)** creates CloudFormation JSON objects for the various Resources that Watchbot needs in order to do its job.
- **watchbot.merge(...templates)** takes multiple CloudFormation templates and merges them together into a single JSON template.

With those two tools in hand, creating a Watchbot stack will generally involve:
- determine the appropriate `options` to provide to `watchbot.template` for your situation. See the table below for more details on the various required options, optional ones, and default values.
- write a CloudFormation template that defines the configuration parameters, stack outputs, permissions required by your worker containers, and any additional resources that are required in order to process jobs.
- write a script which merges the two templates, adding Watchbot's resources to your template.
- use [cfn-config](https://github.com/mapbox/cfn-config) to deploy the template by referencing the script that you've written.

As an example, consider a service where the workers are expected to manipulate objects in an S3 bucket. In the CloudFormation template, we wish to create the S3 bucket that our workers will interact with, and then build the Watchbot resources required to perform the task in response to SNS events.

```js
var watchbot = require('@mapbox/watchbot');

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
  workers: 5,
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

module.exports = watchbot.merge(myTemplate, watch);
```

### watchbot.template options

Use the following configuration options to adjust the resources that Watchbot will provide. Bold options must be provided.

Name | Default | Description
--- | --- | ---
**cluster** | | the ARN for an ECS cluster
**service** | | the name of the worker service
**serviceVersion** | | the version of the worker service to use
**notificationEmail** | | the email address to receive failure notifications. Should not be provided if notificationTopic exists.
**notificationTopic** | | the ARN of an SNS topic to receive failure notifications. Should not be provided if notificationEmail exists.
alarmOnEachFailure | false | send a notification email each time a worker errors
alarmPeriods | 24 | number of 5-min intervals SQS must be above threshold to alarm
alarmThreshold | 40 | number of jobs in SQS to trigger alarm
command | | overrides a Dockerfile's `CMD`
debugLogs | false | enable verbose watcher logging
env | {} | environment variables to set on worker containers
family | service name | the name of the the task definition family that watchbot will create revisions of
errorThreshold | 10 | number of failed workers to trigger alarm
failedPlacementAlarmPeriods | 1 | number of 1-min intervals for which failed placements exceeds the threshold of 5 in order to alarm
logAggregationFunction | | the ARN of the log collection Lambda function
messageRetention | 1209600 | max seconds a message can remain in SQS
messageTimeout | 600 | max seconds it takes to process a job
mounts | | defines persistent container mount points from host EC2s or ephemeral mount points on the container
permissions | [] | permissions to any AWS resources that the worker will need to perform a task. Be sure to unwrap any `PolicyDocument` objects. The use of `PolicyDocument` here will pass `aws cloudformation validate-template`, but will prevent your stack from being created successfully.
placementConstraints | false | Add any [ECS task placement constraints](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-placement-constraints.html)
prefix | `Watchbot` | a prefix for logical resource names
privileged | false | give the worker container elevated privileges on the host EC2
reduce | false | enable reduce-mode (see below)
readCapacityUnits | 30 | approximate reads per second to progress table in reduce-mode
reservation | {} | specify desired memory/cpu reservations for worker containers
reservation.cpu | | specify a soft CPU limit
reservation.memory | 64 | specify a hard memory limit
reservation.softMemory | | specify a soft memory limit
user | false | create an IAM user with permission to publish
watchbotVersion | installed version | the version of watchbot to use
watchers | 1 | number of watcher containers
webhook | false | create an HTTPS endpoint to accept jobs
webbhookKey | false | require an access token on the webhook endpoint
workers | 1 | number of concurrent worker containers per watcher
writeCapacityUnits | 30 | approximate writes per second to progress table in reduce-mode

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
.ref.webhookEnpoint | [conditional] if requested, the URL for the webhook endpoint
.ref.webhookKey | [conditional] if requested, the access token for making webhook requests
.ref.accessKeyId | [conditional] if requested, an AccessKeyId with permission to publish to Watchbot's SNS topic
.ref.secretAccessKey | [conditional] if requested, a SecretAccessKey with permission to publish to Watchbot's SNS topic
.ref.progressTable | [conditional] if running in reduce-mode, the name of the DynamoDB table that tracks job progress

These properties each return CloudFormation references (i.e. `{ "Ref": "..." }` objects) that can be used in your template. In the above example, if I wanted my stack to output the SNS topic built by Watchbot, I could:

```js
var outputs = {
  Outputs: { SnsTopic: { Value: watcher.ref.topic } }
};

module.exports.watchbot.merge(myTemplate, watcher, outputs);
```

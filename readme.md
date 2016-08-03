[![Build Status](https://travis-ci.org/mapbox/ecs-watchbot.svg?branch=master)](https://travis-ci.org/mapbox/ecs-watchbot)

# watchbot

A library to help run a highly-scalable AWS service that performs data processing tasks in response to external events. You provide the the messages and the logic to process them, while Watchbot handles making sure that your processing task is run at least once for each message. Watchbot is similar in many regards to AWS Lambda, but is more configurable, more focused on data processing, and not subject to several of Lambda's limitations.

## Helpful lingo

- **queue**: [An SQS queue](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/SQSConcepts.html) is a "backlog" of messages for your stack to process that helps to guarantee every message gets processed at least once.
- **message**: A message in the queue represents some job to be processed. Generally, you are responsible for sending messages to your stack by [publishing to Watchbot's SNS topic](http://docs.aws.amazon.com/sns/latest/dg/PublishTopic.html), or optionally by POST to a webhook endpoint (see `WatchbotUseWebhooks` in the parameters section below).
- **task**: A container responsible for processing a single message. You define the work performed by the task through your own ECS image. Watchbot sets environment variables on the container that represent the content of a single message.
- **watcher**: A Watchbot-defined container that polls the queue, spawns tasks to process messages, and tracks results. You specify how many watchers to run, and how many tasks each watcher is responsible for.
- **notifications**: SNS messages that are published if a task fails or is retried. You can subscribe to Watchbot's notification topic in order to receive these notifications (e.g. via email).
- **cluster**: [An ECS cluster](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_clusters.html) of EC2s that are used to run the watcher and task containers that make up your service.
- **template**: [A CloudFormation template](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-whatis-concepts.html#d0e3428) defining the resources Watchbot needs

## What you provide:

- a cluster that Watchbot will run on
- [an IAM role](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) that the [EC2s in the cluster can assume](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
- a docker image representing your task, housed in [an ECR repository](http://docs.aws.amazon.com/AmazonECR/latest/userguide/Repositories.html) and tagged with a git sha or a git tag
- a CloudFormation template defining any configuration Parameters, permissions, and other resources that your service needs in order to perform its processing.

## What Watchbot provides:

- a queue for you to send messages to in order to trigger your tasks to run
- [an AWS access key](http://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html) with permission to send messages to the queue
- [an ECS TaskDefinition](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) for your task, using the image you provide
- watcher container(s) that runs on your cluster and polls the queue, runs your task for each message, removes messages from the queue as tasks complete, and sends notifications if tasks fail or are retried
- a script to help you include the resources Watchbot needs to run in your template

## Task runtime environment

In addition to any environment variables pre-configured for your task via `watchbot.template()` (see below), Watchbot will provide each task with a set of environment variables representing the details of the message which it should process:

Name | Description
--- | ---
Subject | the message's subject
Message | the message's body
MessageId | the message's ID defined by SQS
SentTimestamp | the time the message was sent
ApproximateFirstReceiveTimestamp | the time the message was first received
ApproximateReceiveCount | the number of times the message has been received

The environment will also contain some variables referencing resources that Watchbot created:

Name | Description
--- | ---
WorkTopic | the ARN of the SNS topic that provides messages to SQS
LogGroup | the name of the CloudWatch LogGroup where logs are sent

## Task completion

The exit code from your task determines what the watcher will do with the message that was being processed. Your options are:

Exit code | Description | Outcome
--- | --- | ---
0 | completed successfully | message is removed from the queue without notification
3 | rejected the message | message is removed from the queue and a notification is sent
4 | no-op | message is returned to the queue without notification
other | failure | message is returned to the queue and a notification is sent

## Building a Watchbot template

Watchbot provides two important methods to help you build a CloudFormation template:

- **watchbot.template(options)** creates CloudFormation JSON objects for the various Resources that Watchbot needs in order to do its job.
- **watchbot.merge(...templates)** takes multiple CloudFormation templates and merges them together into a single JSON template.

With those two tools in hand, creating a Watchbot stack will generally involve:
- determine the appropriate `options` to provide to `watchbot.template` for your situation. See the table below for more details on the various required options, optional ones, and default values.
- write a CloudFormation template that defines the configuration parameters, stack outputs, permissions required by your worker containers, and any additional resources that are required in order to process jobs.
- write a script which merges the two templates, adding Watchbot's resources to your template.
- use [cfn-config](https://github.com/mapbox/cfn-config) to deploy the template by referencing the script that you've written.

Here's an example of a minimal script defining a Watchbot stack that can be deployed using cfn-config:

```js
var watchbot = require('watchbot');

// Build your own template
var myTemplate = {
  Parameters: {
    GitSha: { Type: 'String' },
    Cluster: { Type: 'String' },
    ClusterRole: { Type: 'String' },
    AlarmEmail: { Type: 'String' },
  },
  Resources: {
    MyWorkerPolicy: {
      Type: 'AWS::IAM::Policy',
      Description: 'The IAM policy required by your worker',
      Properties: {
        Roles: [{ Ref: 'Cluster' }],
        PolicyName: 'my-worker-policy',
        PolicyDocument: {
          Statement: [{ Effect: 'Allow', Action: ['s3:*'], Resource: 'arn:aws:s3:::my-bucket' }]
        }
      }
    }
  }
};

// Generate watchbot resources. You can use references to Parameters and
// resources from your own template.
var watcher = watchbot.template({
  cluster: { Ref: 'Cluster' },
  clusterRole: { Ref: 'ClusterRole' },
  watchbotVersion: 'v0.0.7',
  service: 'my-repo-name',
  serviceVersion: { Ref: 'GitSha' },
  env: { BucketName: 'my-bucket' },
  workers: 5,
  reservation: { memory: 512 },
  notificationEmail: { Ref: 'AlarmEmail' },
});

module.exports = watchbot.merge(myTemplate, watcher);
```

### watchbot.template options

Use the following configuration options to adjust the resources that Watchbot will provide.

Name | Default | Description
--- | --- | ---
cluster | | the ARN for an ECS cluster
clusterRole | | the name of the cluster's IAM role
service | | the name of the worker service
serviceVersion | | the version of the worker service to use
env | {} | environment variables to set on worker containers
command | undefined | overrides a Dockerfile's `CMD`
watchbotVersion | installed version | the version of watchbot to use
notificationEmail | | the email address to receive failure notifications
prefix | Watchbot | a prefix for logical resource names
user | false | create an IAM user with permission to publish
webhook | false | create an HTTPS endpoint to accept jobs
webbhookKey | false | require an access token on the webhook endpoint
watchers | 1 | number of watcher containers
workers | 1 | number of concurrent worker containers per watcher
backoff | true | retry jobs with exponential backoff
mounts | '' | defines container mount points from host EC2s
reservation | {} | specify desired memory/cpu reservations for worker containers
messageTimeout | 600 | max seconds it takes to process a job
messageRetention | 1209600 | max seconds a message can remain in SQS
alarmThreshold | 40 | number of jobs in SQS to trigger alarm
alarmPeriods | 24 | number of 5-min intervals SQS must be above threshold to alarm

### watchbot.template references

After building Watchbot resources using `watchbot.template()`, you may wish to reference some of those resources. The object returned from `watchbot.template()` provides references to a few of its resources through a `.ref` property:

Name | Description
--- | ---
.ref.logGroup | the CloudWatch LogGroup where watcher and worker container's logs are written
.ref.topic | the SNS topic that you can publish messages to in order to have them processed by Watchbot
.ref.webhookEnpoint | [conditional] if requested, the URL for the webhook endpoint
.ref.webhookKey | [conditional] if requested, the access token for making webhook requests
.ref.accessKeyId | [conditional] if requested, an AccessKeyId with permission to publish to Watchbot's SNS topic
.ref.secretAccessKey | [conditional] if requested, a SecretAccessKey with permission to publish to Watchbot's SNS topic

These properties each return CloudFormation references (i.e. `{"Ref": "..."}` objects) that can be used in your template. In the above example, if I wanted my stack to output the SNS topic built by Watchbot, I could:

```js
var outputs = {
  Outputs: { SnsTopic: { Value: watcher.ref.topic } }
};

module.exports.watchbot.merge(myTemplate, watcher, outputs);
```

## Logging

Each Watchbot stack will write all its logs to a single CloudWatch LogGroup. The [awscli](http://docs.aws.amazon.com/cli/latest/reference/logs/index.html) or [cwlogs](https://github.com/mapbox/cwlogs) are a couple of tools that can be used to view log events in a LogGroup.

If your host EC2s **are not** built from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html), make sure that the `awslogs` driver is enabled on the ecs-agent by setting the following agent configuration:

```
ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"]
```

See [the AWS documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html) for more information.

In order to help isolate and aggregate logs from any single message, watchbot provides a logging helper that will prefix each line with the ID of the message being processed. Use these utilities in your worker scripts to make sure that your logs are consistent and easy to search.

```js
var watchbot = require('watchbot');

// watchbot.log() works just like console.log()
var breakfast = 'eggs and beans';
watchbot.log('This is something that I want logged: ', breakfast);
// [Thu, 28 Jul 2016 00:12:37 GMT] [worker] [e2c045cc-5606-4950-964b-20877900bccb] This is something that I want logged: eggs and beans
```

There is also a CLI tool to accomplish the same task:

```bash
# Perform this global installation in your Dockerfile
$ npm install -g watchbot

# Log a single line instead of using `echo`
$ watchbot-log "This is something that I want logged: eggs and beans"

# Pipe another command's stdio into watchbot-log
$ echo "This is something that I want logged: eggs and beans" | watchbot-log
```

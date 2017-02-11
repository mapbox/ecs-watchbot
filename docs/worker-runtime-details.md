## Worker runtime environment

In addition to any environment variables pre-configured for your worker via `watchbot.template()` (see below), Watchbot will provide each worker with a set of environment variables representing the details of the message which it should process:

Name | Description
--- | ---
Subject | the message's subject
Message | the message's body
MessageId | the message's ID defined by SQS
SentTimestamp | the time the message was sent
ApproximateFirstReceiveTimestamp | the time the message was first attempted
ApproximateReceiveCount | the number of times the message has been attempted

The environment will also contain some variables referencing resources that Watchbot created:

Name | Description
--- | ---
WorkTopic | the ARN of the SNS topic that provides messages to SQS
LogGroup | the name of the CloudWatch LogGroup where logs are sent

**:lock: Encrypting & decrypting environment variables**

The recommended flow for deploying Watchbot stacks is to use [cfn-config(http://github.com/mapbox/cfn-config) which provides a `--kms` option for automatically encrypting CloudFormation parameters marked with `[secure]`. To decrypt at runtime, install [decrypt-kms-env](https://github.com/mapbox/decrypt-kms-env) as a dependency in your Dockerfile and invoke it in your `CMD`. Example:

```Dockerfile
RUN eval $(./node_modules/.bin/decrypt-kms-env) && npm start
```

## Worker completion

The exit code from your worker determines what the watcher will do with the message that was being processed. Your options are:

Exit code | Description | Outcome
--- | --- | ---
0 | completed successfully | message is removed from the queue without notification
3 | rejected the message | message is removed from the queue and a notification is sent
4 | no-op | message is returned to the queue without notification
other | failure | message is returned to the queue and a notification is sent

When a message is returned to the queue, it will be retried. [See the worker retry documentation](./worker-retry-cycle.md) for more info.

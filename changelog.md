### unreleased

- fixes a bug that wouldn't have allowed you to disable exponential backoff
- returns `task.container[n].reason` as `reason` when task finishes, if available
- adds a second SQS queue used for the watcher's internal tracking of CloudWatch task state-change events
- adds ephemeral, or non-persistent, volume compatibility (see [AWS's task data volume documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_data_volumes.html))
- adds mount point object compatibility for cloudfriend operators, and any other operators that use semicolons and commas
- adds a `worker-capacity` script to estimate how many additional worker tasks can be placed in your service's cluster at its current capacity
- adds CloudWatch metrics for worker errors (non-zero exit codes), failed worker container placement, worker duration, watcher concurrency, and message receive counts
- adds an alarm for number of worker errors in 60s, configurable through `watchbot.template(options)` `.errorThreshold`. Defaults to alarms after 10 failures per minute.
- drops polling of DescribeTasks API to learn when workers are completed
- **BREAKING** removes cluster resource polling - workers will try to be placed and fail instead of avoiding placement attempts
- **BREAKING** by default, watchbot no longer sends notification emails each time a worker errors. You can opt-in to this behavior by setting `watchbot.template(options)` `.alarmOnEachFailure: true`.
- **BREAKING** no longer sends notifications on error interacting with SQS. Instead watchbot silently proceeds.
- **BREAKING** watcher log format has changed. Now watcher logs print JSON objects
- **BREAKING** removes `.notifyAfterRetries` option

### 1.4.0

- adds `options.reservation.softMemory` which allows the caller to set up a soft memory reservation on worker tasks

### 1.3.6

- bump watchbot-progress to v1.1.1, handles a bug in checking part status on a completed job

### 1.3.5

- move to @mapbox/watchbot, use MemoryReservation soft limit for the Watcher task

### 1.3.4

- update and switch to namespaced package for `@mapbox/watchbot-progress`

### 1.3.3

- reimplement and fix `NotifyAfterRetries` as a watcher environment variable

### 1.3.2

- fix a bug where `NotifyAfterRetries` was still expected in watcher container environment

### 1.3.1

- adds duration (in seconds) to watcher log output when tasks complete
- fix bug with `NotifyAfterRetries` where the environment variable was set in the watcher container, not the worker.

### 1.3.0

- adds `options.privileged` parameter to watchbot's template

### 1.2.0

- Adds `.ref.queueName` to the output from `watchbot.template()`
- Clarifies watcher log messages conveying outcome when tasks finish

### 1.1.1

- Fixes a bug where task launching could fail due to a `startedBy` name longer than 36 characters

### 1.1.0

- Adds support for us-east-2 (Ohio)

### 1.0.4

- Allows `options.logAggregationFunction` to reference a potentially empty stack parameter

### 1.0.3

- Adds event emitter to signal when cluster instances have been identified
- Adds error emitter to signal when there are no cluster instances
- Adds readCapacityUnits & writeCapacityUnits configurable watchbot.template option params
- Adds error handling for log line >50kb edge case
- Exposes notifyAfterRetry concept to retry jobs before sending alarms
- Adds pagination for describeContainerInstances
- Adds watchbot-progress dependency

### 1.0.2

- Adds support for ap-* regions by adding regional mapping for worker/watcher images assuming ecs-conex is doing your image packaging.

### 1.0.1

- Fix bug where watchbot would not retry running a task if it encountered a RESOURCE:CPU contrainst error.

### 1.0.0

- **Breaking** requires KMS key under the CF export `cloudformation-kms-production` to grant worker tasks permission to decrypt secure environment variables. See README and https://github.com/mapbox/cloudformation-kms, https://github.com/mapbox/decrypt-kms-env.

### 0.0.14

- Fix potential race condition when creating `LogForwarding`

### 0.0.13

- Adds EcsWatchbotVersion to template Metadata

### 0.0.12

- allow `workers` and `backoff` to be a ref
- adds `options.debugLogs` to enable verbose logging
- adds log stream prefix to organize worker/watcher logs better
- fix for worker role in reduce mode

### 0.0.11

- fixes a bug that could produce an invalid template if no memory reservation is specified. New default memory is 64MB
- fixes a bug that limited a watcher to maintaining at most 100 concurrent workers
- adds `reduce` option to `watchbot.template()` for tracking map-reduce operations
- adds example recipes for workers using `reduce` mode
- **Breaking** changes the `startedBy` attribute of worker tasks to the stack's name

### 0.0.10

- fixes a bug where `options.command` would break the watcher
- adds `.ref.queueUrl` and `.ref.queueArn` references to object returned by `watchbot.template()`
- automatically provide workers with permission to publish to watchbot's SNS topic
- adds `watchbot.logStream`, a node.js writable stream for prefixing logs
- **Breaking** changes the name of the SQS queue, making it a bit easier to find in the console
- **Breaking** switch to TaskRole instead of grafting permissions onto a predefined role

### 0.0.9

- fixes a template generation bug for callers that do not use mount points

### 0.0.8

- adds `logAggregationFunction` argument to watchbot.template
- allow caller to set container CMD
- template validation, cleanups, default watchbot version

### 0.0.7

- overhauls template building process, providing scripts that expose Watchbot's resources as JavaScript objects

### 0.0.6

- container logs are sent from Docker to CloudWatch Logs instead of syslog
- a watchbot stack creates its own CloudWatch LogGroup and sends all container logs to it
- on task failure, reads recent container logs from CloudWatch and includes them in notifications
- adds helper functions to run as part of the worker which help generate homogeneous, searchable log output

### 0.0.5

- silences `[status]` log messages unless logLevel is set to `debug`
- improved message body in notifications sent when task fail

### 0.0.4

- logs are sent to syslog instead of to a file assumed to be mounted from the host machine
- new template builder arguments to only include certain resources (e.g. webhooks) if you ask for them

### 0.0.3

- watcher pays attention to cluster resource reservation, avoids polling the queue when the cluster is fully utilized, and retries runTask requests if a request fails due to lack of memory.
- template sets up watcher permissions such that updates to the worker's task definition will not lead to permissions failures in the midst of a deploy

### 0.0.2

- watcher logs include message subject and body
- gracefully return messages to the queue if the ECS API fails to run a task
- handle situations where a single watcher receives the same message twice
- adjust alarm description in CloudFormation template

### 0.0.1

- First sketch of Watchbot on ECS

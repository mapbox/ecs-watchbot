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

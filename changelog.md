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

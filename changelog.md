### 0.0.2

- watcher logs include message subject and body
- gracefully return messages to the queue if the ECS API fails to run a task
- handle situations where a single watcher receives the same message twice
- adjust alarm description in CloudFormation template

### 0.0.1

- First sketch of Watchbot on ECS

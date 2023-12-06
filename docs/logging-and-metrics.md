## Logging

Each Watchbot stack will write all its logs to a single CloudWatch LogGroup. The
[awscli](http://docs.aws.amazon.com/cli/latest/reference/logs/index.html) or
[cwlogs](https://github.com/mapbox/cwlogs) are a couple of tools that can be
used to view log events in a LogGroup.

If your host EC2s **are not** built from [ECS-optimized
AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html),
make sure that the `awslogs` driver is enabled on the ecs-agent by setting the
following agent configuration:

```
ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"]
```

See [the AWS documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html) for more information.

## Custom metrics

Custom metrics are collected under the namespace `Mapbox/ecs-watchbot`. They are
mined via filters on CloudWatch logs, and can help you learn about the state of
your Watchbot stack. Each custom metric is suffixed with your stack's name,
e.g. `-MyWatchbotStack`.

| Metric               | Description                                                                                                            | Statistics                         | 
|----------------------|------------------------------------------------------------------------------------------------------------------------|------------------------------------|
| **WorkerErrors**     | The total number of failed workers per minute. High levels of this error trigger the `WorkerErrors` alarm              | Sum                                | 
| **MessageReceives**  | A metric collected for every received message that indicates how many times the message has been pulled from the queue | Maximum                            |
| **WorkerDuration**   | The amount of time (msec) taken by a worker to run a task                                                              | `Average`, `Minimum` and `Maximum` |
| **ResponseDuration** | The approximate time (msec) taken to service a message: sum of queue waiting time and worker duration                  | `Average`, `Minimum` and `Maximum` |

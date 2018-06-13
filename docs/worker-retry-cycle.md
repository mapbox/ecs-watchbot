## Worker retry cycle

Any single Watchbot message will be attempted up to `deadletterThreshold` times. Each time the message fails it is put back into the queue with an increasing backoff interval before it can be attempted again. These intervals look like:

attempt number | backoff interval (s)
--- | ---
1 | 2
2 | 4
3 | 8
4 | 16
5 | 32
6 | 64
7 | 128
8 | 256
9 | 512
10 | --> dead letter queue

This means that after a failure on the 9th attempt, the message will be invisible for at least 512 seconds before it is retried. Providing an increasing backoff interval with an increasing number of failures helps alleviate load that your processing may be placing on external systems.

The default `deadletterThreshold` is 10. The user can adjust while creating the
watchbot service.

Each time a message fails during processing, it is recorded in [the WorkerErrors or FailedWorkerPlacement metrics](./logging-and-metrics.md#custom-metrics). The [WorkerErrors alarm](./alarms.md#workererrors) will trigger whenever there are more than a configured number of failed attempts per minute. The [FailedWorkerPlacement alarm](./alarms.md#failedworkerplacement) will trigger if there are more than 5 failed placements per minute.

If the 10th attempt to process a message fails, then the message will have been retrying for a minimum of 17 minutes, and at this point it will fall into a dead letter queue.

## The dead letter queue

If a message fails processing deadletter Threshold times, Watchbot will stop attempting it. The message will be dropped into a second SQS queue, called a dead letter queue. When there are **any** messages visible in this queue, Watchbot will trip the [DeadLetter alarm](./alarms.md#deadletter). This helps to give visibility into edge-case messages that may highlight a bug in worker code.

Once a message is in the dead letter queue, it will stay there until it is manually removed, or after 14 days. See [the CLI documentation](./command-line-utilities.md#dead-letter) for instructions for interacting with the dead letter queue.

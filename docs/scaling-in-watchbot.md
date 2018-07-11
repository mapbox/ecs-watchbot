## Scaling

The Watchbot 4 service scales on the SQS metrics ApproximateNumberOfMessagesVisible and ApproximateNumberOfMessagesNotVisible.

### Scale Up / Scale Out

The Scale Up policy is active when the SQS ApproximateNumberOfMessagesVisible metric is greater than zero. Scale up occurs in 10% increments of maxSize with a five minute cooldown between scaling activity. With any maxSize, there is a maximum scale up of 100 tasks and a minimum scale up of 1 task. For example: A stack with a maxSize of 50 will scale up 5 tasks every five minutes while ApproximateNumberOfMessagesVisible is greater than zero. A stack with a maxSize of 4 will scale up 1 task per scaling action, and finally a stack with a maxSize of 2000 will scale up in steps of 100 tasks per action.

### Scale Down / Scale In

The Scale Down policy is active whenever the SQS ApproximateNumberOfMessagesNotVisible metric is equal to zero. When ApproximateNumberOfMessagesNotVisible is zero - the stack will scale the service's desired count to the minSize value.

### Scale Up from Min Size 0

A stack with minSize of zero should expect some delay while the stack stabilizes after scale up. SQS metrics update every five minutes - which can result in task churn until ApproximateNumberOfMessagesNotVisible registers a greater than zero data point and the Scale Down policy becomes inactive.
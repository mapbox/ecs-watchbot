## Command-line utilities

```
> watchbot-dead-letter --help

  USAGE: watchbot-dead-letter <command> [OPTIONS]

  Options:
    -h, --help          show this help message
    -s, --stack-name    the full name of a watchbot stack
    -r, --region        the region of the stack (default us-east-1)
```

### dead-letter

`dead-letter` is an interactive tool for dealing with messages in Watchbot's [dead letter queue](./worker-retry-cycle.md#the-dead-letter-queue).

You must provide both a service region and stack name to execute this command. Note
that your stack will need to expose the cluster ARN in your Watchbot stack `Outputs`
property. Pre-2.0 versions of Watchbot do not expose these outputs.

### Dead letter workflow

First, if your stack contains more than one watchbot system, you will first be prompted to select which one you wish to work with. If your stack contains only one watchbot system, you will proceed straight to the next step.

You'll be asked with action you wish to take. Your choices are:

  - **Triage dead messages individually?**: interact with messages one-by-one
  - **Print out all dead messages?**: This will print the subject and message of every job in the dead letter queue as line-delimited JSON strings
  - **Return all dead messages to the work queue?**: Every message in the dead letter queue is sent back to Watchbot's primary work queue for another attempt. You will be asked to confirm before this will proceed.  
  - **Purge the dead letter queue?**: Deletes every message from the dead letter queue. If messages in the dead letter queue still need to be processed, you will have to send them to Watchbot's primary work queue again manually. You will be asked to confirm before this will proceed.

If you selected individual triage, you'll be presented with a set of options for each message in the dead letter queue.

  - **View this message's recent logs?**: Queries CloudWatch Logs to try and find the most recent 50kb worth of logs related to the message. *Warning:* this can be quite slow.
  - **Return this message to the work queue?**: Sends this message back to Watchbot's primary work queue for reprocessing.
  - **Return this message to the dead letter queue?**: Puts the message back into the dead letter queue to be investigated later.
  - **Delete this message entirely?**: Removes the message from the dead letter queue. If the message still needs to be processed, you will have to send it to Watchbot's primary work queue again manually.
  - **Stop individual triage?**: Stop triaging and exit the CLI.

Once all the messages in the dead letter queue have been either sent back to primary work queue or deleted, the CLI will exit.


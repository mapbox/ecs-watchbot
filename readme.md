# ecs-watchbot

[wip] Container re-use means we don't make any RunTask API calls. We launch a container or set of containers, and they keep processing SQS messages until there are no messages left to process.

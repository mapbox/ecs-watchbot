# Upgrading from Watchbot 3 to Watchbot 4
## Examples:

- https://github.com/mapbox/ecs-conex/pull/130
- https://github.com/mapbox/ecs-telephone/pull/8


## Steps:
- Move the CMD in Dockerfile to the `command` option in the cloudformation template
- Install watchbot’s binary with `wget` in your Dockerfile:

```
# The `<os>` can be `linux`, `macosx`, `windows`, depending on what you're running on your container.
# The `<tag>` is a tag on https://github.com/mapbox/ecs-watchbot/tree/master that is more recent than v4.0.0

    RUN wget https://s3.amazonaws.com/watchbot-binaries/<os>/<tag>/watchbot -O /usr/local/bin/watchbot
    RUN chmod +x /usr/local/bin/watchbot
```


- Change the `workers` parameter to `maxSize`. Note that due to the way we divide the maxSize by ten to determine scaling increments, `maxSize` needs to be a hard-coded number and cannot be a `Fn::Ref` object.
- Decide if you want your service to have a `minSize` other than 0.
- Remove all usage of the deprecated `watchbot-log` library and the `watchbot.log` call in favor of `console.log` for logging. Using `console.log` instead will result in the prefixing behavior that accompanied `watchbot.log`.


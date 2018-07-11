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
- NPM should **not** be used to install watchbot in your Dockerfile, the binary above is compatible with any Node.js version and is the preferred installation method. Include watchbot under `devDependencies` and for any `npm install` use the `--production` flag.
- Change the `workers` parameter to `maxSize`.
- Decide if you want your service to have a `minSize` other than 0.
- Remove all usage of the deprecated `watchbot-log` library and the `watchbot.log` call in favor of `console.log` for logging. Using `console.log` instead will result in the prefixing behavior that accompanied `watchbot.log`.

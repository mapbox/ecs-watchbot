# Watchbot binaries

## What is a watchbot binary?

A watchbot binary contains all the watchbot code and dependencies,  pre-packed using [`zeit/pkg`](https://github.com/zeit/pkg/) and node 18, for the linux, mac OSX, windows and Alpine operating systems.

## Why do we need watchbot binaries?

Starting Watchbot 4, it is now a stand-alone application, and comes pre-packaged with dependencies. Using the binary will mean that you can use watchbot straight out of the box in your Dockerfile.

## How can I use a watchbot binary?

Watchbot binaries are uploaded onto S3 at `s3://watchbot-binaries/<os>/<tag>/watchbot` for Watchbot <= v9 and `s3://ecs-watchbot-binaries/<os>/<tag>/watchbot` starting Watchbot v10. A watchbot binary is available for every tag and release made since v4.0.0, and available for the linux, macosx, alpine and windows operating systems. To use the watchbot binary in your project: 
* Based on the OS and tag you want to use, download it, and install it globally in your Dockerfile.

```
RUN wget https://s3.amazonaws.com/ecs-watchbot-binaries/<os>/<tag>/watchbot -O /usr/local/bin/watchbot
RUN chmod +x /usr/local/bin/watchbot
```
* os: `linux`, `alpine`, `macosx`, `windows`
* tag: Any [watchbot tag](https://github.com/mapbox/ecs-watchbot/releases) starting from and more recent that v4.0.0
  * :rotating_light: For any version <= 9, you need to use `https://s3.amazonaws.com/watchbot-binaries/linux/{VERSION}/watchbot` (note the difference in bucket name)
* A watchbot stack and template generated as part of the above system will then automatically use the above global binary, when the watchbot worker is called. For the complete set of instructions to upgrade your stacks from Watchbot 9 to Watchbot 10, take a look at ["Upgrading to Watchbot 10"](https://github.com/mapbox/ecs-watchbot/blob/master/docs/upgrading-to-watchbot10.md)

## When is a new watchbot binary generated?

A watchbot binary is generated for the Linux, OSX, Windows and Alpine operating systems whenever a new watchbot release is made, i.e. whenever we create a new git tag, on this repository. This binary is then uploaded onto S3 at `s3://ecs-watchbot-binaries/<os>/<tag>/watchbot`. A watchbot binary is available for every tag and release made since v4.0.0

## How is the watchbot binary generated?

We use [AWS CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html) to generate the binaries. Whenever a new "tag" is created on this repository, a CodePipeline build is triggered that generates the binary and uploads it onto S3. The CodePipeline stacks are currently restricted access and maintained by Mapbox.

# Upgrading from Watchbot v9 to Watchbot v10

## Changes to Watchbot CLI Binaries Location
Starting Watchbot v10, the watchbot CLI can be installed from `ecs-watchbot-binaries` bucket.

Update your Dockerfile with the following:
```
RUN wget https://s3.amazonaws.com/ecs-watchbot-binaries/linux/v2/watchbot -O /usr/local/bin/watchbot
RUN chmod +x /usr/local/bin/watchbot
```

## Changes to Infrastructure
Watchbot infrastructure is now created through [CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) and runs exclusively ECS on Fragate. 

1. Install @mapbox/watchbot through npm or yarn in your CDK app
```bash
npm install --save-dev @mapbox/watchbot
```
2. Use the `FargateConstruct` in your stack
```typescript
import * as cdk from 'aws-cdk-lib';
import { FargateWatchbot } from "@mapbox/watchbot";
import { ArnUtility, GithubUtility } from '@mapbox/mapbox-cdk-common';

export class MyStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        // build docker image and upload to ECR. Ensure you are using MapboxDefaultSynthesizer from @mapbox/mapbox-cdk-common when creating this stack
        const asset = new DockerImageAsset(this, 'MyBuildImage', {
            directory: path.join(__dirname, 'my-image')
        });
        
        new FargateWatchbot(this, 'Watchbot', {
            alarms: {
                action: Topic.fromTopicArn(
                    this,
                    'OnCallTopic',
                    ArnUtility.getOncallArn('data-platform')
                ),
            },
            command: ['./run.py'],
            serviceVersion: GithubUtility.getGitsha(),
            image: ContainerImage.fromDockerImageAsset(asset),
            serviceName: "random-service-name",
            deploymentEnvironment: 'staging',
        });
    }
}
```

3. Refer to the TSDoc in the construct itself for API changes.
4. Remove `.artifacts.yml` file.
   1. This is no longer needed as CDK will be bundling your docker image for you instead and pushing it to ECR.

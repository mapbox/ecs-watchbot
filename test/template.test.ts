import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PipelineStack } from '../cdk/PipelineStack';
import { BucketStack } from '../cdk/BucketStack';

describe('Template', () => {
  let stack: Stack;
  let template: Template;

  const dummyStackName = 'dummy-stack';
  const stackProps = {
    stackName: dummyStackName,
    env: { account: '222258372212', region: 'us-east-1' },
    tags: {
      Team: 'DataPlatform',
      ServiceOrganization: 'Platform',
      Classification: 'internal',
      Public: 'false',
      CloudFormationStackName: dummyStackName,
      Production: 'false'
    },
    deploymentEnvironment: 'staging',
    bucketName: 'ecs-watchbot-binaries-stg'
  };

  describe('When creating the pipeline stack', () => {
    beforeEach(() => {
      stack = new PipelineStack(new App(), 'Pipeline', stackProps);
      template = Template.fromStack(stack);
    });

    it('Creates Pipeline to match snapshot', () => {
      expect(template).toMatchSnapshot();
    });
  });

  describe('When creating the bucket stack', () => {
    beforeEach(() => {
      stack = new BucketStack(new App(), 'Bucket', stackProps);
      template = Template.fromStack(stack);
    });

    it('Creates Bucket to match snapshot', () => {
      expect(template).toMatchSnapshot();
    });
  });
});

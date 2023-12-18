import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { isProduction } from './util';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface Props extends StackProps {
  deploymentEnvironment: string;
  bucketName: string;
}

export class BucketStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      enforceSSL: true,
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          enabled: true,
          id: 'AbortIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: Duration.days(1)
        },
        {
          enabled: true,
          id: 'ExpireNonCurrentVersions',
          noncurrentVersionExpiration: Duration.days(1)
        }
      ]
    });

    bucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [
          bucket.arnForObjects('linux/*'),
          bucket.arnForObjects('macosx/*'),
          bucket.arnForObjects('windows/*'),
          bucket.arnForObjects('alpine/*')
        ],
        principals: [new AnyPrincipal()],
        effect: Effect.ALLOW,
        conditions: {
          Bool: {
            'aws:SecureTransport': 'true'
          }
        }
      })
    );

    if (!isProduction(props.deploymentEnvironment)) {
      // delete test versions only
      bucket.addLifecycleRule({
        expiration: Duration.days(14)
      });
    }
  }
}

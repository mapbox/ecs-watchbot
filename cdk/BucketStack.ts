import {Duration, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";

interface Props extends StackProps {
    deploymentEnvironment: string
    bucketName: string
}

export class BucketStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        new Bucket(this, 'Bucket', {
            bucketName: props.bucketName,
            blockPublicAccess: {
                blockPublicAcls: true,
                ignorePublicAcls: true,
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
            },
            versioned: true,
            encryption: BucketEncryption.S3_MANAGED,
            lifecycleRules: [{
                enabled: true,
                abortIncompleteMultipartUploadAfter: Duration.days(1),
            }]
        });

    }

}

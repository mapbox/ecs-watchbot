import {Duration, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {BlockPublicAccess, Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";
import {isProduction} from "./util";

interface Props extends StackProps {
    deploymentEnvironment: string
    bucketName: string
}

export class BucketStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const bucket = new Bucket(this, 'Bucket', {
            bucketName: props.bucketName,
            publicReadAccess: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
            versioned: true,
            encryption: BucketEncryption.S3_MANAGED,
            lifecycleRules: [{
                enabled: true,
                id: 'AbortIncompleteMultipartUploads',
                abortIncompleteMultipartUploadAfter: Duration.days(1),
            }, {
                enabled: true,
                id: 'ExpireNonCurrentVersions',
                noncurrentVersionExpiration: Duration.days(1),
            }]
        });

        if (!isProduction(props.deploymentEnvironment)) { // delete test versions only
            bucket.addLifecycleRule({
                expiration: Duration.days(14)
            });
        }

    }

}

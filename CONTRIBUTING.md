# Contributing

Have a feature request or found a bug in Watchbot processing? Please open an Issue. You're also welcome to propose a fix by submitting a pull request.
A member of the [**@mapbox/data-platform**](https://github.com/orgs/mapbox/teams/data-platform) team will review your PR.

## Publishing a test version
The following steps outlines steps a member from Platform team can execute to publish a new test version 

* Commit your changes to your test branch
* Run `npm run create:prerelease`. This will create a new version of the Watchbot CLI **only**
  * **If this step fails**, follow the manual steps outlined below:
  * Create prerelease tag using `npm version prerelease`
  * Push changes and tags to GitHub by running `git push && git push --tags`
  * Find the gitsha you just pushed by running `git rev-parse HEAD`. You'll need this later.
  * Go to the [staging CodePipeline](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/watchbot-pipeline/view?region=us-east-1) (requires AWS login to `artifacts-stg`)
  * Update the codepipeline GitHub `Source` with your test branch name
  * Click `Release Change` and update the `Source revision override` with your gitsha. You should find it in the dropdown list if you updated the branch name correctly.
* Verify [staging CodePipeline](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/watchbot-pipeline/view?region=us-east-1) ran successfully
* Run `npm run build`. This will build the npm package that provides the CDK construct.
* Publish the new version to npm using `mbx npm publish --tag YOUR_NEW_TEST_TAG`

## Publishing a new version

The following outlines instructions Mapbox team members should follow to publish a new version of watchbot
once a Pull Request has been reviewed and approved.

1. Ensure the PR checklist is complete
2. Merge the PR
3. In your local copy, pull `master` to bring down the merge commit(s).
4. Ensure the correct version is updated in [package.json](package.json) and an entry in the [changelog](changelog.md) is added
5. Run `npm run build`
   1. There should NOT be any versioned introduced by this step
6. Tag the new commit: `git tag v<new version number>`
7. Push the new commit and tags to Github: `git push --tags origin master`
8. Verify the [binaries](/docs/watchbot-binaries.md) have been published using the [AWS CodePipeline console](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/watchbot-pipeline/view?region=us-east-1) (requires AWS login to `artifacts-prod`)
9. Publish the new version to npm using `mbx npm publish --access public`.

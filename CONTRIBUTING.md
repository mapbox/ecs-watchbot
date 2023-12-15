# Contributing

Have a feature request or found a bug in Watchbot processing? Please open an Issue. You're also welcome to propose a fix by submitting a pull request.
A member of the [**@mapbox/data-platform**](https://github.com/orgs/mapbox/teams/data-platform) team will review your PR.

## Publishing a test version
The following steps outlines steps a member from Platform team can execute to publish a new test version 

* Commit your changes to your test branch
* Run `npm run create:prerelease`
  * **If this step fails**, follow the manual steps outlined below:
  * Create prerelease tag using `npm version prerelease`
  * Push changes and tags to GitHub by running `git push && git push --tags`
  * Find the gitsha you just pushed by running `git rev-parse HEAD`. You'll need this later.
  * Go to the [staging CodePipeline](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/watchbot-pipeline/view?region=us-east-1) (requires AWS login to `artifacts-stg`)
  * Update the codepipeline GitHub `Source` with your test branch name
  * Click `Release Change` and update the `Source revision override` with your gitsha. You should find it in the dropdown list if you updated the branch name correctly.
* Verify [staging CodePipeline](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/watchbot-pipeline/view?region=us-east-1) ran successfully
* Publish the new version to npm using `mbx npm publish --tag YOUR_NEW_TEST_TAG`

## Publishing a new version

The following outlines instructions Mapbox team members should follow to publish a new version of watchbot
once a Pull Request has been reviewed and approved.

1. Merge the open PR.
2. In your local copy, pull `master` to bring down the merge commit(s).
3. Manually change the version number in:
  - package.json
  - package-lock.json
  - readme.md
4. Add an entry to the [changelog](./changelog.md) for this new version, if you haven't already.
5. Run `npm run update-jest-snapshots` to update the test snapshots for this new version.
6. Commit these changes.
  - `git add package.json package-lock.json test/`
  - `git commit -m "v<new version number>"
7. Tag the new commit: `git tag v<new version number>`
8. Push the new commit and tags to Github: `git push --tags origin master`
9. Verify the [binaries](./docs/watchbot-binaries.md) have been published using the [AWS CodePipeline console](https://console.aws.amazon.com/codesuite/codepipeline/pipelines) (AWS login required)
10. Publish the new version to npm using `mbx npm publish`.

# Contributing

Have a feature request or found a bug in Watchbot processing? Please open an Issue. You're also welcome to propose a fix by submitting a pull request.
A member of the [**@mapbox/platform**](https://github.com/orgs/mapbox/teams/platform) team will review your PR.

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

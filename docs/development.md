## Development

This guide specifies how to develop Watchbot itself and is not intended for users of Watchbot.

### Tests

```sh
# populate your environment with AWS credentials
npm test
```

### Releasing a version

Ideally you track the release of a new version in an issue with a checklist

- [ ] Merge all PRs intended for the release
- [ ] Verify that the [changelog](../changelog.md) includes all relevant changes under the new version number
- [ ] Determine if the new version is a patch, minor or major version bump after [SEMVER](https://semver.org/)
- [ ] Run `npm version [patch | minor | major]`
  - This will run the tests, bump version, update fixtures, create a commit and tag
- [ ] Push everything to Github `git push origin master && git push --tags`
- [ ] Publish to npm `npm publish`

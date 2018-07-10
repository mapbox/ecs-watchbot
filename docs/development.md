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
- [ ] Determine the new version number `x.y.z` after [SEMVER](https://semver.org/)
- [ ] Verify that the [changelog](../changelog.md) includes all relevant changes under the new version number
- [ ] Manually change the version number in package.json
- [ ] Run `npm install` to change the version number in package-lock.json
- [ ] Run `npm run update-jest-snapshots` to update the test snapshots
- [ ] Run `npm test` to verify that everything still passes
- [ ] Make a new commit `git commit -am "x.z.y"`
- [ ] Make a new tag `git tag -m "x.y.z" x.y.z`
- [ ] Push everything to Github `git push origin master && git push --tags`
- [ ] Publish to npm `npm publish`

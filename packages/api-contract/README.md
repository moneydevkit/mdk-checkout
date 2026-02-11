# @moneydevkit/api-contract

@moneydevkit uses [oRPC](https://orpc.unnoq.com/) for typesafe APIs. This library defines the schemas and contracts our API uses.  Both the client libraries and our api server implementation rely on this contract.

## Releasing a new version

- pnpm version <patch|minor|major>
- git push --follow-tags
- Create new github release triggers publish to npm
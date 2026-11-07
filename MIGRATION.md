# Zod 4 and oRPC compatibility

The API-contract, core, and Next.js packages use Zod 4 and oRPC 1.14.8.

- Applications consuming exported Zod schemas must use Zod 4-compatible types and APIs. Use `error.issues` instead of `error.errors`, and supply key and value schemas to `z.record`.
- Validation failures retain their HTTP status and `details` array, but entries use Zod 4's issue representation. For example, an invalid enum uses `invalid_value` and `values` instead of `invalid_enum_value` and `options`. Union issue structures also differ. Clients inspecting those fields must migrate; clients should not depend on exact validation message wording.
- Form integrations require `@hookform/resolvers` 5.1.0 or later, which supports Zod 4.
- The control WebSocket uses oRPC's stable `RPCHandler` export instead of `experimental_RPCHandler`. Stable transport tests run locally; these tests do not verify a deployed provider endpoint or a real payment.

See the [Zod migration guide](https://zod.dev/v4/changelog), [oRPC WebSocket promotion](https://github.com/middleapi/orpc/releases/tag/v1.7.0), and [resolver release notes](https://github.com/react-hook-form/resolvers/releases/tag/v5.1.0).

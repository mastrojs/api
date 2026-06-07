// deno-lint-ignore-file no-explicit-any
import { getParams, jsonResponse } from "@mastrojs/mastro";
import { Err, type Result } from "@mastrojs/result";

import type { Method } from "./client.ts";
import type { StandardSchemaV1 } from "./standard-schema.ts";

/**
 * Constructs a JSON API route, handling request input validation and JSON serialization.
 * The returned type contains also all route information for the `fetchApi<JsonRoute>` client function.
 *
 * Example usage:
 *
 * ```ts
 * export type SearchPost = typeof POST;
 * export const POST = jsonRoute(
 *   {
 *     method: "POST",
 *     path: "/search",
 *     params: urlPathSchema,
 *     query: object({ q: optional(string) }),
 *     body: bodySchema,
 *   },
 *   async ({ body, params, query }) => {
 *     return Ok({ text: "hello world" });
 *   }
 * );
 * ```
 */
export const jsonRoute = <
  M extends Method,
  P extends Record<string, number | string | undefined>,
  Q extends Record<string, number | string | undefined>,
  R extends object,
  U extends string,
  B = undefined,
>(
  opts: {
    /** HTTP method */
    method: M;
    /** Path as a string literal (the type is used on the client) */
    path: U;
    /** Schema for URL path parameters */
    params?: StandardSchemaV1<unknown, P>;
    /** Schema for URL query parameters */
    query?: StandardSchemaV1<unknown, Q>;
    /** Schema for JSON request body */
    body?: StandardSchemaV1<unknown, B>;
  },
  handler: (
    context: { body: B; params: P; query: Q; req: Request },
  ) => Result<R> | Promise<Result<R>>,
): { [method in M]: JsonRoute<B, M, P, Q, R, U> } => ({
  [opts.method]: async (req: Request) => {
    const url = new URL(req.url);
    const params = getParams(req);

    const paramsRes = await opts.params?.["~standard"].validate(params);
    if (paramsRes?.issues) {
      return response(Err("URL path failed to validate", 401, undefined, paramsRes));
    }

    const query = Object.fromEntries(url.searchParams);
    const queryRes = await opts.query?.["~standard"].validate(query);
    if (queryRes?.issues) {
      return response(Err(`queryParams failed to validate`, 401, undefined, queryRes));
    }

    let body;
    if (opts.body) {
      let data: unknown;
      try {
        data = await req.json();
      } catch (e) {
        return response(Err(e instanceof Error ? e.message : "invalid JSON", 400));
      }
      const result = await opts.body["~standard"].validate(data);
      if (result.issues) {
        return response(Err("Body failed to validate", 400, undefined, result));
      } else {
        body = result.value;
      }
    }

    const res = await handler({ body, params, query, req } as any);

    return response(res);
  },
} as { [method in M]: JsonRoute<B, M, P, Q, R, U> });

/**
 * This is the standard `(req: Request) => Response` type, along with a few phantom types
 * (aka branded types), which we use for type-checking in `fetchApi`.
 */
export type JsonRoute<
  B = any,
  M extends Method = any,
  P = any,
  Q = any,
  R = any,
  U extends string = any,
> = ((req: Request) => Response | Promise<Response>) & {
  __method: M;
  __params: P;
  __path: U;
  __queryParams: Q;
  __reqBody: B;
  __resBody: R;
};

const response = (res: Result<object>): Response =>
  res.ok
    ? jsonResponse(res.val)
    // JSON.stringify({ cause: Error("no") }) gives {"cause":{}} so we're not leaking stack traces:
    : jsonResponse(res, res.statusCode || 500);

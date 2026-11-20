/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_loop from "../agent/loop.js";
import type * as agent_prompt from "../agent/prompt.js";
import type * as crisis from "../crisis.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as integrations_cognee from "../integrations/cognee.js";
import type * as integrations_senso from "../integrations/senso.js";
import type * as integrations_stripe from "../integrations/stripe.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_singlestore from "../lib/singlestore.js";
import type * as myFunctions from "../myFunctions.js";
import type * as receipt from "../receipt.js";
import type * as scoring_scoring from "../scoring/scoring.js";
import type * as sendblue from "../sendblue.js";
import type * as tools_catalog from "../tools/catalog.js";
import type * as tools_context from "../tools/context.js";
import type * as tools_data from "../tools/data.js";
import type * as tools_factcheck from "../tools/factcheck.js";
import type * as tools_memorySync from "../tools/memorySync.js";
import type * as tools_propose from "../tools/propose.js";
import type * as tools_purchase from "../tools/purchase.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/loop": typeof agent_loop;
  "agent/prompt": typeof agent_prompt;
  crisis: typeof crisis;
  http: typeof http;
  inbound: typeof inbound;
  "integrations/cognee": typeof integrations_cognee;
  "integrations/senso": typeof integrations_senso;
  "integrations/stripe": typeof integrations_stripe;
  "lib/audit": typeof lib_audit;
  "lib/singlestore": typeof lib_singlestore;
  myFunctions: typeof myFunctions;
  receipt: typeof receipt;
  "scoring/scoring": typeof scoring_scoring;
  sendblue: typeof sendblue;
  "tools/catalog": typeof tools_catalog;
  "tools/context": typeof tools_context;
  "tools/data": typeof tools_data;
  "tools/factcheck": typeof tools_factcheck;
  "tools/memorySync": typeof tools_memorySync;
  "tools/propose": typeof tools_propose;
  "tools/purchase": typeof tools_purchase;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

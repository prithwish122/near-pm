import type { ComponentType } from "react";
import { Concepts, Introduction, Quickstart } from "./start";
import { CurveModel, CurveShapes, UnitsAndPrecision, WorkedExample } from "./curves";
import { Refunds, Routing, Slippage, SwapLifecycle } from "./trading";
import { ManagingPositions, ProvidingLiquidity, Recycling } from "./making";
import { ContractApi, Deployments, Errors, Events, Intents, Mcp, SolverApi } from "./reference";
import { Security } from "./security";

/** Docs page bodies by slug. Titles, descriptions and order live in lib/docs/nav.ts. */
export const CONTENT: Record<string, ComponentType> = {
  introduction: Introduction,
  quickstart: Quickstart,
  concepts: Concepts,
  "curve-model": CurveModel,
  "worked-example": WorkedExample,
  "curve-shapes": CurveShapes,
  "units-and-precision": UnitsAndPrecision,
  "swap-lifecycle": SwapLifecycle,
  routing: Routing,
  slippage: Slippage,
  refunds: Refunds,
  "providing-liquidity": ProvidingLiquidity,
  recycling: Recycling,
  "managing-positions": ManagingPositions,
  contract: ContractApi,
  events: Events,
  errors: Errors,
  "solver-api": SolverApi,
  mcp: Mcp,
  intents: Intents,
  deployments: Deployments,
  security: Security,
};

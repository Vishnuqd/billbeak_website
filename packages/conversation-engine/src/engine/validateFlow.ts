/**
 * Static flow validation, run once at construction. Catches misconfiguration
 * (dangling edges, missing questions, wrong entry kind) up front rather than
 * mid-conversation.
 */

import type { EngineConfig } from "../types/config.ts";

export function validateFlowConfig(config: EngineConfig): void {
  const { flow, questions } = config;
  const entry = flow.nodes[flow.entry];
  if (entry === undefined) {
    throw new Error(`Flow "${flow.id}": entry node "${flow.entry}" does not exist.`);
  }
  if (entry.kind !== "question") {
    throw new Error(`Flow "${flow.id}": entry node "${flow.entry}" must be a question node.`);
  }

  for (const [nodeId, node] of Object.entries(flow.nodes)) {
    if (node.id !== nodeId) {
      throw new Error(`Flow "${flow.id}": node keyed "${nodeId}" has mismatched id "${node.id}".`);
    }
    if (node.kind === "question") {
      if (questions[node.questionId] === undefined) {
        throw new Error(
          `Flow "${flow.id}": node "${nodeId}" references unknown question "${node.questionId}".`,
        );
      }
      if (node.transitions.length === 0) {
        throw new Error(`Flow "${flow.id}": question node "${nodeId}" has no outgoing transitions.`);
      }
      for (const transition of node.transitions) {
        if (flow.nodes[transition.to] === undefined) {
          throw new Error(
            `Flow "${flow.id}": node "${nodeId}" has a transition to unknown node "${transition.to}".`,
          );
        }
      }
    }
  }
}

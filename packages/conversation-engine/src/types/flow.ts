/**
 * Flow model — a directed graph of nodes.
 *
 * A flow is the JSON-serialisable definition of a journey: which question comes
 * first, and how the answer to each question routes to the next node. Terminal
 * nodes mark completion (with an optional opaque `outcome` label the host app
 * interprets). The engine walks this graph; it never contains journey-specific
 * logic.
 */

import type { Condition } from "./condition.ts";

/** A directed edge. Evaluated in order; first whose `when` passes is taken. */
export interface Transition {
  readonly to: string;
  /** Omitted (or `{op:"always"}`) means the default/fallback edge. */
  readonly when?: Condition;
}

export interface QuestionNode {
  readonly id: string;
  readonly kind: "question";
  /** The question definition to present at this node. */
  readonly questionId: string;
  /** Ordered outgoing edges. A total flow provides a default (unconditional) edge. */
  readonly transitions: readonly Transition[];
}

export interface TerminalNode {
  readonly id: string;
  readonly kind: "terminal";
  /** Opaque completion label (e.g. "qualified", "referred"). Host interprets it. */
  readonly outcome?: string;
}

export type FlowNode = QuestionNode | TerminalNode;

export interface FlowDefinition {
  readonly id: string;
  readonly version: number;
  /** Node id where the conversation begins. Must be a question node. */
  readonly entry: string;
  readonly nodes: Readonly<Record<string, FlowNode>>;
}

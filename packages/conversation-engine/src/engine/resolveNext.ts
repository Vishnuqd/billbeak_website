/**
 * Next-node resolution.
 *
 * Given a question node and the current answers, pick the outgoing edge: the
 * first transition whose condition passes (an absent `when` is an unconditional
 * default). Returns `null` when no edge matches — the engine treats that as a
 * flow-configuration error, which keeps flows honest (a total flow always
 * provides a default edge).
 */

import type { AnswersMap } from "../types/answer.ts";
import type { QuestionNode } from "../types/flow.ts";
import { evaluateCondition } from "../conditions/evaluate.ts";

export function resolveNextNodeId(node: QuestionNode, answers: AnswersMap): string | null {
  for (const transition of node.transitions) {
    if (transition.when === undefined || evaluateCondition(transition.when, answers)) {
      return transition.to;
    }
  }
  return null;
}

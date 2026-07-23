/**
 * Progress calculation over a *branching* graph.
 *
 * A naive answered/total ratio is wrong when branches change the denominator.
 * Instead we project the currently-reachable path: from the current node we
 * follow the edges that match the current answers (falling back to the first
 * edge for not-yet-answered downstream questions) until a terminal, and count
 * the question nodes on the way. The denominator therefore reflects the path the
 * user is actually on, and updates as branches are chosen.
 */

import type { AnswersMap } from "../types/answer.ts";
import type { FlowDefinition, FlowNode } from "../types/flow.ts";
import type { ProgressInfo } from "../types/state.ts";
import { resolveNextNodeId } from "../engine/resolveNext.ts";

/** Count question nodes strictly downstream of `fromNodeId` on the projected path. */
function projectRemaining(flow: FlowDefinition, fromNodeId: string, answers: AnswersMap): number {
  const visited = new Set<string>();
  let count = 0;
  let cursor: string | null = fromNodeId;

  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    const node: FlowNode | undefined = flow.nodes[cursor];
    if (node === undefined || node.kind === "terminal") break;

    // Follow the matching edge; if none matches yet, assume the first edge so we
    // can still estimate a path length for downstream (unanswered) questions.
    let nextId: string | null = resolveNextNodeId(node, answers);
    if (nextId === null) {
      nextId = node.transitions[0]?.to ?? null;
    }
    if (nextId === null) break;

    const nextNode: FlowNode | undefined = flow.nodes[nextId];
    if (nextNode !== undefined && nextNode.kind === "question") {
      count += 1;
    }
    cursor = nextId;
  }
  return count;
}

export function computeProgress(
  flow: FlowDefinition,
  currentNodeId: string,
  history: readonly string[],
  answers: AnswersMap,
): ProgressInfo {
  const answeredCount = history.filter((id) => {
    const node = flow.nodes[id];
    if (node === undefined || node.kind !== "question") return false;
    const answer = answers[node.questionId];
    return answer !== undefined;
  }).length;

  const visited = history.length;
  const remaining = projectRemaining(flow, currentNodeId, answers);
  const projectedTotal = Math.max(visited + remaining, 1);
  const ratio = Math.min(Math.max(answeredCount / projectedTotal, 0), 1);

  return { step: visited, projectedTotal, ratio };
}

import type { GateDecision } from "./types.ts";

type ApprovalDecision = Extract<GateDecision, { outcome: "ask" }>;

function brief(text: string, limit: number): string {
  const singleLine = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  const characters = Array.from(singleLine);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : singleLine;
}

export function formatApprovalPrompt(
  decision: ApprovalDecision,
  toolName: string,
): { title: string; message: string } {
  const unavailable = decision.rule === "Classifier Unavailable";
  const reason = unavailable
    ? "자동 안전 검사를 완료하지 못해 직접 확인이 필요합니다."
    : brief(decision.rationale, 120) || "자동 안전 검사에서 사용자 확인이 필요한 작업으로 판단했습니다.";
  const rule = unavailable ? "안전 검사 실패" : brief(decision.rule, 80) || "사용자 확인 필요";
  const tool = brief(toolName, 60) || "도구";

  return {
    title: "자동 모드 · 승인 필요",
    message: `이유: ${reason}\n규칙: ${rule}\n\n${tool} 실행을 승인할까요?`,
  };
}

import { isDeepStrictEqual } from "node:util"

import type { DocBotUIMessage } from "@/lib/agents/docbot-agent"

export function isValidDocumentApprovalResponse(
  storedMessage: DocBotUIMessage,
  responseMessage: DocBotUIMessage
) {
  if (
    storedMessage.parts.length !== responseMessage.parts.length ||
    !isDeepStrictEqual(
      normalizeMessageMetadata(storedMessage.metadata),
      normalizeMessageMetadata(responseMessage.metadata)
    )
  ) {
    return false
  }

  let approvalCount = 0

  for (let index = 0; index < storedMessage.parts.length; index += 1) {
    const storedPart = storedMessage.parts[index]
    const responsePart = responseMessage.parts[index]

    if (
      storedPart.type === "tool-editClinicalDocument" &&
      storedPart.state === "approval-requested" &&
      responsePart.type === "tool-editClinicalDocument" &&
      responsePart.state === "approval-responded" &&
      storedPart.toolCallId === responsePart.toolCallId &&
      storedPart.approval.id === responsePart.approval.id &&
      !storedPart.approval.isAutomatic
    ) {
      const expectedPart = {
        ...storedPart,
        approval: {
          ...storedPart.approval,
          approved: responsePart.approval.approved,
          ...(responsePart.approval.reason
            ? { reason: responsePart.approval.reason }
            : {}),
        },
        state: "approval-responded",
      }

      if (!isDeepStrictEqual(expectedPart, responsePart)) return false

      approvalCount += 1
      continue
    }

    if (!isDeepStrictEqual(storedPart, responsePart)) return false
  }

  return approvalCount > 0
}

function normalizeMessageMetadata(metadata: unknown) {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    Object.keys(metadata).length === 0
  ) {
    return undefined
  }

  return metadata
}

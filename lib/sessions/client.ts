import type { DocBotUIMessage } from "@/lib/agents/docbot-agent"
import type { DocBotSessionSummary } from "@/lib/sessions/types"

export async function getDocBotSessions({
  archived = false,
  signal,
}: {
  archived?: boolean
  signal?: AbortSignal
} = {}) {
  const response = await fetch(
    archived ? "/api/sessions?view=archived" : "/api/sessions",
    {
      cache: "no-store",
      signal,
    }
  )
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    sessions?: DocBotSessionSummary[]
  }

  if (!response.ok) {
    throw new Error(payload.error || "The session history could not be loaded.")
  }

  if (!Array.isArray(payload.sessions)) {
    throw new Error("The session service returned an invalid response.")
  }

  return payload.sessions
}

export async function getDocBotConversation(
  sessionId: string,
  signal?: AbortSignal
) {
  const response = await fetch(`/api/sessions/${sessionId}/conversation`, {
    cache: "no-store",
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    documentRevisionNumber?: number | null
    error?: string
    messages?: DocBotUIMessage[]
  }

  if (!response.ok) {
    throw new Error(payload.error || "The conversation could not be loaded.")
  }

  if (!Array.isArray(payload.messages)) {
    throw new Error("The conversation service returned an invalid response.")
  }

  return {
    documentRevisionNumber:
      typeof payload.documentRevisionNumber === "number" &&
      Number.isInteger(payload.documentRevisionNumber) &&
      payload.documentRevisionNumber > 0
        ? payload.documentRevisionNumber
        : undefined,
    messages: payload.messages,
  }
}

export async function renameDocBotSession(sessionId: string, title: string) {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    body: JSON.stringify({ action: "rename", title }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    session?: DocBotSessionSummary
  }

  if (!response.ok || !payload.session) {
    throw new Error(payload.error || "The session could not be renamed.")
  }

  return payload.session
}

export async function archiveDocBotSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    body: JSON.stringify({ action: "archive" }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new Error(payload.error || "The session could not be archived.")
  }
}

export async function unarchiveDocBotSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    body: JSON.stringify({ action: "unarchive" }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new Error(payload.error || "The session could not be restored.")
  }
}

export async function deleteDocBotSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new Error(payload.error || "The session could not be deleted.")
  }
}

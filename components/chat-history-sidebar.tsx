"use client"

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useState } from "react"

import { ProfileDropdown } from "@/components/profile-dropdown"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import type { DocBotSessionSummary } from "@/lib/sessions/types"
import type { AuthenticatedUser } from "@/lib/supabase/types"

export function ChatHistorySidebar({
  archivedSessions,
  archivedSessionsError,
  isArchivedSessionsLoading,
  isShowingArchived,
  onBeforeLeave,
  onArchiveSession,
  onDeleteSession,
  onGoHome,
  onRenameSession,
  onRestoreSession,
  onSelectSession,
  onShowArchivedSessions,
  onShowRecentSessions,
  selectedSessionId,
  sessions,
  user,
}: {
  archivedSessions: DocBotSessionSummary[]
  archivedSessionsError?: string
  isArchivedSessionsLoading: boolean
  isShowingArchived: boolean
  onBeforeLeave?: () => Promise<void>
  onArchiveSession: (sessionId: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
  onGoHome: () => void
  onRenameSession: (sessionId: string, title: string) => Promise<void>
  onRestoreSession: (
    sessionId: string,
    options?: { open?: boolean }
  ) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onShowArchivedSessions: () => void
  onShowRecentSessions: () => void
  selectedSessionId?: string
  sessions: DocBotSessionSummary[]
  user: AuthenticatedUser
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  function selectSession(sessionId: string) {
    onSelectSession(sessionId)
    if (isMobile) setOpenMobile(false)
  }

  function restoreSession(sessionId: string, open: boolean) {
    if (open && isMobile) setOpenMobile(false)
    return onRestoreSession(sessionId, { open })
  }

  function goHome() {
    onGoHome()
    if (isMobile) setOpenMobile(false)
  }

  const visibleSessions = isShowingArchived ? archivedSessions : sessions

  return (
    <Sidebar collapsible="offcanvas" side="left">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex h-8 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            {isShowingArchived ? (
              <>
                <Button
                  aria-label="Back to recent chats"
                  onClick={onShowRecentSessions}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeftIcon aria-hidden="true" />
                </Button>
                <span className="truncate">Archived chats</span>
              </>
            ) : (
              <Button
                className="min-w-0 justify-start px-2"
                onClick={goHome}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span className="truncate">DocBot</span>
              </Button>
            )}
          </div>
          <SidebarTrigger className="-mr-1 shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent className="scroll-fade-y py-1">
        <SidebarGroup>
          <SidebarGroupLabel>
            {isShowingArchived ? "Archived sessions" : "Recent sessions"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {isShowingArchived && isArchivedSessionsLoading ? (
              <div
                className="flex items-center gap-2 px-2 py-3 text-xs text-sidebar-foreground/55"
                role="status"
              >
                <Spinner />
                Loading archived chats…
              </div>
            ) : isShowingArchived && archivedSessionsError ? (
              <p className="px-2 py-3 text-xs text-destructive" role="alert">
                {archivedSessionsError}
              </p>
            ) : visibleSessions.length > 0 ? (
              <SidebarMenu>
                {visibleSessions.map((session) => (
                  <ChatHistorySessionRow
                    isArchived={isShowingArchived}
                    isSelected={
                      !isShowingArchived && selectedSessionId === session.id
                    }
                    key={session.id}
                    onArchive={onArchiveSession}
                    onDelete={onDeleteSession}
                    onRename={onRenameSession}
                    onRestore={(sessionId) => restoreSession(sessionId, false)}
                    onSelect={
                      isShowingArchived
                        ? (sessionId) => {
                            void restoreSession(sessionId, true)
                          }
                        : selectSession
                    }
                    session={session}
                  />
                ))}
              </SidebarMenu>
            ) : (
              <p className="px-2 py-3 text-xs text-sidebar-foreground/55">
                {isShowingArchived
                  ? "Archived chats will appear here."
                  : "Processed recordings will appear here."}
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <ProfileDropdown
          isShowingArchived={isShowingArchived}
          onBeforeLeave={onBeforeLeave}
          onToggleArchivedChats={
            isShowingArchived ? onShowRecentSessions : onShowArchivedSessions
          }
          user={user}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

function ChatHistorySessionRow({
  isArchived,
  isSelected,
  onArchive,
  onDelete,
  onRename,
  onRestore,
  onSelect,
  session,
}: {
  isArchived: boolean
  isSelected: boolean
  onArchive: (sessionId: string) => Promise<void>
  onDelete: (sessionId: string) => Promise<void>
  onRename: (sessionId: string, title: string) => Promise<void>
  onRestore: (sessionId: string) => Promise<void>
  onSelect: (sessionId: string) => void
  session: DocBotSessionSummary
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [renameTitle, setRenameTitle] = useState(session.title)
  const [actionError, setActionError] = useState<string>()

  async function renameSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = renameTitle.trim()
    if (!title || title === session.title || isPending) {
      if (title === session.title) setIsRenaming(false)
      return
    }

    setActionError(undefined)
    setIsPending(true)
    try {
      await onRename(session.id, title)
      setIsRenaming(false)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The session could not be renamed."
      )
    } finally {
      setIsPending(false)
    }
  }

  async function archiveSession() {
    if (isPending) return
    setActionError(undefined)
    setIsPending(true)
    try {
      await onArchive(session.id)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The session could not be archived."
      )
      setIsPending(false)
    }
  }

  async function deleteSession() {
    if (isPending) return
    setActionError(undefined)
    setIsPending(true)
    setIsDeleting(true)
    try {
      await onDelete(session.id)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The session could not be deleted."
      )
      setIsConfirmingDelete(false)
      setIsDeleting(false)
      setIsPending(false)
    }
  }

  async function restoreSession() {
    if (isPending) return
    setActionError(undefined)
    setIsPending(true)
    try {
      await onRestore(session.id)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The session could not be restored."
      )
      setIsPending(false)
    }
  }

  if (isRenaming) {
    return (
      <SidebarMenuItem>
        <form
          className="flex min-w-0 items-center gap-1 rounded-md bg-sidebar-accent p-1"
          onSubmit={renameSession}
        >
          <Input
            aria-label={`Rename ${session.title}`}
            autoFocus
            className="h-6 min-w-0 flex-1 text-xs"
            disabled={isPending}
            maxLength={160}
            onChange={(event) => setRenameTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !isPending) {
                setRenameTitle(session.title)
                setIsRenaming(false)
              }
            }}
            value={renameTitle}
          />
          <Button
            className="px-1.5"
            disabled={!renameTitle.trim() || isPending}
            size="xs"
            type="submit"
          >
            Save
          </Button>
          <Button
            className="px-1.5"
            disabled={isPending}
            onClick={() => {
              setRenameTitle(session.title)
              setIsRenaming(false)
              setActionError(undefined)
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </form>
        {actionError ? (
          <p
            className="px-1.5 py-1 text-[0.625rem] text-destructive"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-label={`Open ${session.title}`}
        className="pr-24"
        isActive={isSelected}
        onClick={() => onSelect(session.id)}
        type="button"
      >
        <MessageSquareTextIcon aria-hidden="true" />
        <span>{session.title}</span>
      </SidebarMenuButton>

      <SidebarMenuBadge className="right-7">
        {formatSessionDate(session.lastActivityAt)}
      </SidebarMenuBadge>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              aria-label={`Actions for ${session.title}`}
              disabled={isPending}
              showOnHover
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-28" side="bottom">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setActionError(undefined)
                setRenameTitle(session.title)
                setIsRenaming(true)
              }}
            >
              <PencilIcon aria-hidden="true" />
              Rename
            </DropdownMenuItem>
            {isArchived ? (
              <DropdownMenuItem onClick={() => void restoreSession()}>
                <ArchiveRestoreIcon aria-hidden="true" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void archiveSession()}>
                <ArchiveIcon aria-hidden="true" />
                Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                setActionError(undefined)
                setIsConfirmingDelete(true)
              }}
              variant="destructive"
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {isConfirmingDelete ? (
        <div className="absolute inset-0 flex animate-in items-center gap-1 rounded-md bg-sidebar px-1.5 duration-150 fade-in">
          {isDeleting ? (
            <span
              className="flex w-full items-center justify-center gap-1.5 text-[0.625rem] font-medium"
              role="status"
            >
              <Spinner className="size-3" />
              Deleting…
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-[0.625rem] font-medium">
                Delete this session?
              </span>
              <Button
                className="px-1.5"
                disabled={isPending}
                onClick={() => {
                  setIsConfirmingDelete(false)
                  setActionError(undefined)
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="px-1.5"
                disabled={isPending}
                onClick={() => void deleteSession()}
                size="xs"
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      ) : null}

      {actionError ? (
        <p
          className="px-1.5 py-1 text-[0.625rem] text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
    </SidebarMenuItem>
  )
}

function formatSessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

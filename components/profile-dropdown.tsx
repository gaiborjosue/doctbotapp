"use client"

import {
  ArchiveIcon,
  ChevronUpIcon,
  FileTextIcon,
  HistoryIcon,
  LogOutIcon,
} from "lucide-react"
import { type FormEvent, useRef } from "react"

import { signOut } from "@/app/auth/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { AuthenticatedUser } from "@/lib/supabase/types"

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function ProfileDropdown({
  isShowingArchived,
  onBeforeLeave,
  onOpenTemplates,
  onToggleArchivedChats,
  user,
}: {
  isShowingArchived: boolean
  onBeforeLeave?: () => Promise<void>
  onOpenTemplates: () => void
  onToggleArchivedChats: () => void
  user: AuthenticatedUser
}) {
  const isDelayedSubmitRef = useRef(false)

  function delaySignOut(event: FormEvent<HTMLFormElement>) {
    if (!onBeforeLeave || isDelayedSubmitRef.current) return

    event.preventDefault()
    const form = event.currentTarget
    isDelayedSubmitRef.current = true

    void onBeforeLeave()
      .then(() => form.requestSubmit())
      .catch(() => {
        isDelayedSubmitRef.current = false
      })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="h-12 rounded-lg border border-sidebar-border bg-sidebar-accent/40"
                aria-label="Open account menu"
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground text-[0.625rem] font-semibold text-sidebar">
              {getInitials(user.name) || "DB"}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-medium">
                {user.name}
              </span>
              <span className="block truncate text-[0.625rem] text-muted-foreground">
                {user.email}
              </span>
            </span>
            <ChevronUpIcon className="ml-auto size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-(--anchor-width) min-w-56 rounded-xl p-1.5"
          >
            <div className="px-2 py-2">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-[0.625rem] text-muted-foreground">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenTemplates}>
                <FileTextIcon aria-hidden="true" />
                Document templates
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleArchivedChats}>
                {isShowingArchived ? (
                  <HistoryIcon aria-hidden="true" />
                ) : (
                  <ArchiveIcon aria-hidden="true" />
                )}
                {isShowingArchived ? "Recent chats" : "Archived chats"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <form action={signOut} onSubmit={delaySignOut}>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<button type="submit" className="w-full" />}
                  nativeButton
                  variant="destructive"
                >
                  <LogOutIcon aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

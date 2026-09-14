"use client";

import type { ProjectListItem } from "../chat-contract";

export function sidebarAccountButtonClassName(isAccountUser: boolean): string {
  return `sidebar-account-button${isAccountUser ? "" : " is-guest-login"}`;
}

export function SidebarSkeleton({ rows }: { rows: number }) {
  return (
    <div className="sidebar-skeleton" aria-busy="true" aria-label="Wird geladen">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="sidebar-skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}

export function SidebarChatList({
  chats,
  activeProjectId,
  loadingProjectId,
  onOpen,
  onPrefetch,
  onManage,
}: {
  chats: ProjectListItem[];
  activeProjectId: string | null;
  loadingProjectId: string | null;
  onOpen: (chat: ProjectListItem) => void;
  onPrefetch: (chat: ProjectListItem) => void;
  onManage: (chat: ProjectListItem) => void;
}) {
  if (!chats.length) {
    return <p className="sidebar-section-empty">Keine unzugeordneten Chats</p>;
  }

  return (
    <ul className="project-list">
      {chats.map((chat) => (
        <li key={chat.id} className="sidebar-chat-row">
          <button
            type="button"
            className={`sidebar-chat-open${activeProjectId === chat.id ? " active" : ""}`}
            onClick={() => onOpen(chat)}
            onPointerEnter={() => onPrefetch(chat)}
            onFocus={() => onPrefetch(chat)}
            aria-current={activeProjectId === chat.id ? "page" : undefined}
          >
            <span className="project-title">{chat.title}</span>
            {loadingProjectId === chat.id ? (
              <span className="project-loading" role="status">Wird geladen …</span>
            ) : null}
          </button>
          <button
            className="sidebar-chat-manage"
            type="button"
            onClick={() => onManage(chat)}
            aria-label={`${chat.title} verwalten`}
          >
            •••
          </button>
        </li>
      ))}
    </ul>
  );
}

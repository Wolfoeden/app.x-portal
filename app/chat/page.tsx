import { ChatWorkspace } from "@/components/ChatWorkspace";
import { DesktopOnlyNotice } from "@/components/chat/desktop-only";
import { CHAT_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(CHAT_PAGE);

export default function ChatPage() {
  return (
    <>
      <DesktopOnlyNotice />
      <ChatWorkspace />
    </>
  );
}

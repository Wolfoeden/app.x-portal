import { ChatWorkspace } from "@/components/ChatWorkspace";
import { CHAT_PAGE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(CHAT_PAGE);

export default function ChatPage() {
  return <ChatWorkspace />;
}

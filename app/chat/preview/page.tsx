import { notFound } from "next/navigation";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import {
  previewAnalysis,
  previewAuth,
  previewBrief,
  previewMessages,
  previewProfiles,
  previewProjects,
  previewUsage,
} from "@/components/chat/preview-fixtures";

export const metadata = {
  title: "Chat UI-Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

export default function ChatPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <ChatWorkspace
      previewData={{
        auth: previewAuth,
        projects: previewProjects,
        messages: previewMessages,
        brief: previewBrief,
        profiles: previewProfiles,
        analysis: previewAnalysis,
        usage: previewUsage,
      }}
    />
  );
}

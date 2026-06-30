import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ChatPage() {
  return <ChatClient />;
}

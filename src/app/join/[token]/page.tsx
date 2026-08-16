"use client";

import { useParams } from "next/navigation";
import { JoinInvitationScreen } from "@/components/join/JoinInvitationScreen";
import { isInvitationTokenFormat } from "@/lib/nido/rules";

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const raw = typeof params.token === "string" ? params.token : "";
  let token = raw;
  try {
    token = decodeURIComponent(raw);
  } catch {
    token = raw;
  }

  return <JoinInvitationScreen token={isInvitationTokenFormat(token) ? token : raw} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupWorkspace } from "@/components/GroupWorkspace";
import { getDb } from "@/lib/db";
import { getGroupName, getGroupView } from "@/lib/ledger";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const name = getGroupName(getDb(), id);
  return { title: name ?? "Group" };
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getGroupView(getDb(), id);
  if (!data) notFound();
  return <GroupWorkspace data={data} />;
}

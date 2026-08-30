import { notFound } from "next/navigation";
import { referees } from "@/lib/mock-data";
import { RefereeProfile } from "./RefereeProfile";

export function generateStaticParams() {
  return referees.map((r) => ({ id: r.id }));
}

export default async function RefereeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!referees.some((r) => r.id === id)) notFound();
  return <RefereeProfile id={id} />;
}

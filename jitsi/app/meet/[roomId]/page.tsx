import { MeetingRoom } from "@/components/meeting-room";

type MeetPageProps = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    user?: string | string[];
  }>;
};

function firstParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MeetPage({ params, searchParams }: MeetPageProps) {
  const { roomId } = await params;
  const search = await searchParams;
  const userName = firstParamValue(search.user);

  return <MeetingRoom roomId={decodeURIComponent(roomId)} userName={userName} />;
}

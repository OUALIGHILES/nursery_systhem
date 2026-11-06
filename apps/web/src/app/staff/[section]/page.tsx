import { Suspense } from "react";
import { PortalWorkspace } from "../../../components/portal-workspace";

export default function StaffSectionPage({
  params,
}: PageProps<"/staff/[section]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f7f5]" />}>
      <StaffSection params={params} />
    </Suspense>
  );
}

async function StaffSection({
  params,
}: {
  params: PageProps<"/staff/[section]">["params"];
}) {
  const { section } = await params;
  return <PortalWorkspace portal="staff" section={section} />;
}

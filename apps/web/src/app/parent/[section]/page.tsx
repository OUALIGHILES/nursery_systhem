import { Suspense } from "react";
import { PortalWorkspace } from "../../../components/portal-workspace";

export default function ParentSectionPage({
  params,
}: PageProps<"/parent/[section]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f7f5]" />}>
      <ParentSection params={params} />
    </Suspense>
  );
}

async function ParentSection({
  params,
}: {
  params: PageProps<"/parent/[section]">["params"];
}) {
  const { section } = await params;
  return <PortalWorkspace portal="parent" section={section} />;
}

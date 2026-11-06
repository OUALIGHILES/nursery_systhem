import { Suspense } from "react";
import { PortalWorkspace } from "../../../components/portal-workspace";

export default function AdminSectionPage({
  params,
}: PageProps<"/admin/[section]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f7f5]" />}>
      <AdminSection params={params} />
    </Suspense>
  );
}

async function AdminSection({
  params,
}: {
  params: PageProps<"/admin/[section]">["params"];
}) {
  const { section } = await params;
  return <PortalWorkspace portal="admin" section={section} />;
}

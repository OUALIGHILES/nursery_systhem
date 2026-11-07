import { Suspense } from "react";
import { PortalWorkspace } from "../../../components/portal-workspace";

export default function TeacherSectionPage({
  params,
}: PageProps<"/teacher/[section]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f7f5]" />}>
      <TeacherSection params={params} />
    </Suspense>
  );
}

async function TeacherSection({
  params,
}: {
  params: PageProps<"/teacher/[section]">["params"];
}) {
  const { section } = await params;
  return <PortalWorkspace portal="teacher" section={section} />;
}

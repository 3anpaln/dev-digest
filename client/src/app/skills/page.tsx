import { Suspense } from "react";
import { SkillsLibrary } from "./_components/SkillsLibrary";

export default function SkillsPage() {
  return <Suspense fallback={<p role="status">Loading skills…</p>}><SkillsLibrary /></Suspense>;
}

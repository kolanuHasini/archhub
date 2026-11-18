import type { Metadata } from "next";
import View3D from "@/components/view3d/View3D";

export const metadata: Metadata = {
  title: "3D view",
  description:
    "See your building in 3D, raised from its floor plans. Orbit the exterior or walk through the interior.",
};

export default function View3DPage() {
  return <View3D />;
}

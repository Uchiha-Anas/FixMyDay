import type { Metadata } from "next";
import View from "./view";

export const metadata: Metadata = { title: "Calendar" };

// The UI renders only after user data loads on the client (see DataGate), so
// there is no server-rendered shell for instant-navigation validation to check.
export const instant = false;

export default function Page() {
  return <View />;
}

import type { Metadata } from "next";
import { PeopleWorkspace } from "@/components/PeopleWorkspace";
import { getDb } from "@/lib/db";
import { getPeople } from "@/lib/ledger";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return <PeopleWorkspace people={getPeople(getDb())} />;
}

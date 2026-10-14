"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Groups", match: (path: string) => path === "/" || path.startsWith("/groups") },
  { href: "/people", label: "People", match: (path: string) => path.startsWith("/people") },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="side-nav" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={link.match(path) ? "side-link active" : "side-link"}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

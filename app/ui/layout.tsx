import type { Handle, RemixNode } from "remix/ui";

import { routes } from "@/routes";
import { Document } from "@/ui/document";

export interface LayoutProps {
  children?: RemixNode;
  title?: string;
}

export function Layout(handle: Handle<LayoutProps>) {
  return () => (
    <Document title={handle.props.title}>
      <header>
        <nav>
          <a href={routes.home.href()}>Home</a>{" "}
          <a href={routes.debug.href()}>Debug</a>{" "}
          <a href={routes.auth.href()}>Auth</a>
        </nav>
      </header>
      <main>{handle.props.children}</main>
    </Document>
  );
}

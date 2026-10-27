import Link from "next/link";
import type { UserOrganization } from "./service";
import { workspacePath } from "./validation";

export function WorkspaceSwitcher({ organizations, currentId }: { organizations: UserOrganization[]; currentId: string }) {
  return (
    <details className="relative w-full sm:w-72">
      <summary className="min-h-12 cursor-pointer rounded border border-control bg-white px-4 py-3 text-sm font-medium">
        Switch workspace
      </summary>
      <nav aria-label="Switch workspace" className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-md border border-line bg-white py-2 shadow-sm">
        {organizations.map((organization) => (
          <Link key={organization.id} href={workspacePath(organization.id)}
            aria-current={organization.id === currentId ? "page" : undefined}
            className="block break-words px-4 py-3 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-semibold">
            {organization.name}<span className="mt-1 block text-xs font-normal text-muted">{organization.role}</span>
          </Link>
        ))}
        <Link href="/organizations/new" className="block border-t border-line px-4 py-3 text-sm font-medium text-forest hover:bg-surface">Create workspace</Link>
      </nav>
    </details>
  );
}

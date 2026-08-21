import type { ReactNode } from "react";

interface MasterSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MasterSection({
  title,
  description,
  action,
  children,
  className,
}: MasterSectionProps) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-background ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="shrink-0">
            {action}
          </div>
        )}
      </div>

      <div className="p-6">
        {children}
      </div>
    </section>
  );
}
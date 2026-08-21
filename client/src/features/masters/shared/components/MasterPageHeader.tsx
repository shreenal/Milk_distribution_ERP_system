import type { ReactNode } from "react";

interface MasterPageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function MasterPageHeader({
  title,
  description,
  action,
}: MasterPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">
          {title}
        </h1>

        {description && (
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}
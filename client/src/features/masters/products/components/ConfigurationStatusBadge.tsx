import { AlertCircle, CheckCircle2, Clock } from "lucide-react";

import type {
  ProductConfiguration,
  ConfigurationStatus,
} from "../types/products.types";

interface ConfigurationStatusBadgeProps {
  configuration: ProductConfiguration;
  showDetails?: boolean;
}

const statusConfig: Record<
  ConfigurationStatus,
  {
    bg: string;
    text: string;
    icon: typeof CheckCircle2;
    label: string;
    description: string;
  }
> = {
  READY: {
    bg: "bg-green-100",
    text: "text-green-800",
    icon: CheckCircle2,
    label: "Configured",
    description: "Product is ready for use",
  },

  PARTIAL: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    icon: Clock,
    label: "Incomplete",
    description: "Missing some configuration",
  },

  UNCONFIGURED: {
    bg: "bg-red-100",
    text: "text-red-800",
    icon: AlertCircle,
    label: "Not Configured",
    description: "Configuration needed",
  },
};

export function ConfigurationStatusBadge({
  configuration,
  showDetails = false,
}: ConfigurationStatusBadgeProps) {
  const status = configuration.configurationStatus;

  const config = statusConfig[status.status];
  const Icon = config.icon;

  return (
    <div className="space-y-1">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.text}`}
      >
        <Icon className="size-4" />
        {config.label}
      </div>

      {showDetails && status.issues.length > 0 && (
        <div className="mt-2 space-y-1 border-l-2 border-current pl-2 text-xs text-muted-foreground">
          {status.issues.map((issue: string, index: number) => (
            <p key={index}>{issue}</p>
          ))}
        </div>
      )}
    </div>
  );
}
import { Search } from "lucide-react";

import { Input } from "@/shared/components/ui/input";

interface MasterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MasterSearch({
  value,
  onChange,
  placeholder = "Search...",
  className = "max-w-sm",
}: MasterSearchProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
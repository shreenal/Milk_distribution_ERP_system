import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";

interface MasterDataSelectorProps<T> {
    label: string;
    placeholder: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    options: T[];
    isLoading: boolean;
    error?: string;
    required?: boolean;
    getOptionLabel: (option: T) => string;
    getOptionValue: (option: T) => number;
}

export function MasterDataSelector<T>({
    label,
    placeholder,
    value,
    onChange,
    options,
    isLoading,
    error,
    required = false,
    getOptionLabel,
    getOptionValue,
}: MasterDataSelectorProps<T>) {
    const valueStr = value?.toString() ?? "";

    return (
        <div className="space-y-2">
            <Label>
                {label}
                {required && (
                    <span className="text-destructive"> *</span>
                )}
            </Label>

            <Select
                value={valueStr}
                onValueChange={(value) =>
                    onChange(value ? Number(value) : undefined)
                }
                disabled={isLoading}
            >
                <SelectTrigger
                    className={error ? "border-destructive" : ""}
                >
                    <SelectValue
                        placeholder={
                            isLoading ? "Loading..." : placeholder
                        }
                    />
                </SelectTrigger>

                <SelectContent>
                    {options.map((option) => (
                        <SelectItem
                            key={getOptionValue(option)}
                            value={getOptionValue(option).toString()}
                        >
                            {getOptionLabel(option)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {error && (
                <p className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
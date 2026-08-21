import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";

import { useBrands } from "../../brands/queries/useBrands";
import { useProductGroups } from "../../product-groups/queries/useProductGroups";
import { useProductTypes } from "../../product-types/queries/useProductTypes";
import { usePackagingTypes } from "../../packaging-types/queries/usePackagingTypes";

interface MasterDataSelectorProps<T> {
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (value: number) => void;
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
        onValueChange={(v) => onChange(Number(v))}
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

export function BrandSelector({
  value,
  onChange,
  required = true,
  error,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  required?: boolean;
  error?: string;
}) {
  const {
    data: brands = [],
    isLoading,
    isError,
  } = useBrands();

  return (
    <MasterDataSelector
      label="Brand"
      placeholder="Select a brand"
      value={value}
      onChange={onChange}
      options={brands}
      isLoading={isLoading}
      error={
        error ??
        (isError ? "Failed to load brands." : undefined)
      }
      required={required}
      getOptionLabel={(brand) => brand.name}
      getOptionValue={(brand) => brand.id}
    />
  );
}

export function ProductGroupSelector({
  value,
  onChange,
  required = true,
  error,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  required?: boolean;
  error?: string;
}) {
  const {
    data: productGroups = [],
    isLoading,
    isError,
  } = useProductGroups();

  return (
    <MasterDataSelector
      label="Product Group"
      placeholder="Select product group"
      value={value}
      onChange={onChange}
      options={productGroups}
      isLoading={isLoading}
      error={
        error ??
        (isError
          ? "Failed to load product groups."
          : undefined)
      }
      required={required}
      getOptionLabel={(group) =>
        `${group.name} (${group.category})`
      }
      getOptionValue={(group) => group.id}
    />
  );
}

export function ProductTypeSelector({
  value,
  onChange,
  required = false,
  error,
  brandId,
}: {
  value: number | undefined | null;
  onChange: (value: number | null) => void;
  required?: boolean;
  error?: string;
  brandId?: number;
}) {
  const {
    data: productTypes = [],
    isLoading,
    isError,
  } = useProductTypes();

  const filteredProductTypes = brandId
    ? productTypes.filter(
        (productType) =>
          productType.brand_id === brandId,
      )
    : [];

  return (
    <MasterDataSelector
      label="Product Type"
      placeholder={
        brandId
          ? "Select product type (optional)"
          : "Select a brand first"
      }
      value={value ?? undefined}
      onChange={(v) => onChange(v || null)}
      options={filteredProductTypes}
      isLoading={isLoading}
      error={
        error ??
        (isError
          ? "Failed to load product types."
          : undefined)
      }
      required={required}
      getOptionLabel={(productType) =>
        productType.name
      }
      getOptionValue={(productType) =>
        productType.id
      }
    />
  );
}

export function PackagingTypeSelector({
  value,
  onChange,
  required = false,
  error,
}: {
  value: number | undefined | null;
  onChange: (value: number | null) => void;
  required?: boolean;
  error?: string;
}) {
  const {
    data: packagingTypes = [],
    isLoading,
    isError,
  } = usePackagingTypes();

  return (
    <MasterDataSelector
      label="Packaging Type"
      placeholder="Select packaging type (optional)"
      value={value ?? undefined}
      onChange={(v) => onChange(v || null)}
      options={packagingTypes}
      isLoading={isLoading}
      error={
        error ??
        (isError
          ? "Failed to load packaging types."
          : undefined)
      }
      required={required}
      getOptionLabel={(packagingType) =>
        packagingType.name
      }
      getOptionValue={(packagingType) =>
        packagingType.id
      }
    />
  );
}
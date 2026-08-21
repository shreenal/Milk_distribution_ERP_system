import { Fragment, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

import type {
  ProductTrayRule,
  TrayType,
} from "../types/trays.types";

import { useCreateTrayRule } from "../mutations/useCreateTrayRule";
import { useUpdateTrayRule } from "../mutations/useUpdateTrayRule";
import { useDeleteTrayRule } from "../mutations/useDeleteTrayRule";
import type { Brand } from "../../brands/types/brands.types";
import type { ProductGroup } from "../../product-groups/types/product-groups.types";
import type { ProductType } from "../../product-types/types/product-types.types";
import type { PackagingType } from "../../packaging-types/types/packaging-types.types";
import { MasterTable, MasterSection, MasterTableActions, MasterTableCell, MasterTableRow } from "../../shared/components";

interface TrayProductRulesSectionProps {
  tray: TrayType;
  trayRules: ProductTrayRule[];

  brands: Brand[];
  productGroups: ProductGroup[];
  productTypes: ProductType[];
  packagingTypes: PackagingType[];

  onClose: () => void;
}

export function TrayProductRulesSection({
  tray,
  trayRules,
  brands,
  productGroups,
  productTypes,
  packagingTypes,
  onClose,
}: TrayProductRulesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRuleId, setEditingRuleId] =
    useState<number | null>(null);

  const [brandId, setBrandId] =
    useState<number | null>(null);

  const [productGroupId, setProductGroupId] =
    useState<number | null>(null);

  const [productTypeId, setProductTypeId] =
    useState<number | null>(null);

  const [packagingTypeId, setPackagingTypeId] =
    useState<number | null>(null);

  const [appliesToPackaging, setAppliesToPackaging] =
    useState(true);

  const createTrayRule = useCreateTrayRule();
  const updateTrayRule = useUpdateTrayRule();
  const deleteTrayRule = useDeleteTrayRule();

  const filteredProductTypes = useMemo(() => {
    if (brandId === null) {
      return [];
    }

    return productTypes.filter(
      (productType) => productType.brand_id === brandId,
    );
  }, [productTypes, brandId]);

  const handleBrandChange = (value: string | null) => {
    if (value === null || value === "any") {
      setBrandId(null);
      setProductTypeId(null);
      return;
    }

    const nextBrandId = Number(value);

    setBrandId(nextBrandId);
    setProductTypeId(null);
  };

  const rulesForTray = useMemo(
    () =>
      trayRules.filter(
        (rule) => rule.tray_type_id === tray.id,
      ),
    [trayRules, tray.id],
  );

  const activeRules = rulesForTray.filter(
    (rule) => rule.is_active,
  );

  const resetForm = () => {
    setBrandId(null);
    setProductGroupId(null);
    setProductTypeId(null);
    setPackagingTypeId(null);
    setAppliesToPackaging(true);
    setIsAdding(false);
    setEditingRuleId(null);
  };

  const handleClose = () => {
    if (
      createTrayRule.isPending ||
      updateTrayRule.isPending ||
      deleteTrayRule.isPending
    ) {
      return;
    }

    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    await createTrayRule.mutateAsync({
      tray_type_id: tray.id,
      brand_id: brandId ?? undefined,
      product_group_id:
        productGroupId ?? undefined,
      product_type_id:
        productTypeId ?? undefined,
      packaging_type_id:
        packagingTypeId ?? undefined,
      applies_to_packaging: appliesToPackaging,
      is_active: true,
    });

    resetForm();
  };

  const handleEdit = (rule: ProductTrayRule) => {
    setEditingRuleId(rule.id);
    setBrandId(rule.brand_id);
    setProductGroupId(rule.product_group_id);
    setProductTypeId(rule.product_type_id);
    setPackagingTypeId(rule.packaging_type_id);
    setAppliesToPackaging(rule.applies_to_packaging);
    setIsAdding(false);
  };

  const handleUpdate = async () => {
    if (editingRuleId === null) {
      return;
    }

    await updateTrayRule.mutateAsync({
      id: editingRuleId,
      data: {
        brand_id: brandId ?? undefined,
        product_group_id:
          productGroupId ?? undefined,
        product_type_id:
          productTypeId ?? undefined,
        packaging_type_id:
          packagingTypeId ?? undefined,
        applies_to_packaging: appliesToPackaging,
      },
    });

    resetForm();
  };

  const handleToggleActive = async (
    rule: ProductTrayRule,
  ) => {
    await updateTrayRule.mutateAsync({
      id: rule.id,
      data: {
        is_active: !rule.is_active,
      },
    });
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this tray rule?",
      )
    ) {
      return;
    }

    await deleteTrayRule.mutateAsync(id);
  };

  const isPending =
    createTrayRule.isPending ||
    updateTrayRule.isPending ||
    deleteTrayRule.isPending;

  const getBrandName = (id: number | null) =>
    id === null
      ? "Any"
      : brands.find((brand) => brand.id === id)?.name ??
      "Unknown";

  const getProductGroupName = (id: number | null) =>
    id === null
      ? "Any"
      : productGroups.find(
        (group) => group.id === id,
      )?.name ?? "Unknown";

  const getProductTypeName = (id: number | null) =>
    id === null
      ? "Any"
      : productTypes.find(
        (productType) => productType.id === id,
      )?.name ?? "Unknown";

  const getPackagingTypeName = (id: number | null) =>
    id === null
      ? "Any"
      : packagingTypes.find(
        (packagingType) => packagingType.id === id,
      )?.name ?? "Unknown";

  return (
    <MasterSection
      title="Configure Tray"
      description={`${tray.master_brand.name} · ${tray.color}${tray.description ? ` · ${tray.description}` : ""
        }`}
      action={
        !isAdding && editingRuleId === null ? (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-2 size-4" />
            Add Rule
          </Button>
        ) : undefined
      }
    >

      {(isAdding || editingRuleId !== null) && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="font-medium">
                {editingRuleId !== null
                  ? "Edit Product Rule"
                  : "Add Product Rule"}
              </h4>

              <p className="text-xs text-muted-foreground">
                Leave a field as "Any" when the rule should
                apply broadly.
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={resetForm}
              disabled={isPending}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Brand
              </label>

              <Select
                value={brandId?.toString() ?? "any"}
                onValueChange={handleBrandChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any brand" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="any">
                    Any
                  </SelectItem>

                  {brands.map((brand) => (
                    <SelectItem
                      key={brand.id}
                      value={brand.id.toString()}
                    >
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Product Group
              </label>

              <Select
                value={productGroupId?.toString() ?? "any"}
                onValueChange={(value) =>
                  setProductGroupId(
                    value === "any" ? null : Number(value),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any product group" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="any">
                    Any
                  </SelectItem>

                  {productGroups.map((group) => (
                    <SelectItem
                      key={group.id}
                      value={group.id.toString()}
                    >
                      {group.name} ({group.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Product Type
              </label>

              <Select
                value={productTypeId?.toString() ?? "any"}
                onValueChange={(value) =>
                  setProductTypeId(
                    value === "any" ? null : Number(value),
                  )
                }
                disabled={brandId === null}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      brandId === null
                        ? "Select a brand first"
                        : "Any product type"
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="any">
                    Any
                  </SelectItem>

                  {filteredProductTypes.map((productType) => (
                    <SelectItem
                      key={productType.id}
                      value={productType.id.toString()}
                    >
                      {productType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Packaging Type
              </label>

              <Select
                value={packagingTypeId?.toString() ?? "any"}
                onValueChange={(value) =>
                  setPackagingTypeId(
                    value === "any" ? null : Number(value),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any packaging type" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="any">
                    Any
                  </SelectItem>

                  {packagingTypes.map((packagingType) => (
                    <SelectItem
                      key={packagingType.id}
                      value={packagingType.id.toString()}
                    >
                      {packagingType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={appliesToPackaging}
              onChange={(event) =>
                setAppliesToPackaging(
                  event.target.checked,
                )
              }
            />

            Applies to packaging configuration
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isPending}
            >
              Cancel
            </Button>

            <Button
              onClick={
                editingRuleId !== null
                  ? handleUpdate
                  : handleCreate
              }
              disabled={isPending}
            >
              {isPending
                ? "Saving..."
                : editingRuleId !== null
                  ? "Update Rule"
                  : "Add Rule"}
            </Button>
          </div>
        </div>
      )}

      <MasterTable
        headers={[
          {
            label: "Brand",
          },
          {
            label: "Product Group",
          },
          {
            label: "Product Type",
          },
          {
            label: "Packaging",
          },
          {
            label: "Packaging Scope",
          },
          {
            label: "Status",
            align: "center",
          },
          {
            label: "Actions",
            align: "center",
            className: "w-[140px]",
          },
        ]}
        empty={rulesForTray.length === 0}
        emptyMessage="No tray rules configured."
      >
        {rulesForTray.map((rule) => (
          <Fragment key={rule.id}>
            <MasterTableRow>
              <MasterTableCell>
                {getBrandName(rule.brand_id)}
              </MasterTableCell>

              <MasterTableCell>
                {getProductGroupName(rule.product_group_id)}
              </MasterTableCell>

              <MasterTableCell>
                {getProductTypeName(rule.product_type_id)}
              </MasterTableCell>

              <MasterTableCell>
                {getPackagingTypeName(rule.packaging_type_id)}
              </MasterTableCell>

              <MasterTableCell>
                {rule.applies_to_packaging
                  ? "Packaging"
                  : "General"}
              </MasterTableCell>

              <MasterTableCell align="center">
                <Badge
                  variant={
                    rule.is_active
                      ? "default"
                      : "secondary"
                  }
                >
                  {rule.is_active ? "Active" : "Inactive"}
                </Badge>
              </MasterTableCell>

              <MasterTableActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit rule"
                  onClick={() => handleEdit(rule)}
                  disabled={editingRuleId !== null}
                >
                  <Pencil className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleActive(rule)}
                  disabled={isPending}
                >
                  {rule.is_active
                    ? "Deactivate"
                    : "Activate"}
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete rule"
                  onClick={() => handleDelete(rule.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </MasterTableActions>
            </MasterTableRow>

            {editingRuleId === rule.id && (
              <MasterTableRow>
                <MasterTableCell
                  colSpan={7}
                  className="bg-muted/20"
                >
                  <MasterTableActions>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit rule"
                      onClick={() => handleEdit(rule)}
                      disabled={editingRuleId !== null}
                    >
                      <Pencil className="size-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={
                        rule.is_active
                          ? "Deactivate rule"
                          : "Activate rule"
                      }
                      onClick={() => handleToggleActive(rule)}
                      disabled={isPending}
                    >
                      {/* use an appropriate icon here */}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete rule"
                      onClick={() => handleDelete(rule.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </MasterTableActions>
                </MasterTableCell>
              </MasterTableRow>
            )}
          </Fragment>
        ))}
      </MasterTable>

      <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
        <span>
          {activeRules.length} active{" "}
          {activeRules.length === 1
            ? "rule"
            : "rules"}
        </span>

        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isPending}
        >
          Close
        </Button>
      </div>
    </MasterSection>
  );
}
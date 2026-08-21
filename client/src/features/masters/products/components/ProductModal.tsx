import { useEffect } from "react";
import {
  Controller,
  useForm,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useProductById } from "../queries/useProducts";
import { useCreateProduct } from "../mutations/useCreateProduct";
import { useUpdateProduct } from "../mutations/useUpdateProduct";
import { MasterDataSelector } from "../../shared/components/MasterDataSelector";
import { useBrandsActive } from "../../brands/queries/useBrands";
import { useProductGroups } from "../../product-groups/queries/useProductGroups";
import { useProductTypes } from "../../product-types/queries/useProductTypes";
import { usePackagingTypes } from "../../packaging-types/queries/usePackagingTypes";
import { createProductSchema } from "../schema/products.schema";
import type { CreateProductFormData } from "../schema/products.schema";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import z from "zod";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number | null;
}

export default function ProductModal({
  isOpen,
  onClose,
  productId,
}: ProductModalProps) {
  const { data: product } = useProductById(productId);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(productId);
  const {
    data: brands = [],
    isLoading: isBrandsLoading,
  } = useBrandsActive();

  const {
    data: productGroups = [],
    isLoading: isProductGroupsLoading,
  } = useProductGroups();

  const {
    data: productTypes = [],
    isLoading: isProductTypesLoading,
  } = useProductTypes();

  const {
    data: packagingTypes = [],
    isLoading: isPackagingTypesLoading,
  } = usePackagingTypes();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<
    z.input<typeof createProductSchema>,
    unknown,
    CreateProductFormData
  >({
    resolver: zodResolver(createProductSchema),
  });

  useEffect(() => {
    if (isOpen && product) {
      reset({
        brand_id: product.brand_id,
        product_group_id: product.product_group_id,
        product_type_id: product.product_type_id || undefined,
        packaging_type_id: product.packaging_type_id || undefined,
        packaging_size: Number(product.packaging_size),
        packaging_unit: product.packaging_unit,
        gst_percentage: Number(product.gst_percentage),
        is_gst_inclusive: product.is_gst_inclusive,
        is_active: product.is_active,
        show_by_default: product.show_by_default,
        display_order: product.display_order ?? undefined,
      });
    } else {
      reset({
        gst_percentage: 0,
        is_gst_inclusive: false,
        is_active: true,
      });
    }
  }, [isOpen, product, reset]);

  const onSubmit = async (data: CreateProductFormData) => {
    try {
      if (productId) {
        await updateProduct.mutateAsync(data);
      } else {
        await createProduct.mutateAsync(data);
      }
      reset();
      onClose();
    } catch (error) {
      console.error("Failed to save product:", error);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {productId ? "Edit Product" : "Create Product"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-6">
          {/* Brand ID */}
          <Controller
            name="brand_id"
            control={control}
            render={({ field }) => (
              <MasterDataSelector
                label="Brand"
                placeholder="Select brand"
                value={field.value}
                onChange={field.onChange}
                options={brands}
                isLoading={isBrandsLoading}
                error={errors.brand_id?.message}
                required
                getOptionLabel={(brand) => brand.name}
                getOptionValue={(brand) => brand.id}
              />
            )}
          />

          {/* Product Group ID */}
          <Controller
            name="product_group_id"
            control={control}
            render={({ field }) => (
              <MasterDataSelector
                label="Product Group"
                placeholder="Select product group"
                value={field.value}
                onChange={field.onChange}
                options={productGroups}
                isLoading={isProductGroupsLoading}
                error={errors.product_group_id?.message}
                required
                getOptionLabel={(group) => group.name}
                getOptionValue={(group) => group.id}
              />
            )}
          />

          {/* Product Type ID */}
          <Controller
            name="product_type_id"
            control={control}
            render={({ field }) => (
              <MasterDataSelector
                label="Product Type"
                placeholder="No product type"
                value={field.value ?? undefined}
                onChange={field.onChange}
                options={productTypes}
                isLoading={isProductTypesLoading}
                error={errors.product_type_id?.message}
                getOptionLabel={(type) => type.name}
                getOptionValue={(type) => type.id}
              />
            )}
          />

          {/* Packaging Type ID */}
          <Controller
            name="packaging_type_id"
            control={control}
            render={({ field }) => (
              <MasterDataSelector
                label="Packaging Type"
                placeholder="No packaging type"
                value={field.value ?? undefined}
                onChange={field.onChange}
                options={packagingTypes}
                isLoading={isPackagingTypesLoading}
                error={errors.packaging_type_id?.message}
                getOptionLabel={(type) => type.name}
                getOptionValue={(type) => type.id}
              />
            )}
          />

          {/* Packaging Size */}
          <div>
            <Label htmlFor="packaging_size">Packaging Size *</Label>
            <Input
              id="packaging_size"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g., 1.00"
              {...register("packaging_size", { valueAsNumber: true })}
            />
            {errors.packaging_size && (
              <p className="text-xs text-destructive">
                {errors.packaging_size.message}
              </p>
            )}
          </div>

          {/* Packaging Unit */}
          <div>
            <Label htmlFor="packaging_unit">Packaging Unit *</Label>
            <Input
              id="packaging_unit"
              placeholder="e.g., Litre, Pack, kg"
              {...register("packaging_unit")}
            />
            {errors.packaging_unit && (
              <p className="text-xs text-destructive">
                {errors.packaging_unit.message}
              </p>
            )}
          </div>

          {/* GST Percentage */}
          <div>
            <Label htmlFor="gst_percentage">GST Percentage</Label>
            <Input
              id="gst_percentage"
              type="number"
              step="0.01"
              min="0"
              max="5"
              placeholder="0-5%"
              {...register("gst_percentage", { valueAsNumber: true })}
            />
            {errors.gst_percentage && (
              <p className="text-xs text-destructive">
                {errors.gst_percentage.message}
              </p>
            )}
          </div>

          {/* Is GST Inclusive */}
          <div className="flex items-center gap-2">
            <input
              id="is_gst_inclusive"
              type="checkbox"
              {...register("is_gst_inclusive")}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="is_gst_inclusive">
              GST Inclusive (price includes tax)
            </Label>
          </div>
          {/* Display Order */}
          <div>
            <Label htmlFor="display_order">
              Display Order
            </Label>

            <Input
              id="display_order"
              type="number"
              step="1"
              min="0"
              placeholder="e.g., 1"
              {...register("display_order", {
                valueAsNumber: true,
              })}
            />

            {errors.display_order && (
              <p className="text-xs text-destructive">
                {errors.display_order.message}
              </p>
            )}
          </div>

          {/* Is Active */}
          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              {...register("is_active")}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          {/* Show By Default */}
          <div className="flex items-center gap-2">
            <input
              id="show_by_default"
              type="checkbox"
              {...register("show_by_default")}
              className="h-4 w-4 rounded border"
            />

            <Label htmlFor="show_by_default">
              Show by Default
            </Label>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={createProduct.isPending || updateProduct.isPending}
            >
              {productId ? "Update Product" : "Create Product"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
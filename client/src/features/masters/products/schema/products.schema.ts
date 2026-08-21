import { z } from "zod";

export const createProductSchema = z.object({
  brand_id: z.number().int().positive("Brand is required"),

  product_group_id: z
    .number()
    .int()
    .positive("Product group is required"),

  product_type_id: z.number().int().positive().optional(),

  packaging_type_id: z
    .number()
    .int()
    .positive()
    .optional(),

  packaging_size: z
    .number()
    .positive()
    .min(0.01, "Packaging size must be at least 0.01"),

  packaging_unit: z
    .string()
    .min(1, "Packaging unit is required")
    .max(50),

  gst_percentage: z
    .number()
    .min(0)
    .max(5)
    .default(0),

  is_gst_inclusive: z
    .boolean()
    .default(false),

  is_active: z
    .boolean()
    .default(true),

  show_by_default: z
    .boolean()
    .default(false),

  display_order: z
    .number()
    .int()
    .nullable()
    .optional(),
});

export const updateProductSchema =
  createProductSchema.partial();

export type CreateProductFormData =
  z.infer<typeof createProductSchema>;

export type UpdateProductFormData =
  z.infer<typeof updateProductSchema>;
import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { MasterSection } from "../../shared/components/MasterSection";

import type { ProductLink } from "../types/products.types";

import { useCreateProductLink } from "../mutations/useCreateProductLink";
import { useUpdateProductLink } from "../mutations/useUpdateProductLink";
import { useDeleteProductLink } from "../mutations/useDeleteProductLink";
import { useDistributors } from "../../distributors/queries/useDistributors";

interface ProductLinksSectionProps {
    productId: number;
    productLinks: ProductLink[];
}

export function ProductLinksSection({
    productId,
    productLinks,
}: ProductLinksSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
    const [distributorId, setDistributorId] = useState<number | null>(null);
    const {
        data: distributors = [],
        isLoading: isDistributorsLoading,
        isError: isDistributorsError,
    } = useDistributors();

    const createProductLink = useCreateProductLink(productId);
    const updateProductLink = useUpdateProductLink(productId);
    const deleteProductLink = useDeleteProductLink(productId);


    const handleCreate = async () => {
        if (!distributorId) {
            return;
        }

        await createProductLink.mutateAsync({
            product_id: productId,
            distributor_id: distributorId,
            is_active: true,
        });

        setDistributorId(null);
        setIsAdding(false);
    };

    const handleToggleActive = async (link: ProductLink) => {
        await updateProductLink.mutateAsync({
            id: link.id,
            data: {
                is_active: !link.is_active,
            },
        });
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to remove this distributor?")) {
            return;
        }

        await deleteProductLink.mutateAsync(id);
    };

    return (
        <MasterSection
            title={`Distributor Configuration (${productLinks.length})`}
            action={
                !isAdding && (
                    <Button
                        size="sm"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="mr-2 size-4" />
                        Add Distributor
                    </Button>
                )
            }
        >
            <div className="space-y-4">
                {isAdding && (
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="font-medium">
                                Add Distributor
                            </p>

                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                    setIsAdding(false);
                                    setDistributorId(null);
                                }}
                            >
                                <X className="size-4" />
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Distributor
                            </label>

                            <select
                                value={distributorId ?? ""}
                                onChange={(event) =>
                                    setDistributorId(
                                        event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                    )
                                }
                                disabled={isDistributorsLoading}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                                <option value="">
                                    {isDistributorsLoading
                                        ? "Loading distributors..."
                                        : "Select distributor"}
                                </option>

                                {distributors.map((distributor) => (
                                    <option
                                        key={distributor.id}
                                        value={distributor.id}
                                    >
                                        {distributor.name}
                                    </option>
                                ))}
                            </select>

                            {isDistributorsError && (
                                <p className="text-xs text-destructive">
                                    Failed to load distributors.
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsAdding(false);
                                    setDistributorId(null);
                                }}
                            >
                                Cancel
                            </Button>

                            <Button
                                onClick={handleCreate}
                                disabled={
                                    !distributorId ||
                                    createProductLink.isPending
                                }
                            >
                                {createProductLink.isPending
                                    ? "Adding..."
                                    : "Add Distributor"}
                            </Button>
                        </div>
                    </div>
                )}

                {productLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        No distributors configured for this product.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {productLinks.map((link) => (
                            <div
                                key={link.id}
                                className="rounded-lg border p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">
                                            {link.distributor.name}
                                        </p>

                                        {link.distributor.contact && (
                                            <p className="text-sm text-muted-foreground">
                                                {link.distributor.contact}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant={
                                                link.is_active
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {link.is_active
                                                ? "Active"
                                                : "Inactive"}
                                        </Badge>

                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() =>
                                                setEditingLinkId(
                                                    editingLinkId === link.id
                                                        ? null
                                                        : link.id
                                                )
                                            }
                                        >
                                            <Pencil className="size-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() =>
                                                handleDelete(link.id)
                                            }
                                            disabled={deleteProductLink.isPending}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>

                                {editingLinkId === link.id && (
                                    <div className="mt-4 border-t pt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                handleToggleActive(link)
                                            }
                                            disabled={updateProductLink.isPending}
                                        >
                                            {link.is_active
                                                ? "Deactivate"
                                                : "Activate"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </MasterSection>
    );
}
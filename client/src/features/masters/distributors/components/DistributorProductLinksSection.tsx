import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

import type {
    Distributor,
    DistributorProductLink,
} from "../types/distributors.types";

import {
    MasterTable,
    MasterTableRow,
    MasterTableCell,
    MasterTableActions,
    MasterSearch,
    MasterSection,
    MasterDataSelector,
} from "../../shared/components";

import { useCreateProductLink } from "../mutations/useCreateProductLink";
import { useUpdateProductLink } from "../mutations/useUpdateProductLink";
import { useDeleteProductLink } from "../mutations/useDeleteProductLink";

interface DistributorProductLinksSectionProps {
    distributors: Distributor[];
    selectedDistributorId: number | null;
    onDistributorChange: (id: number | null) => void;
    productLinks: DistributorProductLink[];
    products: {
        id: number;
        code: string;
        is_active: boolean;
    }[];
}

export function DistributorProductLinksSection({
    distributors,
    selectedDistributorId,
    onDistributorChange,
    productLinks,
    products,
}: DistributorProductLinksSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [productId, setProductId] = useState<number | null>(null);
    const [search, setSearch] = useState("");

    const createProductLink = useCreateProductLink();
    const updateProductLink = useUpdateProductLink();
    const deleteProductLink = useDeleteProductLink();

    const distributorLinks =
        selectedDistributorId === null
            ? []
            : productLinks.filter(
                (link) =>
                    link.distributor_id === selectedDistributorId,
            );

    const filteredDistributorLinks =
        distributorLinks.filter((link) => {
            const product = products.find(
                (item) => item.id === link.product_id,
            );

            const query = search.toLowerCase().trim();

            return (
                product?.code.toLowerCase().includes(query) ?? false
            );
        });

    const linkedProductIds = new Set(
        distributorLinks.map((link) => link.product_id),
    );

    const availableProducts = products.filter(
        (product) =>
            product.is_active &&
            !linkedProductIds.has(product.id),
    );

    const handleCreate = async () => {
        if (
            selectedDistributorId === null ||
            productId === null
        ) {
            return;
        }

        await createProductLink.mutateAsync({
            distributor_id: selectedDistributorId,
            product_id: productId,
            is_active: true,
        });

        setProductId(null);
        setIsAdding(false);
    };

    const handleToggleActive = async (
        link: DistributorProductLink,
    ) => {
        await updateProductLink.mutateAsync({
            id: link.id,
            data: {
                is_active: !link.is_active,
            },
        });
    };

    const handleDelete = async (id: number) => {
        if (
            !confirm(
                "Are you sure you want to remove this product link?",
            )
        ) {
            return;
        }

        await deleteProductLink.mutateAsync(id);
    };

    const handleDistributorChange = (
        id: number | null,
    ) => {
        onDistributorChange(id);

        setSearch("");
        setIsAdding(false);
        setProductId(null);
    };

    return (
        <MasterSection
            title="Product Links"
            description="Configure which products are sourced by each distributor."
            action={
                selectedDistributorId !== null && !isAdding ? (
                    <Button
                        size="sm"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="mr-2 size-4" />
                        Add Product
                    </Button>
                ) : undefined
            }
        >
        <div className="space-y-6">
            <div className="space-y-4">
                <MasterDataSelector
                    label="Distributor"
                    placeholder="Select distributor"
                    value={selectedDistributorId ?? undefined}
                    onChange={(value) =>
                        handleDistributorChange(value ?? null)
                    }
                    options={distributors.filter(
                        (distributor) => distributor.is_active,
                    )}
                    isLoading={false}
                    getOptionLabel={(distributor) => distributor.name}
                    getOptionValue={(distributor) => distributor.id}
                />

                {selectedDistributorId !== null &&
                    distributorLinks.length > 0 && (
                        <MasterSearch
                            value={search}
                            onChange={setSearch}
                            placeholder="Search linked products..."
                        />
                    )}
            </div>

            {selectedDistributorId === null ? (
                <p className="text-sm text-muted-foreground">
                    Select a distributor to view its product links.
                </p>
            ) : (
                <>

                    {/* Add product form */}
                    {isAdding && (
                        <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center justify-between">
                                <p className="font-medium">
                                    Add Product Link
                                </p>

                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => {
                                        setIsAdding(false);
                                        setProductId(null);
                                    }}
                                >
                                    <X className="size-4" />
                                </Button>
                            </div>

                            <div className="space-y-2">

                                <MasterDataSelector
                                    label="Product"
                                    placeholder="Select product"
                                    value={productId ?? undefined}
                                    onChange={(value) =>
                                        setProductId(value ?? null)
                                    }
                                    options={availableProducts}
                                    isLoading={false}
                                    getOptionLabel={(product) => product.code}
                                    getOptionValue={(product) => product.id}
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsAdding(false);
                                        setProductId(null);
                                    }}
                                >
                                    Cancel
                                </Button>

                                <Button
                                    onClick={handleCreate}
                                    disabled={
                                        productId === null ||
                                        createProductLink.isPending
                                    }
                                >
                                    {createProductLink.isPending
                                        ? "Adding..."
                                        : "Add Product"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Linked products */}
                    {distributorLinks.length === 0 ? (
                        <p className="text-sm italic text-muted-foreground">
                            No products linked to this distributor.
                        </p>
                    ) : (
                        <>

                            <MasterTable
                                headers={[
                                    {
                                        label: "Product",
                                        align: "left",
                                    },
                                    {
                                        label: "Status",
                                        align: "center",
                                    },
                                    {
                                        label: "Actions",
                                        align: "center",
                                    },
                                ]}
                                empty={
                                    filteredDistributorLinks.length === 0
                                }
                                emptyMessage="No products match your search."
                            >
                                {filteredDistributorLinks.map((link) => {
                                    const product = products.find(
                                        (item) =>
                                            item.id === link.product_id,
                                    );

                                    return (
                                        <MasterTableRow key={link.id}>
                                            <MasterTableCell className="font-medium">
                                                {product?.code ??
                                                    `Product #${link.product_id}`}
                                            </MasterTableCell>

                                            <MasterTableCell align="center">
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
                                            </MasterTableCell>

                                            <MasterTableActions>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleToggleActive(link)}
                                                    disabled={updateProductLink.isPending}
                                                >
                                                    {link.is_active
                                                        ? "Deactivate"
                                                        : "Activate"}
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => handleDelete(link.id)}
                                                    disabled={deleteProductLink.isPending}
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </MasterTableActions>
                                        </MasterTableRow>
                                    );
                                })}
                            </MasterTable>
                        </>
                    )}
                </>
            )}
        </div>
        </MasterSection>
    );
}
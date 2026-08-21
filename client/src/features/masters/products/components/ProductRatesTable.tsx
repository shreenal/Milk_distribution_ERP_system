import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
    MasterSection,
    MasterTable,
    MasterTableRow,
    MasterTableCell,
    MasterTableActions,
} from "../../shared/components";

import type {
    ClientProductRate,
    ProductLink,
} from "../types/products.types";

import {
    formatDateForDisplay,
    isRateCurrent,
    isRateExpired,
} from "../helpers/configuration.helper";

import { useCreateClientProductRate } from "../mutations/useCreateClientProductRate";
import { useUpdateClientProductRate } from "../mutations/useUpdateClientProductRate";
import { useDeleteClientProductRate } from "../mutations/useDeleteClientProductRate";
import { useClients } from "../../clients/queries/useClients";

interface ProductRatesTableProps {
    productId: number;
    productLinks: ProductLink[];
}

export function ProductRatesTable({
    productId,
    productLinks,
}: ProductRatesTableProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingRateId, setEditingRateId] = useState<number | null>(null);

    const {
        data: clients = [],
        isLoading: isClientsLoading,
        isError: isClientsError,
    } = useClients();

    const [clientId, setClientId] = useState<number | null>(null);
    const [productLinkId, setProductLinkId] =
        useState<number | null>(null);
    const [sellingRate, setSellingRate] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    const [effectiveTo, setEffectiveTo] = useState("");
    const [isActive, setIsActive] = useState(true);

    const createClientProductRate =
        useCreateClientProductRate(productId);

    const updateClientProductRate =
        useUpdateClientProductRate(productId);

    const deleteClientProductRate =
        useDeleteClientProductRate(productId);

    const allClientRates = productLinks.flatMap((link) =>
        link.client_rates.map((rate) => ({
            ...rate,
            distributorName: link.distributor.name,
            link,
        })),
    );

    const handleCreate = async () => {
        if (
            !clientId ||
            !productLinkId ||
            !sellingRate
        ) {
            return;
        }

        await createClientProductRate.mutateAsync({
            client_id: clientId,
            product_link_id: productLinkId,
            selling_rate: Number(sellingRate),
            effective_from: effectiveFrom || undefined,
            effective_to: effectiveTo || undefined,
            is_active: isActive,
        });

        resetForm();
    };

    const resetForm = () => {
        setIsAdding(false);
        setEditingRateId(null);
        setClientId(null);
        setProductLinkId(null);
        setSellingRate("");
        setEffectiveFrom("");
        setEffectiveTo("");
        setIsActive(true);
    };

    const handleEdit = (
        item: (typeof allClientRates)[number],
    ) => {
        setEditingRateId(item.id);
        setClientId(item.master_client.id);
        setProductLinkId(item.link.id);
        setSellingRate(String(item.selling_rate));

        setEffectiveFrom(
            item.effective_from
                ? item.effective_from.slice(0, 10)
                : "",
        );

        setEffectiveTo(
            item.effective_to
                ? item.effective_to.slice(0, 10)
                : "",
        );

        setIsActive(item.is_active);
        setIsAdding(true);
    };

    const handleUpdate = async () => {
        if (
            !editingRateId ||
            !clientId ||
            !productLinkId ||
            !sellingRate
        ) {
            return;
        }

        await updateClientProductRate.mutateAsync({
            id: editingRateId,
            data: {
                client_id: clientId,
                product_link_id: productLinkId,
                selling_rate: Number(sellingRate),
                effective_from: effectiveFrom || undefined,
                effective_to: effectiveTo || undefined,
                is_active: isActive,
            },
        });

        resetForm();
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this client rate?")) {
            return;
        }

        await deleteClientProductRate.mutateAsync(id);
    };

    const handleToggleActive = async (
        rate: ClientProductRate,
    ) => {
        await updateClientProductRate.mutateAsync({
            id: rate.id,
            data: {
                is_active: !rate.is_active,
            },
        });
    };

    return (
        <MasterSection
            title="Client Product Rates"
            action={
                !isAdding ? (
                    <Button
                        size="sm"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="mr-2 size-4" />
                        Add Client Rate
                    </Button>
                ) : undefined
            }
        >

            {isAdding && (
                <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                        <p className="font-medium">
                            Add Client Rate
                        </p>

                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setIsAdding(false)}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>

                    <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Distributor
                            </label>

                            <select
                                value={productLinkId ?? ""}
                                onChange={(event) =>
                                    setProductLinkId(
                                        event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                    )
                                }
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                                <option value="">
                                    Select distributor
                                </option>

                                {productLinks.map((link) => (
                                    <option key={link.id} value={link.id}>
                                        {link.distributor.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Client
                            </label>

                            <select
                                value={clientId ?? ""}
                                onChange={(event) =>
                                    setClientId(
                                        event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                    )
                                }
                                disabled={isClientsLoading}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                                <option value="">
                                    {isClientsLoading
                                        ? "Loading clients..."
                                        : "Select client"}
                                </option>

                                {clients.map((client) => (
                                    <option key={client.id} value={client.id}>
                                        {client.name}
                                    </option>
                                ))}
                            </select>

                            {isClientsError && (
                                <p className="text-xs text-destructive">
                                    Failed to load clients.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Selling Rate
                            </label>

                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={sellingRate}
                                onChange={(event) =>
                                    setSellingRate(event.target.value)
                                }
                                placeholder="Enter selling rate"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Effective From
                                </label>

                                <input
                                    type="date"
                                    value={effectiveFrom}
                                    onChange={(event) =>
                                        setEffectiveFrom(event.target.value)
                                    }
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Effective To
                                </label>

                                <input
                                    type="date"
                                    value={effectiveTo}
                                    onChange={(event) =>
                                        setEffectiveTo(event.target.value)
                                    }
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                />
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(event) =>
                                    setIsActive(event.target.checked)
                                }
                            />

                            Active
                        </label>

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={resetForm}
                                disabled={
                                    createClientProductRate.isPending ||
                                    updateClientProductRate.isPending
                                }
                            >
                                Cancel
                            </Button>

                            <Button
                                onClick={
                                    editingRateId
                                        ? handleUpdate
                                        : handleCreate
                                }
                                disabled={
                                    !clientId ||
                                    !productLinkId ||
                                    !sellingRate ||
                                    createClientProductRate.isPending ||
                                    updateClientProductRate.isPending
                                }
                            >
                                {createClientProductRate.isPending ||
                                    updateClientProductRate.isPending
                                    ? "Saving..."
                                    : editingRateId
                                        ? "Update Client Rate"
                                        : "Add Client Rate"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <MasterTable
                headers={[
                    {
                        label: "Distributor",
                        align: "left",
                    },
                    {
                        label: "Client",
                        align: "left",
                    },
                    {
                        label: "Rate (₹)",
                        align: "right",
                    },
                    {
                        label: "Effective",
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
                empty={allClientRates.length === 0}
                emptyMessage="No client rates configured."
            >
                {allClientRates.map((item) => {
                    const isCurrent = isRateCurrent(
                        item.effective_from,
                        item.effective_to,
                    );

                    const isExpired = isRateExpired(
                        item.effective_to,
                    );

                    return (
                        <MasterTableRow
                            key={item.id}
                            className={
                                isExpired
                                    ? "opacity-50"
                                    : undefined
                            }
                        >
                            <MasterTableCell>
                                {item.distributorName}
                            </MasterTableCell>

                            <MasterTableCell>
                                {item.master_client.name}
                            </MasterTableCell>

                            <MasterTableCell
                                align="right"
                                className="font-mono"
                            >
                                ₹
                                {Number(
                                    item.selling_rate,
                                ).toFixed(2)}
                            </MasterTableCell>

                            <MasterTableCell className="text-xs text-muted-foreground">
                                {formatDateForDisplay(
                                    item.effective_from,
                                )}{" "}
                                to{" "}
                                {item.effective_to
                                    ? formatDateForDisplay(
                                        item.effective_to,
                                    )
                                    : "—"}
                            </MasterTableCell>

                            <MasterTableCell align="center">
                                <Badge
                                    variant={
                                        isCurrent
                                            ? "default"
                                            : "secondary"
                                    }
                                    className="text-xs"
                                >
                                    {isCurrent
                                        ? "Current"
                                        : isExpired
                                            ? "Expired"
                                            : "Future"}
                                </Badge>
                            </MasterTableCell>

                            <MasterTableActions>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Edit client rate"
                                    onClick={() =>
                                        handleEdit(item)
                                    }
                                >
                                    <Pencil className="size-4" />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() =>
                                        handleDelete(item.id)
                                    }
                                    disabled={
                                        deleteClientProductRate.isPending
                                    }
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </MasterTableActions>
                        </MasterTableRow>
                    );
                })}
            </MasterTable>
        </MasterSection>
    );
}
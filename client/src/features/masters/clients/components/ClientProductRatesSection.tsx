import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  MasterDataSelector,
  MasterSection,
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type {
  Client,
  ClientProductRate,
} from "../types/client.types";

import type {
  Distributor,
  DistributorProductLink,
} from "@/features/masters/distributors/types/distributors.types";

import { useCreateClientProductRate } from "../mutations/useCreateClientProductRate";
import { useUpdateClientProductRate } from "../mutations/useUpdateClientProductRate";
import { useDeleteClientProductRate } from "../mutations/useDeleteClientProductRate";

interface ClientProductRatesSectionProps {
  clients: Client[];
  productLinks: DistributorProductLink[];
  productRates: ClientProductRate[];
  products: {
    id: number;
    code: string;
    is_active: boolean;
  }[];
  distributors: Distributor[];
}


export function ClientProductRatesSection({
  clients,
  productLinks,
  productRates,
  products,
  distributors,
}: ClientProductRatesSectionProps) {
  const [selectedClientId, setSelectedClientId] =
    useState<number | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [editingRateId, setEditingRateId] =
    useState<number | null>(null);

  const [productLinkId, setProductLinkId] =
    useState<number | null>(null);

  const [sellingRate, setSellingRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const createRate = useCreateClientProductRate();
  const updateRate = useUpdateClientProductRate();
  const deleteRate = useDeleteClientProductRate();

  const clientRates = useMemo(() => {
    if (selectedClientId === null) {
      return [];
    }

    return productRates.filter(
      (rate) => rate.client_id === selectedClientId,
    );
  }, [productRates, selectedClientId]);

  /*
   * Only product links that belong to the client's owner distributor
   * are valid candidates for this client's product rates.
   */
  const selectedClient = clients.find(
    (client) => client.id === selectedClientId,
  );

  const clientProductLinks = useMemo(() => {
    if (!selectedClient) {
      return [];
    }

    return productLinks.filter(
      (link) =>
        link.distributor_id ===
        selectedClient.owner_distributor_id &&
        link.is_active,
    );
  }, [productLinks, selectedClient]);

  // const availableProductLinks = useMemo(() => {
  //   const linksWithRates = new Set(
  //     clientRates
  //       .filter((rate) => rate.id !== editingRateId)
  //       .map((rate) => rate.product_link_id),
  //   );

  //   return clientProductLinks.filter(
  //     (link) => !linksWithRates.has(link.id),
  //   );
  // }, [
  //   clientProductLinks,
  //   clientRates,
  //   editingRateId,
  // ]);
  const availableProductLinks = clientProductLinks;

  const resetForm = () => {
    setIsAdding(false);
    setEditingRateId(null);
    setProductLinkId(null);
    setSellingRate("");
    setEffectiveFrom("");
    setEffectiveTo("");
  };

  const handleAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleEdit = (rate: ClientProductRate) => {
    setEditingRateId(rate.id);
    setProductLinkId(rate.product_link_id);
    setSellingRate(rate.selling_rate);
    setEffectiveFrom(
      rate.effective_from
        ? rate.effective_from.slice(0, 10)
        : "",
    );
    setEffectiveTo(
      rate.effective_to
        ? rate.effective_to.slice(0, 10)
        : "",
    );
    setIsAdding(true);
  };

  const handleSubmit = async () => {
    if (
      selectedClientId === null ||
      productLinkId === null ||
      !sellingRate ||
      !effectiveFrom
    ) {
      return;
    }

    if (editingRateId !== null) {
      await updateRate.mutateAsync({
        id: editingRateId,
        data: {
          client_id: selectedClientId,
          product_link_id: productLinkId,
          selling_rate: Number(sellingRate),
          effective_from: effectiveFrom,
          effective_to: effectiveTo || undefined,
        },
      });
    } else {
      await createRate.mutateAsync({
        client_id: selectedClientId,
        product_link_id: productLinkId,
        selling_rate: Number(sellingRate),
        effective_from: effectiveFrom,
        effective_to: effectiveTo || undefined,
        is_active: true,
      });
    }

    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this client product rate?",
      )
    ) {
      return;
    }

    await deleteRate.mutateAsync(id);
  };

  const getProduct = (productLinkId: number) => {
    const link = productLinks.find(
      (item) => item.id === productLinkId,
    );

    if (!link) {
      return undefined;
    }

    return products.find(
      (product) => product.id === link.product_id,
    );
  };

  const getDistributorName = (productLinkId: number) => {
    const link = productLinks.find(
      (item) => item.id === productLinkId,
    );

    if (!link) {
      return "—";
    }

    return (
      distributors.find(
        (distributor) => distributor.id === link.distributor_id,
      )?.name ?? `Distributor #${link.distributor_id}`
    );
  };

  const getRateStatus = (
    rate: ClientProductRate,
  ) => {
    if (!rate.is_active) {
      return "Inactive";
    }

    const today = new Date();
    const from = new Date(rate.effective_from);

    if (from > today) {
      return "Future";
    }

    if (rate.effective_to) {
      const to = new Date(rate.effective_to);

      if (to < today) {
        return "Expired";
      }
    }

    return "Active";
  };

  return (
    <MasterSection
      title="Client Product Rates"
      description="Configure negotiated selling rates for products supplied to each client."
    >

      <div className="max-w-md">
        <MasterDataSelector<Client>
          label="Client"
          placeholder="Select client"
          value={selectedClientId ?? undefined}
          onChange={(id) => {
            setSelectedClientId(id ?? null);
            resetForm();
          }}
          options={clients.filter((client) => client.is_active)}
          isLoading={false}
          getOptionLabel={(client) =>
            client.code
              ? `${client.code} — ${client.name}`
              : client.name
          }
          getOptionValue={(client) => client.id}
        />
      </div>

      {selectedClientId === null && (
        <p className="text-sm text-muted-foreground">
          Select a client to view and configure product rates.
        </p>
      )}

      {selectedClientId !== null && (
        <>
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="font-medium">
                {selectedClient?.name}
              </p>

              <p className="text-sm text-muted-foreground">
                {clientRates.length} configured rate
                {clientRates.length === 1 ? "" : "s"}
              </p>
            </div>

            {!isAdding && (
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={
                  clientProductLinks.length === 0
                }
              >
                <Plus className="mr-2 size-4" />
                Add Rate
              </Button>
            )}
          </div>

          {isAdding && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {editingRateId !== null
                    ? "Edit Client Product Rate"
                    : "Add Client Product Rate"}
                </p>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={resetForm}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Product</Label>

                <Select
                  value={productLinkId?.toString() ?? ""}
                  onValueChange={(value) =>
                    setProductLinkId(
                      value ? Number(value) : null,
                    )
                  }
                  disabled={editingRateId !== null}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>

                  <SelectContent>
                    {(editingRateId !== null
                      ? clientProductLinks
                      : availableProductLinks
                    ).map((link) => {
                      const product = products.find(
                        (item) => item.id === link.product_id,
                      );

                      const distributor = distributors.find(
                        (item) => item.id === link.distributor_id,
                      );

                      return (
                        <SelectItem
                          key={link.id}
                          value={link.id.toString()}
                        >
                          {product?.code ??
                            `Product #${link.product_id}`}
                          {" — "}
                          {distributor?.name ??
                            `Distributor #${link.distributor_id}`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="effective-from">
                    Effective From
                  </Label>

                  <Input
                    id="effective-from"
                    type="date"
                    value={effectiveFrom}
                    onChange={(event) =>
                      setEffectiveFrom(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="effective-to">
                    Effective To
                  </Label>

                  <Input
                    id="effective-to"
                    type="date"
                    value={effectiveTo}
                    onChange={(event) =>
                      setEffectiveTo(event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={resetForm}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleSubmit}
                  disabled={
                    selectedClientId === null ||
                    productLinkId === null ||
                    !sellingRate ||
                    !effectiveFrom ||
                    createRate.isPending ||
                    updateRate.isPending
                  }
                >
                  {createRate.isPending ||
                    updateRate.isPending
                    ? "Saving..."
                    : editingRateId !== null
                      ? "Update Rate"
                      : "Add Rate"}
                </Button>
              </div>
            </div>
          )}

          <MasterTable
            headers={[
              { label: "Product" },
              { label: "Distributor" },
              { label: "Selling Rate" },
              { label: "Effective From" },
              { label: "Effective To" },
              { label: "Status" },
              {
                label: "Actions",
                align: "center",
                className: "w-[140px]",
              },
            ]}
          >
            {clientRates.map((rate) => {
              const product = getProduct(rate.product_link_id);
              const status = getRateStatus(rate);

              return (
                <MasterTableRow key={rate.id}>
                  <MasterTableCell className="font-medium">
                    {product?.code ??
                      `Product #${rate.product_link_id}`}
                  </MasterTableCell>

                  <MasterTableCell>
                    {getDistributorName(rate.product_link_id)}
                  </MasterTableCell>

                  <MasterTableCell>
                    ₹{rate.selling_rate}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.effective_from
                      ? new Date(
                        rate.effective_from,
                      ).toLocaleDateString()
                      : "—"}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.effective_to
                      ? new Date(
                        rate.effective_to,
                      ).toLocaleDateString()
                      : "—"}
                  </MasterTableCell>

                  <MasterTableCell>
                    <Badge
                      variant={
                        status === "Active"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {status}
                    </Badge>
                  </MasterTableCell>

                  <MasterTableActions>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit rate"
                      onClick={() => handleEdit(rate)}
                    >
                      <Pencil className="size-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete rate"
                      onClick={() =>
                        handleDelete(rate.id)
                      }
                      disabled={deleteRate.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </MasterTableActions>
                </MasterTableRow>
              );
            })}
          </MasterTable>

          {availableProductLinks.length === 0 &&
            !isAdding &&
            clientProductLinks.length > 0 && (
              <p className="text-xs text-muted-foreground">
                All active products linked to this client's
                distributor already have a configured rate.
              </p>
            )}

          {clientProductLinks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No active product links exist for this client's
              owner distributor. A product link must exist before
              a client-specific rate can be configured.
            </p>
          )}
        </>
      )}
    </MasterSection>
  );
}
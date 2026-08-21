import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { MasterSearch } from "../../shared/components/MasterSearch";

import { ClientsTable } from "../components/ClientsTable";
import { ClientModal } from "../components/ClientModal";
import { ClientProductRatesSection } from "../components/ClientProductRatesSection";

import {
  useClients,
  useClientById,
} from "../queries/useClients";

import { useCreateClient } from "../mutations/useCreateClient";
import { useUpdateClient } from "../mutations/useUpdateClient";
import { useDeleteClient } from "../mutations/useDeleteClient";

import { useClientProductRates } from "../queries/useClientProductRates";
import { useDistributorProductLinks } from "../../distributors/queries/useProductLinks";
import { useProductsActive } from "../../products/queries/useProducts";
import { useGroupsActive } from "../../groups/queries/useGroups";
import { useDistributorsActive } from "../../distributors/queries/useDistributors";

import type {
  CreateClientRequest,
  UpdateClientRequest,
} from "../types/client.types";


export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(
    null,
  );
  const [categoriesClientId, setCategoriesClientId] =
    useState<number | null>(null);

  const {
    data: clients = [],
    isLoading,
    isError,
  } = useClients();

  const {
    data: editingClient,
    isLoading: isLoadingClient,
  } = useClientById(editingClientId);

  const {
    data: productRates = [],
    isLoading: isProductRatesLoading,
    isError: isProductRatesError,
  } = useClientProductRates();

  const {
    data: productLinks = [],
    isLoading: isProductLinksLoading,
    isError: isProductLinksError,
  } = useDistributorProductLinks();

  const {
    data: products = [],
    isLoading: isProductsLoading,
    isError: isProductsError,
  } = useProductsActive();

  const createClient = useCreateClient();
  const updateClient = useUpdateClient(editingClientId);
  const deleteClient = useDeleteClient();

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return clients;
    }

    return clients.filter((client) =>
      [
        client.code,
        client.name,
        client.shop_name,
        client.contact,
        client.billing_group?.name,
        client.delivery_group?.name,
        client.owner_distributor?.name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(term),
        ),
    );
  }, [clients, search]);

  const handleCategories = (id: number) => {
    setCategoriesClientId(id);
  };

  const handleCloseCategories = () => {
    setCategoriesClientId(null);
  };

  const handleAdd = () => {
    setEditingClientId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingClientId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createClient.isPending ||
      updateClient.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingClientId(null);
  };

  const handleSubmit = async (
    data: CreateClientRequest | UpdateClientRequest,
  ) => {
    if (editingClientId === null) {
      await createClient.mutateAsync(
        data as CreateClientRequest,
      );
    } else {
      await updateClient.mutateAsync(
        data as UpdateClientRequest,
      );
    }

    setIsModalOpen(false);
    setEditingClientId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this client?")) {
      return;
    }

    await deleteClient.mutateAsync(id);
  };


  const {
    data: groups = [],
    isLoading: isGroupsLoading,
    isError: isGroupsError,
  } = useGroupsActive();

  const {
    data: distributors = [],
    isLoading: isDistributorsLoading,
    isError: isDistributorsError,
  } = useDistributorsActive();

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Clients"
        description="Manage client master records."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Client
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search clients..."
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading clients...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load clients.
        </div>
      ) : (
        <ClientsTable
          clients={filteredClients}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCategories={handleCategories}
          categoriesClientId={categoriesClientId}
          onCloseCategories={handleCloseCategories}
          isDeleting={deleteClient.isPending}
        />
      )}

      <div className="rounded-lg border p-6">
        {isProductRatesLoading ||
          isProductLinksLoading ||
          isProductsLoading ? (
          <div className="p-6 text-center text-muted-foreground">
            Loading client product rates...
          </div>
        ) : isProductRatesError ||
          isProductLinksError ||
          isProductsError ? (
          <p className="text-sm text-destructive">
            Failed to load client product rates.
          </p>
        ) : (
          <ClientProductRatesSection
            clients={clients}
            productLinks={productLinks}
            productRates={productRates}
            products={products}
            distributors={distributors}
          />
        )}
      </div>

      <ClientModal
        open={isModalOpen}
        client={
          editingClientId === null
            ? null
            : editingClient ?? null
        }
        groups={groups}
        distributors={distributors}
        isSubmitting={
          createClient.isPending ||
          updateClient.isPending ||
          isLoadingClient
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
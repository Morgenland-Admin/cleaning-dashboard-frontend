import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { customersAdminApi, errMessage, type CustomerAddress } from '@/lib/api';

/** The default address is mirrored onto the customer record and is what invoices and exports use. */
export function CustomerAddresses({
  slug,
  customerId,
  addresses,
}: {
  slug: CompanySlug;
  customerId: number;
  addresses: CustomerAddress[];
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<CustomerAddress | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, customerId] });
    void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
  }

  const setDefault = useMutation({
    mutationFn: (address: CustomerAddress) =>
      customersAdminApi.setDefaultAddress(slug, customerId, address.id),
    onSuccess: refresh,
    onError: (err) => toast.error(errMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (address: CustomerAddress) =>
      customersAdminApi.deleteAddress(slug, customerId, address.id),
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
    onError: (err) => {
      setConfirming(null);
      toast.error(errMessage(err));
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('customers.addresses.defaultHint')}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/customers/${customerId}/addresses/new`}>
            <Plus aria-hidden="true" />
            {t('customers.addresses.add')}
          </Link>
        </Button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          size="sm"
          variant="dashed"
          icon={<MapPin aria-hidden="true" />}
          message={t('customers.addresses.none')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t(`customers.addresses.kind.${address.kind}` as never)}
                  </Badge>
                  {address.isDefault ? (
                    <Badge variant="success">{t('customers.addresses.default')}</Badge>
                  ) : null}
                  {address.label ? (
                    <span className="text-xs text-muted-foreground">{address.label}</span>
                  ) : null}
                </div>
                <div className="text-2sm text-foreground">
                  {address.company ? <p className="font-medium">{address.company}</p> : null}
                  {address.name ? <p>{address.name}</p> : null}
                  {address.addressLine1 ? <p>{address.addressLine1}</p> : null}
                  {address.addressLine2 ? <p>{address.addressLine2}</p> : null}
                  <p>{[address.postalCode, address.city].filter(Boolean).join(' ')}</p>
                  {address.country ? <p>{address.country}</p> : null}
                  {address.phone ? <p className="text-muted-foreground">{address.phone}</p> : null}
                </div>
                {address.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {address.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {address.isDefault ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefault.mutate(address)}
                    disabled={setDefault.isPending}
                    loading={setDefault.isPending && setDefault.variables?.id === address.id}
                  >
                    <Star aria-hidden="true" />
                    {t('customers.addresses.makeDefault')}
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link
                    to={`/customers/${customerId}/addresses/${address.id}/edit`}
                    aria-label={t('customers.addresses.edit')}
                    title={t('customers.addresses.edit')}
                  >
                    <Pencil aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirming(address)}
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  aria-label={t('customers.addresses.confirmDeleteTitle')}
                  title={t('customers.addresses.confirmDeleteTitle')}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={t('customers.addresses.confirmDeleteTitle')}
        description={t('customers.addresses.confirmDeleteBody')}
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={remove.isPending}
        onConfirm={() => {
          if (confirming) remove.mutate(confirming);
        }}
      />
    </div>
  );
}

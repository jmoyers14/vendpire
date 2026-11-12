import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { ApiProductPricing } from "../../apiTypes.ts";
import {
  Badge,
  Button,
  ErrorNote,
  eyebrowLinkClass,
  Fact,
  FactsPanel,
  Field,
  FormSection,
  MoneyInput,
  Page,
  PageHeader,
  pageLinkClass,
  SaveBar,
  SectionDivider,
  Switch,
  TextInput,
  useFormDraft,
} from "../../ui.tsx";
import { formatShortDate } from "../../utils/dates.ts";
import {
  formatCents,
  formatPercent,
  formatSignedCents,
  parseDollarsToCents,
} from "../../utils/money.ts";
import { queryClient, trpc, trpcClient } from "../../trpc.ts";
import { CatalogSearch } from "./CatalogSearch.tsx";
import { buildPricingDisplay } from "./pricing.ts";
import {
  buildProductInput,
  catalogNameFor,
  categorySuggestionsFor,
  EMPTY_PRODUCT_DRAFT,
  type ProductDraft,
  type ProductFieldErrors,
} from "./productForm.ts";

const FORM_ID = "product-form";

/** Two decimals, so a loaded $2 reads "2.00" like the mockup, not "2". */
const priceInputFor = (cents: number) => (cents / 100).toFixed(2);

/** Create + edit form: `productId` present means edit. */
export function ProductFormScreen({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const isEditing = Boolean(productId);
  const { draft, set, load, discard, isDirty } = useFormDraft<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [upcNote, setUpcNote] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  // Loaded once: a refetch on window focus must not wipe edits in progress.
  const [hasLoaded, setHasLoaded] = useState(false);
  const categoryListId = useId();

  const existing = useQuery({
    ...trpc.products.get.queryOptions({ id: productId ?? "" }),
    enabled: isEditing,
  });
  // Edit only: a product being created has no purchase history by definition.
  const pricingList = useQuery({
    ...trpc.products.pricing.queryOptions(),
    enabled: isEditing,
  });
  const products = useQuery(trpc.products.list.queryOptions());

  useEffect(() => {
    const product = existing.data;
    if (!product || hasLoaded) {
      return;
    }
    setHasLoaded(true);
    load({
      name: product.name,
      category: product.category,
      upc: product.upc ?? "",
      taxClass: product.taxClass ?? "",
      price: priceInputFor(product.defaultPriceCents),
      imageUrl: product.imageUrl,
      isActive: product.active,
      tracksExpiration: product.tracksExpiration,
    });
  }, [existing.data, hasLoaded, load]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.products.list.queryKey() });
    if (productId) {
      queryClient.invalidateQueries({ queryKey: trpc.products.get.queryKey({ id: productId }) });
    }
    navigate({ to: "/products" });
  };
  const saveCallbacks = {
    onSuccess: handleSaved,
    onError: (error: { message: string }) => setFormError(error.message),
  };
  const create = useMutation(trpc.products.create.mutationOptions(saveCallbacks));
  const update = useMutation(trpc.products.update.mutationOptions(saveCallbacks));

  // An edit clears that field's error, so a fix doesn't keep showing it.
  const editDraft = (patch: Partial<ProductDraft>) => {
    set(patch);
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) {
        delete next[key as keyof ProductFieldErrors];
      }
      return next;
    });
  };

  const lookUpUpc = async () => {
    setUpcNote(null);
    setIsLookingUp(true);
    try {
      const found = await trpcClient.candidates.byCode.query({ code: draft.upc.trim() });
      if (!found) {
        setUpcNote("No catalog match for that UPC. Enter the details by hand.");
        return;
      }
      const name = catalogNameFor(found) ?? draft.name;
      // Prefill, but never clobber something already typed.
      editDraft({
        name: draft.name.trim() ? draft.name : name,
        imageUrl: found.imageUrl ?? draft.imageUrl,
      });
    } catch (error) {
      setUpcNote(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const result = buildProductInput(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    if (productId) {
      update.mutate({ id: productId, ...result.input });
      return;
    }
    create.mutate(result.input);
  };

  const pricing = pricingList.data?.find((row) => row.productId === productId);
  const savedName = existing.data?.name;
  const meta = [
    existing.data?.category,
    pricing ? `Last bought ${formatShortDate(pricing.purchasedAt)} at ${pricing.vendor}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Page max="form" className="grid gap-8">
        <PageHeader
          eyebrow={
            <>
              <Link to="/products" className={eyebrowLinkClass}>
                Products
              </Link>{" "}
              / {isEditing ? "Edit product" : "New product"}
            </>
          }
          title={isEditing ? (savedName ?? "…") : "New product"}
          badge={
            isEditing && existing.data ? (
              <Badge tone={existing.data.active ? "success" : "neutral"}>
                {existing.data.active ? "Active" : "Inactive"}
              </Badge>
            ) : undefined
          }
          meta={meta || undefined}
          aside={
            <Link to="/products" className={pageLinkClass}>
              ← Back to products
            </Link>
          }
        />

        <ErrorNote message={formError} />

        {/* Creating only: on an existing product a pick would overwrite its name, UPC and photo. */}
        {isEditing ? null : (
          <CatalogSearch
            onPick={(pick) =>
              editDraft({ name: pick.name, upc: pick.upc, imageUrl: pick.imageUrl ?? draft.imageUrl })
            }
          />
        )}

        <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
          <FormSection
            title="Basics"
            description="What the product is called and how you find it when restocking."
          >
            <div className="grid gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
              <ProductPhoto
                imageUrl={draft.imageUrl}
                name={draft.name}
                emptyHint={isEditing ? "Look up adds one" : "Fill from catalog or Look up adds one"}
                onRemove={() => editDraft({ imageUrl: null })}
              />
              <div className="grid gap-5">
                <Field
                  label="Name"
                  hint='Include the size, e.g. "7up - 12 oz", so similar products stay distinct.'
                  error={errors.name}
                >
                  <TextInput value={draft.name} onChange={(event) => editDraft({ name: event.target.value })} />
                </Field>
                <Field
                  label="Category"
                  hint="Pick one you already use, or type a new one."
                  error={errors.category}
                >
                  <TextInput
                    list={categoryListId}
                    autoComplete="off"
                    placeholder="e.g. Chips"
                    value={draft.category}
                    onChange={(event) => editDraft({ category: event.target.value })}
                  />
                </Field>
                <datalist id={categoryListId}>
                  {categorySuggestionsFor(products.data ?? []).map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            </div>
            <SectionDivider />
            <Field
              label="UPC"
              isOptional
              // A lookup miss is information, not a validation error.
              hint={upcNote ?? "Scan it or type it in, then Look up to pull the name and photo."}
            >
              <div className="flex gap-2">
                <TextInput
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono tabular-nums"
                  placeholder="e.g. 078000113464"
                  value={draft.upc}
                  onChange={(event) => {
                    setUpcNote(null);
                    editDraft({ upc: event.target.value });
                  }}
                />
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={lookUpUpc}
                  disabled={isLookingUp || draft.upc.trim() === ""}
                >
                  {isLookingUp ? "Looking up…" : "Look up"}
                </Button>
              </div>
            </Field>
          </FormSection>

          <FormSection
            title="Pricing"
            description="The default price for slots with this product. You can still change it per slot."
          >
            <PricingFields
              price={draft.price}
              error={errors.price}
              pricing={pricing}
              onPriceChange={(price) => editDraft({ price })}
            />
          </FormSection>

          <FormSection title="Rules" description="Tax, and how this product behaves during visits.">
            <Field label="Tax class" isOptional hint="Used for California vending tax rules.">
              <TextInput
                value={draft.taxClass}
                onChange={(event) => editDraft({ taxClass: event.target.value })}
              />
            </Field>
            <SectionDivider />
            <Switch
              title="Track expiration dates"
              description="On for anything with a printed best-by date. Turn it off for gum, bulk candy and non-food, and visits will stop asking for a date."
              isChecked={draft.tracksExpiration}
              onChange={(tracksExpiration) => editDraft({ tracksExpiration })}
            />
            <SectionDivider />
            <Switch
              title="Active"
              description="Inactive products stay in history and reports but drop out of pickers."
              isChecked={draft.isActive}
              onChange={(isActive) => editDraft({ isActive })}
            />
          </FormSection>
        </form>

        {productId && existing.data ? (
          <DeleteProductSection productId={productId} productName={existing.data.name} />
        ) : null}
      </Page>
      <SaveBar
        isDirty={isDirty}
        // "All changes saved" would be untrue for a product that doesn't exist yet.
        summary={!isEditing && !isDirty ? "Nothing entered yet" : undefined}
        saveLabel={isEditing ? "Save changes" : "Create product"}
        dismissal={isEditing ? "discard" : "cancel"}
        onDismiss={() => {
          if (isEditing) {
            discard();
            setErrors({});
            return;
          }
          navigate({ to: "/products" });
        }}
        formId={FORM_ID}
        isSaving={create.isPending || update.isPending}
      />
    </>
  );
}

/**
 * Deleting asks twice: the button sits on the same page as Save. The server
 * refuses a product still in a pack or a machine, and says why.
 */
function DeleteProductSection({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const navigate = useNavigate();
  const [isConfirming, setIsConfirming] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hasToggledRef = useRef(false);
  // The button pressed is swapped out, so focus moves to the last new one: "Keep it"
  // when asking, so a second Enter can't delete.
  useEffect(() => {
    if (!hasToggledRef.current) {
      return;
    }
    const buttons = controlsRef.current?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, [isConfirming]);
  const toggleConfirming = (next: boolean) => {
    hasToggledRef.current = true;
    setIsConfirming(next);
  };
  const remove = useMutation(
    trpc.products.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.products.list.queryKey() });
        navigate({ to: "/products" });
      },
    }),
  );

  return (
    <FormSection title="Delete" description="Remove this product from your catalog.">
      {isConfirming ? (
        <div className="grid gap-4">
          <p className="text-body text-ink">
            Delete <strong>{productName}</strong>? This can't be undone.
          </p>
          <div ref={controlsRef} className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => remove.mutate({ id: productId })}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete product"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                toggleConfirming(false);
                remove.reset();
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div ref={controlsRef}>
          <Button variant="danger" onClick={() => toggleConfirming(true)}>
            Delete product…
          </Button>
        </div>
      )}
      <ErrorNote message={remove.error?.message ?? null} />
    </FormSection>
  );
}

/** The product photo from the catalog or a UPC lookup; there's no upload yet. */
function ProductPhoto({
  imageUrl,
  name,
  emptyHint,
  onRemove,
}: {
  imageUrl: string | null;
  name: string;
  /** How a photo gets added from here. */
  emptyHint: string;
  onRemove: () => void;
}) {
  if (!imageUrl) {
    return (
      <div className="flex size-[120px] flex-col items-center justify-center gap-1.5 rounded-panel border border-dashed border-line-strong bg-app p-2 text-center text-body-sm text-muted-strong">
        No photo yet
        <span className="text-xs">{emptyHint}</span>
      </div>
    );
  }
  return (
    <div className="grid justify-items-center gap-1">
      <img
        src={imageUrl}
        alt={name || "Product"}
        className="size-[120px] rounded-panel border border-line bg-card object-contain"
      />
      <Button variant="text" size="sm" onClick={onRemove}>
        Remove photo
      </Button>
    </div>
  );
}

/**
 * The price field and, once the product has been bought, what it cost and
 * what you keep, recomputed on every keystroke.
 */
function PricingFields({
  price,
  error,
  pricing,
  onPriceChange,
}: {
  price: string;
  error: string | undefined;
  pricing: ApiProductPricing | undefined;
  onPriceChange: (price: string) => void;
}) {
  const priceCents = parseDollarsToCents(price) ?? 0;
  const display = pricing ? buildPricingDisplay(pricing, priceCents) : null;
  const suggested = display?.suggestedPriceCents ?? null;

  const priceField = (
    <Field
      label="Price"
      error={error}
      hint={
        suggested === null ? undefined : (
          <>
            Suggested{" "}
            <span className="font-mono font-medium text-ink tabular-nums">{formatCents(suggested)}</span>.{" "}
            <Button
              variant="text"
              size="sm"
              onClick={() => onPriceChange(priceInputFor(suggested))}
            >
              Use it
            </Button>
          </>
        )
      }
    >
      <MoneyInput value={price} onChange={(event) => onPriceChange(event.target.value)} />
    </Field>
  );

  if (!pricing || !display) {
    return <div className="max-w-[200px]">{priceField}</div>;
  }

  return (
    <div className="grid items-start gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
      {priceField}
      <FactsPanel>
        <Fact
          label="Last paid"
          detail={`${pricing.vendor} · ${formatShortDate(pricing.purchasedAt)}`}
          value={`${formatCents(display.unitCostCents)} / unit`}
        />
        <Fact
          label="You keep per sale"
          value={formatSignedCents(display.grossPerUnitCents)}
          tone={display.grossPerUnitCents < 0 ? "danger" : "success"}
        />
        {display.marginFraction === null ? null : (
          <Fact
            label={display.isUnderTarget ? "Margin, under target" : "Margin"}
            value={formatPercent(display.marginFraction)}
            tone={display.isUnderTarget ? "warning" : "success"}
          />
        )}
      </FactsPanel>
    </div>
  );
}

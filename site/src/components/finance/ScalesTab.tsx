"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Scale } from "@/components/icons/glyphs";
import { Button, Card, CardHeader, EmptyState, Td, Th } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, SelectField, TextField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { listFederations } from "@/lib/api/admin";
import { CREW_ROLES, listScales, saveScale, TIERS, type CrewRole, type FeeScale, type Tier } from "@/lib/api/finance";
import { isAdmin } from "@/lib/admin/actor";
import { useAction, useActor, useResource } from "@/lib/admin/hooks";
import { scaleGaps, scaleGrid, tierKey } from "@/lib/finance/rules";
import { competitionById, competitions, countryByCode, roleKey } from "@/lib/store";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";
import { useMoney } from "./PaymentDialogs";

const DEFAULT = "default";
const NATIONAL_TIERS: Tier[] = ["d1", "d2", "cup"];

interface Draft {
  tier: Tier;
  competitionId: string | null;
  role: CrewRole;
  scale?: FeeScale;
}

export function ScalesTab() {
  const t = useT();
  const actor = useActor();
  const admin = isAdmin(actor);
  const { version } = useDataset();
  const feds = useResource("federations", (signal) => listFederations(signal), admin);
  const [whose, setWhose] = useState<string>(DEFAULT);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);

  const fedId = admin ? (whose === DEFAULT ? null : whose) : (actor?.federationId ?? null);
  const fedCountry = admin ? (feds.data?.find((f) => f.id === fedId)?.country ?? null) : (actor?.country ?? null);
  const currency = fedCountry ? (countryByCode.get(fedCountry)?.currency ?? null) : null;

  const own = useResource(`scales|${admin ? whose : "mine"}|${tick}`, (signal) => listScales(admin ? whose : undefined, signal), actor !== null);
  const defaults = useResource(`scales|default|${tick}`, (signal) => listScales(DEFAULT, signal), admin && whose !== DEFAULT);

  const editable = useMemo(() => (own.data ?? []).filter((s) => !s.readonly), [own.data]);
  const platform = useMemo(() => (admin ? (defaults.data ?? []) : (own.data ?? []).filter((s) => s.readonly)), [admin, defaults.data, own.data]);
  const tiers = fedId ? NATIONAL_TIERS : [...TIERS];

  const comps = useMemo(() => {
    void version;
    return fedCountry ? competitions.filter((c) => c.countryCode === fedCountry) : [];
  }, [version, fedCountry]);
  const gaps = useMemo(() => (fedId ? scaleGaps([...editable, ...platform], comps, fedId, currency) : []), [fedId, editable, platform, comps, currency]);

  const saved = () => {
    setDraft(null);
    setTick((n) => n + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {admin ? (
          <SelectField
            className="w-full sm:w-80"
            label={t("finance.scales.whose")}
            value={whose}
            onChange={setWhose}
            options={[
              { value: DEFAULT, label: t("finance.scales.defaults") },
              ...(feds.data ?? []).map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` })),
            ]}
          />
        ) : (
          <p className="text-sm text-chalk-dim">{currency ? `${actor?.federationCode ?? ""} · ${currency}` : null}</p>
        )}
        <Button variant="primary" onClick={() => setDraft({ tier: tiers[0], competitionId: null, role: "R" })} disabled={!own.data}>
          <Plus size={16} />
          {t("finance.scales.add")}
        </Button>
      </div>
      {admin && whose === DEFAULT && <p className="text-sm text-chalk-dim">{t("finance.scales.defaultsHint")}</p>}

      {fedId && own.data && (
        <Card tint={gaps.length ? "amber" : "pitch"}>
          <CardHeader title={t("finance.scales.coverage.title")} subtitle={t("finance.scales.coverage.hint")} icon={gaps.length ? AlertTriangle : CheckCircle2} tint={gaps.length ? "amber" : "pitch"} />
          {gaps.length === 0 ? (
            <p className="text-sm text-chalk-dim">{t("finance.scales.coverage.ok")}</p>
          ) : (
            <ul className="space-y-1 text-sm text-chalk-dim">
              {groupGaps(gaps).map((g) => (
                <li key={`${g.competitionId}|${g.reason}`} className={g.reason === "currency" ? "text-card-red" : undefined}>
                  {t(`finance.scales.coverage.${g.reason}`, {
                    competition: competitionById.get(g.competitionId)?.name ?? g.competitionId,
                    roles: g.roles.map((r) => t(roleKey[r])).join(", "),
                  })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {own.loading ? (
        <ListSkeleton rows={4} />
      ) : own.error ? (
        <ErrorState onRetry={own.reload} />
      ) : (
        <>
          <ScaleGrid scales={editable} tiers={tiers} onPick={(d) => setDraft(d)} />
          <SpecificList scales={editable} onPick={(d) => setDraft(d)} />
          {fedId && platform.length > 0 && (
            <section aria-labelledby="platform-scales" className="space-y-2">
              <h2 id="platform-scales" className="text-sm font-semibold text-chalk">
                {t("finance.scales.defaults")}
              </h2>
              <p className="text-xs text-chalk-faint">{admin ? t("finance.scales.defaultsHint") : t("finance.scales.readonlyHint")}</p>
              <ScaleGrid scales={platform} tiers={tiers} highlight={currency} />
            </section>
          )}
        </>
      )}

      {draft && (
        <ScaleDialog
          draft={draft}
          tiers={tiers}
          federationId={fedId}
          sendFederationId={admin}
          currency={currency}
          competitions={fedCountry ? comps : competitions}
          onClose={() => setDraft(null)}
          onDone={saved}
        />
      )}
    </div>
  );
}

function groupGaps(gaps: ReturnType<typeof scaleGaps>) {
  const by = new Map<string, { competitionId: string; reason: "missing" | "currency"; roles: CrewRole[] }>();
  for (const g of gaps) {
    const key = `${g.competitionId}|${g.reason}`;
    const entry = by.get(key) ?? { competitionId: g.competitionId, reason: g.reason, roles: [] };
    entry.roles.push(g.role);
    by.set(key, entry);
  }
  return [...by.values()];
}

/** Division × role. A cell opens its scale; an empty one starts a new scale there. Read only without `onPick`. */
function ScaleGrid({ scales, tiers, onPick, highlight }: { scales: FeeScale[]; tiers: Tier[]; onPick?: (d: Draft) => void; highlight?: string | null }) {
  const t = useT();
  const money = useMoney();
  const { tierRows } = useMemo(() => scaleGrid(scales), [scales]);
  if (!onPick && tierRows.size === 0) return null;
  if (onPick && scales.length === 0) {
    return (
      <Card>
        <EmptyState title={t("finance.scales.empty")} hint={t("finance.scales.emptyHint")} />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <div className="scroll-x">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t("finance.scales.grid")}</caption>
          <thead>
            <tr className="border-b border-line">
              <Th>{t("finance.scales.form.tier")}</Th>
              {CREW_ROLES.map((r) => (
                <Th key={r} className="text-end">
                  {t(roleKey[r])}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tiers.map((tier) => (
              <tr key={tier}>
                <Td className="font-medium text-chalk">{t(tierKey(tier))}</Td>
                {CREW_ROLES.map((role) => {
                  const s = tierRows.get(tier)?.get(role);
                  const expenses = s ? s.transport + s.lodging + s.meals : 0;
                  const body = s ? (
                    <span className={cn("block", highlight && s.currency !== highlight && "text-card-red line-through")}>
                      <span className="tnum block font-semibold">{money(s.amount, s.currency)}</span>
                      {expenses > 0 && <span className="tnum block text-xs text-chalk-faint">{t("finance.scales.expenses", { n: money(expenses, s.currency) })}</span>}
                    </span>
                  ) : (
                    <span className="text-chalk-faint">—</span>
                  );
                  return (
                    <Td key={role} className="text-end">
                      {onPick ? (
                        <button
                          type="button"
                          onClick={() => onPick({ tier, competitionId: null, role, scale: s })}
                          aria-label={t(s ? "finance.scales.editCell" : "finance.scales.addCell", { role: t(roleKey[role]), tier: t(tierKey(tier)) })}
                          className="-m-1 rounded-md p-1 text-end hover:bg-red-500/10 focus-visible:outline-2"
                        >
                          {body}
                        </button>
                      ) : (
                        body
                      )}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SpecificList({ scales, onPick }: { scales: FeeScale[]; onPick: (d: Draft) => void }) {
  const t = useT();
  const money = useMoney();
  const specific = scales.filter((s) => s.competitionId);
  return (
    <section aria-labelledby="specific-scales" className="space-y-2">
      <h2 id="specific-scales" className="flex items-center gap-2 text-sm font-semibold text-chalk">
        <Scale size={15} />
        {t("finance.scales.specific")}
      </h2>
      <p className="text-xs text-chalk-faint">{t("finance.scales.specificHint")}</p>
      {specific.length === 0 ? (
        <p className="text-sm text-chalk-faint">{t("finance.scales.noSpecific")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-[12px] border border-line bg-ink-2">
          {specific.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick({ tier: s.tier, competitionId: s.competitionId, role: s.role, scale: s })} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-red-500/[0.04]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-chalk">{competitionById.get(s.competitionId!)?.name ?? s.competitionId}</span>
                  <span className="block text-xs text-chalk-faint">
                    {t(roleKey[s.role])} · {t(tierKey(s.tier))}
                  </span>
                </span>
                <span className="tnum text-sm font-semibold text-chalk">{money(s.amount, s.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScaleDialog({
  draft,
  tiers,
  federationId,
  sendFederationId,
  currency,
  competitions: comps,
  onClose,
  onDone,
}: {
  draft: Draft;
  tiers: Tier[];
  federationId: string | null;
  /** Only an administrator names whose scale it is; a federation seat always writes its own. */
  sendFederationId: boolean;
  /** The federation's currency; null for the platform defaults, which pick their own. */
  currency: string | null;
  competitions: Array<{ id: string; name: string; tier: Tier }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const s = draft.scale;
  const [tier, setTier] = useState<Tier>(draft.tier);
  const [competitionId, setCompetitionId] = useState(draft.competitionId ?? "");
  const [role, setRole] = useState<CrewRole>(draft.role);
  const [amounts, setAmounts] = useState({
    amount: String(s?.amount ?? ""),
    transport: String(s?.transport ?? 0),
    lodging: String(s?.lodging ?? 0),
    meals: String(s?.meals ?? 0),
  });
  const [cur, setCur] = useState(s?.currency ?? currency ?? "XOF");
  const [tried, setTried] = useState(false);
  const bad = (Object.keys(amounts) as Array<keyof typeof amounts>).filter((k) => !/^\d{1,9}$/.test(amounts[k].trim()));
  const curBad = !currency && !/^[A-Za-z]{3}$/.test(cur.trim());
  const inTier = comps.filter((c) => c.tier === tier);

  async function submit() {
    setTried(true);
    if (bad.length || curBad) return;
    const res = await run(() =>
      saveScale({
        ...(sendFederationId ? { federationId } : {}),
        tier,
        competitionId: competitionId || null,
        role,
        amount: Number(amounts.amount),
        transport: Number(amounts.transport),
        lodging: Number(amounts.lodging),
        meals: Number(amounts.meals),
        ...(currency ? {} : { currency: cur.trim().toUpperCase() }),
      }),
    );
    if (res.ok) {
      toast.push("success", t("finance.scales.toast.saved"));
      onDone();
    }
  }

  const unit = currency ?? cur.toUpperCase();
  return (
    <Dialog
      size="lg"
      title={t(s ? "finance.scales.form.editTitle" : "finance.scales.form.newTitle")}
      description={t("finance.scales.form.hint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t("finance.scales.form.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label={t("finance.scales.form.tier")}
            value={tier}
            disabled={Boolean(s)}
            onChange={(v) => {
              setTier(v as Tier);
              setCompetitionId("");
            }}
            options={tiers.map((x) => ({ value: x, label: t(tierKey(x)) }))}
          />
          <SelectField
            label={t("finance.scales.form.competition")}
            value={competitionId}
            disabled={Boolean(s)}
            onChange={setCompetitionId}
            placeholder={t("finance.scales.form.anyCompetition")}
            options={inTier.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField label={t("finance.scales.form.role")} value={role} disabled={Boolean(s)} onChange={(v) => setRole(v as CrewRole)} options={CREW_ROLES.map((r) => ({ value: r, label: t(roleKey[r]) }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["amount", "transport", "lodging", "meals"] as const).map((k) => (
            <TextField
              key={k}
              label={`${t(`finance.scales.form.${k}`)} (${unit})`}
              value={amounts[k]}
              inputMode="numeric"
              required={k === "amount"}
              onChange={(v) => setAmounts((a) => ({ ...a, [k]: v }))}
              error={tried && bad.includes(k) ? t("finance.errors.amount") : undefined}
            />
          ))}
        </div>
        {!currency && (
          <TextField
            label={t("finance.scales.form.currency")}
            value={cur}
            onChange={(v) => setCur(v.toUpperCase())}
            maxLength={3}
            className="w-40"
            hint={t("finance.scales.form.currencyHint")}
            error={tried && curBad ? t("admin.errors.currency") : undefined}
          />
        )}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/**
 * Unified data-source resolver — prevents split-brain between Supabase tables.
 * When the DB is not fully seeded (units without matching equipment + engagements),
 * ALL operational modules consume the same local SSOT with consistent unit IDs.
 */

import { supabase } from "@/integrations/supabase/client";

let _useOperational: boolean | null = null;
let _detectPromise: Promise<boolean> | null = null;

async function detectOperationalStore(): Promise<boolean> {
  try {
    const { data: units, error: unitsErr } = await supabase
      .from("units")
      .select("id")
      .limit(1);

    if (unitsErr || !units?.length) return true;

    const [eqRes, engRes] = await Promise.all([
      supabase.from("equipment").select("id", { count: "exact", head: true }),
      supabase.from("engagements").select("id", { count: "exact", head: true }),
    ]);

    const eqCount = eqRes.count ?? 0;
    const engCount = engRes.count ?? 0;

    return eqCount === 0 || engCount === 0;
  } catch {
    return true;
  }
}

/** True when the local operational SSOT must be used instead of partial Supabase rows. */
export async function shouldUseOperationalStore(): Promise<boolean> {
  if (_useOperational !== null) return _useOperational;
  if (_detectPromise) return _detectPromise;

  _detectPromise = (async () => {
    const result = await detectOperationalStore();
    _useOperational = result;
    _detectPromise = null;
    return result;
  })();

  return _detectPromise;
}

export function resetOperationalDataSourceCache(): void {
  _useOperational = null;
  _detectPromise = null;
}
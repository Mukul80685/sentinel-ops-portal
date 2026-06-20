
-- Extend satellites
ALTER TABLE public.satellites
  ADD COLUMN IF NOT EXISTS launch_date date,
  ADD COLUMN IF NOT EXISTS transponder_count integer,
  ADD COLUMN IF NOT EXISTS frequency_bands text[];

-- Beams
CREATE TABLE IF NOT EXISTS public.beams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES public.satellites(id) ON DELETE CASCADE,
  name text NOT NULL,
  band text NOT NULL,
  beam_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beams TO authenticated;
GRANT ALL ON public.beams TO service_role;
ALTER TABLE public.beams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "beams read" ON public.beams FOR SELECT TO authenticated USING (true);
CREATE POLICY "beams write" ON public.beams FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER beams_set_updated_at BEFORE UPDATE ON public.beams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS beams_satellite_idx ON public.beams(satellite_id);

-- Unit ↔ Beam visibility
CREATE TABLE IF NOT EXISTS public.unit_beam_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  beam_id uuid NOT NULL REFERENCES public.beams(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, beam_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_beam_visibility TO authenticated;
GRANT ALL ON public.unit_beam_visibility TO service_role;
ALTER TABLE public.unit_beam_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ubv read" ON public.unit_beam_visibility FOR SELECT TO authenticated USING (true);
CREATE POLICY "ubv write" ON public.unit_beam_visibility FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER ubv_set_updated_at BEFORE UPDATE ON public.unit_beam_visibility FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fault details for equipment
CREATE TABLE IF NOT EXISTS public.fault_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  date_raised date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  description text,
  estimated_restoration date,
  maintenance_remarks text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fault_details TO authenticated;
GRANT ALL ON public.fault_details TO service_role;
ALTER TABLE public.fault_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faults read" ON public.fault_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "faults write" ON public.fault_details FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER faults_set_updated_at BEFORE UPDATE ON public.fault_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS faults_equipment_idx ON public.fault_details(equipment_id);

-- Intel: productivity flag (null = auto-derived in UI)
ALTER TABLE public.intel_records
  ADD COLUMN IF NOT EXISTS is_productive boolean,
  ADD COLUMN IF NOT EXISTS activity_level text;

-- Important frequencies repository
CREATE TABLE IF NOT EXISTS public.important_frequencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES public.satellites(id) ON DELETE CASCADE,
  intel_record_id uuid REFERENCES public.intel_records(id) ON DELETE SET NULL,
  frequency text NOT NULL,
  band text,
  label text,
  notes text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.important_frequencies TO authenticated;
GRANT ALL ON public.important_frequencies TO service_role;
ALTER TABLE public.important_frequencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impfreq read" ON public.important_frequencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "impfreq write" ON public.important_frequencies FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER impfreq_set_updated_at BEFORE UPDATE ON public.important_frequencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS impfreq_satellite_idx ON public.important_frequencies(satellite_id);
